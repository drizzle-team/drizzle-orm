import type * as V1 from '~/_relations.ts';
import type { Cache } from '~/cache/core/cache.ts';
import { entityKind } from '~/entity.ts';
import type { PgAsyncSession, PgAsyncTransaction } from '~/pg-core/async/session.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgInsertBuilder, PgUpdateBuilder, QueryBuilder } from '~/pg-core/query-builders/index.ts';
import type { PgQueryResultHKT, PgQueryResultKind, PgTransactionConfig } from '~/pg-core/session.ts';
import type { PgTable } from '~/pg-core/table.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import { type ColumnsSelection, type SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import { WithSubquery } from '~/subquery.ts';
import type { DrizzleTypeError, NeonAuthToken } from '~/utils.ts';
import type { PgColumn } from '../columns/index.ts';
import { _RelationalQueryBuilder } from '../query-builders/_query.ts';
import { RelationalQueryBuilder } from '../query-builders/query.ts';
import type { SelectedFields } from '../query-builders/select.types.ts';
import type { PreparedQueryConfig } from '../session.ts';
import type { WithBuilder } from '../subquery.ts';
import type { PgViewBase } from '../view-base.ts';
import type { PgMaterializedView } from '../view.ts';
import { PgAsyncCountBuilder } from './count.ts';
import { PgAsyncDeleteBase } from './delete.ts';
import { PgAsyncInsertBase, type PgAsyncInsertHKT } from './insert.ts';
import { PgAsyncRelationalQuery, type PgAsyncRelationalQueryHKT } from './query.ts';
import { PgAsyncRaw } from './raw.ts';
import { PgAsyncRefreshMaterializedView } from './refresh-materialized-view.ts';
import { PgAsyncSelectBase, type PgAsyncSelectBuilder } from './select.ts';
import { PgAsyncUpdateBase, type PgAsyncUpdateHKT } from './update.ts';

export class PgAsyncDatabase<
	TQueryResult extends PgQueryResultHKT,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TSchema extends V1.TablesRelationalConfig = V1.ExtractTablesWithRelations<TFullSchema>,
