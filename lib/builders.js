import { interpolateFragment, buildFilledGapFunction } from '@bablr/agast-helpers/template';
import { get, isEmpty, treeFromStreamSync as treeFromStream } from '@bablr/agast-helpers/tree';
import { buildLiteralTag as agastBuildLiteralTag } from '@bablr/agast-helpers/builders';
import * as t from '@bablr/agast-helpers/shorthand';
import * as Tags from '@bablr/agast-helpers/tags';
import * as l from '@bablr/agast-vm-helpers/languages';
import { concat } from '@bablr/agast-vm-helpers/iterable';
import { buildNullNode } from '@bablr/agast-helpers/path';

const { freeze } = Object;
const { isArray } = Array;

const when = (condition, value) => (condition ? value : { *[Symbol.iterator]() {} });

const isString = (val) => typeof val === 'string';

export const buildReferenceTag = (name, isArray = false, flags = t.referenceFlags) => {
  let expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    [
      t.nodeOpen(t.nodeFlags, 'ReferenceTag'),
      t.ref`name`,
      gap(name ? buildIdentifier(name) : buildNullNode()),
      t.ref`openIndexToken`,
      gap(isArray ? buildToken(null, '[') : buildNullNode()),
      t.ref`closeIndexToken`,
      gap(isArray ? buildToken(null, ']') : buildNullNode()),
      t.ref`flags`,
      gap(flags ? buildReferenceFlags(flags) : buildNullNode()),
      t.ref`sigilToken`,
      gap(buildToken(null, ':')),
      t.nodeClose(),
    ],
    { expressions },
  );
};

export const buildBindingMatcher = (segments) => {
  let expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    concat(
      [t.nodeOpen(t.nodeFlags, 'BindingMatcher')],
      segments.flatMap((segment) => [t.ref`segments[]`, gap(buildBindingSegment(segment))]),
      [t.nodeClose()],
    ),
    { expressions },
  );
};

export const buildBindingMatchers = (matchers) => {
  let expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    concat(
      [t.fragOpen()],
      matchers.flatMap((matcher) => [
        t.ref`bindingMatchers[]`,
        gap(buildBindingMatcher(matcher.segments)),
      ]),
      [t.nodeClose()],
    ),
    { expressions },
  );
};

export const buildBoundNodeMatcher = (bindingMatchers, valueMatcher) => {
  if (valueMatcher.value.name.description === 'BoundNodeMatcher') throw new Error();
  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    (function* () {
      yield t.nodeOpen(t.nodeFlags, 'BoundNodeMatcher');
      if (bindingMatchers.length) {
        yield* interpolateFragment(
          buildBindingMatchers(bindingMatchers),
          t.ref`bindingMatchers`,
          expressions,
        );
      }
      yield t.ref`nodeMatcher`;
      yield gap(valueMatcher);
      yield t.nodeClose();
    })(),
    { expressions },
  );
};

export const buildPropertyMatcher = (refMatcher, valueMatcher) => {
  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    (function* () {
      yield t.nodeOpen(t.nodeFlags, 'PropertyMatcher');
      yield t.ref`refMatcher`;
      yield gap(refMatcher || buildNullNode());
      yield t.ref`valueMatcher`;
      yield gap(valueMatcher || buildNullNode());
      yield t.nodeClose();
    })(),
    { expressions },
  );
};

export const buildBindingSegment = (segment) => {
  let expressions = [];
  const gap = buildFilledGapFunction(expressions);

  let { type, name } = segment;

  return treeFromStream(
    [
      t.nodeOpen(t.nodeFlags, 'BindingSegment'),
      t.ref`openToken`,
      gap(buildToken(null, ':')),
      t.ref`path`,
      gap(type ? buildToken(null, type) : buildIdentifier(name)),
      t.ref`closeToken`,
      gap(buildToken(null, ':')),
      t.nodeClose(),
    ],
    { expressions },
  );
};

