// import { i } from '@bablr/boot/shorthand.macro';
import { interpolateFragment, buildFilledGapFunction } from '@bablr/agast-helpers/template';
import {
  buildNullNode,
  getRoot,
  getRootArray,
  isNull,
  treeFromStreamSync as treeFromStream,
} from '@bablr/agast-helpers/tree';
import { buildLiteralTag as agastBuildLiteralTag } from '@bablr/agast-helpers/builders';
import * as t from '@bablr/agast-helpers/shorthand';
import * as sumtree from '@bablr/agast-helpers/sumtree';
import * as l from '@bablr/agast-vm-helpers/languages';
import { concat } from '@bablr/agast-vm-helpers/iterable';

const { getPrototypeOf, freeze, hasOwn } = Object;
const { isArray } = Array;

const when = (condition, value) => (condition ? value : { *[Symbol.iterator]() {} });

const isString = (val) => typeof val === 'string';

export const buildReferenceTag = (
  name,
  isArray = false,
  flags = t.referenceFlags,
  index = null,
) => {
  let expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    [
      t.nodeOpen(t.nodeFlags, 'ReferenceTag'),
      t.ref`name`,
      gap(name ? buildIdentifier(name) : buildNullNode()),
      t.ref`openIndexToken`,
      gap(isArray ? buildToken('Punctuator', '[') : buildNullNode()),
      t.ref`index`,
      gap(index || buildNullNode()),
      t.ref`closeIndexToken`,
      gap(isArray ? buildToken('Punctuator', ']') : buildNullNode()),
      t.ref`flags`,
      gap(flags ? buildReferenceFlags(flags) : buildNullNode()),
      t.ref`sigilToken`,
      gap(buildToken('Punctuator', ':')),
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
      t.nodeOpen(t.nodeFlags, 'ShiftTag'),
      t.ref`sigilToken`,
      gap(buildToken('Punctuator', '<//>')),
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
      gap(buildToken('Punctuator', '^^^')),
      t.nodeClose(),
    ],
    { expressions },
  );
};

export const buildReferenceFlags = (flags = t.referenceFlags) => {
  const { expression = null, hasGap = null } = flags;
  let expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    [
      t.nodeOpen(t.nodeFlags, 'ReferenceFlags'),
      t.ref`expressionToken`,
      gap(expression ? buildToken('Punctuator', '+') : buildNullNode()),
      t.ref`hasGapToken`,
      gap(hasGap ? buildToken('Punctuator', '$') : buildNullNode()),
      t.nodeClose(),
    ],
    { expressions },
  );
};

export const buildNodeFlags = (flags = t.nodeFlags) => {
  const { token = null, hasGap = null, fragment = null, cover = null } = flags;
  let expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    [
      t.nodeOpen(t.nodeFlags, 'NodeFlags'),
      t.ref`tokenToken`,
      gap(token ? buildToken('Punctuator', '*') : buildNullNode()),
      t.ref`hasGapToken`,
      gap(hasGap ? buildToken('Punctuator', '$') : buildNullNode()),
      t.ref`fragmentToken`,
      gap(fragment ? buildToken('Punctuator', '_') : buildNullNode()),
      t.ref`coverFragmentToken`,
      gap(cover ? buildToken('Punctuator', '_') : buildNullNode()),
      t.nodeClose(),
    ],
    { expressions },
  );
};

export const buildSpamMatcher = (type = null, value = null, attributes = null) => {
  return buildOpenNodeMatcher(buildNodeFlags(t.nodeFlags), null, type, value, attributes);
};

export const buildOpenNodeMatcher = (flags, type, intrinsicValue, attributes = null) => {
  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

  let language_;

  if (!type) throw new Error();

  return treeFromStream(
    (function* () {
      yield t.nodeOpen(t.nodeFlags, 'OpenNodeMatcher');
      yield t.ref`openToken`;
      yield gap(buildToken('Punctuator', '<'));
      yield t.ref`flags`;
      yield gap(flags);
      yield t.ref`type`;
      yield gap(typeof type === 'string' ? buildIdentifier(type) : type);

      yield* when(intrinsicValue, [t.ref`#`, ...buildSpace().children]);

      yield t.ref`intrinsicValue`;
      yield gap(intrinsicValue ? buildString(intrinsicValue) : buildNullNode());

      let rootArr = getRootArray(attributes);

      if (rootArr.length) {
        yield t.ref`#`;
        yield* buildSpace().children;
        yield* interpolateFragment(attributes, t.ref`attributes[]`, expressions);
      }

      yield t.ref`selfClosingTagToken`;
      yield gap(buildToken('Punctuator', '/'));
      yield t.ref`closeToken`;
      yield gap(buildToken('Punctuator', '>'));
      yield t.nodeClose();
    })(),
    { expressions },
  );
};

export const buildBasicNodeMatcher = (open) => {
  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    [t.nodeOpen(t.nodeFlags, 'BasicNodeMatcher'), t.ref`open`, gap(open), t.nodeClose()],
    { expressions },
  );
};

