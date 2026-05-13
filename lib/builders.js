import { isEmpty } from '@bablr/agast-helpers/tree';
import { buildLiteralTag as agastBuildLiteralTag, parseTag } from '@bablr/agast-helpers/builders';
import * as t from '@bablr/agast-helpers/shorthand';
import { arrayValues, map, isEmpty as iterableIsEmpty } from '@bablr/agast-helpers/iterable';
import { buildNullNode } from '@bablr/agast-helpers/path';
import { printAttributes, printString, printTag, printType } from '@bablr/agast-helpers/print';
import { freezeRecord, isRecord } from '@bablr/agast-helpers/object';
import {
  BindingTag,
  CloseNodeTag,
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
  StreamTag,
} from './symbols.js';
import { parseRegexPattern } from '@bablr/agast-vm-helpers/builders';
import { objectKeys } from './object.js';
import { interpolateFragment, streamFromString } from '@bablr/agast-helpers/stream';

let { isArray } = Array;

let when = (condition, value) => (condition ? value : { *[Symbol.iterator]() {} });

let isString = (val) => typeof val === 'string';

export const writeTag = (tag) => {
  let tag_ = parseTag(tag);
  switch (tag_.type) {
    case DoctypeTag: {
      let { version, attributes } = tag_.value;
      return writeDoctypeTag(version, writeJSExpressionDeep(attributes));
    }
    case ReferenceTag: {
      return writeReferenceTag(tag_);
    }
    case OpenNodeTag: {
      return writeOpenNodeTag(tag_.value);
    }
    case CloseNodeTag: {
      return writeCloseNodeTag();
    }
    case LiteralTag: {
      return writeLiteralTag(writeString(tag_.value));
    }
    case BindingTag: {
      return writeBindingTag(tag_.value);
    }
    case AttributeDefinition: {
      let { path, value } = tag_.value;
      return writeAttributeDefinition(writeIdentifierPath(path), writeJSExpressionDeep(value));
    }
    case ShiftTag:
      return writeShiftTag();

    case GapTag:
      return writeGapTag();

    case NullTag:
      return writeNullTag();

    case StreamTag: {
      let { processPath, stream } = tag_.value;
      return writeStreamTag(processPath, stream);
    }

    default:
      throw new Error();
  }
};

export function* writeStreamTag(processPath, stream) {
  yield '<StreamTag>';
  yield 'openToken:';
  yield '<* "<" />';
  yield 'processPathToken:';
  yield '<* "-" />';
  yield 'processPath:';
  yield* writeNumberPath(processPath) || ['null'];
  yield 'streamToken:';
  yield '<* "-" />';
  yield 'stream:';
  yield* writeNumber(stream) || ['null'];
  yield 'closeToken:';
  yield '<* ">" />';
  yield '</>';
}

export function* writeNumberPath(path) {
  const path_ = isString(path) ? [path] : [...arrayValues(path)];

  if (!path_.length) {
    return 'null';
  }

  yield '<NumberPath>';

  let first = true;
  for (let segment of path_) {
    if (!first) {
      yield '#separatorTokens:';
      yield '<* "." />';
    }
    yield 'segments[]:';
    yield* writeInteger(segment);
    first = false;
  }

  yield '</>';
}

export function* writeAttributeDefinition(path, value) {
  yield '<AttributeDefinition>';
  yield 'openToken:';
  yield '<* "{" />';
  yield '#:';
  yield "<* ' ' />";
  yield 'key:';
  yield* path || ['null'];
  yield 'sigilToken:';
  yield '<* ":" />';
  yield '#:';
  yield "<* ' ' />";
  yield 'value:';
  yield* value || ['null'];
  yield '#:';
  yield "<* ' ' />";
  yield 'closeToken:';
  yield '<* "}" />';
  yield '</>';
}

export function* writeReferenceTag(tag) {
  if (tag.type !== ReferenceTag) throw new Error();
  let { type, name, flags } = tag.value;

  yield '<ReferenceTag>';
  yield 'type:';
  yield* type ? writeToken(null, type) : ['null'];
  yield 'name:';
  yield* name ? writeIdentifier(name) : ['null'];
  yield 'flags:';
  yield* flags ? writeReferenceFlags(flags) : ['null'];
  yield 'sigilToken:';
  yield '<* ":" />';
  yield '</>';
}