export const buildGapTag = () => {
  let expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    [
      t.nodeOpen(t.nodeFlags, 'GapTag'),
      t.ref`sigilToken`,
      gap(buildToken(null, '<//>')),
      t.nodeClose(),
    ],
    { expressions },
  );
};

export const buildShiftTag = () => {
  let expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    [
      t.nodeOpen(t.nodeFlags, 'ShiftTag'),
      t.ref`sigilToken`,
      gap(buildToken(null, '^^^')),
      t.nodeClose(),
    ],
    { expressions },
  );
};

export const buildReferenceFlags = (flags = t.referenceFlags) => {
  const { expression = null, intrinsic = null } = flags;
  let expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    [
      t.nodeOpen(t.nodeFlags, 'ReferenceFlags'),
      t.ref`expressionToken`,
      gap(expression ? buildToken(null, '+') : buildNullNode()),
      t.ref`intrinsicToken`,
      gap(intrinsic ? buildToken(null, '*') : buildNullNode()),
      t.nodeClose(),
    ],
    { expressions },
  );
};

export const buildNodeFlags = (flags = t.nodeFlags) => {
  const { token = null, hasGap = null } = flags;
  let expressions = [];
  const gap = buildFilledGapFunction(expressions);

  let flags_ = { token, hasGap };
  let attributes = flags_;

  return treeFromStream(
    [
      t.nodeOpen(t.nodeFlags, 'NodeFlags', null, attributes),
      t.ref`tokenToken`,
      gap(token ? buildToken(null, '*') : buildNullNode()),
      t.ref`hasGapToken`,
      gap(hasGap ? buildToken(null, '$') : buildNullNode()),
      t.nodeClose(),
    ],
    { expressions },
  );
};

export const buildSpamMatcher = (name = null, value = null, attributes = null) => {
  return buildTreeNodeMatcherOpen(buildNodeFlags(t.nodeFlags), null, name, value, attributes);
};

export const buildTreeNodeMatcherOpen = (flags, type, name, literalValue, attributes = null) => {
  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

  if (!type && !name) throw new Error();

  return treeFromStream(
    (function* () {
      yield t.nodeOpen(t.nodeFlags, 'TreeNodeMatcherOpen');
      yield t.ref`openToken`;
      yield gap(buildToken(null, '<'));
      yield t.ref`flags`;
      yield gap(flags);
      yield t.ref`type`;
      yield gap(typeof type === 'string' ? buildToken(null, type) : type);
      yield t.ref`name`;
      yield gap(typeof name === 'string' ? buildIdentifier(name) : name);

      yield* when(literalValue, [t.ref`#`, ...Tags.traverse(buildSpace().value.tags)]);

      yield t.ref`literalValue`;
      yield gap(literalValue ? buildString(literalValue) : buildNullNode());

      if (!isEmpty(attributes)) {
        yield t.ref`#`;
        yield* buildSpace().value.tags;
        yield* interpolateFragment(attributes, t.ref`attributes[]`, expressions);
      }

      yield t.ref`selfClosingToken`;
      yield gap(buildToken(null, '/'));
      yield t.ref`closeToken`;
      yield gap(buildToken(null, '>'));
      yield t.nodeClose();
    })(),
    { expressions },
  );
};

export const buildTreeNodeMatcher = (open, children) => {
  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

  let children_ = children;

  if (children_) {
    throw new Error('not implemented');
    // if (isArray(children_)) {
    //   children_ = buildTreeNodeMatcherChildren(children_);
    // }
  }

  return treeFromStream(
    (function* () {
      yield t.nodeOpen(t.nodeFlags, 'TreeNodeMatcher');
      yield t.ref`open`;
      yield gap(open);
      if (!isEmpty(children_)) {
        yield* interpolateFragment(children_, t.ref`children[]`, expressions);
      }
      yield t.nodeClose();
    })(),
    { expressions },
  );
};

