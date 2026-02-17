import type { BigQueryDialect } from '~/bigquery-core/dialect.ts';
import {
	BigQueryCountBuilder,
	BigQueryDeleteBase,
	BigQueryInsertBuilder,
	BigQuerySelectBuilder,
	BigQueryUpdateBuilder,
} from '~/bigquery-core/query-builders/index.ts';
import type {
	BigQueryQueryResultHKT,
	BigQueryQueryResultKind,
	BigQuerySession,
	BigQueryTransaction,
	BigQueryTransactionConfig,
	PreparedQueryConfig,
} from '~/bigquery-core/session.ts';
import type { BigQueryTable } from '~/bigquery-core/table.ts';
import { entityKind } from '~/entity.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { ExtractTablesWithRelations, RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import { type ColumnsSelection, type SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import { WithSubquery } from '~/subquery.ts';
import type { DrizzleTypeError } from '~/utils.ts';
import type { BigQueryColumn } from './columns/index.ts';
import type { SelectedFields } from './query-builders/select.types.ts';

export class BigQueryDatabase<
	TQueryResult extends BigQueryQueryResultHKT,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TSchema extends TablesRelationalConfig = ExtractTablesWithRelations<TFullSchema>,
> {
	static readonly [entityKind]: string = 'BigQueryDatabase';

	declare readonly _: {
		readonly schema: TSchema | undefined;
		readonly fullSchema: TFullSchema;
		readonly tableNamesMap: Record<string, string>;
		readonly session: BigQuerySession<TQueryResult, TFullSchema, TSchema>;
	};

	constructor(
		/** @internal */
		readonly dialect: BigQueryDialect,
		/** @internal */
		readonly session: BigQuerySession<any, any, any>,
		schema: RelationalSchemaConfig<TSchema> | undefined,
	) {
		this._ = schema
			? {
				schema: schema.schema,
				fullSchema: schema.fullSchema as TFullSchema,
				tableNamesMap: schema.tableNamesMap,
				session,
			}
			: {
				schema: undefined,
				fullSchema: {} as TFullSchema,
				tableNamesMap: {},
				session,
			};
	}

	/**
	 * Returns the count of rows that match the given filter criteria.
	 *
	 * @param source The table or SQL expression to count from.
	 * @param filters Optional filter conditions.
	 *
	 * @example
	 *
	 * ```ts
	 * // Count all rows in the 'users' table
	 * const count = await db.$count(users);
	 *
	 * // Count rows with filters
	 * const activeCount = await db.$count(users, eq(users.active, true));
	 * ```
	 */
	$count(
		source: BigQueryTable | SQL | SQLWrapper,
		filters?: SQL<unknown>,
	) {
		return new BigQueryCountBuilder({ source, filters, session: this.session });
	}

	/**
	 * Creates a subquery that defines a temporary named result set as a CTE.
	 *
	 * It is useful for breaking down complex queries into simpler parts and for reusing the result set in subsequent parts of the query.
	 *
	 * @param alias The alias for the subquery.
	 *
	 * @example
	 *
	 * ```ts
	 * // Create a subquery with alias 'sq' and use it in the select query
	 * const sq = db.$with('sq').as(db.select().from(users).where(eq(users.id, 42)));
	 *
	 * const result = await db.with(sq).select().from(sq);
	 * ```
	 */
	$with(alias: string) {
		const self = this;
		return {
			as(
				qb: TypedQueryBuilder<ColumnsSelection | undefined> | SQL,
			) {
				return new Proxy(
					new WithSubquery(
						qb.getSQL(),
						('getSelectedFields' in qb ? qb.getSelectedFields() ?? {} : {}) as SelectedFields,
						alias,
						true,
					),
					new SelectionProxyHandler({ alias, sqlAliasedBehavior: 'alias', sqlBehavior: 'error' }),
				);
			},
		};
	}

	/**
	 * Incorporates a previously defined CTE (using `$with`) into the main query.
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

		function select(): BigQuerySelectBuilder<undefined>;
		function select<TSelection extends SelectedFields>(fields: TSelection): BigQuerySelectBuilder<TSelection>;
		function select<TSelection extends SelectedFields>(
			fields?: TSelection,
		): BigQuerySelectBuilder<TSelection | undefined> {
			return new BigQuerySelectBuilder({
				fields: fields ?? undefined,
				session: self.session,
				dialect: self.dialect,
				withList: queries,
			});
		}

		function selectDistinct(): BigQuerySelectBuilder<undefined>;
		function selectDistinct<TSelection extends SelectedFields>(fields: TSelection): BigQuerySelectBuilder<TSelection>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields?: TSelection,
		): BigQuerySelectBuilder<TSelection | undefined> {
			return new BigQuerySelectBuilder({
				fields: fields ?? undefined,
				session: self.session,
				dialect: self.dialect,
				withList: queries,
				distinct: true,
			});
		}

		function update<TTable extends BigQueryTable>(table: TTable): BigQueryUpdateBuilder<TTable, TQueryResult> {
			return new BigQueryUpdateBuilder(table, self.session, self.dialect, queries);
		}

		function insert<TTable extends BigQueryTable>(table: TTable): BigQueryInsertBuilder<TTable, TQueryResult> {
			return new BigQueryInsertBuilder(table, self.session, self.dialect, queries);
		}

		function delete_<TTable extends BigQueryTable>(table: TTable): BigQueryDeleteBase<TTable, TQueryResult> {
			return new BigQueryDeleteBase(table, self.session, self.dialect, queries);
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
	 * @param fields The selection object.
	 *
	 * @example
	 *
	 * ```ts
	 * // Select all columns and all rows from the 'users' table
	 * const allUsers = await db.select().from(users);
	 *
	 * // Select specific columns and all rows from the 'users' table
	 * const usersWithIdAndName = await db.select({
	 *   id: users.id,
	 *   name: users.name
	 * })
	 *   .from(users);
	 * ```
	 */
	select(): BigQuerySelectBuilder<undefined>;
	select<TSelection extends SelectedFields>(fields: TSelection): BigQuerySelectBuilder<TSelection>;
	select<TSelection extends SelectedFields>(fields?: TSelection): BigQuerySelectBuilder<TSelection | undefined> {
		return new BigQuerySelectBuilder({
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
	 * @param fields The selection object.
	 *
	 * @example
	 * ```ts
	 * // Select all unique rows from the 'users' table
	 * await db.selectDistinct()
	 *   .from(users)
	 *   .orderBy(users.id, users.name);
	 *
	 * // Select all unique names from the 'users' table
	 * await db.selectDistinct({ name: users.name })
	 *   .from(users)
	 *   .orderBy(users.name);
	 * ```
	 */
	selectDistinct(): BigQuerySelectBuilder<undefined>;
	selectDistinct<TSelection extends SelectedFields>(fields: TSelection): BigQuerySelectBuilder<TSelection>;
	selectDistinct<TSelection extends SelectedFields>(
		fields?: TSelection,
	): BigQuerySelectBuilder<TSelection | undefined> {
		return new BigQuerySelectBuilder({
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
	 * Note: BigQuery UPDATE does not support RETURNING clause.
	 *
	 * @param table The table to update.
	 *
	 * @example
	 *
	 * ```ts
	 * // Update all rows in the 'users' table
	 * await db.update(users).set({ active: true });
	 *
	 * // Update rows with filters and conditions
	 * await db.update(users).set({ active: true }).where(eq(users.role, 'admin'));
	 * ```
	 */
	update<TTable extends BigQueryTable>(table: TTable): BigQueryUpdateBuilder<TTable, TQueryResult> {
		return new BigQueryUpdateBuilder(table, this.session, this.dialect);
	}

	/**
	 * Creates an insert query.
	 *
	 * Calling this method will create new rows in a table. Use `.values()` method to specify which values to insert.
	 *
	 * Note: BigQuery INSERT does not support RETURNING clause.
	 *
	 * @param table The table to insert into.
	 *
	 * @example
	 *
	 * ```ts
	 * // Insert one row
	 * await db.insert(users).values({ name: 'John' });
	 *
	 * // Insert multiple rows
	 * await db.insert(users).values([{ name: 'John' }, { name: 'Jane' }]);
	 * ```
	 */
	insert<TTable extends BigQueryTable>(table: TTable): BigQueryInsertBuilder<TTable, TQueryResult> {
		return new BigQueryInsertBuilder(table, this.session, this.dialect);
	}

	/**
	 * Creates a delete query.
	 *
	 * Calling this method without `.where()` clause will delete all rows in a table. The `.where()` clause specifies which rows should be deleted.
	 *
	 * Note: BigQuery DELETE does not support RETURNING clause.
	 *
	 * @param table The table to delete from.
	 *
	 * @example
	 *
	 * ```ts
	 * // Delete all rows in the 'users' table
	 * await db.delete(users);
	 *
	 * // Delete rows with filters and conditions
	 * await db.delete(users).where(eq(users.active, false));
	 * ```
	 */
	delete<TTable extends BigQueryTable>(table: TTable): BigQueryDeleteBase<TTable, TQueryResult> {
		return new BigQueryDeleteBase(table, this.session, this.dialect);
	}

	/**
	 * Execute a raw SQL query.
	 *
	 * @param query The SQL query to execute.
	 *
	 * @example
	 *
	 * ```ts
	 * const result = await db.execute(sql`SELECT * FROM users WHERE id = ${userId}`);
	 * ```
	 */
	execute<TRow extends Record<string, unknown> = Record<string, unknown>>(
		query: SQLWrapper | string,
	): Promise<BigQueryQueryResultKind<TQueryResult, TRow>> {
		const sequel = typeof query === 'string' ? sql.raw(query) : query.getSQL();
		const builtQuery = this.dialect.sqlToQuery(sequel);
		const prepared = this.session.prepareQuery<
			PreparedQueryConfig & { execute: BigQueryQueryResultKind<TQueryResult, TRow> }
		>(
			builtQuery,
			undefined,
			undefined,
			false,
		);
		return prepared.execute();
	}

	/**
	 * Execute operations within a transaction.
	 *
	 * Note: BigQuery has limited transaction support via multi-statement transactions.
	 *
	 * @param transaction The transaction function.
	 * @param config Optional transaction configuration.
	 *
	 * @example
	 *
	 * ```ts
	 * await db.transaction(async (tx) => {
	 *   await tx.insert(users).values({ name: 'John' });
	 *   await tx.update(users).set({ active: true }).where(eq(users.name, 'John'));
	 * });
	 * ```
	 */
	transaction<T>(
		transaction: (tx: BigQueryTransaction<TQueryResult, TFullSchema, TSchema>) => Promise<T>,
		config?: BigQueryTransactionConfig,
	): Promise<T> {
		return this.session.transaction(transaction, config);
	}
}