export function* writeBindings(bindingTags) {
  yield '<__>';
  for (let bindingTag of arrayValues(bindingTags)) {
    yield 'bindings[]:';
    yield* writeBindingTag(bindingTag.value);
  }
  yield '</>';
}

export function* writeBindingTag(segment) {
  let { type, name } = segment;

  if (!name && !type) throw new Error();

  yield '<BindingTag>';
  yield 'openToken:';
  yield '<* ":" />';
  yield type ? 'type:' : 'name:';
  yield* type ? writeToken(null, type.description) : writeIdentifier(name.description);
  yield 'closeToken:';
  yield '<* ":" />';
  yield '</>';
}

export function writeNodeMatcher(matcher) {
  switch (matcher.type) {
    case TreeNodeMatcher: {
      return writeTreeNodeMatcher(writeTreeNodeMatcherOpen(matcher));
    }
    case GapNodeMatcher: {
      return writeGapNodeMatcher();
    }
    case NullNodeMatcher: {
      return writeNullNodeMatcher();
    }
    default:
      throw new Error();
  }
}

export function* writeCallable(callable) {
  let { reference, bindings, nodeMatcher } = callable;

  if (!nodeMatcher) throw new Error();

  yield '<Callable>';
  yield 'reference:';
  yield* reference ? writeReferenceTag(reference) : ['null'];
  yield* when(reference, ['#:', "<* ' ' />"]);
  if (bindings.length) {
    yield* interpolateFragment(writeBindings(bindings));
    yield '#:';
    yield "<* ' ' />";
  }
  yield 'nodeMatcher:';
  yield* writeNodeMatcher(nodeMatcher);
  yield '</>';
}

export function* writeBinding(segment) {
  let { type, name } = segment;

  yield '<BindingSegment>';
  yield 'openToken:';
  yield '<* ":" />';
  yield 'path:';
  yield* type ? writeToken(null, type) : writeIdentifier(name);
  yield 'closeToken:';
  yield '<* ":" />';
  yield '</>';
}

export function* writeGapTag() {
  yield '<GapTag>';
  yield 'sigilToken:';
  yield '<* "<//>" />';
  yield '</>';
}

export function* writeShiftTag() {
  yield '<ShiftTag>';
  yield 'sigilToken:';
  yield '<* "^^^" />';
  yield '</>';
}

export function* writeReferenceFlags(flags = t.referenceFlags) {
  const { array, expression, intrinsic, hasGap } = flags;

  yield `<ReferenceFlags ${printAttributes({ array, expression, intrinsic, hasGap })}>`;
  yield 'arrayToken:';
  yield array ? '<* "[]" />' : 'null';
  yield 'expressionToken:';
  yield expression ? '<* "+" />' : 'null';
  yield 'intrinsicToken:';
  yield intrinsic ? '<* "*" />' : 'null';
  yield 'hasGapToken:';
  yield hasGap ? '<* "$" />' : 'null';
  yield '</>';
}

export function* writeNodeFlags(flags = t.nodeFlags) {
  const { token = null, hasGap = null } = flags;

  let flags_ = { token, hasGap };
  let attributes = flags_;

  yield `<NodeFlags ${printAttributes(attributes)}>`;
  yield 'tokenToken:';
  yield token ? '<* "*" />' : 'null';
  yield 'hasGapToken:';
  yield hasGap ? '<* "$" />' : 'null';
  yield '</>';
}

export function writeLiteralMatcher(matcher) {
  if (matcher == null) return buildNullNode();
  switch (matcher.type) {
    case RegexMatcher:
      return writeRegexString(matcher);
    case StringMatcher:
      return writeMatcherString(matcher);
    default:
      throw new Error();
  }
}

