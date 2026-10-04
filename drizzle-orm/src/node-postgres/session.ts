import type { Client, PoolClient, QueryArrayConfig, QueryConfig, QueryResult, QueryResultRow } from 'pg';
import pg from 'pg';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgTransaction } from '~/pg-core/index.ts';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import { PgPreparedQuery, PgSession } from '~/pg-core/session.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type Query, type SQL, sql } from '~/sql/sql.ts';
import { tracer } from '~/tracing.ts';
import { type Assume, mapResultRow } from '~/utils.ts';

const { Pool, types } = pg;

export type NodePgClient = pg.Pool | PoolClient | Client;

export class NodePgPreparedQuery<T extends PreparedQueryConfig> extends PgPreparedQuery<T> {
	static override readonly [entityKind]: string = 'NodePgPreparedQuery';

	private rawQueryConfig: QueryConfig;
	private queryConfig: QueryArrayConfig;

	constructor(
		private client: NodePgClient,
		private queryString: string,
		private params: unknown[],
		private logger: Logger,
		cache: Cache,
		queryMetadata: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		} | undefined,
		cacheConfig: WithCacheConfig | undefined,
		private fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		private _isResponseInArrayMode: boolean,
		private customResultMapper?: (rows: unknown[][]) => T['execute'],
	) {
		super({ sql: queryString, params }, cache, queryMetadata, cacheConfig);
		this.rawQueryConfig = {
			name,
			text: queryString,
			types: {
				// @ts-ignore
				getTypeParser: (typeId, format) => {
					if (typeId === types.builtins.TIMESTAMPTZ) {
						return (val) => val;
					}
					if (typeId === types.builtins.TIMESTAMP) {
						return (val) => val;
					}
					if (typeId === types.builtins.DATE) {
						return (val) => val;
					}
					if (typeId === types.builtins.INTERVAL) {
						return (val) => val;
					}
					// numeric[]
					if (typeId === 1231) {
						return (val) => val;
					}
					// timestamp[]
					if (typeId === 1115) {
						return (val) => val;
					}
					// timestamp with timezone[]
					if (typeId === 1185) {
						return (val) => val;
					}
					// interval[]
					if (typeId === 1187) {
						return (val) => val;
					}
					// date[]
					if (typeId === 1182) {
						return (val) => val;
					}
					// @ts-ignore
					return types.getTypeParser(typeId, format);
				},
			},
		};
		this.queryConfig = {
			name,
			text: queryString,
			rowMode: 'array',
			types: {
				// @ts-ignore
				getTypeParser: (typeId, format) => {
					if (typeId === types.builtins.TIMESTAMPTZ) {
						return (val) => val;
					}
					if (typeId === types.builtins.TIMESTAMP) {
						return (val) => val;
					}
					if (typeId === types.builtins.DATE) {
						return (val) => val;
					}
					if (typeId === types.builtins.INTERVAL) {
						return (val) => val;
					}
					// numeric[]
					if (typeId === 1231) {
						return (val) => val;
					}
					// timestamp[]
					if (typeId === 1115) {
						return (val) => val;
					}
					// timestamp with timezone[]
					if (typeId === 1185) {
						return (val) => val;
					}
					// interval[]
					if (typeId === 1187) {
						return (val) => val;
					}
					// date[]
					if (typeId === 1182) {
						return (val) => val;
					}
					// @ts-ignore
					return types.getTypeParser(typeId, format);
				},
			},
		};
	}

	async execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		return tracer.startActiveSpan('drizzle.execute', async () => {
			const params = fillPlaceholders(this.params, placeholderValues);

			this.logger.logQuery(this.rawQueryConfig.text, params);

			const { fields, rawQueryConfig: rawQuery, client, queryConfig: query, joinsNotNullableMap, customResultMapper } =
				this;
			if (!fields && !customResultMapper) {
				return tracer.startActiveSpan('drizzle.driver.execute', async (span) => {
					span?.setAttributes({
						'drizzle.query.name': rawQuery.name,
						'drizzle.query.text': rawQuery.text,
						'drizzle.query.params': JSON.stringify(params),
					});
					return this.queryWithCache(rawQuery.text, params, async () => {
						return await client.query(rawQuery, params);
					});
				});
			}

			const result = await tracer.startActiveSpan('drizzle.driver.execute', (span) => {
				span?.setAttributes({
					'drizzle.query.name': query.name,
					'drizzle.query.text': query.text,
					'drizzle.query.params': JSON.stringify(params),
				});
				return this.queryWithCache(query.text, params, async () => {
					return await client.query(query, params);
				});
			});

			return tracer.startActiveSpan('drizzle.mapResponse', () => {
				return customResultMapper
					? customResultMapper(result.rows)
					: result.rows.map((row) => mapResultRow<T['execute']>(fields!, row, joinsNotNullableMap));
			});
		});
	}

	all(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['all']> {
		return tracer.startActiveSpan('drizzle.execute', () => {
			const params = fillPlaceholders(this.params, placeholderValues);
			this.logger.logQuery(this.rawQueryConfig.text, params);
			return tracer.startActiveSpan('drizzle.driver.execute', (span) => {
				span?.setAttributes({
					'drizzle.query.name': this.rawQueryConfig.name,
					'drizzle.query.text': this.rawQueryConfig.text,
					'drizzle.query.params': JSON.stringify(params),
				});
				return this.queryWithCache(this.rawQueryConfig.text, params, async () => {
					return this.client.query(this.rawQueryConfig, params);
				}).then((result) => result.rows);
			});
		});
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}
}