export const buildReferenceMatcher = (type = '.', name, isArray, flags) => {
  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

  if (isString(flags)) {
    let intrinsic = flags.includes('*');
    let hasGap = flags.includes('$');
    let expression = flags.includes('+');

    return buildReferenceMatcher(
      type,
      name,
      isArray,
      buildReferenceFlags({ intrinsic, hasGap, expression }),
    );
  }

  return treeFromStream(
    (function* () {
      yield t.nodeOpen(t.nodeFlags, 'ReferenceMatcher');
      yield t.ref`type`;
      yield gap(type && buildKeyword(type));
      yield t.ref`name`;
      yield gap(name && buildIdentifier(name));
      yield* (function* () {
        if (isArray) {
          yield t.ref`openIndexToken`;
          yield gap(buildToken(null, '['));
          yield t.ref`closeIndexToken`;
          yield gap(buildToken(null, ']'));
        }
      })();
      yield t.ref`flags`;
      yield gap(flags);
      yield t.ref`sigilToken`;
      yield gap(buildToken(null, ':'));
      yield t.ref`#`;
      yield* Tags.traverse(buildSpace().value.tags);
      yield t.nodeClose();
    })(),
    { expressions },
  );
};

export const buildToken = (name, value, attributes = {}) => {
  return treeFromStream([
    t.nodeOpen(t.tokenFlags, name, null, attributes),
    t.lit(value),
    t.nodeClose(),
  ]);
};

export const buildPunctuator = (value, attributes = {}) => {
  return buildToken(null, value, attributes);
};

export const buildOpenNodeTag = (flags, name = null, attributes) => {
  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    (function* () {
      yield t.ref`openToken`;
      yield gap(buildPunctuator('<'));
      yield t.ref`flags`;
      yield gap(buildNodeFlags(flags));
      yield t.ref`name`;
      yield gap(name ? buildIdentifier(name) : buildNullNode());
      yield* when(!isEmpty(attributes), [t.ref`#`, gap(buildSpace())]);
      yield* interpolateFragment(attributes, t.ref`attributes[]`, expressions);
      yield t.ref`closeToken`;
      yield gap(buildPunctuator('>'));
    })(),
    { expressions },
  );
};

export const buildDoctypeTag = (attributes) => {
  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    (function* () {
      yield t.nodeOpen(t.nodeFlags, 'DoctypeTag');
      yield t.ref`openToken`;
      yield gap(buildPunctuator('<!'));
      yield t.ref`version`;
      yield gap(buildToken('PositiveInteger', '0'));
      yield t.ref`versionSeparator`;
      yield gap(buildPunctuator(':'));
      yield t.ref`doctype`;
      yield gap(buildKeyword('cstml'));
      yield t.nodeClose();

      yield* when(!isEmpty(attributes), [t.ref`#`, ...buildSpace().value.tags]);
      yield* interpolateFragment(attributes, t.ref`attributes[]`, expressions);

      yield t.ref`closeToken`;
      yield gap(buildToken(null, '>'));
    })(),
    { expressions },
  );
};

export const buildIdentifierPath = (path) => {
  const path_ = isString(path) ? [path] : [...path];
  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

  if (!path_.length) {
    return null;
  }

  return treeFromStream(
    (function* () {
      yield t.nodeOpen(t.nodeFlags, 'IdentifierPath');

      yield* path_
        .flatMap((segment) => [
          t.ref`segments[]`,
          gap(segment.type ? buildPunctuator(segment.type) : buildIdentifier(segment.name)),
          t.ref`#separatorTokens`,
          gap(buildToken(null, '.')),
        ])
        .slice(0, -2);

      yield t.nodeClose();
    })(),
    { expressions },
  );
};

export const buildLanguage = (language) => {
  return language && isString(language) && language.startsWith('https://')
    ? buildString(language)
    : buildIdentifierPath(language);
};

export const buildCloseNodeTag = () => {
  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    [
      t.nodeOpen(t.nodeFlags, 'CloseNodeTag'),
      t.ref`openToken`,
      gap(buildToken(null, '</')),
      t.ref`closeToken`,
      gap(buildToken(null, '>')),
      t.nodeClose(),
    ],
    { expressions },
  );
};

