import type { CockroachDialect } from '~/cockroach-core/dialect.ts';
import type { IndexColumn } from '~/cockroach-core/indexes.ts';
import type {
	CockroachPreparedQuery,
	CockroachQueryResultHKT,
	CockroachQueryResultKind,
	CockroachSession,
	PreparedQueryConfig,
} from '~/cockroach-core/session.ts';
import type { CockroachTable, TableConfig } from '~/cockroach-core/table.ts';
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
import { getTableName, Table, TableColumns } from '~/table.ts';
import { tracer } from '~/tracing.ts';
import { haveSameKeys, mapUpdateSet, type NeonAuthToken, orderSelectedFields } from '~/utils.ts';
import type { AnyCockroachColumn, CockroachColumn } from '../columns/common.ts';
import { QueryBuilder } from './query-builder.ts';
import type { SelectedFieldsFlat, SelectedFieldsOrdered } from './select.types.ts';
import type { CockroachUpdateSetSource } from './update.ts';

export interface CockroachInsertConfig<TTable extends CockroachTable = CockroachTable> {
	table: TTable;
	values: Record<string, Param | SQL>[] | CockroachInsertSelectQueryBuilder<TTable> | SQL;
	withList?: Subquery[];
	onConflict?: SQL;
	returningFields?: SelectedFieldsFlat;
	returning?: SelectedFieldsOrdered;
	select?: boolean;
}

export type CockroachInsertValue<
	TTable extends CockroachTable<TableConfig>,
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

export type CockroachInsertSelectQueryBuilder<
	TTable extends CockroachTable,
	TModel extends Record<string, any> = InferInsertModel<TTable>,
> = TypedQueryBuilder<
	{ [K in keyof TModel]: AnyCockroachColumn | SQL | SQL.Aliased | TModel[K] }
>;

export class CockroachInsertBuilder<
	TTable extends CockroachTable,
	TQueryResult extends CockroachQueryResultHKT,
	OverrideT extends boolean = false,
> {
	static readonly [entityKind]: string = 'CockroachInsertBuilder';

	constructor(
		private table: TTable,
		private session: CockroachSession,
		private dialect: CockroachDialect,
		private withList?: Subquery[],
	) {}

	values(value: CockroachInsertValue<TTable, OverrideT>): CockroachInsertBase<TTable, TQueryResult>;
	values(values: CockroachInsertValue<TTable, OverrideT>[]): CockroachInsertBase<TTable, TQueryResult>;
	values(
		values: CockroachInsertValue<TTable, OverrideT> | CockroachInsertValue<TTable, OverrideT>[],
	): CockroachInsertBase<TTable, TQueryResult> {
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

		return new CockroachInsertBase(
			this.table,
			mappedValues,
			this.session,
			this.dialect,
			this.withList,
			false,
		) as any;
	}

	select(
		selectQuery: (qb: QueryBuilder) => CockroachInsertSelectQueryBuilder<TTable>,
	): CockroachInsertBase<TTable, TQueryResult>;
	select(selectQuery: (qb: QueryBuilder) => SQL): CockroachInsertBase<TTable, TQueryResult>;
	select(selectQuery: SQL): CockroachInsertBase<TTable, TQueryResult>;
	select(selectQuery: CockroachInsertSelectQueryBuilder<TTable>): CockroachInsertBase<TTable, TQueryResult>;
	select(
		selectQuery:
			| SQL
			| CockroachInsertSelectQueryBuilder<TTable>
			| ((qb: QueryBuilder) => CockroachInsertSelectQueryBuilder<TTable> | SQL),
	): CockroachInsertBase<TTable, TQueryResult> {
		const select = typeof selectQuery === 'function' ? selectQuery(new QueryBuilder()) : selectQuery;

		if (
			!is(select, SQL)
			&& !haveSameKeys(this.table[TableColumns], select._.selectedFields)
		) {
			throw new Error(
				'Insert select error: selected fields are not the same or are in a different order compared to the table definition',
			);
		}

		return new CockroachInsertBase(this.table, select, this.session, this.dialect, this.withList, true);
	}
}

export type CockroachInsertWithout<
	T extends AnyCockroachInsert,
	TDynamic extends boolean,
	K extends keyof T & string,
> = TDynamic extends true ? T
	: Omit<
		CockroachInsertBase<
			T['_']['table'],
			T['_']['queryResult'],
			T['_']['selectedFields'],
			T['_']['returning'],
			TDynamic,
			T['_']['excludedMethods'] | K
		>,
		T['_']['excludedMethods'] | K
	>;

export type CockroachInsertReturning<
	T extends AnyCockroachInsert,
	TDynamic extends boolean,
	TSelectedFields extends SelectedFieldsFlat,
> = CockroachInsertBase<
	T['_']['table'],
	T['_']['queryResult'],
	TSelectedFields,
	SelectResultFields<TSelectedFields>,
	TDynamic,
	T['_']['excludedMethods']
>;

