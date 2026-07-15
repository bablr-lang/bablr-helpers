import * as BList from '@bablr/agast-helpers/b-list';
import {
  buildCall,
  buildEmbeddedObject,
  buildEmbeddedCallable,
} from '@bablr/agast-vm-helpers/builders';
import {
  freeze,
  freezeClass,
  freezeRecord,
  isPlainObject,
  isString,
} from '@bablr/agast-helpers/object';
import { continue_, StreamIterable, wait } from '@bablr/stream-iterator';
import { stringName } from '@bablr/agast-helpers/path';
import { EmbeddedObject, Callable, TreeNodeMatcher } from '@bablr/agast-vm-helpers/symbols';

import { getOwnPropertySymbols, getPrototypeOf, objectEntries } from './object.js';
import { NullTag } from './symbols.js';
import { arrayValues } from '@bablr/agast-helpers/iterable';
import { parseMatcher } from '@bablr/agast-vm-helpers/parsers/spamex';
import { parseTag } from '@bablr/agast-helpers/parsers';

export * from './decorators.js';

export const normalizeProps = (value) => {
  return isPlainObject(value) && value.type === EmbeddedObject && isPlainObject(value.value)
    ? value.value
    : value === undefined
    ? {}
    : { value: value?.type === EmbeddedObject ? value.value : value };
};

const { getOwnPropertyNames, hasOwn } = Object;

const matchVerbs = new Set(['eat', 'match', 'eatMatch', 'shift', 'shiftMatch']);

const { isArray } = Array;
const isSymbol = (value) => typeof value === 'symbol';
const isType = (value) => isString(value) || isSymbol(value);

export const notNull = (facade) => {
  return facade && (facade.type !== null || facade.openTag.type !== NullTag);
};

export const mapOwnProductions = (fn, Grammar) => {
  let { prototype } = Grammar;

  class MappedGrammar {}

  const mapped = MappedGrammar.prototype;

  for (const key of [...getOwnPropertyNames(prototype), ...getOwnPropertySymbols(prototype)]) {
    if (!hasOwn(mapped, key)) {
      mapped[key] = fn(prototype[key], key);
    }
  }
  return MappedGrammar;
};

let getPrototypes = (Class) => {
  let proto = Class.prototype;
  let protos = [];

  while (proto && ![Object.prototype, Array.prototype, Function.prototype].includes(proto)) {
    protos.push(proto);
    proto = getPrototypeOf(proto);
  }
  return protos;
};

export const mapProductions = (fn, Grammar, finalize) => {
  let Result = class extends Grammar {};
  let mapped = Result.prototype;

  let protos = getPrototypes(Grammar);

  for (let i = protos.length - 1; i >= 0; i--) {
    let prototype = protos[i];
    for (const key of [...getOwnPropertyNames(prototype), ...getOwnPropertySymbols(prototype)]) {
      if (!hasOwn(mapped, key)) {
        Object.defineProperty(mapped, key, { value: fn(prototype[key], key) });
      }
    }

    if (i !== 0) {
      freezeClass(Result);
      Result = class extends Result {};
      mapped = Result.prototype;
    }
  }

  finalize?.(Result);
  freezeClass(Result);

  return Result;
};

export function* generateProductions(Grammar) {
  let { prototype } = Grammar;

  while (prototype && prototype !== Object.prototype) {
    for (const key of [...getOwnPropertyNames(prototype), ...getOwnPropertySymbols(prototype)]) {
      let value = prototype[key];
      if (key !== 'constructor') yield [key, value];
    }
    prototype = getPrototypeOf(prototype);
  }
}

export const explodeSubtypes = (aliases, exploded, types) => {
  for (const type of types) {
    const explodedTypes = aliases.get(type);
    if (explodedTypes) {
      for (const explodedType of explodedTypes) {
        exploded.add(explodedType);
        const subtypes = aliases.get(explodedType);
        if (subtypes) {
          explodeSubtypes(aliases, exploded, subtypes);
        }
      }
    }
  }
};

export const buildCovers = (rawAliases) => {
  const aliases = new Map();

  for (const alias of objectEntries(rawAliases)) {
    if (!isType(alias[0])) throw new Error('alias[0] key must be a string or symbol');
    if (!isArray(alias[1])) throw new Error('alias[1] must be an array');
    if (!Array.prototype.every.call(alias[1], isType))
      throw new Error('alias[1] values must be strings or symbols');

    aliases.set(alias[0], new Set(alias[1]));
  }

  for (const [type, types] of aliases.entries()) {
    explodeSubtypes(aliases, aliases.get(type), types);
  }

  return new Map(aliases);
};

export const buildReturnValue = (shift, value) => {
  return freeze({ shift, value });
};

export const getProduction = (grammar, name) => {
  return getPrototypeOf(grammar)[stringName(name)];
};

const __buildCall = (verb, ...args) => {
  while (args.length && args[args.length - 1] === undefined) {
    args.pop();
  }

  return freezeRecord({ verb, arguments: freezeRecord(args) });
};

export const getInstrMatcher = (instr) => {
  if (matchVerbs.has(instr.verb) && instr.arguments[0].type === Callable) {
    return instr.arguments[0].value;
  }
  return null;
};

