import { entityKind } from '~/entity.ts';
import type { SelectResultFields } from '~/query-builders/select.types.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { Placeholder, Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import type { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import type { SQLiteSession } from '~/sqlite-core/session.ts';
import { SQLiteTable } from '~/sqlite-core/table.ts';
import type { Subquery } from '~/subquery.ts';
import { Table } from '~/table.ts';
import { type Assume, orderSelectedFields, type ValueOrArray } from '~/utils.ts';
import type { SQLiteColumn } from '../columns/common.ts';
import type { SelectedFieldsFlat, SelectedFieldsOrdered } from './select.types.ts';

export interface SQLiteDeleteConfig {
	where?: SQL | undefined;
	limit?: number | Placeholder;
	orderBy?: (SQLiteColumn | SQL | SQL.Aliased)[];
	table: SQLiteTable;
	returning?: SelectedFieldsOrdered;
	withList?: Subquery[];
}

export interface SQLiteDeleteHKTBase {
	table: unknown;
	resultType: unknown;
	runResult: unknown;
	returning: unknown;
	dynamic: boolean;
	excludedMethods: string;
	result: unknown;
	_type: unknown;
}

export interface SQLiteDeleteQueryBuilderHKT extends SQLiteDeleteHKTBase {
	_type: SQLiteDeleteBase<
		SQLiteDeleteQueryBuilderHKT,
		Assume<this['table'], SQLiteTable>,
		this['runResult'],
		Assume<this['returning'], Record<string, unknown> | undefined>,
		this['dynamic'],
		this['excludedMethods']
	>;
}

export type SQLiteDeleteKind<
	T extends SQLiteDeleteHKTBase,
	TTable extends SQLiteTable,
	TRunResult,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> = (T & {
	table: TTable;
	runResult: TRunResult;
	returning: TReturning;
	dynamic: TDynamic;
	excludedMethods: TExcludedMethods;
	result: TReturning extends undefined ? TRunResult : TReturning[];
})['_type'];

export type SQLiteDeleteWithout<
	T extends AnySQLiteDeleteBase,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T
	: Omit<
		SQLiteDeleteKind<
			T['_']['hkt'],
			T['_']['table'],
			T['_']['runResult'],
			T['_']['returning'],
			TDynamic,
			T['_']['excludedMethods'] | K
		>,
		T['_']['excludedMethods'] | K
	>;

export type SQLiteDelete<
	TTable extends SQLiteTable = SQLiteTable,
	TRunResult = unknown,
	TReturning extends Record<string, unknown> | undefined = undefined,
> = SQLiteDeleteBase<SQLiteDeleteQueryBuilderHKT, TTable, TRunResult, TReturning, true, never>;

export type SQLiteDeleteReturningAll<
	T extends AnySQLiteDeleteBase,
	TDynamic extends boolean,
> = SQLiteDeleteWithout<
	SQLiteDeleteKind<
		T['_']['hkt'],
		T['_']['table'],
		T['_']['runResult'],
		T['_']['table']['$inferSelect'],
		T['_']['dynamic'],
		T['_']['excludedMethods']
	>,
	TDynamic,
	'returning'
>;

export type SQLiteDeleteReturning<
	T extends AnySQLiteDeleteBase,
	TDynamic extends boolean,
	TSelectedFields extends SelectedFieldsFlat,
> = SQLiteDeleteWithout<
	SQLiteDeleteKind<
		T['_']['hkt'],
		T['_']['table'],
		T['_']['runResult'],
		SelectResultFields<TSelectedFields>,
		T['_']['dynamic'],
		T['_']['excludedMethods']
	>,
	TDynamic,
	'returning'
>;

export type SQLiteDeleteDynamic<T extends AnySQLiteDeleteBase> = SQLiteDeleteKind<
	T['_']['hkt'],
	T['_']['table'],
	T['_']['runResult'],
	T['_']['returning'],
	true,
	never
>;

export type AnySQLiteDeleteBase = SQLiteDeleteBase<any, any, any, any, any, any>;

