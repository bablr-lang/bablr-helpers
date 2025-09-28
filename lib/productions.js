import { eat, eatMatch, fail } from './grammar.js';
import { Matcher } from './symbols.js';

export function* List({ props }) {
  const { element, separator, allowHoles = false, allowTrailingSeparator = true } = props;

  let sep,
    it,
    anySep = false;
  for (;;) {
    it = yield eatMatch(...(Array.isArray(element) ? element : [element]));
    if (it || allowTrailingSeparator) {
      sep = yield eatMatch(separator);
      anySep ||= sep;
    } else {
      sep = null;
    }
    if (!(sep || allowHoles)) break;
  }
}

export function* Any({ props: { value: alternatives } }) {
  for (const alternative of alternatives) {
    if (Array.isArray(alternative)) {
      if (yield eatMatch(...alternative)) return;
    } else if (alternative.type === Matcher) {
      if (yield eatMatch(alternative)) return;
    } else {
      throw new Error();
    }
  }
  yield fail();
}

export function* All({ props: { value: matchers } }) {
  for (const matcher of matchers) {
    if (Array.isArray(matcher)) {
      yield eat(...matcher);
    } else {
      yield eat(matcher);
    }
  }
}

export function* Optional({ props: { value: matcher } }) {
  yield eatMatch(matcher);
}

export function* Literal({ ctx, literalValue }) {
  if (!literalValue) throw new Error('Intrinsic productions must have value');

  yield eat(ctx.sourceTextFor(literalValue.value));
}
export const Keyword = Literal;

export const Punctuator = Literal;

export const Space = Literal;
