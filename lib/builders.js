import { re } from '@bablr/boot';
import { interpolateFragment } from '@bablr/agast-helpers/template';
import { isEmpty, treeFromStream } from '@bablr/agast-helpers/tree';
import { buildLiteralTag as agastBuildLiteralTag, parseTag } from '@bablr/agast-helpers/builders';
import * as t from '@bablr/agast-helpers/shorthand';
import * as Tags from '@bablr/agast-helpers/tags';
import { concat } from '@bablr/agast-vm-helpers/iterable';
import { buildNullNode, getRoot } from '@bablr/agast-helpers/path';
import { printTag } from '@bablr/agast-helpers/print';
import {
  BindingTag,
  CloseNodeTag,
  LiteralTag,
  OpenNodeTag,
  ReferenceTag,
  Object as Object_,
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
  let tag_ = parseTag(tag);
  switch (tag_.type) {
    case DoctypeTag: {
      let { version, attributes } = tag_.value;
      return buildDoctypeTag(version, buildJSExpressionDeep(attributes));
    }
    case ReferenceTag: {
      let { type, name, flags } = tag_.value;
      return buildReferenceTag(type, name, flags);
    }
    case OpenNodeTag: {
      let { type, name, flags, literalValue, attributes, selfClosing } = tag_.value;
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
      return buildLiteralTag(buildString(tag_.value));
    }
    case BindingTag: {
      let { segments } = tag_.value;
      return buildBindingTag(segments);
    }
    case AttributeDefinition: {
      let { path, value } = tag_.value;
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
    '<AttributeDefinition>',
    'openToken:',
    '<* "{" />',
    '#:',
    buildSpace(),
    'key:',
    wrapNull(path),
    'sigilToken:',
    '<* ":" />',
    '#:',
    buildSpace(),
    'value:',
    wrapNull(value),
    '#:',
    buildSpace(),
    'closeToken:',
    '<* "}" />',
    '</>',
  ]);
};

export const buildReferenceTag = (type, name, flags = t.referenceFlags) => {
  return treeFromStream([
    '<ReferenceTag>',
    'type:',
    type ? buildToken(null, type) : buildNullNode(),
    'name:',
    name ? buildIdentifier(name) : buildNullNode(),
    'flags:',
    flags ? buildReferenceFlags(flags) : buildNullNode(),
    'sigilToken:',
    '<* ":" />',
    '</>',
  ]);
};

export const buildBindingMatcher = (segments) => {
  return treeFromStream(
    concat(
      ['<BindingMatcher>'],
      segments.flatMap((segment) => ['segments[]:', buildBindingSegment(segment)]),
      ['</>'],
    ),
  );
};

export const buildBindingMatchers = (matchers) => {
  return treeFromStream(
    concat(
      ['<__>'],
      matchers.flatMap((matcher) => ['bindingMatchers[]:', buildBindingMatcher(matcher.segments)]),
      ['</>'],
    ),
  );
};

export const buildBoundNodeMatcher = (bindingMatchers, valueMatcher) => {
  if (valueMatcher.value.name.description === 'BoundNodeMatcher') throw new Error();

  return treeFromStream(
    (function* () {
      yield '<BoundNodeMatcher>';
      if (bindingMatchers.length) {
        yield* interpolateFragment(buildBindingMatchers(bindingMatchers));
      }
      yield 'nodeMatcher:';
      yield valueMatcher;
      yield '</>';
    })(),
  );
};

export const buildPropertyMatcher = (refMatcher, valueMatcher) => {
  return treeFromStream(
    (function* () {
      yield '<PropertyMatcher>';
      yield 'refMatcher:';
      yield refMatcher || buildNullNode();
      yield 'valueMatcher:';
      yield valueMatcher || buildNullNode();
      yield '</>';
    })(),
  );
};

export const buildBindingSegment = (segment) => {
  let { type, name } = segment;

  return treeFromStream([
    '<BindingSegment>',
    'openToken:',
    '<* ":" />',
    'path:',
    type ? buildToken(null, type) : buildIdentifier(name),
    'closeToken:',
    '<* ":" />',
    '</>',
  ]);
};

export const buildGapTag = () => {
  return treeFromStream(['<GapTag>', 'sigilToken:', '<* "<//>" />', '</>']);
};