export const buildLiteralTag = (value) => {
  return treeFromStream([
    t.nodeOpen(t.nodeFlags, 'LiteralTag'),
    t.ref`value`,
    t.lit(value),
    t.nodeClose(),
  ]);
};

export const buildTerminalProps = (matcher) => {
  const value = get('value', matcher);
  const attributes = get('attributes', matcher);

  return buildObject({ value, attributes });
};

export const buildSpace = () => {
  return buildToken('Space', ' ');
};

export const buildIdentifier = (name) => {
  let unquoted = /^[a-zA-Z\u{80}-\u{10ffff}][a-zA-Z0-9_\u{80}-\u{10ffff}-]*$/uy.test(name);
  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

  if (unquoted) {
    return treeFromStream(
      [
        t.nodeOpen(t.nodeFlags, 'Identifier'),
        t.ref`content`,
        gap(buildIdentifierContent(name)),
        t.nodeClose(),
      ],
      { expressions },
    );
  } else {
    return treeFromStream(
      (function* () {
        yield t.nodeOpen(t.nodeFlags, 'Identifier');

        yield t.ref`openToken`;
        yield gap(buildToken(null, '`'));
        yield t.ref`content`;
        yield t.nodeOpen(t.tokenFlags, 'IdentifierContent');

        let lit = '';

        let pieces = name.split(/[\\`]/g);

        for (const piece of pieces) {
          if (/[\\`]/y.test(piece)) {
            let chr = piece;
            if (lit) {
              yield agastBuildLiteralTag(lit);
              lit = '';
            }

            let value = buildKeyword(chr);

            yield t.ref`@`;
            yield t.nodeOpen(t.nodeFlags, 'EscapeSequence', null, { cooked: chr });
            yield t.ref`escape`;
            yield gap(buildToken(null, '\\'));
            yield t.ref`value`;
            yield gap(value);
            yield t.nodeClose();
          } else {
            lit += piece;
          }
        }

        if (lit) yield agastBuildLiteralTag(lit);
        lit = '';

        yield t.nodeClose();

        yield t.ref`closeToken`;
        yield gap(buildToken(null, '`'));
        yield t.nodeClose();
      })(),
      { expressions },
    );
  }
};

export const buildIdentifierContent = (value) => {
  return buildToken('IdentifierContent', value);
};

export const buildKeyword = (name) => {
  return buildToken(null, name);
};

export const buildCall = (verb, args) => {
  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    [
      t.nodeOpen(t.nodeFlags, 'Call'),
      t.ref`verb`,
      gap(verb),
      t.ref`arguments`,
      gap(args),
      t.nodeClose(),
    ],
    { expressions },
  );
};

export const buildProperty = (key, value) => {
  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    (function* () {
      yield t.nodeOpen(t.nodeFlags, 'Property');
      yield t.ref`key`;
      yield gap(key);
      yield t.ref`mapOperator`;
      yield gap(buildToken(null, ':'));
      yield t.ref`#`;
      yield gap(buildSpace());
      yield t.ref`value`;
      yield gap(value);
      yield t.nodeClose();
    })(),
    { expressions },
  );
};

const escapables = {
  '\r': 'r',
  '\n': 'n',
  '\t': 't',
  '\0': '0',
};

export const buildDigit = (value) => {
  return buildToken('Digit', value);
};

export const buildInteger = (value, base = 10) => {
  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

  const digits = value.toString(base).split('');

  return treeFromStream(
    concat(
      [t.nodeOpen(t.nodeFlags, 'Integer')],
      digits.flatMap((digit) => [t.ref`digits[]`, gap(buildDigit(digit))]),
      [t.nodeClose()],
    ),

    { expressions },
  );
};

export const buildInfinity = (value) => {
  let sign;
  if (value === Infinity) {
    sign = '+';
  } else if (value === -Infinity) {
    sign = '-';
  } else {
    throw new Error();
  }

  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    [
      t.nodeOpen(t.nodeFlags, 'Infinity'),
      t.ref`sign`,
      gap(buildToken(null, sign)),
      t.ref`value`,
      gap(buildToken(null, 'Infinity')),
      t.nodeClose(),
    ],
    { expressions },
  );
};

