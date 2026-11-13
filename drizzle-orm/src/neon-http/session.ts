import {
	type CustomTypesConfig,
	type FullQueryResults,
	type NeonQueryFunction,
	type NeonQueryPromise,
	types,
} from '@neondatabase/serverless';
import type { BatchItem } from '~/batch.ts';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { QueryMetadata, WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import { PgAsyncPreparedQuery, PgAsyncSession, type PgAsyncTransaction } from '~/pg-core/async/session.ts';
import { pgRawTextOids } from '~/pg-core/codecs.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { PgQueryResultHKT, PgRawRow, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query } from '~/sql/sql.ts';
import type { NeonAuthToken } from '~/utils.ts';

export type NeonHttpClient = NeonQueryFunction<any, any>;

const rawText = (value: string) => value;

/**
 * Per-query `types` returning `pgRawTextOids` as text for codecs to decode, other types through the client's default
 * parsers. Applied to queries decoded by codecs (queries with a mapper), proxy servers apply them to such queries as well.
 * Typed as `{}` to be spread into query options: `@neondatabase/serverless` reads per-query `types` since `0.10`, but only
 * declares it since `1.0`
 */
export const neonHttpRawTextTypes: {} = {
	types: {
		getTypeParser:
			<CustomTypesConfig['getTypeParser']> ((typeId, format) =>
				pgRawTextOids.has(typeId as number) ? rawText : types.getTypeParser(typeId, format as any)),
	} satisfies CustomTypesConfig,
};

export interface NeonHttpSessionOptions {
	logger?: Logger;
	cache?: Cache;
	authToken?: NeonAuthToken;
	paramsInErrors?: boolean;
}

export class NeonHttpSession<TRelations extends AnyRelations>
	extends PgAsyncSession<NeonHttpQueryResultHKT, TRelations>
{
	static override readonly [entityKind]: string = 'NeonHttpSession';

	private logger: Logger;
	private cache: Cache;

	/** @internal */
	readonly client: NeonHttpClient;
	constructor(
		client: NeonHttpClient,
		dialect: PgDialect,
		private relations: AnyRelations,
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
		queryMetadata?: QueryMetadata,
		cacheConfig?: WithCacheConfig,
	): PgAsyncPreparedQuery<T> {
		const executor = (params?: unknown[]) => {
			// `client.query` is for @neondatabase/serverless v1.0.0 and up, where the
			// root query function `httpClient` is only usable as a template function;
			// `client` is a fallback for earlier versions
			const q = ((this.client as any).query ?? this.client as any) as NeonHttpClient;
			if (mode === 'raw') {
				// otherwise raw queries with .then crash due to .then not existing on raw mode queries
				return (async () =>
					q(query.sql, params, {
						arrayMode: false,
						fullResults: true,
						authToken: this.options.authToken,
					}))();
			}

			return q(query.sql, params, {
				arrayMode: mode === 'arrays',
				fullResults: true,
				authToken: this.options.authToken,
				...(mapper ? neonHttpRawTextTypes : undefined),
			}).then((it: any) => it.rows);
		};

		return new PgAsyncPreparedQuery(
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
					...(preparedQuery.mode === 'arrays' && preparedQuery.mapper ? neonHttpRawTextTypes : undefined),
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
		_transaction: (tx: PgAsyncTransaction<NeonHttpQueryResultHKT, TRelations>) => Promise<T>,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		_config: PgTransactionConfig = {},
	): Promise<T> {
		throw new Error('No transactions support in neon-http driver');
	}
}

export type NeonHttpQueryResult<T> = Omit<FullQueryResults<false>, 'rows'> & { rows: T[] };

export interface NeonHttpQueryResultHKT extends PgQueryResultHKT {
	type: NeonHttpQueryResult<PgRawRow<this['row']>>;
}
