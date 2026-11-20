import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { SQLWrapper } from '~/sql/sql.ts';
import type { SQLiteInsertBuilder, SQLiteInsertHKTBase } from '~/sqlite-core/query-builders/insert.ts';
import { SQLiteInsertBase } from '~/sqlite-core/query-builders/insert.ts';
import type { SQLiteTable } from '~/sqlite-core/table.ts';
import type { DrizzleTypeError } from '~/utils.ts';
import { applyMixins, type Assume } from '~/utils.ts';
import { type SQLiteRunnableMethods, SQLiteRunnableQuery } from '../query-builders/runnable.ts';
import { SQLiteAsyncRunnableQuery } from './runnable.ts';
import type { SQLiteAsyncPreparedQuery, SQLiteAsyncPreparedQueryConfig, SQLiteAsyncSession } from './session.ts';

export interface SQLiteAsyncInsertHKT extends SQLiteInsertHKTBase {
	_type: SQLiteAsyncInsertBase<
		Assume<this['table'], SQLiteTable>,
		Assume<this['resultType'], 'sync' | 'async'>,
		this['runResult'],
		this['returning'],
		this['mayReturnEmpty'],
		this['dynamic'],
		this['excludedMethods']
	>;
}

export type AnySQLiteAsyncInsert = SQLiteAsyncInsertBase<any, any, any, any, any, any, any>;

export type SQLiteAsyncInsert<
	TTable extends SQLiteTable = SQLiteTable,
	TResultType extends 'sync' | 'async' = 'sync' | 'async',
	TRunResult = unknown,
	TReturning = any,
> = SQLiteAsyncInsertBase<TTable, TResultType, TRunResult, TReturning, boolean, true, never>;

export type SQLiteAsyncInsertBuilder<
	TTable extends SQLiteTable,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TColumnList extends string[] | 'all' = 'all',
> = SQLiteInsertBuilder<TTable, TRunResult, TColumnList, SQLiteAsyncInsertHKT & { resultType: TResultType }>;

export type SQLiteAsyncInsertExecute<T extends AnySQLiteAsyncInsert> = T['_']['returning'] extends undefined
	? T['_']['runResult']
	: T['_']['returning'][];

export type SQLiteAsyncInsertPrepare<T extends AnySQLiteAsyncInsert> = SQLiteAsyncPreparedQuery<
	SQLiteAsyncPreparedQueryConfig & {
		type: T['_']['resultType'];
		run: T['_']['runResult'];
		all: T['_']['returning'] extends undefined ? DrizzleTypeError<'.all() cannot be used without .returning()'>
			: T['_']['returning'][];
		get: T['_']['returning'] extends undefined ? DrizzleTypeError<'.get() cannot be used without .returning()'>
			: T['_']['mayReturnEmpty'] extends false ? T['_']['returning']
			: T['_']['returning'] | undefined;
		values: T['_']['returning'] extends undefined ? DrizzleTypeError<'.values() cannot be used without .returning()'>
			: any[][];
		execute: SQLiteAsyncInsertExecute<T>;
	}
>;

export interface SQLiteAsyncInsertBase<
	// oxlint-disable-next-line no-unused-vars
	TTable extends SQLiteTable,
	// oxlint-disable-next-line no-unused-vars
	TResultType extends 'sync' | 'async',
	TRunResult,
	TReturning = undefined,
	// oxlint-disable-next-line no-unused-vars
	TMayReturnEmpty extends boolean = false,
	// oxlint-disable-next-line no-unused-vars
	TDynamic extends boolean = false,
	// oxlint-disable-next-line no-unused-vars
	TExcludedMethods extends string = never,
> extends
	SQLiteInsertBase<
		SQLiteAsyncInsertHKT & { resultType: TResultType },
		TTable,
		TRunResult,
		TReturning,
		TMayReturnEmpty,
		TDynamic,
		TExcludedMethods
	>,
	QueryPromise<TReturning extends undefined ? TRunResult : TReturning[]>,
	SQLiteRunnableMethods
{
	readonly _:
		& SQLiteInsertBase<
			SQLiteAsyncInsertHKT & { resultType: TResultType },
			TTable,
			TRunResult,
			TReturning,
			TMayReturnEmpty,
			TDynamic,
			TExcludedMethods
		>['_']
		& { readonly resultType: TResultType };

	/** @internal */
	_prepare(prepare?: boolean): SQLiteAsyncInsertPrepare<this>;

	prepare(): SQLiteAsyncInsertPrepare<this>;
}

export class SQLiteAsyncInsertBase<
	TTable extends SQLiteTable,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TResultType extends 'sync' | 'async',
	TRunResult,
	TReturning = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TMayReturnEmpty extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends SQLiteInsertBase<
	SQLiteAsyncInsertHKT & { resultType: TResultType },
	TTable,
	TRunResult,
	TReturning,
	TMayReturnEmpty,
	TDynamic,
	TExcludedMethods
> implements RunnableQuery<TReturning extends undefined ? TRunResult : TReturning[], 'sqlite'>, SQLWrapper {
	static override readonly [entityKind]: string = 'SQLiteAsyncInsert';

	declare protected session: SQLiteAsyncSession<TResultType, TRunResult, any>;
}

applyMixins(SQLiteAsyncInsertBase, [QueryPromise, SQLiteRunnableQuery, SQLiteAsyncRunnableQuery]);