export type CockroachInsertReturningAll<T extends AnyCockroachInsert, TDynamic extends boolean> = CockroachInsertBase<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['table']['_']['columns'],
	T['_']['table']['$inferSelect'],
	TDynamic,
	T['_']['excludedMethods']
>;

export interface CockroachInsertOnConflictDoUpdateConfig<T extends AnyCockroachInsert> {
	target: IndexColumn | IndexColumn[];
	/** @deprecated use either `targetWhere` or `setWhere` */
	where?: SQL;
	// TODO: add tests for targetWhere and setWhere
	targetWhere?: SQL;
	setWhere?: SQL;
	set: CockroachUpdateSetSource<T['_']['table']>;
}

export type CockroachInsertPrepare<T extends AnyCockroachInsert> = CockroachPreparedQuery<
	PreparedQueryConfig & {
		execute: T['_']['returning'] extends undefined ? CockroachQueryResultKind<T['_']['queryResult'], never>
			: T['_']['returning'][];
	}
>;

export type CockroachInsertDynamic<T extends AnyCockroachInsert> = CockroachInsert<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['returning']
>;

export type AnyCockroachInsert = CockroachInsertBase<any, any, any, any, any, any>;

export type CockroachInsert<
	TTable extends CockroachTable = CockroachTable,
	TQueryResult extends CockroachQueryResultHKT = CockroachQueryResultHKT,
	TSelectedFields extends ColumnsSelection | undefined = ColumnsSelection | undefined,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
> = CockroachInsertBase<TTable, TQueryResult, TSelectedFields, TReturning, true, never>;

export interface CockroachInsertBase<
	TTable extends CockroachTable,
	TQueryResult extends CockroachQueryResultHKT,
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends
	TypedQueryBuilder<
		TSelectedFields,
		TReturning extends undefined ? CockroachQueryResultKind<TQueryResult, never> : TReturning[]
	>,
	QueryPromise<TReturning extends undefined ? CockroachQueryResultKind<TQueryResult, never> : TReturning[]>,
	RunnableQuery<
		TReturning extends undefined ? CockroachQueryResultKind<TQueryResult, never> : TReturning[],
		'cockroach'
	>,
	SQLWrapper
{
	readonly _: {
		readonly dialect: 'cockroach';
		readonly table: TTable;
		readonly queryResult: TQueryResult;
		readonly selectedFields: TSelectedFields;
		readonly returning: TReturning;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
		readonly result: TReturning extends undefined ? CockroachQueryResultKind<TQueryResult, never> : TReturning[];
	};
}

export class CockroachInsertBase<
	TTable extends CockroachTable,
	TQueryResult extends CockroachQueryResultHKT,
	TSelectedFields extends ColumnsSelection | undefined = undefined,
	TReturning extends Record<string, unknown> | undefined = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<TReturning extends undefined ? CockroachQueryResultKind<TQueryResult, never> : TReturning[]>
	implements
		TypedQueryBuilder<
			TSelectedFields,
			TReturning extends undefined ? CockroachQueryResultKind<TQueryResult, never> : TReturning[]
		>,
		RunnableQuery<
			TReturning extends undefined ? CockroachQueryResultKind<TQueryResult, never> : TReturning[],
			'cockroach'
		>,
		SQLWrapper
{
	static override readonly [entityKind]: string = 'CockroachInsert';

	private config: CockroachInsertConfig<TTable>;

	constructor(
		table: TTable,
		values: CockroachInsertConfig['values'],
		private session: CockroachSession,
		private dialect: CockroachDialect,
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
	returning(): CockroachInsertWithout<CockroachInsertReturningAll<this, TDynamic>, TDynamic, 'returning'>;
	returning<TSelectedFields extends SelectedFieldsFlat>(
		fields: TSelectedFields,
	): CockroachInsertWithout<CockroachInsertReturning<this, TDynamic, TSelectedFields>, TDynamic, 'returning'>;
	returning(
		fields: SelectedFieldsFlat = this.config.table[Table.Symbol.Columns],
	): CockroachInsertWithout<AnyCockroachInsert, TDynamic, 'returning'> {
		this.config.returningFields = fields;
		this.config.returning = orderSelectedFields<CockroachColumn>(fields);
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
	): CockroachInsertWithout<this, TDynamic, 'onConflictDoNothing' | 'onConflictDoUpdate'> {
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
		config: CockroachInsertOnConflictDoUpdateConfig<this>,
	): CockroachInsertWithout<this, TDynamic, 'onConflictDoNothing' | 'onConflictDoUpdate'> {
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
	_prepare(name?: string): CockroachInsertPrepare<this> {
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			return this.session.prepareQuery<
				PreparedQueryConfig & {
					execute: TReturning extends undefined ? CockroachQueryResultKind<TQueryResult, never> : TReturning[];
				}
			>(this.dialect.sqlToQuery(this.getSQL()), this.config.returning, name, true);
		});
	}

	prepare(name: string): CockroachInsertPrepare<this> {
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

	$dynamic(): CockroachInsertDynamic<this> {
		return this as any;
	}
}
