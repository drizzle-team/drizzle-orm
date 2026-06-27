import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';

export type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I
	: never;

export type LastOf<U> = UnionToIntersection<U extends any ? (f: U) => void : never> extends ((f: infer L) => void) ? L
	: never;

export type UnionToTuple<U, L = LastOf<U>> = [U] extends [never] ? [] : [...UnionToTuple<Exclude<U, L>>, L];

export class YieldableQuery<TRes = unknown> {
	static readonly [entityKind]: string = 'YieldableQuery';
	declare readonly $brand: 'YieldableQuery';

	constructor(
		readonly sql: SQL,
		readonly noResponse: boolean,
		/** For drivers that can only query in array mode */
		readonly arrayToObjectShape?: string[],
	) {}

	*[Symbol.iterator](): Generator<YieldableQuery<TRes>, TRes> {
		return (yield this) as TRes;
	}

	reshape(arrayInput: unknown[]): TRes {
		const { arrayToObjectShape } = this;
		if (!arrayToObjectShape) {
			throw new Error("Can't use `reshape` without `arrayToObjectShape` mapping instructions"!);
		}

		if (arrayInput.length !== arrayToObjectShape.length) {
			throw new Error(
				`Unable to parse array [ ${arrayInput.join(', ')} ] to shape { ${
					arrayToObjectShape.join(', ')
				} } because of item number mismatch`,
			);
		}

		return Object.fromEntries(arrayInput.map((v, i) => [arrayToObjectShape[i], v]));
	}

	static withResult<TRes extends Record<string, unknown> = Record<string, unknown>>(
		query: SQL,
		arrayToObjectShape?: UnionToTuple<keyof TRes>,
	): YieldableQuery<TRes[]> {
		return new YieldableQuery(query, false, arrayToObjectShape as string[] | undefined);
	}

	static silent(
		query: SQL,
	): YieldableQuery<void> {
		return new YieldableQuery<void>(query, true);
	}

	static batch(queries: (SQL)[]): YieldableQueryBatch {
		return new YieldableQueryBatch(queries);
	}
}

export class YieldableQueryBatch {
	static readonly [entityKind]: string = 'YieldableQueryBatch';
	declare readonly $brand: 'YieldableQueryBatch';

	constructor(
		readonly queries: (SQL)[],
	) {}

	*[Symbol.iterator](): Generator<YieldableQueryBatch, void> {
		return (yield this) as void;
	}
}

export type QueryGenerator<TRes = unknown> = Generator<
	YieldableQuery | YieldableQueryBatch | QueryGenerator,
	TRes,
	any
>;
