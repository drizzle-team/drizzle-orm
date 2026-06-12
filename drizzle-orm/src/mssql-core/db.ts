import type * as V1 from '~/_relations.ts';
import type { Cache } from '~/cache/core/cache.ts';
import { entityKind } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import { type ColumnsSelection, type SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import { WithSubquery } from '~/subquery.ts';
import type { DrizzleTypeError } from '~/utils.ts';
import type { MsSqlDialect } from './dialect.ts';
import { MsSqlCountBuilder } from './query-builders/count.ts';
import {
	MsSqlDeleteBase,
	MsSqlInsertBuilder,
	MsSqlSelectBuilder,
	MsSqlUpdateBuilder,
	QueryBuilder,
} from './query-builders/index.ts';
import { RelationalQueryBuilder } from './query-builders/query-v2.ts';
import { RelationalQueryBuilder as RelationalQueryBuilderV1 } from './query-builders/query.ts';
import { MsSqlRaw } from './query-builders/raw.ts';
import type { SelectedFields } from './query-builders/select.types.ts';
import type {
	MsSqlSession,
	MsSqlTransaction,
	MsSqlTransactionConfig,
	PreparedQueryConfig,
	PreparedQueryHKTBase,
	QueryResultHKT,
	QueryResultKind,
} from './session.ts';
import type { WithSubqueryWithSelection } from './subquery.ts';
import type { MsSqlTable } from './table.ts';
import type { MsSqlViewBase } from './view-base.ts';
import type { MsSqlView } from './view.ts';

export class MsSqlDatabase<
	TQueryResult extends QueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TFullSchema extends Record<string, unknown> = {},
	TSchema extends V1.TablesRelationalConfig = V1.ExtractTablesWithRelations<TFullSchema>,
	TRelations extends AnyRelations = EmptyRelations,
> {
	static readonly [entityKind]: string = 'MsSqlDatabase';

	declare readonly _: {
		readonly schema: TSchema | undefined;
		readonly tableNamesMap: Record<string, string>;
		readonly relations: TRelations;
	};

	query: {
		[K in keyof TRelations]: RelationalQueryBuilder<TRelations, TRelations[K], TPreparedQueryHKT>;
	};

	_query: TFullSchema extends Record<string, never>
		? DrizzleTypeError<'Seems like the schema generic is missing - did you forget to add it to your DB type?'>
		: {
			[K in keyof TSchema]: RelationalQueryBuilderV1<TPreparedQueryHKT, TSchema, TSchema[K]>;
		};

	constructor(
		/** @internal */
		readonly dialect: MsSqlDialect,
		/** @internal */
		readonly session: MsSqlSession<any, any, any, any, any>,
		schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		relations: TRelations = {} as TRelations,
	) {
		this._ = schema
			? { schema: schema.schema, tableNamesMap: schema.tableNamesMap, relations }
			: { schema: undefined, tableNamesMap: {}, relations };
		this.query = {} as typeof this['query'];
		for (const [tableName, relation] of Object.entries(relations)) {
			(this.query as MsSqlDatabase<
				TQueryResult,
				TPreparedQueryHKT,
				TFullSchema,
				TSchema,
				AnyRelations
			>['query'])[tableName] = new RelationalQueryBuilder(
				relations,
				relation.table as MsSqlTable | MsSqlView,
				relation,
				dialect,
				session,
			);
		}

		this._query = {} as typeof this['_query'];
		if (this._.schema) {
			for (const [tableName, columns] of Object.entries(this._.schema)) {
				(this._query as MsSqlDatabase<TQueryResult, TPreparedQueryHKT, Record<string, any>>['_query'])[tableName] =
					new RelationalQueryBuilderV1(
						schema!.fullSchema,
						this._.schema,
						this._.tableNamesMap,
						schema!.fullSchema[tableName] as MsSqlTable,
						columns,
						dialect,
						session,
					);
			}
		}

		this.$cache = { invalidate: async (_params: any) => {} };
	}

	/**
	 * Creates a subquery that defines a temporary named result set as a CTE.
	 *
	 * It is useful for breaking down complex queries into simpler parts and for reusing the result set in subsequent parts of the query.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/select#with-clause}
	 *
	 * @param alias The alias for the subquery.
	 *
	 * Failure to provide an alias will result in a DrizzleTypeError, preventing the subquery from being referenced in other queries.
	 *
	 * @example
	 *
	 * ```ts
	 * // Create a subquery with alias 'sq' and use it in the select query
	 * const sq = db.$with('sq').as(db.select().from(users).where(eq(users.id, 42)));
	 *
	 * const result = await db.with(sq).select().from(sq);
	 * ```
	 *
	 * To select arbitrary SQL values as fields in a CTE and reference them in other CTEs or in the main query, you need to add aliases to them:
	 *
	 * ```ts
	 * // Select an arbitrary SQL value as a field in a CTE and reference it in the main query
	 * const sq = db.$with('sq').as(db.select({
	 *   name: sql<string>`upper(${users.name})`.as('name'),
	 * })
	 * .from(users));
	 *
	 * const result = await db.with(sq).select({ name: sq.name }).from(sq);
	 * ```
	 */
	$with<TAlias extends string>(alias: TAlias) {
		const self = this;

		return {
			as<TSelection extends ColumnsSelection>(
				qb: TypedQueryBuilder<TSelection> | ((qb: QueryBuilder) => TypedQueryBuilder<TSelection>),
			): WithSubqueryWithSelection<TSelection, TAlias> {
				if (typeof qb === 'function') {
					qb = qb(new QueryBuilder(self.dialect));
				}

				return new Proxy(
					new WithSubquery(qb.getSQL(), qb.getSelectedFields() as SelectedFields, alias, true),
					new SelectionProxyHandler({ alias, sqlAliasedBehavior: 'alias', sqlBehavior: 'error' }),
				) as WithSubqueryWithSelection<TSelection, TAlias>;
			},
		};
	}

	$count(
		source: MsSqlTable | MsSqlViewBase | SQL | SQLWrapper,
		filters?: SQL<unknown>,
	) {
		return new MsSqlCountBuilder<TPreparedQueryHKT>({ source, filters, session: this.session, dialect: this.dialect });
	}

	$cache: { invalidate: Cache['onMutate'] };

	/**
	 * Incorporates a previously defined CTE (using `$with`) into the main query.
	 *
	 * This method allows the main query to reference a temporary named result set.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/select#with-clause}
	 *
	 * @param queries The CTEs to incorporate into the main query.
	 *
	 * @example
	 *
	 * ```ts
	 * // Define a subquery 'sq' as a CTE using $with
	 * const sq = db.$with('sq').as(db.select().from(users).where(eq(users.id, 42)));
	 *
	 * // Incorporate the CTE 'sq' into the main query and select from it
	 * const result = await db.with(sq).select().from(sq);
	 * ```
	 */
	with(...queries: WithSubquery[]) {
		const self = this;

		function select(): MsSqlSelectBuilder<undefined, TPreparedQueryHKT>;
		function select<TSelection extends SelectedFields>(
			fields: TSelection,
		): MsSqlSelectBuilder<TSelection, TPreparedQueryHKT>;
		function select(fields?: SelectedFields): MsSqlSelectBuilder<SelectedFields | undefined, TPreparedQueryHKT> {
			return new MsSqlSelectBuilder({
				fields: fields ?? undefined,
				session: self.session,
				dialect: self.dialect,
				withList: queries,
			});
		}

		function selectDistinct(): MsSqlSelectBuilder<undefined, TPreparedQueryHKT>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields: TSelection,
		): MsSqlSelectBuilder<TSelection, TPreparedQueryHKT>;
		function selectDistinct(
			fields?: SelectedFields,
		): MsSqlSelectBuilder<SelectedFields | undefined, TPreparedQueryHKT> {
			return new MsSqlSelectBuilder({
				fields: fields ?? undefined,
				session: self.session,
				dialect: self.dialect,
				withList: queries,
				distinct: true,
			});
		}

		return { select, selectDistinct };
	}

	/**
	 * Creates a select query.
	 *
	 * Calling this method with no arguments will select all columns from the table. Pass a selection object to specify the columns you want to select.
	 *
	 * Use `.from()` method to specify which table to select from.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/select}
	 *
	 * @param fields The selection object.
	 *
	 * @example
	 *
	 * ```ts
	 * // Select all columns and all rows from the 'cars' table
	 * const allCars: Car[] = await db.select().from(cars);
	 *
	 * // Select specific columns and all rows from the 'cars' table
	 * const carsIdsAndBrands: { id: number; brand: string }[] = await db.select({
	 *   id: cars.id,
	 *   brand: cars.brand
	 * })
	 *   .from(cars);
	 * ```
	 *
	 * Like in SQL, you can use arbitrary expressions as selection fields, not just table columns:
	 *
	 * ```ts
	 * // Select specific columns along with expression and all rows from the 'cars' table
	 * const carsIdsAndLowerNames: { id: number; lowerBrand: string }[] = await db.select({
	 *   id: cars.id,
	 *   lowerBrand: sql<string>`lower(${cars.brand})`,
	 * })
	 *   .from(cars);
	 * ```
	 */
	select(): MsSqlSelectBuilder<undefined, TPreparedQueryHKT>;
	select<TSelection extends SelectedFields>(fields: TSelection): MsSqlSelectBuilder<TSelection, TPreparedQueryHKT>;
	select(fields?: SelectedFields): MsSqlSelectBuilder<SelectedFields | undefined, TPreparedQueryHKT> {
		return new MsSqlSelectBuilder({ fields: fields ?? undefined, session: this.session, dialect: this.dialect });
	}

	/**
	 * Adds `distinct` expression to the select query.
	 *
	 * Calling this method will return only unique values. When multiple columns are selected, it returns rows with unique combinations of values in these columns.
	 *
	 * Use `.from()` method to specify which table to select from.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/select#distinct}
	 *
	 * @param fields The selection object.
	 *
	 * @example
	 * ```ts
	 * // Select all unique rows from the 'cars' table
	 * await db.selectDistinct()
	 *   .from(cars)
	 *   .orderBy(cars.id, cars.brand, cars.color);
	 *
	 * // Select all unique brands from the 'cars' table
	 * await db.selectDistinct({ brand: cars.brand })
	 *   .from(cars)
	 *   .orderBy(cars.brand);
	 * ```
	 */
	selectDistinct(): MsSqlSelectBuilder<undefined, TPreparedQueryHKT>;
	selectDistinct<TSelection extends SelectedFields>(
		fields: TSelection,
	): MsSqlSelectBuilder<TSelection, TPreparedQueryHKT>;
	selectDistinct(fields?: SelectedFields): MsSqlSelectBuilder<SelectedFields | undefined, TPreparedQueryHKT> {
		return new MsSqlSelectBuilder({
			fields: fields ?? undefined,
			session: this.session,
			dialect: this.dialect,
			distinct: true,
		});
	}

	/**
	 * Creates an update query.
	 *
	 * Calling this method without `.where()` clause will update all rows in a table. The `.where()` clause specifies which rows should be updated.
	 *
	 * Use `.set()` method to specify which values to update.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/update}
	 *
	 * @param table The table to update.
	 *
	 * @example
	 *
	 * ```ts
	 * // Update all rows in the 'cars' table
	 * await db.update(cars).set({ color: 'red' });
	 *
	 * // Update rows with filters and conditions
	 * await db.update(cars).set({ color: 'red' }).where(eq(cars.brand, 'BMW'));
	 * ```
	 */
	update<TTable extends MsSqlTable>(table: TTable): MsSqlUpdateBuilder<TTable, TQueryResult, TPreparedQueryHKT> {
		return new MsSqlUpdateBuilder(table, this.session, this.dialect);
	}

	/**
	 * Creates an insert query.
	 *
	 * Calling this method will create new rows in a table. Use `.values()` method to specify which values to insert.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/insert}
	 *
	 * @param table The table to insert into.
	 *
	 * @example
	 *
	 * ```ts
	 * // Insert one row
	 * await db.insert(cars).values({ brand: 'BMW' });
	 *
	 * // Insert multiple rows
	 * await db.insert(cars).values([{ brand: 'BMW' }, { brand: 'Porsche' }]);
	 * ```
	 */
	insert<TTable extends MsSqlTable>(table: TTable): MsSqlInsertBuilder<TTable, TQueryResult, TPreparedQueryHKT> {
		return new MsSqlInsertBuilder(table, this.session, this.dialect);
	}

	/**
	 * Creates a delete query.
	 *
	 * Calling this method without `.where()` clause will delete all rows in a table. The `.where()` clause specifies which rows should be deleted.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/delete}
	 *
	 * @param table The table to delete from.
	 *
	 * @example
	 *
	 * ```ts
	 * // Delete all rows in the 'cars' table
	 * await db.delete(cars);
	 *
	 * // Delete rows with filters and conditions
	 * await db.delete(cars).where(eq(cars.color, 'green'));
	 * ```
	 */
	delete<TTable extends MsSqlTable>(table: TTable): MsSqlDeleteBase<TTable, TQueryResult, TPreparedQueryHKT> {
		return new MsSqlDeleteBase(table, this.session, this.dialect);
	}

	execute<TRow extends { [column: string]: any } | { [column: string]: any }[] = { [column: string]: any }>(
		query: SQLWrapper | string,
	): MsSqlRaw<QueryResultKind<TQueryResult, TRow>> {
		const sequel = typeof query === 'string' ? sql.raw(query) : query.getSQL();
		const builtQuery = this.dialect.sqlToQuery(sequel);
		const prepared = this.session.prepareQuery<
			PreparedQueryConfig & { execute: QueryResultKind<TQueryResult, TRow> },
			TPreparedQueryHKT
		>(
			builtQuery,
			undefined,
		);
		return new MsSqlRaw(
			() => prepared.execute(),
			sequel,
			builtQuery,
			(result) => result,
		);
	}

	transaction<T>(
		transaction: (
			tx: MsSqlTransaction<TQueryResult, TPreparedQueryHKT, TFullSchema, TSchema, TRelations>,
			config?: MsSqlTransactionConfig,
		) => Promise<T>,
		config?: MsSqlTransactionConfig,
	): Promise<T> {
		return (this.session as MsSqlSession<TQueryResult, TPreparedQueryHKT, TFullSchema, TSchema, TRelations>)
			.transaction(transaction, config);
	}
}

