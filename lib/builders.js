import { re } from '@bablr/boot';
import { interpolateFragment } from '@bablr/agast-helpers/template';
import { isEmpty, treeFromStreamSync as treeFromStream } from '@bablr/agast-helpers/tree';
import { buildLiteralTag as agastBuildLiteralTag } from '@bablr/agast-helpers/builders';
import * as t from '@bablr/agast-helpers/shorthand';
import * as Tags from '@bablr/agast-helpers/tags';
import * as l from '@bablr/agast-vm-helpers/languages';
import { concat } from '@bablr/agast-vm-helpers/iterable';
import { buildNullNode, getRoot } from '@bablr/agast-helpers/path';
import {
  BindingTag,
  CloseNodeTag,
  LiteralTag,
  OpenNodeTag,
  ReferenceTag,
  Object as Object_,
  Regex,
  Matcher,
  Tag,
  ShiftTag,
  AttributeDefinition,
  GapTag,
  NullTag,
  DoctypeTag,
} from './symbols.js';

let { freeze } = Object;
let { isArray } = Array;

let when = (condition, value) => (condition ? value : { *[Symbol.iterator]() {} });

let isString = (val) => typeof val === 'string';

let wrapNull = (val) => (val == null ? buildNullNode() : val);

export const buildTag = (tag) => {
  switch (tag.type) {
    case DoctypeTag: {
      let { version, attributes } = tag.value;
      return buildDoctypeTag(version, buildJSExpressionDeep(attributes));
    }
    case ReferenceTag: {
      let { type, name, flags } = tag.value;
      return buildReferenceTag(type, name, flags);
    }
    case OpenNodeTag: {
      let { type, name, flags, literalValue, attributes, selfClosing } = tag.value;
      return buildOpenNodeTag(
        flags,
        type && buildToken(null, type.description),
        name && buildIdentifier(name.description),
        literalValue && buildString(literalValue),
        attributes && Object.keys(attributes).length ? buildJSExpressionDeep(attributes) : null,
        selfClosing,
      );
    }
    case CloseNodeTag: {
      return buildCloseNodeTag();
    }
    case LiteralTag: {
      return buildLiteralTag(buildString(tag.value));
    }
    case BindingTag: {
      let { segments } = tag.value;
      return buildBindingTag(segments);
    }
    case AttributeDefinition: {
      let { path, value } = tag.value;
      return buildAttributeDefinition(buildIdentifierPath(path), buildJSExpressionDeep(value));
    }
    case ShiftTag:
      return buildShiftTag();

    case GapTag:
      return buildGapTag();

    case NullTag:
      return buildNullTag();

    default:
      throw new Error();
  }
};

export const buildAttributeDefinition = (path, value) => {
  return treeFromStream([
    t.nodeOpen(t.nodeFlags, 'AttributeDefinition'),
    t.ref`openToken`,
    buildToken(null, '{'),
    t.ref`#`,
    buildSpace(),
    t.ref`key`,
    wrapNull(path),
    t.ref`sigilToken`,
    buildToken(null, ':'),
    t.ref`#`,
    buildSpace(),
    t.ref`value`,
    wrapNull(value),
    t.ref`#`,
    buildSpace(),
    t.ref`closeToken`,
    buildToken(null, '}'),
    t.nodeClose(),
  ]);
};

export const buildReferenceTag = (type, name, flags = t.referenceFlags) => {
  return treeFromStream([
    t.nodeOpen(t.nodeFlags, 'ReferenceTag'),
    t.ref`type`,
    type ? buildToken(null, type) : buildNullNode(),
    t.ref`name`,
    name ? buildIdentifier(name) : buildNullNode(),
    t.ref`flags`,
    flags ? buildReferenceFlags(flags) : buildNullNode(),
    t.ref`sigilToken`,
    buildToken(null, ':'),
    t.nodeClose(),
  ]);
};

export const buildBindingMatcher = (segments) => {
  return treeFromStream(
    concat(
      [t.nodeOpen(t.nodeFlags, 'BindingMatcher')],
      segments.flatMap((segment) => [t.ref`segments[]`, buildBindingSegment(segment)]),
      [t.nodeClose()],
    ),
  );
};

