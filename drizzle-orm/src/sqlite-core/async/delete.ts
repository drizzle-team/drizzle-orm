import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { SQLWrapper } from '~/sql/sql.ts';
import type { SQLiteDeleteHKTBase } from '~/sqlite-core/query-builders/delete.ts';
import { SQLiteDeleteBase } from '~/sqlite-core/query-builders/delete.ts';
import type { SQLiteTable } from '~/sqlite-core/table.ts';
import { applyMixins, type Assume, type DrizzleTypeError } from '~/utils.ts';
import { extractUsedTable } from '../utils.ts';
import type { SQLiteAsyncPreparedQuery, SQLiteAsyncPreparedQueryConfig, SQLiteAsyncSession } from './session.ts';

export interface SQLiteAsyncDeleteHKT extends SQLiteDeleteHKTBase {
	_type: SQLiteAsyncDeleteBase<
		Assume<this['table'], SQLiteTable>,
		Assume<this['resultType'], 'sync' | 'async'>,
		this['runResult'],
		Assume<this['returning'], Record<string, unknown> | undefined>,
		this['dynamic'],
		this['excludedMethods']
	>;
}

export type AnySQLiteAsyncDelete = SQLiteAsyncDeleteBase<any, any, any, any, any, any>;

export type SQLiteAsyncDelete<
	TTable extends SQLiteTable = SQLiteTable,
	TResultType extends 'sync' | 'async' = 'sync' | 'async',
	TRunResult = unknown,
	TReturning extends Record<string, unknown> | undefined = undefined,
> = SQLiteAsyncDeleteBase<TTable, TResultType, TRunResult, TReturning, true, never>;

export type SQLiteAsyncDeleteExecute<T extends AnySQLiteAsyncDelete> = T['_']['returning'] extends undefined
	? T['_']['runResult']
	: T['_']['returning'][];

export type SQLiteAsyncDeletePrepare<T extends AnySQLiteAsyncDelete> = SQLiteAsyncPreparedQuery<
	SQLiteAsyncPreparedQueryConfig & {
		type: T['_']['resultType'];
		run: T['_']['runResult'];
		all: T['_']['returning'] extends undefined ? DrizzleTypeError<'.all() cannot be used without .returning()'>
			: T['_']['returning'][];
		get: T['_']['returning'] extends undefined ? DrizzleTypeError<'.get() cannot be used without .returning()'>
			: T['_']['returning'] | undefined;
		values: T['_']['returning'] extends undefined ? DrizzleTypeError<'.values() cannot be used without .returning()'>
			: any[][];
		execute: SQLiteAsyncDeleteExecute<T>;
	}
>;

export interface SQLiteAsyncDeleteBase<
	// oxlint-disable-next-line no-unused-vars
	TTable extends SQLiteTable,
	// oxlint-disable-next-line no-unused-vars
	TResultType extends 'sync' | 'async',
	TRunResult,
	TReturning extends Record<string, unknown> | undefined = undefined,
	// oxlint-disable-next-line no-unused-vars
	TDynamic extends boolean = false,
	// oxlint-disable-next-line no-unused-vars
	TExcludedMethods extends string = never,
> extends
	SQLiteDeleteBase<
		SQLiteAsyncDeleteHKT & { resultType: TResultType },
		TTable,
		TRunResult,
		TReturning,
		TDynamic,
		TExcludedMethods
	>,
	QueryPromise<TReturning extends undefined ? TRunResult : TReturning[]>
{
	readonly _:
		& SQLiteDeleteBase<
			SQLiteAsyncDeleteHKT & { resultType: TResultType },
			TTable,
			TRunResult,
			TReturning,
			TDynamic,
			TExcludedMethods
		>['_']
		& { readonly resultType: TResultType };
}

export class SQLiteAsyncDeleteBase<
	TTable extends SQLiteTable,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TResultType extends 'sync' | 'async',
	TRunResult,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends SQLiteDeleteBase<
	SQLiteAsyncDeleteHKT & { resultType: TResultType },
	TTable,
	TRunResult,
	TReturning,
	TDynamic,
	TExcludedMethods
> implements RunnableQuery<TReturning extends undefined ? TRunResult : TReturning[], 'sqlite'>, SQLWrapper {
	static override readonly [entityKind]: string = 'SQLiteAsyncDelete';

	declare protected session: SQLiteAsyncSession<TResultType, TRunResult, any>;

	/** @internal */
	_prepare(prepare = false): SQLiteAsyncDeletePrepare<this> {
		return this.session.prepareQuery(
			this.dialect.sqlToQuery(this.getSQL()),
			'arrays',
			prepare,
			this.config.returning ? 'all' : 'run',
			this.config.returning ? this.dialect.mapperGenerators.rows(this.config.returning, undefined) : undefined,
			{
				type: 'delete',
				tables: extractUsedTable(this.config.table),
			},
		) as SQLiteAsyncDeletePrepare<this>;
	}

	prepare(): SQLiteAsyncDeletePrepare<this> {
		return this._prepare(true);
	}

	run: ReturnType<this['prepare']>['run'] = (placeholderValues) => {
		return this._prepare().run(placeholderValues);
	};

	all: ReturnType<this['prepare']>['all'] = (placeholderValues) => {
		return this._prepare().all(placeholderValues);
	};

	get: ReturnType<this['prepare']>['get'] = (placeholderValues) => {
		return this._prepare().get(placeholderValues);
	};

	values: ReturnType<this['prepare']>['values'] = (placeholderValues) => {
		return this._prepare().values(placeholderValues);
	};

	async execute(placeholderValues?: Record<string, unknown>): Promise<SQLiteAsyncDeleteExecute<this>> {
		return this._prepare().execute(placeholderValues) as SQLiteAsyncDeleteExecute<this>;
	}
}

applyMixins(SQLiteAsyncDeleteBase, [QueryPromise]);
