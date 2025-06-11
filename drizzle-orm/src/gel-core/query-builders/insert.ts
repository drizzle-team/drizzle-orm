import { entityKind, is } from '~/entity.ts';
import type { GelDialect } from '~/gel-core/dialect.ts';
import type { IndexColumn } from '~/gel-core/indexes.ts';
import type {
	GelPreparedQuery,
	GelQueryResultHKT,
	GelQueryResultKind,
	GelSession,
	PreparedQueryConfig,
} from '~/gel-core/session.ts';
import type { GelTable, TableConfig } from '~/gel-core/table.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { SelectResultFields } from '~/query-builders/select.types.ts';
import { QueryPromise } from '~/query-promise.ts';
import type { RunnableQuery } from '~/runnable-query.ts';
import type { Placeholder, Query, SQLWrapper } from '~/sql/sql.ts';
import { Param, SQL } from '~/sql/sql.ts';
import type { Subquery } from '~/subquery.ts';
import type { InferInsertModel } from '~/table.ts';
import { Columns, Table } from '~/table.ts';
import { tracer } from '~/tracing.ts';
import { haveSameKeys, type NeonAuthToken, orderSelectedFields } from '~/utils.ts';
import type { AnyGelColumn, GelColumn } from '../columns/common.ts';
import { extractUsedTable } from '../utils.ts';
import { QueryBuilder } from './query-builder.ts';
import type { SelectedFieldsFlat, SelectedFieldsOrdered } from './select.types.ts';
import type { GelUpdateSetSource } from './update.ts';

export interface GelInsertConfig<TTable extends GelTable = GelTable> {
	table: TTable;
	values: Record<string, Param | SQL>[] | GelInsertSelectQueryBuilder<TTable> | SQL;
	withList?: Subquery[];
	onConflict?: SQL;
	returning?: SelectedFieldsOrdered;
	select?: boolean;
	overridingSystemValue_?: boolean;
}

export type GelInsertValue<TTable extends GelTable<TableConfig>, OverrideT extends boolean = false> =
	& {
		[Key in keyof InferInsertModel<TTable, { dbColumnNames: false; override: OverrideT }>]:
			| InferInsertModel<TTable, { dbColumnNames: false; override: OverrideT }>[Key]
			| SQL
			| Placeholder;
	}
	& {};

export type GelInsertSelectQueryBuilder<TTable extends GelTable> = TypedQueryBuilder<
	{ [K in keyof TTable['$inferInsert']]: AnyGelColumn | SQL | SQL.Aliased | TTable['$inferInsert'][K] }
>;

export class GelInsertBuilder<
	TTable extends GelTable,
	TQueryResult extends GelQueryResultHKT,
	OverrideT extends boolean = false,
> {
	static readonly [entityKind]: string = 'GelInsertBuilder';

	constructor(
		private table: TTable,
		private session: GelSession,
		private dialect: GelDialect,
		private withList?: Subquery[],
		private overridingSystemValue_?: boolean,
	) {}

	private authToken?: NeonAuthToken;
	/** @internal */
	setToken(token?: NeonAuthToken) {
		this.authToken = token;
		return this;
	}

	overridingSystemValue(): Omit<GelInsertBuilder<TTable, TQueryResult, true>, 'overridingSystemValue'> {
		this.overridingSystemValue_ = true;
		return this as any;
	}

	values(value: GelInsertValue<TTable, OverrideT>): GelInsertBase<TTable, TQueryResult>;
	values(values: GelInsertValue<TTable, OverrideT>[]): GelInsertBase<TTable, TQueryResult>;
	values(
		values: GelInsertValue<TTable, OverrideT> | GelInsertValue<TTable, OverrideT>[],
	): GelInsertBase<TTable, TQueryResult> {
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

		return new GelInsertBase(
			this.table,
			mappedValues,
			this.session,
			this.dialect,
			this.withList,
			false,
			this.overridingSystemValue_,
		);
	}

	select(selectQuery: (qb: QueryBuilder) => GelInsertSelectQueryBuilder<TTable>): GelInsertBase<TTable, TQueryResult>;
	select(selectQuery: (qb: QueryBuilder) => SQL): GelInsertBase<TTable, TQueryResult>;
	select(selectQuery: SQL): GelInsertBase<TTable, TQueryResult>;
	select(selectQuery: GelInsertSelectQueryBuilder<TTable>): GelInsertBase<TTable, TQueryResult>;
	select(
		selectQuery:
			| SQL
			| GelInsertSelectQueryBuilder<TTable>
			| ((qb: QueryBuilder) => GelInsertSelectQueryBuilder<TTable> | SQL),
	): GelInsertBase<TTable, TQueryResult> {
		const select = typeof selectQuery === 'function' ? selectQuery(new QueryBuilder()) : selectQuery;

		if (
			!is(select, SQL)
			&& !haveSameKeys(this.table[Columns], select._.selectedFields)
		) {
			throw new Error(
				'Insert select error: selected fields are not the same or are in a different order compared to the table definition',
			);
		}

		return new GelInsertBase(this.table, select, this.session, this.dialect, this.withList, true);
	}
}

