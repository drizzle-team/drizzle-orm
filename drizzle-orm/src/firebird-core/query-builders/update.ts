import type { GetColumnData } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import type { JoinType, SelectResultFields } from '~/query-builders/select.types.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { Placeholder, Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import type { FirebirdDialect } from '~/firebird-core/dialect.ts';
import type { FirebirdPreparedQuery, FirebirdSession } from '~/firebird-core/session.ts';
import { FirebirdTable } from '~/firebird-core/table.ts';
import { Subquery } from '~/subquery.ts';
import { Table } from '~/table.ts';
import {
	type DrizzleTypeError,
	getTableLikeName,
	mapUpdateSet,
	orderSelectedFields,
	type UpdateSet,
	type ValueOrArray,
} from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import type { FirebirdColumn } from '../columns/common.ts';
import { extractUsedTable } from '../utils.ts';
import { FirebirdViewBase } from '../view-base.ts';
import type { SelectedFields, SelectedFieldsOrdered, FirebirdSelectJoinConfig } from './select.types.ts';

export interface FirebirdUpdateConfig {
	where?: SQL | undefined;
	limit?: number | Placeholder;
	orderBy?: (FirebirdColumn | SQL | SQL.Aliased)[];
	set: UpdateSet;
	table: FirebirdTable;
	from?: FirebirdTable | Subquery | FirebirdViewBase | SQL;
	joins: FirebirdSelectJoinConfig[];
	returning?: SelectedFieldsOrdered;
	withList?: Subquery[];
}

export type FirebirdUpdateSetSource<TTable extends FirebirdTable> =
	& {
		[Key in keyof TTable['$inferInsert']]?:
			| GetColumnData<TTable['_']['columns'][Key], 'query'>
			| SQL
			| FirebirdColumn
			| undefined;
	}
	& {};

export class FirebirdUpdateBuilder<
	TTable extends FirebirdTable,
	TResultType extends 'sync' | 'async',
	TRunResult,
> {
	static readonly [entityKind]: string = 'FirebirdUpdateBuilder';

	declare readonly _: {
		readonly table: TTable;
	};

	constructor(
		protected table: TTable,
		protected session: FirebirdSession<any, any, any, any>,
		protected dialect: FirebirdDialect,
		private withList?: Subquery[],
	) {}

	set(
		values: FirebirdUpdateSetSource<TTable>,
	): FirebirdUpdateWithout<
		FirebirdUpdateBase<TTable, TResultType, TRunResult>,
		false,
		'leftJoin' | 'rightJoin' | 'innerJoin' | 'fullJoin'
	> {
		return new FirebirdUpdateBase(
			this.table,
			mapUpdateSet(this.table, values),
			this.session,
			this.dialect,
			this.withList,
		) as any;
	}
}

export type FirebirdUpdateWithout<
	T extends AnyFirebirdUpdate,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T : Omit<
	FirebirdUpdateBase<
		T['_']['table'],
		T['_']['resultType'],
		T['_']['runResult'],
		T['_']['from'],
		T['_']['returning'],
		TDynamic,
		T['_']['excludedMethods'] | K
	>,
	T['_']['excludedMethods'] | K
>;

export type FirebirdUpdateWithJoins<
	T extends AnyFirebirdUpdate,
	TDynamic extends boolean,
	TFrom extends FirebirdTable | Subquery | FirebirdViewBase | SQL,
> = TDynamic extends true ? T : Omit<
	FirebirdUpdateBase<
		T['_']['table'],
		T['_']['resultType'],
		T['_']['runResult'],
		TFrom,
		T['_']['returning'],
		TDynamic,
		Exclude<T['_']['excludedMethods'] | 'from', 'leftJoin' | 'rightJoin' | 'innerJoin' | 'fullJoin'>
	>,
	Exclude<T['_']['excludedMethods'] | 'from', 'leftJoin' | 'rightJoin' | 'innerJoin' | 'fullJoin'>
>;

