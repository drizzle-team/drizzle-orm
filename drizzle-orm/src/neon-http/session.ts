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
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import type { PreparedQuery } from '~/session.ts';
import { fillPlaceholders, type Query } from '~/sql/sql.ts';
import { mapResultRow, type NeonAuthToken } from '~/utils.ts';

export type NeonHttpClient = NeonQueryFunction<any, any>;

const rawQueryConfig = {
	arrayMode: false,
	fullResults: true,
} as const;
const queryConfig = {
	arrayMode: true,
	fullResults: true,
} as const;

export class NeonHttpPreparedQuery<
	T extends PreparedQueryConfig,
	TIsRqbV2 extends boolean = false,
> extends PgAsyncPreparedQuery<T> {
	static override readonly [entityKind]: string = 'NeonHttpPreparedQuery';
	private clientQuery: (sql: string, params: any[], opts: Record<string, any>) => NeonQueryPromise<any, any>;

	constructor(
		private client: NeonHttpClient,
		query: Query,
		private logger: Logger,
		cache: Cache,
		queryMetadata: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		} | undefined,
		cacheConfig: WithCacheConfig | undefined,
		private fields: SelectedFieldsOrdered | undefined,
		private _isResponseInArrayMode: boolean,
		private customResultMapper?: (
			rows: TIsRqbV2 extends true ? Record<string, unknown>[] : unknown[][],
		) => T['execute'],
		private isRqbV2Query?: TIsRqbV2,
	) {
		super(query, cache, queryMetadata, cacheConfig);
		// `client.query` is for @neondatabase/serverless v1.0.0 and up, where the
		// root query function `client` is only usable as a template function;
		// `client` is a fallback for earlier versions
		this.clientQuery = (client as any).query ?? client as any;
	}

	async execute(placeholderValues: Record<string, unknown> | undefined): Promise<T['execute']>;
	/** @internal */
	async execute(placeholderValues: Record<string, unknown> | undefined, token?: NeonAuthToken): Promise<T['execute']>;
	/** @internal */
	async execute(
		placeholderValues: Record<string, unknown> | undefined = {},
		token: NeonAuthToken | undefined = this.authToken,
	): Promise<T['execute']> {
		if (this.isRqbV2Query) return this.executeRqbV2(placeholderValues, token);

		const params = fillPlaceholders(this.query.params, placeholderValues);

		this.logger.logQuery(this.query.sql, params);

		const { fields, clientQuery, query, customResultMapper } = this;

		if (!fields && !customResultMapper) {
			return this.queryWithCache(query.sql, params, async () => {
				return clientQuery(
					query.sql,
					params,
					token === undefined
						? rawQueryConfig
						: {
							...rawQueryConfig,
							authToken: token,
						},
				);
			});
		}

		const result = await this.queryWithCache(query.sql, params, async () => {
			return await clientQuery(
				query.sql,
				params,
				token === undefined
					? queryConfig
					: {
						...queryConfig,
						authToken: token,
					},
			);
		});

		return this.mapResult(result);
	}

	private async executeRqbV2(
		placeholderValues: Record<string, unknown>,
		token: NeonAuthToken | undefined,
	): Promise<T['execute']> {
		const params = fillPlaceholders(this.query.params, placeholderValues);

		this.logger.logQuery(this.query.sql, params);

		const { clientQuery, query, customResultMapper } = this;

		const result = await clientQuery(
			query.sql,
			params,
			token === undefined
				? rawQueryConfig
				: {
					...rawQueryConfig,
					authToken: token,
				},
		);

		const rows = (result as FullQueryResults<false>).rows;

		return (customResultMapper as (rows: Record<string, unknown>[]) => T['execute'])(rows);
	}

	override mapResult(result: unknown): unknown {
		if (!this.fields && !this.customResultMapper) {
			return result;
		}

		const rows = (result as FullQueryResults<true>).rows;

		if (this.customResultMapper) {
			return (this.customResultMapper as (rows: unknown[][]) => T['execute'])(rows);
		}

		return rows.map((row) => mapResultRow(this.fields!, row, this.joinsNotNullableMap));
	}

	all(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['all']> {
		const params = fillPlaceholders(this.query.params, placeholderValues);
		this.logger.logQuery(this.query.sql, params);
		return this.clientQuery(
			this.query.sql,
			params,
			this.authToken === undefined ? rawQueryConfig : {
				...rawQueryConfig,
				authToken: this.authToken,
			},
		).then((result) => result.rows);
	}

	values(placeholderValues: Record<string, unknown> | undefined): Promise<T['values']>;
	/** @internal */
	values(placeholderValues: Record<string, unknown> | undefined, token?: NeonAuthToken): Promise<T['values']>;
	/** @internal */
	values(placeholderValues: Record<string, unknown> | undefined = {}, token?: NeonAuthToken): Promise<T['values']> {
		const params = fillPlaceholders(this.query.params, placeholderValues);
		this.logger.logQuery(this.query.sql, params);
		return this.clientQuery(this.query.sql, params, { arrayMode: true, fullResults: true, authToken: token }).then((
			result,
		) => result.rows);
	}

	/** @internal */
	isResponseInArrayMode() {
		return this._isResponseInArrayMode;
	}
}

export interface NeonHttpSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export class NeonHttpSession<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends PgAsyncSession<NeonHttpQueryResultHKT, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'NeonHttpSession';

	private clientQuery: (sql: string, params: any[], opts: Record<string, any>) => NeonQueryPromise<any, any>;
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
		this.clientQuery = (client as any).query ?? client as any;
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		isResponseInArrayMode: boolean,
		customResultMapper?: (rows: unknown[][]) => T['execute'],
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): PgAsyncPreparedQuery<T> {
		return new NeonHttpPreparedQuery(
			this.client,
			query,
			this.logger,
			this.cache,
			queryMetadata,
			cacheConfig,
			fields,
			isResponseInArrayMode,
			customResultMapper,
		);
	}

	prepareRelationalQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		customResultMapper: (rows: Record<string, unknown>[]) => T['execute'],
	): PgAsyncPreparedQuery<T> {
		return new NeonHttpPreparedQuery(
			this.client,
			query,
			this.logger,
			this.cache,
			undefined,
			undefined,
			fields,
			false,
			customResultMapper,
			true,
		);
	}

	async batch<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(
		queries: T,
	) {
		const preparedQueries: PreparedQuery[] = [];
		const builtQueries: NeonQueryPromise<any, true>[] = [];
		for (const query of queries) {
			const preparedQuery = query._prepare();
			const builtQuery = preparedQuery.getQuery();
			preparedQueries.push(preparedQuery);
			builtQueries.push(
				this.clientQuery(builtQuery.sql, builtQuery.params, {
					fullResults: true,
					arrayMode: preparedQuery.isResponseInArrayMode(),
				}),
			);
		}

		const batchResults = await this.client.transaction(builtQueries, queryConfig);

		return batchResults.map((result, i) => preparedQueries[i]!.mapResult(result, true)) as any;
	}

	// change return type to QueryRows<true>
	async query(query: string, params: unknown[]): Promise<FullQueryResults<true>> {
		this.logger.logQuery(query, params);
		const result = await this.clientQuery(query, params, { arrayMode: true, fullResults: true });
		return result;
	}

	// change return type to QueryRows<false>
	async queryObjects(
		query: string,
		params: unknown[],
	): Promise<FullQueryResults<false>> {
		return this.clientQuery(query, params, { arrayMode: false, fullResults: true });
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