export function* writeTreeNodeMatcherOpen(matcher) {
  if (matcher.type !== TreeNodeMatcher) throw new Error();

  let { flags, type, name, literalValue, attributes } = matcher.value;

  let attrsObj = t.parseObject(attributes);
  let attrsEmpty = !Object.keys(attrsObj).length;

  if (!type && !name && !flags.token) throw new Error();

  yield '<TreeNodeMatcherOpen>';
  yield 'openToken:';
  yield '<* "<" />';
  yield 'flags:';
  yield* flags ? writeNodeFlags(flags) : ['null'];
  yield 'type:';
  yield* type ? writeToken(null, printType(type)) : ['null'];
  yield 'name:';
  yield* name ? writeIdentifier(printType(name)) : ['null'];
  yield* when(literalValue, ['#:', "<* ' ' />"]);
  yield 'literalValue:';
  if (matcher.value.literalValue == null) {
    yield 'null';
  } else {
    switch (matcher.value.literalValue.type) {
      case RegexMatcher:
        yield* writePattern(parseRegexPattern(matcher.value.literalValue.value));
        break;
      case StringMatcher:
        yield* writeString(matcher.value.literalValue.value);
        break;
      default:
        throw new Error();
    }
  }

  if (!attrsEmpty) {
    yield '#:';
    yield "<* ' ' />";
    yield 'attributes:';
    yield* writeJSExpressionDeep(attributes);
  }

  yield '#:';
  yield "<* ' ' />";
  yield 'selfClosingToken:';
  yield '<* "/" />';
  yield 'closeToken:';
  yield '<* ">" />';
  yield '</>';
}

export function* writeTreeNodeMatcher(open, children) {
  let children_ = children;

  if (children_) {
    throw new Error('not implemented');
    // if (isArray(children_)) {
    //   children_ = buildTreeNodeMatcherChildren(children_);
    // }
  }

  yield '<TreeNodeMatcher>';
  yield 'open:';
  yield* open;
  if (!isEmpty(children_)) {
    yield* interpolateFragment(children_);
  }
  yield '</>';
}

export function* writeToken(name, value, attributes = '{}') {
  if (!isString(attributes)) throw new Error();
  if (value) {
    let attrsObj = t.parseObject(attributes);
    let attrsEmpty = !Object.keys(attrsObj);
    let attrsPart = attrsEmpty ? '' : ` ${attributes}`;

    yield `<*${name ?? ''} ${printString(value)}${attrsPart} />`;
  }
}

export const writePunctuator = (value, attributes = '{}') => {
  return writeToken(null, value, attributes);
};

export function* writeOpenNodeTag(open) {
  let { flags, type, name, literalValue, attributes, selfClosing } = open;

  if (!flags || !attributes) throw new Error();

  let attrsObj = t.parseObject(attributes);
  let attrsEmpty = !Object.keys(attrsObj).length;

  yield `<OpenNodeTag { selfClosing: ${selfClosing} }>`;
  yield 'openToken:';
  yield* writePunctuator('<');
  yield 'flags:';
  yield* writeNodeFlags(flags);
  yield 'type:';
  yield* type ? writeToken(null, type.description) : ['null'];
  yield 'name:';
  yield* name ? writeIdentifier(name.description) : ['null'];
  yield* when(literalValue, ['#:', "<* ' ' />"]);
  yield 'literalValue:';
  yield* literalValue ? writeString(literalValue) : ['null'];
  yield* when(!attrsEmpty, ['#:', "<* ' ' />"]);
  yield* !attrsEmpty ? writeJSExpressionDeep(attrsObj) : ['null'];
  yield* when(selfClosing, ['#:', "<* ' ' />"]);
  yield 'selfClosingToken:';
  yield selfClosing ? '<* "/" />' : 'null';
  yield 'closeToken:';
  yield* writePunctuator('>');
  yield '</>';
}

export function* writeDoctypeTag(version, attributes) {
  yield '<DoctypeTag>';
  yield 'openToken:';
  yield* writePunctuator('<!');
  yield 'version:';
  yield* writeToken('PositiveInteger', String(version));
  yield 'versionSeparator:';
  yield* writePunctuator(':');
  yield 'doctype:';
  yield* writeKeyword('cstml');
  yield '</>';

  let attrsObj = t.parseObject(attributes);
  let attrsEmpty = !Object.keys(attrsObj).length;

  if (!attrsEmpty) {
    yield '#:';
    yield "<* ' ' />";
  }
  yield 'attributes:';
  yield* !attrsEmpty ? writeJSObject(attributes) : ['null'];

  yield 'closeToken:';
  yield '<* ">" />';
  yield '</>';
}

