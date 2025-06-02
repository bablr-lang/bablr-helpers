import { enhanceStrategyBuilderWithDebugLogging as logStrategy } from '@bablr/strategy_enhancer-debug-log';
import { enhanceProductionWithDebugLogging as createProductionLogger } from '@bablr/language_enhancer-debug-log';
import { mapProductions } from './grammar.js';

export const memoize = (original) => {
  const cache = new WeakMap();
  const memoized = (...args) => {
    if (args.length > 1) throw new Error('A memoized function accepts only one argument');
    const arg = args[0];

    if (cache.has(arg)) {
      return cache.get(arg);
    } else {
      return original(arg);
    }
  };
  return memoized;
};

const identity = (x) => x;

export const compose = (functions) => {
  let first = true;
  let f = identity;
  for (const g of functions) {
    if (first) {
      f = g;
    } else {
      const f_ = f;
      f = (x) => f_(g(x));
    }
    first = false;
  }

  return f;
};

export const debugEnhancers = {
  // bablr: (strategy) => logStrategy(strategy, '<<< '),
  createBablrStrategy: (strategy) => (language, matcher, props) =>
    logStrategy(strategy(language, matcher, props), '    >>> '),
  bablrProduction: createProductionLogger('>>> '),
};

export const stateEnhancer = (hooks, grammar) => {
  let state;
  return mapProductions((production) => {
    return function* (props) {
      let prevState = props.state;

      if (!state) {
        hooks.buildState?.(props.state);
      } else if (props.state !== state) {
        hooks.branchState?.(state, props.state);
      }

      state = props.state;

      try {
        yield* production(props);

        hooks.acceptState?.(props.state, state);
      } catch (e) {
        hooks.rejectState?.(props.state);
      }

      state = prevState;
    };
  }, grammar);
};