export type GelInsertWithout<T extends AnyGelInsert, TDynamic extends boolean, K extends keyof T & string> =
	TDynamic extends true ? T
		: Omit<
			GelInsertBase<
				T['_']['table'],
				T['_']['queryResult'],
				T['_']['returning'],
				TDynamic,
				T['_']['excludedMethods'] | K
			>,
			T['_']['excludedMethods'] | K
		>;

export type GelInsertReturning<
	T extends AnyGelInsert,
	TDynamic extends boolean,
	TSelectedFields extends SelectedFieldsFlat,
> = GelInsertBase<
	T['_']['table'],
	T['_']['queryResult'],
	SelectResultFields<TSelectedFields>,
	TDynamic,
	T['_']['excludedMethods']
>;

export type GelInsertReturningAll<T extends AnyGelInsert, TDynamic extends boolean> = GelInsertBase<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['table']['$inferSelect'],
	TDynamic,
	T['_']['excludedMethods']
>;

export interface GelInsertOnConflictDoUpdateConfig<T extends AnyGelInsert> {
	target: IndexColumn | IndexColumn[];
	/** @deprecated use either `targetWhere` or `setWhere` */
	where?: SQL;
	// TODO: add tests for targetWhere and setWhere
	targetWhere?: SQL;
	setWhere?: SQL;
	set: GelUpdateSetSource<T['_']['table']>;
}

export type GelInsertPrepare<T extends AnyGelInsert> = GelPreparedQuery<
	PreparedQueryConfig & {
		execute: T['_']['returning'] extends undefined ? GelQueryResultKind<T['_']['queryResult'], never>
			: T['_']['returning'][];
	}
>;

export type GelInsertDynamic<T extends AnyGelInsert> = GelInsert<
	T['_']['table'],
	T['_']['queryResult'],
	T['_']['returning']
>;

export type AnyGelInsert = GelInsertBase<any, any, any, any, any>;

export type GelInsert<
	TTable extends GelTable = GelTable,
	TQueryResult extends GelQueryResultHKT = GelQueryResultHKT,
	TReturning extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
> = GelInsertBase<TTable, TQueryResult, TReturning, true, never>;

export interface GelInsertBase<
	TTable extends GelTable,
	TQueryResult extends GelQueryResultHKT,
	TReturning extends Record<string, unknown> | undefined = undefined,
	TDynamic extends boolean = false,
	TExcludedMethods extends string = never,
> extends
	QueryPromise<TReturning extends undefined ? GelQueryResultKind<TQueryResult, never> : TReturning[]>,
	RunnableQuery<TReturning extends undefined ? GelQueryResultKind<TQueryResult, never> : TReturning[], 'gel'>,
	SQLWrapper
{
	readonly _: {
		readonly dialect: 'gel';
		readonly table: TTable;
		readonly queryResult: TQueryResult;
		readonly returning: TReturning;
		readonly dynamic: TDynamic;
		readonly excludedMethods: TExcludedMethods;
		readonly result: TReturning extends undefined ? GelQueryResultKind<TQueryResult, never> : TReturning[];
	};
}

export class GelInsertBase<
	TTable extends GelTable,
	TQueryResult extends GelQueryResultHKT,
	TReturning extends Record<string, unknown> | undefined = undefined,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TDynamic extends boolean = false,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	TExcludedMethods extends string = never,
