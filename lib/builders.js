import { interpolateFragment } from '@bablr/agast-helpers/template';
import { isEmpty, treeFromStream, treeFromString } from '@bablr/agast-helpers/tree';
import { buildLiteralTag as agastBuildLiteralTag, parseTag } from '@bablr/agast-helpers/builders';
import * as t from '@bablr/agast-helpers/shorthand';
import * as Tags from '@bablr/agast-helpers/tags';
import { arrayValues, concat, map } from '@bablr/agast-helpers/iterable';
import { buildNullNode } from '@bablr/agast-helpers/path';
import { printAttributes, printString, printTag, printType } from '@bablr/agast-helpers/print';
import { freezeRecord, isRecord, isSymbol } from '@bablr/agast-helpers/object';
import {
  BindingTag,
  CloseTag,
  LiteralTag,
  OpenNodeTag,
  ReferenceTag,
  Object as Object_,
  Tag,
  ShiftTag,
  AttributeDefinition,
  GapTag,
  NullTag,
  DoctypeTag,
  Callable,
  RegexMatcher,
  TreeNodeMatcher,
  StringMatcher,
  GapNodeMatcher,
  NullNodeMatcher,
} from './symbols.js';
import { parseRegexPattern } from '@bablr/agast-vm-helpers/builders';
import { objectKeys } from './object.js';

let { isArray } = Array;
let { flatMap } = Array.prototype;

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
      return buildReferenceTag(tag_);
    }
    case OpenNodeTag: {
      return buildOpenNodeTag(tag_.value);
    }
    case CloseTag: {
      return buildCloseTag();
    }
    case LiteralTag: {
      return buildLiteralTag(buildString(tag_.value));
    }
    case BindingTag: {
      return buildBindingTag(tag_.value);
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

export const buildReferenceTag = (tag) => {
  if (tag.type !== ReferenceTag) throw new Error();
  let { type, name, flags } = tag.value;
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

export const buildBindings = (bindingTags) => {
  return treeFromStream(
    concat(
      ['<__>'],
      flatMap.call(bindingTags, (bindingTag) => ['bindings[]:', buildBindingTag(bindingTag.value)]),
      ['</>'],
    ),
  );
};

export const buildBindingTag = (segment) => {
  let { type, name } = segment;

  if (!name && !type) throw new Error();

  return treeFromStream([
    '<BindingTag>',
    'openToken:',
    '<* ":" />',
    type ? 'type:' : 'name:',
    type ? buildToken(null, type.description) : buildIdentifier(name.description),
    'closeToken:',
    '<* ":" />',
    '</>',
  ]);
};

export const buildNodeMatcher = (matcher) => {
  switch (matcher.type) {
    case TreeNodeMatcher: {
      return buildTreeNodeMatcher(buildTreeNodeMatcherOpen(matcher));
    }
    case GapNodeMatcher: {
      return buildGapNodeMatcher();
    }
    case NullNodeMatcher: {
      return buildNullNodeMatcher();
    }
    default:
      throw new Error();
  }
};

export const buildCallable = (callable) => {
  let { reference, bindings, nodeMatcher } = callable;

  if (!nodeMatcher) throw new Error();
  return treeFromStream(
    (function* () {
      yield '<Callable>';
      yield 'reference:';
      yield reference ? buildReferenceTag(reference) : buildNullNode();
      if (reference) {
        yield '#:';
        yield buildSpace();
      }
      if (bindings.length) {
        yield* interpolateFragment(buildBindings(bindings));
        yield '#:';
        yield buildSpace();
      }
      yield 'nodeMatcher:';
      yield buildNodeMatcher(nodeMatcher);
      yield '</>';
    })(),
  );
};

export const buildBinding = (segment) => {
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
    `<ReferenceFlags ${printAttributes({ array, expression, intrinsic, hasGap })}>`,
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
    `<NodeFlags ${printAttributes(attributes)}>`,
    'tokenToken:',
    token ? '<* "*" />' : buildNullNode(),
    'hasGapToken:',
    hasGap ? '<* "$" />' : buildNullNode(),
    '</>',
  ]);
};

