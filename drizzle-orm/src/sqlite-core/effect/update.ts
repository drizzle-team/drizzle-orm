import { applyEffectWrapper, type QueryEffectHKTBase, type QueryEffectKind } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { SQL, SQLWrapper } from '~/sql/sql.ts';
import type { SQLiteUpdateBuilder, SQLiteUpdateHKTBase } from '~/sqlite-core/query-builders/update.ts';
import { SQLiteUpdateBase } from '~/sqlite-core/query-builders/update.ts';
import type { PreparedQueryConfig } from '~/sqlite-core/session.ts';
import type { SQLiteTable } from '~/sqlite-core/table.ts';
import type { Subquery } from '~/subquery.ts';
import type { Assume, DrizzleTypeError } from '~/utils.ts';
import { extractUsedTable } from '../utils.ts';
import type { SQLiteViewBase } from '../view-base.ts';
import type { SQLiteEffectPreparedQuery, SQLiteEffectSession } from './session.ts';

export interface SQLiteEffectUpdateHKT<TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase>
	extends SQLiteUpdateHKTBase
{
	_type: SQLiteEffectUpdateBase<
		Assume<this['table'], SQLiteTable>,
		this['runResult'],
		Assume<this['from'], SQLiteTable | Subquery | SQLiteViewBase | SQL | undefined>,
		this['returning'],
		this['dynamic'],
		this['excludedMethods'],
		TEffectHKT
	>;
}

export type AnySQLiteEffectUpdate = SQLiteEffectUpdateBase<any, any, any, any, any, any, any>;

export type SQLiteEffectUpdate<
	TTable extends SQLiteTable = SQLiteTable,
	TRunResult = any,
	TFrom extends SQLiteTable | Subquery | SQLiteViewBase | SQL | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> = SQLiteEffectUpdateBase<TTable, TRunResult, TFrom, TReturning, true, never, TEffectHKT>;

export type SQLiteEffectUpdateBuilder<
	TTable extends SQLiteTable,
	TRunResult,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> = SQLiteUpdateBuilder<TTable, TRunResult, SQLiteEffectUpdateHKT<TEffectHKT>>;

export type SQLiteEffectUpdateExecute<T extends AnySQLiteEffectUpdate> = T['_']['returning'] extends undefined
	? T['_']['runResult']
	: T['_']['returning'][];

export type SQLiteEffectUpdatePrepare<
	T extends AnySQLiteEffectUpdate,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> = SQLiteEffectPreparedQuery<
	PreparedQueryConfig & {
		run: T['_']['runResult'];
		all: T['_']['returning'] extends undefined ? DrizzleTypeError<'.all() cannot be used without .returning()'>
			: T['_']['returning'][];
		get: T['_']['returning'] extends undefined ? DrizzleTypeError<'.get() cannot be used without .returning()'>
			: T['_']['returning'];
		values: T['_']['returning'] extends undefined ? DrizzleTypeError<'.values() cannot be used without .returning()'>
			: any[][];
		execute: SQLiteEffectUpdateExecute<T>;
	},
	TEffectHKT
>;

export interface SQLiteEffectUpdateBase<
	// oxlint-disable-next-line no-unused-vars
	TTable extends SQLiteTable = SQLiteTable,
	TRunResult = unknown,
	// oxlint-disable-next-line no-unused-vars
	TFrom extends SQLiteTable | Subquery | SQLiteViewBase | SQL | undefined = undefined,
	TReturning = undefined,
	// oxlint-disable-next-line no-unused-vars
	TDynamic extends boolean = false,
	// oxlint-disable-next-line no-unused-vars
	TExcludedMethods extends string = never,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends QueryEffectKind<TEffectHKT, TReturning extends undefined ? TRunResult : TReturning[]> {}

export class SQLiteEffectUpdateBase<
	TTable extends SQLiteTable = SQLiteTable,
	TRunResult = unknown,
	TFrom extends SQLiteTable | Subquery | SQLiteViewBase | SQL | undefined = undefined,
	TReturning = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends SQLiteUpdateBase<
	SQLiteEffectUpdateHKT<TEffectHKT>,
	TTable,
	TRunResult,
	TFrom,
	TReturning,
	TDynamic,
	TExcludedMethods
> implements RunnableQuery<TReturning extends undefined ? TRunResult : TReturning[], 'sqlite'>, SQLWrapper {
	static override readonly [entityKind]: string = 'SQLiteEffectUpdate';

	declare protected session: SQLiteEffectSession<TRunResult, TEffectHKT, any>;

	/** @internal */
	_prepare(prepare = false): SQLiteEffectUpdatePrepare<this, TEffectHKT> {
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
		) as SQLiteEffectUpdatePrepare<this, TEffectHKT>;
	}

	prepare(): SQLiteEffectUpdatePrepare<this, TEffectHKT> {
		return this._prepare(true);
	}

	run: ReturnType<this['prepare']>['run'] = (placeholderValues?: Record<string, unknown>) => {
		return this._prepare().run(placeholderValues);
	};

	all: ReturnType<this['prepare']>['all'] = (placeholderValues?: Record<string, unknown>) => {
		return this._prepare().all(placeholderValues);
	};

	get: ReturnType<this['prepare']>['get'] = (placeholderValues?: Record<string, unknown>) => {
		return this._prepare().get(placeholderValues);
	};

	values: ReturnType<this['prepare']>['values'] = (placeholderValues?: Record<string, unknown>) => {
		return this._prepare().values(placeholderValues);
	};

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues?: Record<string, unknown>) => {
		return this._prepare().execute(placeholderValues);
	};
}

applyEffectWrapper(SQLiteEffectUpdateBase);
