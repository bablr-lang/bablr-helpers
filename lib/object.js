import { map } from '@bablr/agast-helpers/iterable';

export {
  isObject,
  isArray,
  isPlainObject,
  isFunction,
  isSymbol,
  isString,
  isType,
  isRegex,
  isPattern,
} from '@bablr/agast-helpers/object';

export const { hasOwn, getOwnPropertySymbols, getPrototypeOf, fromEntries } = Object;

export const objectKeys = (obj) => {
  return {
    *[Symbol.iterator]() {
      if (obj == null) return;
      for (let key in obj) if (hasOwn(obj, key)) yield key;
      yield* getOwnPropertySymbols(obj);
    },
  };
};

export const objectValues = (obj) => {
  return {
    *[Symbol.iterator]() {
      if (obj == null) return;
      for (let key in obj) if (hasOwn(obj, key)) yield obj[key];
      yield* map((sym) => obj[sym], getOwnPropertySymbols(obj));
    },
  };
};

export const objectEntries = (obj) => {
  return {
    *[Symbol.iterator]() {
      if (obj == null) return;
      for (let key in obj) if (hasOwn(obj, key)) yield [key, obj[key]];
      yield* map((sym) => [sym, obj[sym]], getOwnPropertySymbols(obj));
    },
  };
};

export const mapObject = (fn, obj) => {
  let result = {};
  for (let key in obj) if (hasOwn(obj, key)) result[key] = fn(obj[key]);
  for (const sym of getOwnPropertySymbols(obj)) result[sym] = fn(obj[sym]);
  return result;
};

export const arrayLast = (arr) => arr[arr.length - 1];
