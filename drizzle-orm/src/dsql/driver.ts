import type { QueryResult } from 'pg';
import * as V1 from '~/_relations.ts';
import type { Cache } from '~/cache/core/cache.ts';
import type { DSQLColumn } from '~/dsql-core/columns/common.ts';
import { DSQLDialect } from '~/dsql-core/dialect.ts';
import { DSQLDeleteBase } from '~/dsql-core/query-builders/delete.ts';
import { DSQLInsertBuilder } from '~/dsql-core/query-builders/insert.ts';
import { DSQLSelectBuilder, type SelectedFields } from '~/dsql-core/query-builders/select.ts';
import { DSQLUpdateBuilder } from '~/dsql-core/query-builders/update.ts';
import type { WithSubqueryWithSelection } from '~/dsql-core/subquery.ts';
import type { DSQLTable } from '~/dsql-core/table.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import type { TypedQueryBuilder } from '~/query-builders/query-builder.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SelectionProxyHandler } from '~/selection-proxy.ts';
import type { ColumnsSelection, SQL, SQLWrapper } from '~/sql/sql.ts';
import { WithSubquery } from '~/subquery.ts';
import type { DrizzleConfig } from '~/utils.ts';
import { DSQLRelationalQueryBuilder } from './query-builder.ts';
import type { DSQLRelationalQueryHKT } from './query.ts';
import type { DSQLClient, DSQLTransaction } from './session.ts';
import { DSQLDriverSession } from './session.ts';

export interface DSQLDriverOptions {
	logger?: Logger;
	cache?: Cache;
}

export class DSQLDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> {
	static readonly [entityKind]: string = 'DSQLDatabase';

	query: {
		[K in keyof TRelations]: DSQLRelationalQueryBuilder<
			TRelations,
			TRelations[K],
			DSQLRelationalQueryHKT
		>;
	};

	/** Cache instance for invalidation operations */
	$cache: { invalidate: Cache['onMutate'] };

	constructor(
		readonly dialect: DSQLDialect,
		readonly session: DSQLDriverSession<TSchema, TRelations, any>,
		readonly relations: TRelations,
		readonly schema: V1.RelationalSchemaConfig<any> | undefined,
	) {
		this.query = {} as typeof this['query'];
		for (const [tableName, relation] of Object.entries(relations)) {
			(this.query as DSQLDatabase<TSchema, AnyRelations>['query'])[tableName] = new DSQLRelationalQueryBuilder(
				relations,
				relations[relation.name]!.table as DSQLTable,
				relation,
				dialect,
				session,
				false,
			);
		}
		// Initialize cache with a no-op invalidate function
		this.$cache = { invalidate: async (_params: any) => {} };
	}

	/**
	 * Creates a CTE (Common Table Expression) that can be used in queries.
	 */
	$with<TAlias extends string>(alias: TAlias): {
		as: <TSelection extends ColumnsSelection>(
			qb:
				| TypedQueryBuilder<TSelection>
				| SQL
				| ((qb: DSQLDatabase<TSchema, TRelations>) => TypedQueryBuilder<TSelection> | SQL),
		) => WithSubqueryWithSelection<TSelection, TAlias>;
	} {
		const self = this;
		return {
			as<TSelection extends ColumnsSelection>(
				qb:
					| TypedQueryBuilder<TSelection>
					| SQL
					| ((qb: DSQLDatabase<TSchema, TRelations>) => TypedQueryBuilder<TSelection> | SQL),
			): WithSubqueryWithSelection<TSelection, TAlias> {
				if (typeof qb === 'function') {
					qb = qb(self);
				}

				const selectedFields = 'getSelectedFields' in qb
					? (qb.getSelectedFields() ?? {}) as TSelection
					: {} as TSelection;

				return new Proxy(
					new WithSubquery(qb.getSQL(), selectedFields, alias, true),
					new SelectionProxyHandler({ alias, sqlAliasedBehavior: 'alias', sqlBehavior: 'error' }),
				) as WithSubqueryWithSelection<TSelection, TAlias>;
			},
		};
	}