export function* writeIdentifierPath(path) {
  const path_ = isString(path) ? [path] : [...arrayValues(path)];

  if (!path_.length) {
    return 'null';
  }

  yield '<IdentifierPath>';

  let first = true;
  for (let segment of path_) {
    if (!first) {
      yield '#separatorTokens:';
      yield '<* "." />';
    }
    yield 'segments[]:';
    yield* !isString(segment) && segment.type
      ? writePunctuator(segment.type)
      : writeIdentifier(isString(segment) ? segment : segment.name);
    first = false;
  }

  yield '</>';
}

export function* writeCloseNodeTag() {
  yield '<CloseNodeTag>';
  yield 'openToken:';
  yield '<* "</" />';
  yield 'closeToken:';
  yield '<* ">" />';
  yield '</>';
}

export function* writeLiteralTag(value) {
  yield '<LiteralTag>';
  yield 'value:';
  yield* value || ['null'];
  yield '</>';
}

export function* writeIdentifier(name) {
  let unquoted = /^[a-zA-Z\u{80}-\u{10ffff}][a-zA-Z0-9_\u{80}-\u{10ffff}-]*$/uy.test(name);

  if (unquoted) {
    yield '<Identifier>';
    yield 'content:';
    yield* writeIdentifierContent(name);
    yield '</>';
  } else {
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

        yield '@:';
        yield `<EscapeSequence ${printAttributes({ cooked: chr })}>`;
        yield 'escape:';
        yield String.raw`<* "\\" />`;
        yield 'value:';
        yield* writeKeyword(chr);
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
  }
}

export function writeIdentifierContent(value) {
  return writeToken('IdentifierContent', value);
}

export function writeKeyword(name) {
  return writeToken(null, name);
}

export function* writeCall(verb, args) {
  Array.prototype.map.call(args, (arg) => {
    if (arg && typeof arg === 'object' && Object.getPrototypeOf(arg)) throw new Error();
  });

  yield '<Call>';
  yield 'verb:';
  yield* writeIdentifier(verb);
  yield 'openToken:';
  yield '<* "(" />';

  yield* interpolateFragment(
    writeCallArguments(map((e) => writeBABLRExpressionDeep(e), arrayValues(args))),
  );
  yield 'closeToken:';
  yield '<* ")" />';
  yield '</>';
}

export function* writeCallArguments(values) {
  yield '<__>';
  yield* writeSeparatedList(', ', values, 'arguments[]:');
  yield '</>';
}

export function* writeProperty(key, value) {
  yield '<Property>';
  yield 'key:';
  yield* key;
  yield 'mapOperator:';
  yield '<* ":" />';
  yield '#:';
  yield "<* ' ' />";
  yield 'value:';
  yield* value;
  yield '</>';
}

const escapables = {
  '\r': 'r',
  '\n': 'n',
  '\t': 't',
  '\0': '0',
};

export function writeDigit(value) {
  return writeToken('Digit', value);
}

export function* writeInteger(value, base = 10) {
  const digits = value.toString(base).split('');

  yield '<Integer>';
  for (let digit of digits) {
    yield 'digits[]:';
    yield* writeDigit(digit);
  }
  yield '</>';
}

export function* writeInfinity(value) {
  let sign;
  if (value === Infinity) {
    sign = '+';
  } else if (value === -Infinity) {
    sign = '-';
  } else {
    throw new Error();
  }

  yield '<Infinity>';
  yield 'sign:';
  yield* writeToken(null, sign);
  yield 'value:';
  yield '<* "Infinity" />';
  yield '</>';
}

export function writeNumber(value) {
  if (Number.isFinite(value)) {
    return writeInteger(value);
  } else {
    return writeInfinity(value);
  }
}

