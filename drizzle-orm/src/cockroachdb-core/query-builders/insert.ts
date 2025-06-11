import type { CockroachDbDialect } from '~/cockroachdb-core/dialect.ts';
import type { IndexColumn } from '~/cockroachdb-core/indexes.ts';
import type {
	CockroachDbPreparedQuery,
	CockroachDbQueryResultHKT,
	CockroachDbQueryResultKind,
	CockroachDbSession,
	PreparedQueryConfig,
} from '~/cockroachdb-core/session.ts';
import type { CockroachDbTable, TableConfig } from '~/cockroachdb-core/table.ts';
import { entityKind, is } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { SelectResultFields } from '~/query-builders/select.types.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection, Placeholder, Query, SQLWrapper } from '~/sql/sql.ts';
import { Param, SQL, sql } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import type { InferInsertModel } from '~/table.ts';
import { Columns, getTableName, Table } from '~/table.ts';
import { tracer } from '~/tracing.ts';
import { haveSameKeys, mapUpdateSet, type NeonAuthToken, orderSelectedFields } from '~/utils.ts';
import type { AnyCockroachDbColumn, CockroachDbColumn } from '../columns/common.ts';
import { QueryBuilder } from './query-builder.ts';
import type { SelectedFieldsFlat, SelectedFieldsOrdered } from './select.types.ts';
import type { CockroachDbUpdateSetSource } from './update.ts';

export interface CockroachDbInsertConfig<TTable extends CockroachDbTable = CockroachDbTable> {
	table: TTable;
	values: Record<string, Param | SQL>[] | CockroachDbInsertSelectQueryBuilder<TTable> | SQL;
	withList?: Subquery[];
	onConflict?: SQL;
	returningFields?: SelectedFieldsFlat;
	returning?: SelectedFieldsOrdered;
	select?: boolean;
}

export type CockroachDbInsertValue<TTable extends CockroachDbTable<TableConfig>, OverrideT extends boolean = false> =
	& {
		[Key in keyof InferInsertModel<TTable, { dbColumnNames: false; override: OverrideT }>]:
			| InferInsertModel<TTable, { dbColumnNames: false; override: OverrideT }>[Key]
			| SQL
			| Placeholder;
	}
	& {};

export type CockroachDbInsertSelectQueryBuilder<TTable extends CockroachDbTable> = TypedQueryBuilder<
	{ [K in keyof TTable['$inferInsert']]: AnyCockroachDbColumn | SQL | SQL.Aliased | TTable['$inferInsert'][K] }
>;

export class CockroachDbInsertBuilder<
	TTable extends CockroachDbTable,
	TQueryResult extends CockroachDbQueryResultHKT,
	OverrideT extends boolean = false,
> {
	static readonly [entityKind]: string = 'CockroachDbInsertBuilder';

	constructor(
		private table: TTable,
		private session: CockroachDbSession,
		private dialect: CockroachDbDialect,
		private withList?: Subquery[],
	) {}

	values(value: CockroachDbInsertValue<TTable, OverrideT>): CockroachDbInsertBase<TTable, TQueryResult>;
	values(values: CockroachDbInsertValue<TTable, OverrideT>[]): CockroachDbInsertBase<TTable, TQueryResult>;
	values(
		values: CockroachDbInsertValue<TTable, OverrideT> | CockroachDbInsertValue<TTable, OverrideT>[],
	): CockroachDbInsertBase<TTable, TQueryResult> {
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

		return new CockroachDbInsertBase(
			this.table,
			mappedValues,
			this.session,
			this.dialect,
			this.withList,
			false,
		) as any;
	}

	select(
		selectQuery: (qb: QueryBuilder) => CockroachDbInsertSelectQueryBuilder<TTable>,
	): CockroachDbInsertBase<TTable, TQueryResult>;
	select(selectQuery: (qb: QueryBuilder) => SQL): CockroachDbInsertBase<TTable, TQueryResult>;
	select(selectQuery: SQL): CockroachDbInsertBase<TTable, TQueryResult>;
	select(selectQuery: CockroachDbInsertSelectQueryBuilder<TTable>): CockroachDbInsertBase<TTable, TQueryResult>;
	select(
		selectQuery:
			| SQL
			| CockroachDbInsertSelectQueryBuilder<TTable>
			| ((qb: QueryBuilder) => CockroachDbInsertSelectQueryBuilder<TTable> | SQL),
	): CockroachDbInsertBase<TTable, TQueryResult> {
		const select = typeof selectQuery === 'function' ? selectQuery(new QueryBuilder()) : selectQuery;

		if (
			!is(select, SQL)
			&& !haveSameKeys(this.table[Columns], select._.selectedFields)
		) {
			throw new Error(
				'Insert select error: selected fields are not the same or are in a different order compared to the table definition',
			);
		}

		return new CockroachDbInsertBase(this.table, select, this.session, this.dialect, this.withList, true);
	}
}

export type CockroachDbInsertWithout<
	T extends AnyCockroachDbInsert,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T
	: Omit<
		CockroachDbInsertBase<
			T['_']['table'],
			T['_']['queryResult'],
			T['_']['selectedFields'],
			T['_']['returning'],
			TDynamic,
			T['_']['excludedMethods'] | K
		>,
		T['_']['excludedMethods'] | K
	>;

export type CockroachDbInsertReturning<
	T extends AnyCockroachDbInsert,
	TDynamic extends boolean,
	TSelectedFields extends SelectedFieldsFlat,
> = CockroachDbInsertBase<
	T['_']['table'],
	T['_']['queryResult'],
	TSelectedFields,
	SelectResultFields<TSelectedFields>,
	TDynamic,
	T['_']['excludedMethods']
