import { Effect } from 'effect';
import type { SqlError } from 'effect/unstable/sql/SqlError';
import type { EffectCacheShape } from '~/cache/core/cache-effect.ts';
import type { MutationOption } from '~/cache/core/cache.ts';
import type { QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import { type ColumnsSelection, type SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import type { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import { SQLiteEffectCountBuilder } from '~/sqlite-core/effect/count.ts';
import { SQLiteEffectDeleteBase } from '~/sqlite-core/effect/delete.ts';
import { SQLiteEffectInsertBase, type SQLiteEffectInsertBuilder } from '~/sqlite-core/effect/insert.ts';
import { SQLiteEffectRelationalQuery, type SQLiteEffectRelationalQueryHKT } from '~/sqlite-core/effect/query.ts';
import { SQLiteEffectRaw } from '~/sqlite-core/effect/raw.ts';
import { SQLiteEffectSelectBase, type SQLiteEffectSelectBuilder } from '~/sqlite-core/effect/select.ts';
import { SQLiteEffectUpdateBase, type SQLiteEffectUpdateBuilder } from '~/sqlite-core/effect/update.ts';
import { SQLiteInsertBuilder } from '~/sqlite-core/query-builders/insert.ts';
import { RelationalQueryBuilder } from '~/sqlite-core/query-builders/query.ts';
import { SQLiteSelectBuilder } from '~/sqlite-core/query-builders/select.ts';
import { SQLiteUpdateBuilder } from '~/sqlite-core/query-builders/update.ts';
import type { SQLiteTable } from '~/sqlite-core/table.ts';
import { WithSubquery } from '~/subquery.ts';
import { QueryBuilder } from '../query-builders/query-builder.ts';
import type { SelectedFields } from '../query-builders/select.types.ts';
import type { PreparedQueryConfig, SQLiteTransactionConfig } from '../session.ts';
import type { WithBuilder } from '../subquery.ts';
import type { SQLiteViewBase } from '../view-base.ts';
import type { SQLiteEffectSession, SQLiteEffectTransaction } from './session.ts';

export class SQLiteEffectDatabase<
	TEffectHKT extends QueryEffectHKTBase,
	TRunResult,
	TRelations extends AnyRelations = EmptyRelations,
> {
	static readonly [entityKind]: string = 'SQLiteEffectDatabase';

	declare readonly _: {
		readonly relations: TRelations;
		readonly session: SQLiteEffectSession<TRunResult, TEffectHKT, TRelations>;
	};

	// TO-DO: Figure out how to pass DrizzleTypeError without breaking withReplicas
	query: {
		[K in keyof TRelations]: RelationalQueryBuilder<
			unknown,
			TRelations,
			TRelations[K],
			SQLiteEffectRelationalQueryHKT<TEffectHKT>
		>;
	};

	constructor(
		/** @internal */
		readonly dialect: SQLiteDialect,
		/** @internal */
		readonly session: SQLiteEffectSession<TRunResult, TEffectHKT, TRelations>,
		relations: TRelations,
		readonly forbidJsonb?: boolean,
	) {
		this._ = {
			relations,
			session,
		};
		this.query = {} as typeof this['query'];
		for (const [tableName, relation] of Object.entries(relations)) {
			(this.query as SQLiteEffectDatabase<
				TEffectHKT,
				TRunResult,
				AnyRelations
			>['query'])[tableName] = new RelationalQueryBuilder(
				undefined,
				relations,
				relations[relation.name]!.table as SQLiteTable,
				relation,
				dialect,
				session,
				forbidJsonb,
				SQLiteEffectRelationalQuery,
			);
		}
		this.$cache = { invalidate: (_params: MutationOption) => Effect.void };
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

	$count(
		source: SQLiteTable | SQLiteViewBase | SQL | SQLWrapper,
		filters?: SQL<unknown>,
	): SQLiteEffectCountBuilder<TEffectHKT> {
		return new SQLiteEffectCountBuilder({
			source,
			filters,
			session: this.session,
			dialect: this.dialect,
		});
	}

	$cache: { invalidate: EffectCacheShape['onMutate'] };

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
		function select(): SQLiteEffectSelectBuilder<undefined, TRunResult, TEffectHKT>;
		function select<TSelection extends SelectedFields>(
			fields: TSelection,
		): SQLiteEffectSelectBuilder<TSelection, TRunResult, TEffectHKT>;
		function select(
			fields?: SelectedFields,
		): SQLiteEffectSelectBuilder<SelectedFields | undefined, TRunResult, TEffectHKT> {
			return new SQLiteSelectBuilder({
				fields: fields ?? undefined,
				session: self.session,
				dialect: self.dialect,
				withList: queries,
			}, SQLiteEffectSelectBase);
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
		 *
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
		function selectDistinct(): SQLiteEffectSelectBuilder<undefined, TRunResult, TEffectHKT>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields: TSelection,
		): SQLiteEffectSelectBuilder<TSelection, TRunResult, TEffectHKT>;
		function selectDistinct(
			fields?: SelectedFields,
		): SQLiteEffectSelectBuilder<SelectedFields | undefined, TRunResult, TEffectHKT> {
			return new SQLiteSelectBuilder({
				fields: fields ?? undefined,
				session: self.session,
				dialect: self.dialect,
				withList: queries,
				distinct: true,
			}, SQLiteEffectSelectBase);
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
		function update<TTable extends SQLiteTable>(
			table: TTable,
		): SQLiteEffectUpdateBuilder<TTable, TRunResult, TEffectHKT> {
			return new SQLiteUpdateBuilder(table, self.session, self.dialect, queries, SQLiteEffectUpdateBase);
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
		function insert<TTable extends SQLiteTable>(
			into: TTable,
		): SQLiteEffectInsertBuilder<TTable, TRunResult, TEffectHKT> {
			return new SQLiteInsertBuilder(into, self.session, self.dialect, queries, SQLiteEffectInsertBase);
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
		function delete_<TTable extends SQLiteTable>(
			from: TTable,
		): SQLiteEffectDeleteBase<TTable, TRunResult, undefined, false, never, TEffectHKT> {
			return new SQLiteEffectDeleteBase(from, self.session, self.dialect, queries);
		}

		return { select, selectDistinct, update, insert, delete: delete_ };
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
	select(): SQLiteEffectSelectBuilder<undefined, TRunResult, TEffectHKT>;
	select<TSelection extends SelectedFields>(
		fields: TSelection,
	): SQLiteEffectSelectBuilder<TSelection, TRunResult, TEffectHKT>;
	select(fields?: SelectedFields): SQLiteEffectSelectBuilder<SelectedFields | undefined, TRunResult, TEffectHKT> {
		return new SQLiteSelectBuilder(
			{ fields: fields ?? undefined, session: this.session, dialect: this.dialect },
			SQLiteEffectSelectBase,
		);
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
	 *
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
	selectDistinct(): SQLiteEffectSelectBuilder<undefined, TRunResult, TEffectHKT>;
	selectDistinct<TSelection extends SelectedFields>(
		fields: TSelection,
	): SQLiteEffectSelectBuilder<TSelection, TRunResult, TEffectHKT>;
	selectDistinct(
		fields?: SelectedFields,
	): SQLiteEffectSelectBuilder<SelectedFields | undefined, TRunResult, TEffectHKT> {
		return new SQLiteSelectBuilder({
			fields: fields ?? undefined,
			session: this.session,
			dialect: this.dialect,
			distinct: true,
		}, SQLiteEffectSelectBase);
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
	update<TTable extends SQLiteTable>(
		table: TTable,
	): SQLiteEffectUpdateBuilder<TTable, TRunResult, TEffectHKT> {
		return new SQLiteUpdateBuilder(table, this.session, this.dialect, undefined, SQLiteEffectUpdateBase);
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
	insert<TTable extends SQLiteTable>(
		into: TTable,
	): SQLiteEffectInsertBuilder<TTable, TRunResult, TEffectHKT> {
		return new SQLiteInsertBuilder(into, this.session, this.dialect, undefined, SQLiteEffectInsertBase);
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
	delete<TTable extends SQLiteTable>(
		from: TTable,
	): SQLiteEffectDeleteBase<TTable, TRunResult, undefined, false, never, TEffectHKT> {
		return new SQLiteEffectDeleteBase(from, this.session, this.dialect);
	}

	run(query: SQLWrapper | string): SQLiteEffectRaw<TRunResult, TEffectHKT> {
		const sequel = typeof query === 'string' ? sql.raw(query) : query.getSQL();
		const builtQuery = this.dialect.sqlToQuery(sequel);
		const prepared = this.session.prepareQuery<PreparedQueryConfig & { execute: TRunResult }>(
			builtQuery,
			'raw',
			false,
			'run',
		);
		return new SQLiteEffectRaw(prepared, sequel, builtQuery);
	}

	all<T = unknown>(query: SQLWrapper | string): SQLiteEffectRaw<T[], TEffectHKT> {
		const sequel = typeof query === 'string' ? sql.raw(query) : query.getSQL();
		const builtQuery = this.dialect.sqlToQuery(sequel);
		const prepared = this.session.prepareQuery<PreparedQueryConfig & { execute: T[] }>(
			builtQuery,
			'objects',
			false,
			'all',
		);
		return new SQLiteEffectRaw(prepared, sequel, builtQuery);
	}

	get<T = unknown>(query: SQLWrapper | string): SQLiteEffectRaw<T, TEffectHKT> {
		const sequel = typeof query === 'string' ? sql.raw(query) : query.getSQL();
		const builtQuery = this.dialect.sqlToQuery(sequel);
		const prepared = this.session.prepareQuery<PreparedQueryConfig & { execute: T }>(
			builtQuery,
			'objects',
			false,
			'get',
		);
		return new SQLiteEffectRaw(prepared, sequel, builtQuery);
	}

	values<T extends unknown[] = unknown[]>(query: SQLWrapper | string): SQLiteEffectRaw<T[], TEffectHKT> {
		const sequel = typeof query === 'string' ? sql.raw(query) : query.getSQL();
		const builtQuery = this.dialect.sqlToQuery(sequel);
		const prepared = this.session.prepareQuery<PreparedQueryConfig & { execute: T[] }>(
			builtQuery,
			'objects',
			false,
			'values',
		);
		return new SQLiteEffectRaw(prepared, sequel, builtQuery);
	}

	transaction<A, E, R>(
		transaction: (
			tx: SQLiteEffectTransaction<TEffectHKT, TRunResult, TRelations>,
		) => Effect.Effect<A, E, R>,
		config?: SQLiteTransactionConfig,
	): Effect.Effect<A, E | SqlError, R> {
		return this.session.transaction(transaction, config);
	}
}

export type SQLiteEffectWithReplicas<Q> = Q & { $primary: Q; $replicas: Q[] };

export const withReplicas = <
	TEffectHKT extends QueryEffectHKTBase,
	TRunResult,
	TRelations extends AnyRelations,
	Q extends SQLiteEffectDatabase<TEffectHKT, TRunResult, TRelations>,
>(
	primary: Q,
	replicas: [Q, ...Q[]],
	getReplica: (replicas: Q[]) => Q = () => replicas[Math.floor(Math.random() * replicas.length)]!,
): SQLiteEffectWithReplicas<Q> => {
	const select: Q['select'] = (...args: []) => getReplica(replicas).select(...args);
	const selectDistinct: Q['selectDistinct'] = (...args: []) => getReplica(replicas).selectDistinct(...args);
	const $count: Q['$count'] = (...args: [any]) => getReplica(replicas).$count(...args);
	const $with: Q['with'] = (...args: []) => getReplica(replicas).with(...args);

	const update: Q['update'] = (...args: [any]) => primary.update(...args);
	const insert: Q['insert'] = (...args: [any]) => primary.insert(...args);
	const $delete: Q['delete'] = (...args: [any]) => primary.delete(...args);
	const run: Q['run'] = (...args: [any]) => primary.run(...args);
	const all: Q['all'] = (...args: [any]) => primary.all(...args);
	const get: Q['get'] = (...args: [any]) => primary.get(...args);
	const values: Q['values'] = (...args: [any]) => primary.values(...args);
	const transaction: Q['transaction'] = (...args: [any]) => primary.transaction(...args);

	return {
		...primary,
		update,
		insert,
		delete: $delete,
		run,
		all,
		get,
		values,
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
	};
};
