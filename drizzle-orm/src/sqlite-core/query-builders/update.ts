import type { GetColumnData } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import type { JoinType, SelectResultFields } from '~/query-builders/select.types.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { Placeholder, Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import type { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import type { SQLiteSession } from '~/sqlite-core/session.ts';
import { SQLiteTable } from '~/sqlite-core/table.ts';
import { Subquery } from '~/subquery.ts';
import { type InferInsertModel, Table } from '~/table.ts';
import {
	type Assume,
	getTableLikeName,
	mapUpdateSet,
	orderSelectedFields,
	type UpdateSet,
	type ValueOrArray,
} from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import type { SQLiteColumn } from '../columns/common.ts';
import { SQLiteViewBase } from '../view-base.ts';
import type { SelectedFields, SelectedFieldsOrdered, SQLiteSelectJoinConfig } from './select.types.ts';

export interface SQLiteUpdateConfig {
	where?: SQL | undefined;
	limit?: number | Placeholder;
	orderBy?: (SQLiteColumn | SQL | SQL.Aliased)[];
	set: UpdateSet;
	table: SQLiteTable;
	from?: SQLiteTable | Subquery | SQLiteViewBase | SQL;
	joins: SQLiteSelectJoinConfig[];
	returning?: SelectedFieldsOrdered;
	withList?: Subquery[];
}

export type SQLiteUpdateSetSource<
	TTable extends SQLiteTable,
	TModel extends Record<string, any> = InferInsertModel<TTable>,
> =
	& {
		[Key in keyof TModel & string]?:
			| GetColumnData<TTable['_']['columns'][Key], 'query'>
			| SQL
			| SQLiteColumn
			| Placeholder
			| undefined;
	}
	& {};

export interface SQLiteUpdateBuilderConstructor {
	new(
		table: SQLiteTable,
		set: UpdateSet,
		session: SQLiteSession<any, any>,
		dialect: SQLiteDialect,
		withList?: Subquery[],
	): AnySQLiteUpdate;
}

export class SQLiteUpdateBuilder<
	TTable extends SQLiteTable,
	TRunResult,
	THKT extends SQLiteUpdateHKTBase = SQLiteUpdateQueryBuilderHKT,
> {
	static readonly [entityKind]: string = 'SQLiteUpdateBuilder';

	declare readonly _: {
		readonly table: TTable;
	};

	constructor(
		protected table: TTable,
		protected session: SQLiteSession<any, any>,
		protected dialect: SQLiteDialect,
		private withList?: Subquery[],
		private builder: SQLiteUpdateBuilderConstructor = SQLiteUpdateBase,
	) {}

	set(
		values: SQLiteUpdateSetSource<TTable>,
	): SQLiteUpdateWithout<
		Assume<SQLiteUpdateKind<THKT, TTable, TRunResult>, AnySQLiteUpdate>,
		false,
		'leftJoin' | 'rightJoin' | 'innerJoin' | 'fullJoin'
	> {
		return new this.builder(
			this.table,
			mapUpdateSet(this.table, values),
			this.session,
			this.dialect,
			this.withList,
		) as any;
	}
}

export interface SQLiteUpdateHKTBase {
	table: unknown;
	resultType: unknown;
	runResult: unknown;
	from: unknown;
	returning: unknown;
	dynamic: boolean;
	excludedMethods: string;
	result: unknown;
	_type: unknown;
}

export interface SQLiteUpdateQueryBuilderHKT extends SQLiteUpdateHKTBase {
	_type: SQLiteUpdateBase<
		SQLiteUpdateQueryBuilderHKT,
		Assume<this['table'], SQLiteTable>,
		this['runResult'],
		Assume<this['from'], SQLiteTable | Subquery | SQLiteViewBase | SQL | undefined>,
		this['returning'],
		this['dynamic'],
		this['excludedMethods']
	>;
}

export type SQLiteUpdateKind<
	T extends SQLiteUpdateHKTBase,
	TTable extends SQLiteTable,
	TRunResult,
	TFrom extends SQLiteTable | Subquery | SQLiteViewBase | SQL | undefined = undefined,
	TReturning = undefined,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> = (T & {
	table: TTable;
	runResult: TRunResult;
	from: TFrom;
	returning: TReturning;
	dynamic: TDynamic;
	excludedMethods: TExcludedMethods;
	result: TReturning extends undefined ? TRunResult : TReturning[];
})['_type'];

export type SQLiteUpdateWithout<
	T extends AnySQLiteUpdate,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T : Omit<
	SQLiteUpdateKind<
		T['_']['hkt'],
		T['_']['table'],
		T['_']['runResult'],
		T['_']['from'],
		T['_']['returning'],
		TDynamic,
		T['_']['excludedMethods'] | K
	>,
	T['_']['excludedMethods'] | K
>;

export type SQLiteUpdateWithJoins<
	T extends AnySQLiteUpdate,
	TDynamic extends boolean,
	TFrom extends SQLiteTable | Subquery | SQLiteViewBase | SQL,
