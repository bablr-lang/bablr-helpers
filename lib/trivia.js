/* global WeakSet */
import { Coroutine } from '@bablr/coroutine';
import { eat, eatMatch, mapProductions, o, r } from './grammar.js';
import { Matcher, Property, PropertyWrapper, Regex } from './symbols.js';
import { fragmentFlags, get, getCooked, getFlagsWithGap } from '@bablr/agast-helpers/tree';
import {
  buildBasicNodeMatcher,
  buildIdentifier,
  buildNodeFlags,
  buildOpenNodeMatcher,
  buildPropertyMatcher,
  buildString,
} from './builders.js';
import { spam as m } from '@bablr/boot';
import {
  buildCall,
  buildEmbeddedInstruction,
  buildEmbeddedMatcher,
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
      let { type, s, flags, isCover, isCovered } = props;
      let isRootFragment = type === Symbol.for('@bablr/fragment');

      co.advance();

      try {
        while (!co.done) {
          let instr = co.value;
          let { verb, arguments: args = [] } = instr;
          let returnValue = undefined;

          switch (verb) {
            case 'eat':
            case 'eatMatch':
            case 'shift':
            case 'shiftMatch':
            case 'match':
            case 'guard': {
              let { 0: matcher, 1: props, 2: options } = args;

              let matcherFlags =
                matcher.type === Matcher &&
                reifyExpression(get(['nodeMatcher', 'open', 'flags'], matcher.value));

              let isCoverBoundary =
                !((isCover && !isRootFragment) || isCovered) &&
                matcherFlags &&
                (matcherFlags.cover || !matcherFlags.fragment);

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
                !s.node.flags.token &&
                isCoverBoundary &&
                (matcher.type !== Matcher ||
                  getCooked(get(['refMatcher', 'type'], matcher.value)) !== '#')
              ) {
                if (triviaIsAllowed(s)) {
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

                  returnValue = yield buildCall(
                    verb,
                    buildEmbeddedMatcher(
                      buildPropertyMatcher(
                        get(['refMatcher'], matcher.value) || buildNullNode(),
                        null,
                        buildBasicNodeMatcher(
                          buildOpenNodeMatcher(
                            buildNodeFlags(getFlagsWithGap(fragmentFlags, flags.hasGap)),
                            Trivia_,
                          ),
                        ),
                      ),
                    ),
                    // m`${get(['refMatcher'], matcher.value) || buildNullNode()} <_${buildIdentifier(
                    //   Trivia_,
                    // )} />`,
                    o({
                      matcher,
                      props,
                      matchTrailing: isRootFragment,
                    }),
                    options,
                  );
                  break;
                }
              }

              returnValue = yield instr;
              break;
            }

            default:
              returnValue = yield instr;
              break;
          }

          co.advance(returnValue);
        }

        if (co.value) {
          return co.value;
        }
      } catch (e) {
        co.throw(e);
        throw e;
      }
    };
  }, grammar);

  return class extends resultGrammar {
    *[Trivia_]({ props: { matchTrailing, matcher, props, options } }) {
      yield tmi;
      let returnValue = yield eat(
        // TODO fixme binding tag
        matcher.value.type === Symbol.for('PropertyMatcher')
          ? buildEmbeddedMatcher(
              buildPropertyMatcher(null, null, get('nodeMatcher', matcher.value)),
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
      return r(null, yield eat(literalValue));
    }
  };
};
