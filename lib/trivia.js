/* global WeakSet */
import { spam as m } from '@bablr/boot';
import { Coroutine } from '@bablr/coroutine';
import { eat, eatMatch, mapOwnProductions, mapProductions, o } from './grammar.js';
import {
  Matcher,
  Regex,
  Node,
  OpenNodeTag,
  CloseNodeTag,
  ReferenceTag,
  PropertyWrapper,
} from './symbols.js';
import { buildIdentifier, buildString } from './builders.js';
import { buildCall, buildEmbeddedInstruction } from '@bablr/agast-vm-helpers/builders';
import { getEmbeddedInstruction } from '@bablr/agast-vm-helpers/deembed';
import { reifyExpression } from '@bablr/agast-vm-helpers';
import { get, getCooked } from '@bablr/agast-helpers/tree';
import { buildPathSegment } from '@bablr/agast-helpers/path';

const lookbehind = (context, s) => {
  let token = s.resultPath;
  while (token && [OpenNodeTag, CloseNodeTag, ReferenceTag].includes(token.type)) {
    const prevToken = context.getPreviousTagPath(token);
    if (!prevToken) break;
    token = prevToken;
  }
  return token;
};

const matchedResults = new WeakSet();

export const basicTriviaEnhancer = ({ triviaIsAllowed, triviaMatcher }, grammar) => {
  let Wrapper_ = 'Wrapper';
  let Literal_ = 'Literal';

  while (grammar.prototype[Wrapper_]) Wrapper_ += '_';
  while (grammar.prototype[Literal_]) Literal_ += '_';

  const resultGrammar = mapOwnProductions((production) => {
    return function* (props) {
      const co = new Coroutine(production(props));
      const { s, ctx, flags, isCover, isCovered } = props;

      co.advance();

      try {
        while (!co.done) {
          const instr = co.value;
          const { verb, arguments: args = [] } = instr;
          let returnValue = undefined;

          switch (verb) {
            case 'eat':
            case 'eatMatch':
            case 'match':
            case 'guard': {
              const { 0: matcher } = args;

              if (
                matcher &&
                !isCovered &&
                matcher.type === Matcher &&
                getCooked(get(['refMatcher', 'type', 'value'], matcher.value)) !== '#'
              ) {
                const previous = lookbehind(ctx, s);
                if (triviaIsAllowed(s) && (!previous || !matchedResults.has(previous))) {
                  matchedResults.add(previous);
                  yield eatMatch(triviaMatcher);
                  matchedResults.add(s.resultPath);
                }
              }

              returnValue = returnValue || (yield instr);
              break;
            }

            default:
              returnValue = yield instr;
              break;
          }

          co.advance(returnValue);
        }

        if (co.value) {
          let realMatcher = reifyExpression(get('nodeMatcher', co.value.arguments[0].value));
          let { flags: matcherFlags } = realMatcher;

          let isNode = matcherFlags && !matcherFlags.fragment;

          if (
            !flags.token &&
            isNode &&
            !isCover &&
            (!s.depths.path || (co.value && ['shift', 'shiftMatch'].includes(co.value.verb)))
          ) {
            if (triviaIsAllowed(s)) {
              yield eatMatch(triviaMatcher);
            }
          }

          return co.value;
        } else {
          if (!s.depths.path && !flags.token && !isCovered) {
            if (triviaIsAllowed(s)) {
              yield eatMatch(triviaMatcher);
            }
          }
        }
      } catch (e) {
        co.throw(e);
        throw e;
      }
    };
  }, grammar);

  return class extends resultGrammar {
    *[Wrapper_]({ value: wrapped }) {
      for (const instr of wrapped) {
        yield getEmbeddedInstruction(instr);
      }
    }

    *[Literal_]({ value: matcher }) {
      yield eat(matcher);
    }
  };
};

