import type { Cache } from '~/cache/core/cache.ts';
import { entityKind } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import { type ColumnsSelection, type SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import { SQLiteAsyncDeleteBase } from '~/sqlite-core/async/delete.ts';
import { SQLiteAsyncInsertBase, type SQLiteAsyncInsertBuilder } from '~/sqlite-core/async/insert.ts';
import { type DBResult, SQLiteAsyncRaw } from '~/sqlite-core/async/raw.ts';
import { SQLiteAsyncSelectBase, type SQLiteAsyncSelectBuilder } from '~/sqlite-core/async/select.ts';
import type { Result, SQLiteAsyncSession, SQLiteAsyncTransaction } from '~/sqlite-core/async/session.ts';
import { SQLiteAsyncUpdateBase, type SQLiteAsyncUpdateBuilder } from '~/sqlite-core/async/update.ts';
import type { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import {
	QueryBuilder,
	SQLiteInsertBuilder,
	SQLiteSelectBuilder,
	SQLiteUpdateBuilder,
} from '~/sqlite-core/query-builders/index.ts';
import type { SQLiteTransactionConfig } from '~/sqlite-core/session.ts';
import type { SQLiteTable } from '~/sqlite-core/table.ts';
import { WithSubquery } from '~/subquery.ts';
import type { DrizzleTypeError } from '~/utils.ts';
import { RelationalQueryBuilder } from '../query-builders/query.ts';
import type { SelectedFields } from '../query-builders/select.types.ts';
import type { WithBuilder } from '../subquery.ts';
import type { SQLiteViewBase } from '../view-base.ts';
import { SQLiteAsyncCountBuilder, type SQLiteAsyncCountBuilderKind, SQLiteSyncCountBuilder } from './count.ts';
import { SQLiteAsyncRelationalQuery, type SQLiteAsyncRelationalQueryHKT, SQLiteSyncRelationalQuery } from './query.ts';

export class SQLiteAsyncDatabase<
	TResultKind extends 'sync' | 'async',
	TRunResult,
	TRelations extends AnyRelations = EmptyRelations,
> {
	static readonly [entityKind]: string = 'BaseSQLiteDatabase';

	declare readonly _: {
		readonly relations: TRelations;
		readonly session: SQLiteAsyncSession<TResultKind, TRunResult, TRelations>;
		readonly resultKind: TResultKind;
	};

	// TO-DO: Figure out how to pass DrizzleTypeError without breaking withReplicas
	query: {
		[K in keyof TRelations]: RelationalQueryBuilder<
			TResultKind,
			TRelations,
			TRelations[K],
			SQLiteAsyncRelationalQueryHKT
		>;
	};

	constructor(
		private resultKind: TResultKind,
		/** @internal */
		readonly dialect: SQLiteDialect,
		/** @internal */
		readonly session: SQLiteAsyncSession<TResultKind, TRunResult, TRelations>,
		relations: TRelations,
		readonly forbidJsonb?: boolean,
	) {
		this._ = {
			relations,
			session,
			resultKind,
		};
		this.query = {} as typeof this['query'];
		for (const [tableName, relation] of Object.entries(relations)) {
			(this.query as SQLiteAsyncDatabase<
				TResultKind,
				TRunResult,
				AnyRelations
			>['query'])[tableName] = new RelationalQueryBuilder(
				resultKind,
				relations,
				relations[relation.name]!.table as SQLiteTable,
				relation,
				dialect,
				session as SQLiteAsyncSession<any, any, any>,
				forbidJsonb,
				resultKind === 'sync' ? SQLiteSyncRelationalQuery : SQLiteAsyncRelationalQuery,
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
		source: SQLiteTable | SQLiteViewBase | SQL | SQLWrapper,
		filters?: SQL<unknown>,
	): SQLiteAsyncCountBuilderKind<TResultKind> {
		return this.resultKind === 'async'
			? new SQLiteAsyncCountBuilder({
				source,
				filters,
				session: this.session,
				dialect: this.dialect,
			}) as SQLiteAsyncCountBuilderKind<TResultKind>
			: new SQLiteSyncCountBuilder({
				source,
				filters,
				session: this.session,
				dialect: this.dialect,
			});
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
		function select(): SQLiteAsyncSelectBuilder<undefined, TResultKind, TRunResult>;
		function select<TSelection extends SelectedFields>(
			fields: TSelection,
		): SQLiteAsyncSelectBuilder<TSelection, TResultKind, TRunResult>;
		function select(
			fields?: SelectedFields,
		): SQLiteAsyncSelectBuilder<SelectedFields | undefined, TResultKind, TRunResult> {
			return new SQLiteSelectBuilder({
				fields: fields ?? undefined,
				session: self.session,
				dialect: self.dialect,
				withList: queries,
			}, SQLiteAsyncSelectBase);
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
		function selectDistinct(): SQLiteAsyncSelectBuilder<undefined, TResultKind, TRunResult>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields: TSelection,
		): SQLiteAsyncSelectBuilder<TSelection, TResultKind, TRunResult>;
		function selectDistinct(
			fields?: SelectedFields,
		): SQLiteAsyncSelectBuilder<SelectedFields | undefined, TResultKind, TRunResult> {
			return new SQLiteSelectBuilder({
				fields: fields ?? undefined,
				session: self.session,
				dialect: self.dialect,
				withList: queries,
				distinct: true,
			}, SQLiteAsyncSelectBase);
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
		function update<TTable extends SQLiteTable>(
			table: TTable,
		): SQLiteAsyncUpdateBuilder<TTable, TResultKind, TRunResult> {
			return new SQLiteUpdateBuilder(table, self.session, self.dialect, queries, SQLiteAsyncUpdateBase);
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
		function insert<TTable extends SQLiteTable>(
			into: TTable,
		): SQLiteAsyncInsertBuilder<TTable, TResultKind, TRunResult> {
			return new SQLiteInsertBuilder(into, self.session, self.dialect, queries, SQLiteAsyncInsertBase);
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
		function delete_<TTable extends SQLiteTable>(from: TTable): SQLiteAsyncDeleteBase<TTable, TResultKind, TRunResult> {
			return new SQLiteAsyncDeleteBase(from, self.session, self.dialect, queries);
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
	select(): SQLiteAsyncSelectBuilder<undefined, TResultKind, TRunResult>;
	select<TSelection extends SelectedFields>(
		fields: TSelection,
	): SQLiteAsyncSelectBuilder<TSelection, TResultKind, TRunResult>;
	select(fields?: SelectedFields): SQLiteAsyncSelectBuilder<SelectedFields | undefined, TResultKind, TRunResult> {
		return new SQLiteSelectBuilder(
			{ fields: fields ?? undefined, session: this.session, dialect: this.dialect },
			SQLiteAsyncSelectBase,
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
	selectDistinct(): SQLiteAsyncSelectBuilder<undefined, TResultKind, TRunResult>;
	selectDistinct<TSelection extends SelectedFields>(
		fields: TSelection,
	): SQLiteAsyncSelectBuilder<TSelection, TResultKind, TRunResult>;
	selectDistinct(
		fields?: SelectedFields,
	): SQLiteAsyncSelectBuilder<SelectedFields | undefined, TResultKind, TRunResult> {
		return new SQLiteSelectBuilder({
			fields: fields ?? undefined,
			session: this.session,
			dialect: this.dialect,
			distinct: true,
		}, SQLiteAsyncSelectBase);
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
	update<TTable extends SQLiteTable>(table: TTable): SQLiteAsyncUpdateBuilder<TTable, TResultKind, TRunResult> {
		return new SQLiteUpdateBuilder(table, this.session, this.dialect, undefined, SQLiteAsyncUpdateBase);
	}

	$cache: { invalidate: Cache['onMutate'] };

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
	insert<TTable extends SQLiteTable>(into: TTable): SQLiteAsyncInsertBuilder<TTable, TResultKind, TRunResult> {
		return new SQLiteInsertBuilder(into, this.session, this.dialect, undefined, SQLiteAsyncInsertBase);
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
	delete<TTable extends SQLiteTable>(from: TTable): SQLiteAsyncDeleteBase<TTable, TResultKind, TRunResult> {
		return new SQLiteAsyncDeleteBase(from, this.session, this.dialect);
	}

	run(query: SQLWrapper | string): DBResult<TResultKind, TRunResult> {
		const sequel = typeof query === 'string' ? sql.raw(query) : query.getSQL();
		const builtQuery = this.dialect.sqlToQuery(sequel);
		const prepared = this.session.prepareQuery(builtQuery, 'raw', false, 'run');
		if (this.resultKind === 'async') {
			return new SQLiteAsyncRaw(prepared, sequel, builtQuery) as DBResult<TResultKind, TRunResult>;
		}
		return this.session.run(sequel) as DBResult<TResultKind, TRunResult>;
	}

	all<T = unknown>(query: SQLWrapper | string): DBResult<TResultKind, T[]> {
		const sequel = typeof query === 'string' ? sql.raw(query) : query.getSQL();
		const builtQuery = this.dialect.sqlToQuery(sequel);
		const prepared = this.session.prepareQuery(builtQuery, 'objects', false, 'all');
		if (this.resultKind === 'async') {
			return new SQLiteAsyncRaw(prepared, sequel, builtQuery) as DBResult<TResultKind, T[]>;
		}
		return this.session.objects(sequel) as DBResult<TResultKind, T[]>;
	}

	get<T = unknown>(query: SQLWrapper | string): DBResult<TResultKind, T> {
		const sequel = typeof query === 'string' ? sql.raw(query) : query.getSQL();
		const builtQuery = this.dialect.sqlToQuery(sequel);
		const prepared = this.session.prepareQuery(builtQuery, 'objects', false, 'get');
		if (this.resultKind === 'async') {
			return new SQLiteAsyncRaw(prepared, sequel, builtQuery) as DBResult<TResultKind, T>;
		}
		return this.session.object(sequel) as DBResult<TResultKind, T>;
	}

	values<T extends unknown[] = unknown[]>(query: SQLWrapper | string): DBResult<TResultKind, T[]> {
		const sequel = typeof query === 'string' ? sql.raw(query) : query.getSQL();
		const builtQuery = this.dialect.sqlToQuery(sequel);
		const prepared = this.session.prepareQuery(builtQuery, 'objects', false, 'values');
		if (this.resultKind === 'async') {
			return new SQLiteAsyncRaw(prepared, sequel, builtQuery) as DBResult<TResultKind, T[]>;
		}
		return this.session.arrays(sequel) as DBResult<TResultKind, T[]>;
	}

	transaction<T>(
		transaction: (
			tx: SQLiteAsyncTransaction<TResultKind, TRunResult, TRelations>,
		) => TResultKind extends 'sync'
			? T extends Promise<any> ? DrizzleTypeError<"Sync drivers can't use async functions in transactions!"> : T
			: Result<TResultKind, T>,
		config?: SQLiteTransactionConfig,
	): Result<TResultKind, T> {
		return this.session.transaction(
			transaction as (
				tx: SQLiteAsyncTransaction<TResultKind, TRunResult, TRelations>,
			) => Result<TResultKind, T>,
			config,
		);
	}
}

export type SQLiteWithReplicas<Q> = Q & { $primary: Q; $replicas: Q[] };

export const withReplicas = <
	TResultKind extends 'sync' | 'async',
	TRunResult,
	TRelations extends AnyRelations,
	Q extends SQLiteAsyncDatabase<
		TResultKind,
		TRunResult,
		TRelations
	>,
>(
	primary: Q,
	replicas: [Q, ...Q[]],
	getReplica: (replicas: Q[]) => Q = () => replicas[Math.floor(Math.random() * replicas.length)]!,
): SQLiteWithReplicas<Q> => {
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
