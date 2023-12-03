import { entityKind, is } from '~/entity.ts';
import type { SelectResultFields } from '~/query-builders/select.types.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { Placeholder, Query, SQLWrapper } from '~/sql/sql.ts';
import { Param, SQL, sql } from '~/sql/sql.ts';
import type { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import type { IndexColumn } from '~/sqlite-core/indexes.ts';
import type { SQLitePreparedQuery, SQLiteSession } from '~/sqlite-core/session.ts';
import { SQLiteTable } from '~/sqlite-core/table.ts';
import { Table } from '~/table.ts';
import { type DrizzleTypeError, mapUpdateSet, orderSelectedFields, type Simplify } from '~/utils.ts';
import type { SelectedFieldsFlat, SelectedFieldsOrdered } from './select.types.ts';
import type { SQLiteUpdateSetSource } from './update.ts';
import type { SQLiteColumn } from '../columns/common.ts';

export interface SQLiteInsertConfig<TTable extends SQLiteTable = SQLiteTable> {
	table: TTable;
	values: Record<string, Param | SQL>[];
	onConflict?: SQL;
	returning?: SelectedFieldsOrdered;
}

export type SQLiteInsertValue<TTable extends SQLiteTable> = Simplify<
	{
		[Key in keyof TTable['$inferInsert']]: TTable['$inferInsert'][Key] | SQL | Placeholder;
	}
>;

export class SQLiteInsertBuilder<
	TTable extends SQLiteTable,
	TResultType extends 'sync' | 'async',
	TRunResult,
> {
	static readonly [entityKind]: string = 'SQLiteInsertBuilder';

	constructor(
		protected table: TTable,
		protected session: SQLiteSession<any, any, any, any>,
		protected dialect: SQLiteDialect,
	) {}

	values(value: SQLiteInsertValue<TTable>): SQLiteInsertBase<TTable, TResultType, TRunResult>;
	values(values: SQLiteInsertValue<TTable>[]): SQLiteInsertBase<TTable, TResultType, TRunResult>;
	values(
		values: SQLiteInsertValue<TTable> | SQLiteInsertValue<TTable>[],
	): SQLiteInsertBase<TTable, TResultType, TRunResult> {
		values = Array.isArray(values) ? values : [values];
		if (values.length === 0) {
			throw new Error('values() must be called with at least one value');
		}
		const mappedValues = values.map((entry) => {
			const result: Record<string, Param | SQL> = {};
			const cols = this.table[Table.Symbol.Columns];
			for (const colKey of Object.keys(entry)) {
				const colValue = entry[colKey as keyof typeof entry];
				result[colKey] = is(colValue, SQL) ? colValue : new Param(colValue, cols[colKey]);
			}
			return result;
		});

		// if (mappedValues.length > 1 && mappedValues.some((t) => Object.keys(t).length === 0)) {
		// 	throw new Error(
		// 		`One of the values you want to insert is empty. In SQLite you can insert only one empty object per statement. For this case Drizzle with use "INSERT INTO ... DEFAULT VALUES" syntax`,
		// 	);
		// }

		return new SQLiteInsertBase(this.table, mappedValues, this.session, this.dialect);
	}
}

export type SQLiteInsertWithout<T extends AnySQLiteInsert, TDynamic extends boolean, K extends keyof T & string> =
	TDynamic extends true ? T
		: Omit<
			SQLiteInsertBase<
				T['_']['table'],
				T['_']['resultType'],
				T['_']['runResult'],
				T['_']['returning'],
				TDynamic,
				T['_']['excludedMethods'] | K
			>,
			T['_']['excludedMethods'] | K
		>;

export type SQLiteInsertReturning<
	T extends AnySQLiteInsert,
	TDynamic extends boolean,
	TSelectedFields extends SelectedFieldsFlat,
> = SQLiteInsertWithout<
	SQLiteInsertBase<
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

export type SQLiteInsertReturningAll<
	T extends AnySQLiteInsert,
	TDynamic extends boolean,
> = SQLiteInsertWithout<
	SQLiteInsertBase<
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

export type SQLiteInsertOnConflictDoUpdateConfig<T extends AnySQLiteInsert> = {
	target: IndexColumn | IndexColumn[];
	where?: SQL;
	set: SQLiteUpdateSetSource<T['_']['table']>;
};

export type SQLiteInsertDynamic<T extends AnySQLiteInsert> = SQLiteInsert<
	T['_']['table'],
	T['_']['resultType'],
	T['_']['runResult'],
	T['_']['returning']
>;

export type SQLiteInsertExecute<T extends AnySQLiteInsert> = T['_']['returning'] extends undefined ? T['_']['runResult']
	: T['_']['returning'][];

export type SQLiteInsertPrepare<T extends AnySQLiteInsert> = SQLitePreparedQuery<
	{
		type: T['_']['resultType'];
		run: T['_']['runResult'];
		all: T['_']['returning'] extends undefined ? DrizzleTypeError<'.all() cannot be used without .returning()'>
			: T['_']['returning'][];
		get: T['_']['returning'] extends undefined ? DrizzleTypeError<'.get() cannot be used without .returning()'>
			: T['_']['returning'];
		values: T['_']['returning'] extends undefined ? DrizzleTypeError<'.values() cannot be used without .returning()'>
			: any[][];
		execute: SQLiteInsertExecute<T>;
	}
>;

export type AnySQLiteInsert = SQLiteInsertBase<any, any, any, any, any, any>;

export type SQLiteInsert<
	TTable extends SQLiteTable = SQLiteTable,
	TResultType extends 'sync' | 'async' = 'sync' | 'async',
	TRunResult = unknown,
	TReturning = any,
> = SQLiteInsertBase<TTable, TResultType, TRunResult, TReturning, true, never>;

export interface SQLiteInsertBase<
	TTable extends SQLiteTable,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TReturning = undefined,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends
	SQLWrapper,
	QueryPromise<TReturning extends undefined ? TRunResult : TReturning[]>,
	RunnableQuery<TReturning extends undefined ? TRunResult : TReturning[], 'sqlite'>
{
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

export class SQLiteInsertBase<
	TTable extends SQLiteTable,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TResultType extends 'sync' | 'async',
	TRunResult,
	TReturning = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<TReturning extends undefined ? TRunResult : TReturning[]>
	implements RunnableQuery<TReturning extends undefined ? TRunResult : TReturning[], 'sqlite'>, SQLWrapper
{
	static readonly [entityKind]: string = 'SQLiteInsert';

	/** @internal */
	config: SQLiteInsertConfig<TTable>;

	constructor(
		table: TTable,
		values: SQLiteInsertConfig['values'],
		private session: SQLiteSession<any, any, any, any>,
		private dialect: SQLiteDialect,
	) {
		super();
		this.config = { table, values };
	}

	/**
	 * Adds a `returning` clause to the query.
	 * 
	 * Calling this method will return the specified fields of the inserted rows. If no fields are specified, all fields will be returned.
	 * 
	 * See docs: {@link https://orm.drizzle.team/docs/insert#insert-returning}
	 * 
	 * @example
	 * ```ts
	 * // Insert one row and return all fields
	 * const insertedCar: Car[] = await db.insert(cars)
	 *   .values({ brand: 'BMW' })
	 *   .returning();
	 * 
	 * // Insert one row and return only the id
	 * const insertedCarId: { id: number }[] = await db.insert(cars)
	 *   .values({ brand: 'BMW' })
	 *   .returning({ id: cars.id });
	 * ```
	 */
	returning(): SQLiteInsertReturningAll<this, TDynamic>;
	returning<TSelectedFields extends SelectedFieldsFlat>(
		fields: TSelectedFields,
	): SQLiteInsertReturning<this, TDynamic, TSelectedFields>;
	returning(
		fields: SelectedFieldsFlat = this.config.table[SQLiteTable.Symbol.Columns],
	): SQLiteInsertWithout<AnySQLiteInsert, TDynamic, 'returning'> {
		this.config.returning = orderSelectedFields<SQLiteColumn>(fields);
		return this as any;
	}

	/**
	 * Adds an `on conflict do nothing` clause to the query.
	 * 
	 * Calling this method simply avoids inserting a row as its alternative action.
	 * 
	 * See docs: {@link https://orm.drizzle.team/docs/insert#on-conflict-do-nothing}
	 * 
	 * @param config The `target` and `where` clauses.
	 * 
	 * @example
	 * ```ts
	 * // Insert one row and cancel the insert if there's a conflict
	 * await db.insert(cars)
	 *   .values({ id: 1, brand: 'BMW' })
	 *   .onConflictDoNothing();
	 * 
	 * // Explicitly specify conflict target
	 * await db.insert(cars)
	 *   .values({ id: 1, brand: 'BMW' })
	 *   .onConflictDoNothing({ target: cars.id });
	 * ```
	 */
	onConflictDoNothing(config: { target?: IndexColumn | IndexColumn[]; where?: SQL } = {}): this {
		if (config.target === undefined) {
			this.config.onConflict = sql`do nothing`;
		} else {
			const targetSql = Array.isArray(config.target) ? sql`${config.target}` : sql`${[config.target]}`;
			const whereSql = config.where ? sql` where ${config.where}` : sql``;
			this.config.onConflict = sql`${targetSql} do nothing${whereSql}`;
		}
		return this;
	}

	/**
	 * Adds an `on conflict do update` clause to the query.
	 * 
	 * Calling this method will update the existing row that conflicts with the row proposed for insertion as its alternative action.
	 * 
	 * See docs: {@link https://orm.drizzle.team/docs/insert#upserts-and-conflicts} 
	 * 
	 * @param config The `target`, `set` and `where` clauses.
	 * 
	 * @example
	 * ```ts
	 * // Update the row if there's a conflict
	 * await db.insert(cars)
	 *   .values({ id: 1, brand: 'BMW' })
	 *   .onConflictDoUpdate({ 
	 *     target: cars.id, 
	 *     set: { brand: 'Porsche' } 
	 *   });
	 * 
	 * // Upsert with 'where' clause
	 * await db.insert(cars)
	 *   .values({ id: 1, brand: 'BMW' })
	 *   .onConflictDoUpdate({
	 *     target: cars.id,
	 *     set: { brand: 'newBMW' },
	 *     where: sql`${cars.createdAt} > '2023-01-01'::date`,
	 *   });
	 * ```
	 */
	onConflictDoUpdate(config: SQLiteInsertOnConflictDoUpdateConfig<this>): this {
		const targetSql = Array.isArray(config.target) ? sql`${config.target}` : sql`${[config.target]}`;
		const whereSql = config.where ? sql` where ${config.where}` : sql``;
		const setSql = this.dialect.buildUpdateSet(this.config.table, mapUpdateSet(this.config.table, config.set));
		this.config.onConflict = sql`${targetSql} do update set ${setSql}${whereSql}`;
		return this;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildInsertQuery(this.config);
	}

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	prepare(isOneTimeQuery?: boolean): SQLiteInsertPrepare<this> {
		return this.session[isOneTimeQuery ? 'prepareOneTimeQuery' : 'prepareQuery'](
			this.dialect.sqlToQuery(this.getSQL()),
			this.config.returning,
			this.config.returning ? 'all' : 'run',
		) as SQLiteInsertPrepare<this>;
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

	override async execute(): Promise<SQLiteInsertExecute<this>> {
		return (this.config.returning ? this.all() : this.run()) as SQLiteInsertExecute<this>;
	}

	$dynamic(): SQLiteInsertDynamic<this> {
		return this as any;
	}
}
