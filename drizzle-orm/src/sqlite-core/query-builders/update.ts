import type { GetColumnData } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SelectResultFields } from '~/query-builders/select.types.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { Query, SQL, SQLWrapper } from '~/sql/sql.ts';
import type { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import type { SQLitePreparedQuery, SQLiteSession } from '~/sqlite-core/session.ts';
import { SQLiteTable } from '~/sqlite-core/table.ts';
import { type DrizzleTypeError, mapUpdateSet, orderSelectedFields, type UpdateSet } from '~/utils.ts';
import type { SelectedFields, SelectedFieldsOrdered } from './select.types.ts';
import type { SQLiteColumn } from '../columns/common.ts';

export interface SQLiteUpdateConfig {
	where?: SQL | undefined;
	set: UpdateSet;
	table: SQLiteTable;
	returning?: SelectedFieldsOrdered;
}

export type SQLiteUpdateSetSource<TTable extends SQLiteTable> =
	& {
		[Key in keyof TTable['_']['columns']]?:
			| GetColumnData<TTable['_']['columns'][Key], 'query'>
			| SQL;
	}
	& {};

export class SQLiteUpdateBuilder<
	TTable extends SQLiteTable,
	TResultType extends 'sync' | 'async',
	TRunResult,
> {
	static readonly [entityKind]: string = 'SQLiteUpdateBuilder';

	declare readonly _: {
		readonly table: TTable;
	};

	constructor(
		protected table: TTable,
		protected session: SQLiteSession<any, any, any, any>,
		protected dialect: SQLiteDialect,
	) {}

	set(values: SQLiteUpdateSetSource<TTable>): SQLiteUpdateBase<TTable, TResultType, TRunResult> {
		return new SQLiteUpdateBase(this.table, mapUpdateSet(this.table, values), this.session, this.dialect);
	}
}

export type SQLiteUpdateWithout<
	T extends AnySQLiteUpdate,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T : Omit<
	SQLiteUpdateBase<
		T['_']['table'],
		T['_']['resultType'],
		T['_']['runResult'],
		T['_']['returning'],
		TDynamic,
		T['_']['excludedMethods'] | K
	>,
	T['_']['excludedMethods'] | K
>;

export type SQLiteUpdateReturningAll<T extends AnySQLiteUpdate, TDynamic extends boolean> = SQLiteUpdateWithout<
	SQLiteUpdateBase<
		T['_']['table'],
		T['_']['resultType'],
		T['_']['runResult'],
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
	SQLiteUpdateBase<
		T['_']['table'],
		T['_']['resultType'],
		T['_']['runResult'],
		SelectResultFields<TSelectedFields>,
		TDynamic,
		T['_']['excludedMethods']
	>,
	TDynamic,
	'returning'
>;

export type SQLiteUpdateExecute<T extends AnySQLiteUpdate> = T['_']['returning'] extends undefined ? T['_']['runResult']
	: T['_']['returning'][];

export type SQLiteUpdatePrepare<T extends AnySQLiteUpdate> = SQLitePreparedQuery<
	{
		type: T['_']['resultType'];
		run: T['_']['runResult'];
		all: T['_']['returning'] extends undefined ? DrizzleTypeError<'.all() cannot be used without .returning()'>
			: T['_']['returning'][];
		get: T['_']['returning'] extends undefined ? DrizzleTypeError<'.get() cannot be used without .returning()'>
			: T['_']['returning'];
		values: T['_']['returning'] extends undefined ? DrizzleTypeError<'.values() cannot be used without .returning()'>
			: any[][];
		execute: SQLiteUpdateExecute<T>;
	}
>;

export type SQLiteUpdateDynamic<T extends AnySQLiteUpdate> = SQLiteUpdate<
	T['_']['table'],
	T['_']['resultType'],
	T['_']['runResult'],
	T['_']['returning']
>;

export type SQLiteUpdate<
	TTable extends SQLiteTable = SQLiteTable,
	TResultType extends 'sync' | 'async' = 'sync' | 'async',
	TRunResult = any,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
> = SQLiteUpdateBase<TTable, TResultType, TRunResult, TReturning, true, never>;

type AnySQLiteUpdate = SQLiteUpdateBase<any, any, any, any, any, any>;

export interface SQLiteUpdateBase<
	TTable extends SQLiteTable = SQLiteTable,
	TResultType extends 'sync' | 'async' = 'sync' | 'async',
	TRunResult = unknown,
	TReturning = undefined,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends SQLWrapper, QueryPromise<TReturning extends undefined ? TRunResult : TReturning[]> {
	readonly _: {
		readonly dialect: 'sqlite';
		readonly table: TTable;
		readonly resultType: TResultType;
		readonly runResult: TRunResult;
		readonly returning: TReturning;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
		readonly result: TReturning extends undefined ? TRunResult : TReturning[];
	};
}

export class SQLiteUpdateBase<
	TTable extends SQLiteTable = SQLiteTable,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TResultType extends 'sync' | 'async' = 'sync' | 'async',
	TRunResult = unknown,
	TReturning = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<TReturning extends undefined ? TRunResult : TReturning[]>
	implements RunnableQuery<TReturning extends undefined ? TRunResult : TReturning[], 'sqlite'>, SQLWrapper
{
	static readonly [entityKind]: string = 'SQLiteUpdate';

	/** @internal */
	config: SQLiteUpdateConfig;

	constructor(
		table: TTable,
		set: UpdateSet,
		private session: SQLiteSession<any, any, any, any>,
		private dialect: SQLiteDialect,
	) {
		super();
		this.config = { set, table };
	}

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

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildUpdateQuery(this.config);
	}

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	prepare(isOneTimeQuery?: boolean): SQLiteUpdatePrepare<this> {
		return this.session[isOneTimeQuery ? 'prepareOneTimeQuery' : 'prepareQuery'](
			this.dialect.sqlToQuery(this.getSQL()),
			this.config.returning,
			this.config.returning ? 'all' : 'run',
		) as SQLiteUpdatePrepare<this>;
	}

	run: ReturnType<this['prepare']>['run'] = (placeholderValues) => {
		return this.prepare(true).run(placeholderValues);
	};

	all: ReturnType<this['prepare']>['all'] = (placeholderValues) => {
		return this.prepare(true).all(placeholderValues);
	};

	get: ReturnType<this['prepare']>['get'] = (placeholderValues) => {
		return this.prepare(true).get(placeholderValues);
	};

	values: ReturnType<this['prepare']>['values'] = (placeholderValues) => {
		return this.prepare(true).values(placeholderValues);
	};

	override async execute(): Promise<SQLiteUpdateExecute<this>> {
		return (this.config.returning ? this.all() : this.run()) as SQLiteUpdateExecute<this>;
	}

	$dynamic(): SQLiteUpdateDynamic<this> {
		return this as any;
	}
}
