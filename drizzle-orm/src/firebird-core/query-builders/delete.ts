import { entityKind } from '~/entity.ts';
import type { SelectResultFields } from '~/query-builders/select.types.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { Placeholder, Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import type { FirebirdDialect } from '~/firebird-core/dialect.ts';
import type { FirebirdPreparedQuery, FirebirdSession } from '~/firebird-core/session.ts';
import { FirebirdTable } from '~/firebird-core/table.ts';
import type { Subquery } from '~/subquery.ts';
import { Table } from '~/table.ts';
import { type DrizzleTypeError, orderSelectedFields, type ValueOrArray } from '~/utils.ts';
import type { FirebirdColumn } from '../columns/common.ts';
import { extractUsedTable } from '../utils.ts';
import type { SelectedFieldsFlat, SelectedFieldsOrdered } from './select.types.ts';

export type FirebirdDeleteWithout<
	T extends AnyFirebirdDeleteBase,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T
	: Omit<
		FirebirdDeleteBase<
			T['_']['table'],
			T['_']['resultType'],
			T['_']['runResult'],
			T['_']['returning'],
			TDynamic,
			T['_']['excludedMethods'] | K
		>,
		T['_']['excludedMethods'] | K
	>;

export type FirebirdDelete<
	TTable extends FirebirdTable = FirebirdTable,
	TResultType extends 'sync' | 'async' = 'sync' | 'async',
	TRunResult = unknown,
	TReturning extends Record<string, unknown> | undefined = undefined,
> = FirebirdDeleteBase<TTable, TResultType, TRunResult, TReturning, true, never>;

export interface FirebirdDeleteConfig {
	where?: SQL | undefined;
	limit?: number | Placeholder;
	orderBy?: (FirebirdColumn | SQL | SQL.Aliased)[];
	table: FirebirdTable;
	returning?: SelectedFieldsOrdered;
	withList?: Subquery[];
}

export type FirebirdDeleteReturningAll<
	T extends AnyFirebirdDeleteBase,
	TDynamic extends boolean,
> = FirebirdDeleteWithout<
	FirebirdDeleteBase<
		T['_']['table'],
		T['_']['resultType'],
		T['_']['runResult'],
		T['_']['table']['$inferSelect'],
		T['_']['dynamic'],
		T['_']['excludedMethods']
	>,
	TDynamic,
	'returning'
>;

export type FirebirdDeleteReturning<
	T extends AnyFirebirdDeleteBase,
	TDynamic extends boolean,
	TSelectedFields extends SelectedFieldsFlat,
> = FirebirdDeleteWithout<
	FirebirdDeleteBase<
		T['_']['table'],
		T['_']['resultType'],
		T['_']['runResult'],
		SelectResultFields<TSelectedFields>,
		T['_']['dynamic'],
		T['_']['excludedMethods']
	>,
	TDynamic,
	'returning'
>;

export type FirebirdDeleteExecute<T extends AnyFirebirdDeleteBase> = T['_']['returning'] extends undefined
	? T['_']['runResult']
	: T['_']['returning'][];

export type FirebirdDeletePrepare<T extends AnyFirebirdDeleteBase> = FirebirdPreparedQuery<{
	type: T['_']['resultType'];
	run: T['_']['runResult'];
	all: T['_']['returning'] extends undefined ? DrizzleTypeError<'.all() cannot be used without .returning()'>
		: T['_']['returning'][];
	get: T['_']['returning'] extends undefined ? DrizzleTypeError<'.get() cannot be used without .returning()'>
		: T['_']['returning'] | undefined;
	values: T['_']['returning'] extends undefined ? DrizzleTypeError<'.values() cannot be used without .returning()'>
		: any[][];
	execute: FirebirdDeleteExecute<T>;
}>;

export type FirebirdDeleteDynamic<T extends AnyFirebirdDeleteBase> = FirebirdDelete<
	T['_']['table'],
	T['_']['resultType'],
	T['_']['runResult'],
	T['_']['returning']
>;

export type AnyFirebirdDeleteBase = FirebirdDeleteBase<any, any, any, any, any, any>;

export interface FirebirdDeleteBase<
	TTable extends FirebirdTable,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends
	QueryPromise<TReturning extends undefined ? TRunResult : TReturning[]>,
	RunnableQuery<TReturning extends undefined ? TRunResult : TReturning[], 'firebird'>,
	SQLWrapper
{
	readonly _: {
		dialect: 'firebird';
		readonly table: TTable;
		readonly resultType: TResultType;
		readonly runResult: TRunResult;
		readonly returning: TReturning;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
		readonly result: TReturning extends undefined ? TRunResult : TReturning[];
	};
}

export class FirebirdDeleteBase<
	TTable extends FirebirdTable,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TResultType extends 'sync' | 'async',
	TRunResult,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<TReturning extends undefined ? TRunResult : TReturning[]>
	implements RunnableQuery<TReturning extends undefined ? TRunResult : TReturning[], 'firebird'>, SQLWrapper
{
	static override readonly [entityKind]: string = 'FirebirdDelete';

	/** @internal */
	config: FirebirdDeleteConfig;

	constructor(
		private table: TTable,
		private session: FirebirdSession<any, any, any, any>,
		private dialect: FirebirdDialect,
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
	where(where: SQL | undefined): FirebirdDeleteWithout<this, TDynamic, 'where'> {
		this.config.where = where;
		return this as any;
	}

	orderBy(
		builder: (deleteTable: TTable) => ValueOrArray<FirebirdColumn | SQL | SQL.Aliased>,
	): FirebirdDeleteWithout<this, TDynamic, 'orderBy'>;
	orderBy(...columns: (FirebirdColumn | SQL | SQL.Aliased)[]): FirebirdDeleteWithout<this, TDynamic, 'orderBy'>;
	orderBy(
		...columns:
			| [(deleteTable: TTable) => ValueOrArray<FirebirdColumn | SQL | SQL.Aliased>]
			| (FirebirdColumn | SQL | SQL.Aliased)[]
	): FirebirdDeleteWithout<this, TDynamic, 'orderBy'> {
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

	limit(limit: number | Placeholder): FirebirdDeleteWithout<this, TDynamic, 'limit'> {
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
	returning(): FirebirdDeleteReturningAll<this, TDynamic>;
	returning<TSelectedFields extends SelectedFieldsFlat>(
		fields: TSelectedFields,
	): FirebirdDeleteReturning<this, TDynamic, TSelectedFields>;
	returning(
		fields: SelectedFieldsFlat = this.table[FirebirdTable.Symbol.Columns],
	): FirebirdDeleteReturning<this, TDynamic, any> {
		this.config.returning = orderSelectedFields<FirebirdColumn>(fields);
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
	_prepare(isOneTimeQuery = true): FirebirdDeletePrepare<this> {
		return this.session[isOneTimeQuery ? 'prepareOneTimeQuery' : 'prepareQuery'](
			this.dialect.sqlToQuery(this.getSQL()),
			this.config.returning,
			this.config.returning ? 'all' : 'run',
			true,
			undefined,
			{
				type: 'delete',
				tables: extractUsedTable(this.config.table),
			},
		) as FirebirdDeletePrepare<this>;
	}

	prepare(): FirebirdDeletePrepare<this> {
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

	override async execute(placeholderValues?: Record<string, unknown>): Promise<FirebirdDeleteExecute<this>> {
		return this._prepare().execute(placeholderValues) as FirebirdDeleteExecute<this>;
	}

	$dynamic(): FirebirdDeleteDynamic<this> {
		return this as any;
	}
}
