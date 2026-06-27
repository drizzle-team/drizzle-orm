import { entityKind } from '~/entity.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { SQLWrapper } from '~/sql/sql.ts';
import type { SQLiteInsertBuilder, SQLiteInsertHKTBase } from '~/sqlite-core/query-builders/insert.ts';
import { SQLiteInsertBase } from '~/sqlite-core/query-builders/insert.ts';
import type { SQLiteTable } from '~/sqlite-core/table.ts';
import type { DrizzleTypeError } from '~/utils.ts';
import { applyMixins, type Assume } from '~/utils.ts';
import { extractUsedTable } from '../utils.ts';
import type { SQLiteAsyncPreparedQuery, SQLiteAsyncPreparedQueryConfig, SQLiteAsyncSession } from './session.ts';

export interface SQLiteAsyncInsertHKT extends SQLiteInsertHKTBase {
	_type: SQLiteAsyncInsertBase<
		Assume<this['table'], SQLiteTable>,
		Assume<this['resultType'], 'sync' | 'async'>,
		this['runResult'],
		this['returning'],
		this['dynamic'],
		this['excludedMethods']
	>;
}

export type AnySQLiteAsyncInsert = SQLiteAsyncInsertBase<any, any, any, any, any, any>;

export type SQLiteAsyncInsert<
	TTable extends SQLiteTable = SQLiteTable,
	TResultType extends 'sync' | 'async' = 'sync' | 'async',
	TRunResult = unknown,
	TReturning = any,
> = SQLiteAsyncInsertBase<TTable, TResultType, TRunResult, TReturning, true, never>;

export type SQLiteAsyncInsertBuilder<
	TTable extends SQLiteTable,
	TResultType extends 'sync' | 'async',
	TRunResult,
> = SQLiteInsertBuilder<TTable, TRunResult, SQLiteAsyncInsertHKT & { resultType: TResultType }>;

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
			: T['_']['returning'];
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
	TDynamic extends boolean = false,
	// oxlint-disable-next-line no-unused-vars
	TExcludedMethods extends string = never,
> extends
	SQLiteInsertBase<
		SQLiteAsyncInsertHKT & { resultType: TResultType },
		TTable,
		TRunResult,
		TReturning,
		TDynamic,
		TExcludedMethods
	>,
	QueryPromise<TReturning extends undefined ? TRunResult : TReturning[]>
{
	readonly _:
		& SQLiteInsertBase<
			SQLiteAsyncInsertHKT & { resultType: TResultType },
			TTable,
			TRunResult,
			TReturning,
			TDynamic,
			TExcludedMethods
		>['_']
		& { readonly resultType: TResultType };
}

export class SQLiteAsyncInsertBase<
	TTable extends SQLiteTable,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TResultType extends 'sync' | 'async',
	TRunResult,
	TReturning = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends SQLiteInsertBase<
	SQLiteAsyncInsertHKT & { resultType: TResultType },
	TTable,
	TRunResult,
	TReturning,
	TDynamic,
	TExcludedMethods
> implements RunnableQuery<TReturning extends undefined ? TRunResult : TReturning[], 'sqlite'>, SQLWrapper {
	static override readonly [entityKind]: string = 'SQLiteAsyncInsert';

	declare protected session: SQLiteAsyncSession<TResultType, TRunResult, any>;

	/** @internal */
	_prepare(prepare = false): SQLiteAsyncInsertPrepare<this> {
		return this.session.prepareQuery(
			this.dialect.sqlToQuery(this.getSQL()),
			'arrays',
			prepare,
			this.config.returning ? 'all' : 'run',
			this.config.returning ? this.dialect.mapperGenerators.rows(this.config.returning, undefined) : undefined,
			{
				type: 'insert',
				tables: extractUsedTable(this.config.table),
			},
		) as SQLiteAsyncInsertPrepare<this>;
	}

	prepare(): SQLiteAsyncInsertPrepare<this> {
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

	async execute(): Promise<SQLiteAsyncInsertExecute<this>> {
		return this._prepare().execute() as SQLiteAsyncInsertExecute<this>;
	}
}

applyMixins(SQLiteAsyncInsertBase, [QueryPromise]);
