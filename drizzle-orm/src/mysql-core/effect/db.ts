import { Effect } from 'effect';
import type { SqlError } from 'effect/unstable/sql/SqlError';
import type { ResultSetHeader } from 'mysql2/promise';
import type { EffectCacheShape } from '~/cache/core/cache-effect.ts';
import type { MutationOption } from '~/cache/core/cache.ts';
import type { QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlDialect } from '~/mysql-core/dialect.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import { type ColumnsSelection, type SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import { WithSubquery } from '~/subquery.ts';
import { MySqlInsertBuilder } from '../query-builders/insert.ts';
import { QueryBuilder } from '../query-builders/query-builder.ts';
import { RelationalQueryBuilder } from '../query-builders/query.ts';
import { MySqlSelectBuilder } from '../query-builders/select.ts';
import type { SelectedFields } from '../query-builders/select.types.ts';
import { MySqlUpdateBuilder } from '../query-builders/update.ts';
import type {
	MySqlPreparedQueryConfig,
	MySqlQueryResultHKT,
	MySqlQueryResultKind,
	MySqlTransactionConfig,
} from '../session.ts';
import type { WithBuilder } from '../subquery.ts';
import type { MySqlTable } from '../table.ts';
import type { MySqlViewBase } from '../view-base.ts';
import type { MySqlView } from '../view.ts';
import { MySqlEffectCountBuilder } from './count.ts';
import { MySqlEffectDeleteBase } from './delete.ts';
import { MySqlEffectInsertBase, type MySqlEffectInsertHKT } from './insert.ts';
import { MySqlEffectRelationalQuery, type MySqlEffectRelationalQueryHKT } from './query.ts';
import { MySqlEffectRaw } from './raw.ts';
import { MySqlEffectSelectBase, type MySqlEffectSelectBuilder } from './select.ts';
import type { MySqlEffectSession, MySqlEffectTransaction } from './session.ts';
import { MySqlEffectUpdateBase, type MySqlEffectUpdateHKT } from './update.ts';

export class MySqlEffectDatabase<
	TEffectHKT extends QueryEffectHKTBase,
	TQueryResult extends MySqlQueryResultHKT,
	TRelations extends AnyRelations = EmptyRelations,