function* __wrapGenerator(generator, relativeMatcher) {
  // Path.get quietly returns the first item when asked for an array...
  let { bindings: relativeBindings } = relativeMatcher.value;

  if (!relativeBindings || !relativeBindings.length) {
    return yield* generator;
  }

  let step;
  let returnValue;
  while (!(step = generator.next(returnValue)).done) {
    while (step === null || step instanceof Promise) {
      if (step === null) yield continue_(), (step = generator.next());
      if (step instanceof Promise) step = yield wait(step);
    }
    let instr = step.value;
    let { verb, arguments: args } = instr;

    let isMatcher = matchVerbs.has(verb) && args[0].type === Callable;

    if (isMatcher) {
      let { 0: matcher, 1: props, 2: options } = args;
      let { nodeMatcher, bindings } = matcher.value;

      if ((nodeMatcher.flags.token && !nodeMatcher.name) || !relativeBindings.length) {
        returnValue = yield instr;
        continue;
      }

      let newMatcher = buildEmbeddedCallable(
        matcher.value.reference,
        [...relativeBindings, ...bindings],
        matcher.value.nodeMatcher,
      );

      let extraArgs = [];
      if (props !== undefined || options !== undefined) extraArgs.push(props);
      if (options !== undefined) extraArgs.push(options);

      let newInstr = buildCall(verb, buildEmbeddedCallable(newMatcher), ...extraArgs);
      returnValue = yield newInstr;
    } else {
      returnValue = yield instr;
    }
  }
}

export const wrapGenerator = (generator, matcher) => {
  return new StreamIterable(__wrapGenerator(generator, matcher));
};

export function resolveLanguage(languages, bindingTags) {
  let languageIdx = BList.getSize(languages) - 1;
  let language = BList.getAt(languageIdx, languages);
  let bindingTags_ = isArray(bindingTags) ? bindingTags : freezeRecord([bindingTags]);

  for (let bindingTag of arrayValues(bindingTags_)) {
    let { type, name } = bindingTag.value;

    if (name) {
      language = language.dependencies[name.description];

      if (!language) return null;
    } else if (type) {
      if (type !== Symbol.for('..')) throw new Error();
      languageIdx--;
      language = BList.getAt(languageIdx, languages);
    } else {
      throw new Error();
    }
  }

  return language;
}

export function* exec(getState, matcher, value, getGrammar = (g) => g) {
  let matcher_ = matcher.value;
  let { nodeMatcher } = matcher_;
  let state = getState();

  if (nodeMatcher.type !== TreeNodeMatcher) throw new Error();

  let language = resolveLanguage(state.languages, matcher_.bindings);

  let { productionEnhancer } = language;

  let grammar_ = getGrammar(language);

  let args = freeze({
    type: nodeMatcher.value.type,
    name: nodeMatcher.value.name,
    props: normalizeProps(value),
    getState,
    s: getState,
    flags: nodeMatcher.value.flags,
    isCover: false,
    isCoverBoundary: false,
    allowEmpty: true,
    grammar: language,
    matcher: matcher.value,
    literalValue: null,
  });

  let production = grammar_.prototype[nodeMatcher.value.name?.description];

  let enhancedProduction = production;

  if (productionEnhancer) {
    enhancedProduction = productionEnhancer(enhancedProduction, nodeMatcher.value.name);
  }

  let generator = enhancedProduction(args);

  yield* wrapGenerator(generator, matcher);
}

export const eat = (matcher, value, options) => {
  return __buildCall('eat', matcher, value, options);
};

export const eatMatch = (matcher, value, options) => {
  return __buildCall('eatMatch', matcher, value, options);
};

export const match = (matcher, value, options) => {
  return __buildCall('match', matcher, value, options);
};

export const guard = (matcher, value, options) => {
  return __buildCall('guard', matcher, value, options);
};

export const shift = (matcher, value, options) => {
  return __buildCall('shift', matcher, value, options);
};

export const shiftMatch = (matcher, value, options) => {
  return __buildCall('shiftMatch', matcher, value, options);
};

export const fail = () => {
  return __buildCall('fail');
};

export const eatHeld = (matcher) => {
  return __buildCall('eatHeld', matcher);
};

export const dropHeld = (matcher) => {
  return __buildCall('dropHeld', matcher);
};

export const pinHeld = (matcher) => {
  return __buildCall('pinHeld', matcher);
};

export const returnHeld = (matcher) => {
  return __buildCall('returnHeld', matcher);
};

export const defineAttribute = (key, value) => {
  return __buildCall('defineAttribute', key, value);
};

export const write = (value) => {
  return __buildCall('write', value);
};

export const startSpan = (name, guard, props = '{}') => {
  if (!isString(props)) throw new Error();
  return __buildCall('startSpan', name, guard, false, props);
};

export const startSubspan = (name, guard, props = '{}') => {
  if (!isString(props)) throw new Error();
  return __buildCall('startSpan', name, guard, true, props);
};

export const endSpan = () => {
  return __buildCall('endSpan');
};

export const o = buildEmbeddedObject;

export const r = buildReturnValue;

export const m = (pattern, ...args) => {
  let input;
  if (isArray(pattern)) {
    input = String.raw(pattern, ...args);
  } else {
    input = pattern;
  }

  return parseMatcher(input);
};

export const t = (tag, ...args) => {
  let input;
  if (isArray(tag)) {
    input = String.raw(tag, ...args);
  } else {
    input = tag;
  }

  return parseTag(input);
};
