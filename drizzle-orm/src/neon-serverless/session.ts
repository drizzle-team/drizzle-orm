import {
	type Client,
	type CustomTypesConfig,
	Pool,
	type PoolClient,
	type QueryResult,
	type QueryResultRow,
	types,
} from '@neondatabase/serverless';
import { type Cache, NoopCache } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import { PgAsyncPreparedQuery, PgAsyncSession, PgAsyncTransaction } from '~/pg-core/async/session.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import { preparedStatementName } from '~/query-name-generator.ts';
import type { AnyRelations } from '~/relations.ts';
import { type Query, sql } from '~/sql/sql.ts';
import type { Assume } from '~/utils.ts';

export type NeonClient = Pool | PoolClient | Client;

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
				return types.getTypeParser(typeId, format as any);
		}
	}),
};

export interface NeonSessionOptions {
	logger?: Logger;
	cache?: Cache;
	paramsInErrors?: boolean;
}

export class NeonSession<TRelations extends AnyRelations> extends PgAsyncSession<NeonQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'NeonSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: NeonClient,
		dialect: PgDialect,
		private relations: TRelations,
		private options: NeonSessionOptions = {},
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
	): PgAsyncPreparedQuery<T> {
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
			this.options.paramsInErrors,
		);
	}

	override async transaction<T>(
		transaction: (tx: NeonTransaction<TRelations>) => Promise<T>,
		config: PgTransactionConfig = {},
	): Promise<T> {
		const poolClient = this.client instanceof Pool // oxlint-disable-line drizzle-internal/no-instanceof
			? await this.client.connect()
			: undefined;
		// pool detaches its own `error` listener from checked-out clients, so a connection dropped mid-transaction would crash the process
		let connectionError: Error | undefined;
		let rollbackError: Error | undefined;
		const onConnectionError = (e: Error) => {
			connectionError ??= e;
		};
		poolClient?.on('error', onConnectionError);
		const release = () => {
			if (!poolClient) return;
			// broken client is destroyed by the pool, listener stays to absorb any trailing errors
			if (!connectionError) poolClient.off('error', onConnectionError);
			poolClient.release(connectionError ?? rollbackError);
		};
		const session = poolClient
			? new NeonSession(poolClient, this.dialect, this.relations, this.options)
			: this;
		const tx = new NeonTransaction<TRelations>(
			this.dialect,
			session,
			this.relations,
			undefined,
			false,
		);

		try {
			await tx.execute(sql`begin ${tx.getTransactionConfigSQL(config)}`);
		} catch (e) {
			release();
			throw e;
		}

		try {
			if (typeof config.snapshot === 'string') {
				await tx.execute(tx.setTransactionSnapshotSQL(config.snapshot));
			}
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
}

export class NeonTransaction<
	TRelations extends AnyRelations,
> extends PgAsyncTransaction<NeonQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'NeonTransaction';

	override async transaction<T>(
		transaction: (tx: NeonTransaction<TRelations>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new NeonTransaction<TRelations>(
			this.dialect,
			this.session,
			this._.relations,
			this.nestedIndex + 1,
			false,
		);
		await tx.execute(sql.raw(`savepoint ${savepointName}`));
		try {
			const result = await transaction(tx);
			await tx.execute(sql.raw(`release savepoint ${savepointName}`));
			return result;
		} catch (e) {
			await tx.execute(sql.raw(`rollback to savepoint ${savepointName}`)).catch(() => {});
			throw e;
		}
	}
}

export type NeonRawExecuteResult = QueryResult<Record<string, unknown>> | QueryResult<Record<string, unknown>>[];

export interface NeonQueryResultHKT extends PgQueryResultHKT {
	type: [this['row']] extends [never] ? QueryResult<never>
		: [this['row']] extends ['unknown'] ? NeonRawExecuteResult
		: QueryResult<Assume<this['row'], QueryResultRow>>;
}