export const buildBindingMatchers = (matchers) => {
  return treeFromStream(
    concat(
      [t.fragOpen()],
      matchers.flatMap((matcher) => [
        t.ref`bindingMatchers[]`,
        buildBindingMatcher(matcher.segments),
      ]),
      [t.nodeClose()],
    ),
  );
};

export const buildBoundNodeMatcher = (bindingMatchers, valueMatcher) => {
  if (valueMatcher.value.name.description === 'BoundNodeMatcher') throw new Error();

  return treeFromStream(
    (function* () {
      yield t.nodeOpen(t.nodeFlags, 'BoundNodeMatcher');
      if (bindingMatchers.length) {
        yield* interpolateFragment(buildBindingMatchers(bindingMatchers), t.ref`bindingMatchers`);
      }
      yield t.ref`nodeMatcher`;
      yield valueMatcher;
      yield t.nodeClose();
    })(),
  );
};

export const buildPropertyMatcher = (refMatcher, valueMatcher) => {
  return treeFromStream(
    (function* () {
      yield t.nodeOpen(t.nodeFlags, 'PropertyMatcher');
      yield t.ref`refMatcher`;
      yield refMatcher || buildNullNode();
      yield t.ref`valueMatcher`;
      yield valueMatcher || buildNullNode();
      yield t.nodeClose();
    })(),
  );
};

export const buildBindingSegment = (segment) => {
  let { type, name } = segment;

  return treeFromStream([
    t.nodeOpen(t.nodeFlags, 'BindingSegment'),
    t.ref`openToken`,
    buildToken(null, ':'),
    t.ref`path`,
    type ? buildToken(null, type) : buildIdentifier(name),
    t.ref`closeToken`,
    buildToken(null, ':'),
    t.nodeClose(),
  ]);
};

export const buildGapTag = () => {
  return treeFromStream([
    t.nodeOpen(t.nodeFlags, 'GapTag'),
    t.ref`sigilToken`,
    buildToken(null, '<//>'),
    t.nodeClose(),
  ]);
};

export const buildShiftTag = () => {
  return treeFromStream([
    t.nodeOpen(t.nodeFlags, 'ShiftTag'),
    t.ref`sigilToken`,
    buildToken(null, '^^^'),
    t.nodeClose(),
  ]);
};

export const buildReferenceFlags = (flags = t.referenceFlags) => {
  const { array, expression, intrinsic, hasGap } = flags;

  return treeFromStream([
    t.nodeOpen(t.nodeFlags, 'ReferenceFlags'),
    t.ref`arrayToken`,
    array ? buildToken(null, '[]') : buildNullNode(),
    t.ref`expressionToken`,
    expression ? buildToken(null, '+') : buildNullNode(),
    t.ref`intrinsicToken`,
    intrinsic ? buildToken(null, '*') : buildNullNode(),
    t.ref`hasGapToken`,
    hasGap ? buildToken(null, '$') : buildNullNode(),
    t.nodeClose(),
  ]);
};

export const buildNodeFlags = (flags = t.nodeFlags) => {
  const { token = null, hasGap = null } = flags;

  let flags_ = { token, hasGap };
  let attributes = flags_;

  return treeFromStream([
    t.nodeOpen(t.nodeFlags, 'NodeFlags', null, attributes),
    t.ref`tokenToken`,
    token ? buildToken(null, '*') : buildNullNode(),
    t.ref`hasGapToken`,
    hasGap ? buildToken(null, '$') : buildNullNode(),
    t.nodeClose(),
  ]);
};

export const buildSpamMatcher = (name = null, value = null, attributes = null) => {
  return buildTreeNodeMatcherOpen(buildNodeFlags(t.nodeFlags), null, name, value, attributes);
};

