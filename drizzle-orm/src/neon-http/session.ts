import type { FullQueryResults, NeonQueryFunction, NeonQueryPromise } from '@neondatabase/serverless';
import type * as V1 from '~/_relations.ts';
import type { BatchItem } from '~/batch.ts';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import { PgAsyncPreparedQuery, PgAsyncSession, type PgAsyncTransaction } from '~/pg-core/async/session.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query } from '~/sql/sql.ts';
import type { NeonAuthToken } from '~/utils.ts';

export type NeonHttpClient = NeonQueryFunction<any, any>;

export interface NeonHttpSessionOptions {
	logger?: Logger;
	cache?: Cache;
	useJitMapper?: boolean;
	authToken?: NeonAuthToken;
}

export class NeonHttpSession<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends PgAsyncSession<NeonHttpQueryResultHKT, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'NeonHttpSession';

	private logger: Logger;
	private cache: Cache;

	/** @internal */
	readonly client: NeonHttpClient;
	constructor(
		client: NeonHttpClient,
		dialect: PgDialect,
		private relations: AnyRelations,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		readonly options: NeonHttpSessionOptions = {},
	) {
		super(dialect);
		this.client = client;
		// `client.query` is for @neondatabase/serverless v1.0.0 and up, where the
		// root query function `client` is only usable as a template function;
		// `client` is a fallback for earlier versions
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
	): PgAsyncPreparedQuery<T> {
		const executor = async (params?: unknown[]) => {
			const q = (this.client as any).query ?? this.client as any;
			return q(query.sql, params ?? [], {
				arrayMode: mode === 'arrays' ? true : false,
				fullResults: true,
				authToken: this.options.authToken,
			}).then((it: any) => mode === 'raw' ? it : it.rows);
		};

		return new PgAsyncPreparedQuery(executor, query, mapper, mode, this.logger, this.cache, queryMetadata, cacheConfig);
	}

	async batch<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(queries: T) {
		const preparedQueries: PgAsyncPreparedQuery<any>[] = [];
		const builtQueries: NeonQueryPromise<any, true>[] = [];
		const q = (this.client as any).query ?? this.client as any;

		for (const query of queries) {
			const preparedQuery = query._prepare() as PgAsyncPreparedQuery<any>;
			const builtQuery = preparedQuery.getQuery();
			preparedQueries.push(preparedQuery);
			builtQueries.push(
				q(builtQuery.sql, builtQuery.params, {
					fullResults: true,
					arrayMode: preparedQuery.mode === 'arrays',
				}),
			);
		}

		const batchResults = await this.client.transaction(builtQueries, {
			authToken: this.options.authToken,
			fullResults: true,
			arrayMode: true,
		});
		return batchResults.map((result, i) =>
			preparedQueries[i]!.mapper ? preparedQueries[i]!.mapper(result.rows) : result
		) as any;
	}

	override async transaction<T>(
		_transaction: (tx: PgAsyncTransaction<NeonHttpQueryResultHKT, TFullSchema, TRelations, TSchema>) => Promise<T>,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		_config: PgTransactionConfig = {},
	): Promise<T> {
		throw new Error('No transactions support in neon-http driver');
	}
}

export type NeonHttpQueryResult<T> = Omit<FullQueryResults<false>, 'rows'> & { rows: T[] };

export interface NeonHttpQueryResultHKT extends PgQueryResultHKT {
	type: NeonHttpQueryResult<this['row']>;
}
