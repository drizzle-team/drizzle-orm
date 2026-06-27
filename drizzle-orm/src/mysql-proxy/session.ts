import type { FieldPacket, ResultSetHeader } from 'mysql2/promise';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import { MySqlAsyncPreparedQuery, MySqlAsyncSession, type MySqlAsyncTransaction } from '~/mysql-core/async/session.ts';
import type { MySqlDialect } from '~/mysql-core/dialect.ts';
import type {
	AnyMySqlMapper,
	MySqlPreparedQueryConfig,
	MySqlQueryResultHKT,
	MySqlTransactionConfig,
} from '~/mysql-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query } from '~/sql/sql.ts';
import type { RemoteCallback } from './driver.ts';

export type MySqlRawQueryResult = [ResultSetHeader, FieldPacket[]];

export interface MySqlRemoteSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export class MySqlRemoteSession<
	TRelations extends AnyRelations,
> extends MySqlAsyncSession<
	MySqlRemoteQueryResultHKT,
	TRelations
> {
	static override readonly [entityKind]: string = 'MySqlRemoteSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: RemoteCallback,
		dialect: MySqlDialect,
		private relations: TRelations,
		private options: MySqlRemoteSessionOptions,
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<T extends MySqlPreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		mapper?: AnyMySqlMapper,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): MySqlAsyncPreparedQuery<T> {
		const executor = async (params: any[] = []) => {
			const raw = this.client(query.sql, params, mode === 'arrays' ? 'all' : 'execute');

			if (mode === 'objects') return raw.then(({ rows }) => rows[0]);
			if (mode === 'arrays' || !mapper) return raw.then(({ rows }) => rows);
			return raw.then(({ rows, insertId, affectedRows }) => ({
				// Backwards compat with old implementation (types remain unaffected)
				insertId: insertId ?? rows[0]?.insertId,
				affectedRows: affectedRows ?? rows[0]?.affectedRows,
			}));
		};

		return new MySqlAsyncPreparedQuery(
			executor,
			undefined,
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
		_transaction: (tx: MySqlAsyncTransaction<MySqlRemoteQueryResultHKT, TRelations>) => Promise<T>,
		_config?: MySqlTransactionConfig,
	): Promise<T> {
		throw new Error('Transactions are not supported by the MySql Proxy driver');
	}
}

export interface MySqlRemoteQueryResultHKT extends MySqlQueryResultHKT {
	type: MySqlRawQueryResult;
}
