import type { WithCacheConfig } from '~/cache/core/types.ts';
import { QueryEffect } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { DrizzleQueryError } from '~/errors.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { PgQueryResultHKT, PgQueryResultKind, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { PgTable } from '~/pg-core/table.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { SelectResultFields } from '~/query-builders/select.types.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection, Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import { getTableName, Table } from '~/table.ts';
import { orderSelectedFields } from '~/utils.ts';
import type { PgColumn } from '../columns/common.ts';
import type { PgDeleteConfig } from '../query-builders/delete.ts';
import type { SelectedFieldsFlat } from '../query-builders/select.types.ts';
import { extractUsedTable } from '../utils.ts';
import type { EffectPgCorePreparedQuery } from './prepared-query.ts';
import type { EffectPgCoreSession } from './session.ts';

export type EffectPgDeleteWithout<
	T extends EffectAnyPgDeleteBase,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T
	: Omit<
		EffectPgDeleteBase<
			T['_']['table'],
			T['_']['queryResult'],
			T['_']['selectedFields'],
			T['_']['returning'],
			TDynamic,
			T['_']['excludedMethods'] | K
		>,
		T['_']['excludedMethods'] | K
	>;

export type EffectPgDelete<
	TTable extends PgTable = PgTable,
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
> = EffectPgDeleteBase<TTable, TQueryResult, TSelectedFields, TReturning, true, never>;

export type EffectPgDeleteReturningAll<
	T extends EffectAnyPgDeleteBase,
	TDynamic extends boolean,
> = EffectPgDeleteWithout<
	EffectPgDeleteBase<
		T['_']['table'],
		T['_']['queryResult'],
		T['_']['table']['_']['columns'],
		T['_']['table']['$inferSelect'],
		TDynamic,
		T['_']['excludedMethods']
	>,
	TDynamic,
	'returning'
>;

export type EffectPgDeleteReturning<
	T extends EffectAnyPgDeleteBase,
	TDynamic extends boolean,
	TSelectedFields extends SelectedFieldsFlat,
> = EffectPgDeleteWithout<
	EffectPgDeleteBase<
		T['_']['table'],
		T['_']['queryResult'],
		TSelectedFields,
		SelectResultFields<TSelectedFields>,
		TDynamic,
		T['_']['excludedMethods']
	>,
	TDynamic,
	'returning'
>;

export type EffectPgDeletePrepare<T extends EffectAnyPgDeleteBase> = EffectPgCorePreparedQuery<
	PreparedQueryConfig & {
		execute: T['_']['returning'] extends undefined ? PgQueryResultKind<T['_']['queryResult'], never>
			: T['_']['returning'][];
	}
>;

export type EffectPgDeleteDynamic<T extends EffectAnyPgDeleteBase> = EffectPgDelete<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['selectedFields'],
	T['_']['returning']
>;

export type EffectAnyPgDeleteBase = EffectPgDeleteBase<any, any, any, any, any, any>;

export interface EffectPgDeleteBase<
	TTable extends PgTable,
	TQueryResult extends PgQueryResultHKT,
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends
	TypedQueryBuilder<
		TSelectedFields,
		TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[]
	>,
	QueryEffect<
		TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[],
		DrizzleQueryError
	>,
	RunnableQuery<TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[], 'pg'>,
	SQLWrapper
{
	readonly _: {
		readonly dialect: 'pg';
		readonly table: TTable;
		readonly queryResult: TQueryResult;
		readonly selectedFields: TSelectedFields;
		readonly returning: TReturning;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
		readonly result: TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[];
	};
}

export class EffectPgDeleteBase<
	TTable extends PgTable,
	TQueryResult extends PgQueryResultHKT,
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryEffect<
	TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[],
	DrizzleQueryError
