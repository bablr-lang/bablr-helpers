/* global console */

import {
  StreamGenerator,
  StreamIterable,
  getStreamIterator,
  wait,
} from '@bablr/agast-helpers/stream';
import { buildCall } from '@bablr/agast-vm-helpers/builders';
import { freeze } from '@bablr/agast-helpers/object';
import { mapProductions } from './grammar.js';
import {
  buildExecInstructionLine,
  buildCall as buildCall_,
  buildEnterProductionLine,
  buildKeyword,
  buildLeaveProductionLine,
} from './builders.js';

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

const write = (value) => {
  return buildCall('write', value);
};

function* wrapGeneratorWithLogging(generator) {
  let step;
  step = generator.next();

  for (;;) {
    if (step instanceof Promise) step = yield wait(step);

    if (step.done) {
      return step.value;
    }

    const instr = step.value;

    if (instr.verb !== 'write') {
      yield write(buildExecInstructionLine(buildCall_(instr.verb, instr.arguments), true));
    }

    step = generator.next(yield instr);
  }
}

export const enhanceStrategyBuilderWithDebugLogging = (
  strategyBuilder,
  indent = '',
  log = console.log,
) => {
  return (...strategyBuilderArgs) => {
    const strategy = strategyBuilder(...strategyBuilderArgs);

    return new StreamIterable(wrapGeneratorWithLogging(getStreamIterator(strategy), indent, log));
  };
};

const enhanceProduction = (production, name, type) => {
  function* __logger(args) {
    yield write(buildEnterProductionLine(name || buildKeyword(type)));

    let earlyReturn = true;
    try {
      const generator = production.call(this, args);
      let step = generator.next();

      let anyResult = false;

      for (;;) {
        if (step.done) break;

        if (step instanceof Promise) {
          step = yield wait(step);
        }

        const instr = step.value;

        yield write(buildExecInstructionLine(buildCall_(instr.verb, instr.arguments)));

        const eats = ['eat', 'eatMatch'].includes(instr.verb);

        const result = yield instr;

        anyResult = anyResult || (eats && result);

        step = generator.next(result);
      }

      const { allowEmpty, s } = args;

      let failed = (!anyResult && !allowEmpty) || s().status !== 'active';

      yield write(buildLeaveProductionLine(name || buildKeyword(type), failed));
      earlyReturn = false;

      if (step.value?.shift) {
        let instr = step.value.shift;
        // yield write(indent`${printCall()}`);
        yield write(buildExecInstructionLine(buildCall_(instr.verb, instr.arguments)));
      }

      return step.value;
    } finally {
      if (earlyReturn) {
        yield write(buildLeaveProductionLine(name, true));
      }
    }
  }

  return function logger(args) {
    return new StreamGenerator(__logger.call(this, args));
  };
};

export const enhanceGrammar = (grammar, indentation = '') => {
  return mapProductions((name, prod) => enhanceProduction(name, prod, indentation), grammar);
};

export const enhanceLanguageWithDebugLogging = (language, indentation = '') => {
  return {
    ...language,
    grammar: enhanceGrammar(language.grammar, indentation),
  };
};

export const enhanceWithDebugLogging = enhanceLanguageWithDebugLogging;

export const enhanceProductionWithDebugLogging = () => {
  return (production, name, type) => {
    return enhanceProduction(production, name, type);
  };
};

export default enhanceWithDebugLogging;

export const debugEnhancers = freeze({
  createBablrStrategy: (strategy) => (language, matcher, props) =>
    enhanceStrategyBuilderWithDebugLogging(strategy(language, matcher, props)),
  bablrProduction: enhanceProductionWithDebugLogging(),
});
