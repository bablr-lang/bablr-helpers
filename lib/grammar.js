import every from 'iter-tools-es/methods/every';
import isString from 'iter-tools-es/methods/is-string';
import * as BList from '@bablr/agast-helpers/b-list';
import {
  buildCall,
  buildEmbeddedMatcher,
  buildEmbeddedObject,
} from '@bablr/agast-vm-helpers/builders';
import { freeze, isPlainObject } from '@bablr/agast-helpers/object';
import { StreamIterable, wait } from '@bablr/stream-iterator';
import { get, stringName } from '@bablr/agast-helpers/path';
import { reifyExpression } from '@bablr/agast-vm-helpers';
import { EmbeddedObject } from '@bablr/agast-vm-helpers/symbols';

import { getOwnPropertySymbols, getPrototypeOf, objectEntries } from './object.js';
import { OpenNodeTag, CloseNodeTag, NullTag, Matcher } from './symbols.js';
import { buildBoundNodeMatcher, buildPropertyMatcher } from './builders.js';

export * from './decorators.js';
export { i, re, spam, m, t, cst } from '@bablr/boot';

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

  while (proto && proto !== Object.prototype) {
    protos.push(proto);
    proto = getPrototypeOf(proto);
  }
  return protos;
};

export const mapProductions = (fn, Grammar) => {
  let Result = class MappedGrammar extends Grammar {};

  let mapped = Result.prototype;

  let protos = getPrototypes(Grammar);

  for (let i = protos.length - 1; i >= 0; i--) {
    let prototype = protos[i];
    for (const key of [...getOwnPropertyNames(prototype), ...getOwnPropertySymbols(prototype)]) {
      if (!hasOwn(mapped, key)) {
        Object.defineProperty(mapped, key, { value: fn(prototype[key], key) });
      }
    }

    Result = class extends Result {};
    mapped = Result.prototype;
  }

  let Freezable = Result;
  while (Freezable && Freezable.prototype !== Object.prototype) {
    Object.freeze(Freezable);
    Object.freeze(Freezable.prototype);
    Freezable = getPrototypeOf(Freezable);
  }

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
    if (!every(isType, alias[1])) throw new Error('alias[1] values must be strings or symbols');

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

export const extendLanguage = (language, extension) => {
  return {
    ...language,
    dependencies: extension.dependencies
      ? { ...language.dependencies, ...extension.dependencies }
      : language.dependencies,
    canonicalURL: extension.canonicalURL || language.canonicalURL,
    grammar: extension.grammar,
  };
};

const arrayLast = (arr) => arr[arr.length - 1];

export function* zipLanguages(tags, rootLanguage) {
  const languages = [rootLanguage];

  for (const tag of tags) {
    switch (tag.type) {
      case OpenNodeTag: {
        if (tag.value.language) {
          const dependentLanguage = languages.dependencies[tag.value.language];

          if (!dependentLanguage) throw new Error('language was not a dependency');

          languages.push(dependentLanguage);
        }
        break;
      }

      case CloseNodeTag: {
        if (tag.value.language !== arrayLast(languages).canonicalURL) {
          languages.pop();
        }
        break;
      }
    }

    yield [tag, arrayLast(languages)];
  }
}

const __buildCall = (verb, ...args) => {
  while (args.length && args[args.length - 1] === undefined) {
    args.pop();
  }

  return { verb, arguments: args };
};

export const getInstrMatcher = (instr) => {
  if (matchVerbs.has(instr.verb) && instr.arguments[0].type === Matcher) {
    return instr.arguments[0];
  }
  return null;
};

function* __wrapGenerator(generator, relativeMatcher) {
  // Path.get quietly returns the first item when asked for an array...
  let { bindingMatchers: relativeBindings } = reifyExpression(relativeMatcher.value);

  if (!relativeBindings || !relativeBindings.length) {
    return yield* generator;
  }

  let step;
  let returnValue;
  while (!(step = generator.next(returnValue)).done) {
    if (step instanceof Promise) {
      step = yield wait(step);
    }
    let instr = step.value;
    let { verb, arguments: args } = instr;

    let isMatcher =
      matchVerbs.has(verb) &&
      args[0].type === Matcher &&
      args[0].value.value.name?.description === 'PropertyMatcher';

    if (isMatcher) {
      let { 0: matcher, 1: props, 2: options } = args;
      let { nodeMatcher, bindingMatchers } = reifyExpression(matcher.value);

      if ((nodeMatcher.flags.token && !nodeMatcher.name) || !relativeBindings.length) {
        returnValue = yield instr;
        continue;
      }

      let newMatcher = buildPropertyMatcher(
        get('refMatcher', matcher.value),
        buildBoundNodeMatcher(
          [...relativeBindings, ...bindingMatchers],
          get(['valueMatcher', 'nodeMatcher'], matcher.value),
        ),
      );

      let extraArgs = [];
      if (props !== undefined || options !== undefined) extraArgs.push(props);
      if (options !== undefined) extraArgs.push(options);

      let newInstr = buildCall(verb, buildEmbeddedMatcher(newMatcher), ...extraArgs);
      returnValue = yield newInstr;
    } else {
      returnValue = yield instr;
    }
  }
}

export const wrapGenerator = (generator, matcher) => {
  return new StreamIterable(__wrapGenerator(generator, matcher));
};

export function resolveLanguage(languages, path) {
  let languageIdx = BList.getSize(languages) - 1;
  let language = BList.getAt(languageIdx, languages);

  let path_ = Array.isArray(path)
    ? path
    : reifyExpression(path.value).bindingMatchers.flatMap((m) => m.segments);

  for (let { name, type } of path_) {
    if (name) {
      language = language.dependencies[name];

      if (!language) return null;
    } else if (type) {
      if (type !== '..') throw new Error();
      languageIdx--;
      language = BList.getAt(languageIdx, languages);
    } else {
      throw new Error();
    }
  }

  return language;
}

export function* exec(getState, matcher, value, getGrammar = (g) => g) {
  let matcher_ = reifyExpression(matcher.value);
  let { nodeMatcher } = matcher_;
  let state = getState();

  let language = resolveLanguage(state.languages, matcher);

  let { productionEnhancer } = language;

  let { grammar } = language;
  let grammar_ = getGrammar(grammar);

  let args = freeze({
    type: nodeMatcher.type,
    name: nodeMatcher.name,
    props: normalizeProps(value),
    getState,
    s: getState,
    flags: nodeMatcher.flags,
    isCover: false,
    isCoverBoundary: false,
    allowEmpty: true,
    grammar,
    matcher: matcher.value,
    literalValue: null,
  });

  let production = grammar_.prototype[nodeMatcher.name];

  let enhancedProduction = production;

  if (productionEnhancer) {
    enhancedProduction = productionEnhancer(enhancedProduction, nodeMatcher.name);
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

export const startSpan = (name, guard, props = {}) => {
  return __buildCall('startSpan', name, guard, false, o(props));
};

export const startSubspan = (name, guard, props = {}) => {
  return __buildCall('startSpan', name, guard, true, o(props));
};

export const endSpan = () => {
  return __buildCall('endSpan');
};

export const o = buildEmbeddedObject;

export const r = buildReturnValue;
