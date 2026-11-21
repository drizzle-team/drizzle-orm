import { entityKind, is } from '~/entity.ts';
import type { FirebirdDialect } from '~/firebird-core/dialect.ts';
import type { IndexColumn } from '~/firebird-core/indexes.ts';
import type { FirebirdPreparedQuery, FirebirdSession } from '~/firebird-core/session.ts';
import { FirebirdTable } from '~/firebird-core/table.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { SelectResultFields } from '~/query-builders/select.types.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { Placeholder, Query, SQLWrapper } from '~/sql/sql.ts';
import { Param, SQL, sql } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import { Columns, Table } from '~/table.ts';
import {
	type DrizzleTypeError,
	haveSameKeys,
	mapUpdateSet,
	orderSelectedFields,
	type Simplify,
	type UpdateSet,
} from '~/utils.ts';
import type { AnyFirebirdColumn, FirebirdColumn } from '../columns/common.ts';
import { extractUsedTable } from '../utils.ts';
import { QueryBuilder } from './query-builder.ts';
import type { SelectedFieldsFlat, SelectedFieldsOrdered } from './select.types.ts';
import type { FirebirdUpdateSetSource } from './update.ts';

export interface FirebirdInsertConfig<TTable extends FirebirdTable = FirebirdTable> {
	table: TTable;
	values: Record<string, Param | SQL>[] | FirebirdInsertSelectQueryBuilder<TTable> | SQL;
	withList?: Subquery[];
	onConflict?: FirebirdInsertOnConflictConfig<TTable>;
	returning?: SelectedFieldsOrdered;
	select?: boolean;
}

export type FirebirdInsertOnConflictConfig<TTable extends FirebirdTable = FirebirdTable> =
	| {
		type: 'doNothing';
		target?: IndexColumn | IndexColumn[];
		where?: SQL;
	}
	| {
		type: 'doUpdate';
		target: IndexColumn | IndexColumn[];
		/** @deprecated - use either `targetWhere` or `setWhere` */
		where?: SQL;
		targetWhere?: SQL;
		setWhere?: SQL;
		set: UpdateSet;
		table: TTable;
	};

export type FirebirdInsertValue<TTable extends FirebirdTable> = Simplify<
	{
		[Key in keyof TTable['$inferInsert']]: TTable['$inferInsert'][Key] | SQL | Placeholder;
	}
>;

export type FirebirdInsertSelectQueryBuilder<TTable extends FirebirdTable> = TypedQueryBuilder<
	{ [K in keyof TTable['$inferInsert']]: AnyFirebirdColumn | SQL | SQL.Aliased | TTable['$inferInsert'][K] }
>;

export class FirebirdInsertBuilder<
	TTable extends FirebirdTable,
	TResultType extends 'sync' | 'async',
	TRunResult,
