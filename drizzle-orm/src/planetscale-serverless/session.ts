import type { Connection, ExecutedQuery, Transaction } from '@planetscale/database';
import type { Logger } from '~/logger';
import { NoopLogger } from '~/logger';
import type { MySqlDialect } from '~/mysql-core/dialect';
import type { SelectedFieldsOrdered } from '~/mysql-core/query-builders/select.types';
import {
	MySqlSession,
	MySqlTransaction,
	PreparedQuery,
	type PreparedQueryConfig,
	type PreparedQueryHKT,
	type QueryResultHKT,
} from '~/mysql-core/session';
import { type RelationalSchemaConfig, type TablesRelationalConfig } from '~/relations';
import { fillPlaceholders, type Query, type SQL, sql } from '~/sql';
import { type Assume, mapResultRow } from '~/utils';

export type PlanetScaleConnection = Connection;

export class PlanetScalePreparedQuery<T extends PreparedQueryConfig> extends PreparedQuery<T> {
	private rawQuery = { as: 'object' } as const;
	private query = { as: 'array' } as const;

	constructor(
		private client: PlanetScaleConnection | Transaction,
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

		this.logger.logQuery(this.queryString, params);

		const { fields, client, queryString, rawQuery, query, joinsNotNullableMap, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			return client.execute(queryString, params, rawQuery);
		}

		const { rows } = await client.execute(queryString, params, query);

		if (customResultMapper) {
			return customResultMapper(rows as unknown[][]);
		}

		return rows.map((row) => mapResultRow<T['execute']>(fields!, row as unknown[], joinsNotNullableMap));
	}

	override iterator(_placeholderValues?: Record<string, unknown>): AsyncGenerator<T['iterator']> {
		throw new Error('Streaming is not supported by the PlanetScale Serverless driver');
	}
}

export interface PlanetscaleSessionOptions {
	logger?: Logger;
}

export class PlanetscaleSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends MySqlSession<PlanetscaleQueryResultHKT, PlanetScalePreparedQueryHKT, TFullSchema, TSchema> {
	private logger: Logger;
	private client: PlanetScaleConnection | Transaction;

	constructor(
		private baseClient: PlanetScaleConnection,
		dialect: MySqlDialect,
		tx: Transaction | undefined,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		private options: PlanetscaleSessionOptions = {},
	) {
		super(dialect);
		this.client = tx ?? baseClient;
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		customResultMapper?: (rows: unknown[][]) => T['execute'],
	): PreparedQuery<T> {
		return new PlanetScalePreparedQuery(this.client, query.sql, query.params, this.logger, fields, customResultMapper);
	}

	async query(query: string, params: unknown[]): Promise<ExecutedQuery> {
		this.logger.logQuery(query, params);

		return await this.client.execute(query, params, { as: 'array' });
	}

	async queryObjects(
		query: string,
		params: unknown[],
	): Promise<ExecutedQuery> {
		return this.client.execute(query, params, { as: 'object' });
	}

	override all<T = unknown>(query: SQL<unknown>): Promise<T[]> {
		const querySql = this.dialect.sqlToQuery(query);
		this.logger.logQuery(querySql.sql, querySql.params);
		return this.client.execute(querySql.sql, querySql.params, { as: 'object' }).then((eQuery) => eQuery.rows as T[]);
	}

	override transaction<T>(
		transaction: (tx: PlanetScaleTransaction<TFullSchema, TSchema>) => Promise<T>,
	): Promise<T> {
		return this.baseClient.transaction((pstx) => {
			const session = new PlanetscaleSession(this.baseClient, this.dialect, pstx, this.schema, this.options);
			const tx = new PlanetScaleTransaction(this.dialect, session as MySqlSession<any, any, any, any>, this.schema);
			return transaction(tx);
		});
	}
}

export class PlanetScaleTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends MySqlTransaction<PlanetscaleQueryResultHKT, PlanetScalePreparedQueryHKT, TFullSchema, TSchema> {
	override async transaction<T>(
		transaction: (tx: PlanetScaleTransaction<TFullSchema, TSchema>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new PlanetScaleTransaction(this.dialect, this.session, this.schema, this.nestedIndex + 1);
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

export interface PlanetscaleQueryResultHKT extends QueryResultHKT {
	type: ExecutedQuery;
}

export interface PlanetScalePreparedQueryHKT extends PreparedQueryHKT {
	type: PlanetScalePreparedQuery<Assume<this['config'], PreparedQueryConfig>>;
}
