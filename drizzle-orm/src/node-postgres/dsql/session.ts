import type { AuroraDSQLClient, AuroraDSQLPool, OCCRetryConfig } from '@aws/aurora-dsql-node-postgres-connector';
import type { CustomTypesConfig, PoolClient, QueryResult, QueryResultRow } from 'pg';
import pg from 'pg';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import {
	DsqlAsyncSession,
	DsqlAsyncTransaction,
	type DsqlOccConfig,
	type DsqlTransactionConfig,
	surfaceDsqlOccCode,
} from '~/pg-core/async/dsql/session.ts';
import { PgAsyncPreparedQuery } from '~/pg-core/async/session.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { PgQueryResultHKT } from '~/pg-core/session.ts';
import type { PreparedQueryConfig } from '~/pg-core/session.ts';
import { preparedStatementName } from '~/query-name-generator.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query } from '~/sql/sql.ts';
import type { Assume } from '~/utils.ts';

const { types } = pg;
export type NodePgDsqlClient = AuroraDSQLPool | AuroraDSQLClient;

const noop = (val: any) => val;

const typeConfig: CustomTypesConfig = {
	getTypeParser: <CustomTypesConfig['getTypeParser']> ((typeId, format) => {
		switch (typeId as number) {
			case types.builtins.TIMESTAMPTZ:
			case types.builtins.TIMESTAMP:
			case types.builtins.DATE:
			case types.builtins.INTERVAL:
			case 1231: // numeric[]
			case 1115: // timestamp[]
			case 1185: // timestamp with timezone[]
			case 1187: // interval[]
			case 1182: // date[]
				return noop;
			default:
				return types.getTypeParser(typeId, format);
		}
	}),
};

/**
 * Retries of a whole transaction on optimistic concurrency conflicts (`OC000`, `OC001`, `40001`)
 *
 * Delays grow exponentially from `baseDelayMs` up to `maxDelayMs`, each one extended by up to `jitterFactor` of itself.
 * The driver validates the values and fills the omitted ones with its defaults.
 */
export interface NodePgDsqlOccConfig extends DsqlOccConfig {
	/** Retries after the first attempt - `3` by default, `0` to `100`, `0` disables retries */
	maxRetries?: number | undefined;
	/** Delay before the first retry - `1` by default, greater than `0` */
	baseDelayMs?: number | undefined;
	/** Upper bound the growing delays are capped at - `100` by default, at most `100`, not less than `baseDelayMs` */
	maxDelayMs?: number | undefined;
	/** Share of a delay that is added to it at random - `0.25` by default, `0` to `1` */
	jitterFactor?: number | undefined;
}

export interface NodePgDsqlTransactionConfig extends DsqlTransactionConfig {
	/**
	 * Re-run the transaction when it fails on an optimistic concurrency conflict:
	 * - `true` - retry with the driver's defaults (see {@link NodePgDsqlOccConfig})
	 * - {@link NodePgDsqlOccConfig} - retry with these values, over the `retry` config of the client
	 * - `false` or `undefined` - don't retry
	 *
	 * The callback may be invoked several times, so it must be idempotent: no side effects outside the transaction that must not repeat.
	 */
	occ?: boolean | NodePgDsqlOccConfig | undefined;
}

export interface NodePgDsqlSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export class NodePgDsqlSession<
	TRelations extends AnyRelations,
> extends DsqlAsyncSession<NodePgDsqlQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'NodePgDsqlSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		/** `PoolClient` only comes from the pool's own `transaction()`, never from drizzle constructor */
		private client: NodePgDsqlClient | PoolClient,
		dialect: PgDialect,
		private relations: TRelations,
		private options: NodePgDsqlSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		name: string | boolean,
		mapper: ((rows: any[]) => any) | undefined,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	) {
		const queryName = typeof name === 'string'
			? name
			: name === true
			? preparedStatementName(query.sql, query.params)
			: undefined;

		const executor = async (params?: unknown[]) => {
			return this.client.query({
				name: queryName,
				rowMode: mode === 'arrays' ? 'array' : undefined as any,
				text: query.sql,
				types: typeConfig,
			}, params).then((r) => mode === 'raw' ? r : r.rows);
		};

		return new PgAsyncPreparedQuery<T>(
			executor,
			query,
			mapper,
			mode,
			this.logger,
			this.cache,
			queryMetadata,
			cacheConfig,
		);
	}

	override async transaction<T>(
		transaction: (tx: NodePgDsqlTransaction<TRelations>) => Promise<T>,
		config: NodePgDsqlTransactionConfig | undefined,
	): Promise<T> {
		const occ = config?.occ;
		const retry: Partial<OCCRetryConfig> | undefined = occ
			? typeof occ === 'object' ? occ : undefined
			: { maxRetries: 0 };

		let session: NodePgDsqlSession<TRelations> | undefined;
		let tx: NodePgDsqlTransaction<TRelations> | undefined;

		return (<AuroraDSQLPool> this.client).transaction(async (client: NodePgDsqlClient | PoolClient) => {
			if (session) {
				session.client = client;
			} else {
				session = client === this.client
					? this
					: new NodePgDsqlSession(client, this.dialect, this.relations, this.options);
				tx = new NodePgDsqlTransaction<TRelations>(this.dialect, session, this.relations, false);
			}

			return transaction(tx!).catch(surfaceDsqlOccCode);
		}, retry) as Promise<T>;
	}
}

export class NodePgDsqlTransaction<
	TRelations extends AnyRelations,
> extends DsqlAsyncTransaction<NodePgDsqlQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'NodePgDsqlTransaction';
}

export interface NodePgDsqlQueryResultHKT extends PgQueryResultHKT {
	type: QueryResult<Assume<this['row'], QueryResultRow>>;
}
