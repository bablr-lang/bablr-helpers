import { Grammar, traces, All } from './shared.js';
import { productionFor } from '../productions.js';
import { tok, chrs } from '../shorthand.js';
import { map, concat } from '../iterable.js';
import * as sym from '../symbols.js';

const isString = (value) => typeof value === 'string';
const isRegex = (value) => value instanceof RegExp;

const matchableFromMatchables = (matchables) => {
  const matchables_ = matchables.map((matchable) =>
    isRegex(matchable) || isString(matchable) ? chrs(matchable) : matchable,
  );
  return matchables_.length > 1 ? tok(All, matchables_) : matchables_[0];
};

export class TokenGrammar extends Grammar {
  constructor(grammar, enhancers) {
    const aliasProductions = map(([aliasType, types]) => {
      return productionFor(aliasType, function* match(props) {
        const { value, alterLexicalState } = props;

        for (const type of types) {
          if (yield eatMatch(tok(type, value, alterLexicalState))) break;
        }
      });
    }, grammar.aliases);

    const productions = concat(aliasProductions, grammar.productions);

    super({ ...grammar, productions }, enhancers);
  }

  get productionType() {
    return sym.token;
  }

  static eat(...matchables) {
    return {
      type: sym.eat,
      branch: false,
      value: matchableFromMatchables(matchables),
      error: traces && new Error(),
    };
  }

  static match(...matchables) {
    return {
      type: sym.match,
      branch: true,
      value: matchableFromMatchables(matchables),
      error: traces && new Error(),
    };
  }

  static eatMatch(...matchables) {
    return {
      type: sym.eat,
      branch: true,
      value: matchableFromMatchables(matchables),
      error: traces && new Error(),
    };
  }

  static startToken(type) {
    return {
      type: sym.startToken,
      branch: false,
      value: type,
      error: traces && new Error(),
    };
  }

  static endToken() {
    return {
      type: sym.endToken,
      branch: false,
      value: undefined,
      error: traces && new Error(),
    };
  }
}

export const { eat, match, eatMatch, fail, startToken, endToken } = TokenGrammar;