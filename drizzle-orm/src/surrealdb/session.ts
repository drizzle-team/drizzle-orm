import type { Surreal } from 'surrealdb';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import type { SurrealDBDialect } from '~/surrealdb-core/dialect.ts';
import type { SelectedFieldsOrdered } from '~/surrealdb-core/query-builders/select.types.ts';
import {
	type PreparedQueryKind,
	SurrealDBPreparedQuery,
	type SurrealDBPreparedQueryConfig,
	type SurrealDBPreparedQueryHKT,
	type SurrealDBQueryResultHKT,
	SurrealDBSession,
	SurrealDBTransaction,
	type SurrealDBTransactionConfig,
} from '~/surrealdb-core/session.ts';
import type { Query, SQL } from '~/sql/sql.ts';
import { fillPlaceholders, sql } from '~/sql/sql.ts';
import { type Assume, mapResultRow } from '~/utils.ts';

export type SurrealDBDriverClient = Surreal;

export type SurrealDBRawQueryResult = any[];

export class SurrealDBDriverPreparedQuery<T extends SurrealDBPreparedQueryConfig>
	extends SurrealDBPreparedQuery<T>
{
	static override readonly [entityKind]: string = 'SurrealDBDriverPreparedQuery';

	constructor(
		private client: SurrealDBDriverClient,
		private queryString: string,
		private params: unknown[],
		private logger: Logger,
		cache: Cache,
		queryMetadata: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		} | undefined,
		cacheConfig: WithCacheConfig | undefined,
		private fields: SelectedFieldsOrdered | undefined,
		private customResultMapper?: (rows: unknown[][]) => T['execute'],
	) {
		super(cache, queryMetadata, cacheConfig);
	}

	/**
	 * Convert positional params array to SurrealDB named params object.
	 * The dialect generates placeholders like $_1, $_2, etc.
	 * This maps them to { _1: value, _2: value, ... }
	 */
	private toNamedParams(params: unknown[]): Record<string, unknown> {
		const named: Record<string, unknown> = {};
		for (let i = 0; i < params.length; i++) {
			named[`_${i + 1}`] = params[i];
		}
		return named;
	}

	async execute(placeholderValues: Record<string, unknown> = {}): Promise<T['execute']> {
		const params = fillPlaceholders(this.params, placeholderValues);
		const namedParams = this.toNamedParams(params);

		this.logger.logQuery(this.queryString, params);

		const { fields, client, queryString, joinsNotNullableMap, customResultMapper } = this;

		if (!fields && !customResultMapper) {
			const res = await this.queryWithCache(queryString, params, async () => {
				return await client.query(queryString, namedParams);
			});
			return res;
		}

		const result = await this.queryWithCache(queryString, params, async () => {
			return await client.query(queryString, namedParams);
		});

		const rows = Array.isArray(result) ? (result.length > 0 ? result[result.length - 1] : []) : result;

		if (customResultMapper) {
			return customResultMapper(rows as unknown[][]);
		}

		return (rows as any[]).map((row: any) => {
			const rowArray = fields!.map(({ field }) => {
				if (is(field, Column)) {
					return row[field.name];
				}
				return row;
			});
			return mapResultRow<T['execute']>(fields!, rowArray, joinsNotNullableMap);
		});
	}

	async *iterator(
		placeholderValues: Record<string, unknown> = {},
	): AsyncGenerator<T['execute'] extends any[] ? T['execute'][number] : T['execute']> {
		const params = fillPlaceholders(this.params, placeholderValues);
		const namedParams = this.toNamedParams(params);

		this.logger.logQuery(this.queryString, params);

		const result = await this.client.query(this.queryString, namedParams);
		const rows = Array.isArray(result) ? (result.length > 0 ? result[result.length - 1] : []) : result;

		for (const row of rows as any[]) {
			yield row as any;
		}
	}
}

export interface SurrealDBDriverSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export class SurrealDBDriverSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends SurrealDBSession<SurrealDBQueryResultHKT, SurrealDBDriverPreparedQueryHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'SurrealDBDriverSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: SurrealDBDriverClient,
		dialect: SurrealDBDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		private options: SurrealDBDriverSessionOptions,
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<T extends SurrealDBPreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		customResultMapper?: (rows: unknown[][]) => T['execute'],
		generatedIds?: Record<string, unknown>[],
		returningIds?: SelectedFieldsOrdered,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): PreparedQueryKind<SurrealDBDriverPreparedQueryHKT, T> {
		return new SurrealDBDriverPreparedQuery(
			this.client,
			query.sql,
			query.params,
			this.logger,
			this.cache,
			queryMetadata,
			cacheConfig,
			fields,
			customResultMapper,
		) as PreparedQueryKind<SurrealDBDriverPreparedQueryHKT, T>;
	}

	override all<T = unknown>(query: SQL): Promise<T[]> {
		const querySql = this.dialect.sqlToQuery(query);
		this.logger.logQuery(querySql.sql, querySql.params);

		const namedParams: Record<string, unknown> = {};
		for (let i = 0; i < querySql.params.length; i++) {
			namedParams[`_${i + 1}`] = querySql.params[i];
		}

		return this.client.query(querySql.sql, namedParams).then((result: any) => {
			if (Array.isArray(result) && result.length > 0) {
				const lastResult = result[result.length - 1];
				return Array.isArray(lastResult) ? lastResult : [lastResult];
			}
			return [];
		}) as Promise<T[]>;
	}

	override async transaction<T>(
		transaction: (tx: SurrealDBDriverTransaction<TFullSchema, TSchema>) => Promise<T>,
		_config?: SurrealDBTransactionConfig,
	): Promise<T> {
		const tx = new SurrealDBDriverTransaction<TFullSchema, TSchema>(
			this.dialect,
			this,
			this.schema,
			0,
		);

		try {
			const result = await transaction(tx);
			return result;
		} catch (err) {
			throw err;
		}
	}
}

export class SurrealDBDriverTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends SurrealDBTransaction<
	SurrealDBDriverQueryResultHKT,
	SurrealDBDriverPreparedQueryHKT,
	TFullSchema,
	TSchema
> {
	static override readonly [entityKind]: string = 'SurrealDBDriverTransaction';

	override async transaction<T>(
		transaction: (tx: SurrealDBDriverTransaction<TFullSchema, TSchema>) => Promise<T>,
	): Promise<T> {
		const tx = new SurrealDBDriverTransaction<TFullSchema, TSchema>(
			this.dialect,
			this.session,
			this.schema,
			this.nestedIndex + 1,
		);
		try {
			const result = await transaction(tx);
			return result;
		} catch (err) {
			throw err;
		}
	}
}

export interface SurrealDBDriverQueryResultHKT extends SurrealDBQueryResultHKT {
	type: SurrealDBRawQueryResult;
}

export interface SurrealDBDriverPreparedQueryHKT extends SurrealDBPreparedQueryHKT {
	type: SurrealDBDriverPreparedQuery<Assume<this['config'], SurrealDBPreparedQueryConfig>>;
}