export const buildNumber = (value) => {
  if (Number.isFinite(value)) {
    return buildInteger(value);
  } else {
    return buildInfinity(value);
  }
};

export const buildString = (value) => {
  if (value == null) throw new Error();
  const pieces = isArray(value) ? value : [value];
  let lit = '';

  if (pieces.length === 1 && pieces[0] === "'") {
    const expressions = [];
    const gap = buildFilledGapFunction(expressions);
    return treeFromStream(
      [
        t.nodeOpen(t.nodeFlags, 'String'),
        t.ref`openToken`,
        gap(buildToken(null, '"')),
        t.ref`content`,
        gap(buildToken('StringContent', value)),
        t.ref`closeToken`,
        gap(buildToken(null, '"')),
        t.nodeClose(),
      ],
      { expressions },
    );
  }

  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    (function* () {
      yield t.nodeOpen(t.nodeFlags, 'String');
      yield t.ref`openToken`;
      const tok = buildToken(null, "'");
      yield gap(tok);
      yield t.ref`content`;
      yield t.nodeOpen(t.tokenFlags, 'StringContent');

      for (const piece of pieces) {
        if (isString(piece)) {
          const value = piece;

          for (const chr of value) {
            if (
              chr === '\\' ||
              chr === "'" ||
              chr === '\n' ||
              chr === '\r' ||
              chr === '\t' ||
              chr === '\0' ||
              chr.charCodeAt(0) < 32
            ) {
              if (lit) {
                yield agastBuildLiteralTag(lit);
                lit = '';
              }

              let value;

              if (escapables[chr]) {
                const expressions = [];
                const gap = buildFilledGapFunction(expressions);

                value = treeFromStream(
                  [
                    t.nodeOpen(t.nodeFlags, 'EscapeCode'),
                    t.ref`sigilToken`,
                    gap(buildKeyword(escapables[chr])),
                    t.nodeClose(),
                  ],
                  { expressions },
                );
              } else if (chr.charCodeAt(0) < 32) {
                const hexDigits = chr.charCodeAt(0).toString(16).padStart(4, '0');
                const expressions = [];
                const gap = buildFilledGapFunction(expressions);

                value = treeFromStream(
                  [
                    t.nodeOpen(t.nodeFlags, 'EscapeCode'),
                    t.ref`sigilToken`,
                    gap(buildKeyword('u')),
                    [...hexDigits].flatMap((digit) => [t.ref`digits[]`, gap(buildDigit(digit))]),
                    t.nodeClose(),
                  ],
                  { expressions },
                );
              } else {
                value = buildKeyword(chr);
              }

              yield t.ref`@`;
              yield t.nodeOpen(t.nodeFlags, 'EscapeSequence', null, { cooked: chr });
              yield t.ref`escape`;
              yield gap(buildToken(null, '\\'));
              yield t.ref`value`;
              yield gap(value);
              yield t.nodeClose();
            } else {
              lit += chr;
            }
          }
        } else {
          yield agastBuildLiteralTag(lit);
          lit = '';

          if (piece == null) {
            throw new Error('not implemented');
          } else if (isString(piece.type)) {
            yield piece;
          } else {
            throw new Error();
          }
        }
      }

      if (lit) yield agastBuildLiteralTag(lit);
      lit = '';

      yield t.nodeClose();
      yield t.ref`closeToken`;
      yield gap(buildToken(null, "'"));
      yield t.nodeClose();
    })(),
    { expressions },
  );
};

export const buildBoolean = (value) => {
  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    [
      t.nodeOpen(t.nodeFlags, 'Boolean'),
      t.ref`sigilToken`,
      gap(buildToken(null, value ? 'true' : 'false')),
      t.nodeClose(),
    ],
    { expressions },
  );
};

export const buildNull = () => {
  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    [
      t.nodeOpen(t.nodeFlags, 'Null'),
      t.ref`sigilToken`,
      gap(buildToken(null, 'null')),
      t.nodeClose(),
    ],
    { expressions },
  );
};

