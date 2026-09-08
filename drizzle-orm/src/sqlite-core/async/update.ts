import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { SQL, SQLWrapper } from '~/sql/sql.ts';
import type { SQLiteUpdateBuilder, SQLiteUpdateHKTBase } from '~/sqlite-core/query-builders/update.ts';
import { SQLiteUpdateBase } from '~/sqlite-core/query-builders/update.ts';
import type { SQLiteTable } from '~/sqlite-core/table.ts';
import type { Subquery } from '~/subquery.ts';
import { applyMixins, type Assume, type DrizzleTypeError } from '~/utils.ts';
import { extractUsedTable } from '../utils.ts';
import type { SQLiteViewBase } from '../view-base.ts';
import type { SQLiteAsyncPreparedQuery, SQLiteAsyncPreparedQueryConfig, SQLiteAsyncSession } from './session.ts';

export interface SQLiteAsyncUpdateHKT extends SQLiteUpdateHKTBase {
	_type: SQLiteAsyncUpdateBase<
		Assume<this['table'], SQLiteTable>,
		Assume<this['resultType'], 'sync' | 'async'>,
		this['runResult'],
		Assume<this['from'], SQLiteTable | Subquery | SQLiteViewBase | SQL | undefined>,
		this['returning'],
		this['dynamic'],
		this['excludedMethods']
	>;
}

export type AnySQLiteAsyncUpdate = SQLiteAsyncUpdateBase<any, any, any, any, any, any, any>;

export type SQLiteAsyncUpdate<
	TTable extends SQLiteTable = SQLiteTable,
	TResultType extends 'sync' | 'async' = 'sync' | 'async',
	TRunResult = any,
	TFrom extends SQLiteTable | Subquery | SQLiteViewBase | SQL | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
> = SQLiteAsyncUpdateBase<TTable, TResultType, TRunResult, TFrom, TReturning, true, never>;

export type SQLiteAsyncUpdateBuilder<
	TTable extends SQLiteTable,
	TResultType extends 'sync' | 'async',
	TRunResult,
> = SQLiteUpdateBuilder<TTable, TRunResult, SQLiteAsyncUpdateHKT & { resultType: TResultType }>;

export type SQLiteAsyncUpdateExecute<T extends AnySQLiteAsyncUpdate> = T['_']['returning'] extends undefined
	? T['_']['runResult']
	: T['_']['returning'][];

export type SQLiteAsyncUpdatePrepare<T extends AnySQLiteAsyncUpdate> = SQLiteAsyncPreparedQuery<
	SQLiteAsyncPreparedQueryConfig & {
		type: T['_']['resultType'];
		run: T['_']['runResult'];
		all: T['_']['returning'] extends undefined ? DrizzleTypeError<'.all() cannot be used without .returning()'>
			: T['_']['returning'][];
		get: T['_']['returning'] extends undefined ? DrizzleTypeError<'.get() cannot be used without .returning()'>
			: T['_']['returning'];
		values: T['_']['returning'] extends undefined ? DrizzleTypeError<'.values() cannot be used without .returning()'>
			: any[][];
		execute: SQLiteAsyncUpdateExecute<T>;
	}
>;

export interface SQLiteAsyncUpdateBase<
	// oxlint-disable-next-line no-unused-vars
	TTable extends SQLiteTable = SQLiteTable,
	// oxlint-disable-next-line no-unused-vars
	TResultType extends 'sync' | 'async' = 'sync' | 'async',
	TRunResult = unknown,
	// oxlint-disable-next-line no-unused-vars
	TFrom extends SQLiteTable | Subquery | SQLiteViewBase | SQL | undefined = undefined,
	TReturning = undefined,
	// oxlint-disable-next-line no-unused-vars
	TDynamic extends boolean = false,
	// oxlint-disable-next-line no-unused-vars
	TExcludedMethods extends string = never,
> extends
	SQLiteUpdateBase<
		SQLiteAsyncUpdateHKT & { resultType: TResultType },
		TTable,
		TRunResult,
		TFrom,
		TReturning,
		TDynamic,
		TExcludedMethods
	>,
	QueryPromise<TReturning extends undefined ? TRunResult : TReturning[]>
{
	readonly _:
		& SQLiteUpdateBase<
			SQLiteAsyncUpdateHKT & { resultType: TResultType },
			TTable,
			TRunResult,
			TFrom,
			TReturning,
			TDynamic,
			TExcludedMethods
		>['_']
		& { readonly resultType: TResultType };
}

export class SQLiteAsyncUpdateBase<
	TTable extends SQLiteTable = SQLiteTable,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TResultType extends 'sync' | 'async' = 'sync' | 'async',
	TRunResult = unknown,
	TFrom extends SQLiteTable | Subquery | SQLiteViewBase | SQL | undefined = undefined,
	TReturning = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends SQLiteUpdateBase<
	SQLiteAsyncUpdateHKT & { resultType: TResultType },
	TTable,
	TRunResult,
	TFrom,
	TReturning,
	TDynamic,
	TExcludedMethods
> implements RunnableQuery<TReturning extends undefined ? TRunResult : TReturning[], 'sqlite'>, SQLWrapper {
	static override readonly [entityKind]: string = 'SQLiteAsyncUpdate';

	declare protected session: SQLiteAsyncSession<TResultType, TRunResult, any>;

	/** @internal */
	_prepare(prepare = false): SQLiteAsyncUpdatePrepare<this> {
		return this.session.prepareQuery(
			this.dialect.sqlToQuery(this.getSQL()),
			'arrays',
			prepare,
			this.config.returning ? 'all' : 'run',
			this.config.returning ? this.dialect.mapperGenerators.rows(this.config.returning, undefined) : undefined,
			{
				type: 'update',
				tables: extractUsedTable(this.config.table),
			},
		) as SQLiteAsyncUpdatePrepare<this>;
	}

	prepare(): SQLiteAsyncUpdatePrepare<this> {
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

	async execute(): Promise<SQLiteAsyncUpdateExecute<this>> {
		return (this.config.returning ? this.all() : this.run()) as SQLiteAsyncUpdateExecute<this>;
	}
}

applyMixins(SQLiteAsyncUpdateBase, [QueryPromise]);