export const buildShiftTag = () => {
  return treeFromStream(['<ShiftTag>', 'sigilToken:', '<* "^^^" />', '</>']);
};

export const buildReferenceFlags = (flags = t.referenceFlags) => {
  const { array, expression, intrinsic, hasGap } = flags;

  return treeFromStream([
    '<ReferenceFlags>',
    'arrayToken:',
    array ? '<* "[]" />' : buildNullNode(),
    'expressionToken:',
    expression ? '<* "+" />' : buildNullNode(),
    'intrinsicToken:',
    intrinsic ? '<* "*" />' : buildNullNode(),
    'hasGapToken:',
    hasGap ? '<* "$" />' : buildNullNode(),
    '</>',
  ]);
};

export const buildNodeFlags = (flags = t.nodeFlags) => {
  const { token = null, hasGap = null } = flags;

  let flags_ = { token, hasGap };
  let attributes = flags_;

  return treeFromStream([
    `<NodeFlags ${JSON.stringify(attributes)}>`,
    'tokenToken:',
    token ? '<* "*" />' : buildNullNode(),
    'hasGapToken:',
    hasGap ? '<* "$" />' : buildNullNode(),
    '</>',
  ]);
};

export const buildSpamMatcher = (name = null, value = null, attributes = null) => {
  return buildTreeNodeMatcherOpen(buildNodeFlags(t.nodeFlags), null, name, value, attributes);
};

export const buildTreeNodeMatcherOpen = (flags, type, name, literalValue, attributes = null) => {
  if (!type && !name) throw new Error();

  return treeFromStream(
    (function* () {
      yield '<TreeNodeMatcherOpen>';
      yield 'openToken:';
      yield '<* "<" />';
      yield 'flags:';
      yield wrapNull(flags);
      yield 'type:';
      yield typeof type === 'string' ? buildToken(null, type) : wrapNull(type);
      yield 'name:';
      yield typeof name === 'string' ? buildIdentifier(name) : wrapNull(name);

      yield* when(literalValue, ['#:', ...Tags.traverse(buildSpace().value.tags)]);

      yield 'literalValue:';
      yield literalValue ? buildString(literalValue) : buildNullNode();

      if (!isEmpty(attributes)) {
        yield '#:';
        yield* buildSpace().value.tags;
        yield* interpolateFragment(attributes, 'attributes[]:');
      }

      yield 'selfClosingToken:';
      yield '<* "/" />';
      yield 'closeToken:';
      yield '<* ">" />';
      yield '</>';
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
      yield '<TreeNodeMatcher>';
      yield 'open:';
      yield open;
      if (!isEmpty(children_)) {
        yield* interpolateFragment(children_, 'children[]:');
      }
      yield '</>';
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
      yield '<ReferenceMatcher>';
      yield 'type:';
      yield type ? buildKeyword(type) : buildNullNode();
      yield 'name:';
      yield name ? buildIdentifier(name) : buildNullNode();
      yield 'flags:';
      yield wrapNull(flags);
      yield 'sigilToken:';
      yield '<* ":" />';
      yield '#:';
      yield* Tags.traverse(buildSpace().value.tags);
      yield '</>';
    })(),
  );
};

export const buildToken = (name, value, attributes = freeze({})) => {
  return treeFromStream([
    `<*${name ?? ''} ${JSON.stringify(attributes)}>`,
    JSON.stringify(value),
    '</>',
  ]);
};

export const buildPunctuator = (value, attributes = freeze({})) => {
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
      yield `<OpenNodeTag { selfClosing: ${selfClosing} }>`;
      yield 'openToken:';
      yield buildPunctuator('<');
      yield 'flags:';
      yield buildNodeFlags(flags);
      yield 'type:';
      yield wrapNull(type);
      yield 'name:';
      yield wrapNull(name);
      yield* when(!isEmpty(literalValue), ['#:', buildSpace()]);
      yield 'literalValue:';
      yield wrapNull(literalValue);
      yield* when(!isEmpty(attributes), ['#:', buildSpace()]);
      yield wrapNull(attributes);
      yield* when(selfClosing, ['#:', buildSpace()]);
      yield 'selfClosingToken:';
      yield selfClosing ? '<* "/" />' : buildNullNode();
      yield 'closeToken:';
      yield buildPunctuator('>');
      yield '</>';
    })(),
  );
};

