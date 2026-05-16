import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { MySqlDialect } from '~/mysql-core/dialect.ts';
import type { SelectedFieldsOrdered } from '~/mysql-core/query-builders/select.types.ts';
import {
	type Mode,
	MySqlPreparedQuery,
	type MySqlPreparedQueryConfig,
	type MySqlPreparedQueryHKT,
	type MySqlQueryResultHKT,
	MySqlSession,
	MySqlTransaction,
	type MySqlTransactionConfig,
	type PreparedQueryKind,
} from '~/mysql-core/session.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, sql } from '~/sql/sql.ts';
import type { Query, SQL } from '~/sql/sql.ts';
import { type Assume, mapResultRow } from '~/utils.ts';
import type { Connection, Pool, PoolConnection, QueryOptions, UpsertResult } from 'mariadb';

export type NodeMariaDbClient = Connection | Pool;

export class NodeMariaDbPreparedQuery<T extends MySqlPreparedQueryConfig> extends MySqlPreparedQuery<T> {
	static override readonly [entityKind]: string = 'NodeMariaDbPreparedQuery';

	private rawQuery: QueryOptions;
	private query: QueryOptions;

	constructor(
		private client: NodeMariaDbClient,
		private queryString: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
		private customResultMapper?: (rows: unknown[][]) => T['execute'],
	) {
		super(undefined, undefined, undefined);
		this.rawQuery = {
			sql: queryString,
			dateStrings: true,
		};
		this.query = {
			sql: queryString,
			rowsAsArray: true,
			dateStrings: true,
		};
	}

	async execute(placeholderValues: Record<string, unknown> = {}): Promise<T['execute']> {
		const params = fillPlaceholders(this.params, placeholderValues);

		this.logger.logQuery(this.queryString, params);

		const { fields, client, rawQuery, query, joinsNotNullableMap, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			return client.query(rawQuery, params);
		}

		const rows = await client.query<any[]>(query, params);

		if (customResultMapper) {
			return customResultMapper(rows);
		}

		return rows.map((row) => mapResultRow<T['execute']>(fields!, row, joinsNotNullableMap));
	}

	override iterator(_placeholderValues?: Record<string, unknown>): AsyncGenerator<T['iterator']> {
		throw new Error('Streaming is not supported by the Node MariaDB driver');
	}
}

export interface NodeMariaDbSessionOptions {
	logger?: Logger;
}

export class NodeMariaDbSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends MySqlSession<NodeMariaDbQueryResultHKT, NodeMariaDbPreparedQueryHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'NodeMariaDbSession';

	private logger: Logger;

	constructor(
		private client: NodeMariaDbClient,
		dialect: MySqlDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		private options: NodeMariaDbSessionOptions,
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery<T extends MySqlPreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		customResultMapper?: (rows: unknown[][]) => T['execute'],
	): PreparedQueryKind<NodeMariaDbPreparedQueryHKT, T> {
		return new NodeMariaDbPreparedQuery(
			this.client,
			query.sql,
			query.params,
			this.logger,
			fields,
			customResultMapper,
		) as PreparedQueryKind<NodeMariaDbPreparedQueryHKT, T>;
	}

	async query(query: string, params: unknown[]): Promise<UpsertResult | any[]> {
		this.logger.logQuery(query, params);
		const result = await this.client.query({
			sql: query,
			rowsAsArray: true,
			dateStrings: true,
		}, params);
		return result;
	}

	override all<T = unknown>(query: SQL): Promise<T[]> {
		const querySql = this.dialect.sqlToQuery(query);
		this.logger.logQuery(querySql.sql, querySql.params);
		return this.client.execute(querySql.sql, querySql.params).then((result) => result) as Promise<T[]>;
	}

	override async transaction<T>(
		transaction: (tx: NodeMariaDbTransaction<TFullSchema, TSchema>) => Promise<T>,
		config?: MySqlTransactionConfig,
	): Promise<T> {
		const session = isPool(this.client)
			? new NodeMariaDbSession(await this.client.getConnection(), this.dialect, this.schema, this.options)
			: this;
		const tx = new NodeMariaDbTransaction<TFullSchema, TSchema>(
			this.dialect,
			session as MySqlSession<any, any, any, any>,
			this.schema,
			0,
			'planetscale',
		);
		if (config) {
			const setTransactionConfigSql = this.getSetTransactionSQL(config);
			if (setTransactionConfigSql) {
				await tx.execute(setTransactionConfigSql);
			}
			const startTransactionSql = this.getStartTransactionSQL(config);
			await (startTransactionSql ? tx.execute(startTransactionSql) : tx.execute(sql`begin`));
		} else {
			await tx.execute(sql`begin`);
		}
		try {
			const result = await transaction(tx);
			await tx.execute(sql`commit`);
			return result;
		} catch (err) {
			await tx.execute(sql`rollback`);
			throw err;
		} finally {
			if (isPool(this.client)) {
				(session.client as PoolConnection).release();
			}
		}
	}
}

export class NodeMariaDbTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends MySqlTransaction<NodeMariaDbQueryResultHKT, NodeMariaDbPreparedQueryHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'NodeMariaDbTransaction';

	override async transaction<T>(
		transaction: (tx: NodeMariaDbTransaction<TFullSchema, TSchema>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new NodeMariaDbTransaction<TFullSchema, TSchema>(
			this.dialect,
			this.session,
			this.schema,
			this.nestedIndex + 1,
			this.mode,
		);
		await tx.execute(sql.raw(`savepoint ${savepointName}`));
		try {
			const result = await transaction(tx);
			await tx.execute(sql.raw(`release savepoint ${savepointName}`));
			return result;
		} catch (err) {
			await tx.execute(sql.raw(`rollback to savepoint ${savepointName}`));
			throw err;
		}
	}
}

function isPool(client: NodeMariaDbClient): client is Pool {
	return 'getConnection' in client;
}

export interface NodeMariaDbQueryResultHKT extends MySqlQueryResultHKT {
	type: UpsertResult | any[];
}

export interface NodeMariaDbPreparedQueryHKT extends MySqlPreparedQueryHKT {
	type: NodeMariaDbPreparedQuery<Assume<this['config'], MySqlPreparedQueryConfig>>;
}