> = TDynamic extends true ? T : Omit<
	SQLiteUpdateKind<
		T['_']['hkt'],
		T['_']['table'],
		T['_']['runResult'],
		TFrom,
		T['_']['returning'],
		TDynamic,
		Exclude<T['_']['excludedMethods'] | 'from', 'leftJoin' | 'rightJoin' | 'innerJoin' | 'fullJoin'>
	>,
	Exclude<T['_']['excludedMethods'] | 'from', 'leftJoin' | 'rightJoin' | 'innerJoin' | 'fullJoin'>
>;

export type SQLiteUpdateReturningAll<T extends AnySQLiteUpdate, TDynamic extends boolean> = SQLiteUpdateWithout<
	SQLiteUpdateKind<
		T['_']['hkt'],
		T['_']['table'],
		T['_']['runResult'],
		T['_']['from'],
		T['_']['table']['$inferSelect'],
		TDynamic,
		T['_']['excludedMethods']
	>,
	TDynamic,
	'returning'
>;

export type SQLiteUpdateReturning<
	T extends AnySQLiteUpdate,
	TDynamic extends boolean,
	TSelectedFields extends SelectedFields,
> = SQLiteUpdateWithout<
	SQLiteUpdateKind<
		T['_']['hkt'],
		T['_']['table'],
		T['_']['runResult'],
		T['_']['from'],
		SelectResultFields<TSelectedFields>,
		TDynamic,
		T['_']['excludedMethods']
	>,
	TDynamic,
	'returning'
>;

export type SQLiteUpdateJoinFn<
	T extends AnySQLiteUpdate,
> = <
	TJoinedTable extends SQLiteTable | Subquery | SQLiteViewBase | SQL,
>(
	table: TJoinedTable,
	on:
		| (
			(
				updateTable: T['_']['table']['_']['columns'],
				from: T['_']['from'] extends SQLiteTable ? T['_']['from']['_']['columns']
					: T['_']['from'] extends Subquery | SQLiteViewBase ? T['_']['from']['_']['selectedFields']
					: never,
			) => SQL | undefined
		)
		| SQL
		| undefined,
) => T;

export type SQLiteUpdateDynamic<T extends AnySQLiteUpdate> = SQLiteUpdateKind<
	T['_']['hkt'],
	T['_']['table'],
	T['_']['runResult'],
	T['_']['from'],
	T['_']['returning'],
	true,
	never
>;

export type SQLiteUpdate<
	TTable extends SQLiteTable = SQLiteTable,
	TRunResult = any,
	TFrom extends SQLiteTable | Subquery | SQLiteViewBase | SQL | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
> = SQLiteUpdateBase<SQLiteUpdateQueryBuilderHKT, TTable, TRunResult, TFrom, TReturning, true, never>;

export type AnySQLiteUpdate = SQLiteUpdateBase<any, any, any, any, any, any, any>;

export interface SQLiteUpdateBase<
	THKT extends SQLiteUpdateHKTBase,
	TTable extends SQLiteTable = SQLiteTable,
	TRunResult = unknown,
	TFrom extends SQLiteTable | Subquery | SQLiteViewBase | SQL | undefined = undefined,
	TReturning = undefined,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends SQLWrapper {
	readonly _: {
		readonly dialect: 'sqlite';
		readonly hkt: THKT;
		readonly table: TTable;
		readonly runResult: TRunResult;
		readonly from: TFrom;
		readonly returning: TReturning;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
		readonly result: TReturning extends undefined ? TRunResult : TReturning[];
	};
}