export const buildUndefined = () => {
  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    [
      t.nodeOpen(t.nodeFlags, 'Undefined'),
      t.ref`sigilToken`,
      gap(buildToken(null, 'undefined')),
      t.nodeClose(),
    ],
    { expressions },
  );
};

export const buildNullTag = () => {
  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    [
      t.nodeOpen(t.nodeFlags, 'NullTag'),
      t.ref`sigilToken`,
      gap(buildToken(null, 'null')),
      t.nodeClose(),
    ],
    { expressions },
  );
};

export const buildArray = (elements) => {
  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    (function* () {
      yield t.nodeOpen(t.nodeFlags, 'Array');
      yield t.ref`openToken`;
      yield gap(buildToken(null, '['));
      yield* interpolateFragment(
        isArray(elements) ? buildArrayElements(elements) : elements,
        t.ref`elements[]`,
        expressions,
      );
      yield t.ref`closeToken`;
      yield gap(buildToken(null, ']'));
      yield t.nodeClose();
    })(),
    { expressions },
  );
};

export const buildArrayElements = (values) => {
  const expressions = [];
  return treeFromStream(
    (function* () {
      yield t.fragOpen();
      yield* buildSeparatedList(',', values, t.ref`elements[]`, expressions);
      yield t.nodeClose();
    })(),
    { expressions },
  );
};

export function* buildSeparatedList(separator, values, ref, expressions) {
  const gap = buildFilledGapFunction(expressions);

  if (!ref.value.isArray) throw new Error();

  let first = true;
  for (const value of values) {
    if (!first) {
      yield t.buildReferenceTag('#', 'separatorTokens');
      yield gap(buildToken(null, separator));
    }
    yield freeze({ ...ref });
    yield gap(value || buildNullNode());
    first = false;
  }
}

export const buildObjectProperties = (properties) => {
  const expressions = [];

  return treeFromStream(
    concat(
      [t.doctype({ 'bablr-lang': l.Instruction }), t.fragOpen(t.nodeFlags)],
      buildSeparatedList(',', properties, t.ref`properties[]`, expressions),
      [t.nodeClose()],
    ),
    { expressions },
  );
};

export const buildObject = (properties) => {
  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    (function* () {
      yield t.nodeOpen(t.nodeFlags, 'Object');
      yield t.ref`openToken`;
      yield gap(buildToken(null, '{'));

      yield* interpolateFragment(
        isArray(properties) ? buildObjectProperties(properties) : properties,
        t.ref`properties[]`,
        expressions,
      );

      yield t.ref`closeToken`;
      yield gap(buildToken(null, '}'));
      yield t.nodeClose();
    })(),
    { expressions },
  );
};

export const buildPattern = (alternatives, flags) => {
  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    (function* () {
      yield t.nodeOpen(t.nodeFlags, 'Pattern');
      yield t.ref`openToken`;
      yield gap(buildToken(null, '/'));

      yield* interpolateFragment(alternatives, t.ref`alternatives[]`, expressions);

      yield t.ref`closeToken`;
      yield gap(buildToken(null, '/'));
      yield t.ref`flags`;
      yield gap(flags || buildRegexFlags());
      yield t.nodeClose();
    })(),
    { expressions },
  );
};

export const buildRegexGroup = (alternatives, flags) => {
  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    (function* () {
      yield t.nodeOpen(t.nodeFlags, 'Group');
      yield t.ref`openToken`;
      yield gap(buildToken(null, '(?:'));

      yield* interpolateFragment(alternatives, t.ref`alternatives[]`, expressions);

      yield t.ref`closeToken`;
      yield gap(buildToken(null, ')'));
      yield t.ref`flags`;
      yield gap(flags || buildReferenceFlags());
      yield t.nodeClose();
    })(),
    { expressions },
  );
};

const flagCharacters = {
  global: 'g',
  ignoreCase: 'i',
  multiline: 'm',
  dotAll: 's',
  unicode: 'u',
  sticky: 'y',
};

