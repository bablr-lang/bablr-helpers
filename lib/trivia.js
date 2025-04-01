import { spam as m } from '@bablr/boot';
import { Coroutine } from '@bablr/coroutine';
import { eat, eatMatch, mapProductions, o, resolveLanguage } from './grammar.js';
import { EmbeddedMatcher, EmbeddedRegex, EmbeddedNode } from './symbols.js';
import { buildIdentifier, buildString } from './builders.js';
import { buildCall, buildEmbeddedInstruction } from '@bablr/agast-vm-helpers/builders';
import { getEmbeddedInstruction } from '@bablr/agast-vm-helpers/deembed';
import { reifyExpression } from '@bablr/agast-vm-helpers';

export const triviaEnhancer = (
  { triviaIsAllowed, triviaIsRequired = () => false, triviaMatcher },
  grammar,
) => {
  let Wrapper_ = 'Wrapper';
  let Literal_ = 'Literal';

  while (grammar.prototype[Wrapper_]) Wrapper_ += '_';
  while (grammar.prototype[Literal_]) Literal_ += '_';

  const resultGrammar = mapProductions((production) => {
    return function* (props) {
      const co = new Coroutine(production(props));
      const { ctx, s, isCovered, isCover, flags } = props;

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
                matcher.type === EmbeddedMatcher &&
                ['ArrayNodeMatcher', 'NullNodeMatcher'].includes(
                  matcher.value.properties.nodeMatcher.node.type.description,
                )
              ) {
                returnValue = yield instr;
                break;
              }

              if (
                matcher.type === EmbeddedRegex ||
                typeof matcher === 'string' ||
                (matcher.type === EmbeddedNode && matcher.value.flags.token)
              ) {
                if (triviaIsAllowed(s) && !flags.token) {
                  let isString = typeof matcher === 'string';
                  let wrappedMatcher = m`value: <*Literal ${
                    isString ? buildString(matcher) : matcher.value
                  } />`;

                  let tmi = buildEmbeddedInstruction(
                    triviaIsRequired() ? eat(triviaMatcher) : eatMatch(triviaMatcher),
                  );

                  let result = yield buildCall(verb, m`<${buildIdentifier(Wrapper_)} />`, [
                    tmi,
                    buildEmbeddedInstruction(eat(wrappedMatcher, props, options)),
                  ]);

                  returnValue = result?.get('value');
                } else {
                  returnValue = yield instr;
                }
                break;
              }

              let { name } = reifyExpression(matcher.value.properties.refMatcher?.node) || {};
              let realMatcher = reifyExpression(matcher.value.properties.nodeMatcher?.node);
              let { type } = realMatcher;
              let language = resolveLanguage(
                ctx,
                ctx.languages.get(s.language),
                realMatcher.language || s.language,
              );

              let grammarInst = ctx.grammars.get(language);

              let isCover = grammarInst.covers.has(type);
              let isNode = grammarInst.covers.get(Symbol.for('@bablr/node')).has(type);
              let isCoverBoundary = isCover || (isNode && !isCovered);
              if (
                matcher &&
                (matcher.type !== EmbeddedMatcher || name !== '#') &&
                !s.holding &&
                !flags.token &&
                isCoverBoundary
              ) {
                if (triviaIsAllowed(s)) {
                  let tmi = buildEmbeddedInstruction(
                    triviaIsRequired() ? eat(triviaMatcher) : eatMatch(triviaMatcher),
                  );

                  let result = yield buildCall(
                    verb,
                    m`<${buildIdentifier(Wrapper_)} />`,
                    [tmi, buildEmbeddedInstruction(eat(matcher, props, options))],
                    o({ bind: options?.value.bind ?? false }),
                  );
                  let trivialResult = result;

                  if (result && !result.isNull) {
                    if (matcher.value.properties.refMatcher) {
                      let path = ctx
                        .sourceTextFor(matcher.value.properties.refMatcher.node)
                        .slice(0, -1);
                      result = result.get(path);
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

        if (!s.depths.path && !flags.token && !(isCovered || isCover)) {
          if (triviaIsAllowed(s)) {
            yield eatMatch(triviaMatcher);
          }
        } else if (co.value) {
          let realMatcher = reifyExpression(
            co.value.arguments[0].value.properties.nodeMatcher.node,
          );
          let { type } = realMatcher;
          let language = resolveLanguage(
            ctx,
            ctx.languages.get(s.language),
            realMatcher.language || s.language,
          );
          let grammarInst = ctx.grammars.get(language);

          let isCover = grammarInst.covers.has(type);
          let isNode = grammarInst.covers.get(Symbol.for('@bablr/node')).has(type);
          let isCoverBoundary = isCover || (isNode && !isCovered);
          if (
            !flags.token &&
            isNode &&
            !isCover &&
            co.value &&
            ['holdFor', 'holdForMatch'].includes(co.value.verb)
          ) {
            if (triviaIsAllowed(s)) {
              let tmi = buildEmbeddedInstruction(
                triviaIsRequired() ? eat(triviaMatcher) : eatMatch(triviaMatcher),
              );
              return buildCall(co.value.verb, m`<${buildIdentifier(Wrapper_)} />`, [
                tmi,
                buildEmbeddedInstruction(eat(co.value.arguments[0], co.value.arguments[1])),
              ]);
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

    *[Literal_]({ intrinsicValue }) {
      yield eat(intrinsicValue);
    }
  };
};