export function* writeString(value) {
  if (value == null) throw new Error();
  const pieces = isArray(value) ? value : [value];
  let lit = '';

  if (pieces.length === 1 && pieces[0] === "'") {
    yield '<String>';
    yield 'openToken:';
    yield `<* '"' />`;
    yield 'content:';
    yield* writeToken('StringContent', value);
    yield 'closeToken:';
    yield `<* '"' />`;
    yield '</>';
  } else {
    yield '<String>';
    yield 'openToken:';
    yield* writeToken(null, "'");
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

            yield '@:';
            yield `<EscapeSequence ${printAttributes({ cooked: chr })}>`;
            yield 'escape:';
            yield String.raw`<* '\\' />`;
            yield 'value:';
            if (escapables[chr]) {
              yield '<EscapeCode>';
              yield 'sigilToken:';
              yield* writeKeyword(escapables[chr]);
              yield '</>';
            } else if (chr.charCodeAt(0) < 32) {
              const hexDigits = chr.charCodeAt(0).toString(16).padStart(4, '0');

              yield '<EscapeCode>';
              yield 'sigilToken:';
              yield* writeKeyword('u');
              for (let digit of hexDigits) {
                yield 'digits[]:';
                yield* writeDigit(digit);
              }

              yield '</>';
            } else {
              yield* writeKeyword(chr);
            }
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
    yield* writeToken(null, "'");
    yield '</>';
  }
}

export function* writeBoolean(value) {
  yield '<Boolean>';
  yield 'sigilToken:';
  yield* writeToken(null, value ? 'true' : 'false');
  yield '</>';
}

export function* writeNull() {
  yield '<Null>';
  yield 'sigilToken:';
  yield '<* "null" />';
  yield '</>';
}

export function* writeUndefined() {
  yield '<Undefined>';
  yield 'sigilToken:';
  yield '<* "undefined" />';
  yield '</>';
}

export function* writeNullTag() {
  yield '<NullTag>';
  yield 'sigilToken:';
  yield '<* "null" />';
  yield '</>';
}

export function* writeArray(elements) {
  yield '<Array>';
  yield 'openToken:';
  yield '<* "[" />';
  yield* interpolateFragment(isArray(elements) ? writeArrayElements(elements) : elements);
  yield 'closeToken:';
  yield '<* "]" />';
  yield '</>';
}

export function* writeArrayElements(values) {
  yield '<__>';
  yield* writeSeparatedList(', ', values, 'elements[]:');
  yield '</>';
}

export function* writeSeparatedList(separator, values, ref) {
  if (!parseTag(ref).value.flags.array) throw new Error();

  let first = true;
  for (const value of values) {
    if (!first) {
      yield '#separatorTokens:';
      yield* writeToken(null, separator);
    }
    yield ref;
    yield* interpolateFragment(value);
    first = false;
  }
}

export function* writeObjectProperties(properties) {
  yield '<__>';
  yield* writeSeparatedList(', ', properties, 'properties[]:');
  yield '</>';
}

function* __writeObject(properties) {
  yield '<Object>';
  yield 'openToken:';
  yield '<* "{" />';

  let properties_ = [...interpolateFragment(properties)];

  if (properties_.length) {
    yield '#:';
    yield "<* ' ' />";
  }

  yield* properties_;

  if (properties_.length) {
    yield '#:';
    yield "<* ' ' />";
  }

  yield 'closeToken:';
  yield '<* "}" />';
  yield '</>';
}

export function writeJSObject(obj) {
  return writeJSExpressionDeep(obj);
}

export function writeBABLRObject(obj) {
  return writeBABLRExpressionDeep(obj);
}

export function* writePattern(pattern) {
  let expression;
  let flags;
  if (isArray(pattern)) {
    expression = freezeRecord({ capture: true, alternatives: pattern });
    flags = defaultRegexFlags;
  } else {
    ({ expression, flags } = pattern);
  }

  let { alternatives } = expression;

  yield '<Pattern>';
  yield 'openToken:';
  yield '<* "/" />';

  yield* interpolateFragment(writeAlternatives(alternatives));

  yield 'closeToken:';
  yield '<* "/" />';
  yield 'flags:';
  yield* writeRegexFlags(flags || defaultRegexFlags);
  yield '</>';
}

export function* writeRegexGroup(group) {
  let alternatives;
  let capture = false;
  if (isArray(group)) {
    alternatives = group;
  } else {
    ({ alternatives, capture } = group);
  }

  yield '<Group>';
  yield 'openToken:';
  yield capture ? '<* "(" />' : '<* "(?:" />';

  yield* interpolateFragment(writeAlternatives(alternatives));

  yield 'closeToken:';
  yield '<* ")" />';
  yield '</>';
}

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

export function* writeRegexFlags(flags = defaultRegexFlags) {
  yield '<Flags>';

  for (let name of objectKeys(defaultRegexFlags)) {
    yield name + 'Token:';

    yield* flags[name] ? writeToken(null, flagChrs[name]) : ['null'];
  }
  yield '</>';
}