export const buildTreeNodeMatcherOpen = (flags, type, name, literalValue, attributes = null) => {
  if (!type && !name) throw new Error();

  return treeFromStream(
    (function* () {
      yield t.nodeOpen(t.nodeFlags, 'TreeNodeMatcherOpen');
      yield t.ref`openToken`;
      yield buildToken(null, '<');
      yield t.ref`flags`;
      yield wrapNull(flags);
      yield t.ref`type`;
      yield typeof type === 'string' ? buildToken(null, type) : wrapNull(type);
      yield t.ref`name`;
      yield typeof name === 'string' ? buildIdentifier(name) : wrapNull(name);

      yield* when(literalValue, [t.ref`#`, ...Tags.traverse(buildSpace().value.tags)]);

      yield t.ref`literalValue`;
      yield literalValue ? buildString(literalValue) : buildNullNode();

      if (!isEmpty(attributes)) {
        yield t.ref`#`;
        yield* buildSpace().value.tags;
        yield* interpolateFragment(attributes, t.ref`attributes[]`);
      }

      yield t.ref`selfClosingToken`;
      yield buildToken(null, '/');
      yield t.ref`closeToken`;
      yield buildToken(null, '>');
      yield t.nodeClose();
    })(),
  );
};

export const buildTreeNodeMatcher = (open, children) => {
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
      yield open;
      if (!isEmpty(children_)) {
        yield* interpolateFragment(children_, t.ref`children[]`);
      }
      yield t.nodeClose();
    })(),
  );
};