export type MySQLWithReplicas<Q> = Q & { $primary: Q; $replicas: Q[] };

export const withReplicas = <
	HKT extends QueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TFullSchema extends Record<string, unknown>,
	TSchema extends V1.TablesRelationalConfig,
	TRelations extends AnyRelations,
	Q extends MsSqlDatabase<
		HKT,
		TPreparedQueryHKT,
		TFullSchema,
		TSchema extends Record<string, unknown> ? V1.ExtractTablesWithRelations<TFullSchema> : TSchema,
		TRelations
	>,
>(
	primary: Q,
	replicas: [Q, ...Q[]],
	getReplica: (replicas: Q[]) => Q = () => replicas[Math.floor(Math.random() * replicas.length)]!,
): MySQLWithReplicas<Q> => {
	const select: Q['select'] = (...args: []) => getReplica(replicas).select(...args);
	const selectDistinct: Q['selectDistinct'] = (...args: []) => getReplica(replicas).selectDistinct(...args);
	const $count: Q['$count'] = (...args: [any]) => getReplica(replicas).$count(...args);
	const $with: Q['with'] = (...args: []) => getReplica(replicas).with(...args);

	const update: Q['update'] = (...args: [any]) => primary.update(...args);
	const insert: Q['insert'] = (...args: [any]) => primary.insert(...args);
	const $delete: Q['delete'] = (...args: [any]) => primary.delete(...args);
	const execute: Q['execute'] = (...args: [any]) => primary.execute(...args);
	const transaction: Q['transaction'] = (...args: [any, any]) => primary.transaction(...args);

	return {
		...primary,
		update,
		insert,
		delete: $delete,
		execute,
		transaction,
		$primary: primary,
		$replicas: replicas,
		select,
		selectDistinct,
		$count,
		with: $with,
		get query() {
			return getReplica(replicas).query;
		},
		get _query() {
			return getReplica(replicas)._query;
		},
	};
};