export const buildReferenceMatcher = (type, name, isArray, flags) => {
  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

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
          yield gap(buildToken('Punctuator', '['));
          yield t.ref`closeIndexToken`;
          yield gap(buildToken('Punctuator', ']'));
        }
      })();
      yield t.ref`flags`;
      yield gap(flags);
      yield t.ref`sigilToken`;
      yield gap(buildToken('Punctuator', ':'));
      yield t.ref`#`;
      yield* sumtree.traverse(buildSpace().children);
      yield t.nodeClose();
    })(),
    { expressions },
  );
};

export const buildFragmentMatcher = (flags = buildNodeFlags({ fragment: true })) => {
  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

  if (!flags) throw new Error();

  return treeFromStream(
    (function* () {
      yield t.nodeOpen(t.nodeFlags, 'FragmentMatcher');
      yield t.ref`openToken`;
      yield gap(buildToken('Punctuator', '<'));
      yield t.ref`flags`;
      yield gap(flags);
      yield t.ref`closeToken`;
      yield gap(buildToken('Punctuator', '/>'));
      yield t.nodeClose();
    })(),
    { expressions },
  );
};

export const buildToken = (type, value, attributes = {}) => {
  return treeFromStream([t.nodeOpen(t.tokenFlags, type, attributes), t.lit(value), t.nodeClose()]);
};

export const buildPunctuator = (value, attributes = {}) => {
  return buildToken('Punctuator', value, attributes);
};

export const buildOpenNodeTag = (flags, type = null, attributes) => {
  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    (function* () {
      yield t.ref`openToken`;
      yield gap(buildPunctuator('<'));
      yield t.ref`flags`;
      yield gap(buildNodeFlags(flags));
      yield t.ref`type`;
      yield gap(type ? buildIdentifier(type) : buildNullNode());
      let rootArr = getRootArray(attributes);
      yield* when(rootArr.length, [t.ref`#`, gap(buildSpace())]);
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
      yield gap(buildPunctuator('Punctuator', '<!'));
      yield t.ref`version`;
      yield gap(buildToken('PositiveInteger', '0'));
      yield t.ref`versionSeparator`;
      yield gap(buildPunctuator('Punctuator', ':'));
      yield t.ref`doctype`;
      yield gap(buildKeyword('cstml'));
      yield t.nodeClose();

      yield* when(getRootArray(attributes).length, [t.ref`#`, ...buildSpace().children]);
      yield* interpolateFragment(attributes, t.ref`attributes[]`, expressions);

      yield t.ref`closeToken`;
      yield gap(buildToken('Punctuator', '>'));
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
      yield t.ref`segments[]`;
      yield t.arr();
      yield t.ref`separatorTokens[]`;
      yield t.arr();

      yield* path_
        .flatMap((name) => [
          t.ref`segments[]`,
          gap(buildIdentifier(name)),
          t.ref`separatorTokens[]`,
          gap(buildToken('Punctuator', '.')),
        ])
        .slice(0, -1);

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
      gap(buildToken('Punctuator', '</')),
      t.ref`closeToken`,
      gap(buildToken('Punctuator', '>')),
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
  const { attributes, value } = matcher.properties;

  return buildObject({ value, attributes });
};

export const buildSpace = () => {
  return buildToken('Space', ' ');
};

export const buildIdentifier = (name) => {
  if (!/^[a-zA-Z_]+$/.test(name)) throw new Error();

  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    [
      t.nodeOpen(t.nodeFlags, 'Identifier'),
      t.ref`content`,
      gap(buildIdentifierContent(name)),
      t.nodeClose(),
    ],
    { expressions },
  );
};

export const buildIdentifierContent = (value) => {
  return buildToken('IdentifierContent', value);
};

export const buildKeyword = (name) => {
  return buildToken('Keyword', name);
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
      yield gap(buildToken('Punctuator', ':'));
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
      [t.nodeOpen(t.nodeFlags, 'Integer'), t.ref`digits[]`, t.arr()],
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
      gap(buildToken('Punctuator', sign)),
      t.ref`value`,
      gap(buildToken('Keyword', 'Infinity')),
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
        gap(buildToken('Punctuator', '"')),
        t.ref`content`,
        gap(buildToken('StringContent', value)),
        t.ref`closeToken`,
        gap(buildToken('Punctuator', '"')),
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
      const tok = buildToken('Punctuator', "'");
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
                    t.ref`digits[]`,
                    t.arr(),
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
                    t.ref`digits[]`,
                    t.arr(),
                    [...hexDigits].flatMap((digit) => [t.ref`digits[]`, gap(buildDigit(digit))]),
                    t.nodeClose(),
                  ],
                  { expressions },
                );
              } else {
                value = buildKeyword(chr);
              }

              yield t.ref`@`;
              yield t.nodeOpen(t.nodeFlags, 'EscapeSequence', { cooked: chr });
              yield t.ref`escape`;
              yield gap(buildToken('Punctuator', '\\'));
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
      yield gap(buildToken('Punctuator', "'"));
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
      gap(buildToken('Keyword', value ? 'true' : 'false')),
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
      gap(buildToken('Keyword', 'null')),
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
      gap(buildToken('Keyword', 'null')),
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
      yield gap(buildToken('Punctuator', '['));
      yield* interpolateFragment(elements, t.ref`elements[]`, expressions);
      yield t.ref`closeToken`;
      yield gap(buildToken('Punctuator', ']'));
      yield t.nodeClose();
    })(),
    { expressions },
  );
};

