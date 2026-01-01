import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind, is } from '~/entity.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { IndexColumn } from '~/pg-core/indexes.ts';
import type { PgQueryResultHKT, PgQueryResultKind, PgSession } from '~/pg-core/session.ts';
import type { PgTable, TableConfig } from '~/pg-core/table.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { SelectResultFields } from '~/query-builders/select.types.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection, Placeholder, Query, SQLWrapper } from '~/sql/sql.ts';
import { Param, SQL, sql } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import type { InferInsertModel } from '~/table.ts';
import { getTableName, Table, TableColumns } from '~/table.ts';
import { type Assume, haveSameKeys, mapUpdateSet, type NeonAuthToken, orderSelectedFields } from '~/utils.ts';
import type { AnyPgColumn, PgColumn } from '../columns/common.ts';
import { QueryBuilder } from './query-builder.ts';
import type { SelectedFieldsFlat, SelectedFieldsOrdered } from './select.types.ts';
import type { PgUpdateSetSource } from './update.ts';

export interface PgInsertConfig<TTable extends PgTable = PgTable> {
	table: TTable;
	values: Record<string, Param | SQL>[] | PgInsertSelectQueryBuilder<TTable> | SQL;
	withList?: Subquery[];
	onConflict?: SQL;
	returningFields?: SelectedFieldsFlat;
	returning?: SelectedFieldsOrdered;
	select?: boolean;
	overridingSystemValue_?: boolean;
}

export type PgInsertValue<
	TTable extends PgTable<TableConfig>,
	OverrideT extends boolean = false,
	TModel extends Record<string, any> = InferInsertModel<TTable, { dbColumnNames: false; override: OverrideT }>,
> =
	& {
		[Key in keyof TModel]:
			| TModel[Key]
			| SQL
			| Placeholder;
	}
	& {};

export type PgInsertSelectQueryBuilder<
	TTable extends PgTable,
	TModel extends Record<string, any> = InferInsertModel<TTable>,
> = TypedQueryBuilder<
	{ [K in keyof TModel]: AnyPgColumn | SQL | SQL.Aliased | TModel[K] }
>;

export interface PgInsertBuilderConstructor {
	new(
		table: PgTable,
		values: PgInsertConfig['values'],
		session: PgSession,
		dialect: PgDialect,
		withList?: Subquery[],
		select?: boolean,
		overridingSystemValue_?: boolean,
	): AnyPgInsert;
}

export class PgInsertBuilder<
	TTable extends PgTable,
	TQueryResult extends PgQueryResultHKT,
	OverrideT extends boolean = false,
	TBuilderHKT extends PgInsertHKTBase = PgInsertHKT,
