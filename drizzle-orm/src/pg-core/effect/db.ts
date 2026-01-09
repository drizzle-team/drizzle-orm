import { Effect } from 'effect';
import type * as V1 from '~/_relations.ts';
import type { EffectCache } from '~/cache/core/cache-effect.ts';
import type { MutationOption } from '~/cache/core/cache.ts';
import type { TaggedDrizzleQueryError, TaggedTransactionRollbackError } from '~/effect-core/errors.ts';
import { entityKind } from '~/entity.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgEffectCountBuilder } from '~/pg-core/effect/count.ts';
import { PgEffectInsertBase, type PgEffectInsertHKT } from '~/pg-core/effect/insert.ts';
import { PgEffectSelectBase, type PgEffectSelectBuilder } from '~/pg-core/effect/select.ts';
import type { _RelationalQueryBuilder } from '~/pg-core/query-builders/_query.ts';
import { PgInsertBuilder } from '~/pg-core/query-builders/insert.ts';
import { RelationalQueryBuilder } from '~/pg-core/query-builders/query.ts';
import type { PgTable } from '~/pg-core/table.ts';
import type { PgViewBase } from '~/pg-core/view-base.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import { type ColumnsSelection, type SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import { WithSubquery } from '~/subquery.ts';
import type { PgColumn } from '../columns/common.ts';
import { QueryBuilder } from '../query-builders/query-builder.ts';
import type { SelectedFields } from '../query-builders/select.types.ts';
import { PgUpdateBuilder } from '../query-builders/update.ts';
import type { PgQueryResultHKT, PgQueryResultKind, PreparedQueryConfig } from '../session.ts';
import type { WithBuilder } from '../subquery.ts';
import type { PgMaterializedView } from '../view.ts';
import { PgEffectDeleteBase } from './delete.ts';
import { PgEffectRelationalQuery, type PgEffectRelationalQueryHKT } from './query.ts';
import { PgEffectRaw } from './raw.ts';
import { PgEffectRefreshMaterializedView } from './refresh-materialized-view.ts';
import type { PgEffectSession, PgEffectTransaction } from './session.ts';
import { PgEffectUpdateBase, type PgEffectUpdateHKT } from './update.ts';

export class PgEffectDatabase<
	TQueryResult extends PgQueryResultHKT,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TSchema extends V1.TablesRelationalConfig = V1.ExtractTablesWithRelations<TFullSchema>,