> extends QueryPromise<TReturning extends undefined ? GelQueryResultKind<TQueryResult, never> : TReturning[]>
	implements
		RunnableQuery<TReturning extends undefined ? GelQueryResultKind<TQueryResult, never> : TReturning[], 'gel'>,
		SQLWrapper
{
	static override readonly [entityKind]: string = 'GelInsert';

	private config: GelInsertConfig<TTable>;

	constructor(
		table: TTable,
		values: GelInsertConfig['values'],
		private session: GelSession,
		private dialect: GelDialect,
		withList?: Subquery[],
		select?: boolean,
		overridingSystemValue_?: boolean,
	) {
		super();
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
	returning(): GelInsertWithout<GelInsertReturningAll<this, TDynamic>, TDynamic, 'returning'>;
	returning<TSelectedFields extends SelectedFieldsFlat>(
		fields: TSelectedFields,
	): GelInsertWithout<GelInsertReturning<this, TDynamic, TSelectedFields>, TDynamic, 'returning'>;
	returning(
		fields: SelectedFieldsFlat = this.config.table[Table.Symbol.Columns],
	): GelInsertWithout<AnyGelInsert, TDynamic, 'returning'> {
		this.config.returning = orderSelectedFields<GelColumn>(fields);
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
	// TODO not supported
	// onConflictDoNothing(
	// 	config: { target?: IndexColumn | IndexColumn[]; where?: SQL } = {},
	// ): GelInsertWithout<this, TDynamic, 'onConflictDoNothing' | 'onConflictDoUpdate'> {
	// 	if (config.target === undefined) {
	// 		this.config.onConflict = sql`do nothing`;
	// 	} else {
	// 		let targetColumn = '';
	// 		targetColumn = Array.isArray(config.target)
	// 			? config.target.map((it) => this.dialect.escapeName(this.dialect.casing.getColumnCasing(it))).join(',')
	// 			: this.dialect.escapeName(this.dialect.casing.getColumnCasing(config.target));

	// 		const whereSql = config.where ? sql` where ${config.where}` : undefined;
	// 		this.config.onConflict = sql`(${sql.raw(targetColumn)})${whereSql} do nothing`;
	// 	}
	// 	return this as any;
	// }

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
	// TODO not supported
	// onConflictDoUpdate(
	// 	config: GelInsertOnConflictDoUpdateConfig<this>,
	// ): GelInsertWithout<this, TDynamic, 'onConflictDoNothing' | 'onConflictDoUpdate'> {
	// 	if (config.where && (config.targetWhere || config.setWhere)) {
	// 		throw new Error(
	// 			'You cannot use both "where" and "targetWhere"/"setWhere" at the same time - "where" is deprecated, use "targetWhere" or "setWhere" instead.',
	// 		);
	// 	}
	// 	const whereSql = config.where ? sql` where ${config.where}` : undefined;
	// 	const targetWhereSql = config.targetWhere ? sql` where ${config.targetWhere}` : undefined;
	// 	const setWhereSql = config.setWhere ? sql` where ${config.setWhere}` : undefined;
	// 	const setSql = this.dialect.buildUpdateSet(this.config.table, mapUpdateSet(this.config.table, config.set));
	// 	let targetColumn = '';
	// 	targetColumn = Array.isArray(config.target)
	// 		? config.target.map((it) => this.dialect.escapeName(this.dialect.casing.getColumnCasing(it))).join(',')
	// 		: this.dialect.escapeName(this.dialect.casing.getColumnCasing(config.target));
	// 	this.config.onConflict = sql`(${
	// 		sql.raw(targetColumn)
	// 	})${targetWhereSql} do update set ${setSql}${whereSql}${setWhereSql}`;
	// 	return this as any;
	// }

	/** @internal */
	getSQL(): SQL {
		return this.dialect.buildInsertQuery(this.config);
	}

	toSQL(): Query {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}

	/** @internal */
	_prepare(name?: string): GelInsertPrepare<this> {
		return tracer.startActiveSpan('drizzle.prepareQuery', () => {
			return this.session.prepareQuery<
				PreparedQueryConfig & {
					execute: TReturning extends undefined ? GelQueryResultKind<TQueryResult, never> : TReturning[];
				}
			>(this.dialect.sqlToQuery(this.getSQL()), this.config.returning, name, true, undefined, {
				type: 'insert',
				tables: extractUsedTable(this.config.table),
			});
		});
	}

	prepare(name: string): GelInsertPrepare<this> {
		return this._prepare(name);
	}

	override execute: ReturnType<this['prepare']>['execute'] = (placeholderValues) => {
		return tracer.startActiveSpan('drizzle.operation', () => {
			return this._prepare().execute(placeholderValues);
		});
	};

	$dynamic(): GelInsertDynamic<this> {
		return this as any;
	}
}
