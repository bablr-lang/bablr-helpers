import { spam as m } from '@bablr/boot';
import { Coroutine } from '@bablr/coroutine';
import { eat, eatMatch, mapProductions } from './grammar.js';
import { EmbeddedMatcher, EmbeddedRegex } from './symbols.js';
import { getCooked } from '@bablr/agast-helpers/tree';
import { buildIdentifier } from './builders.js';
import { buildCall, buildEmbeddedInstruction } from '@bablr/agast-vm-helpers/builders';
import { getEmbeddedInstruction } from '@bablr/agast-vm-helpers/deembed';

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
      const { s, flags, isCoverBoundary } = props;

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
                matcher &&
                (matcher.type !== EmbeddedMatcher ||
                  getCooked(matcher.value.properties.refMatcher?.node.properties.name?.node) !==
                    '#') &&
                !s.holding &&
                !flags.token &&
                isCoverBoundary
              ) {
                if (triviaIsAllowed(s)) {
                  let tmi = buildEmbeddedInstruction(
                    triviaIsRequired() ? eat(triviaMatcher) : eatMatch(triviaMatcher),
                  );
                  if (matcher.type === EmbeddedRegex) {
                    let wrappedMatcher = m`value: <*Literal ${matcher.value} />`;

                    let result = yield buildCall(verb, m`<${buildIdentifier(Wrapper_)} />`, [
                      tmi,
                      buildEmbeddedInstruction(buildCall('eat', wrappedMatcher, props, options)),
                    ]);

                    returnValue = result.get('value');
                  } else {
                    returnValue = yield buildCall(verb, m`<${buildIdentifier(Wrapper_)} />`, [
                      tmi,
                      buildEmbeddedInstruction(buildCall('eat', matcher, props, options)),
                    ]);
                  }
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

        if (
          !flags.token &&
          isCoverBoundary &&
          (!s.depths.path || (co.value && ['holdFor', 'holdForMatch'].includes(co.value.verb)))
        ) {
          if (triviaIsAllowed(s)) {
            yield eatMatch(triviaMatcher);
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