> {
	static readonly [entityKind]: string = 'EffectPgDatabase';

	declare readonly _: {
		readonly schema: TSchema | undefined;
		readonly fullSchema: TFullSchema;
		readonly tableNamesMap: Record<string, string>;
		readonly relations: TRelations;
		readonly session: PgEffectSession<TQueryResult, TFullSchema, TRelations, TSchema>;
	};

	// TO-DO: Figure out how to pass DrizzleTypeError without breaking withReplicas
	query: {
		[K in keyof TRelations]: RelationalQueryBuilder<
			TRelations,
			TRelations[K],
			PgEffectRelationalQueryHKT
		>;
	};

	constructor(
		/** @internal */
		readonly dialect: PgDialect,
		/** @internal */
		readonly session: PgEffectSession<any, any, any, any>,
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

		this.query = {} as typeof this['query'];
		for (const [tableName, relation] of Object.entries(relations)) {
			(this.query as PgEffectDatabase<
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
				PgEffectRelationalQuery,
			);
		}

		this.$cache = {
			invalidate: (_params: MutationOption) => Effect.async(() => {}),
		};
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
	 * const result = yield* db.with(sq).select().from(sq);
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
	 * const result = yield* db.with(sq).select({ name: sq.name }).from(sq);
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

	$cache: { invalidate: EffectCache['onMutate'] };

	$count(
		source: PgTable | PgViewBase | SQL | SQLWrapper,
		filters?: SQL<unknown>,
	) {
		return new PgEffectCountBuilder({ source, filters, session: this.session, dialect: this.dialect });
	}

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
	 * const result = yield* db.with(sq).select().from(sq);
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
		 * const allCars: Car[] = yield* db.select().from(cars);
		 *
		 * // Select specific columns and all rows from the 'cars' table
		 * const carsIdsAndBrands: { id: number; brand: string }[] = yield* db.select({
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
		 * const carsIdsAndLowerNames: { id: number; lowerBrand: string }[] = yield* db.select({
		 *   id: cars.id,
		 *   lowerBrand: sql<string>`lower(${cars.brand})`,
		 * })
		 *   .from(cars);
		 * ```
		 */
		function select(): PgEffectSelectBuilder<undefined>;
		function select<TSelection extends SelectedFields>(fields: TSelection): PgEffectSelectBuilder<TSelection>;
		function select<TSelection extends SelectedFields>(
			fields?: TSelection,
		): PgEffectSelectBuilder<TSelection | undefined> {
			return new PgEffectSelectBase({
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
		 * yield* db.selectDistinct()
		 *   .from(cars)
		 *   .orderBy(cars.id, cars.brand, cars.color);
		 *
		 * // Select all unique brands from the 'cars' table
		 * yield* db.selectDistinct({ brand: cars.brand })
		 *   .from(cars)
		 *   .orderBy(cars.brand);
		 * ```
		 */
		function selectDistinct(): PgEffectSelectBuilder<undefined>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields: TSelection,
		): PgEffectSelectBuilder<TSelection>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields?: TSelection,
		): PgEffectSelectBuilder<TSelection | undefined> {
			return new PgEffectSelectBase({
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
		 * yield* db.selectDistinctOn([cars.brand])
		 *   .from(cars)
		 *   .orderBy(cars.brand);
		 *
		 * // Selects the first occurrence of each unique car brand along with its color from the 'cars' table
		 * yield* db.selectDistinctOn([cars.brand], { brand: cars.brand, color: cars.color })
		 *   .from(cars)
		 *   .orderBy(cars.brand, cars.color);
		 * ```
		 */
		function selectDistinctOn(on: (PgColumn | SQLWrapper)[]): PgEffectSelectBuilder<undefined>;
		function selectDistinctOn<TSelection extends SelectedFields>(
			on: (PgColumn | SQLWrapper)[],
			fields: TSelection,
		): PgEffectSelectBuilder<TSelection>;
		function selectDistinctOn<TSelection extends SelectedFields>(
			on: (PgColumn | SQLWrapper)[],
			fields?: TSelection,
		): PgEffectSelectBuilder<TSelection | undefined> {
			return new PgEffectSelectBase({
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
		 * yield* db.update(cars).set({ color: 'red' });
		 *
		 * // Update rows with filters and conditions
		 * yield* db.update(cars).set({ color: 'red' }).where(eq(cars.brand, 'BMW'));
		 *
		 * // Update with returning clause
		 * const updatedCar: Car[] = yield* db.update(cars)
		 *   .set({ color: 'red' })
		 *   .where(eq(cars.id, 1))
		 *   .returning();
		 * ```
		 */
		function update<TTable extends PgTable>(table: TTable): PgUpdateBuilder<TTable, TQueryResult, PgEffectUpdateHKT> {
			return new PgUpdateBuilder(table, self.session, self.dialect, queries, PgEffectUpdateBase);
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
		 * yield* db.insert(cars).values({ brand: 'BMW' });
		 *
		 * // Insert multiple rows
		 * yield* db.insert(cars).values([{ brand: 'BMW' }, { brand: 'Porsche' }]);
		 *
		 * // Insert with returning clause
		 * const insertedCar: Car[] = yield* db.insert(cars)
		 *   .values({ brand: 'BMW' })
		 *   .returning();
		 * ```
		 */
		function insert<TTable extends PgTable>(
			table: TTable,
		): PgInsertBuilder<TTable, TQueryResult, false, PgEffectInsertHKT> {
			return new PgInsertBuilder(table, self.session, self.dialect, queries, undefined, PgEffectInsertBase);
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
		 * yield* db.delete(cars);
		 *
		 * // Delete rows with filters and conditions
		 * yield* db.delete(cars).where(eq(cars.color, 'green'));
		 *
		 * // Delete with returning clause
		 * const deletedCar: Car[] = yield* db.delete(cars)
		 *   .where(eq(cars.id, 1))
		 *   .returning();
		 * ```
		 */
		function delete_<TTable extends PgTable>(table: TTable): PgEffectDeleteBase<TTable, TQueryResult> {
			return new PgEffectDeleteBase(table, self.session, self.dialect, queries);
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
	 * const allCars: Car[] = yield* db.select().from(cars);
	 *
	 * // Select specific columns and all rows from the 'cars' table
	 * const carsIdsAndBrands: { id: number; brand: string }[] = yield* db.select({
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
	 * const carsIdsAndLowerNames: { id: number; lowerBrand: string }[] = yield* db.select({
	 *   id: cars.id,
	 *   lowerBrand: sql<string>`lower(${cars.brand})`,
	 * })
	 *   .from(cars);
	 * ```
	 */
	select(): PgEffectSelectBuilder<undefined>;
	select<TSelection extends SelectedFields>(fields: TSelection): PgEffectSelectBuilder<TSelection>;
	select<TSelection extends SelectedFields | undefined>(
		fields?: TSelection,
	): PgEffectSelectBuilder<TSelection> {
		return new PgEffectSelectBase({
			fields: fields ?? undefined,
			session: this.session,
			dialect: this.dialect,
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
	 * yield* db.selectDistinct()
	 *   .from(cars)
	 *   .orderBy(cars.id, cars.brand, cars.color);
	 *
	 * // Select all unique brands from the 'cars' table
	 * yield* db.selectDistinct({ brand: cars.brand })
	 *   .from(cars)
	 *   .orderBy(cars.brand);
	 * ```
	 */
	selectDistinct(): PgEffectSelectBuilder<undefined>;
	selectDistinct<TSelection extends SelectedFields>(fields: TSelection): PgEffectSelectBuilder<TSelection>;
	selectDistinct<TSelection extends SelectedFields | undefined>(
		fields?: TSelection,
	): PgEffectSelectBuilder<TSelection | undefined> {
		return new PgEffectSelectBase({
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
	 * yield* db.selectDistinctOn([cars.brand])
	 *   .from(cars)
	 *   .orderBy(cars.brand);
	 *
	 * // Selects the first occurrence of each unique car brand along with its color from the 'cars' table
	 * yield* db.selectDistinctOn([cars.brand], { brand: cars.brand, color: cars.color })
	 *   .from(cars)
	 *   .orderBy(cars.brand, cars.color);
	 * ```
	 */
	selectDistinctOn(on: (PgColumn | SQLWrapper)[]): PgEffectSelectBuilder<undefined>;
	selectDistinctOn<TSelection extends SelectedFields>(
		on: (PgColumn | SQLWrapper)[],
		fields: TSelection,
	): PgEffectSelectBuilder<TSelection>;
	selectDistinctOn<TSelection extends SelectedFields | undefined>(
		on: (PgColumn | SQLWrapper)[],
		fields?: TSelection,
	): PgEffectSelectBuilder<TSelection> {
		return new PgEffectSelectBase({
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
	 * yield* db.update(cars).set({ color: 'red' });
	 *
	 * // Update rows with filters and conditions
	 * yield* db.update(cars).set({ color: 'red' }).where(eq(cars.brand, 'BMW'));
	 *
	 * // Update with returning clause
	 * const updatedCar: Car[] = yield* db.update(cars)
	 *   .set({ color: 'red' })
	 *   .where(eq(cars.id, 1))
	 *   .returning();
	 * ```
	 */
	update<TTable extends PgTable>(table: TTable): PgUpdateBuilder<TTable, TQueryResult, PgEffectUpdateHKT> {
		return new PgUpdateBuilder(table, this.session, this.dialect, undefined, PgEffectUpdateBase);
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
	 * yield* db.insert(cars).values({ brand: 'BMW' });
	 *
	 * // Insert multiple rows
	 * yield* db.insert(cars).values([{ brand: 'BMW' }, { brand: 'Porsche' }]);
	 *
	 * // Insert with returning clause
	 * const insertedCar: Car[] = yield* db.insert(cars)
	 *   .values({ brand: 'BMW' })
	 *   .returning();
	 * ```
	 */
	insert<TTable extends PgTable>(table: TTable): PgInsertBuilder<TTable, TQueryResult, false, PgEffectInsertHKT> {
		return new PgInsertBuilder(table, this.session, this.dialect, undefined, undefined, PgEffectInsertBase);
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
	 * yield* db.delete(cars);
	 *
	 * // Delete rows with filters and conditions
	 * yield* db.delete(cars).where(eq(cars.color, 'green'));
	 *
	 * // Delete with returning clause
	 * const deletedCar: Car[] = yield* db.delete(cars)
	 *   .where(eq(cars.id, 1))
	 *   .returning();
	 * ```
	 */
	delete<TTable extends PgTable>(table: TTable): PgEffectDeleteBase<TTable, TQueryResult> {
		return new PgEffectDeleteBase(table, this.session, this.dialect);
	}

	refreshMaterializedView<TView extends PgMaterializedView>(
		view: TView,
	): PgEffectRefreshMaterializedView<TQueryResult> {
		return new PgEffectRefreshMaterializedView(view, this.session, this.dialect);
	}

	execute<TRow extends Record<string, unknown> = Record<string, unknown>>(
		query: SQLWrapper | string,
	): PgEffectRaw<PgQueryResultKind<TQueryResult, TRow>> {
		const sequel = typeof query === 'string' ? sql.raw(query) : query.getSQL();
		const builtQuery = this.dialect.sqlToQuery(sequel);
		const prepared = this.session.prepareQuery<
			PreparedQueryConfig & { execute: PgQueryResultKind<TQueryResult, TRow> }
		>(
			builtQuery,
			undefined,
			undefined,
			false,
		);
		return new PgEffectRaw(
			() => prepared.execute(),
			sequel,
			builtQuery,
			(result) => prepared.mapResult(result, true),
		);
	}

	transaction<T>(
		transaction: (
			tx: PgEffectTransaction<TQueryResult, TFullSchema, TRelations, TSchema>,
		) => Effect.Effect<T, TaggedDrizzleQueryError | TaggedTransactionRollbackError>,
	): Effect.Effect<T, TaggedDrizzleQueryError | TaggedTransactionRollbackError> {
		return this.session.transaction(
			transaction,
		);
	}
}

export type PgEffectWithReplicas<Q> = Q & { $primary: Q; $replicas: Q[] };

export const withReplicas = <
	HKT extends PgQueryResultHKT,
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
	Q extends PgEffectDatabase<
		HKT,
		TFullSchema,
		TRelations,
		TSchema extends Record<string, unknown> ? V1.ExtractTablesWithRelations<TFullSchema> : TSchema
	>,
>(
	primary: Q,
	replicas: [Q, ...Q[]],
	getReplica: (replicas: Q[]) => Q = () => replicas[Math.floor(Math.random() * replicas.length)]!,
): PgEffectWithReplicas<Q> => {
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
	// const transaction: Q['transaction'] = (...args: [any]) => primary.transaction(...args);
	const refreshMaterializedView: Q['refreshMaterializedView'] = (...args: [any]) =>
		primary.refreshMaterializedView(...args);

	return {
		...primary,
		update,
		insert,
		delete: $delete,
		execute,
		// transaction,
		refreshMaterializedView,
		$primary: primary,
		$replicas: replicas,
		select,
		selectDistinct,
		selectDistinctOn,
		$count,
		$with,
		with: _with,
		get query() {
			return getReplica(replicas).query;
		},
	};
};