export interface NodePgSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export class NodePgSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends PgSession<NodePgQueryResultHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'NodePgSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: NodePgClient,
		dialect: PgDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		private options: NodePgSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		isResponseInArrayMode: boolean,
		customResultMapper?: (rows: unknown[][]) => T['execute'],
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): PgPreparedQuery<T> {
		return new NodePgPreparedQuery(
			this.client,
			query.sql,
			query.params,
			this.logger,
			this.cache,
			queryMetadata,
			cacheConfig,
			fields,
			name,
			isResponseInArrayMode,
			customResultMapper,
		);
	}

	override async transaction<T>(
		transaction: (tx: NodePgTransaction<TFullSchema, TSchema>) => Promise<T>,
		config?: PgTransactionConfig | undefined,
	): Promise<T> {
		const isPool = this.client instanceof Pool || Object.getPrototypeOf(this.client).constructor.name.includes('Pool'); // eslint-disable-line no-instanceof/no-instanceof
		const poolClient = isPool ? await (<pg.Pool> this.client).connect() : undefined;
		// pg-pool detaches its own `error` listener from checked-out clients, so a connection dropped mid-transaction would crash the process
		let connectionError: Error | undefined;
		let rollbackError: Error | undefined;
		const onConnectionError = (e: Error) => {
			connectionError = connectionError ?? e;
		};
		poolClient?.on('error', onConnectionError);
		const release = (failure?: Error) => {
			if (!poolClient) return;
			// broken client is destroyed by the pool, listener stays to absorb any trailing errors
			if (!connectionError) poolClient.off('error', onConnectionError);
			poolClient.release(connectionError ?? rollbackError ?? failure);
		};
		const session = poolClient
			? new NodePgSession(poolClient, this.dialect, this.schema, this.options)
			: this;
		const tx = new NodePgTransaction<TFullSchema, TSchema>(this.dialect, session, this.schema);

		try {
			await tx.execute(sql`begin${config ? sql` ${tx.getTransactionConfigSQL(config)}` : undefined}`);
		} catch (e) {
			// `begin` may still reach the server after failing on the client, session state is unknown so the client must not be reused
			release(e as Error);
			throw e;
		}

		try {
			const result = await transaction(tx);
			await tx.execute(sql`commit`);
			return result;
		} catch (error) {
			// nothing to roll back on a dead connection; failed rollback must not mask the original error
			if (!connectionError) {
				await tx.execute(sql`rollback`).catch((e) => {
					rollbackError = e;
				});
			}
			throw error;
		} finally {
			release();
		}
	}

	override async count(sql: SQL): Promise<number> {
		const res = await this.execute<{ rows: [{ count: string }] }>(sql);
		return Number(
			res['rows'][0]['count'],
		);
	}
}

export class NodePgTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends PgTransaction<NodePgQueryResultHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'NodePgTransaction';

	override async transaction<T>(transaction: (tx: NodePgTransaction<TFullSchema, TSchema>) => Promise<T>): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new NodePgTransaction<TFullSchema, TSchema>(
			this.dialect,
			this.session,
			this.schema,
			this.nestedIndex + 1,
		);
		await tx.execute(sql.raw(`savepoint ${savepointName}`));
		try {
			const result = await transaction(tx);
			await tx.execute(sql.raw(`release savepoint ${savepointName}`));
			return result;
		} catch (err) {
			await tx.execute(sql.raw(`rollback to savepoint ${savepointName}`)).catch(() => {});
			throw err;
		}
	}
}

export interface NodePgQueryResultHKT extends PgQueryResultHKT {
	type: QueryResult<Assume<this['row'], QueryResultRow>>;
}