	/**
	 * Incorporates a previously defined CTE (using `$with`) into the main query.
	 */
	with(...queries: WithSubquery[]) {
		const self = this;

		function select(): DSQLSelectBuilder<undefined>;
		function select<TSelection extends SelectedFields>(fields: TSelection): DSQLSelectBuilder<TSelection>;
		function select<TSelection extends SelectedFields>(
			fields?: TSelection,
		): DSQLSelectBuilder<TSelection | undefined> {
			return new DSQLSelectBuilder({
				fields: fields ?? undefined,
				session: self.session,
				dialect: self.dialect,
				withList: queries,
			}) as any;
		}

		function selectDistinct(): DSQLSelectBuilder<undefined>;
		function selectDistinct<TSelection extends SelectedFields>(fields: TSelection): DSQLSelectBuilder<TSelection>;
		function selectDistinct<TSelection extends SelectedFields>(
			fields?: TSelection,
		): DSQLSelectBuilder<TSelection | undefined> {
			return new DSQLSelectBuilder({
				fields: fields ?? undefined,
				session: self.session,
				dialect: self.dialect,
				withList: queries,
				distinct: true,
			}) as any;
		}

		function selectDistinctOn(on: (DSQLColumn | SQLWrapper)[]): DSQLSelectBuilder<undefined>;
		function selectDistinctOn<TSelection extends SelectedFields>(
			on: (DSQLColumn | SQLWrapper)[],
			fields: TSelection,
		): DSQLSelectBuilder<TSelection>;
		function selectDistinctOn<TSelection extends SelectedFields>(
			on: (DSQLColumn | SQLWrapper)[],
			fields?: TSelection,
		): DSQLSelectBuilder<TSelection | undefined> {
			return new DSQLSelectBuilder({
				fields: fields ?? undefined,
				session: self.session,
				dialect: self.dialect,
				withList: queries,
				distinct: { on },
			}) as any;
		}

		return { select, selectDistinct, selectDistinctOn };
	}

	select(): DSQLSelectBuilder<undefined>;
	select<TSelection extends SelectedFields>(fields: TSelection): DSQLSelectBuilder<TSelection>;
	select(fields?: SelectedFields): DSQLSelectBuilder<SelectedFields | undefined> {
		return new DSQLSelectBuilder({
			fields: fields as SelectedFields,
			session: this.session,
			dialect: this.dialect,
		});
	}

	/**
	 * Adds `distinct` expression to the select query.
	 *
	 * Calling this method will return only unique values. When multiple columns are selected,
	 * it returns rows with unique combinations of values in these columns.
	 *
	 * Use `.from()` method to specify which table to select from.
	 *
	 * See docs: {@link https://orm.drizzle.team/docs/select#distinct}
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
	selectDistinct(): DSQLSelectBuilder<undefined>;
	selectDistinct<TSelection extends SelectedFields>(fields: TSelection): DSQLSelectBuilder<TSelection>;
	selectDistinct(fields?: SelectedFields): DSQLSelectBuilder<SelectedFields | undefined> {
		return new DSQLSelectBuilder({
			fields: fields as SelectedFields,
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
	 * // Selects the first occurrence of each unique car brand along with its color
	 * await db.selectDistinctOn([cars.brand], { brand: cars.brand, color: cars.color })
	 *   .from(cars)
	 *   .orderBy(cars.brand, cars.color);
	 * ```
	 */
	selectDistinctOn(on: (DSQLColumn | SQLWrapper)[]): DSQLSelectBuilder<undefined>;
	selectDistinctOn<TSelection extends SelectedFields>(
		on: (DSQLColumn | SQLWrapper)[],
		fields: TSelection,
	): DSQLSelectBuilder<TSelection>;
	selectDistinctOn(
		on: (DSQLColumn | SQLWrapper)[],
		fields?: SelectedFields,
	): DSQLSelectBuilder<SelectedFields | undefined> {
		return new DSQLSelectBuilder({
			fields: fields as SelectedFields,
			session: this.session,
			dialect: this.dialect,
			distinct: { on },
		});
	}

	insert<TTable extends DSQLTable>(table: TTable): DSQLInsertBuilder<TTable> {
		return new DSQLInsertBuilder(table, this.session, this.dialect);
	}

