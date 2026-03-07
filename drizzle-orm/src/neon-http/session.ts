import type { FullQueryResults, NeonQueryFunction, NeonQueryPromise } from '@neondatabase/serverless';
import type * as V1 from '~/_relations.ts';
import type { BatchItem } from '~/batch.ts';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import { PgAsyncPreparedQuery, PgAsyncSession, PgAsyncTransaction } from '~/pg-core/async/session.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { Query } from '~/sql/sql.ts';

export type NeonHttpClient = NeonQueryFunction<any, any>;

export interface NeonHttpSessionOptions {
	logger?: Logger;
	cache?: Cache;
	useJitMapper?: boolean;
}

export class NeonHttpSession<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends PgAsyncSession<NeonHttpQueryResultHKT, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'NeonHttpSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: NeonHttpClient,
		dialect: PgDialect,
		private relations: AnyRelations,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		private options: NeonHttpSessionOptions = {},
	) {
		super(dialect);
		// `client.query` is for @neondatabase/serverless v1.0.0 and up, where the
		// root query function `client` is only usable as a template function;
		// `client` is a fallback for earlier versions
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects',
		_: string | boolean,
		mapper: ((rows: any[]) => any) | undefined,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): PgAsyncPreparedQuery<T> {
		const executor = async (sql: string, params?: unknown[]) => {
			const q = (this.client as any).query ?? this.client as any;
			return await q(sql, params ?? [], {
				arrayMode: mode === 'arrays' ? true : false,
				fullResults: true,
				authToken: this.token,
			}).then((it: any) => it.rows);
		};

		return new PgAsyncPreparedQuery(executor, query, mapper, this.logger, this.cache, queryMetadata, cacheConfig);
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
					arrayMode: query.mode === 'arrays' ? true : false,
					authToken: ,
				}),
			);
		}

		const batchResults = await this.client.transaction(builtQueries, queryConfig); // ? why queryConfig
		return batchResults.map((result, i) => preparedQueries[i]!.mapResult(result, true)) as any;
	}

	override async transaction<T>(
		_transaction: (tx: NeonTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		_config: PgTransactionConfig = {},
	): Promise<T> {
		throw new Error('No transactions support in neon-http driver');
	}
}

export class NeonTransaction<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends PgAsyncTransaction<NeonHttpQueryResultHKT, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'NeonHttpTransaction';

	override async transaction<T>(
		_transaction: (tx: NeonTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
	): Promise<T> {
		throw new Error('No transactions support in neon-http driver');
		// const savepointName = `sp${this.nestedIndex + 1}`;
		// const tx = new NeonTransaction(this.dialect, this.session, this.relations, this.schema, this.nestedIndex + 1);
		// await tx.execute(sql.raw(`savepoint ${savepointName}`));
		// try {
		// 	const result = await transaction(tx);
		// 	await tx.execute(sql.raw(`release savepoint ${savepointName}`));
		// 	return result;
		// } catch (e) {
		// 	await tx.execute(sql.raw(`rollback to savepoint ${savepointName}`));
		// 	throw e;
		// }
	}
}

export type NeonHttpQueryResult<T> = Omit<FullQueryResults<false>, 'rows'> & { rows: T[] };

export interface NeonHttpQueryResultHKT extends PgQueryResultHKT {
	type: NeonHttpQueryResult<this['row']>;
}