export type FirebirdUpdateReturningAll<T extends AnyFirebirdUpdate, TDynamic extends boolean> = FirebirdUpdateWithout<
	FirebirdUpdateBase<
		T['_']['table'],
		T['_']['resultType'],
		T['_']['runResult'],
		T['_']['from'],
		T['_']['table']['$inferSelect'],
		TDynamic,
		T['_']['excludedMethods']
	>,
	TDynamic,
	'returning'
>;

export type FirebirdUpdateReturning<
	T extends AnyFirebirdUpdate,
	TDynamic extends boolean,
	TSelectedFields extends SelectedFields,
> = FirebirdUpdateWithout<
	FirebirdUpdateBase<
		T['_']['table'],
		T['_']['resultType'],
		T['_']['runResult'],
		T['_']['from'],
		SelectResultFields<TSelectedFields>,
		TDynamic,
		T['_']['excludedMethods']
	>,
	TDynamic,
	'returning'
>;

export type FirebirdUpdateExecute<T extends AnyFirebirdUpdate> = T['_']['returning'] extends undefined ? T['_']['runResult']
	: T['_']['returning'][];

export type FirebirdUpdatePrepare<T extends AnyFirebirdUpdate> = FirebirdPreparedQuery<
	{
		type: T['_']['resultType'];
		run: T['_']['runResult'];
		all: T['_']['returning'] extends undefined ? DrizzleTypeError<'.all() cannot be used without .returning()'>
			: T['_']['returning'][];
		get: T['_']['returning'] extends undefined ? DrizzleTypeError<'.get() cannot be used without .returning()'>
			: T['_']['returning'];
		values: T['_']['returning'] extends undefined ? DrizzleTypeError<'.values() cannot be used without .returning()'>
			: any[][];
		execute: FirebirdUpdateExecute<T>;
	}
>;

export type FirebirdUpdateJoinFn<
	T extends AnyFirebirdUpdate,
> = <
	TJoinedTable extends FirebirdTable | Subquery | FirebirdViewBase | SQL,
>(
	table: TJoinedTable,
	on:
		| (
			(
				updateTable: T['_']['table']['_']['columns'],
				from: T['_']['from'] extends FirebirdTable ? T['_']['from']['_']['columns']
					: T['_']['from'] extends Subquery | FirebirdViewBase ? T['_']['from']['_']['selectedFields']
					: never,
			) => SQL | undefined
		)
		| SQL
		| undefined,
) => T;

export type FirebirdUpdateDynamic<T extends AnyFirebirdUpdate> = FirebirdUpdate<
	T['_']['table'],
	T['_']['resultType'],
	T['_']['runResult'],
	T['_']['returning']
>;

export type FirebirdUpdate<
	TTable extends FirebirdTable = FirebirdTable,
	TResultType extends 'sync' | 'async' = 'sync' | 'async',
	TRunResult = any,
	TFrom extends FirebirdTable | Subquery | FirebirdViewBase | SQL | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
> = FirebirdUpdateBase<TTable, TResultType, TRunResult, TFrom, TReturning, true, never>;

export type AnyFirebirdUpdate = FirebirdUpdateBase<any, any, any, any, any, any, any>;

export interface FirebirdUpdateBase<
	TTable extends FirebirdTable = FirebirdTable,
	TResultType extends 'sync' | 'async' = 'sync' | 'async',
	TRunResult = unknown,
	TFrom extends FirebirdTable | Subquery | FirebirdViewBase | SQL | undefined = undefined,
	TReturning = undefined,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends SQLWrapper, QueryPromise<TReturning extends undefined ? TRunResult : TReturning[]> {
	readonly _: {
		readonly dialect: 'firebird';
		readonly table: TTable;
		readonly resultType: TResultType;
		readonly runResult: TRunResult;
		readonly from: TFrom;
		readonly returning: TReturning;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
		readonly result: TReturning extends undefined ? TRunResult : TReturning[];
	};
}

