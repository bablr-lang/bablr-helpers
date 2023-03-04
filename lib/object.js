export const { hasOwn, getOwnPropertySymbols, fromEntries } = Object;

function* map(fn, iterable) {
  for (const value of iterable) yield fn(value);
}

export const isObject = (obj) => obj !== null && typeof obj === 'object';
export const { isArray } = Array;
export const isFunction = (obj) => typeof obj === 'function';
export const isSymbol = (obj) => typeof obj === 'symbol';
export const isString = (obj) => typeof obj === 'string';
export const isType = (obj) => isSymbol(obj) || isString(obj);

export function objectKeys(obj) {
  return {
    *[Symbol.iterator]() {
      for (let key in obj) if (hasOwn(obj, key)) yield key;
      yield* getOwnPropertySymbols(obj);
    },
  };
}

export function objectValues(obj) {
  return {
    *[Symbol.iterator]() {
      for (let key in obj) if (hasOwn(obj, key)) yield obj[key];
      yield* map((sym) => obj[sym], getOwnPropertySymbols(obj));
    },
  };
}

export function objectEntries(obj) {
  return {
    *[Symbol.iterator]() {
      for (let key in obj) if (hasOwn(obj, key)) yield [key, obj[key]];
      yield* map((sym) => [sym, obj[sym]], getOwnPropertySymbols(obj));
    },
  };
}