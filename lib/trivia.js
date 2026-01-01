/* global WeakSet */
import { Coroutine } from '@bablr/coroutine';
import { eat, eatMatch, mapProductions, o, r } from './grammar.js';
import { Matcher, Regex } from './symbols.js';
import { coverFlags, get, getCooked, getFlagsWithGap } from '@bablr/agast-helpers/tree';
import {
  buildTreeNodeMatcher,
  buildBindingMatchers,
  buildIdentifier,
  buildNodeFlags,
  buildTreeNodeMatcherOpen,
  buildPropertyMatcher,
  buildString,
  buildBoundNodeMatcher,
} from './builders.js';
import { spam as m } from '@bablr/boot';
import {
  buildCall,
  buildEmbeddedMatcher,
  buildEmbeddedNode,
  buildEmbeddedObject,
  buildEmbeddedRegex,
} from '@bablr/agast-vm-helpers/builders';
import { reifyExpression } from '@bablr/agast-vm-helpers';
import { buildNullNode } from '@bablr/agast-helpers/path';

export const triviaEnhancer = (
  { triviaIsAllowed, triviaIsRequired = () => false, triviaMatcher },
  grammar,
) => {
  let Trivia_ = 'Trivia';
  let Literal_ = 'Literal';

  while (grammar.prototype[Trivia_]) Trivia_ += '_';
  while (grammar.prototype[Literal_]) Literal_ += '_';

  let tmi = eatMatch(triviaMatcher);
  let literalMatcher = get(['nodeMatcher', 'open', 'literalValue'], triviaMatcher.value);

  let resultGrammar = mapProductions((production) => {
    return function* (props) {
      let co = new Coroutine(production(props));
      let outerProps = props;
      let { name, getState, flags, isCover, isCoverBoundary: thisIsCoverBoundary } = props;
      let isRootFragment = name === Symbol.for('@bablr/fragment');

      try {
        let returnValue = undefined;
        do {
          co.advance(returnValue);

          let instr = co.done ? co.value?.shift : co.value;

          if (co.done && !instr) break;

          let { verb, arguments: args = [] } = instr;

          switch (verb) {
            case 'eat':
            case 'eatMatch':
            case 'shift':
            case 'shiftMatch':
            case 'match':
            case 'guard': {
              let { 0: matcher, 1: props, 2: options } = args;
              let s = getState();

              let matcherFlags =
                matcher.type === Matcher &&
                reifyExpression(
                  get(['valueMatcher', 'nodeMatcher', 'open', 'flags'], matcher.value),
                );

              let isCoverBoundary = co.done
                ? thisIsCoverBoundary
                : isRootFragment ||
                  ((!matcherFlags || !matcherFlags.fragment || matcherFlags.cover) && !isCover);

              if (matcher.type === Regex || typeof matcher === 'string') {
                if (triviaIsAllowed(s) && !flags.token) {
                  if (literalMatcher) {
                    let literalResult = yield buildCall(
                      'match',
                      buildEmbeddedRegex(literalMatcher),
                    );
                    if (!literalResult) {
                      returnValue = yield instr;
                      break;
                    }
                  }

                  let isString = typeof matcher === 'string';
                  let wrappedMatcher = m`#: <*${buildIdentifier(Literal_)} ${
                    isString ? buildString(matcher) : matcher.value
                  } />`;

                  let result = yield buildCall(
                    verb,
                    m`<_${buildIdentifier(Trivia_)} />`,
                    o({
                      matcher: wrappedMatcher,
                      props,
                      options: o({ ...(options?.value ?? {}), allowEmpty: true }),
                      matchTrailing: false,
                    }),
                  );

                  returnValue = result?.value;
                  break;
                }
              }

              if (
                matcher &&
                !s.node.value.flags.token &&
                isCoverBoundary &&
                (matcher.type !== Matcher ||
                  getCooked(get(['refMatcher', 'type'], matcher.value)) !== '#')
              ) {
                if (
                  triviaIsAllowed(s) &&
                  get(['valueMatcher', 'nodeMatcher'], matcher.value).value.name?.description ===
                    'TreeNodeMatcher'
                ) {
                  // TODO this is a problem. What if there's trivia before?
                  if (literalMatcher) {
                    let literalResult = yield buildCall(
                      'match',
                      buildEmbeddedRegex(literalMatcher),
                    );
                    if (!literalResult) {
                      if (co.done) {
                        return r(instr, co.value.value);
                      } else {
                        returnValue = yield instr;
                      }
                      break;
                    }
                  }

                  instr = buildCall(
                    verb,
                    buildEmbeddedMatcher(
                      buildPropertyMatcher(
                        get('refMatcher', matcher.value),
                        buildBoundNodeMatcher(
                          [],
                          buildTreeNodeMatcher(
                            buildTreeNodeMatcherOpen(
                              buildNodeFlags(getFlagsWithGap(coverFlags, flags.hasGap)),
                              Trivia_,
                            ),
                          ),
                        ),
                      ),
                    ),
                    o({
                      matcher,
                      props,
                      matchTrailing: isRootFragment,
                    }),
                    ...(options ? [options] : []),
                  );
                }
              }

              if (co.done) {
                // account for language shift due to binding
                let outerMatcher = reifyExpression(outerProps.matcher);
                if (outerMatcher.bindingMatchers.length) {
                  instr = buildCall(
                    verb,
                    buildEmbeddedMatcher(
                      buildPropertyMatcher(
                        get('refMatcher', matcher.value),
                        buildBoundNodeMatcher(
                          buildBindingMatchers(outerMatcher.bindingMatchers),
                          get('nodeMatcher', matcher.value),
                        ),
                      ),
                    ),
                    props,
                    options,
                  );
                }

                return r(instr, co.value.value);
              } else {
                returnValue = yield instr;
              }
              break;
            }

            default:
              if (co.done) {
                return r(instr, co.value.value);
              } else {
                returnValue = yield instr;
              }
              break;
          }
        } while (!co.done);

        if (co.value) {
          throw new Error();
        }
      } catch (e) {
        co.throw(e);
        throw e;
      }
    };
  }, grammar);

  return class extends resultGrammar {
    static get atrivial() {
      return grammar;
    }

    *[Trivia_]({ props: { matchTrailing, matcher, props, options } }) {
      yield tmi;
      let returnValue = yield eat(
        // TODO fixme binding tag
        matcher.value.value.name === Symbol.for('PropertyMatcher')
          ? buildEmbeddedMatcher(
              buildPropertyMatcher(
                null,
                buildBoundNodeMatcher([], get(['valueMatcher'], matcher.value)),
              ),
            )
          : matcher,
        props,
        buildEmbeddedObject({ ...(options?.value || {}), shift: false }),
      );
      if (matchTrailing || returnValue.value?.shift) {
        yield tmi;
      }
      return returnValue.value;
    }

    *[Literal_]({ literalValue }) {
      return r(null, yield eat(buildEmbeddedNode(literalValue)));
    }
  };
};
