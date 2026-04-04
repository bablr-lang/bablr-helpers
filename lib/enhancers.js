/* global console */

import { StreamIterable, getStreamIterator, printTag, wait } from '@bablr/agast-helpers/stream';
import { buildWriteEffect, buildCall } from '@bablr/agast-vm-helpers/builders';
import { printCall } from '@bablr/agast-vm-helpers/print';
import { Coroutine } from '@bablr/coroutine';
import {
  buildEnterProductionLine,
  buildExecInstructionLine,
  buildLeaveProductionLine,
  buildCall as buildCall_,
  buildKeyword,
} from './builders.js';
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

function* wrapGeneratorWithEmitLogging(generator, indent) {
  const co = new Coroutine(generator);

  co.advance();

  for (;;) {
    if (co.current instanceof Promise) {
      co.current = yield wait(co.current);
    }

    if (co.done) break;

    let tag = co.value;

    if (tag.type === 'Effect') {
      yield tag;
      co.advance();
      continue;
    }

    yield buildWriteEffect(indent + printTag(tag));

    co.advance(yield tag);
  }

  return co.value;
}

const write = (value) => {
  return buildCall('write', value);
};

function* wrapGeneratorWithLogging(generator, indent) {
  const co = new Coroutine(generator);

  co.advance();

  for (;;) {
    if (co.current instanceof Promise) {
      co.current = yield wait(co.current);
    }

    if (co.done) {
      return co.value;
    }

    const instr = co.value;

    if (instr.verb !== 'write') {
      yield write(buildExecInstructionLine(buildCall_(instr.verb, instr.arguments), true));
    }

    co.advance(yield instr);
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

export const enhanceStrategyBuilderWithEmittedLogging = (strategyBuilder, indent = '') => {
  return (...strategyBuilderArgs) => {
    const strategy = getStreamIterator(strategyBuilder(...strategyBuilderArgs));

    return new StreamIterable(wrapGeneratorWithEmitLogging(strategy, indent));
  };
};

const mapProduction = (production, name, type) => {
  return {
    *[name](args) {
      yield write(buildEnterProductionLine(name || buildKeyword(type)));

      let earlyReturn = true;
      try {
        const generator = production.call(this, args);
        let current = generator.next();

        let anyResult = false;

        while (!current.done) {
          const instr = current.value;

          yield write(buildExecInstructionLine(buildCall_(instr.verb, instr.arguments)));

          const eats = ['eat', 'eatMatch'].includes(instr.verb);

          const result = yield instr;

          anyResult = anyResult || (eats && result);

          current = generator.next(result);
        }

        const { allowEmpty, s } = args;

        let failed = (!anyResult && !allowEmpty) || s().status !== 'active';

        yield write(buildLeaveProductionLine(name || buildKeyword(type), failed));
        earlyReturn = false;

        if (current.value?.shift) {
          let instr = current.value.shift;
          // yield write(indent`${printCall()}`);
          yield write(buildExecInstructionLine(buildCall_(instr.verb, instr.arguments)));
        }

        return current.value;
      } finally {
        if (earlyReturn) {
          yield write(buildLeaveProductionLine(name, true));
        }
      }
    },
  }[name];
};

export const enhanceGrammarWithDebugLogging = (grammar, indentation = '') => {
  return mapProductions((name, prod) => mapProduction(name, prod, indentation), grammar);
};

export const enhanceLanguageWithDebugLogging = (language, indentation = '') => {
  return {
    ...language,
    grammar: enhanceGrammarWithDebugLogging(language.grammar, indentation),
  };
};

export const enhanceWithDebugLogging = enhanceLanguageWithDebugLogging;

export const enhanceProductionWithDebugLogging = () => {
  return (production, name, type) => {
    return mapProduction(production, name, type);
  };
};

export default enhanceWithDebugLogging;

export const debugEnhancers = {
  // bablr: (strategy) => logStrategy(strategy, '<<< '),
  createBablrStrategy: (strategy) => (language, matcher, props) =>
    enhanceStrategyBuilderWithDebugLogging(strategy(language, matcher, props)),
  bablrProduction: enhanceProductionWithDebugLogging(),
};
