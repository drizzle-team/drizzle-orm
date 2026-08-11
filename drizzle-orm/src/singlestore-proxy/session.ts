import type { FieldPacket, ResultSetHeader } from 'mysql2/promise';
import type * as V1 from '~/_relations.ts';
import type { Cache } from '~/cache/core/index.ts';
import { NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { AnyRelations } from '~/relations.ts';
import type { SingleStoreDialect } from '~/singlestore-core/dialect.ts';
import { SingleStoreTransaction } from '~/singlestore-core/index.ts';
import type {
	AnySingleStoreMapper,
	PreparedQueryKind,
	SingleStorePreparedQueryConfig,
	SingleStorePreparedQueryHKT,
	SingleStoreQueryResultHKT,
	SingleStoreTransactionConfig,
} from '~/singlestore-core/session.ts';
import { SingleStorePreparedQuery, SingleStoreSession } from '~/singlestore-core/session.ts';
import type { Query } from '~/sql/sql.ts';
import type { Assume } from '~/utils.ts';
import type { RemoteCallback } from './driver.ts';

export type SingleStoreRawQueryResult = [ResultSetHeader, FieldPacket[]];

export interface SingleStoreRemoteSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export class SingleStoreRemoteSession<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends SingleStoreSession<
	SingleStoreRemoteQueryResultHKT,
	SingleStoreRemotePreparedQueryHKT,
	TFullSchema,
	TRelations,
	TSchema
> {
	static override readonly [entityKind]: string = 'SingleStoreRemoteSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: RemoteCallback,
		dialect: SingleStoreDialect,
		private relations: TRelations,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		private options: SingleStoreRemoteSessionOptions,
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<T extends SingleStorePreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		mapper?: AnySingleStoreMapper,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): PreparedQueryKind<SingleStoreRemotePreparedQueryHKT, T> {
		const { client } = this;

		const executor = async (params: unknown[] = []) => {
			const raw = client(query.sql, params, mode === 'arrays' ? 'all' : 'execute');

			if (mode === 'objects') return raw.then(({ rows }) => rows[0]);
			if (mode === 'arrays' || !mapper) return raw.then(({ rows }) => rows);

			return raw.then(({ rows }) => ({
				insertId: rows[0]?.insertId,
				affectedRows: rows[0]?.affectedRows,
			}));
		};

		return new SingleStorePreparedQuery(
			executor,
			undefined,
			query,
			mapper,
			mode,
			this.logger,
			this.cache,
			queryMetadata,
			cacheConfig,
		) as PreparedQueryKind<SingleStoreRemotePreparedQueryHKT, T>;
	}

	override async transaction<T>(
		_transaction: (tx: SingleStoreProxyTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
		_config?: SingleStoreTransactionConfig,
	): Promise<T> {
		throw new Error('Transactions are not supported by the SingleStore Proxy driver');
	}
}

export class SingleStoreProxyTransaction<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends SingleStoreTransaction<
	SingleStoreRemoteQueryResultHKT,
	SingleStoreRemotePreparedQueryHKT,
	TFullSchema,
	TRelations,
	TSchema
> {
	static override readonly [entityKind]: string = 'SingleStoreProxyTransaction';

	override async transaction<T>(
		_transaction: (tx: SingleStoreProxyTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
	): Promise<T> {
		throw new Error('Transactions are not supported by the SingleStore Proxy driver');
	}
}

export interface SingleStoreRemoteQueryResultHKT extends SingleStoreQueryResultHKT {
	type: SingleStoreRawQueryResult;
}

export interface SingleStoreRemotePreparedQueryHKT extends SingleStorePreparedQueryHKT {
	type: SingleStorePreparedQuery<Assume<this['config'], SingleStorePreparedQueryConfig>>;
}