export function* writeAlternative(elements) {
  yield '<Alternative>';
  yield* interpolateFragment(writeElements(elements));
  yield '</>';
}

export function* writeAlternatives(alternatives = []) {
  yield '<__>';

  let first = true;
  for (let alt of arrayValues(alternatives)) {
    if (!first) {
      yield '#separatorTokens:';
      yield* writePunctuator('|');
    }
    yield 'alternatives[]:';
    yield* writeAlternative(alt);
    first = false;
  }

  yield '</>';
}

export function* buildRegexGap() {
  yield '<Gap>';
  yield 'escapeToken:';
  yield String.raw`<* "\\" />`;
  yield 'value:';
  yield '<* "g" />';
  yield '</>';
}

export function* writeElement(element) {
  switch (typeof element) {
    case 'string': {
      let chr = element;
      if (escaped[chr]) {
        yield `<EscapeSequence { cooked: ${printString(chr)} }>`;
        yield 'sigilToken:';
        yield `<* '\\\\' />`;
        yield 'type:';
        yield `<* ${printString(escaped[chr])} />`;
        yield '</>';
      } else if (chr < '\u001A') {
        let escapeCode = chr.charCodeAt(0).toString(16).padStart(4, '0');
        let escaped_ = String.raw`\u${escapeCode}`;
        yield '<*Character>';
        yield '@:';
        yield `<EscapeSequence { cooked: '${String.fromCodePoint(escapeCode)}' }>`;
        yield 'sigilToken:';
        yield `<* '\\\\' />`;
        yield 'type:';
        yield "<* 'u' />";
        yield 'code:';
        yield `<* ${printString(escaped_)} />`;
        yield '</>';
        yield '</>';
      } else {
        yield* writeToken('Character', chr);
      }
      break;
    }
    case 'symbol':
      switch (element.description) {
        case 'g':
          yield* streamFromString(
            String.raw`<Gap> escapeToken: <* '\\' /> value: <*Keyword 'g' /> </>`,
          );
          break;
        case 'd':
          yield* streamFromString(
            String.raw`<DigitCharacterSet { negate: false }> escapeToken: <* '\\' /> value: <*Keyword 'd' /> </>`,
          );
          break;
        case 'D':
          yield* streamFromString(
            String.raw`<DigitCharacterSet { negate: true }> escapeToken: <* '\\' /> value: <*Keyword 'D' /> </>`,
          );
          break;
        case 's':
          yield* streamFromString(
            String.raw`<SpaceCharacterSet { negate: false }> escapeToken: <* '\\' /> value: <*Keyword 's' /> </>`,
          );
          break;
        case 'S':
          yield* streamFromString(
            String.raw`<SpaceCharacterSet { negate: true }> escapeToken: <* '\\' /> value: <*Keyword 'S' /> </>`,
          );
          break;
        case 'w':
          yield* streamFromString(
            String.raw`<WordCharacterSet { negate: false }> escapeToken: <* '\\' /> value: <*Keyword 'w' /> </>`,
          );
          break;
        case 'W':
          yield* streamFromString(
            String.raw`<WordCharacterSet { negate: true }> escapeToken: <* '\\' /> value: <*Keyword 'W' /> </>`,
          );
          break;
        case '.':
          yield* streamFromString(String.raw`<AnyCharacterSet> value: <*Keyword '.' /> </>`);
          break;
        case 'b':
          yield* streamFromString(
            String.raw`<WordBoundaryAssertion> escapeToken: <* '\\' /> value: <*Keyword 'b' /> </>`,
          );
          break;
        case '^':
          yield* streamFromString(
            String.raw`<StartOfInputAssertion> sigilToken: <*Keyword '^' /> </>`,
          );
          break;
        case '$':
          yield* streamFromString(
            String.raw`<EndOfInputAssertion> sigilToken: <*Keyword '$' /> </>`,
          );
          break;
        default:
          throw new Error();
      }
      break;
    case 'object':
      if (isArray(element)) {
        yield* writeCharacterClass(element);
      } else {
        yield* writeRegexGroup(element);
      }
      break;
    default:
      throw new Error();
  }
}

