import type { SqliteClient } from '@effect/sql-sqlite-node/SqliteClient';
import type { SqlError } from '@effect/sql/SqlError';
import type { Effect } from 'effect/Effect';
import type * as V1 from '~/_relations.ts';
import type { Cache } from '~/cache/core/cache.ts';
import { entityKind } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import { type ColumnsSelection, type SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import type { SQLiteAsyncDialect, SQLiteSyncDialect } from '~/sqlite-core/dialect.ts';
import { _RelationalQueryBuilder } from '~/sqlite-core/query-builders/_query.ts';
import { SQLiteCountBuilder } from '~/sqlite-core/query-builders/count.ts';
import {
	QueryBuilder,
	SQLiteDeleteBase,
	SQLiteInsertBuilder,
	SQLiteUpdateBuilder,
} from '~/sqlite-core/query-builders/index.ts';
import { RelationalQueryBuilder } from '~/sqlite-core/query-builders/query.ts';
import type { SelectedFields } from '~/sqlite-core/query-builders/select.types.ts';
import type { Result, SQLiteTransaction, SQLiteTransactionConfig } from '~/sqlite-core/session.ts';
import type { WithBuilder } from '~/sqlite-core/subquery.ts';
import type { SQLiteTable } from '~/sqlite-core/table.ts';
import type { SQLiteViewBase } from '~/sqlite-core/view-base.ts';
import { WithSubquery } from '~/subquery.ts';
import type { DrizzleTypeError } from '~/utils.ts';
import { EffectSQLiteSelectBuilder } from './query-builders/select.ts';
import type { EffectSQLiteSession } from './session.ts';

export class EffectSQLiteDatabase<
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TSchema extends V1.TablesRelationalConfig = V1.ExtractTablesWithRelations<TFullSchema>,
> {
	static readonly [entityKind]: string = 'EffectSQLiteDatabase';

	declare readonly _: {
		readonly schema: TSchema | undefined;
		readonly fullSchema: TFullSchema;
		readonly tableNamesMap: Record<string, string>;
		readonly relations: TRelations;
	};

	/** @deprecated */
	_query: TFullSchema extends Record<string, never>
		? DrizzleTypeError<'Seems like the schema generic is missing - did you forget to add it to your DB type?'>
		: {
			[K in keyof TSchema]: _RelationalQueryBuilder<'sync', TFullSchema, TSchema, TSchema[K]>;
		};

	// TO-DO: Figure out how to pass DrizzleTypeError without breaking withReplicas
	query: {
		[K in keyof TRelations]: RelationalQueryBuilder<
			'sync',
			TRelations,
			TRelations[K]
		>;
	};

	constructor(
		/** @internal */
		readonly dialect: { sync: SQLiteSyncDialect; async: SQLiteAsyncDialect }['sync'],
		/** @internal */
		readonly session: EffectSQLiteSession<TFullSchema, TRelations, TSchema>,
		relations: TRelations,
		_schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		readonly rowModeRQB?: boolean,
		readonly forbidJsonb?: boolean,
	) {
		this._ = _schema
			? {
				schema: _schema.schema,
				fullSchema: _schema.fullSchema as TFullSchema,
				tableNamesMap: _schema.tableNamesMap,
				relations,
			}
			: {
				schema: undefined,
				fullSchema: {} as TFullSchema,
				tableNamesMap: {},
				relations,
			};

		this._query = {} as typeof this['_query'];
		const query = this._query as {
			[K in keyof TSchema]: _RelationalQueryBuilder<'sync', TFullSchema, TSchema, TSchema[K]>;
		};
		if (this._.schema) {
			for (const [tableName, columns] of Object.entries(this._.schema)) {
				query[tableName as keyof TSchema] = new _RelationalQueryBuilder(
					'sync',
					_schema!.fullSchema,
					this._.schema,
					this._.tableNamesMap,
					_schema!.fullSchema[tableName] as SQLiteTable,
					columns,
					dialect,
					session as any,
				) as typeof query[keyof TSchema];
			}
		}
		this.query = {} as typeof this['query'];
		for (const [tableName, relation] of Object.entries(relations)) {
			(this.query as EffectSQLiteDatabase<
				TSchema,
				AnyRelations,
				V1.TablesRelationalConfig
			>['query'])[tableName] = new RelationalQueryBuilder(
				'sync',
				relations,
				relations[relation.name]!.table as SQLiteTable,
				relation,
				dialect,
				session as EffectSQLiteSession<any, any, any>,
				rowModeRQB,
				forbidJsonb,
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
	) {
		return new SQLiteCountBuilder({ source, filters, session: this.session });
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
		function select(): EffectSQLiteSelectBuilder<undefined>;
		function select<TSelection extends SelectedFields>(
			fields: TSelection,
		): EffectSQLiteSelectBuilder<TSelection>;
		function select(
			fields?: SelectedFields,
		): EffectSQLiteSelectBuilder<SelectedFields | undefined> {
			return new EffectSQLiteSelectBuilder({
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
		function selectDistinct(): EffectSQLiteSelectBuilder<undefined>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields: TSelection,
		): EffectSQLiteSelectBuilder<TSelection>;
		function selectDistinct(
			fields?: SelectedFields,
		): EffectSQLiteSelectBuilder<SelectedFields | undefined> {
			return new EffectSQLiteSelectBuilder({
				fields: fields ?? undefined,
				session: self.session,
				dialect: self.dialect,
				withList: queries,
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
		function update<TTable extends SQLiteTable>(table: TTable): SQLiteUpdateBuilder<TTable, 'sync', unknown> {
			return new SQLiteUpdateBuilder(table, self.session, self.dialect, queries);
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
		function insert<TTable extends SQLiteTable>(into: TTable): SQLiteInsertBuilder<TTable, 'sync', unknown> {
			return new SQLiteInsertBuilder(into, self.session, self.dialect, queries);
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
		function delete_<TTable extends SQLiteTable>(from: TTable): SQLiteDeleteBase<TTable, 'sync', unknown> {
			return new SQLiteDeleteBase(from, self.session, self.dialect, queries);
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
	select(): EffectSQLiteSelectBuilder<undefined>;
	select<TSelection extends SelectedFields>(
		fields: TSelection,
	): EffectSQLiteSelectBuilder<TSelection>;
	select(fields?: SelectedFields): EffectSQLiteSelectBuilder<SelectedFields | undefined> {
		return new EffectSQLiteSelectBuilder({ fields: fields ?? undefined, session: this.session, dialect: this.dialect });
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
	selectDistinct(): EffectSQLiteSelectBuilder<undefined>;
	selectDistinct<TSelection extends SelectedFields>(
		fields: TSelection,
	): EffectSQLiteSelectBuilder<TSelection>;
	selectDistinct(
		fields?: SelectedFields,
	): EffectSQLiteSelectBuilder<SelectedFields | undefined> {
		return new EffectSQLiteSelectBuilder({
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
	update<TTable extends SQLiteTable>(table: TTable): SQLiteUpdateBuilder<TTable, 'sync', unknown> {
		return new SQLiteUpdateBuilder(table, this.session, this.dialect);
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
	insert<TTable extends SQLiteTable>(into: TTable): SQLiteInsertBuilder<TTable, 'sync', unknown> {
		return new SQLiteInsertBuilder(into, this.session, this.dialect);
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
	delete<TTable extends SQLiteTable>(from: TTable): SQLiteDeleteBase<TTable, 'sync', unknown> {
		return new SQLiteDeleteBase(from, this.session, this.dialect);
	}

	/** @deprecated Use `.effectRun()` for `Effect` compatibility */
	run: any = () => {
		throw new Error('Use `.effectRun()` for `Effect` compatibility');
	};

	/** @deprecated Use `.effectAll()` for `Effect` compatibility */
	all: any = () => {
		throw new Error('Use `.effectAll()` for `Effect` compatibility');
	};

	/** @deprecated Use `.effectGet()` for `Effect` compatibility */
	get: any = () => {
		throw new Error('Use `.effectGet()` for `Effect` compatibility');
	};

	/** @deprecated Use `.effectValues()` for `Effect` compatibility */
	values: any = () => {
		throw new Error('Use `.effectValues()` for `Effect` compatibility');
	};

	effectRun(query: SQLWrapper | string): Effect<unknown, SqlError, SqliteClient> {
		const sequel = typeof query === 'string' ? sql.raw(query) : query.getSQL();
		return this.session.effectRun(sequel) as Effect<unknown, SqlError, SqliteClient>;
	}

	effectAll<T = unknown>(query: SQLWrapper | string): Effect<T[], SqlError, SqliteClient> {
		const sequel = typeof query === 'string' ? sql.raw(query) : query.getSQL();
		return this.session.effectAll(sequel) as Effect<T[], SqlError, SqliteClient>;
	}

	effectGet<T = unknown>(query: SQLWrapper | string): Effect<T, SqlError, SqliteClient> {
		const sequel = typeof query === 'string' ? sql.raw(query) : query.getSQL();
		return this.session.effectGet(sequel) as Effect<T, SqlError, SqliteClient>;
	}

	effectValues<T extends unknown[] = unknown[]>(query: SQLWrapper | string): Effect<T[], SqlError, SqliteClient> {
		const sequel = typeof query === 'string' ? sql.raw(query) : query.getSQL();
		return this.session.effectValues(sequel) as Effect<T[], SqlError, SqliteClient>;
	}

	transaction<T>(
		transaction: (
			tx: SQLiteTransaction<'sync', unknown, TFullSchema, TRelations, TSchema>,
		) => Result<'sync', T>,
		config?: SQLiteTransactionConfig,
	): Result<'sync', T> {
		return this.session.transaction(transaction, config);
	}
}

export type SQLiteWithReplicas<Q> = Q & { $primary: Q };

export const withReplicas = <
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
	Q extends EffectSQLiteDatabase<
		TFullSchema,
		TRelations,
		TSchema extends Record<string, unknown> ? V1.ExtractTablesWithRelations<TFullSchema> : TSchema
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
	const effectRun: Q['effectRun'] = (...args: [any]) => primary.effectRun(...args);
	const effectAll: Q['effectAll'] = (...args: [any]) => primary.effectAll(...args);
	const effectGet: Q['effectGet'] = (...args: [any]) => primary.effectGet(...args);
	const effectValues: Q['effectValues'] = (...args: [any]) => primary.effectValues(...args);
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
		effectRun,
		effectAll,
		effectGet,
		effectValues,
		transaction,
		$primary: primary,
		select,
		selectDistinct,
		$count,
		with: $with,
		get _query() {
			return getReplica(replicas)._query;
		},
		get query() {
			return getReplica(replicas).query;
		},
	};
};