	update<TTable extends DSQLTable>(table: TTable): DSQLUpdateBuilder<TTable> {
		return new DSQLUpdateBuilder(table, this.session, this.dialect);
	}

	delete<TTable extends DSQLTable>(table: TTable): DSQLDeleteBase<TTable, any, undefined> {
		return new DSQLDeleteBase(table, this.session, this.dialect);
	}

	execute<T extends Record<string, unknown> = Record<string, unknown>>(
		query: SQLWrapper,
	): Promise<QueryResult<T>> {
		const sql = query.getSQL();
		const builtQuery = this.dialect.sqlToQuery(sql);
		return this.session.execute(builtQuery);
	}

	transaction<T>(
		transaction: (tx: DSQLTransaction<TSchema, TRelations, any>) => Promise<T>,
		config?: { accessMode?: 'read only' | 'read write' },
	): Promise<T> {
		return this.session.transaction(transaction, config);
	}
}

export interface DSQLConnectionConfig {
	endpoint: string;
	user?: string;
	region?: string;
	// AWS credentials would typically come from environment/IAM
}

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends DSQLClient = DSQLClient,
>(
	client: TClient,
	config: DrizzleConfig<TSchema, TRelations> = {},
): DSQLDatabase<TSchema, TRelations> & {
	$client: TClient;
} {
	const dialect = new DSQLDialect({ casing: config.casing });
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	let schema: V1.RelationalSchemaConfig<V1.TablesRelationalConfig> | undefined;
	if (config.schema) {
		const tablesConfig = V1.extractTablesRelationalConfig(
			config.schema,
			V1.createTableRelationsHelpers,
		);
		schema = {
			fullSchema: config.schema,
			schema: tablesConfig.tables,
			tableNamesMap: tablesConfig.tableNamesMap,
		};
	}

	const relations = config.relations ?? {};
	const session = new DSQLDriverSession(client, dialect, relations, schema, {
		logger,
		cache: config.cache,
	});

	const db = new DSQLDatabase(
		dialect,
		session,
		relations,
		schema as V1.RelationalSchemaConfig<any>,
	) as DSQLDatabase<TSchema>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends DSQLClient = DSQLClient,
>(
	...params:
		| [
			TClient,
		]
		| [
			TClient,
			DrizzleConfig<TSchema, TRelations>,
		]
		| [
			& DrizzleConfig<TSchema, TRelations>
			& {
				client: TClient;
			},
		]
		| [
			& DrizzleConfig<TSchema, TRelations>
			& {
				connection: DSQLConnectionConfig;
			},
		]
): DSQLDatabase<TSchema, TRelations> & {
	$client: TClient;
} {
	// Handle different overload patterns
	if (typeof params[0] === 'object' && params[0] !== null && 'connection' in params[0]) {
		const { connection, ...drizzleConfig } = params[0] as (
			& { connection: DSQLConnectionConfig }
			& DrizzleConfig<TSchema, TRelations>
		);
		// Create DSQL client from connection config
		const client = createDSQLClient(connection);
		return construct(client as TClient, drizzleConfig);
	}

	if (typeof params[0] === 'object' && params[0] !== null && 'client' in params[0]) {
		const { client, ...drizzleConfig } = params[0] as (
			& { client: TClient }
			& DrizzleConfig<TSchema, TRelations>
		);
		return construct(client, drizzleConfig);
	}

	// Direct client passed
	return construct(params[0] as TClient, params[1] as DrizzleConfig<TSchema, TRelations> | undefined) as any;
}

function createDSQLClient(config: DSQLConnectionConfig): DSQLClient {
	// Dynamic import to avoid bundling issues when the package isn't installed
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { AuroraDSQLPool } = require('@aws/aurora-dsql-node-postgres-connector');
	return new AuroraDSQLPool({
		host: config.endpoint,
		user: config.user ?? 'admin',
	});
}

export namespace drizzle {
	export function mock<
		TSchema extends Record<string, unknown> = Record<string, never>,
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzleConfig<TSchema, TRelations>,
	): DSQLDatabase<TSchema, TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
