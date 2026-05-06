import type { FieldPacket, ResultSetHeader } from 'mysql2/promise';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { MySqlDialect } from '~/mysql-core/dialect.ts';
import type { MySqlTransaction } from '~/mysql-core/index.ts';
import type { SelectedFieldsOrdered } from '~/mysql-core/query-builders/select.types.ts';
import type { MySqlPreparedQueryConfig, MySqlQueryResultHKT, MySqlTransactionConfig } from '~/mysql-core/session.ts';
import { MySqlPreparedQuery, MySqlSession } from '~/mysql-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query } from '~/sql/sql.ts';
import type { RemoteCallback } from './driver.ts';

export type MySqlRawQueryResult = [ResultSetHeader, FieldPacket[]];

export interface MySqlRemoteSessionOptions {
	logger?: Logger;
	cache?: Cache;
	useJitMappers?: boolean;
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
		prepare: boolean,
		mapper?: (rows: any[]) => any,
		generatedIds?: Record<string, unknown>[],
		returningIds?: SelectedFieldsOrdered,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): MySqlPreparedQuery<T> {
		return new MySqlPreparedQuery(
			async (params = []) => {
				if (mode === 'arrays') return this.client(query.sql, params, 'all');

				const raw = this.client(query.sql, params, 'execute');
				if (mode === 'objects') return raw.then((r) => r.rows);
				if (!returningIds) return raw;

				return raw.then(({ rows: data }) => {
					const insertId = data[0].insertId as number;
					const affectedRows = data[0].affectedRows;
					const returningResponse = [];
					let j = 0;
					for (let i = insertId; i < insertId + affectedRows; i++) {
						for (const column of returningIds) {
							const key = returningIds[0]!.path[0]!;
							if (is(column.field, Column)) {
								// @ts-ignore
								if (column.field.primary && column.field.autoIncrement) {
									returningResponse.push({ [key]: i });
								}
								if (column.field.defaultFn && generatedIds) {
									// generatedIds[rowIdx][key]
									returningResponse.push({ [key]: generatedIds[j]![key] });
								}
							}
						}
						j++;
					}

					return returningResponse;
				});
			},
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