export class SQLiteUpdateBase<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	THKT extends SQLiteUpdateHKTBase,
	TTable extends SQLiteTable = SQLiteTable,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TRunResult = unknown,
	TFrom extends SQLiteTable | Subquery | SQLiteViewBase | SQL | undefined = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TReturning = undefined,
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> implements SQLWrapper {
	static readonly [entityKind]: string = 'SQLiteUpdate';

	/** @internal */
	config: SQLiteUpdateConfig;

	constructor(
		table: TTable,
		set: UpdateSet,
		protected session: SQLiteSession<any, any>,
		protected dialect: SQLiteDialect,
		withList?: Subquery[],
	) {
		this.config = { set, table, withList, joins: [] };
	}

	from<TFrom extends SQLiteTable | Subquery | SQLiteViewBase | SQL>(
		source: TFrom,
	): SQLiteUpdateWithJoins<this, TDynamic, TFrom> {
		this.config.from = source;
		return this as any;
	}

	private createJoin<TJoinType extends JoinType>(
		joinType: TJoinType,
	): SQLiteUpdateJoinFn<this> {
		return ((
			table: SQLiteTable | Subquery | SQLiteViewBase | SQL,
			on: ((updateTable: TTable, from: TFrom) => SQL | undefined) | SQL | undefined,
		) => {
			const tableName = getTableLikeName(table);

			if (typeof tableName === 'string' && this.config.joins.some((join) => join.alias === tableName)) {
				throw new Error(`Alias "${tableName}" is already used in this query`);
			}

			if (typeof on === 'function') {
				const from = this.config.from
					? is(table, SQLiteTable)
						? table[Table.Symbol.Columns]
						: is(table, Subquery)
						? table._.selectedFields
						: is(table, SQLiteViewBase)
						? table[ViewBaseConfig].selectedFields
						: undefined
					: undefined;
				on = on(
					new Proxy(
						this.config.table[Table.Symbol.Columns],
						new SelectionProxyHandler({ sqlAliasedBehavior: 'sql', sqlBehavior: 'sql' }),
					) as any,
					from && new Proxy(
						from,
						new SelectionProxyHandler({ sqlAliasedBehavior: 'sql', sqlBehavior: 'sql' }),
					) as any,
				);
			}

			this.config.joins.push({ on, table, joinType, alias: tableName });

			return this as any;
		}) as any;
	}

	leftJoin = this.createJoin('left');

	rightJoin = this.createJoin('right');

	innerJoin = this.createJoin('inner');

	fullJoin = this.createJoin('full');

	/**
	 * Adds a 'where' clause to the query.
	 *
	 * Calling this method will update only those rows that fulfill a specified condition.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/update}
	 *
	 * @param where the 'where' clause.
	 *
	 * @example
	 * You can use conditional operators and `sql function` to filter the rows to be updated.
	 *
	 * ```ts
	 * // Update all cars with green color
	 * db.update(cars).set({ color: 'red' })
	 *   .where(eq(cars.color, 'green'));
	 * // or
	 * db.update(cars).set({ color: 'red' })
	 *   .where(sql`${cars.color} = 'green'`)
	 * ```
	 *
	 * You can logically combine conditional operators with `and()` and `or()` operators:
	 *
	 * ```ts
	 * // Update all BMW cars with a green color
	 * db.update(cars).set({ color: 'red' })
	 *   .where(and(eq(cars.color, 'green'), eq(cars.brand, 'BMW')));
	 *
	 * // Update all cars with the green or blue color
	 * db.update(cars).set({ color: 'red' })
	 *   .where(or(eq(cars.color, 'green'), eq(cars.color, 'blue')));
	 * ```
	 */
	where(where: SQL | undefined): SQLiteUpdateWithout<this, TDynamic, 'where'> {
		this.config.where = where;
		return this as any;
	}

	orderBy(
		builder: (updateTable: TTable) => ValueOrArray<SQLiteColumn | SQL | SQL.Aliased>,
	): SQLiteUpdateWithout<this, TDynamic, 'orderBy'>;
	orderBy(...columns: (SQLiteColumn | SQL | SQL.Aliased)[]): SQLiteUpdateWithout<this, TDynamic, 'orderBy'>;
	orderBy(
		...columns:
			| [(updateTable: TTable) => ValueOrArray<SQLiteColumn | SQL | SQL.Aliased>]
			| (SQLiteColumn | SQL | SQL.Aliased)[]
	): SQLiteUpdateWithout<this, TDynamic, 'orderBy'> {
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

	limit(limit: number | Placeholder): SQLiteUpdateWithout<this, TDynamic, 'limit'> {
		this.config.limit = limit;
		return this as any;
	}

	/**
	 * Adds a `returning` clause to the query.
	 *
	 * Calling this method will return the specified fields of the updated rows. If no fields are specified, all fields will be returned.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/update#update-with-returning}
	 *
	 * @example
	 * ```ts
	 * // Update all cars with the green color and return all fields
	 * const updatedCars: Car[] = await db.update(cars)
	 *   .set({ color: 'red' })
	 *   .where(eq(cars.color, 'green'))
	 *   .returning();
	 *
	 * // Update all cars with the green color and return only their id and brand fields
	 * const updatedCarsIdsAndBrands: { id: number, brand: string }[] = await db.update(cars)
	 *   .set({ color: 'red' })
	 *   .where(eq(cars.color, 'green'))
	 *   .returning({ id: cars.id, brand: cars.brand });
	 * ```
	 */
	returning(): SQLiteUpdateReturningAll<this, TDynamic>;
	returning<TSelectedFields extends SelectedFields>(
		fields: TSelectedFields,
	): SQLiteUpdateReturning<this, TDynamic, TSelectedFields>;
	returning(
		fields: SelectedFields = this.config.table[SQLiteTable.Symbol.Columns],
	): SQLiteUpdateWithout<AnySQLiteUpdate, TDynamic, 'returning'> {
		this.config.returning = orderSelectedFields<SQLiteColumn>(fields);
		return this as any;
	}

	getSQL(): SQL {
		return this.dialect.buildUpdateQuery(this.config);
	}

	toSQL(): Query {
		return this.dialect.sqlToQuery(this.getSQL());
	}

	$dynamic(): SQLiteUpdateDynamic<this> {
		return this as any;
	}
}
