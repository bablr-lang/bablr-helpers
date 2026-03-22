import * as BSet from '@bablr/agast-helpers/b-set';
import * as BMap from '@bablr/agast-helpers/b-map';

export const AllowEmpty = (desc, context) => {
  context.addInitializer(function () {
    let emptyables = this.emptyables;

    if (!emptyables) {
      emptyables = this.emptyables = BSet.create();
    }

    this.emptyables = BSet.add(context.name, emptyables);
  });
};

export const Literal = (desc, context) => {
  context.addInitializer(function () {
    let literals = this.literals;

    if (!literals) {
      literals = this.literals = BSet.create();
    }

    this.literals = BSet.add(context.name, literals);
  });
};

export const CoveredBy = (type) => {
  return (desc, context) => {
    context.addInitializer(function () {
      let covers = this.covers;

      if (!covers) {
        covers = this.covers = BMap.create();
      }

      let coveredTypes = covers.get(type);

      if (!coveredTypes) {
        coveredTypes = BSet.create();
        covers.set(type, coveredTypes);
      }

      coveredTypes.add(context.name);
    });
  };
};

export const InjectFrom = (obj) => (_stub, context) => {
  if (!Object.hasOwn(obj, context.name)) {
    throw new Error('Bad injection');
  }

  return obj[context.name];
};

export const Attributes = (attributes) => (desc, context) => {
  context.addInitializer(function () {
    this.attributes = this.attributes || BMap.create();
    this.attributes = BMap.set(context.name, attributes, this.attributes);
  });
};
