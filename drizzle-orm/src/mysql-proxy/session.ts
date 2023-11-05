import type { FieldPacket, ResultSetHeader } from 'mysql2/promise';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { MySqlDialect } from '~/mysql-core/dialect.ts';
import { MySqlTransaction } from '~/mysql-core/index.ts';
import type { SelectedFieldsOrdered } from '~/mysql-core/query-builders/select.types.ts';
import type {
	MySqlTransactionConfig,
	PreparedQueryConfig,
	PreparedQueryHKT,
	PreparedQueryKind,
	QueryResultHKT,
} from '~/mysql-core/session.ts';
import { MySqlSession, PreparedQuery as PreparedQueryBase } from '~/mysql-core/session.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders } from '~/sql/sql.ts';
import type { Query, SQL } from '~/sql/sql.ts';
import { type Assume, mapResultRow } from '~/utils.ts';
import type { RemoteCallback } from './driver.ts';

export type MySqlRawQueryResult = [ResultSetHeader, FieldPacket[]];

export interface MySqlRemoteSessionOptions {
	logger?: Logger;
}

export class MySqlRemoteSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends MySqlSession<MySqlRemoteQueryResultHKT, MySqlRemotePreparedQueryHKT, TFullSchema, TSchema> {
	static readonly [entityKind]: string = 'MySqlRemoteSession';

	private logger: Logger;

	constructor(
		private client: RemoteCallback,
		dialect: MySqlDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		options: MySqlRemoteSessionOptions,
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery<T extends PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		customResultMapper?: (rows: unknown[][]) => T['execute'],
	): PreparedQueryKind<MySqlRemotePreparedQueryHKT, T> {
		return new PreparedQuery(
			this.client,
			query.sql,
			query.params,
			this.logger,
			fields,
			customResultMapper,
		) as PreparedQueryKind<MySqlRemotePreparedQueryHKT, T>;
	}

	override all<T = unknown>(query: SQL): Promise<T[]> {
		const querySql = this.dialect.sqlToQuery(query);
		this.logger.logQuery(querySql.sql, querySql.params);
		return this.client(querySql.sql, querySql.params, 'all').then(({ rows }) => rows) as Promise<T[]>;
	}

	override async transaction<T>(
		_transaction: (tx: MySqlProxyTransaction<TFullSchema, TSchema>) => Promise<T>,
		_config?: MySqlTransactionConfig,
	): Promise<T> {
		throw new Error('Transactions are not supported by the MySql Proxy driver');
	}
}

export class MySqlProxyTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends MySqlTransaction<MySqlRemoteQueryResultHKT, MySqlRemotePreparedQueryHKT, TFullSchema, TSchema> {
	static readonly [entityKind]: string = 'MySqlProxyTransaction';

	override async transaction<T>(
		_transaction: (tx: MySqlProxyTransaction<TFullSchema, TSchema>) => Promise<T>,
	): Promise<T> {
		throw new Error('Transactions are not supported by the MySql Proxy driver');
	}
}

export class PreparedQuery<T extends PreparedQueryConfig> extends PreparedQueryBase<T> {
	static readonly [entityKind]: string = 'MySqlProxyPreparedQuery';

	constructor(
		private client: RemoteCallback,
		private queryString: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
		private customResultMapper?: (rows: unknown[][]) => T['execute'],
	) {
		super();
	}

	async execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		const params = fillPlaceholders(this.params, placeholderValues);

		const { fields, client, queryString, logger, joinsNotNullableMap, customResultMapper } = this;

		logger.logQuery(queryString, params);

		if (!fields && !customResultMapper) {
			const { rows } = await client(queryString, params, 'execute');

			return rows;
		}

		const { rows } = await client(queryString, params, 'all');

		if (customResultMapper) {
			return customResultMapper(rows);
		}

		return rows.map((row) => mapResultRow<T['execute']>(fields!, row, joinsNotNullableMap));
	}

	override iterator(
		_placeholderValues: Record<string, unknown> = {},
	): AsyncGenerator<T['iterator']> {
		throw new Error('Streaming is not supported by the MySql Proxy driver');
	}
}

export interface MySqlRemoteQueryResultHKT extends QueryResultHKT {
	type: MySqlRawQueryResult;
}

export interface MySqlRemotePreparedQueryHKT extends PreparedQueryHKT {
	type: PreparedQuery<Assume<this['config'], PreparedQueryConfig>>;
}