> {
	static readonly [entityKind]: string = 'PgInsertBuilder';

	constructor(
		private table: TTable,
		private session: PgSession,
		private dialect: PgDialect,
		private withList?: Subquery[],
		private overridingSystemValue_?: boolean,
		private builder: PgInsertBuilderConstructor = PgInsertBase,
	) {}

	/** @internal */
	private authToken?: NeonAuthToken;
	/** @internal */
	setToken(token?: NeonAuthToken) {
		this.authToken = token;
		return this;
	}

	overridingSystemValue(): Omit<PgInsertBuilder<TTable, TQueryResult, true, TBuilderHKT>, 'overridingSystemValue'> {
		this.overridingSystemValue_ = true;
		return this as any;
	}

	values(value: PgInsertValue<TTable, OverrideT>): PgInsertKind<TBuilderHKT, TTable, TQueryResult>;
	values(values: PgInsertValue<TTable, OverrideT>[]): PgInsertKind<TBuilderHKT, TTable, TQueryResult>;
	values(
		values: PgInsertValue<TTable, OverrideT> | PgInsertValue<TTable, OverrideT>[],
	): PgInsertKind<TBuilderHKT, TTable, TQueryResult> {
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

		const builder = new this.builder(
			this.table,
			mappedValues,
			this.session,
			this.dialect,
			this.withList,
			false,
			this.overridingSystemValue_,
		);

		if ('setToken' in builder) {
			(builder.setToken as (authToken?: NeonAuthToken) => typeof builder)(this.authToken);
		}

		return builder as any;
	}

	select(
		selectQuery: (qb: QueryBuilder) => PgInsertSelectQueryBuilder<TTable>,
	): PgInsertKind<TBuilderHKT, TTable, TQueryResult>;
	select(selectQuery: (qb: QueryBuilder) => SQL): PgInsertKind<TBuilderHKT, TTable, TQueryResult>;
	select(selectQuery: SQL): PgInsertBase<TBuilderHKT, TTable, TQueryResult>;
	select(selectQuery: PgInsertSelectQueryBuilder<TTable>): PgInsertKind<TBuilderHKT, TTable, TQueryResult>;
	select(
		selectQuery:
			| SQL
			| PgInsertSelectQueryBuilder<TTable>
			| ((qb: QueryBuilder) => PgInsertSelectQueryBuilder<TTable> | SQL),
	): PgInsertKind<TBuilderHKT, TTable, TQueryResult> {
		const select = typeof selectQuery === 'function' ? selectQuery(new QueryBuilder()) : selectQuery;

		if (
			!is(select, SQL)
			&& !haveSameKeys(this.table[TableColumns], select._.selectedFields)
		) {
			throw new Error(
				'Insert select error: selected fields are not the same or are in a different order compared to the table definition',
			);
		}

		const builder = new this.builder(this.table, select, this.session, this.dialect, this.withList, true) as any;

		if ('setToken' in builder) {
			(builder.setToken as (authToken?: NeonAuthToken) => typeof builder)(this.authToken);
		}

		return builder as any;
	}
}

export interface PgInsertHKTBase {
	table: unknown;
	queryResult: unknown;
	selectedFields: unknown;
	returning: unknown;
	dynamic: boolean;
	excludedMethods: string;
	result: unknown;
	_type: unknown;
}

export interface PgInsertHKT extends PgInsertHKTBase {
	_type: PgInsertBase<
		PgInsertHKT,
		Assume<this['table'], PgTable>,
		Assume<this['queryResult'], PgQueryResultHKT>,
		this['selectedFields'],
		this['returning'],
		this['dynamic'],
		this['excludedMethods']
	>;
}

export type PgInsertKind<
	T extends PgInsertHKTBase,
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

export type PgInsertWithout<T extends AnyPgInsert, TDynamic extends boolean, K extends string> = TDynamic extends true
	? T
	: Omit<
		PgInsertKind<
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

export type PgInsertReturning<
	T extends AnyPgInsert,
	TDynamic extends boolean,
	TSelectedFields extends SelectedFieldsFlat,
> = T extends any ? PgInsertWithout<
		PgInsertKind<
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

export type PgInsertReturningAll<T extends AnyPgInsert, TDynamic extends boolean> = T extends any ? PgInsertWithout<
		PgInsertKind<
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

export interface PgInsertOnConflictDoUpdateConfig<T extends AnyPgInsert> {
	target: IndexColumn | IndexColumn[];
	/** @deprecated use either `targetWhere` or `setWhere` */
	where?: SQL;
	// TODO: add tests for targetWhere and setWhere
	targetWhere?: SQL;
	setWhere?: SQL;
	set: PgUpdateSetSource<T['_']['table']>;
}

export type PgInsertDynamic<T extends AnyPgInsert> = PgInsertKind<
	T['_']['hkt'],
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['selectedFields'],
	T['_']['returning'],
	true,
	never
>;

export type AnyPgInsert = PgInsertBase<any, any, any, any, any, any, any>;

export type PgInsert<
	TTable extends PgTable = PgTable,
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TSelectedFields extends ColumnsSelection | undefined = ColumnsSelection | undefined,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
> = PgInsertBase<PgInsertHKT, TTable, TQueryResult, TSelectedFields, TReturning, true, never>;

