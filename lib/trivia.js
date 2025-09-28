/* global WeakSet */
import { spam as m } from '@bablr/boot';
import { Coroutine } from '@bablr/coroutine';
import { eat, eatMatch, mapProductions, o } from './grammar.js';
import { Matcher, OpenNodeTag, CloseNodeTag, ReferenceTag } from './symbols.js';
import { buildIdentifier } from './builders.js';
import { buildCall, buildEmbeddedInstruction } from '@bablr/agast-vm-helpers/builders';
import { getEmbeddedInstruction } from '@bablr/agast-vm-helpers/deembed';
import { reifyExpression } from '@bablr/agast-vm-helpers';
import { get, getCooked } from '@bablr/agast-helpers/tree';

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
      const { s, ctx, flags, isCoverBoundary, isCovered } = props;

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
                !s.node.flags.token &&
                (matcher.type !== Matcher ||
                  getCooked(get(['refMatcher', 'type', 'value'], matcher.value)) !== '#')
              ) {
                const previous = lookbehind(ctx, s);
                if (triviaIsAllowed(s) && (!previous || !matchedResults.has(previous))) {
                  matchedResults.add(previous);
                  yield eatMatch(triviaMatcher);
                  matchedResults.add(s.resultPath);
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
    *[Wrapper_]({ props: { value: wrapped } }) {
      for (const instr of wrapped) {
        yield getEmbeddedInstruction(instr);
      }
    }

    *[Literal_]({ value: matcher }) {
      yield eat(matcher);
    }
  };
};