export const buildDoctypeTag = (version, attributes) => {
  return treeFromStream(
    (function* () {
      yield '<DoctypeTag>';
      yield 'openToken:';
      yield buildPunctuator('<!');
      yield 'version:';
      yield buildToken('PositiveInteger', String(version));
      yield 'versionSeparator:';
      yield buildPunctuator(':');
      yield 'doctype:';
      yield buildKeyword('cstml');
      yield '</>';

      yield* when(!isEmpty(attributes), ['#:', ...buildSpace().value.tags]);
      yield 'attributes:';
      yield wrapNull(attributes);

      yield 'closeToken:';
      yield '<* ">" />';
      yield '</>';
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
      yield '<IdentifierPath>';

      yield* path_
        .flatMap((segment) => [
          'segments[]:',
          !isString(segment) && segment.type
            ? buildPunctuator(segment.type)
            : buildIdentifier(isString(segment) ? segment : segment.name),
          '#separatorTokens[]:',
          '<* "." />',
        ])
        .slice(0, -2);

      yield '</>';
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
    '<CloseNodeTag>',
    'openToken:',
    '<* "</" />',
    'closeToken:',
    '<* ">" />',
    '</>',
  ]);
};

export const buildLiteralTag = (value) => {
  return treeFromStream(['<LiteralTag>', 'value:', wrapNull(value), '</>']);
};

export const buildBindingTag = (segments) => {
  return treeFromStream(
    concat(
      ['<BindingTag>'],
      segments.flatMap((segment) => ['segments[]:', buildBindingSegment(segment)]),
      ['</>'],
    ),
  );
};

export const buildSpace = () => {
  return buildToken('Space', ' ');
};

export const buildIdentifier = (name) => {
  let unquoted = /^[a-zA-Z\u{80}-\u{10ffff}][a-zA-Z0-9_\u{80}-\u{10ffff}-]*$/uy.test(name);

  if (unquoted) {
    return treeFromStream(['<Identifier>', 'content:', buildIdentifierContent(name), '</>']);
  } else {
    return treeFromStream(
      (function* () {
        yield '<Identifier>';
        yield 'openToken:';
        yield '<* "`" />';
        yield 'content:';
        yield '<*IdentifierContent>';

        let lit = '';

        let pieces = name.split(/[\\`]/g);

        for (const piece of pieces) {
          if (/[\\`]/y.test(piece)) {
            let chr = piece;
            if (lit) {
              yield printTag(agastBuildLiteralTag(lit));
              lit = '';
            }

            let value = buildKeyword(chr);

            yield '@:';
            yield `<EscapeSequence { cooked: ${JSON.stringify(chr)} }>`;
            yield 'escape:';
            yield String.raw`<* "\\" />`;
            yield 'value:';
            yield value;
            yield '</>';
          } else {
            lit += piece;
          }
        }

        if (lit) yield printTag(agastBuildLiteralTag(lit));
        lit = '';

        yield '</>';

        yield 'closeToken:';
        yield '<* "`" />';
        yield '</>';
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
    '<Call>',
    'verb:',
    buildIdentifier(verb),
    'openToken:',
    '<* "(" />',
    ...interpolateFragment(buildCallArguments(args.map((e) => buildBABLRExpressionDeep(e)))),
    'closeToken:',
    '<* ")" />',
    '</>',
  ]);
};

export const buildCallArguments = (values) => {
  return treeFromStream(
    (function* () {
      yield '<__>';
      yield* buildSeparatedList(', ', values, 'arguments[]:');
      yield '</>';
    })(),
  );
};

export const buildProperty = (key, value) => {
  return treeFromStream(
    (function* () {
      yield '<Property>';
      yield 'key:';
      yield key;
      yield 'mapOperator:';
      yield '<* ":" />';
      yield '#:';
      yield buildSpace();
      yield 'value:';
      yield value;
      yield '</>';
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
      ['<Integer>'],
      digits.flatMap((digit) => ['digits[]:', buildDigit(digit)]),
      ['</>'],
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
    '<Infinity>',
    'sign:',
    buildToken(null, sign),
    'value:',
    '<* "Infinity" />',
    '</>',
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
      '<String>',
      'openToken:',
      `<* '"' />`,
      'content:',
      buildToken('StringContent', value),
      'closeToken:',
      `<* '"' />`,
      '</>',
    ]);
  }

  return treeFromStream(
    (function* () {
      yield '<String>';
      yield 'openToken:';
      const tok = buildToken(null, "'");
      yield tok;
      yield 'content:';
      yield '<*StringContent>';

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
                yield printTag(agastBuildLiteralTag(lit));
                lit = '';
              }

              let value;

              if (escapables[chr]) {
                value = treeFromStream([
                  '<EscapeCode>',
                  'sigilToken:',
                  buildKeyword(escapables[chr]),
                  '</>',
                ]);
              } else if (chr.charCodeAt(0) < 32) {
                const hexDigits = chr.charCodeAt(0).toString(16).padStart(4, '0');

                value = treeFromStream([
                  '<EscapeCode>',
                  'sigilToken:',
                  buildKeyword('u'),
                  ...[...hexDigits].flatMap((digit) => ['digits[]:', buildDigit(digit)]),
                  '</>',
                ]);
              } else {
                value = buildKeyword(chr);
              }

              yield '@:';
              yield `<EscapeSequence { cooked: ${JSON.stringify(chr)} }>`;
              yield 'escape:';
              yield String.raw`<* '\\' />`;
              yield 'value:';
              yield value;
              yield '</>';
            } else {
              lit += chr;
            }
          }
        } else {
          yield printTag(agastBuildLiteralTag(lit));
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

      if (lit) yield printTag(agastBuildLiteralTag(lit));
      lit = '';

      yield '</>';
      yield 'closeToken:';
      yield buildToken(null, "'");
      yield '</>';
    })(),
  );
};