export interface PgInsertBase<
	THKT extends PgInsertHKTBase,
	TTable extends PgTable,
	TQueryResult extends PgQueryResultHKT,
	TSelectedFields = undefined,
	TReturning = undefined,
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

export class PgInsertBase<
	// oxlint-disable-next-line no-unused-vars
	THKT extends PgInsertHKTBase,
	TTable extends PgTable,
	TQueryResult extends PgQueryResultHKT,
	TSelectedFields = undefined,
	TReturning = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
	static readonly [entityKind]: string = 'PgInsert';

	protected config: PgInsertConfig<TTable>;
	protected cacheConfig?: WithCacheConfig;

	constructor(
		table: TTable,
		values: PgInsertConfig['values'],
		protected session: PgSession,
		protected dialect: PgDialect,
		withList?: Subquery[],
		select?: boolean,
		overridingSystemValue_?: boolean,
	) {
		this.config = { table, values: values as any, withList, select, overridingSystemValue_ };
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
	returning(): PgInsertReturningAll<this, TDynamic>;
	returning<TSelectedFields extends SelectedFieldsFlat>(
		fields: TSelectedFields,
	): PgInsertReturning<this, TDynamic, TSelectedFields>;
	returning(
		fields: SelectedFieldsFlat = this.config.table[Table.Symbol.Columns],
	): PgInsertReturningAll<this, TDynamic> | PgInsertReturning<this, TDynamic, SelectedFieldsFlat> {
		this.config.returningFields = fields;
		this.config.returning = orderSelectedFields<PgColumn>(this.config.returningFields);
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
	): PgInsertWithout<this, TDynamic, 'onConflictDoNothing' | 'onConflictDoUpdate'> {
		if (config.target === undefined) {
			this.config.onConflict = sql`do nothing`;
		} else {
			let targetColumn = '';
			targetColumn = Array.isArray(config.target)
				? config.target.map((it) => this.dialect.escapeName(this.dialect.casing.getColumnCasing(it))).join(',')
				: this.dialect.escapeName(this.dialect.casing.getColumnCasing(config.target));

			const whereSql = config.where ? sql` where ${config.where}` : undefined;
			this.config.onConflict = sql`(${sql.raw(targetColumn)})${whereSql} do nothing`;
		}
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
	 *     targetWhere: sql`${cars.createdAt} > '2023-01-01'::date`,
	 *   });
	 * ```
	 */
	onConflictDoUpdate(
		config: PgInsertOnConflictDoUpdateConfig<this>,
	): PgInsertWithout<this, TDynamic, 'onConflictDoNothing' | 'onConflictDoUpdate'> {
		if (config.where && (config.targetWhere || config.setWhere)) {
			throw new Error(
				'You cannot use both "where" and "targetWhere"/"setWhere" at the same time - "where" is deprecated, use "targetWhere" or "setWhere" instead.',
			);
		}
		const whereSql = config.where ? sql` where ${config.where}` : undefined;
		const targetWhereSql = config.targetWhere ? sql` where ${config.targetWhere}` : undefined;
		const setWhereSql = config.setWhere ? sql` where ${config.setWhere}` : undefined;
		const setSql = this.dialect.buildUpdateSet(this.config.table, mapUpdateSet(this.config.table, config.set));
		let targetColumn = '';
		targetColumn = Array.isArray(config.target)
			? config.target.map((it) => this.dialect.escapeName(this.dialect.casing.getColumnCasing(it))).join(',')
			: this.dialect.escapeName(this.dialect.casing.getColumnCasing(config.target));
		this.config.onConflict = sql`(${
			sql.raw(targetColumn)
		})${targetWhereSql} do update set ${setSql}${whereSql}${setWhereSql}`;
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

	$dynamic(): PgInsertDynamic<this> {
		return this as any;
	}
}