> {
	static readonly [entityKind]: string = 'FirebirdInsertBuilder';

	constructor(
		protected table: TTable,
		protected session: FirebirdSession<any, any, any, any>,
		protected dialect: FirebirdDialect,
		private withList?: Subquery[],
	) {}

	values(value: FirebirdInsertValue<TTable>): FirebirdInsertBase<TTable, TResultType, TRunResult>;
	values(values: FirebirdInsertValue<TTable>[]): FirebirdInsertBase<TTable, TResultType, TRunResult>;
	values(
		values: FirebirdInsertValue<TTable> | FirebirdInsertValue<TTable>[],
	): FirebirdInsertBase<TTable, TResultType, TRunResult> {
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
		// 		`One of the values you want to insert is empty. In Firebird you can insert only one empty object per statement. For this case Drizzle with use "INSERT INTO ... DEFAULT VALUES" syntax`,
		// 	);
		// }

		return new FirebirdInsertBase(this.table, mappedValues, this.session, this.dialect, this.withList);
	}

	select(
		selectQuery: (qb: QueryBuilder) => FirebirdInsertSelectQueryBuilder<TTable>,
	): FirebirdInsertBase<TTable, TResultType, TRunResult>;
	select(selectQuery: (qb: QueryBuilder) => SQL): FirebirdInsertBase<TTable, TResultType, TRunResult>;
	select(selectQuery: SQL): FirebirdInsertBase<TTable, TResultType, TRunResult>;
	select(selectQuery: FirebirdInsertSelectQueryBuilder<TTable>): FirebirdInsertBase<TTable, TResultType, TRunResult>;
	select(
		selectQuery:
			| SQL
			| FirebirdInsertSelectQueryBuilder<TTable>
			| ((qb: QueryBuilder) => FirebirdInsertSelectQueryBuilder<TTable> | SQL),
	): FirebirdInsertBase<TTable, TResultType, TRunResult> {
		const select = typeof selectQuery === 'function' ? selectQuery(new QueryBuilder()) : selectQuery;

		if (
			!is(select, SQL)
			&& !haveSameKeys(this.table[Columns], select._.selectedFields)
		) {
			throw new Error(
				'Insert select error: selected fields are not the same or are in a different order compared to the table definition',
			);
		}

		return new FirebirdInsertBase(this.table, select, this.session, this.dialect, this.withList, true);
	}
}

export type FirebirdInsertWithout<T extends AnyFirebirdInsert, TDynamic extends boolean, K extends keyof T & string> =
	TDynamic extends true ? T
		: Omit<
			FirebirdInsertBase<
				T['_']['table'],
				T['_']['resultType'],
				T['_']['runResult'],
				T['_']['returning'],
				TDynamic,
				T['_']['excludedMethods'] | K
			>,
			T['_']['excludedMethods'] | K
		>;

export type FirebirdInsertReturning<
	T extends AnyFirebirdInsert,
	TDynamic extends boolean,
	TSelectedFields extends SelectedFieldsFlat,
> = FirebirdInsertWithout<
	FirebirdInsertBase<
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

export type FirebirdInsertReturningAll<
	T extends AnyFirebirdInsert,
	TDynamic extends boolean,
> = FirebirdInsertWithout<
	FirebirdInsertBase<
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

export type FirebirdInsertOnConflictDoUpdateConfig<T extends AnyFirebirdInsert> = {
	target: IndexColumn | IndexColumn[];
	/** @deprecated - use either `targetWhere` or `setWhere` */
	where?: SQL;
	// TODO: add tests for targetWhere and setWhere
	targetWhere?: SQL;
	setWhere?: SQL;
	set: FirebirdUpdateSetSource<T['_']['table']>;
};

export type FirebirdInsertDynamic<T extends AnyFirebirdInsert> = FirebirdInsert<
	T['_']['table'],
	T['_']['resultType'],
	T['_']['runResult'],
	T['_']['returning']
>;

export type FirebirdInsertExecute<T extends AnyFirebirdInsert> = T['_']['returning'] extends undefined
	? T['_']['runResult']
	: T['_']['returning'][];

export type FirebirdInsertPrepare<T extends AnyFirebirdInsert> = FirebirdPreparedQuery<
	{
		type: T['_']['resultType'];
		run: T['_']['runResult'];
		all: T['_']['returning'] extends undefined ? DrizzleTypeError<'.all() cannot be used without .returning()'>
			: T['_']['returning'][];
		get: T['_']['returning'] extends undefined ? DrizzleTypeError<'.get() cannot be used without .returning()'>
			: T['_']['returning'];
		values: T['_']['returning'] extends undefined ? DrizzleTypeError<'.values() cannot be used without .returning()'>
			: any[][];
		execute: FirebirdInsertExecute<T>;
	}
>;

export type AnyFirebirdInsert = FirebirdInsertBase<any, any, any, any, any, any>;

export type FirebirdInsert<
	TTable extends FirebirdTable = FirebirdTable,
	TResultType extends 'sync' | 'async' = 'sync' | 'async',
	TRunResult = unknown,
	TReturning = any,
