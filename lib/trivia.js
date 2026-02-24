/* global WeakSet */
import { spam as m } from '@bablr/boot';
import { Coroutine } from '@bablr/coroutine';
import { eatMatch, mapProductions, r, o, eatHeld, dropHeld } from './grammar.js';
import { Matcher, Regex } from './symbols.js';
import { get, getCooked, streamFromTree } from '@bablr/agast-helpers/tree';
import { buildCall, buildEmbeddedRegex } from '@bablr/agast-vm-helpers/builders';
import { reifyExpression } from '@bablr/agast-vm-helpers';
import { isEmpty } from '@bablr/agast-helpers/stream';

export const triviaEnhancer = (
  { triviaIsAllowed, triviaIsRequired = () => false, triviaMatcher, Trivia },
  grammar,
) => {
  let tmi = eatMatch(triviaMatcher, o({}), o({ hold: true }));
  let literalMatcher = get(['nodeMatcher', 'open', 'literalValue'], triviaMatcher.value);

  function* DefaultTrivia() {
    yield tmi;
  }

  let resultGrammar = mapProductions((production) => {
    return function* (props) {
      let co = new Coroutine(production.call(this, props));
      // let outerProps = props;
      let { getState, ctx, s, flags, isCover, isCoverBoundary: thisIsCoverBoundary } = props;
      let { getGapNode } = ctx;
      let rootState = s();
      let isRootFragment = !rootState.depths.path;

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
              let isShift = verb === 'shiftMatch';

              let isCoverBoundary = co.done
                ? thisIsCoverBoundary
                : isRootFragment ||
                  (reifyExpression(
                    get(['valueMatcher', 'nodeMatcher', 'open', 'type'], matcher.value),
                  ) !== '__' &&
                    !isCover);

              if (matcher.type === Regex || typeof matcher === 'string') {
                if (triviaIsAllowed(s, matcher, props) && !flags.token) {
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

                  if (!s.held) {
                    yield tmi;
                  }

                  returnValue = yield buildCall(verb, matcher);
                  // let result = yield buildCall(
                  //   verb,
                  //   m`<_${buildIdentifier(Trivia_)} />`,
                  //   o({
                  //     matcher: wrappedMatcher,
                  //     props,
                  //     options: o({
                  //       ...(options?.value ?? {}),
                  //       allowEmpty: true,
                  //       suppressGap: true,
                  //       literal: true,
                  //     }),
                  //     matchTrailing: false,
                  //   }),
                  //   o({
                  //     allowEmpty: true,
                  //     suppressGap: true,
                  //   }),
                  // );

                  // returnValue = result?.value || getRoot(result?.node);
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
                  triviaIsAllowed(s, matcher, props) &&
                  !(getState().held || co.done || isShift) &&
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
                }

                s = getState();
                if (!s.held) {
                  yield tmi;
                }
                s = getState();
              }

              // if (co.done) {
              //   // account for language shift due to binding
              //   let outerMatcher = reifyExpression(outerProps.matcher);
              //   if (outerMatcher.bindingMatchers.length) {
              //     instr = buildCall(
              //       verb,
              //       buildEmbeddedMatcher(
              //         buildPropertyMatcher(
              //           get('refMatcher', matcher.value),
              //           buildBoundNodeMatcher(
              //             buildBindingMatchers(outerMatcher.bindingMatchers),
              //             get('nodeMatcher', matcher.value),
              //           ),
              //         ),
              //       ),
              //       props,
              //       options,
              //     );
              //   }

              //   return r(instr, co.value.value);
              // } else {
              if (co.done) {
                return r(instr, co.value.value);
              } else {
                if (
                  s.held &&
                  !s.shifted &&
                  get(['valueMatcher', 'nodeMatcher', 'open', 'flags', 'tokenToken'], matcher.value)
                ) {
                  let empty = isEmpty(streamFromTree(s.held.value.node, { getGapNode }));
                  returnValue = yield buildCall(
                    verb,
                    matcher,
                    props,
                    o({ ...options?.value, held: empty ? 'drop' : 'eat' }),
                  );
                } else {
                  returnValue = yield instr;
                }
              }
              break;
              // }
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

        if (!s().depths.path) {
          let empty = isEmpty(streamFromTree(s().held.value.node, { getGapNode }));
          empty ? yield dropHeld() : yield eatHeld();
        }

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

    Trivia(args) {
      return Trivia ? Trivia(args) : DefaultTrivia(args);
    }
  };
};
