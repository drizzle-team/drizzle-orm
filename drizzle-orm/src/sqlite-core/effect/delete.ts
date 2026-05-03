import type * as Effect from 'effect/Effect';
import { applyEffectWrapper, type QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { SelectResultFields } from '~/query-builders/select.types.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { Placeholder, Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import type { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import type { SQLiteDeleteConfig } from '~/sqlite-core/query-builders/delete.ts';
import type { SelectedFieldsFlat } from '~/sqlite-core/query-builders/select.types.ts';
import type { PreparedQueryConfig } from '~/sqlite-core/session.ts';
import { SQLiteTable } from '~/sqlite-core/table.ts';
import { extractUsedTable } from '~/sqlite-core/utils.ts';
import type { Subquery } from '~/subquery.ts';
import { Table } from '~/table.ts';
import { type DrizzleTypeError, orderSelectedFields, type ValueOrArray } from '~/utils.ts';
import type { SQLiteColumn } from '../columns/common.ts';
import type { SQLiteEffectPreparedQuery, SQLiteEffectSession } from './session.ts';

export type SQLiteEffectDeleteWithout<
	T extends AnySQLiteEffectDelete,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T
	: Omit<
		SQLiteEffectDeleteBase<
			T['_']['table'],
			T['_']['runResult'],
			T['_']['returning'],
			TDynamic,
			T['_']['excludedMethods'] | K,
			T['_']['effectHKT']
		>,
		T['_']['excludedMethods'] | K
	>;

export type SQLiteEffectDeleteReturningAll<
	T extends AnySQLiteEffectDelete,
	TDynamic extends boolean,
> = SQLiteEffectDeleteWithout<
	SQLiteEffectDeleteBase<
		T['_']['table'],
		T['_']['runResult'],
		T['_']['table']['$inferSelect'],
		T['_']['dynamic'],
		T['_']['excludedMethods'],
		T['_']['effectHKT']
	>,
	TDynamic,
	'returning'
>;

export type SQLiteEffectDeleteReturning<
	T extends AnySQLiteEffectDelete,
	TDynamic extends boolean,
	TSelectedFields extends SelectedFieldsFlat,
> = SQLiteEffectDeleteWithout<
	SQLiteEffectDeleteBase<
		T['_']['table'],
		T['_']['runResult'],
		SelectResultFields<TSelectedFields>,
		T['_']['dynamic'],
		T['_']['excludedMethods'],
		T['_']['effectHKT']
	>,
	TDynamic,
	'returning'
>;

export type SQLiteEffectDeleteExecute<T extends AnySQLiteEffectDelete> = T['_']['returning'] extends undefined
	? T['_']['runResult']
	: T['_']['returning'][];

export type SQLiteEffectDeletePrepare<
	T extends AnySQLiteEffectDelete,
	TEffectHKT extends QueryEffectHKTBase = T['_']['effectHKT'],
> = SQLiteEffectPreparedQuery<
	PreparedQueryConfig & {
		run: T['_']['runResult'];
		all: T['_']['returning'] extends undefined ? DrizzleTypeError<'.all() cannot be used without .returning()'>
			: T['_']['returning'][];
		get: T['_']['returning'] extends undefined ? DrizzleTypeError<'.get() cannot be used without .returning()'>
			: T['_']['returning'] | undefined;
		values: T['_']['returning'] extends undefined ? DrizzleTypeError<'.values() cannot be used without .returning()'>
			: any[][];
		execute: SQLiteEffectDeleteExecute<T>;
	},
	TEffectHKT
>;

export type SQLiteEffectDeleteDynamic<T extends AnySQLiteEffectDelete> = SQLiteEffectDelete<
	T['_']['table'],
	T['_']['runResult'],
	T['_']['returning'],
	T['_']['effectHKT']
>;

export type SQLiteEffectDelete<
	TTable extends SQLiteTable = SQLiteTable,
	TRunResult = unknown,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> = SQLiteEffectDeleteBase<TTable, TRunResult, TReturning, true, never, TEffectHKT>;

export type AnySQLiteEffectDelete = SQLiteEffectDeleteBase<any, any, any, any, any, any>;

export interface SQLiteEffectDeleteBase<
	TTable extends SQLiteTable,
	TRunResult,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	_TExcludedMethods extends string = never,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> extends
	RunnableQuery<TReturning extends undefined ? TRunResult : TReturning[], 'sqlite'>,
	SQLWrapper,
	Effect.Effect<TReturning extends undefined ? TRunResult : TReturning[], TEffectHKT['error'], TEffectHKT['context']>
{
	readonly _: {
		dialect: 'sqlite';
		readonly table: TTable;
		readonly resultType: 'async';
		readonly runResult: TRunResult;
		readonly returning: TReturning;
		readonly dynamic: TDynamic;
		readonly excludedMethods: _TExcludedMethods;
		readonly result: TReturning extends undefined ? TRunResult : TReturning[];
		readonly effectHKT: TEffectHKT;
	};
}

export class SQLiteEffectDeleteBase<
	TTable extends SQLiteTable,
	TRunResult,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	_TExcludedMethods extends string = never,
	TEffectHKT extends QueryEffectHKTBase = QueryEffectHKTBase,
> implements RunnableQuery<TReturning extends undefined ? TRunResult : TReturning[], 'sqlite'>, SQLWrapper {
	static readonly [entityKind]: string = 'SQLiteEffectDelete';

	/** @internal */
	config: SQLiteDeleteConfig;

	constructor(
		private table: TTable,
		private effectSession: SQLiteEffectSession<TEffectHKT, TRunResult, any>,
		private effectDialect: SQLiteDialect,
		withList?: Subquery[],
	) {
		this.config = { table, withList };
	}

	where(where: SQL | undefined): SQLiteEffectDeleteWithout<this, TDynamic, 'where'> {
		this.config.where = where;
		return this as any;
	}

	orderBy(
		builder: (deleteTable: TTable) => ValueOrArray<SQLiteColumn | SQL | SQL.Aliased>,
	): SQLiteEffectDeleteWithout<this, TDynamic, 'orderBy'>;
	orderBy(...columns: (SQLiteColumn | SQL | SQL.Aliased)[]): SQLiteEffectDeleteWithout<this, TDynamic, 'orderBy'>;
	orderBy(
		...columns:
			| [(deleteTable: TTable) => ValueOrArray<SQLiteColumn | SQL | SQL.Aliased>]
			| (SQLiteColumn | SQL | SQL.Aliased)[]
	): SQLiteEffectDeleteWithout<this, TDynamic, 'orderBy'> {
		if (typeof columns[0] === 'function') {
			const orderBy = columns[0](
				new Proxy(
					this.config.table[Table.Symbol.Columns],
					new SelectionProxyHandler({ sqlAliasedBehavior: 'alias', sqlBehavior: 'sql' }),
				) as any,
			);

			this.config.orderBy = Array.isArray(orderBy) ? orderBy : [orderBy];
			return this as any;
		}

		this.config.orderBy = columns as (SQLiteColumn | SQL | SQL.Aliased)[];
		return this as any;
	}

	limit(limit: number | Placeholder): SQLiteEffectDeleteWithout<this, TDynamic, 'limit'> {
		this.config.limit = limit;
		return this as any;
	}

	returning(): SQLiteEffectDeleteReturningAll<this, TDynamic>;
	returning<TSelectedFields extends SelectedFieldsFlat>(
		fields: TSelectedFields,
	): SQLiteEffectDeleteReturning<this, TDynamic, TSelectedFields>;
	returning(
		fields: SelectedFieldsFlat = this.table[SQLiteTable.Symbol.Columns],
	): SQLiteEffectDeleteReturning<this, TDynamic, any> | SQLiteEffectDeleteReturningAll<this, TDynamic> {
		this.config.returning = orderSelectedFields<SQLiteColumn>(fields);
		return this as any;
	}

	/** @internal */
	getSQL(): SQL {
		return this.effectDialect.buildDeleteQuery(this.config);
	}

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.effectDialect.sqlToQuery(this.getSQL());
		return rest;
	}

	/** @internal */
	_prepare(isOneTimeQuery = true): SQLiteEffectDeletePrepare<this, TEffectHKT> {
		return this.effectSession[isOneTimeQuery ? 'prepareOneTimeQuery' : 'prepareQuery'](
			this.effectDialect.sqlToQuery(this.getSQL()),
			this.config.returning,
			this.config.returning ? 'all' : 'run',
			undefined,
			{
				type: 'delete',
				tables: extractUsedTable(this.config.table),
			},
		) as SQLiteEffectDeletePrepare<this, TEffectHKT>;
	}

	prepare(): SQLiteEffectDeletePrepare<this, TEffectHKT> {
		return this._prepare(false);
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

	execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return this._prepare().execute(placeholderValues);
	};

	$dynamic(): SQLiteEffectDeleteDynamic<this> {
		return this as any;
	}
}

applyEffectWrapper(SQLiteEffectDeleteBase);
