import { eat, eatMatch, fail } from './grammar.js';
import { printSource } from '@bablr/agast-helpers/tree';
import { arrayValues } from '@bablr/agast-helpers/iterable';
import { getEmbeddedCallable } from '@bablr/agast-vm-helpers/deembed';
import { buildEmbeddedCallable } from '@bablr/agast-vm-helpers/builders';

const { isArray } = Array;

export function* List(args) {
  let { props } = args.element ? { props: args } : args;

  const { element, separator, allowHoles = false, allowTrailingSeparator = true } = props;

  let matcher_ = isArray(element) ? element[0] : element;
  let props_ = isArray(element) ? element[1] : undefined;
  let options = isArray(element) ? element[2] : undefined;
  let reference = getEmbeddedCallable(matcher_).reference;

  if (reference && !getEmbeddedCallable(matcher_).reference) {
    let { bindings, nodeMatcher } = matcher_.value;
    matcher_ = buildEmbeddedCallable({ reference, bindings, nodeMatcher });
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
  for (const alternative of arrayValues(alternatives)) {
    if (yield eatMatch(alternative)) return;
  }
  yield fail();
}

export function* All({ props: { value: matchers } }) {
  for (const matcher of arrayValues(matchers)) {
    yield eat(matcher);
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
