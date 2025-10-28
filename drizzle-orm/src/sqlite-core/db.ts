import type * as V1 from '~/_relations.ts';
import type { Cache } from '~/cache/core/cache.ts';
import { entityKind } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import { type ColumnsSelection, type SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import type { SQLiteAsyncDialect, SQLiteSyncDialect } from '~/sqlite-core/dialect.ts';
import {
	QueryBuilder,
	SQLiteDeleteBase,
	SQLiteInsertBuilder,
	SQLiteSelectBuilder,
	SQLiteUpdateBuilder,
} from '~/sqlite-core/query-builders/index.ts';
import type {
	DBResult,
	Result,
	SQLiteSession,
	SQLiteTransaction,
	SQLiteTransactionConfig,
} from '~/sqlite-core/session.ts';
import type { SQLiteTable } from '~/sqlite-core/table.ts';
import { WithSubquery } from '~/subquery.ts';
import type { DrizzleTypeError } from '~/utils.ts';
import { _RelationalQueryBuilder } from './query-builders/_query.ts';
import { SQLiteCountBuilder } from './query-builders/count.ts';
import { RelationalQueryBuilder } from './query-builders/query.ts';
import { SQLiteRaw } from './query-builders/raw.ts';
import type { SelectedFields } from './query-builders/select.types.ts';
import type { WithBuilder } from './subquery.ts';
import type { SQLiteViewBase } from './view-base.ts';

export class BaseSQLiteDatabase<
	TResultKind extends 'sync' | 'async',
	TRunResult,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TSchema extends V1.TablesRelationalConfig = V1.ExtractTablesWithRelations<TFullSchema>,
> {
	static readonly [entityKind]: string = 'BaseSQLiteDatabase';

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
			[K in keyof TSchema]: _RelationalQueryBuilder<TResultKind, TFullSchema, TSchema, TSchema[K]>;
		};

	// TO-DO: Figure out how to pass DrizzleTypeError without breaking withReplicas
	query: {
		[K in keyof TRelations]: RelationalQueryBuilder<
			TResultKind,
			TRelations,
			TRelations[K]
		>;
	};

	constructor(
		private resultKind: TResultKind,
		/** @internal */
		readonly dialect: { sync: SQLiteSyncDialect; async: SQLiteAsyncDialect }[TResultKind],
		/** @internal */
		readonly session: SQLiteSession<TResultKind, TRunResult, TFullSchema, TRelations, TSchema>,
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
			[K in keyof TSchema]: _RelationalQueryBuilder<TResultKind, TFullSchema, TSchema, TSchema[K]>;
		};
		if (this._.schema) {
			for (const [tableName, columns] of Object.entries(this._.schema)) {
				query[tableName as keyof TSchema] = new _RelationalQueryBuilder(
					resultKind,
					_schema!.fullSchema,
					this._.schema,
					this._.tableNamesMap,
					_schema!.fullSchema[tableName] as SQLiteTable,
					columns,
					dialect,
					session as SQLiteSession<any, any, any, any, any>,
				) as typeof query[keyof TSchema];
			}
		}
		this.query = {} as typeof this['query'];
		for (const [tableName, relation] of Object.entries(relations)) {
			(this.query as BaseSQLiteDatabase<
				TResultKind,
				TRunResult,
				TSchema,
				AnyRelations,
				V1.TablesRelationalConfig
			>['query'])[tableName] = new RelationalQueryBuilder(
				resultKind,
				relations,
				relations[relation.name]!.table as SQLiteTable,
				relation,
				dialect,
				session as SQLiteSession<any, any, any, any, any>,
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
		function select(): SQLiteSelectBuilder<undefined, TResultKind, TRunResult>;
		function select<TSelection extends SelectedFields>(
			fields: TSelection,
		): SQLiteSelectBuilder<TSelection, TResultKind, TRunResult>;
		function select(
			fields?: SelectedFields,
		): SQLiteSelectBuilder<SelectedFields | undefined, TResultKind, TRunResult> {
			return new SQLiteSelectBuilder({
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
		function selectDistinct(): SQLiteSelectBuilder<undefined, TResultKind, TRunResult>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields: TSelection,
		): SQLiteSelectBuilder<TSelection, TResultKind, TRunResult>;
		function selectDistinct(
			fields?: SelectedFields,
		): SQLiteSelectBuilder<SelectedFields | undefined, TResultKind, TRunResult> {
			return new SQLiteSelectBuilder({
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
		function update<TTable extends SQLiteTable>(table: TTable): SQLiteUpdateBuilder<TTable, TResultKind, TRunResult> {
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
		function insert<TTable extends SQLiteTable>(into: TTable): SQLiteInsertBuilder<TTable, TResultKind, TRunResult> {
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
		function delete_<TTable extends SQLiteTable>(from: TTable): SQLiteDeleteBase<TTable, TResultKind, TRunResult> {
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
	select(): SQLiteSelectBuilder<undefined, TResultKind, TRunResult>;
	select<TSelection extends SelectedFields>(
		fields: TSelection,
	): SQLiteSelectBuilder<TSelection, TResultKind, TRunResult>;
	select(fields?: SelectedFields): SQLiteSelectBuilder<SelectedFields | undefined, TResultKind, TRunResult> {
		return new SQLiteSelectBuilder({ fields: fields ?? undefined, session: this.session, dialect: this.dialect });
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
	selectDistinct(): SQLiteSelectBuilder<undefined, TResultKind, TRunResult>;
	selectDistinct<TSelection extends SelectedFields>(
		fields: TSelection,
	): SQLiteSelectBuilder<TSelection, TResultKind, TRunResult>;
	selectDistinct(
		fields?: SelectedFields,
	): SQLiteSelectBuilder<SelectedFields | undefined, TResultKind, TRunResult> {
		return new SQLiteSelectBuilder({
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
	 *
	 * // Update with returning clause
	 * const updatedCar: Car[] = await db.update(cars)
	 *   .set({ color: 'red' })
	 *   .where(eq(cars.id, 1))
	 *   .returning();
	 * ```
	 */
	update<TTable extends SQLiteTable>(table: TTable): SQLiteUpdateBuilder<TTable, TResultKind, TRunResult> {
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
	insert<TTable extends SQLiteTable>(into: TTable): SQLiteInsertBuilder<TTable, TResultKind, TRunResult> {
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
	delete<TTable extends SQLiteTable>(from: TTable): SQLiteDeleteBase<TTable, TResultKind, TRunResult> {
		return new SQLiteDeleteBase(from, this.session, this.dialect);
	}

	run(query: SQLWrapper | string): DBResult<TResultKind, TRunResult> {
		const sequel = typeof query === 'string' ? sql.raw(query) : query.getSQL();
		if (this.resultKind === 'async') {
			return new SQLiteRaw(
				async () => this.session.run(sequel),
				() => sequel,
				'run',
				this.dialect as SQLiteAsyncDialect,
				this.session.extractRawRunValueFromBatchResult.bind(this.session),
			) as DBResult<TResultKind, TRunResult>;
		}
		return this.session.run(sequel) as DBResult<TResultKind, TRunResult>;
	}

	all<T = unknown>(query: SQLWrapper | string): DBResult<TResultKind, T[]> {
		const sequel = typeof query === 'string' ? sql.raw(query) : query.getSQL();
		if (this.resultKind === 'async') {
			return new SQLiteRaw(
				async () => this.session.all(sequel),
				() => sequel,
				'all',
				this.dialect as SQLiteAsyncDialect,
				this.session.extractRawAllValueFromBatchResult.bind(this.session),
			) as any;
		}
		return this.session.all(sequel) as DBResult<TResultKind, T[]>;
	}

	get<T = unknown>(query: SQLWrapper | string): DBResult<TResultKind, T> {
		const sequel = typeof query === 'string' ? sql.raw(query) : query.getSQL();
		if (this.resultKind === 'async') {
			return new SQLiteRaw(
				async () => this.session.get(sequel),
				() => sequel,
				'get',
				this.dialect as SQLiteAsyncDialect,
				this.session.extractRawGetValueFromBatchResult.bind(this.session),
			) as DBResult<TResultKind, T>;
		}
		return this.session.get(sequel) as DBResult<TResultKind, T>;
	}

	values<T extends unknown[] = unknown[]>(query: SQLWrapper | string): DBResult<TResultKind, T[]> {
		const sequel = typeof query === 'string' ? sql.raw(query) : query.getSQL();
		if (this.resultKind === 'async') {
			return new SQLiteRaw(
				async () => this.session.values(sequel),
				() => sequel,
				'values',
				this.dialect as SQLiteAsyncDialect,
				this.session.extractRawValuesValueFromBatchResult.bind(this.session),
			) as any;
		}
		return this.session.values(sequel) as DBResult<TResultKind, T[]>;
	}

	transaction<T>(
		transaction: (
			tx: SQLiteTransaction<TResultKind, TRunResult, TFullSchema, TRelations, TSchema>,
		) => Result<TResultKind, T>,
		config?: SQLiteTransactionConfig,
	): Result<TResultKind, T> {
		return this.session.transaction(transaction, config);
	}
}

export type SQLiteWithReplicas<Q> = Q & { $primary: Q; $replicas: Q[] };

export const withReplicas = <
	TResultKind extends 'sync' | 'async',
	TRunResult,
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
	Q extends BaseSQLiteDatabase<
		TResultKind,
		TRunResult,
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
		get _query() {
			return getReplica(replicas)._query;
		},
		get query() {
			return getReplica(replicas).query;
		},
	};
};