export class FirebirdUpdateBase<
	TTable extends FirebirdTable = FirebirdTable,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TResultType extends 'sync' | 'async' = 'sync' | 'async',
	TRunResult = unknown,
	TFrom extends FirebirdTable | Subquery | FirebirdViewBase | SQL | undefined = undefined,
	TReturning = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<TReturning extends undefined ? TRunResult : TReturning[]>
	implements RunnableQuery<TReturning extends undefined ? TRunResult : TReturning[], 'firebird'>, SQLWrapper
{
	static override readonly [entityKind]: string = 'FirebirdUpdate';

	/** @internal */
	config: FirebirdUpdateConfig;

	constructor(
		table: TTable,
		set: UpdateSet,
		private session: FirebirdSession<any, any, any, any>,
		private dialect: FirebirdDialect,
		withList?: Subquery[],
	) {
		super();
		this.config = { set, table, withList, joins: [] };
	}

	from<TFrom extends FirebirdTable | Subquery | FirebirdViewBase | SQL>(
		source: TFrom,
	): FirebirdUpdateWithJoins<this, TDynamic, TFrom> {
		this.config.from = source;
		return this as any;
	}

	private createJoin<TJoinType extends JoinType>(
		joinType: TJoinType,
	): FirebirdUpdateJoinFn<this> {
		return ((
			table: FirebirdTable | Subquery | FirebirdViewBase | SQL,
			on: ((updateTable: TTable, from: TFrom) => SQL | undefined) | SQL | undefined,
		) => {
			const tableName = getTableLikeName(table);

			if (typeof tableName === 'string' && this.config.joins.some((join) => join.alias === tableName)) {
				throw new Error(`Alias "${tableName}" is already used in this query`);
			}

			if (typeof on === 'function') {
				const from = this.config.from
					? is(table, FirebirdTable)
						? table[Table.Symbol.Columns]
						: is(table, Subquery)
						? table._.selectedFields
						: is(table, FirebirdViewBase)
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
	where(where: SQL | undefined): FirebirdUpdateWithout<this, TDynamic, 'where'> {
		this.config.where = where;
		return this as any;
	}

	orderBy(
		builder: (updateTable: TTable) => ValueOrArray<FirebirdColumn | SQL | SQL.Aliased>,
	): FirebirdUpdateWithout<this, TDynamic, 'orderBy'>;
	orderBy(...columns: (FirebirdColumn | SQL | SQL.Aliased)[]): FirebirdUpdateWithout<this, TDynamic, 'orderBy'>;
	orderBy(
		...columns:
			| [(updateTable: TTable) => ValueOrArray<FirebirdColumn | SQL | SQL.Aliased>]
			| (FirebirdColumn | SQL | SQL.Aliased)[]
	): FirebirdUpdateWithout<this, TDynamic, 'orderBy'> {
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
			const orderByArray = columns as (FirebirdColumn | SQL | SQL.Aliased)[];
			this.config.orderBy = orderByArray;
		}
		return this as any;
	}

	limit(limit: number | Placeholder): FirebirdUpdateWithout<this, TDynamic, 'limit'> {
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
	returning(): FirebirdUpdateReturningAll<this, TDynamic>;
	returning<TSelectedFields extends SelectedFields>(
		fields: TSelectedFields,
	): FirebirdUpdateReturning<this, TDynamic, TSelectedFields>;
	returning(
		fields: SelectedFields = this.config.table[FirebirdTable.Symbol.Columns],
	): FirebirdUpdateWithout<AnyFirebirdUpdate, TDynamic, 'returning'> {
		this.config.returning = orderSelectedFields<FirebirdColumn>(fields);
		return this as any;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildUpdateQuery(this.config);
	}

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	/** @internal */
	_prepare(isOneTimeQuery = true): FirebirdUpdatePrepare<this> {
		return this.session[isOneTimeQuery ? 'prepareOneTimeQuery' : 'prepareQuery'](
			this.dialect.sqlToQuery(this.getSQL()),
			this.config.returning,
			this.config.returning ? 'all' : 'run',
			true,
			undefined,
			{
				type: 'insert',
				tables: extractUsedTable(this.config.table),
			},
		) as FirebirdUpdatePrepare<this>;
	}

	prepare(): FirebirdUpdatePrepare<this> {
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

	override async execute(): Promise<FirebirdUpdateExecute<this>> {
		return (this.config.returning ? this.all() : this.run()) as FirebirdUpdateExecute<this>;
	}

	$dynamic(): FirebirdUpdateDynamic<this> {
		return this as any;
	}
}