export function* writeCharacterClassRange(range) {
  let { 0: start, 1: end } = range;

  yield '<CharacterClassRange>';
  yield 'min:';
  yield* writeCharacterClassElement(start);
  yield 'sigilToken:';
  yield '<* "-" />';
  yield 'max:';
  yield* writeCharacterClassElement(end);
  yield '</>';
}

export function* writeCharacterClassElement(element) {
  switch (typeof element) {
    case 'string':
      let chr = element;
      if (classEscaped[chr]) {
        yield '<*Character>';
        yield '@:';
        yield `<EscapeSequence { cooked: ${printString(chr)} }>`;
        yield 'sigilToken:';
        yield `<* '\\\\' />`;
        yield 'type:';
        yield `<* ${printString(classEscaped[chr])} />`;
        yield '</>';
        yield '</>';
      } else if (chr < '\u001A') {
        let escapeCode = chr.charCodeAt(0).toString(16).padStart(4, '0');
        let escaped_ = String.raw`\u${escapeCode}`;

        yield '<*Character>';
        yield '@:';
        yield `<EscapeSequence { cooked: '${escaped_}' }>`;
        yield 'sigilToken:';
        yield `<* '\\\\' />`;
        yield 'type:';
        yield "<* 'u' />";
        yield 'code:';
        yield `<* ${printString(escapeCode)} /> `;
        yield '</>';
        yield '</>';
      } else {
        yield* writeToken('Character', chr);
      }
      break;

    case 'symbol':
      switch (element.description) {
        case 'g':
          yield '<Gap>';
          yield 'escapeChr:';
          yield String.raw`<* "\\" />`;
          yield 'value:';
          yield '<*Keyword "g" />';
          yield '</>';
          break;

        case 'd':
          yield '<CharacterClassRange>';
          yield 'escapeChr:';
          yield String.raw`<* "\\" />`;
          yield 'value:';
          yield '<*Keyword "d" />';
          yield '</>';
          break;

        default:
          throw new Error();
      }
      break;
    case 'object':
      if (isArray(element)) {
        yield* writeCharacterClassRange(element);
      } else {
        throw new Error();
      }
      break;
    default:
      throw new Error();
  }
}

export function* writeElements(elements) {
  if (typeof elements[0] === 'boolean') throw new Error();

  yield '<__>';

  for (let i = 0; i < elements.length; i++) {
    yield 'elements[]+:';
    let el = writeElement(elements[i]);

    if (typeof elements[i + 1] === 'number') {
      let min = elements[i + 1];
      let max = elements[i + 2];
      let greedy = elements[i + 3];
      i += 3;
      el = writeQuantifier(el, min, max, greedy);
    }
    yield* el;
  }
  yield '</>';
}

export function* writeCharacterClassElements(elements, negate = false) {
  yield '<__>';

  for (let i = 0; i < elements.length; i++) {
    yield 'elements[]+:';

    if (elements[i] === '^' && (!negate || i > 0)) {
      yield* writeToken('Character', '^');
    } else {
      yield* writeCharacterClassElement(elements[i]);
    }
  }
  yield '</>';
}

export function* writeCharacterClass(elements) {
  let [negate, ...elements_] = arrayValues(elements);

  yield `<CharacterClass { negate: ${negate} }>`;
  yield 'openToken:';
  yield '<* "[" />';
  yield 'negateToken:';
  yield* negate ? writeToken('Keyword', '^') : ['null'];
  yield* interpolateFragment(writeCharacterClassElements(elements_, negate));
  yield 'closeToken:';
  yield '<* "]" />';
  yield '</>';
}

export function* writeQuantifier(el, min = 0, max = Infinity, greedy = true) {
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
    yield `<Quantifier { min: ${min}, max: ${max}, greedy: ${greedy} }>`;
    yield 'element+:';
    yield* el;
    yield 'sigilToken:';
    yield* writeToken(null, chr);
    yield '</>';
  } else {
    throw new Error('not implemented');
  }
}

