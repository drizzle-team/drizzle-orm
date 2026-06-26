import { entityKind, is } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { SelectResultFields } from '~/query-builders/select.types.ts';
import type { Placeholder, Query, SQLWrapper } from '~/sql/sql.ts';
import { Param, SQL, sql } from '~/sql/sql.ts';
import type { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import type { IndexColumn } from '~/sqlite-core/indexes.ts';
import type { SQLiteSession } from '~/sqlite-core/session.ts';
import { SQLiteTable } from '~/sqlite-core/table.ts';
import type { Subquery } from '~/subquery.ts';
import { type InferInsertModel, Table } from '~/table.ts';
import { type Assume, type DrizzleTypeError, mapUpdateSet, orderSelectedFields } from '~/utils.ts';
import type { AnySQLiteColumn, SQLiteColumn } from '../columns/common.ts';
import { QueryBuilder } from './query-builder.ts';
import type { SelectedFieldsFlat, SelectedFieldsOrdered } from './select.types.ts';
import type { SQLiteUpdateSetSource } from './update.ts';

export interface SQLiteInsertConfig<TTable extends SQLiteTable = SQLiteTable> {
	table: TTable;
	values: Record<string, Param | SQL>[] | TypedQueryBuilder<SQLiteInsertSelection<TTable>> | SQL;
	withList?: Subquery[];
	onConflict?: SQL[];
	returning?: SelectedFieldsOrdered;
	select?: boolean;
}

export type SQLiteInsertValue<
	TTable extends SQLiteTable,
	TModel extends Record<string, any> = InferInsertModel<TTable>,
> =
	& {
		[Key in keyof TModel]: TModel[Key] | SQL | Placeholder;
	}
	& {};

export type SQLiteInsertSelection<
	TTable extends SQLiteTable,
	TModel extends Record<string, unknown> = InferInsertModel<TTable>,
> =
	& {
		[K in keyof TModel]:
			| AnySQLiteColumn
			| SQL
			| SQL.Aliased
			| TModel[K];
	}
	& {};

export type NoUnknownKeysInInsertSelection<
	TTable extends SQLiteTable,
	TSelection extends SQLiteInsertSelection<any>,
> = {
	[K in keyof TSelection]: K extends keyof InferInsertModel<TTable> ? TSelection[K]
		: K extends keyof InferInsertModel<TTable, { override: true }> ? DrizzleTypeError<
				`Column "${
					& K
					& string}" in table "${TTable['_'][
					'name'
				]}" is a generated column - manual value insertion restricted`
			>
		: DrizzleTypeError<`Column "${K & string}" does not exist in table "${TTable['_']['name']}"`>;
};

export interface SQLiteInsertBuilderConstructor {
	new(
		table: SQLiteTable,
		values: SQLiteInsertConfig['values'],
		session: SQLiteSession<any, any>,
		dialect: SQLiteDialect,
		withList?: Subquery[],
		select?: boolean,
	): AnySQLiteInsert;
}

export class SQLiteInsertBuilder<
	TTable extends SQLiteTable,
	TRunResult,
	THKT extends SQLiteInsertHKTBase = SQLiteInsertQueryBuilderHKT,
> {
	static readonly [entityKind]: string = 'SQLiteInsertBuilder';

	constructor(
		protected table: TTable,
		protected session: SQLiteSession<any, any>,
		protected dialect: SQLiteDialect,
		private withList?: Subquery[],
		private builder: SQLiteInsertBuilderConstructor = SQLiteInsertBase,
	) {}

	values(value: SQLiteInsertValue<TTable>): SQLiteInsertKind<THKT, TTable, TRunResult>;
	values(values: SQLiteInsertValue<TTable>[]): SQLiteInsertKind<THKT, TTable, TRunResult>;
	values(
		values: SQLiteInsertValue<TTable> | SQLiteInsertValue<TTable>[],
	): SQLiteInsertKind<THKT, TTable, TRunResult> {
		values = Array.isArray(values) ? values : [values];
		if (values.length === 0) {
			throw new Error('values() must be called with at least one value');
		}
		const mappedValues = values.map((entry) => {
			const result: Record<string, Param | SQL> = {};
			const cols = this.table[Table.Symbol.Columns];
			for (const colKey of Object.keys(entry)) {
				const colValue = entry[colKey as keyof typeof entry];
				result[colKey] = is(colValue, SQL) ? colValue : new Param(colValue as any, cols[colKey]);
			}
			return result;
		});

		// if (mappedValues.length > 1 && mappedValues.some((t) => Object.keys(t).length === 0)) {
		// 	throw new Error(
		// 		`One of the values you want to insert is empty. In SQLite you can insert only one empty object per statement. For this case Drizzle with use "INSERT INTO ... DEFAULT VALUES" syntax`,
		// 	);
		// }

		return new this.builder(this.table, mappedValues, this.session, this.dialect, this.withList) as any;
	}

	select<TSelection extends SQLiteInsertSelection<TTable>>(
		selectQuery: (qb: QueryBuilder) => TypedQueryBuilder<NoUnknownKeysInInsertSelection<TTable, TSelection>>,
	): SQLiteInsertKind<THKT, TTable, TRunResult>;
	select(selectQuery: (qb: QueryBuilder) => SQL): SQLiteInsertKind<THKT, TTable, TRunResult>;
	select(selectQuery: SQL): SQLiteInsertKind<THKT, TTable, TRunResult>;
	select<TSelection extends SQLiteInsertSelection<TTable>>(
		selectQuery: TypedQueryBuilder<NoUnknownKeysInInsertSelection<TTable, TSelection>>,
	): SQLiteInsertKind<THKT, TTable, TRunResult>;
	select(
		selectQuery:
			| SQL
			| TypedQueryBuilder<NoUnknownKeysInInsertSelection<TTable, SQLiteInsertSelection<TTable>>>
			| ((qb: QueryBuilder) =>
				| TypedQueryBuilder<NoUnknownKeysInInsertSelection<TTable, SQLiteInsertSelection<TTable>>>
				| SQL),
	): SQLiteInsertKind<THKT, TTable, TRunResult> {
		const select = typeof selectQuery === 'function' ? selectQuery(new QueryBuilder()) : selectQuery;

		if (!is(select, SQL)) {
			const insertCols = Object.keys(this.table[Table.Symbol.Columns]);
			const selected = Object.keys(select._.selectedFields);

			for (const col of selected) {
				if (!insertCols.includes(col)) {
					throw new Error(
						`Insert select error: column "${col}" does not exist in table "${this.table[Table.Symbol.Name]}"`,
					);
				}
			}
		}

		return new this.builder(this.table, select, this.session, this.dialect, this.withList, true) as any;
	}
}

export interface SQLiteInsertHKTBase {
	table: unknown;
	resultType: unknown;
	runResult: unknown;
	returning: unknown;
	dynamic: boolean;
	excludedMethods: string;
	result: unknown;
	_type: unknown;
}

export interface SQLiteInsertQueryBuilderHKT extends SQLiteInsertHKTBase {
	_type: SQLiteInsertBase<
		SQLiteInsertQueryBuilderHKT,
		Assume<this['table'], SQLiteTable>,
		this['runResult'],
		this['returning'],
		this['dynamic'],
		this['excludedMethods']
	>;
}

export type SQLiteInsertKind<
	T extends SQLiteInsertHKTBase,
	TTable extends SQLiteTable,
	TRunResult,
	TReturning = undefined,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> = (T & {
	table: TTable;
	runResult: TRunResult;
	returning: TReturning;
	dynamic: TDynamic;
	excludedMethods: TExcludedMethods;
})['_type'];

export type SQLiteInsertWithout<T extends AnySQLiteInsert, TDynamic extends boolean, K extends keyof T & string> =
	TDynamic extends true ? T
		: Omit<
			SQLiteInsertKind<
				T['_']['hkt'],
				T['_']['table'],
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
	SQLiteInsertKind<
		T['_']['hkt'],
		T['_']['table'],
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
	SQLiteInsertKind<
		T['_']['hkt'],
		T['_']['table'],
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
	/** @deprecated - use either `targetWhere` or `setWhere` */
	where?: SQL;
	// TODO: add tests for targetWhere and setWhere
	targetWhere?: SQL;
	setWhere?: SQL;
	set: SQLiteUpdateSetSource<T['_']['table']>;
};

