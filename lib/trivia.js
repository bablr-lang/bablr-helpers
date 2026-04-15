import { mapProductions, r, o, eatHeld, dropHeld, returnHeld, pinHeld } from './grammar.js';
import { Matcher } from './symbols.js';
import { get, getRoot, printSource, streamFromTree } from '@bablr/agast-helpers/tree';
import { buildCall } from '@bablr/agast-vm-helpers/builders';
import { isEmpty, StreamGenerator, wait } from '@bablr/agast-helpers/stream';
import { isEmbeddedRegexMatcher } from '@bablr/agast-vm-helpers/deembed';

export const triviaEnhancer = (
  { triviaIsAllowed, triviaIsRequired = () => false, Trivia },
  grammar,
) => {
  let newGrammar = mapProductions(
    (production) => {
      function* __trivia(args) {
        let iter = production.call(this, args);
        let step;
        let outerArgs = args;
        let { getState, ctx, flags, isCover, isCoverBoundary: thisIsCoverBoundary } = args;
        let { getGapNode } = ctx;
        let rootState = getState();
        let isRootFragment = !rootState.depths.path;
        let s = rootState;

        try {
          let returnValue = undefined;
          do {
            step = iter.next(returnValue);

            if (step instanceof Promise) step = yield wait(step);

            let instr = step.done ? step.value?.shift : step.value;

            if (step.done && !instr) break;

            let { verb, arguments: args = [] } = instr;

            switch (verb) {
              case 'eat':
              case 'eatMatch':
              case 'shift':
              case 'shiftMatch':
              case 'match':
              case 'guard': {
                let { 0: matcher, 1: props, 2: options } = args;
                let isShift = verb === 'shiftMatch';

                let isCoverBoundary = step.done
                  ? thisIsCoverBoundary
                  : isRootFragment ||
                    (printSource(
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
                  !flags.token &&
                  isCoverBoundary &&
                  triviaIsAllowed(s, matcher, props) &&
                  (matcher.type !== Matcher ||
                    printSource(get(['refMatcher', 'type'], matcher.value)) !== '#')
                ) {
                  if (s.held && s.holdingMatch.depth > outerArgs.m.depth && !isShift) {
                    yield pinHeld();
                  } else if (
                    !(s.held || step.done || isShift) &&
                    get(['valueMatcher', 'nodeMatcher'], matcher.value).value.name?.description ===
                      'TreeNodeMatcher'
                  ) {
                    yield* Trivia(outerArgs);
                  }
                  s = getState();
                }

                // if (step.done) {
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

                //   return r(instr, step.value.value);
                // } else {
                if (step.done) {
                  return r(instr, step.value.value);
                } else {
                  if (
                    s.source.atGap &&
                    (get(['refMatcher', 'flags'], matcher.value)?.value.attributes.hasGap ||
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
                      s = getState();
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
                    s = getState();
                  } else {
                    returnValue = yield instr;
                    s = getState();
                  }

                  if (
                    !s.held &&
                    triviaIsAllowed(s, matcher, props) &&
                    matcher.type === Symbol.for('Matcher') &&
                    ![Symbol.for('String'), Symbol.for('Pattern')].includes(
                      getRoot(matcher.value).value.name,
                    ) &&
                    get(['valueMatcher', 'nodeMatcher'], getRoot(matcher.value))?.value.name
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
                if (step.done) {
                  return r(instr, step.value.value);
                } else {
                  returnValue = yield instr;
                  s = getState();
                }
                break;
            }
          } while (!step.done);

          if (step.value && !step.value.shift && step.value.value) {
            return step.value;
          }

          s = getState();

          if (s.held && !s.depths.path) {
            let empty = isEmpty(streamFromTree(s.held, { getGapNode }));
            empty ? yield dropHeld() : s.canReturnHeld ? yield returnHeld() : yield eatHeld();
          }

          if (step.value) {
            throw new Error();
          }
        } catch (e) {
          step = iter.throw(e);
          if (step instanceof Promise) step = yield wait(step);
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