export const buildBoolean = (value) => {
  return treeFromStream([
    '<Boolean>',
    'sigilToken:',
    buildToken(null, value ? 'true' : 'false'),
    '</>',
  ]);
};

export const buildNull = () => {
  return treeFromStream(['<Null>', 'sigilToken:', '<* "null" />', '</>']);
};

export const buildUndefined = () => {
  return treeFromStream(['<Undefined>', 'sigilToken:', '<* "undefined" />', '</>']);
};

export const buildNullTag = () => {
  return treeFromStream(['<NullTag>', 'sigilToken:', '<* "null" />', '</>']);
};

export const buildArray = (elements) => {
  return treeFromStream(
    (function* () {
      yield '<Array>';
      yield 'openToken:';
      yield '<* "[" />';
      yield* interpolateFragment(
        isArray(elements) ? buildArrayElements(elements) : elements,
        'elements[]:',
      );
      yield 'closeToken:';
      yield '<* "]" />';
      yield '</>';
    })(),
  );
};

export const buildArrayElements = (values) => {
  return treeFromStream(
    (function* () {
      yield '<__>';
      yield* buildSeparatedList(', ', values, 'elements[]:');
      yield '</>';
    })(),
  );
};

export function* buildSeparatedList(separator, values, ref) {
  if (!parseTag(ref).value.flags.array) throw new Error();

  let first = true;
  for (const value of values) {
    if (!first) {
      yield '#separatorTokens:';
      yield buildToken(null, separator);
    }
    yield ref;
    yield value || buildNullNode();
    first = false;
  }
}

export const buildObjectProperties = (properties) => {
  return treeFromStream(
    concat(['<__>'], buildSeparatedList(', ', properties, 'properties[]:'), ['</>']),
  );
};

export const buildObject = (properties) => {
  return treeFromStream(
    (function* () {
      yield '<Object>';
      yield 'openToken:';
      yield '<* "{" />';

      let isEmpty_ = isArray(properties) ? !properties.length : isEmpty(properties);

      if (!isEmpty_) {
        yield '#:';
        yield buildSpace();
      }

      yield* interpolateFragment(
        isArray(properties) ? buildObjectProperties(properties) : properties,
        'properties[]:',
      );

      if (!isEmpty_) {
        yield '#:';
        yield buildSpace();
      }

      yield 'closeToken:';
      yield '<* "}" />';
      yield '</>';
    })(),
  );
};