export type SQLiteInsertDynamic<T extends AnySQLiteInsert> = SQLiteInsertKind<
	T['_']['hkt'],
	T['_']['table'],
	T['_']['runResult'],
	T['_']['returning'],
	true,
	never
>;

export type AnySQLiteInsert = SQLiteInsertBase<any, any, any, any, any, any>;

export type SQLiteInsert<
	TTable extends SQLiteTable = SQLiteTable,
	TRunResult = unknown,
	TReturning = any,
> = SQLiteInsertBase<SQLiteInsertQueryBuilderHKT, TTable, TRunResult, TReturning, true, never>;

export interface SQLiteInsertBase<
	THKT extends SQLiteInsertHKTBase,
	TTable extends SQLiteTable,
	TRunResult,
	TReturning = undefined,
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

export class SQLiteInsertBase<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	THKT extends SQLiteInsertHKTBase,
	TTable extends SQLiteTable,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TRunResult,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TReturning = undefined,
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> implements SQLWrapper {
	static readonly [entityKind]: string = 'SQLiteInsert';

	/** @internal */
	config: SQLiteInsertConfig<TTable>;

	constructor(
		table: TTable,
		values: SQLiteInsertConfig['values'],
		protected session: SQLiteSession<any, any>,
		protected dialect: SQLiteDialect,
		withList?: Subquery[],
		select?: boolean,
	) {
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
		if (!this.config.onConflict) this.config.onConflict = [];

		if (config.target === undefined) {
			this.config.onConflict.push(sql` on conflict do nothing`);
		} else {
			const targetSql = Array.isArray(config.target) ? sql`${config.target}` : sql`${[config.target]}`;
			const whereSql = config.where ? sql` where ${config.where}` : sql``;
			this.config.onConflict.push(sql` on conflict ${targetSql} do nothing${whereSql}`);
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
		if (config.where && (config.targetWhere || config.setWhere)) {
			throw new Error(
				'You cannot use both "where" and "targetWhere"/"setWhere" at the same time - "where" is deprecated, use "targetWhere" or "setWhere" instead.',
			);
		}

		if (!this.config.onConflict) this.config.onConflict = [];

		const whereSql = config.where ? sql` where ${config.where}` : undefined;
		const targetWhereSql = config.targetWhere ? sql` where ${config.targetWhere}` : undefined;
		const setWhereSql = config.setWhere ? sql` where ${config.setWhere}` : undefined;
		const targetSql = Array.isArray(config.target) ? sql`${config.target}` : sql`${[config.target]}`;
		const setSql = this.dialect.buildUpdateSet(this.config.table, mapUpdateSet(this.config.table, config.set));
		this.config.onConflict.push(
			sql` on conflict ${targetSql}${targetWhereSql} do update set ${setSql}${whereSql}${setWhereSql}`,
		);
		return this;
	}

	getSQL(): SQL {
		return this.dialect.buildInsertQuery(this.config);
	}

	toSQL(): Query {
		return this.dialect.sqlToQuery(this.getSQL());
	}

	$dynamic(): SQLiteInsertDynamic<this> {
		return this as any;
	}
}