export const buildReferenceMatcher = (type = '.', name, flags) => {
  if (isString(flags)) {
    let array = flags.includes('[');
    let intrinsic = flags.includes('*');
    let hasGap = flags.includes('$');
    let expression = flags.includes('+');

    return buildReferenceMatcher(
      type,
      name,
      buildReferenceFlags({ array, intrinsic, hasGap, expression }),
    );
  }

  return treeFromStream(
    (function* () {
      yield t.nodeOpen(t.nodeFlags, 'ReferenceMatcher');
      yield t.ref`type`;
      yield type ? buildKeyword(type) : buildNullNode();
      yield t.ref`name`;
      yield name ? buildIdentifier(name) : buildNullNode();
      yield t.ref`flags`;
      yield wrapNull(flags);
      yield t.ref`sigilToken`;
      yield buildToken(null, ':');
      yield t.ref`#`;
      yield* Tags.traverse(buildSpace().value.tags);
      yield t.nodeClose();
    })(),
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

export const buildOpenNodeTag = (
  flags,
  type,
  name = null,
  literalValue,
  attributes,
  selfClosing = !literalValue,
) => {
  return treeFromStream(
    (function* () {
      yield t.nodeOpen(t.nodeFlags, 'OpenNodeTag', null, { selfClosing });
      yield t.ref`openToken`;
      yield buildPunctuator('<');
      yield t.ref`flags`;
      yield buildNodeFlags(flags);
      yield t.ref`type`;
      yield wrapNull(type);
      yield t.ref`name`;
      yield wrapNull(name);
      yield* when(!isEmpty(literalValue), [t.ref`#`, buildSpace()]);
      yield t.ref`literalValue`;
      yield wrapNull(literalValue);
      yield* when(!isEmpty(attributes), [t.ref`#`, buildSpace()]);
      yield wrapNull(attributes);
      yield* when(selfClosing, [t.ref`#`, buildSpace()]);
      yield t.ref`selfClosingToken`;
      yield selfClosing ? buildToken(null, '/') : buildNullNode();
      yield t.ref`closeToken`;
      yield buildPunctuator('>');
      yield t.nodeClose();
    })(),
  );
};

export const buildDoctypeTag = (version, attributes) => {
  return treeFromStream(
    (function* () {
      yield t.nodeOpen(t.nodeFlags, 'DoctypeTag');
      yield t.ref`openToken`;
      yield buildPunctuator('<!');
      yield t.ref`version`;
      yield buildToken('PositiveInteger', String(version));
      yield t.ref`versionSeparator`;
      yield buildPunctuator(':');
      yield t.ref`doctype`;
      yield buildKeyword('cstml');
      yield t.nodeClose();

      yield* when(!isEmpty(attributes), [t.ref`#`, ...buildSpace().value.tags]);
      yield t.ref`attributes`;
      yield wrapNull(attributes);

      yield t.ref`closeToken`;
      yield buildToken(null, '>');
    })(),
  );
};

export const buildIdentifierPath = (path) => {
  const path_ = isString(path) ? [path] : [...path];

  if (!path_.length) {
    return null;
  }

  return treeFromStream(
    (function* () {
      yield t.nodeOpen(t.nodeFlags, 'IdentifierPath');

      yield* path_
        .flatMap((segment) => [
          t.ref`segments[]`,
          !isString(segment) && segment.type
            ? buildPunctuator(segment.type)
            : buildIdentifier(isString(segment) ? segment : segment.name),
          t.ref`#separatorTokens`,
          buildToken(null, '.'),
        ])
        .slice(0, -2);

      yield t.nodeClose();
    })(),
  );
};

export const buildLanguage = (language) => {
  return language && isString(language) && language.startsWith('https://')
    ? buildString(language)
    : buildIdentifierPath(language);
};

export const buildCloseNodeTag = () => {
  return treeFromStream([
    t.nodeOpen(t.nodeFlags, 'CloseNodeTag'),
    t.ref`openToken`,
    buildToken(null, '</'),
    t.ref`closeToken`,
    buildToken(null, '>'),
    t.nodeClose(),
  ]);
};

export const buildLiteralTag = (value) => {
  return treeFromStream([
    t.nodeOpen(t.nodeFlags, 'LiteralTag'),
    t.ref`value`,
    wrapNull(value),
    t.nodeClose(),
  ]);
};

export const buildBindingTag = (segments) => {
  return treeFromStream(
    concat(
      [t.nodeOpen(t.nodeFlags, 'BindingTag')],
      segments.flatMap((segment) => [t.ref`segments[]`, buildBindingSegment(segment)]),
      [t.nodeClose()],
    ),
  );
};

export const buildSpace = () => {
  return buildToken('Space', ' ');
};

export const buildIdentifier = (name) => {
  let unquoted = /^[a-zA-Z\u{80}-\u{10ffff}][a-zA-Z0-9_\u{80}-\u{10ffff}-]*$/uy.test(name);

  if (unquoted) {
    return treeFromStream([
      t.nodeOpen(t.nodeFlags, 'Identifier'),
      t.ref`content`,
      buildIdentifierContent(name),
      t.nodeClose(),
    ]);
  } else {
    return treeFromStream(
      (function* () {
        yield t.nodeOpen(t.nodeFlags, 'Identifier');

        yield t.ref`openToken`;
        yield buildToken(null, '`');
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
            yield buildToken(null, '\\');
            yield t.ref`value`;
            yield value;
            yield t.nodeClose();
          } else {
            lit += piece;
          }
        }

        if (lit) yield agastBuildLiteralTag(lit);
        lit = '';

        yield t.nodeClose();

        yield t.ref`closeToken`;
        yield buildToken(null, '`');
        yield t.nodeClose();
      })(),
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
  return treeFromStream([
    t.nodeOpen(t.nodeFlags, 'Call'),
    t.ref`verb`,
    buildIdentifier(verb),
    t.ref`openToken`,
    buildToken(null, '('),
    ...interpolateFragment(
      buildArrayElements(args.map((e) => buildBABLRExpressionDeep(e))),
      t.ref`arguments`,
    ),
    t.ref`closeToken`,
    buildToken(null, ')'),
    t.nodeClose(),
  ]);
};

export const buildProperty = (key, value) => {
  return treeFromStream(
    (function* () {
      yield t.nodeOpen(t.nodeFlags, 'Property');
      yield t.ref`key`;
      yield key;
      yield t.ref`mapOperator`;
      yield buildToken(null, ':');
      yield t.ref`#`;
      yield buildSpace();
      yield t.ref`value`;
      yield value;
      yield t.nodeClose();
    })(),
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
  const digits = value.toString(base).split('');

  return treeFromStream(
    concat(
      [t.nodeOpen(t.nodeFlags, 'Integer')],
      digits.flatMap((digit) => [t.ref`digits[]`, buildDigit(digit)]),
      [t.nodeClose()],
    ),
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

  return treeFromStream([
    t.nodeOpen(t.nodeFlags, 'Infinity'),
    t.ref`sign`,
    buildToken(null, sign),
    t.ref`value`,
    buildToken(null, 'Infinity'),
    t.nodeClose(),
  ]);
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
    return treeFromStream([
      t.nodeOpen(t.nodeFlags, 'String'),
      t.ref`openToken`,
      buildToken(null, '"'),
      t.ref`content`,
      buildToken('StringContent', value),
      t.ref`closeToken`,
      buildToken(null, '"'),
      t.nodeClose(),
    ]);
  }

  return treeFromStream(
    (function* () {
      yield t.nodeOpen(t.nodeFlags, 'String');
      yield t.ref`openToken`;
      const tok = buildToken(null, "'");
      yield tok;
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
                value = treeFromStream([
                  t.nodeOpen(t.nodeFlags, 'EscapeCode'),
                  t.ref`sigilToken`,
                  buildKeyword(escapables[chr]),
                  t.nodeClose(),
                ]);
              } else if (chr.charCodeAt(0) < 32) {
                const hexDigits = chr.charCodeAt(0).toString(16).padStart(4, '0');

                value = treeFromStream([
                  t.nodeOpen(t.nodeFlags, 'EscapeCode'),
                  t.ref`sigilToken`,
                  buildKeyword('u'),
                  [...hexDigits].flatMap((digit) => [t.ref`digits[]`, buildDigit(digit)]),
                  t.nodeClose(),
                ]);
              } else {
                value = buildKeyword(chr);
              }

              yield t.ref`@`;
              yield t.nodeOpen(t.nodeFlags, 'EscapeSequence', null, { cooked: chr });
              yield t.ref`escape`;
              yield buildToken(null, '\\');
              yield t.ref`value`;
              yield value;
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
      yield buildToken(null, "'");
      yield t.nodeClose();
    })(),
  );
};

export const buildBoolean = (value) => {
  return treeFromStream([
    t.nodeOpen(t.nodeFlags, 'Boolean'),
    t.ref`sigilToken`,
    buildToken(null, value ? 'true' : 'false'),
    t.nodeClose(),
  ]);
};

export const buildNull = () => {
  return treeFromStream([
    t.nodeOpen(t.nodeFlags, 'Null'),
    t.ref`sigilToken`,
    buildToken(null, 'null'),
    t.nodeClose(),
  ]);
};

export const buildUndefined = () => {
  return treeFromStream([
    t.nodeOpen(t.nodeFlags, 'Undefined'),
    t.ref`sigilToken`,
    buildToken(null, 'undefined'),
    t.nodeClose(),
  ]);
};

export const buildNullTag = () => {
  return treeFromStream([
    t.nodeOpen(t.nodeFlags, 'NullTag'),
    t.ref`sigilToken`,
    buildToken(null, 'null'),
    t.nodeClose(),
  ]);
};

export const buildArray = (elements) => {
  return treeFromStream(
    (function* () {
      yield t.nodeOpen(t.nodeFlags, 'Array');
      yield t.ref`openToken`;
      yield buildToken(null, '[');
      yield* interpolateFragment(
        isArray(elements) ? buildArrayElements(elements) : elements,
        t.ref`elements[]`,
      );
      yield t.ref`closeToken`;
      yield buildToken(null, ']');
      yield t.nodeClose();
    })(),
  );
};

export const buildArrayElements = (values) => {
  return treeFromStream(
    (function* () {
      yield t.fragOpen();
      yield* buildSeparatedList(', ', values, t.ref`elements[]`);
      yield t.nodeClose();
    })(),
  );
};

export function* buildSeparatedList(separator, values, ref, expressions) {
  if (!ref.value.flags.array) throw new Error();

  let first = true;
  for (const value of values) {
    if (!first) {
      yield t.buildReferenceTag('#', 'separatorTokens');
      yield buildToken(null, separator);
    }
    yield freeze({ ...ref });
    yield value || buildNullNode();
    first = false;
  }
}

export const buildObjectProperties = (properties) => {
  return treeFromStream(
    concat(
      [t.doctype({ 'bablr-lang': l.Instruction }), t.fragOpen(t.nodeFlags)],
      buildSeparatedList(', ', properties, t.ref`properties[]`),
      [t.nodeClose()],
    ),
  );
};

export const buildObject = (properties) => {
  return treeFromStream(
    (function* () {
      yield t.nodeOpen(t.nodeFlags, 'Object');
      yield t.ref`openToken`;
      yield buildToken(null, '{');

      let isEmpty_ = isArray(properties) ? !properties.length : isEmpty(properties);

      if (!isEmpty_) {
        yield t.ref`#`;
        yield buildSpace();
      }

      yield* interpolateFragment(
        isArray(properties) ? buildObjectProperties(properties) : properties,
        t.ref`properties[]`,
      );

      if (!isEmpty_) {
        yield t.ref`#`;
        yield buildSpace();
      }

      yield t.ref`closeToken`;
      yield buildToken(null, '}');
      yield t.nodeClose();
    })(),
  );
};

export const buildPattern = (alternatives, flags) => {
  return treeFromStream(
    (function* () {
      yield t.nodeOpen(t.nodeFlags, 'Pattern');
      yield t.ref`openToken`;
      yield buildToken(null, '/');

      yield* interpolateFragment(alternatives, t.ref`alternatives[]`);

      yield t.ref`closeToken`;
      yield buildToken(null, '/');
      yield t.ref`flags`;
      yield flags ? buildRegexFlags() : buildNullNode();
      yield t.nodeClose();
    })(),
  );
};

export const buildRegexGroup = (alternatives, flags) => {
  return treeFromStream(
    (function* () {
      yield t.nodeOpen(t.nodeFlags, 'Group');
      yield t.ref`openToken`;
      yield buildToken(null, '(?:');

      yield* interpolateFragment(alternatives, t.ref`alternatives[]`);

      yield t.ref`closeToken`;
      yield buildToken(null, ')');
      yield t.ref`flags`;
      yield flags ? buildRegexFlags() : buildNullNode();
      yield t.nodeClose();
    })(),
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
  return treeFromStream(
    (function* () {
      yield t.nodeOpen(t.nodeFlags, 'Flags');

      for (const { 0: name, 1: chr } of Object.entries(flagCharacters)) {
        yield t.buildReferenceTag(null, name + 'Token');

        yield flags.includes(chr) ? buildToken(null, chr) : buildNullNode();
      }
      yield t.nodeClose();
    })(),
  );
};

export const buildAlternative = (elements) => {
  return treeFromStream(
    concat(
      [t.nodeOpen(t.nodeFlags, 'Alternative')],
      interpolateFragment(elements, t.ref`elements[]+`),
      [t.nodeClose()],
    ),
  );
};

export const buildAlternatives = (alternatives = []) => {
  return treeFromStream(
    (function* () {
      yield t.fragOpen();

      yield* alternatives
        .flatMap((alt) => [
          t.ref`alternatives[]`,
          alt,
          t.ref`#separatorTokens`,
          buildPunctuator('|'),
        ])
        .slice(0, -2);

      yield t.nodeClose();
    })(),
  );
};

export const buildRegexGap = () => {
  return treeFromStream([
    t.nodeOpen(t.nodeFlags, 'Gap'),
    t.ref`escapeToken`,
    buildToken(null, '\\'),
    t.ref`value`,
    buildToken(null, 'g'),
    t.nodeClose(),
  ]);
};

export const buildElements = (elements) => {
  return treeFromStream(
    concat(
      [t.fragOpen()],
      elements.flatMap((el) => [t.ref`elements[]+`, el]),
      [t.nodeClose()],
    ),
  );
};

export const buildCharacterClass = (elements, negate = false) => {
  return treeFromStream(
    (function* () {
      yield t.nodeOpen(t.nodeFlags, 'CharacterClass', null, { negate });
      yield t.ref`openToken`;
      yield buildToken(null, '[');

      yield* interpolateFragment(elements, t.ref`elements[]`);
      yield t.ref`closeToken`;
      yield buildToken(null, ']');
      yield t.nodeClose();
    })(),
  );
};

export const buildQuantifier = (quantifier, element, greedy = true) => {
  let min, max;
  switch (quantifier) {
    case '*':
      min = 0;
      max = Infinity;
      break;
    case '+':
      min = 1;
      max = Infinity;
      break;
    case '?':
      min = 0;
      max = 1;
      break;
    default:
      throw new Error();
  }

  return treeFromStream([
    t.nodeOpen(t.nodeFlags, 'Quantifier', null, { min, max, greedy }),
    t.ref`element+`,
    element,
    t.ref`sigilToken`,
    t.nodeOpen(t.tokenFlags, null, quantifier),
    t.nodeClose(),
  ]);
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

export const buildBABLRExpressionDeep = (expr) => {
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

    case 'symbol':
      return buildString(expr.description);

    case 'number':
      return buildInteger(expr);

    case 'object': {
      switch (Object.getPrototypeOf(expr)) {
        case Array.prototype:
          return buildArray(buildArrayElements(expr.map((e) => buildBABLRExpressionDeep(e))));

        case Object.prototype:
          switch (expr.type) {
            case Object_:
              return buildObject(
                buildObjectProperties(
                  Object.entries(expr.value).map((e) =>
                    buildProperty(
                      /^[a-zA-Z_]+$/.test(e[0]) ? buildIdentifier(e[0]) : buildString(e[0]),
                      buildBABLRExpressionDeep(e[1]),
                    ),
                  ),
                ),
              );
            case Tag:
              return buildTagString(buildTag(expr.value));
            case Regex:
              return buildRegexString(expr.value);
            case Matcher:
              return buildSpamexString(expr.value);
            default:
              throw new Error();
          }

        default:
          throw new Error();
      }
    }

    default:
      throw new Error();
  }
};

export const buildTaggedString = (tag, type, content) => {
  return treeFromStream([
    t.buildOpenNodeTag(t.nodeFlags, type),
    t.ref`sigilToken`,
    buildToken(null, tag),
    t.ref`openToken`,
    buildToken(null, '`'),
    t.ref`content`,
    content,
    t.ref`closeToken`,
    buildToken(null, '`'),
    t.buildCloseNodeTag(),
  ]);
};

export const buildSpamexString = (content) => {
  return buildTaggedString('m', 'SpamexString', content);
};

export const buildTagString = (content) => {
  return buildTaggedString('t', 'TagString', content);
};

export const buildRegexString = (content) => {
  return buildTaggedString('re', 'RegexString', content);
};

export const buildGapNodeMatcher = () => {
  return buildToken('GapNodeMatcher', '<//>');
};

// problem: the concrete syntax is only right in some contexts (spans)
const escaped = {
  '\\': re.Character`\\`,
  '/': re.Character`\/`,
  '(': re.Character`\(`,
  ')': re.Character`\)`,
  '[': re.Character`\[`,
  ']': re.Character`\]`,
  '{': re.Character`\{`,
  '}': re.Character`\}`,
  '+': re.Character`\+`,
  '*': re.Character`\*`,
  '<': re.Character`\<`,
  '>': re.Character`\>`,
  '^': re.Character`\^`,
  '|': re.Character`\|`,
};

export const buildLiteralElements = (chrs) => {
  return buildElements(
    [...chrs].map((chr) => {
      if ('\\/(){}[]+*^$?|<>'.includes(chr)) {
        return getRoot(escaped[chr]);
      } else {
        return getRoot(
          re.Character({
            raw: [chr],
          }),
        );
      }
    }),
  );
};

export const buildEnterProductionLine = (name) => {
  return treeFromStream([
    t.nodeOpen(t.nodeFlags, 'EnterProductionLine'),
    t.ref`sigilToken`,
    buildToken(null, '-->'),
    t.ref`#`,
    buildToken(null, ' '),
    t.ref`name`,
    buildIdentifier(name),
    t.ref`#`,
    buildToken(null, '\n'),
    t.nodeClose(),
  ]);
};

export const buildLeaveProductionLine = (name, failed) => {
  return treeFromStream([
    t.nodeOpen(t.nodeFlags, 'LeaveProductionLine'),
    t.ref`sigilToken`,
    buildToken(null, failed ? 'x--' : '<--'),
    t.ref`#`,
    buildToken(null, ' '),
    t.ref`name`,
    buildIdentifier(name),
    t.ref`#`,
    buildToken(null, '\n'),
    t.nodeClose(),
  ]);
};

export const buildExecInstructionLine = (instr, inner) => {
  return treeFromStream([
    t.nodeOpen(t.nodeFlags, 'ExecInstructionLine'),
    t.ref`sigilToken`,
    buildToken(null, inner ? '    >>>' : '>>>'),
    t.ref`#`,
    buildToken(null, ' '),
    t.ref`instr`,
    instr,
    t.ref`#`,
    buildToken(null, '\n'),
    t.nodeClose(),
  ]);
};