> = FirebirdInsertBase<TTable, TResultType, TRunResult, TReturning, true, never>;

export interface FirebirdInsertBase<
	TTable extends FirebirdTable,
	TResultType extends 'sync' | 'async',
	TRunResult,
	TReturning = undefined,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends
	SQLWrapper,
	QueryPromise<TReturning extends undefined ? TRunResult : TReturning[]>,
	RunnableQuery<TReturning extends undefined ? TRunResult : TReturning[], 'firebird'>
{
	readonly _: {
		readonly dialect: 'firebird';
		readonly table: TTable;
		readonly resultType: TResultType;
		readonly runResult: TRunResult;
		readonly returning: TReturning;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
		readonly result: TReturning extends undefined ? TRunResult : TReturning[];
	};
}

export class FirebirdInsertBase<
	TTable extends FirebirdTable,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TResultType extends 'sync' | 'async',
	TRunResult,
	TReturning = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<TReturning extends undefined ? TRunResult : TReturning[]>
	implements RunnableQuery<TReturning extends undefined ? TRunResult : TReturning[], 'firebird'>, SQLWrapper
{
	static override readonly [entityKind]: string = 'FirebirdInsert';

	/** @internal */
	config: FirebirdInsertConfig<TTable>;

	constructor(
		table: TTable,
		values: FirebirdInsertConfig['values'],
		private session: FirebirdSession<any, any, any, any>,
		private dialect: FirebirdDialect,
		withList?: Subquery[],
		select?: boolean,
	) {
		super();
		this.config = { table, values: values as any, withList, select };
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
	returning(): FirebirdInsertReturningAll<this, TDynamic>;
	returning<TSelectedFields extends SelectedFieldsFlat>(
		fields: TSelectedFields,
	): FirebirdInsertReturning<this, TDynamic, TSelectedFields>;
	returning(
		fields: SelectedFieldsFlat = this.config.table[FirebirdTable.Symbol.Columns],
	): FirebirdInsertWithout<AnyFirebirdInsert, TDynamic, 'returning'> {
		this.config.returning = orderSelectedFields<FirebirdColumn>(fields);
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
	onConflictDoNothing(
		config: { target?: IndexColumn | IndexColumn[]; where?: SQL } = {},
	): FirebirdInsertWithout<this, TDynamic, 'onConflictDoNothing' | 'onConflictDoUpdate'> {
		this.config.onConflict = { type: 'doNothing', target: config.target, where: config.where };
		return this as any;
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
	onConflictDoUpdate(
		config: FirebirdInsertOnConflictDoUpdateConfig<this>,
	): FirebirdInsertWithout<this, TDynamic, 'onConflictDoNothing' | 'onConflictDoUpdate'> {
		if (config.where && (config.targetWhere || config.setWhere)) {
			throw new Error(
				'You cannot use both "where" and "targetWhere"/"setWhere" at the same time - "where" is deprecated, use "targetWhere" or "setWhere" instead.',
			);
		}

		this.config.onConflict = {
			type: 'doUpdate',
			target: config.target,
			where: config.where,
			targetWhere: config.targetWhere,
			setWhere: config.setWhere,
			set: mapUpdateSet(this.config.table, config.set),
			table: this.config.table,
		};
		return this as any;
	}

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildInsertQuery(this.config);
	}

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	/** @internal */
	_prepare(isOneTimeQuery = true): FirebirdInsertPrepare<this> {
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
		) as FirebirdInsertPrepare<this>;
	}

	prepare(): FirebirdInsertPrepare<this> {
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

	override async execute(): Promise<FirebirdInsertExecute<this>> {
		return (this.config.returning ? this.all() : this.run()) as FirebirdInsertExecute<this>;
	}

	$dynamic(): FirebirdInsertDynamic<this> {
		return this as any;
	}
}
