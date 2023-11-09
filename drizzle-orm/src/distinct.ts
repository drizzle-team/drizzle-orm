import { entityKind, is } from './entity.ts';
import { type SQLWrapper } from './index.ts';

/** @internal */
export const DistinctValue = Symbol.for('drizzle:DistinctValue');

export class Distinct<T extends SQLWrapper = SQLWrapper> {
  static readonly [entityKind]: string = 'Distinct';

  declare readonly _: {
		readonly type: T;
	};

  /** @internal */
	static readonly Symbol = {
		Value: DistinctValue as typeof DistinctValue,
	};

  /** @internal */
	[DistinctValue]: T;

  constructor(value: T) {
    this[DistinctValue] = value;
  }
}

export type MaybeDistinct<T extends SQLWrapper = SQLWrapper> = T | Distinct<T>;

export type WithoutDistinct<T> = T extends Distinct ? T['_']['type'] : T;

export function distinct<T extends SQLWrapper = SQLWrapper>(value: T) {
  return new Distinct(value);
}

/** @internal */
export function getValueWithDistinct<T>(value: T): {
  value: WithoutDistinct<T>;
  distinct: boolean;
} {
  if (is(value, Distinct)) {
    return {
      value: value[DistinctValue],
      distinct: true
    } as any;
  }

  return {
    value,
    distinct: false
  } as any;
}