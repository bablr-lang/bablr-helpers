import { Coroutine } from '@bablr/coroutine';
import { mapProductions, r, o, eatHeld, dropHeld, returnHeld, pinHeld } from './grammar.js';
import { Matcher } from './symbols.js';
import { get, getRoot, printSource, streamFromTree } from '@bablr/agast-helpers/tree';
import { buildCall } from '@bablr/agast-vm-helpers/builders';
import { reifyExpression } from '@bablr/agast-vm-helpers';
import { isEmpty, StreamGenerator } from '@bablr/agast-helpers/stream';
import { isEmbeddedRegexMatcher } from '@bablr/agast-vm-helpers/deembed';

export const triviaEnhancer = (
  { triviaIsAllowed, triviaIsRequired = () => false, Trivia },
  grammar,
) => {
  let newGrammar = mapProductions(
    (production) => {
      function* __trivia(args) {
        let co = new Coroutine(production.call(this, args));
        let outerArgs = args;
        let { getState, ctx, flags, isCover, isCoverBoundary: thisIsCoverBoundary } = args;
        let { getGapNode } = ctx;
        let rootState = getState();
        let isRootFragment = !rootState.depths.path;

        try {
          let returnValue = undefined;
          do {
            co.advance(returnValue);

            if (co.current instanceof Promise) {
              co.current = yield co.current;
            }

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

                if (isEmbeddedRegexMatcher(matcher)) {
                  if (triviaIsAllowed(s, matcher, props) && !flags.token) {
                    if (!s.held) {
                      yield* Trivia(outerArgs);
                    }

                    returnValue = yield buildCall(verb, matcher);
                    break;
                  }
                }

                if (
                  matcher &&
                  !s.node.value.flags.token &&
                  isCoverBoundary &&
                  triviaIsAllowed(s, matcher, props) &&
                  (matcher.type !== Matcher ||
                    printSource(get(['refMatcher', 'type'], matcher.value)) !== '#')
                ) {
                  if (s.held && s.holdingMatch.depth > outerArgs.m.depth) {
                    yield pinHeld();
                  } else if (
                    !(s.held || co.done || isShift) &&
                    get(['valueMatcher', 'nodeMatcher'], matcher.value).value.name?.description ===
                      'TreeNodeMatcher'
                  ) {
                    yield* Trivia(outerArgs);
                  }
                  s = getState();
                }

                // if (co.done) {
                //   // account for language shift due to binding
                //   let outerMatcher = reifyExpression(outerArgs.matcher);
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
                    s.source.atGap &&
                    (reifyExpression(get(['refMatcher', 'flags'], matcher.value))?.hasGap ||
                      (!outerArgs.isNode && outerArgs.coverRef.flags.hasGap))
                  ) {
                    let empty = isEmpty(streamFromTree(s.held, { getGapNode }));
                    empty
                      ? yield dropHeld()
                      : s.canReturnHeld
                      ? yield returnHeld()
                      : yield eatHeld();
                    returnValue = yield instr;
                    s = getState();

                    if (!s.held && triviaIsAllowed(s, matcher, props)) {
                      yield* Trivia(outerArgs);
                    }
                    continue;
                  } else if (
                    s.held &&
                    !s.shifted &&
                    get(
                      ['valueMatcher', 'nodeMatcher', 'open', 'flags', 'tokenToken'],
                      matcher.value,
                    )
                  ) {
                    let empty = isEmpty(streamFromTree(s.held, { getGapNode }));
                    returnValue = yield buildCall(
                      verb,
                      matcher,
                      props,
                      o({
                        ...options?.value,
                        held: empty ? 'drop' : s.canReturnHeld ? 'return' : 'eat',
                      }),
                    );
                  } else {
                    returnValue = yield instr;
                  }

                  s = getState();

                  if (
                    !s.held &&
                    triviaIsAllowed(s, matcher, props) &&
                    matcher.type === Symbol.for('Matcher') &&
                    ![Symbol.for('String'), Symbol.for('Pattern')].includes(
                      getRoot(matcher.value).value.name,
                    ) &&
                    get(['valueMatcher', 'nodeMatcher'], getRoot(matcher.value)).value.name
                      ?.description === 'TreeNodeMatcher'
                  ) {
                    yield* Trivia(outerArgs);
                    s = getState();
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

          let s = getState();

          if (s.held && !s.depths.path) {
            let empty = isEmpty(streamFromTree(s.held, { getGapNode }));
            empty ? yield dropHeld() : s.canReturnHeld ? yield returnHeld() : yield eatHeld();
          }

          if (co.value) {
            throw new Error();
          }
        } catch (e) {
          co.throw(e);
          throw e;
        }
      }

      return function trivia(args) {
        return new StreamGenerator(__trivia.call(this, args));
      };
    },
    grammar,
    (newGrammar) => {
      Object.defineProperty(newGrammar, 'atrivial', { value: grammar });
    },
  );

  return newGrammar;
};