export const buildRegexFlags = (flags = '') => {
  let expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    (function* () {
      yield t.nodeOpen(t.nodeFlags, 'Flags');

      for (const { 0: name, 1: chr } of Object.entries(flagCharacters)) {
        yield t.buildReferenceTag(null, name + 'Token');

        yield gap(flags.includes(chr) ? buildToken(null, chr) : buildNullNode());
      }
      yield t.nodeClose();
    })(),
    { expressions },
  );
};

export const buildAlternative = (elements) => {
  const expressions = [];

  return treeFromStream(
    concat(
      [t.nodeOpen(t.nodeFlags, 'Alternative')],
      interpolateFragment(elements, t.ref`elements[]+`, expressions),
      [t.nodeClose()],
    ),
    { expressions },
  );
};

export const buildAlternatives = (alternatives = []) => {
  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    (function* () {
      yield t.fragOpen();

      yield* alternatives
        .flatMap((alt) => [
          t.ref`alternatives[]`,
          gap(alt),
          t.ref`#separatorTokens`,
          gap(buildPunctuator('|')),
        ])
        .slice(0, -2);

      yield t.nodeClose();
    })(),
    { expressions },
  );
};

export const buildRegexGap = () => {
  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    [
      t.nodeOpen(t.nodeFlags, 'Gap'),
      t.ref`escapeToken`,
      gap(buildToken(null, '\\')),
      t.ref`value`,
      gap(buildToken(null, 'g')),
      t.nodeClose(),
    ],
    { expressions },
  );
};

export const buildElements = (elements) => {
  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    concat(
      [t.doctype({ 'bablr-lang': l.Instruction }), t.fragOpen()],
      elements.flatMap((el) => [t.ref`elements[]+`, gap(el)]),
      [t.nodeClose()],
    ),
    { expressions },
  );
};

export const buildCharacterClass = (elements, negate = false) => {
  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    (function* () {
      yield t.nodeOpen(t.nodeFlags, 'CharacterClass', null, { negate });
      yield t.ref`openToken`;
      yield gap(buildToken(null, '['));

      yield* interpolateFragment(elements, t.ref`elements[]`, expressions);
      yield t.ref`closeToken`;
      yield gap(buildToken(null, ']'));
      yield t.nodeClose();
    })(),
    { expressions },
  );
};

export const buildJSExpressionDeep = (expr) => {
  if (expr === null) {
    return buildNull();
  } else if (expr === undefined) {
    return buildUndefined();
  }

  switch (typeof expr) {
    case 'boolean':
      return buildBoolean(expr);

    case 'string':
      return buildString(expr);

    case 'number':
      return buildInteger(expr);

    case 'object': {
      switch (Object.getPrototypeOf(expr)) {
        case Array.prototype:
          return buildArray(buildArrayElements(expr.map((e) => buildJSExpressionDeep(e))));

        case Object.prototype:
          return buildObject(
            buildObjectProperties(
              Object.entries(expr).map((e) =>
                buildProperty(
                  /^[a-zA-Z_]+$/.test(e[0]) ? buildIdentifier(e[0]) : buildString(e[0]),
                  buildJSExpressionDeep(e[1]),
                ),
              ),
            ),
          );

        default:
          throw new Error();
      }
    }

    default:
      throw new Error();
  }
};

export const buildTaggedString = (tag, content) => {
  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    [
      t.buildOpenNodeTag(t.nodeFlags, 'SpamexString'),
      t.buildReferenceTag('sigilToken'),
      gap(buildToken(null, tag)),
      t.buildReferenceTag('openToken'),
      gap(buildToken(null, "'")),
      t.buildReferenceTag('content'),
      gap(content),
      t.buildReferenceTag('closeToken'),
      gap(buildToken(null, "'")),
      t.buildCloseNodeTag(),
    ],
    { expressions },
  );
};

export const buildSpamexString = (content) => {
  return buildTaggedString('m', content);
};

export const buildRegexString = (content) => {
  return buildTaggedString('re', content);
};

export const buildGapNodeMatcher = () => {
  return buildToken('GapNodeMatcher', '<//>');
};