export const buildPattern = (alternatives, flags) => {
  return treeFromStream(
    (function* () {
      yield '<Pattern>';
      yield 'openToken:';
      yield '<* "/" />';

      yield* interpolateFragment(alternatives, 'alternatives[]:');

      yield 'closeToken:';
      yield '<* "/" />';
      yield 'flags:';
      yield flags ? buildRegexFlags() : buildNullNode();
      yield '</>';
    })(),
  );
};

export const buildRegexGroup = (alternatives, flags) => {
  return treeFromStream(
    (function* () {
      yield '<Group>';
      yield 'openToken:';
      yield '<* "(?:" />';

      yield* interpolateFragment(alternatives, 'alternatives[]:');

      yield 'closeToken:';
      yield '<* ")" />';
      yield 'flags:';
      yield flags ? buildRegexFlags() : buildNullNode();
      yield '</>';
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
      yield '<Flags>';

      for (const { 0: name, 1: chr } of Object.entries(flagCharacters)) {
        yield name + 'Token:';

        yield flags.includes(chr) ? buildToken(null, chr) : buildNullNode();
      }
      yield '</>';
    })(),
  );
};

export const buildAlternative = (elements) => {
  return treeFromStream(
    concat(['<Alternative>'], interpolateFragment(elements, 'elements[]+'), ['</>']),
  );
};

export const buildAlternatives = (alternatives = []) => {
  return treeFromStream(
    (function* () {
      yield '<__>';

      yield* alternatives
        .flatMap((alt) => ['alternatives[]:', alt, '#separatorTokens:', buildPunctuator('|')])
        .slice(0, -2);

      yield '</>';
    })(),
  );
};

export const buildRegexGap = () => {
  return treeFromStream([
    '<Gap>',
    'escapeToken:',
    String.raw`<* "\\" />`,
    'value:',
    '<* "g" />',
    '</>',
  ]);
};

export const buildElements = (elements) => {
  return treeFromStream(
    concat(
      ['<__>'],
      elements.flatMap((el) => ['elements[]+:', el]),
      ['</>'],
    ),
  );
};

export const buildCharacterClass = (elements, negate = false) => {
  return treeFromStream(
    (function* () {
      yield `<CharacterClass { negate: ${negate} }>`;
      yield 'openToken:';
      yield '<* "[" />';

      yield* interpolateFragment(elements, 'elements[]:');
      yield 'closeToken:';
      yield '<* "]" />';
      yield '</>';
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
    `<Quantifier { min: ${min}, max: ${max}, greedy: ${greedy} } />`,
    'element+:',
    element,
    'sigilToken:',
    buildToken(null, quantifier),
    '</>',
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

export const buildTaggedString = (tag, name, content) => {
  return treeFromStream([
    `<${name}>`,
    'sigilToken:',
    buildToken(null, tag),
    'openToken:',
    '<* "`" />',
    'content:',
    content,
    'closeToken:',
    '<* "`" />',
    '</>',
  ]);
};

export const buildSpamexString = (content) => {
  return buildTaggedString('m', 'SpamexString', content);
};

export const buildTagString = (content) => {
  return buildTaggedString('t', 'TagString', content);
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
    '<EnterProductionLine>',
    'sigilToken:',
    '<* "-->" />',
    '#:',
    '<* " " />',
    'name:',
    isString(name) ? buildIdentifier(name) : name,
    '#:',
    buildToken(null, '\n'),
    '</>',
  ]);
};

export const buildLeaveProductionLine = (name, failed) => {
  return treeFromStream([
    '<LeaveProductionLine>',
    'sigilToken:',
    failed ? '<* "x--" />' : '<* "<--" />',
    '#:',
    '<* " " />',
    'name:',
    isString(name) ? buildIdentifier(name) : name,
    '#:',
    buildToken(null, '\n'),
    '</>',
  ]);
};

export const buildExecInstructionLine = (instr, inner) => {
  return treeFromStream([
    '<ExecInstructionLine>',
    'sigilToken:',
    buildToken(null, inner ? '    >>>' : '>>>'),
    '#:',
    '<* " " />',
    'instr:',
    instr,
    '#:',
    buildToken(null, '\n'),
    '</>',
  ]);
};
