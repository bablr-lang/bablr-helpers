import map from 'iter-tools-es/methods/map';

export const { hasOwn, getOwnPropertySymbols, getPrototypeOf, fromEntries } = Object;

export const isObject = (obj) => obj !== null && typeof obj === 'object';
export const { isArray } = Array;
export const isFunction = (obj) => typeof obj === 'function';
export const isSymbol = (obj) => typeof obj === 'symbol';
export const isString = (obj) => typeof obj === 'string';
export const isRegex = (obj) => obj instanceof RegExp;
export const isPattern = (obj) => isString(obj) || isRegex(obj);
export const isType = (obj) => isSymbol(obj) || isString(obj);
export const isPlainObject = (val) => val && [Object.prototype, null].includes(getPrototypeOf(val));

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
