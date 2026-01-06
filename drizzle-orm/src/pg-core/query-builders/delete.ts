import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { PgQueryResultHKT, PgQueryResultKind, PgSession } from '~/pg-core/session.ts';
import type { PgTable } from '~/pg-core/table.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { SelectResultFields } from '~/query-builders/select.types.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection, Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import { getTableName, Table } from '~/table.ts';
import { type Assume, orderSelectedFields } from '~/utils.ts';
import type { PgColumn } from '../columns/common.ts';
import type { SelectedFieldsFlat, SelectedFieldsOrdered } from './select.types.ts';

export type PgDeleteWithout<
	T extends AnyPgDelete,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T
	: Omit<
		PgDeleteKind<
			T['_']['hkt'],
			T['_']['table'],
			T['_']['queryResult'],
			T['_']['selectedFields'],
			T['_']['returning'],
			TDynamic,
			T['_']['excludedMethods'] | K
		>,
		T['_']['excludedMethods'] | K
	>;

export type PgDelete<
	TTable extends PgTable = PgTable,
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
> = PgDeleteBase<PgDeleteHKT, TTable, TQueryResult, TSelectedFields, TReturning, true, never>;

export interface PgDeleteConfig {
	where?: SQL | undefined;
	table: PgTable;
	returningFields?: SelectedFieldsFlat;
	returning?: SelectedFieldsOrdered;
	withList?: Subquery[];
}

export type PgDeleteReturningAll<
	T extends AnyPgDelete,
	TDynamic extends boolean,
> = T extends any ? PgDeleteWithout<
		PgDeleteKind<
			T['_']['hkt'],
			T['_']['table'],
			T['_']['queryResult'],
			T['_']['table']['_']['columns'],
			T['_']['table']['$inferSelect'],
			TDynamic,
			T['_']['excludedMethods']
		>,
		TDynamic,
		'returning'
	>
	: never;

export type PgDeleteReturning<
	T extends AnyPgDelete,
	TDynamic extends boolean,
	TSelectedFields extends SelectedFieldsFlat,
> = T extends any ? PgDeleteWithout<
		PgDeleteKind<
			T['_']['hkt'],
			T['_']['table'],
			T['_']['queryResult'],
			TSelectedFields,
			SelectResultFields<TSelectedFields>,
			TDynamic,
			T['_']['excludedMethods']
		>,
		TDynamic,
		'returning'
	>
	: never;

export type PgDeleteDynamic<T extends AnyPgDelete> = PgDeleteKind<
	T['_']['hkt'],
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['selectedFields'],
	T['_']['returning'],
	true,
	never
>;

export type AnyPgDelete = PgDeleteBase<any, any, any, any, any, any, any>;

export interface PgDeleteHKTBase {
	table: unknown;
	queryResult: unknown;
	selectedFields: unknown;
	returning: unknown;
	dynamic: boolean;
	excludedMethods: string;
	_type: unknown;
}

export interface PgDeleteHKT extends PgDeleteHKTBase {
	_type: PgDeleteBase<
		PgDeleteHKT,
		Assume<this['table'], PgTable>,
		Assume<this['queryResult'], PgQueryResultHKT>,
		Assume<this['selectedFields'], ColumnsSelection | undefined>,
		Assume<this['returning'], Record<string, unknown> | undefined>,
		this['dynamic'],
		this['excludedMethods']
	>;
}

export type PgDeleteKind<
	T extends PgDeleteHKTBase,
	TTable extends PgTable,
	TQueryResult extends PgQueryResultHKT,
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> = (T & {
	table: TTable;
	queryResult: TQueryResult;
	selectedFields: TSelectedFields;
	returning: TReturning;
	dynamic: TDynamic;
	excludedMethods: TExcludedMethods;
})['_type'];

export interface PgDeleteBase<
	THKT extends PgDeleteHKTBase,
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
	SQLWrapper
{
	readonly _: {
		readonly dialect: 'pg';
		readonly hkt: THKT;
		readonly table: TTable;
		readonly queryResult: TQueryResult;
		readonly selectedFields: TSelectedFields;
		readonly returning: TReturning;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
		readonly result: TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[];
	};
}

export class PgDeleteBase<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	THKT extends PgDeleteHKTBase,
	TTable extends PgTable,
	TQueryResult extends PgQueryResultHKT,
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> implements
	TypedQueryBuilder<
		TSelectedFields,
		TReturning extends undefined ? PgQueryResultKind<TQueryResult, never> : TReturning[]
	>,
	SQLWrapper
{
	static readonly [entityKind]: string = 'PgDelete';

	protected config: PgDeleteConfig;
	protected cacheConfig?: WithCacheConfig;

	constructor(
		table: TTable,
		protected session: PgSession,
		protected dialect: PgDialect,
		withList?: Subquery[],
	) {
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
	 * await db.delete(cars).where(eq(cars.color, 'green'));
	 * // or
	 * await db.delete(cars).where(sql`${cars.color} = 'green'`)
	 * ```
	 *
	 * You can logically combine conditional operators with `and()` and `or()` operators:
	 *
	 * ```ts
	 * // Delete all BMW cars with a green color
	 * await db.delete(cars).where(and(eq(cars.color, 'green'), eq(cars.brand, 'BMW')));
	 *
	 * // Delete all cars with the green or blue color
	 * await db.delete(cars).where(or(eq(cars.color, 'green'), eq(cars.color, 'blue')));
	 * ```
	 */
	where(where: SQL | undefined): PgDeleteWithout<this, TDynamic, 'where'> {
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
	 * const deletedCars: Car[] = await db.delete(cars)
	 *   .where(eq(cars.color, 'green'))
	 *   .returning();
	 *
	 * // Delete all cars with the green color and return only their id and brand fields
	 * const deletedCarsIdsAndBrands: { id: number, brand: string }[] = await db.delete(cars)
	 *   .where(eq(cars.color, 'green'))
	 *   .returning({ id: cars.id, brand: cars.brand });
	 * ```
	 */
	returning(): PgDeleteReturningAll<this, TDynamic>;
	returning<TSelectedFields extends SelectedFieldsFlat>(
		fields: TSelectedFields,
	): PgDeleteReturning<this, TDynamic, TSelectedFields>;
	returning(
		fields: SelectedFieldsFlat = this.config.table[Table.Symbol.Columns],
	): PgDeleteReturning<this, TDynamic, any> | PgDeleteReturningAll<this, TDynamic> {
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

	$dynamic(): PgDeleteDynamic<this> {
		return this as any;
	}
}