export const triviaEnhancer = (
  { triviaIsAllowed, triviaIsRequired = () => false, triviaMatcher },
  grammar,
) => {
  if (!triviaMatcher) throw new Error();

  let Wrapper_ = 'Wrapper';
  let Literal_ = 'Literal';

  while (grammar.prototype[Wrapper_]) Wrapper_ += '_';
  while (grammar.prototype[Literal_]) Literal_ += '_';

  const resultGrammar = mapProductions((production) => {
    return function* (args) {
      const co = new Coroutine(production(args));
      const { ctx, s, isCovered, isCover, isCoverBoundary, flags, mergedReference } = args;

      co.advance();

      try {
        while (!co.done) {
          const instr = co.value;
          const { verb, arguments: args = [] } = instr;
          let returnValue = undefined;

          switch (verb) {
            case 'eat':
            case 'eatMatch':
            case 'match':
            case 'guard': {
              const { 0: matcher, 1: props, 2: options } = args;

              if (
                matcher.type === Matcher &&
                ['ArrayNodeMatcher', 'NullNodeMatcher'].includes(
                  get('nodeMatcher', matcher.value).type.description,
                )
              ) {
                returnValue = yield instr;
                break;
              }

              if (
                matcher.type === Regex ||
                typeof matcher === 'string' ||
                (matcher.type === Node && matcher.value.flags.token)
              ) {
                if (triviaIsAllowed(s) && !flags.token) {
                  let isString = typeof matcher === 'string';
                  let wrappedMatcher = m`#: <*Literal ${
                    isString ? buildString(matcher) : matcher.value
                  } />`;

                  let tmi = buildEmbeddedInstruction(eatMatch(triviaMatcher));

                  let result = yield buildCall(verb, m`<__${buildIdentifier(Wrapper_)} />`, [
                    tmi,
                    buildEmbeddedInstruction(eat(wrappedMatcher, props, options)),
                  ]);

                  let prop = null;

                  if (result) {
                    for (let child of result.tags) {
                      if (child.type === PropertyWrapper) prop = child.value.property;
                    }
                  }

                  returnValue = prop?.node;
                } else {
                  returnValue = yield instr;
                }
                break;
              }

              let { type: refType } = reifyExpression(get('refMatcher', matcher.value)) || {};
              let realMatcher = reifyExpression(get('nodeMatcher', matcher.value));
              let { flags: matcherFlags } = realMatcher;

              let isNode = matcherFlags && !matcherFlags.fragment;
              let isCoverBoundary = matcherFlags && (matcherFlags.cover || (isNode && !isCovered));
              if (
                matcher &&
                (matcher.type !== Matcher || refType !== '#') &&
                !s.holding &&
                !flags.token &&
                isCoverBoundary
              ) {
                if (triviaIsAllowed(s)) {
                  let { nodeMatcher } = reifyExpression(matcher.value);

                  let tmi = buildEmbeddedInstruction(
                    triviaIsRequired(s, nodeMatcher) ? eat(triviaMatcher) : eatMatch(triviaMatcher),
                  );

                  let result = yield buildCall(
                    verb,
                    m`<__${buildIdentifier(Wrapper_)} />`,
                    [tmi, buildEmbeddedInstruction(eat(matcher, props, options))],
                    o({ bind: options?.value.bind ?? false }),
                  );
                  let trivialResult = result;

                  if (result && !result.isNull) {
                    if (isNode || isCoverBoundary) {
                      let refMatcher = get('refMatcher', matcher.value);

                      let name, isArray;

                      if (!refMatcher) {
                        ({ name, isArray } = mergedReference);
                      } else {
                        let name_ = get('name', refMatcher);
                        let openIndexToken = get('openIndexToken', refMatcher);
                        name = name_ && ctx.sourceTextFor(name_);
                        isArray = !!openIndexToken;
                      }

                      if (name) {
                        let pathSpec = name;

                        if (isArray) {
                          pathSpec = buildPathSegment(name, -1);
                        }

                        result = result.get([pathSpec]);
                      }
                    }

                    result = result && result.merge(trivialResult);
                  }
                  returnValue = result;
                } else {
                  returnValue = yield instr;
                }
              } else {
                returnValue = yield instr;
              }
              break;
            }

            default:
              returnValue = yield instr;
              break;
          }

          co.advance(returnValue);
        }

        if (!flags.token && !(isCovered || isCover)) {
          if (triviaIsAllowed(s)) {
            yield eatMatch(triviaMatcher);
          }
        } else if (co.value) {
          let matcher = co.value.arguments[0];
          let realMatcher = reifyExpression(get('nodeMatcher', matcher.value));
          let { flags: matcherFlags } = realMatcher;

          let isNode = matcherFlags && !matcherFlags.fragment;

          if (
            !flags.token &&
            isNode &&
            !isCover &&
            co.value &&
            ['shift', 'shiftMatch'].includes(co.value.verb)
          ) {
            if (triviaIsAllowed(s)) {
              let tmi = buildEmbeddedInstruction(
                triviaIsRequired() ? eat(triviaMatcher) : eatMatch(triviaMatcher),
              );
              let result = yield buildCall(co.value.verb, m`<__${buildIdentifier(Wrapper_)} />`, [
                tmi,
                buildEmbeddedInstruction(eat(co.value.arguments[0], co.value.arguments[1])),
              ]);

              let trivialResult = result;

              if (result && !result.isNull) {
                if (isNode || isCoverBoundary) {
                  let refMatcher = get('refMatcher', matcher.value);

                  let name, isArray;

                  if (!refMatcher) {
                    ({ name, isArray } = mergedReference);
                  } else {
                    let name = get('name', refMatcher);
                    let openIndexToken = get('openIndexToken', refMatcher);
                    name = name && ctx.sourceTextFor(name);
                    isArray = !!openIndexToken;
                  }

                  if (name) {
                    let pathSpec = name;

                    if (isArray) {
                      pathSpec = buildPathSegment(name, -1);
                    }

                    result = result.get([pathSpec]);
                  }
                }

                result = result && result.merge(trivialResult);
              }
              return result;
            }
          }
        }

        return co.value;
      } catch (e) {
        co.throw(e);
        throw e;
      }
    };
  }, grammar);

  return class extends resultGrammar {
    constructor() {
      super();

      if (!this.emptyables) {
        this.emptyables = new Set();
      }

      if (!this.covers) {
        this.covers = new Map();
      }

      if (!this.covers.get(Symbol.for('@bablr/node'))) {
        this.covers.set(Symbol.for('@bablr/node'), new Set());
      }

      this.covers.get(Symbol.for('@bablr/node')).add(Literal_);

      this.emptyables.add(Wrapper_);
    }

    *[Wrapper_]({ props: { value: wrapped } }) {
      for (const instr of wrapped) {
        yield getEmbeddedInstruction(instr);
      }
    }

    *[Literal_]({ literalValue }) {
      yield eat(literalValue);
    }
  };
};