>;

export type CockroachDbInsertReturningAll<T extends AnyCockroachDbInsert, TDynamic extends boolean> =
	CockroachDbInsertBase<
		T['_']['table'],
		T['_']['queryResult'],
		T['_']['table']['_']['columns'],
		T['_']['table']['$inferSelect'],
		TDynamic,
		T['_']['excludedMethods']
	>;

export interface CockroachDbInsertOnConflictDoUpdateConfig<T extends AnyCockroachDbInsert> {
	target: IndexColumn | IndexColumn[];
	/** @deprecated use either `targetWhere` or `setWhere` */
	where?: SQL;
	// TODO: add tests for targetWhere and setWhere
	targetWhere?: SQL;
	setWhere?: SQL;
	set: CockroachDbUpdateSetSource<T['_']['table']>;
}

export type CockroachDbInsertPrepare<T extends AnyCockroachDbInsert> = CockroachDbPreparedQuery<
	PreparedQueryConfig & {
		execute: T['_']['returning'] extends undefined ? CockroachDbQueryResultKind<T['_']['queryResult'], never>
			: T['_']['returning'][];
	}
>;

export type CockroachDbInsertDynamic<T extends AnyCockroachDbInsert> = CockroachDbInsert<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['returning']
>;

export type AnyCockroachDbInsert = CockroachDbInsertBase<any, any, any, any, any, any>;

export type CockroachDbInsert<
	TTable extends CockroachDbTable = CockroachDbTable,
	TQueryResult extends CockroachDbQueryResultHKT = CockroachDbQueryResultHKT,
	TSelectedFields extends ColumnsSelection | undefined = ColumnsSelection | undefined,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
> = CockroachDbInsertBase<TTable, TQueryResult, TSelectedFields, TReturning, true, never>;

export interface CockroachDbInsertBase<
	TTable extends CockroachDbTable,
	TQueryResult extends CockroachDbQueryResultHKT,
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends
	TypedQueryBuilder<
		TSelectedFields,
		TReturning extends undefined ? CockroachDbQueryResultKind<TQueryResult, never> : TReturning[]
	>,
	QueryPromise<TReturning extends undefined ? CockroachDbQueryResultKind<TQueryResult, never> : TReturning[]>,
	RunnableQuery<
		TReturning extends undefined ? CockroachDbQueryResultKind<TQueryResult, never> : TReturning[],
		'cockroachdb'
	>,
	SQLWrapper
{
	readonly _: {
		readonly dialect: 'cockroachdb';
		readonly table: TTable;
		readonly queryResult: TQueryResult;
		readonly selectedFields: TSelectedFields;
		readonly returning: TReturning;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
		readonly result: TReturning extends undefined ? CockroachDbQueryResultKind<TQueryResult, never> : TReturning[];
	};
}

export class CockroachDbInsertBase<
	TTable extends CockroachDbTable,
	TQueryResult extends CockroachDbQueryResultHKT,
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<TReturning extends undefined ? CockroachDbQueryResultKind<TQueryResult, never> : TReturning[]>
	implements
		TypedQueryBuilder<
			TSelectedFields,
			TReturning extends undefined ? CockroachDbQueryResultKind<TQueryResult, never> : TReturning[]
		>,
		RunnableQuery<
			TReturning extends undefined ? CockroachDbQueryResultKind<TQueryResult, never> : TReturning[],
			'cockroachdb'
		>,
		SQLWrapper
{
	static override readonly [entityKind]: string = 'CockroachDbInsert';

	private config: CockroachDbInsertConfig<TTable>;

	constructor(
		table: TTable,
		values: CockroachDbInsertConfig['values'],
		private session: CockroachDbSession,
		private dialect: CockroachDbDialect,
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
	returning(): CockroachDbInsertWithout<CockroachDbInsertReturningAll<this, TDynamic>, TDynamic, 'returning'>;
	returning<TSelectedFields extends SelectedFieldsFlat>(
		fields: TSelectedFields,
	): CockroachDbInsertWithout<CockroachDbInsertReturning<this, TDynamic, TSelectedFields>, TDynamic, 'returning'>;
	returning(
		fields: SelectedFieldsFlat = this.config.table[Table.Symbol.Columns],
	): CockroachDbInsertWithout<AnyCockroachDbInsert, TDynamic, 'returning'> {
		this.config.returningFields = fields;
		this.config.returning = orderSelectedFields<CockroachDbColumn>(fields);
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
	): CockroachDbInsertWithout<this, TDynamic, 'onConflictDoNothing' | 'onConflictDoUpdate'> {
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
		config: CockroachDbInsertOnConflictDoUpdateConfig<this>,
	): CockroachDbInsertWithout<this, TDynamic, 'onConflictDoNothing' | 'onConflictDoUpdate'> {
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
	_prepare(name?: string): CockroachDbInsertPrepare<this> {
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			return this.session.prepareQuery<
				PreparedQueryConfig & {
					execute: TReturning extends undefined ? CockroachDbQueryResultKind<TQueryResult, never> : TReturning[];
				}
			>(this.dialect.sqlToQuery(this.getSQL()), this.config.returning, name, true);
		});
	}

	prepare(name: string): CockroachDbInsertPrepare<this> {
		return this._prepare(name);
	}

	private authToken?: NeonAuthToken;
	/** @internal */
	setToken(token?: NeonAuthToken) {
		this.authToken = token;
		return this;
	}

	override execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return tracer.startActiveSpan('drizzle.operation', () => {
			return this._prepare().execute(placeholderValues, this.authToken);
		});
	};

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

	$dynamic(): CockroachDbInsertDynamic<this> {
		return this as any;
	}
}
