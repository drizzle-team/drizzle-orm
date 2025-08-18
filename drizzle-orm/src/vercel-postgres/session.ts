import {
	type QueryArrayConfig,
	type QueryConfig,
	type QueryResult,
	type QueryResultRow,
	types,
	type VercelClient,
	VercelPool,
	type VercelPoolClient,
} from '@vercel/postgres';
import type { Cache } from '~/cache/core/cache.ts';
import { NoopCache } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import { type PgDialect, PgTransaction } from '~/pg-core/index.ts';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import { PgPreparedQuery, PgSession } from '~/pg-core/session.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type Query, type SQL, sql } from '~/sql/sql.ts';
import { type Assume, mapResultRow } from '~/utils.ts';

export type VercelPgClient = VercelPool | VercelClient | VercelPoolClient;

export class VercelPgPreparedQuery<T extends PreparedQueryConfig> extends PgPreparedQuery<T> {
	static override readonly [entityKind]: string = 'VercelPgPreparedQuery';

	private rawQuery: QueryConfig;
	private queryConfig: QueryArrayConfig;

	constructor(
		private client: VercelPgClient,
		queryString: string,
		private params: unknown[],
		private logger: Logger,
		cache: Cache,
		queryMetadata: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		} | undefined,
		cacheConfig: WithCacheConfig | undefined,
		private fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		private _isResponseInArrayMode: boolean,
		private customResultMapper?: (rows: unknown[][]) => T['execute'],
	) {
		super({ sql: queryString, params }, cache, queryMetadata, cacheConfig);
		this.rawQuery = {
			name,
			text: queryString,
			types: {
				// @ts-ignore
				getTypeParser: (typeId, format) => {
					if (typeId === types.builtins.TIMESTAMPTZ) {
						return (val: any) => val;
					}
					if (typeId === types.builtins.TIMESTAMP) {
						return (val: any) => val;
					}
					if (typeId === types.builtins.DATE) {
						return (val: any) => val;
					}
					if (typeId === types.builtins.INTERVAL) {
						return (val: any) => val;
					}
					// numeric[]
					if (typeId === 1231 as any) {
						return (val: any) => val;
					}
					// timestamp[]
					if (typeId === 1115 as any) {
						return (val: any) => val;
					}
					// timestamp with timezone[]
					if (typeId === 1185 as any) {
						return (val: any) => val;
					}
					// interval[]
					if (typeId === 1187 as any) {
						return (val: any) => val;
					}
					// date[]
					if (typeId === 1182 as any) {
						return (val: any) => val;
					}
					// @ts-ignore
					return types.getTypeParser(typeId, format);
				},
			},
		};
		this.queryConfig = {
			name,
			text: queryString,
			rowMode: 'array',
			types: {
				// @ts-ignore
				getTypeParser: (typeId, format) => {
					if (typeId === types.builtins.TIMESTAMPTZ) {
						return (val: any) => val;
					}
					if (typeId === types.builtins.TIMESTAMP) {
						return (val: any) => val;
					}
					if (typeId === types.builtins.DATE) {
						return (val: any) => val;
					}
					if (typeId === types.builtins.INTERVAL) {
						return (val: any) => val;
					}
					// numeric[]
					if (typeId === 1231 as any) {
						return (val: any) => val;
					}
					// timestamp[]
					if (typeId === 1115 as any) {
						return (val: any) => val;
					}
					// timestamp with timezone[]
					if (typeId === 1185 as any) {
						return (val: any) => val;
					}
					// interval[]
					if (typeId === 1187 as any) {
						return (val: any) => val;
					}
					// date[]
					if (typeId === 1182 as any) {
						return (val: any) => val;
					}
					// @ts-ignore
					return types.getTypeParser(typeId, format);
				},
			},
		};
	}

	async execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		const params = fillPlaceholders(this.params, placeholderValues);

		this.logger.logQuery(this.rawQuery.text, params);

		const { fields, rawQuery, client, queryConfig: query, joinsNotNullableMap, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			return this.queryWithCache(rawQuery.text, params, async () => {
				return await client.query(rawQuery, params);
			});
		}

		const { rows } = await this.queryWithCache(query.text, params, async () => {
			return await client.query(query, params);
		});

		if (customResultMapper) {
			return customResultMapper(rows);
		}

		return rows.map((row) => mapResultRow<T['execute']>(fields!, row, joinsNotNullableMap));
	}

	all(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['all']> {
		const params = fillPlaceholders(this.params, placeholderValues);
		this.logger.logQuery(this.rawQuery.text, params);
		return this.queryWithCache(this.rawQuery.text, params, async () => {
			return await this.client.query(this.rawQuery, params);
		}).then((result) => result.rows);
	}

	values(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['values']> {
		const params = fillPlaceholders(this.params, placeholderValues);
		this.logger.logQuery(this.rawQuery.text, params);
		return this.queryWithCache(this.queryConfig.text, params, async () => {
			return await this.client.query(this.queryConfig, params);
		}).then((result) => result.rows);
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}
}

export interface VercelPgSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export class VercelPgSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends PgSession<VercelPgQueryResultHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'VercelPgSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: VercelPgClient,
		dialect: PgDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		private options: VercelPgSessionOptions = {},
	) {
		super(dialect);
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
	): PgPreparedQuery<T> {
		return new VercelPgPreparedQuery(
			this.client,
			query.sql,
			query.params,
			this.logger,
			this.cache,
			queryMetadata,
			cacheConfig,
			fields,
			name,
			isResponseInArrayMode,
			customResultMapper,
		);
	}

	async query(query: string, params: unknown[]): Promise<QueryResult> {
		this.logger.logQuery(query, params);
		const result = await this.client.query({
			rowMode: 'array',
			text: query,
			values: params,
		});
		return result;
	}

	async queryObjects<T extends QueryResultRow>(
		query: string,
		params: unknown[],
	): Promise<QueryResult<T>> {
		return this.client.query<T>(query, params);
	}

	override async count(sql: SQL): Promise<number> {
		const result = await this.execute(sql);

		return Number((result as any)['rows'][0]['count']);
	}

	override async transaction<T>(
		transaction: (tx: VercelPgTransaction<TFullSchema, TSchema>) => Promise<T>,
		config?: PgTransactionConfig | undefined,
	): Promise<T> {
		const session = this.client instanceof VercelPool // eslint-disable-line no-instanceof/no-instanceof
			? new VercelPgSession(await this.client.connect(), this.dialect, this.schema, this.options)
			: this;
		const tx = new VercelPgTransaction<TFullSchema, TSchema>(this.dialect, session, this.schema);
		await tx.execute(sql`begin${config ? sql` ${tx.getTransactionConfigSQL(config)}` : undefined}`);
		try {
			const result = await transaction(tx);
			await tx.execute(sql`commit`);
			return result;
		} catch (error) {
			await tx.execute(sql`rollback`);
			throw error;
		} finally {
			if (this.client instanceof VercelPool) { // eslint-disable-line no-instanceof/no-instanceof
				(session.client as VercelPoolClient).release();
			}
		}
	}
}

export class VercelPgTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends PgTransaction<VercelPgQueryResultHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'VercelPgTransaction';

	override async transaction<T>(
		transaction: (tx: VercelPgTransaction<TFullSchema, TSchema>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new VercelPgTransaction<TFullSchema, TSchema>(
			this.dialect,
			this.session,
			this.schema,
			this.nestedIndex + 1,
		);
		await tx.execute(sql.raw(`savepoint ${savepointName}`));
		try {
			const result = await transaction(tx);
			await tx.execute(sql.raw(`release savepoint ${savepointName}`));
			return result;
		} catch (err) {
			await tx.execute(sql.raw(`rollback to savepoint ${savepointName}`));
			throw err;
		}
	}
}

export interface VercelPgQueryResultHKT extends PgQueryResultHKT {
	type: QueryResult<Assume<this['row'], QueryResultRow>>;
}
