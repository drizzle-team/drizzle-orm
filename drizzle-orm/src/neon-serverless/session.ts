import {
	type Client,
	Pool,
	type PoolClient,
	type QueryArrayConfig,
	type QueryConfig,
	type QueryResult,
	type QueryResultRow,
	types,
} from '@neondatabase/serverless';
import { type Cache, NoopCache } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import { PgTransaction } from '~/pg-core/index.ts';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import { PgPreparedQuery, PgSession } from '~/pg-core/session.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type Query, type SQL, sql } from '~/sql/sql.ts';
import { type Assume, mapResultRow } from '~/utils.ts';

export type NeonClient = Pool | PoolClient | Client;

export class NeonPreparedQuery<T extends PreparedQueryConfig> extends PgPreparedQuery<T> {
	static override readonly [entityKind]: string = 'NeonPreparedQuery';

	private rawQueryConfig: QueryConfig;
	private queryConfig: QueryArrayConfig;

	constructor(
		private client: NeonClient,
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
		this.rawQueryConfig = {
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
					if (typeId === 1231) {
						return (val: any) => val;
					}
					// timestamp[]
					if (typeId === 1115) {
						return (val) => val;
					}
					// timestamp with timezone[]
					if (typeId === 1185) {
						return (val) => val;
					}
					// interval[]
					if (typeId === 1187) {
						return (val) => val;
					}
					// date[]
					if (typeId === 1182) {
						return (val) => val;
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
					if (typeId === 1231) {
						return (val: any) => val;
					}
					// timestamp[]
					if (typeId === 1115) {
						return (val) => val;
					}
					// timestamp with timezone[]
					if (typeId === 1185) {
						return (val) => val;
					}
					// interval[]
					if (typeId === 1187) {
						return (val) => val;
					}
					// date[]
					if (typeId === 1182) {
						return (val) => val;
					}
					// @ts-ignore
					return types.getTypeParser(typeId, format);
				},
			},
		};
	}

	async execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		const params = fillPlaceholders(this.params, placeholderValues);

		this.logger.logQuery(this.rawQueryConfig.text, params);

		const { fields, client, rawQueryConfig: rawQuery, queryConfig: query, joinsNotNullableMap, customResultMapper } =
			this;
		if (!fields && !customResultMapper) {
			return await this.queryWithCache(rawQuery.text, params, async () => {
				return await client.query(rawQuery, params);
			});
		}

		const result = await this.queryWithCache(query.text, params, async () => {
			return await client.query(query, params);
		});

		return customResultMapper
			? customResultMapper(result.rows)
			: result.rows.map((row) => mapResultRow<T['execute']>(fields!, row, joinsNotNullableMap));
	}

	all(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['all']> {
		const params = fillPlaceholders(this.params, placeholderValues);
		this.logger.logQuery(this.rawQueryConfig.text, params);
		return this.queryWithCache(this.rawQueryConfig.text, params, async () => {
			return await this.client.query(this.rawQueryConfig, params);
		}).then((result) => result.rows);
	}

	values(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['values']> {
		const params = fillPlaceholders(this.params, placeholderValues);
		this.logger.logQuery(this.rawQueryConfig.text, params);
		return this.queryWithCache(this.queryConfig.text, params, async () => {
			return await this.client.query(this.queryConfig, params);
		}).then((result) => result.rows);
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}
}

export interface NeonSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export class NeonSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends PgSession<NeonQueryResultHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'NeonSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: NeonClient,
		dialect: PgDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		private options: NeonSessionOptions = {},
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
		return new NeonPreparedQuery(
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
		const res = await this.execute<{ rows: [{ count: string }] }>(sql);

		return Number(
			res['rows'][0]['count'],
		);
	}

	override async transaction<T>(
		transaction: (tx: NeonTransaction<TFullSchema, TSchema>) => Promise<T>,
		config: PgTransactionConfig = {},
	): Promise<T> {
		const session = this.client instanceof Pool // eslint-disable-line no-instanceof/no-instanceof
			? new NeonSession(await this.client.connect(), this.dialect, this.schema, this.options)
			: this;
		const tx = new NeonTransaction<TFullSchema, TSchema>(this.dialect, session, this.schema);
		await tx.execute(sql`begin ${tx.getTransactionConfigSQL(config)}`);
		try {
			const result = await transaction(tx);
			await tx.execute(sql`commit`);
			return result;
		} catch (error) {
			await tx.execute(sql`rollback`);
			throw error;
		} finally {
			if (this.client instanceof Pool) { // eslint-disable-line no-instanceof/no-instanceof
				(session.client as PoolClient).release();
			}
		}
	}
}

export class NeonTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends PgTransaction<NeonQueryResultHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'NeonTransaction';

	override async transaction<T>(transaction: (tx: NeonTransaction<TFullSchema, TSchema>) => Promise<T>): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new NeonTransaction<TFullSchema, TSchema>(this.dialect, this.session, this.schema, this.nestedIndex + 1);
		await tx.execute(sql.raw(`savepoint ${savepointName}`));
		try {
			const result = await transaction(tx);
			await tx.execute(sql.raw(`release savepoint ${savepointName}`));
			return result;
		} catch (e) {
			await tx.execute(sql.raw(`rollback to savepoint ${savepointName}`));
			throw e;
		}
	}
}

export interface NeonQueryResultHKT extends PgQueryResultHKT {
	type: QueryResult<Assume<this['row'], QueryResultRow>>;
}