export const buildLiteralMatcher = (matcher) => {
  if (matcher == null) return buildNullNode();
  switch (matcher.type) {
    case RegexMatcher:
      return buildRegexString(matcher);
    case StringMatcher:
      return buildMatcherString(matcher);
    default:
      throw new Error();
  }
};

export const buildTreeNodeMatcherOpen = (matcher) => {
  if (matcher.type !== TreeNodeMatcher) throw new Error();

  let { flags, type, name, literalValue, attributes } = matcher.value;

  if (!type && !name && !flags.token) throw new Error();

  return treeFromStream(
    (function* () {
      yield '<TreeNodeMatcherOpen>';
      yield 'openToken:';
      yield '<* "<" />';
      yield 'flags:';
      yield wrapNull(buildNodeFlags(flags));
      yield 'type:';
      yield type ? buildToken(null, printType(type)) : buildNullNode();
      yield 'name:';
      yield name ? buildIdentifier(printType(name)) : buildNullNode();

      yield* when(literalValue, ['#:', ...Tags.traverse(buildSpace().value.tags)]);

      yield 'literalValue:';
      if (matcher.value.literalValue == null) {
        yield buildNullNode();
      } else {
        switch (matcher.value.literalValue.type) {
          case RegexMatcher:
            yield buildPattern(parseRegexPattern(matcher.value.literalValue.value));
            break;
          case StringMatcher:
            yield buildString(matcher.value.literalValue.value);
            break;
          default:
            throw new Error();
        }
      }

      if (Object.keys(attributes).length) {
        yield '#:';
        yield* Tags.traverse(buildSpace().value.tags);
        yield 'attributes:';
        yield buildJSExpressionDeep(attributes);
      }

      yield '#:';
      yield* Tags.traverse(buildSpace().value.tags);
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

export const buildToken = (name, value, attributes = freezeRecord({})) => {
  return treeFromStream([
    `<*${name ?? ''} ${printAttributes(attributes)}>`,
    printString(value),
    '</>',
  ]);
};

export const buildPunctuator = (value, attributes = freezeRecord({})) => {
  return buildToken(null, value, attributes);
};

export const buildOpenNodeTag = (open) => {
  let { flags, type, name, literalValue, attributes, selfClosing } = open;

  type &&= buildToken(null, type.description);
  name &&= buildIdentifier(name.description);
  literalValue &&= buildString(literalValue);
  attributes &&= Object.keys(attributes).length ? buildJSExpressionDeep(attributes) : null;

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
  const path_ = isString(path) ? [path] : [...arrayValues(path)];

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

export const buildCloseTag = () => {
  return treeFromStream([
    '<CloseTag>',
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
            yield `<EscapeSequence ${printAttributes({ cooked: chr })}>`;
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
  Array.prototype.map.call(args, (arg) => {
    if (typeof arg === 'object' && Object.getPrototypeOf(arg)) throw new Error();
  });
  return treeFromStream([
    '<Call>',
    'verb:',
    buildIdentifier(verb),
    'openToken:',
    '<* "(" />',
    ...interpolateFragment(
      buildCallArguments(map((e) => buildBABLRExpressionDeep(e), arrayValues(args))),
    ),
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
              yield `<EscapeSequence ${printAttributes({ cooked: chr })}>`;
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

export const buildPattern = (tree) => {
  let expression;
  let flags;
  if (isArray(tree)) {
    expression = freezeRecord({ capture: true, alternatives: tree });
    flags = defaultRegexFlags;
  } else {
    ({ expression, flags } = tree);
  }

  let { alternatives } = expression;
  return treeFromStream(
    (function* () {
      yield '<Pattern>';
      yield 'openToken:';
      yield '<* "/" />';

      yield* interpolateFragment(buildAlternatives(alternatives), 'alternatives[]:');

      yield 'closeToken:';
      yield '<* "/" />';
      yield 'flags:';
      yield buildRegexFlags(flags || defaultRegexFlags);
      yield '</>';
    })(),
  );
};

export const buildRegexGroup = (group) => {
  let alternatives;
  let capture = false;
  if (isArray(group)) {
    alternatives = group;
  } else {
    ({ alternatives, capture } = group);
  }

  return treeFromStream(
    (function* () {
      yield '<Group>';
      yield 'openToken:';
      yield capture ? '<* "(" />' : '<* "(?:" />';

      yield* interpolateFragment(buildAlternatives(alternatives), 'alternatives[]:');

      yield 'closeToken:';
      yield '<* ")" />';
      yield '</>';
    })(),
  );
};

let flagChrs = {
  global: 'g',
  ignoreCase: 'i',
  multiline: 'm',
  dotAll: 's',
  unicode: 'u',
  sticky: 'y',
};

export const defaultRegexFlags = freezeRecord({
  global: false,
  ignoreCase: false,
  multiline: false,
  dotAll: false,
  unicode: false,
  sticky: false,
});

export const buildRegexFlags = (flags = defaultRegexFlags) => {
  return treeFromStream(
    (function* () {
      yield '<Flags>';

      for (let name of objectKeys(defaultRegexFlags)) {
        yield name + 'Token:';

        yield flags[name] ? buildToken(null, flagChrs[name]) : buildNullNode();
      }
      yield '</>';
    })(),
  );
};

export const buildAlternative = (elements) => {
  return treeFromStream(
    concat(['<Alternative>'], interpolateFragment(buildElements(elements), 'elements[]+:'), [
      '</>',
    ]),
  );
};

export const buildAlternatives = (alternatives = []) => {
  return treeFromStream(
    (function* () {
      yield '<__>';

      yield* [...(isArray(alternatives) ? arrayValues(alternatives) : alternatives)]
        .flatMap((alt) => [
          'alternatives[]:',
          buildAlternative(alt),
          '#separatorTokens:',
          buildPunctuator('|'),
        ])
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

export const buildElement = (element) => {
  switch (typeof element) {
    case 'string': {
      let chr = element;
      if (escaped[chr]) {
        return treeFromString(
          `<*Character> @: <EscapeSequence {cooked: ${printString(
            chr,
          )} }> sigilToken: <* '\\\\' /> type: <* ${printString(escaped[chr])} /> </> </>`,
        );
      } else if (chr < '\u001A') {
        let escapeCode = chr.charCodeAt(0).toString(16).padStart(4, '0');
        let escaped_ = String.raw`\u${escapeCode}`;
        return treeFromString(
          `<*Character> @: <EscapeSequence { cooked: '${String.fromCodePoint(
            escapeCode,
          )}' }> sigilToken: <* '\\\\' /> type: <* 'u' /> code: <* ${printString(
            escaped_,
          )} /> </> </>`,
        );
      } else {
        return buildToken('Character', chr);
      }
    }
    case 'symbol':
      switch (element.description) {
        case 'g':
          return treeFromString(
            String.raw`<Gap> escapeToken: <* '\\' /> value: <*Keyword 'g' /> </>`,
          );
        case 'd':
          return treeFromString(
            String.raw`<DigitCharacterSet { negate: false }> escapeToken: <* '\\' /> value: <*Keyword 'd' /> </>`,
          );
        case 'D':
          return treeFromString(
            String.raw`<DigitCharacterSet { negate: true }> escapeToken: <* '\\' /> value: <*Keyword 'D' /> </>`,
          );
        case 's':
          return treeFromString(
            String.raw`<SpaceCharacterSet { negate: false }> escapeToken: <* '\\' /> value: <*Keyword 's' /> </>`,
          );
        case 'S':
          return treeFromString(
            String.raw`<SpaceCharacterSet { negate: true }> escapeToken: <* '\\' /> value: <*Keyword 'S' /> </>`,
          );
        case 'w':
          return treeFromString(
            String.raw`<WordCharacterSet { negate: false }> escapeToken: <* '\\' /> value: <*Keyword 'w' /> </>`,
          );
        case 'W':
          return treeFromString(
            String.raw`<WordCharacterSet { negate: true }> escapeToken: <* '\\' /> value: <*Keyword 'W' /> </>`,
          );
        case '.':
          return treeFromString(String.raw`<AnyCharacterSet> value: <*Keyword '.' /> </>`);
        case 'b':
          return treeFromString(
            String.raw`<WordBoundaryAssertion> escapeToken: <* '\\' /> value: <*Keyword 'b' /> </>`,
          );
        case '^':
          return treeFromString(
            String.raw`<StartOfInputAssertion> sigilToken: <*Keyword '^' /> </>`,
          );
        case '$':
          return treeFromString(String.raw`<EndOfInputAssertion> sigilToken: <*Keyword '$' /> </>`);
        default:
          throw new Error();
      }
    case 'object':
      if (isArray(element)) {
        return buildCharacterClass(element);
      } else {
        return buildRegexGroup(element);
      }
    default:
      throw new Error();
  }
};

export const buildCharacterClassRange = (range) => {
  let { 0: start, 1: end } = range;

  return treeFromStream([
    '<CharacterClassRange>',
    'min:',
    buildCharacterClassElement(start),
    'sigilToken:',
    '<* "-" />',
    'max:',
    buildCharacterClassElement(end),
    '</>',
  ]);
};

export const buildCharacterClassElement = (element) => {
  switch (typeof element) {
    case 'string':
      let chr = element;
      if (classEscaped[chr]) {
        return treeFromString(
          `<*Character> @: <EscapeSequence {cooked: ${printString(
            chr,
          )} }> sigilToken: <* '\\\\' /> type: <* ${printString(classEscaped[chr])} /> </> </>`,
        );
      } else if (chr < '\u001A') {
        let escapeCode = chr.charCodeAt(0).toString(16).padStart(4, '0');
        let escaped_ = String.raw`\u${escapeCode}`;
        return treeFromString(
          `<*Character> @: <EscapeSequence { cooked: '${escaped_}' }> sigilToken: <* '\\\\' /> type: <* 'u' /> code: <* ${printString(
            escapeCode,
          )} /> </> </>`,
        );
      } else {
        return buildToken('Character', chr);
      }

    case 'symbol':
      switch (element.description) {
        case 'g':
          return treeFromStream([
            '<Gap>',
            'escapeChr:',
            String.raw`<* "\\" />`,
            'value:',
            '<*Keyword "g" />',
            '</>',
          ]);
        case 'd':
          return treeFromStream([
            '<CharacterClassRange>',
            'escapeChr:',
            String.raw`<* "\\" />`,
            'value:',
            '<*Keyword "d" />',
            '</>',
          ]);
        default:
          throw new Error();
      }
      break;
    case 'object':
      if (isArray(element)) {
        return buildCharacterClassRange(element);
      } else {
        throw new Error();
      }
    default:
      throw new Error();
  }
};

export const buildElements = (elements) => {
  if (typeof elements[0] === 'boolean') throw new Error();
  return treeFromStream(
    (function* () {
      yield '<__>';

      for (let i = 0; i < elements.length; i++) {
        let el = buildElement(elements[i]);
        yield 'elements[]+:';

        if (typeof elements[i + 1] === 'number') {
          let min = elements[i + 1];
          let max = elements[i + 2];
          let greedy = elements[i + 3];
          i += 3;
          el = buildQuantifier(el, min, max, greedy);
        }
        yield el;
      }
      yield '</>';
    })(),
  );
};

export const buildCharacterClassElements = (elements) => {
  return treeFromStream(
    (function* () {
      yield '<__>';

      for (let i = 0; i < elements.length; i++) {
        yield 'elements[]+:';
        yield buildCharacterClassElement(elements[i]);
      }
      yield '</>';
    })(),
  );
};

export const buildCharacterClass = (elements) => {
  let [negate, ...elements_] = arrayValues(elements);
  return treeFromStream(
    (function* () {
      yield `<CharacterClass { negate: ${negate} }>`;
      yield 'openToken:';
      yield '<* "[" />';
      yield 'negateToken:';
      yield negate ? buildToken('Keyword', '^') : buildNullNode();
      yield* interpolateFragment(buildCharacterClassElements(elements_), 'elements[]:');
      yield 'closeToken:';
      yield '<* "]" />';
      yield '</>';
    })(),
  );
};

export const buildQuantifier = (el, min = 0, max = Infinity, greedy = true) => {
  let chr = null;
  if (max === Infinity) {
    // prettier-ignore
    switch(min) {
      case 0: chr = '*'; break;
      case 1: chr = '+'; break;
    }
  } else if (min === 0 && max === 1 && greedy) {
    chr = '?';
  }

  if (chr) {
    return treeFromStream([
      `<Quantifier { min: ${min}, max: ${max}, greedy: ${greedy} }>`,
      'element+:',
      el,
      'sigilToken:',
      buildToken(null, chr),
      '</>',
    ]);
  } else {
    throw new Error('not implemented');
  }
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
      if (!isRecord(expr)) throw new Error();
      if (isArray(expr)) {
        return buildArray(buildArrayElements(expr.map((e) => buildJSExpressionDeep(e))));
      } else {
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
      if (typeof expr === 'object' && Object.getPrototypeOf(expr)) throw new Error();
      if (isArray(expr)) {
        return buildArray(
          buildArrayElements(Array.prototype.map.call(expr, (e) => buildBABLRExpressionDeep(e))),
        );
      } else {
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
          case Callable: {
            return buildSpamexString(expr);
          }
          case RegexMatcher: {
            return buildRegexString(expr);
          }
          case StringMatcher: {
            return buildMatcherString(expr);
          }
          default:
            throw new Error();
        }
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

export const buildSpamexString = (matcher) => {
  if (matcher.type !== Callable) throw new Error();
  return buildTaggedString('m', 'SpamexString', buildCallable(matcher.value));
};

export const buildRegexString = (matcher) => {
  if (matcher.type !== RegexMatcher) throw new Error();
  return buildTaggedString('m', 'SpamexString', buildPattern(parseRegexPattern(matcher.value)));
};

export const buildMatcherString = (matcher) => {
  if (matcher.type !== StringMatcher) throw new Error();
  return buildTaggedString('m', 'SpamexString', buildString(matcher.value));
};

export const buildTagString = (content) => {
  return buildTaggedString('t', 'TagString', content);
};

export const buildGapNodeMatcher = () => {
  return buildToken('GapNodeMatcher', '<//>');
};

export const buildNullNodeMatcher = () => {
  return buildToken('NullNodeMatcher', '<//>');
};

const escaped = {
  '\\': `\\`,
  '/': `/`,
  '\r': `r`,
  '\n': `n`,
  '\t': `t`,
  '(': `(`,
  ')': `)`,
  '[': `[`,
  ']': `]`,
  '{': `{`,
  '}': `}`,
  '+': `+`,
  '*': `*`,
  '<': `<`,
  '>': `>`,
  '^': `^`,
  '|': `|`,
};

const classEscaped = {
  '\\': `\\`,
  '\r': `r`,
  '\n': `n`,
  '\t': `t`,
  '[': `[`,
  ']': `]`,
  '^': `^`,
};

export const buildEnterProductionLine = (name) => {
  return treeFromStream([
    '<EnterProductionLine>',
    'sigilToken:',
    '<* "-->" />',
    '#:',
    '<* " " />',
    'name:',
    isSymbol(name) ? buildIdentifier(name.description) : name,
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
    isSymbol(name) ? buildIdentifier(name.description) : name,
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