> implements
	TypedQueryBuilder<
		TSelectedFields,
		TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[]
	>,
	RunnableQuery<TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[], 'pg'>,
	SQLWrapper
{
	static override readonly [entityKind]: string = 'PgDelete';

	private config: PgDeleteConfig;
	protected cacheConfig?: WithCacheConfig;

	constructor(
		table: TTable,
		private session: EffectPgCoreSession,
		private dialect: PgDialect,
		withList?: Subquery[],
	) {
		super();
		this.config = { table, withList };
	}

	/**
	 * Adds a `where` clause to the query.
	 *
	 * Calling this method will delete only those rows that fulfill a specified condition.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/delete}
	 *
	 * @param where the `where` clause.
	 *
	 * @example
	 * You can use conditional operators and `sql function` to filter the rows to be deleted.
	 *
	 * ```ts
	 * // Delete all cars with green color
	 * yield* db.delete(cars).where(eq(cars.color, 'green'));
	 * // or
	 * yield* db.delete(cars).where(sql`${cars.color} = 'green'`)
	 * ```
	 *
	 * You can logically combine conditional operators with `and()` and `or()` operators:
	 *
	 * ```ts
	 * // Delete all BMW cars with a green color
	 * yield* db.delete(cars).where(and(eq(cars.color, 'green'), eq(cars.brand, 'BMW')));
	 *
	 * // Delete all cars with the green or blue color
	 * yield* db.delete(cars).where(or(eq(cars.color, 'green'), eq(cars.color, 'blue')));
	 * ```
	 */
	where(where: SQL | undefined): EffectPgDeleteWithout<this, TDynamic, 'where'> {
		this.config.where = where;
		return this as any;
	}

	/**
	 * Adds a `returning` clause to the query.
	 *
	 * Calling this method will return the specified fields of the deleted rows. If no fields are specified, all fields will be returned.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/delete#delete-with-return}
	 *
	 * @example
	 * ```ts
	 * // Delete all cars with the green color and return all fields
	 * const deletedCars: Car[] = yield* db.delete(cars)
	 *   .where(eq(cars.color, 'green'))
	 *   .returning();
	 *
	 * // Delete all cars with the green color and return only their id and brand fields
	 * const deletedCarsIdsAndBrands: { id: number, brand: string }[] = yield* db.delete(cars)
	 *   .where(eq(cars.color, 'green'))
	 *   .returning({ id: cars.id, brand: cars.brand });
	 * ```
	 */
	returning(): EffectPgDeleteReturningAll<this, TDynamic>;
	returning<TSelectedFields extends SelectedFieldsFlat>(
		fields: TSelectedFields,
	): EffectPgDeleteReturning<this, TDynamic, TSelectedFields>;
	returning(
		fields: SelectedFieldsFlat = this.config.table[Table.Symbol.Columns],
	): EffectPgDeleteReturning<this, TDynamic, any> | EffectPgDeleteReturningAll<this, TDynamic> {
		this.config.returningFields = fields;
		this.config.returning = orderSelectedFields<PgColumn>(fields);
		return this as any;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildDeleteQuery(this.config);
	}

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	/** @internal */
	_prepare(name?: string): EffectPgDeletePrepare<this> {
		return this.session.prepareQuery<
			PreparedQueryConfig & {
				execute: TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[];
			}
		>(this.dialect.sqlToQuery(this.getSQL()), this.config.returning, name, true, undefined, {
			type: 'delete',
			tables: extractUsedTable(this.config.table),
		}, this.cacheConfig);
	}

	prepare(name: string): EffectPgDeletePrepare<this> {
		return this._prepare(name);
	}

	override execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return this._prepare().execute(placeholderValues);
	};

	/** @internal */
	getSelectedFields(): this['_']['selectedFields'] {
		return (
			this.config.returningFields
				? new Proxy(
					this.config.returningFields,
					new SelectionProxyHandler({
						alias: getTableName(this.config.table),
						sqlAliasedBehavior: 'alias',
						sqlBehavior: 'error',
					}),
				)
				: undefined
		) as this['_']['selectedFields'];
	}

	$dynamic(): EffectPgDeleteDynamic<this> {
		return this as any;
	}
}