export const buildArrayElements = (values) => {
  const expressions = [];
  return treeFromStream(
    (function* () {
      yield t.doctype({ bablrLanguage: l.Instruction });
      yield t.nodeOpen(t.nodeFlags);
      yield* buildSpaceSeparatedList(values, t.ref`.[]`, expressions);
      yield t.nodeClose();
    })(),
    { expressions },
  );
};

export function* buildSpaceSeparatedList(values, ref, expressions) {
  const gap = buildFilledGapFunction(expressions);

  if (!ref.value.isArray) throw new Error();

  yield freeze({ ...ref });
  yield t.arr();

  let first = true;
  for (const value of values) {
    if (!first) {
      yield t.buildReferenceTag('#');
      yield gap(buildSpace());
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
      [t.doctype({ bablrLanguage: l.Instruction }), t.nodeOpen(t.nodeFlags)],
      buildSpaceSeparatedList(properties, t.ref`properties[]`, expressions),
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
      yield gap(buildToken('Punctuator', '{'));

      yield* interpolateFragment(properties, t.ref`properties[]`, expressions);

      yield t.ref`closeToken`;
      yield gap(buildToken('Punctuator', '}'));
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
      yield gap(buildToken('Punctuator', '/'));

      yield* interpolateFragment(alternatives, t.ref`alternatives[]`, expressions);

      yield t.ref`closeToken`;
      yield gap(buildToken('Punctuator', '/'));
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
        yield t.buildReferenceTag(name + 'Token');

        yield gap(flags.includes(chr) ? buildToken('Punctuator', chr) : buildNullNode());
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
      yield t.doctype({ bablrLanguage: l.Instruction });
      yield t.nodeOpen(t.nodeFlags);
      yield t.ref`.[]`;
      yield t.arr();
      yield t.ref`separatorTokens[]`;
      yield t.arr();

      yield* alternatives
        .flatMap((alt) => [
          t.ref`.[]`,
          gap(alt),
          t.ref`separatorTokens[]`,
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
      gap(buildToken('Punctuator', '\\')),
      t.ref`value`,
      gap(buildToken('Keyword', 'g')),
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
      [t.doctype({ bablrLanguage: l.Instruction }), t.nodeOpen(t.nodeFlags), t.ref`.[]+`, t.arr()],
      elements.flatMap((el) => [t.ref`.[]+`, gap(el)]),
      [t.nodeClose()],
    ),
    { expressions },
  );
};

export const buildExpression = (expr) => {
  throw new Error('unimplemented');

  if (isNull(expr)) return buildNullTag();

  switch (typeof expr) {
    case 'symbol':
    case 'boolean':
      return buildBoolean(expr);
    case 'string':
      return buildString(expr);
    case 'number':
      return buildInteger(expr);
    case 'object': {
      switch (getPrototypeOf(expr)) {
        case Array.prototype:
          return buildArray(buildArrayElements(expr));
        case Object.prototype:
          if (
            hasOwn(expr, 'type') &&
            hasOwn(expr, 'language') &&
            hasOwn(expr, 'children') &&
            hasOwn(expr, 'properties')
          ) {
            return expr;
          }
          return buildObject(
            buildObjectProperties(
              Object.entries(expr).map((e) => buildProperty(buildIdentifier(e[0]), e[1])),
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
      gap(buildToken('Keyword', tag)),
      t.buildReferenceTag('openToken'),
      gap(buildToken('Punctuator', "'")),
      t.buildReferenceTag('content'),
      gap(content),
      t.buildReferenceTag('closeToken'),
      gap(buildToken('Punctuator', "'")),
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

export const buildPropertyMatcher = (refMatcher, bindingMatcher, nodeMatcher) => {
  const expressions = [];
  const gap = buildFilledGapFunction(expressions);

  return treeFromStream(
    [
      t.nodeOpen(t.nodeFlags, 'PropertyMatcher'),
      t.ref`refMatcher`,
      gap(refMatcher || buildNullNode()),
      t.ref`bindingMatcher`,
      gap(bindingMatcher || buildNullNode()),
      t.ref`nodeMatcher`,
      gap(nodeMatcher),
      t.nodeClose(),
    ],
    { expressions },
  );
};

export const buildGapNodeMatcher = () => {
  return buildToken('GapNodeMatcher', '<//>');
};
