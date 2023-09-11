import type { SelectResult } from './query-builders/select.types.ts';
import type { SQLiteDelete, SQLiteInsert, SQLiteSelect, SQLiteUpdate } from './sqlite-core/index.ts';
import type { SQLiteRelationalQuery } from './sqlite-core/query-builders/query.ts';
import type { SQLiteRaw } from './sqlite-core/query-builders/raw.ts';

export type BatchParameters<TDriverResult = any> =
	| SQLiteUpdate<any, 'async', TDriverResult, any>
	| SQLiteSelect<any, 'async', TDriverResult, any, any>
	| SQLiteDelete<any, 'async', TDriverResult, any>
	| Omit<SQLiteDelete<any, 'async', TDriverResult, any>, 'where'>
	| Omit<SQLiteUpdate<any, 'async', TDriverResult, any>, 'where'>
	| SQLiteInsert<any, 'async', TDriverResult, any>
	| SQLiteRelationalQuery<'async', any>
	| SQLiteRaw<any>;

export type BatchResponse<U extends BatchParameters, TQuery extends Readonly<[U, ...U[]]>> = {
	[K in keyof TQuery]: TQuery[K] extends
		SQLiteSelect<infer _TTable, 'async', infer _TRes, infer TSelection, infer TSelectMode, infer TNullabilityMap>
		? SelectResult<TSelection, TSelectMode, TNullabilityMap>[]
		: TQuery[K] extends SQLiteUpdate<infer _TTable, 'async', infer _TRunResult, infer _TReturning>
			? _TReturning extends undefined ? _TRunResult : _TReturning[]
		: TQuery[K] extends Omit<SQLiteUpdate<infer _TTable, 'async', infer _TRunResult, infer _TReturning>, 'where'>
			? _TReturning extends undefined ? _TRunResult : _TReturning[]
		: TQuery[K] extends SQLiteInsert<infer _TTable, 'async', infer _TRunResult, infer _TReturning>
			? _TReturning extends undefined ? _TRunResult : _TReturning[]
		: TQuery[K] extends SQLiteDelete<infer _TTable, 'async', infer _TRunResult, infer _TReturning>
			? _TReturning extends undefined ? _TRunResult : _TReturning[]
		: TQuery[K] extends Omit<SQLiteDelete<infer _TTable, 'async', infer _TRunResult, infer _TReturning>, 'where'>
			? _TReturning extends undefined ? _TRunResult : _TReturning[]
		: TQuery[K] extends SQLiteRelationalQuery<'async', infer TResult> ? TResult
		: TQuery[K] extends SQLiteRaw<infer TResult> ? TResult
		: never;
};