> {
	static readonly [entityKind]: string = 'MySqlEffectDatabase';

	declare readonly _: {
		readonly relations: TRelations;
		readonly session: MySqlEffectSession<TEffectHKT, TQueryResult, TRelations>;
	};

	// TO-DO: Figure out how to pass DrizzleTypeError without breaking withReplicas
	query: {
		[K in keyof TRelations]: RelationalQueryBuilder<
			TRelations,
			TRelations[K],
			MySqlEffectRelationalQueryHKT<TEffectHKT>
		>;
	};

	constructor(
		/** @internal */
		readonly dialect: MySqlDialect,
		/** @internal */
		readonly session: MySqlEffectSession<TEffectHKT, any, any>,
		relations: TRelations,
	) {
		this._ = {
			relations,
			session,
		};
		this.query = {} as typeof this['query'];
		for (const [tableName, relation] of Object.entries(relations)) {
			(this.query as MySqlEffectDatabase<
				TEffectHKT,
				TQueryResult,
				AnyRelations
			>['query'])[tableName] = new RelationalQueryBuilder(
				relations,
				relations[relation.name]!.table as MySqlTable | MySqlView,
				relation,
				dialect,
				session,
				MySqlEffectRelationalQuery,
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
		const as = (
			qb:
				| TypedQueryBuilder<ColumnsSelection | undefined>
				| SQL
				| ((qb: QueryBuilder) => TypedQueryBuilder<ColumnsSelection | undefined> | SQL),
		) => {
			if (typeof qb === 'function') {
				qb = qb(new QueryBuilder(this.dialect));
			}

			const sql = ('withoutSelectionCastCodecs' in qb ? qb.withoutSelectionCastCodecs() : qb).getSQL();
			return new Proxy(
				new WithSubquery(
					sql,
					selection ?? ('getSelectedFields' in qb ? qb.getSelectedFields() ?? {} : {}) as SelectedFields,
					alias,
					true,
					sql.usedTables ?? [],
				),
				new SelectionProxyHandler({ alias, sqlAliasedBehavior: 'alias', sqlBehavior: 'error' }),
			);
		};
		return { as };
	};

	$count(
		source: MySqlTable | MySqlViewBase | SQL | SQLWrapper,
		filters?: SQL<unknown>,
	) {
		return new MySqlEffectCountBuilder({ source, filters, session: this.session, dialect: this.dialect });
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
		function select(): MySqlEffectSelectBuilder<undefined, TEffectHKT>;
		function select<TSelection extends SelectedFields>(
			fields: TSelection,
		): MySqlEffectSelectBuilder<TSelection, TEffectHKT>;
		function select(fields?: SelectedFields): MySqlEffectSelectBuilder<SelectedFields | undefined, TEffectHKT> {
			return new MySqlSelectBuilder({
				fields: fields ?? undefined,
				session: self.session,
				dialect: self.dialect,
				withList: queries,
			}, MySqlEffectSelectBase);
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
		function selectDistinct(): MySqlEffectSelectBuilder<undefined, TEffectHKT>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields: TSelection,
		): MySqlEffectSelectBuilder<TSelection, TEffectHKT>;
		function selectDistinct(
			fields?: SelectedFields,
		): MySqlEffectSelectBuilder<SelectedFields | undefined, TEffectHKT> {
			return new MySqlSelectBuilder({
				fields: fields ?? undefined,
				session: self.session,
				dialect: self.dialect,
				withList: queries,
				distinct: true,
			}, MySqlEffectSelectBase);
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
		 * ```
		 */
		function update<TTable extends MySqlTable>(
			table: TTable,
		): MySqlUpdateBuilder<TTable, TQueryResult, MySqlEffectUpdateHKT<TEffectHKT>> {
			return new MySqlUpdateBuilder(table, self.session, self.dialect, queries, MySqlEffectUpdateBase);
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
		 * ```
		 */
		function delete_<TTable extends MySqlTable>(
			table: TTable,
		): MySqlEffectDeleteBase<TTable, TQueryResult, false, never, TEffectHKT> {
			return new MySqlEffectDeleteBase(table, self.session, self.dialect, queries);
		}

		return { select, selectDistinct, update, delete: delete_ };
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
	select(): MySqlEffectSelectBuilder<undefined, TEffectHKT>;
	select<TSelection extends SelectedFields>(fields: TSelection): MySqlEffectSelectBuilder<TSelection, TEffectHKT>;
	select(fields?: SelectedFields): MySqlEffectSelectBuilder<SelectedFields | undefined, TEffectHKT> {
		return new MySqlSelectBuilder({
			fields: fields ?? undefined,
			session: this.session,
			dialect: this.dialect,
		}, MySqlEffectSelectBase);
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
	selectDistinct(): MySqlEffectSelectBuilder<undefined, TEffectHKT>;
	selectDistinct<TSelection extends SelectedFields>(
		fields: TSelection,
	): MySqlEffectSelectBuilder<TSelection, TEffectHKT>;
	selectDistinct(fields?: SelectedFields): MySqlEffectSelectBuilder<SelectedFields | undefined, TEffectHKT> {
		return new MySqlSelectBuilder({
			fields: fields ?? undefined,
			session: this.session,
			dialect: this.dialect,
			distinct: true,
		}, MySqlEffectSelectBase);
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
	 * ```
	 */
	update<TTable extends MySqlTable>(
		table: TTable,
	): MySqlUpdateBuilder<TTable, TQueryResult, MySqlEffectUpdateHKT<TEffectHKT>> {
		return new MySqlUpdateBuilder(table, this.session, this.dialect, undefined, MySqlEffectUpdateBase);
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
	 * ```
	 */
	insert<TTable extends MySqlTable>(
		table: TTable,
	): MySqlInsertBuilder<TTable, TQueryResult, MySqlEffectInsertHKT<TEffectHKT>> {
		return new MySqlInsertBuilder(table, this.session, this.dialect, MySqlEffectInsertBase);
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
	 * ```
	 */
	delete<TTable extends MySqlTable>(
		table: TTable,
	): MySqlEffectDeleteBase<TTable, TQueryResult, false, never, TEffectHKT> {
		return new MySqlEffectDeleteBase(table, this.session, this.dialect);
	}

	execute<T extends { [column: string]: any } = ResultSetHeader>(
		query: SQLWrapper | string,
	): MySqlEffectRaw<MySqlQueryResultKind<TQueryResult, T>, TEffectHKT> {
		const sequel = typeof query === 'string' ? sql.raw(query) : query.getSQL();
		const builtQuery = this.dialect.sqlToQuery(sequel);
		const prepared = this.session.prepareQuery<
			MySqlPreparedQueryConfig & { execute: MySqlQueryResultKind<TQueryResult, T> }
		>(builtQuery, 'raw');
		return new MySqlEffectRaw(prepared, sequel, builtQuery);
	}

	transaction<A, E, R>(
		transaction: (
			tx: MySqlEffectTransaction<TEffectHKT, TQueryResult, TRelations>,
		) => Effect.Effect<A, E, R>,
		config?: MySqlTransactionConfig,
	): Effect.Effect<A, E | SqlError, R> {
		return this.session.transaction(transaction, config);
	}
}

export type MySqlEffectWithReplicas<Q> = Q & { $primary: Q; $replicas: Q[] };

export const withReplicas = <
	TEffectHKT extends QueryEffectHKTBase,
	HKT extends MySqlQueryResultHKT,
	TRelations extends AnyRelations,
	Q extends MySqlEffectDatabase<TEffectHKT, HKT, TRelations>,
>(
	primary: Q,
	replicas: [Q, ...Q[]],
	getReplica: (replicas: Q[]) => Q = () => replicas[Math.floor(Math.random() * replicas.length)]!,
): MySqlEffectWithReplicas<Q> => {
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
	};
};
