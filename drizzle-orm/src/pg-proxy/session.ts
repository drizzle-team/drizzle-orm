import type * as V1 from '~/_relations.ts';
import { type Cache, NoopCache } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import { PgAsyncPreparedQuery, PgAsyncSession, type PgAsyncTransaction } from '~/pg-core/async/session.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { QueryWithTypings } from '~/sql/sql.ts';
import type { Assume } from '~/utils.ts';
import type { RemoteCallback } from './driver.ts';

export interface PgRemoteSessionOptions {
	logger?: Logger;
	cache?: Cache;
	useJitMapper?: boolean;
}

export class PgRemoteSession<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends PgAsyncSession<PgRemoteQueryResultHKT, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'PgRemoteSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: RemoteCallback,
		dialect: PgDialect,
		private relations: TRelations,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		private options: PgRemoteSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: QueryWithTypings,
		mode: 'arrays' | 'objects' | 'raw',
		_name: string | boolean,
		mapper: ((rows: any[]) => any) | undefined,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	) {
		const executor = async (params?: unknown[]) => {
			return this.client(query.sql, params as any[], 'execute', query.typings);
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
		_transaction: (tx: PgAsyncTransaction<PgRemoteQueryResultHKT, TFullSchema, TRelations, TSchema>) => Promise<T>,
		_config?: PgTransactionConfig,
	): Promise<T> {
		throw new Error('Transactions are not supported by the Postgres Proxy driver');
	}
}

export interface PgRemoteQueryResultHKT extends PgQueryResultHKT {
	type: Assume<this['row'], {
		[column: string]: any;
	}>[];
}
