import type { FieldPacket, ResultSetHeader } from 'mysql2/promise';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { MySqlDialect } from '~/mysql-core/dialect.ts';
import type { MySqlTransaction } from '~/mysql-core/index.ts';
import type {
	AnyMySqlMapper,
	MySqlPreparedQueryConfig,
	MySqlQueryResultHKT,
	MySqlTransactionConfig,
} from '~/mysql-core/session.ts';
import { MySqlPreparedQuery, MySqlSession } from '~/mysql-core/session.ts';
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
> extends MySqlSession<
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
	): MySqlPreparedQuery<T> {
		const executor = async (params: any[] = []) => {
			const raw = this.client(query.sql, params, mode === 'arrays' ? 'all' : 'execute');

			if (mode !== 'raw') return raw.then(({ rows }) => rows);
			if (!mapper) return raw;

			return raw.then(({ rows: [data] }) => ({
				insertId: data.insertId,
				affectedRows: data.affectedRows,
			}));
		};

		return new MySqlPreparedQuery(
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
		_transaction: (tx: MySqlTransaction<MySqlRemoteQueryResultHKT, TRelations>) => Promise<T>,
		_config?: MySqlTransactionConfig,
	): Promise<T> {
		throw new Error('Transactions are not supported by the MySql Proxy driver');
	}
}

export interface MySqlRemoteQueryResultHKT extends MySqlQueryResultHKT {
	type: MySqlRawQueryResult;
}