export const writeJSExpressionDeep = (expr) => {
  if (expr === null) {
    return writeNull();
  } else if (expr === undefined) {
    return writeUndefined();
  }

  switch (typeof expr) {
    case 'boolean':
      return writeBoolean(expr);

    case 'string':
      return writeString(expr);

    case 'number':
      return writeInteger(expr);

    case 'object': {
      if (!isRecord(expr)) throw new Error();
      if (isArray(expr)) {
        return writeArray(writeArrayElements(expr.map((e) => writeJSExpressionDeep(e))));
      } else {
        return __writeObject(
          writeObjectProperties(
            Object.entries(expr).map((e) =>
              writeProperty(
                /^[a-zA-Z_]+$/.test(e[0]) ? writeIdentifier(e[0]) : writeString(e[0]),
                writeJSExpressionDeep(e[1]),
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

export function writeBABLRExpressionDeep(expr) {
  if (expr === null) {
    return writeNull();
  } else if (expr === undefined) {
    return writeUndefined();
  }

  switch (typeof expr) {
    case 'boolean':
      return writeBoolean(expr);

    case 'string':
      return writeString(expr);

    case 'symbol':
      return writeString(expr.description);

    case 'number':
      return writeInteger(expr);

    case 'object': {
      if (typeof expr === 'object' && Object.getPrototypeOf(expr)) throw new Error();
      if (isArray(expr)) {
        return writeArray(
          writeArrayElements(Array.prototype.map.call(expr, (e) => writeBABLRExpressionDeep(e))),
        );
      } else {
        switch (expr.type) {
          case Object_:
            return __writeObject(
              writeObjectProperties(
                Object.entries(expr.value).map((e) =>
                  writeProperty(
                    /^[a-zA-Z_]+$/.test(e[0]) ? writeIdentifier(e[0]) : writeString(e[0]),
                    writeBABLRExpressionDeep(e[1]),
                  ),
                ),
              ),
            );

          case Tag:
            return writeTagString(writeTag(expr.value));

          case Callable:
            return writeSpamexString(expr);

          case RegexMatcher:
            return writeRegexString(expr);

          case StringMatcher:
            return writeMatcherString(expr);

          default:
            throw new Error();
        }
      }
    }

    default:
      throw new Error();
  }
}

export function* writeTaggedString(tag, name, content) {
  yield `<${name}>`;
  yield 'sigilToken:';
  yield* writeToken(null, tag);
  yield 'openToken:';
  yield '<* "`" />';
  yield 'content:';
  yield* content;
  yield 'closeToken:';
  yield '<* "`" />';
  yield '</>';
}

export function writeSpamexString(matcher) {
  if (matcher.type !== Callable) throw new Error();
  return writeTaggedString('m', 'SpamexString', writeCallable(matcher.value));
}

export function writeRegexString(matcher) {
  if (matcher.type !== RegexMatcher) throw new Error();
  return writeTaggedString('m', 'SpamexString', writePattern(parseRegexPattern(matcher.value)));
}

export function writeMatcherString(matcher) {
  if (matcher.type !== StringMatcher) throw new Error();
  return writeTaggedString('m', 'SpamexString', writeString(matcher.value));
}

export function writeTagString(content) {
  return writeTaggedString('t', 'TagString', content);
}

export function writeGapNodeMatcher() {
  return writeToken('GapNodeMatcher', '<//>');
}

export function writeNullNodeMatcher() {
  return writeToken('NullNodeMatcher', 'null');
}

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

export function* writeEnterProductionLine(name) {
  yield '<EnterProductionLine>';
  yield '#:';
  yield String.raw`<* '\n' />`;
  yield 'sigilToken:';
  yield '<* "-->" />';
  yield '#:';
  yield '<* " " />';
  yield 'name:';
  yield* name;
  yield '</>';
}

export function* writeLeaveProductionLine(name, failed) {
  yield '<LeaveProductionLine>';
  yield '#:';
  yield String.raw`<* '\n' />`;
  yield 'sigilToken:';
  yield failed ? '<* "x--" />' : '<* "<--" />';
  yield '#:';
  yield '<* " " />';
  yield 'name:';
  yield* name;
  yield '</>';
}

export function* writeExecInstructionLine(instr, inner) {
  yield '<ExecInstructionLine>';
  yield '#:';
  yield String.raw`<* '\n' />`;
  yield 'sigilToken:';
  yield* writeToken(null, inner ? '    >>>' : '>>>');
  yield '#:';
  yield '<* " " />';
  yield 'instr:';
  yield* instr;
  yield '</>';
}
