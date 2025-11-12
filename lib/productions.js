import { get, Path } from '@bablr/agast-helpers/path';
import { eat, eatMatch, fail } from './grammar.js';
import { Matcher } from './symbols.js';
import { buildEmbeddedMatcher } from '@bablr/agast-vm-helpers/builders';
import { printSource } from '@bablr/agast-helpers/tree';

export function* List(args) {
  let { props, matcher } = args.element ? { props: args } : args;

  const { element, separator, allowHoles = false, allowTrailingSeparator = true } = props;
  let refMatcher = matcher && get('refMatcher', matcher);

  let matcher_ = Array.isArray(element) ? element[0] : element;
  let props_ = Array.isArray(element) ? element[1] : undefined;
  let options = Array.isArray(element) ? element[2] : undefined;

  if (refMatcher && !get('refMatcher', matcher_.value)) {
    matcher_ = buildEmbeddedMatcher(Path.set(matcher_.value, 'refMatcher', refMatcher));
  }

  let sep, it;
  for (;;) {
    it = yield eatMatch(matcher_, props_, options);
    if (it || allowTrailingSeparator) {
      sep = yield eatMatch(separator);
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

export function* Literal({ literalValue }) {
  if (!literalValue) throw new Error('Intrinsic productions must have value');

  yield eat(printSource(literalValue.value));
}
export const Keyword = Literal;

export const Space = Literal;