export interface SQLiteDeleteBase<
	THKT extends SQLiteDeleteHKTBase,
	TTable extends SQLiteTable,
	TRunResult,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends SQLWrapper {
	readonly _: {
		readonly dialect: 'sqlite';
		readonly hkt: THKT;
		readonly table: TTable;
		readonly runResult: TRunResult;
		readonly returning: TReturning;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
		readonly result: TReturning extends undefined ? TRunResult : TReturning[];
	};
}

export class SQLiteDeleteBase<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	THKT extends SQLiteDeleteHKTBase,
	TTable extends SQLiteTable,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TRunResult,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> implements SQLWrapper {
	static readonly [entityKind]: string = 'SQLiteDelete';

	/** @internal */
	config: SQLiteDeleteConfig;

	constructor(
		private table: TTable,
		protected session: SQLiteSession<any, any>,
		protected dialect: SQLiteDialect,
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
	 * db.delete(cars).where(eq(cars.color, 'green'));
	 * // or
	 * db.delete(cars).where(sql`${cars.color} = 'green'`)
	 * ```
	 *
	 * You can logically combine conditional operators with `and()` and `or()` operators:
	 *
	 * ```ts
	 * // Delete all BMW cars with a green color
	 * db.delete(cars).where(and(eq(cars.color, 'green'), eq(cars.brand, 'BMW')));
	 *
	 * // Delete all cars with the green or blue color
	 * db.delete(cars).where(or(eq(cars.color, 'green'), eq(cars.color, 'blue')));
	 * ```
	 */
	where(where: SQL | undefined): SQLiteDeleteWithout<this, TDynamic, 'where'> {
		this.config.where = where;
		return this as any;
	}

	orderBy(
		builder: (deleteTable: TTable) => ValueOrArray<SQLiteColumn | SQL | SQL.Aliased>,
	): SQLiteDeleteWithout<this, TDynamic, 'orderBy'>;
	orderBy(...columns: (SQLiteColumn | SQL | SQL.Aliased)[]): SQLiteDeleteWithout<this, TDynamic, 'orderBy'>;
	orderBy(
		...columns:
			| [(deleteTable: TTable) => ValueOrArray<SQLiteColumn | SQL | SQL.Aliased>]
			| (SQLiteColumn | SQL | SQL.Aliased)[]
	): SQLiteDeleteWithout<this, TDynamic, 'orderBy'> {
		if (typeof columns[0] === 'function') {
			const orderBy = columns[0](
				new Proxy(
					this.config.table[Table.Symbol.Columns],
					new SelectionProxyHandler({ sqlAliasedBehavior: 'alias', sqlBehavior: 'sql' }),
				) as any,
			);

			const orderByArray = Array.isArray(orderBy) ? orderBy : [orderBy];
			this.config.orderBy = orderByArray;
		} else {
			const orderByArray = columns as (SQLiteColumn | SQL | SQL.Aliased)[];
			this.config.orderBy = orderByArray;
		}
		return this as any;
	}

	limit(limit: number | Placeholder): SQLiteDeleteWithout<this, TDynamic, 'limit'> {
		this.config.limit = limit;
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
	returning(): SQLiteDeleteReturningAll<this, TDynamic>;
	returning<TSelectedFields extends SelectedFieldsFlat>(
		fields: TSelectedFields,
	): SQLiteDeleteReturning<this, TDynamic, TSelectedFields>;
	returning(
		fields: SelectedFieldsFlat = this.table[SQLiteTable.Symbol.Columns],
	): SQLiteDeleteReturning<this, TDynamic, any> | SQLiteDeleteReturningAll<this, TDynamic> {
		this.config.returning = orderSelectedFields<SQLiteColumn>(fields);
		return this as any;
	}

	getSQL(): SQL {
		return this.dialect.buildDeleteQuery(this.config);
	}

	toSQL(): Query {
		return this.dialect.sqlToQuery(this.getSQL());
	}

	$dynamic(): SQLiteDeleteDynamic<this> {
		return this as any;
	}
}
