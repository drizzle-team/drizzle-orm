import type { SQLPluginResult, SQLQueryResult } from '@xata.io/client';
import type { Cache } from '~/cache/core/index.ts';
import { NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import { PgAsyncPreparedQuery, PgAsyncSession, type PgAsyncTransaction } from '~/pg-core/async/session.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query } from '~/sql/sql.ts';

export type XataHttpClient = {
	sql: SQLPluginResult;
};

export interface QueryResults<ArrayMode extends 'json' | 'array'> {
	rowCount: number;
	rows: ArrayMode extends 'array' ? any[][] : Record<string, any>[];
	rowAsArray: ArrayMode extends 'array' ? true : false;
}

export interface XataHttpSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export class XataHttpSession<TRelations extends AnyRelations> extends PgAsyncSession<
	XataHttpQueryResultHKT,
	TRelations
> {
	static override readonly [entityKind]: string = 'XataHttpSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: XataHttpClient,
		dialect: PgDialect,
		private relations: TRelations,
		private options: XataHttpSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
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
			if (mode === 'raw') return this.client.sql<Record<string, any>>({ statement: query.sql, params });
			if (mode === 'objects') {
				return this.client.sql<Record<string, any>>({
					statement: query.sql,
					params,
					responseType: 'json',
				}).then(({ warning, records }) => {
					if (warning) console.warn(warning);
					return records;
				});
			}

			return this.client.sql({ statement: query.sql, params, responseType: 'array' }).then(({ warning, rows }) => {
				if (warning) console.warn(warning);
				return rows;
			});
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
		_transaction: (tx: PgAsyncTransaction<XataHttpQueryResultHKT, TRelations>) => Promise<T>,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		_config: PgTransactionConfig = {},
	): Promise<T> {
		throw new Error('No transactions support in Xata Http driver');
	}
}

export interface XataHttpQueryResultHKT extends PgQueryResultHKT {
	type: SQLQueryResult<this['row']>;
}