> {
	static readonly [entityKind]: string = 'PgAsyncDatabase';

	declare readonly _: {
		readonly schema: TSchema | undefined;
		readonly fullSchema: TFullSchema;
		readonly tableNamesMap: Record<string, string>;
		readonly relations: TRelations;
		readonly session: PgAsyncSession<TQueryResult, TFullSchema, TRelations, TSchema>;
	};

	/** @deprecated */
	_query: TFullSchema extends Record<string, never>
		? DrizzleTypeError<'Seems like the schema generic is missing - did you forget to add it to your DB type?'>
		: {
			[K in keyof TSchema]: _RelationalQueryBuilder<TSchema, TSchema[K]>;
		};

	// TO-DO: Figure out how to pass DrizzleTypeError without breaking withReplicas
	query: {
		[K in keyof TRelations]: RelationalQueryBuilder<
			TRelations,
			TRelations[K],
			PgAsyncRelationalQueryHKT
		>;
	};

	constructor(
		/** @internal */
		readonly dialect: PgDialect,
		/** @internal */
		readonly session: PgAsyncSession<any, any, any, any>,
		relations: TRelations,
		schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		parseRqbJson: boolean = false,
	) {
		this._ = schema
			? {
				schema: schema.schema,
				fullSchema: schema.fullSchema as TFullSchema,
				tableNamesMap: schema.tableNamesMap,
				relations: relations,
				session,
			}
			: {
				schema: undefined,
				fullSchema: {} as TFullSchema,
				tableNamesMap: {},
				relations: relations,
				session,
			};
		this._query = {} as typeof this['_query'];
		if (this._.schema) {
			for (const [tableName, columns] of Object.entries(this._.schema)) {
				(this._query as PgAsyncDatabase<TQueryResult, Record<string, any>>['_query'])[tableName] =
					new _RelationalQueryBuilder(
						schema!.fullSchema,
						this._.schema,
						this._.tableNamesMap,
						schema!.fullSchema[tableName] as PgTable,
						columns,
						dialect,
						session,
					);
			}
		}
		this.query = {} as typeof this['query'];
		for (const [tableName, relation] of Object.entries(relations)) {
			(this.query as PgAsyncDatabase<
				TQueryResult,
				TSchema,
				AnyRelations,
				V1.TablesRelationalConfig
			>['query'])[tableName] = new RelationalQueryBuilder(
				relations,
				relations[relation.name]!.table as PgTable,
				relation,
				dialect,
				session,
				parseRqbJson,
				PgAsyncRelationalQuery,
			);
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
	$with: WithBuilder = (alias: string, selection?: ColumnsSelection) => {
		const self = this;
		const as = (
			qb:
				| TypedQueryBuilder<ColumnsSelection | undefined>
				| SQL
				| ((qb: QueryBuilder) => TypedQueryBuilder<ColumnsSelection | undefined> | SQL),
		) => {
			if (typeof qb === 'function') {
				qb = qb(new QueryBuilder(self.dialect));
			}

			return new Proxy(
				new WithSubquery(
					qb.getSQL(),
					selection ?? ('getSelectedFields' in qb ? qb.getSelectedFields() ?? {} : {}) as SelectedFields,
					alias,
					true,
				),
				new SelectionProxyHandler({ alias, sqlAliasedBehavior: 'alias', sqlBehavior: 'error' }),
			);
		};
		return { as };
	};

	$count(
		source: PgTable | PgViewBase | SQL | SQLWrapper,
		filters?: SQL<unknown>,
	) {
		return new PgAsyncCountBuilder({ source, filters, session: this.session, dialect: this.dialect });
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
		function select(): PgAsyncSelectBuilder<undefined>;
		function select<TSelection extends SelectedFields>(fields: TSelection): PgAsyncSelectBuilder<TSelection>;
		function select<TSelection extends SelectedFields>(
			fields?: TSelection,
		): PgAsyncSelectBuilder<TSelection | undefined> {
			return new PgAsyncSelectBase({
				fields: fields ?? undefined,
				session: self.session,
				dialect: self.dialect,
				withList: queries,
			});
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
		function selectDistinct(): PgAsyncSelectBuilder<undefined>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields: TSelection,
		): PgAsyncSelectBuilder<TSelection>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields?: TSelection,
		): PgAsyncSelectBuilder<TSelection | undefined> {
			return new PgAsyncSelectBase({
				fields: fields ?? undefined,
				session: self.session,
				dialect: self.dialect,
				withList: queries,
				distinct: true,
			});
		}

		/**
		 * Adds `distinct on` expression to the select query.
		 *
		 * Calling this method will specify how the unique rows are determined.
		 *
		 * Use `.from()` method to specify which table to select from.
		 *
		 * See docs: {@link https://orm.drizzle.team/docs/select#distinct}
		 *
		 * @param on The expression defining uniqueness.
		 * @param fields The selection object.
		 *
		 * @example
		 * ```ts
		 * // Select the first row for each unique brand from the 'cars' table
		 * await db.selectDistinctOn([cars.brand])
		 *   .from(cars)
		 *   .orderBy(cars.brand);
		 *
		 * // Selects the first occurrence of each unique car brand along with its color from the 'cars' table
		 * await db.selectDistinctOn([cars.brand], { brand: cars.brand, color: cars.color })
		 *   .from(cars)
		 *   .orderBy(cars.brand, cars.color);
		 * ```
		 */
		function selectDistinctOn(on: (PgColumn | SQLWrapper)[]): PgAsyncSelectBuilder<undefined>;
		function selectDistinctOn<TSelection extends SelectedFields>(
			on: (PgColumn | SQLWrapper)[],
			fields: TSelection,
		): PgAsyncSelectBuilder<TSelection>;
		function selectDistinctOn<TSelection extends SelectedFields>(
			on: (PgColumn | SQLWrapper)[],
			fields?: TSelection,
		): PgAsyncSelectBuilder<TSelection | undefined> {
			return new PgAsyncSelectBase({
				fields: fields ?? undefined,
				session: self.session,
				dialect: self.dialect,
				withList: queries,
				distinct: { on },
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
		 *
		 * // Update with returning clause
		 * const updatedCar: Car[] = await db.update(cars)
		 *   .set({ color: 'red' })
		 *   .where(eq(cars.id, 1))
		 *   .returning();
		 * ```
		 */
		function update<TTable extends PgTable>(table: TTable): PgUpdateBuilder<TTable, TQueryResult, PgAsyncUpdateHKT> {
			return new PgUpdateBuilder(table, self.session, self.dialect, queries, PgAsyncUpdateBase);
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
		 *
		 * // Insert with returning clause
		 * const insertedCar: Car[] = await db.insert(cars)
		 *   .values({ brand: 'BMW' })
		 *   .returning();
		 * ```
		 */
		function insert<TTable extends PgTable>(
			table: TTable,
		): PgInsertBuilder<TTable, TQueryResult, false, PgAsyncInsertHKT> {
			return new PgInsertBuilder(table, self.session, self.dialect, queries, undefined, PgAsyncInsertBase);
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
		 *
		 * // Delete with returning clause
		 * const deletedCar: Car[] = await db.delete(cars)
		 *   .where(eq(cars.id, 1))
		 *   .returning();
		 * ```
		 */
		function delete_<TTable extends PgTable>(table: TTable): PgAsyncDeleteBase<TTable, TQueryResult> {
			return new PgAsyncDeleteBase(table, self.session, self.dialect, queries);
		}

		return { select, selectDistinct, selectDistinctOn, update, insert, delete: delete_ };
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
	select(): PgAsyncSelectBuilder<undefined>;
	select<TSelection extends SelectedFields>(fields: TSelection): PgAsyncSelectBuilder<TSelection>;
	select<TSelection extends SelectedFields | undefined>(
		fields?: TSelection,
	): PgAsyncSelectBuilder<TSelection> {
		return new PgAsyncSelectBase({
			fields: fields ?? undefined,
			session: this.session,
			dialect: this.dialect,
		}) as PgAsyncSelectBuilder<TSelection>;
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
	selectDistinct(): PgAsyncSelectBuilder<undefined>;
	selectDistinct<TSelection extends SelectedFields>(fields: TSelection): PgAsyncSelectBuilder<TSelection>;
	selectDistinct<TSelection extends SelectedFields | undefined>(
		fields?: TSelection,
	): PgAsyncSelectBuilder<TSelection | undefined> {
		return new PgAsyncSelectBase({
			fields: fields ?? undefined,
			session: this.session,
			dialect: this.dialect,
			distinct: true,
		});
	}

	/**
	 * Adds `distinct on` expression to the select query.
	 *
	 * Calling this method will specify how the unique rows are determined.
	 *
	 * Use `.from()` method to specify which table to select from.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/select#distinct}
	 *
	 * @param on The expression defining uniqueness.
	 * @param fields The selection object.
	 *
	 * @example
	 * ```ts
	 * // Select the first row for each unique brand from the 'cars' table
	 * await db.selectDistinctOn([cars.brand])
	 *   .from(cars)
	 *   .orderBy(cars.brand);
	 *
	 * // Selects the first occurrence of each unique car brand along with its color from the 'cars' table
	 * await db.selectDistinctOn([cars.brand], { brand: cars.brand, color: cars.color })
	 *   .from(cars)
	 *   .orderBy(cars.brand, cars.color);
	 * ```
	 */
	selectDistinctOn(on: (PgColumn | SQLWrapper)[]): PgAsyncSelectBuilder<undefined>;
	selectDistinctOn<TSelection extends SelectedFields>(
		on: (PgColumn | SQLWrapper)[],
		fields: TSelection,
	): PgAsyncSelectBuilder<TSelection>;
	selectDistinctOn<TSelection extends SelectedFields | undefined>(
		on: (PgColumn | SQLWrapper)[],
		fields?: TSelection,
	): PgAsyncSelectBuilder<TSelection> {
		return new PgAsyncSelectBase({
			fields: fields ?? undefined,
			session: this.session,
			dialect: this.dialect,
			distinct: { on },
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
	 *
	 * // Update with returning clause
	 * const updatedCar: Car[] = await db.update(cars)
	 *   .set({ color: 'red' })
	 *   .where(eq(cars.id, 1))
	 *   .returning();
	 * ```
	 */
	update<TTable extends PgTable>(table: TTable): PgUpdateBuilder<TTable, TQueryResult, PgAsyncUpdateHKT> {
		return new PgUpdateBuilder(table, this.session, this.dialect, undefined, PgAsyncUpdateBase);
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
	 *
	 * // Insert with returning clause
	 * const insertedCar: Car[] = await db.insert(cars)
	 *   .values({ brand: 'BMW' })
	 *   .returning();
	 * ```
	 */
	insert<TTable extends PgTable>(table: TTable): PgInsertBuilder<TTable, TQueryResult, false, PgAsyncInsertHKT> {
		return new PgInsertBuilder(table, this.session, this.dialect, undefined, undefined, PgAsyncInsertBase);
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
	 *
	 * // Delete with returning clause
	 * const deletedCar: Car[] = await db.delete(cars)
	 *   .where(eq(cars.id, 1))
	 *   .returning();
	 * ```
	 */
	delete<TTable extends PgTable>(table: TTable): PgAsyncDeleteBase<TTable, TQueryResult> {
		return new PgAsyncDeleteBase(table, this.session, this.dialect);
	}

	refreshMaterializedView<TView extends PgMaterializedView>(view: TView): PgAsyncRefreshMaterializedView<TQueryResult> {
		return new PgAsyncRefreshMaterializedView(view, this.session, this.dialect);
	}

	execute<TRow extends Record<string, unknown> = Record<string, unknown>>(
		query: SQLWrapper | string,
	): PgAsyncRaw<PgQueryResultKind<TQueryResult, TRow>>;
	/** @internal */
	execute<TRow extends Record<string, unknown> = Record<string, unknown>>(
		query: SQLWrapper | string,
		authToken: NeonAuthToken,
	): PgAsyncRaw<PgQueryResultKind<TQueryResult, TRow>>;
	/** @internal */
	execute<TRow extends Record<string, unknown> = Record<string, unknown>>(
		query: SQLWrapper | string,
		authToken?: NeonAuthToken,
	): PgAsyncRaw<PgQueryResultKind<TQueryResult, TRow>> {
		const sequel = typeof query === 'string' ? sql.raw(query) : query.getSQL();
		const builtQuery = this.dialect.sqlToQuery(sequel);
		const prepared = this.session.prepareQuery<
			PreparedQueryConfig & { execute: PgQueryResultKind<TQueryResult, TRow> }
		>(
			builtQuery,
			undefined,
			undefined,
			false,
		).setToken(authToken);
		return new PgAsyncRaw(
			() => prepared.execute(),
			sequel,
			builtQuery,
			(result) => prepared.mapResult(result, true),
		);
	}

	transaction<T>(
		transaction: (tx: PgAsyncTransaction<TQueryResult, TFullSchema, TRelations, TSchema>) => Promise<T>,
		config?: PgTransactionConfig,
	): Promise<T> {
		return this.session.transaction(
			transaction,
			config,
		);
	}
}

export type PgAsyncWithReplicas<Q> = Q & { $primary: Q; $replicas: Q[] };

export const withReplicas = <
	HKT extends PgQueryResultHKT,
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
	Q extends PgAsyncDatabase<
		HKT,
		TFullSchema,
		TRelations,
		TSchema extends Record<string, unknown> ? V1.ExtractTablesWithRelations<TFullSchema> : TSchema
	>,
>(
	primary: Q,
	replicas: [Q, ...Q[]],
	getReplica: (replicas: Q[]) => Q = () => replicas[Math.floor(Math.random() * replicas.length)]!,
): PgAsyncWithReplicas<Q> => {
	const select: Q['select'] = (...args: []) => getReplica(replicas).select(...args);
	const selectDistinct: Q['selectDistinct'] = (...args: []) => getReplica(replicas).selectDistinct(...args);
	const selectDistinctOn: Q['selectDistinctOn'] = (...args: [any]) => getReplica(replicas).selectDistinctOn(...args);
	const $count: Q['$count'] = (...args: [any]) => getReplica(replicas).$count(...args);
	const _with: Q['with'] = (...args: any) => getReplica(replicas).with(...args);
	const $with: Q['$with'] = (arg: any) => getReplica(replicas).$with(arg) as any;

	const update: Q['update'] = (...args: [any]) => primary.update(...args);
	const insert: Q['insert'] = (...args: [any]) => primary.insert(...args);
	const $delete: Q['delete'] = (...args: [any]) => primary.delete(...args);
	const execute: Q['execute'] = (...args: [any]) => primary.execute(...args);
	const transaction: Q['transaction'] = (...args: [any]) => primary.transaction(...args);
	const refreshMaterializedView: Q['refreshMaterializedView'] = (...args: [any]) =>
		primary.refreshMaterializedView(...args);

	return {
		...primary,
		update,
		insert,
		delete: $delete,
		execute,
		transaction,
		refreshMaterializedView,
		$primary: primary,
		$replicas: replicas,
		select,
		selectDistinct,
		selectDistinctOn,
		$count,
		$with,
		with: _with,
		get _query() {
			return getReplica(replicas)._query;
		},
		get query() {
			return getReplica(replicas).query;
		},
	};
};
