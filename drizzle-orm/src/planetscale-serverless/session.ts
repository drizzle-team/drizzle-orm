import type { Client, Connection, ExecutedQuery, Transaction } from '@planetscale/database';
import type * as V1 from '~/_relations.ts';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { Column } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { MySqlDialect } from '~/mysql-core/dialect.ts';
import type { SelectedFieldsOrdered } from '~/mysql-core/query-builders/select.types.ts';
import {
	MySqlPreparedQuery,
	type MySqlPreparedQueryConfig,
	type MySqlPreparedQueryHKT,
	type MySqlQueryResultHKT,
	MySqlSession,
	MySqlTransaction,
} from '~/mysql-core/session.ts';
import type { AnyRelations } from '~/relations.ts';
import { fillPlaceholders, type Query, type SQL, sql } from '~/sql/sql.ts';
import { type Assume, mapResultRow } from '~/utils.ts';

export class PlanetScalePreparedQuery<T extends MySqlPreparedQueryConfig, TIsRqbV2 extends boolean = false>
	extends MySqlPreparedQuery<T>
{
	static override readonly [entityKind]: string = 'PlanetScalePreparedQuery';

	private rawQuery = { as: 'object' } as const;
	private query = { as: 'array' } as const;

	constructor(
		private client: Client | Transaction | Connection,
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
		private customResultMapper?: (
			rows: TIsRqbV2 extends true ? Record<string, unknown>[] : unknown[][],
		) => T['execute'],
		// Keys that were used in $default and the value that was generated for them
		private generatedIds?: Record<string, unknown>[],
		// Keys that should be returned, it has the column with all properries + key from object
		private returningIds?: SelectedFieldsOrdered,
		private isRqbV2Query?: TIsRqbV2,
	) {
		super(cache, queryMetadata, cacheConfig);
	}

	async execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		if (this.isRqbV2Query) return this.executeRqbV2(placeholderValues);

		const params = fillPlaceholders(this.params, placeholderValues);

		this.logger.logQuery(this.queryString, params);

		const {
			fields,
			client,
			queryString,
			rawQuery,
			query,
			joinsNotNullableMap,
			customResultMapper,
			returningIds,
			generatedIds,
		} = this;
		if (!fields && !customResultMapper) {
			const res = await this.queryWithCache(queryString, params, async () => {
				return await client.execute(queryString, params, rawQuery);
			});

			const insertId = Number.parseFloat(res.insertId);
			const affectedRows = res.rowsAffected;

			// for each row, I need to check keys from
			if (returningIds) {
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
			}
			return res;
		}
		const { rows } = await this.queryWithCache(queryString, params, async () => {
			return await client.execute(queryString, params, query);
		});

		if (customResultMapper) {
			return (customResultMapper as (rows: unknown[][]) => T['execute'])(rows as unknown[][]);
		}

		return rows.map((row) => mapResultRow<T['execute']>(fields!, row as unknown[], joinsNotNullableMap));
	}

	private async executeRqbV2(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		const params = fillPlaceholders(this.params, placeholderValues);

		this.logger.logQuery(this.queryString, params);

		const {
			client,
			queryString,
			rawQuery,
			customResultMapper,
		} = this;

		const res = await client.execute(queryString, params, rawQuery);

		return (customResultMapper as (rows: Record<string, unknown>[]) => T['execute'])(
			res.rows as any as Record<string, unknown>[],
		);
	}

	override iterator(_placeholderValues?: Record<string, unknown>): AsyncGenerator<T['iterator']> {
		throw new Error('Streaming is not supported by the PlanetScale Serverless driver');
	}
}

export interface PlanetscaleSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export class PlanetscaleSession<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends MySqlSession<
	MySqlQueryResultHKT,
	PlanetScalePreparedQueryHKT,
	TFullSchema,
	TRelations,
	TSchema
> {
	static override readonly [entityKind]: string = 'PlanetscaleSession';

	private logger: Logger;
	private client: Client | Transaction | Connection;
	private cache: Cache;

	constructor(
		private baseClient: Client | Connection,
		dialect: MySqlDialect,
		tx: Transaction | undefined,
		private relations: TRelations,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		private options: PlanetscaleSessionOptions = {},
	) {
		super(dialect);
		this.client = tx ?? baseClient;
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<T extends MySqlPreparedQueryConfig = MySqlPreparedQueryConfig>(
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
	): MySqlPreparedQuery<T> {
		return new PlanetScalePreparedQuery(
			this.client,
			query.sql,
			query.params,
			this.logger,
			this.cache,
			queryMetadata,
			cacheConfig,
			fields,
			customResultMapper,
			generatedIds,
			returningIds,
		);
	}

	prepareRelationalQuery<T extends MySqlPreparedQueryConfig = MySqlPreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		customResultMapper: (rows: Record<string, unknown>[]) => T['execute'],
		generatedIds?: Record<string, unknown>[],
		returningIds?: SelectedFieldsOrdered,
	): MySqlPreparedQuery<T> {
		return new PlanetScalePreparedQuery(
			this.client,
			query.sql,
			query.params,
			this.logger,
			this.cache,
			undefined,
			undefined,
			fields,
			customResultMapper,
			generatedIds,
			returningIds,
			true,
		);
	}

	async query(query: string, params: unknown[]): Promise<ExecutedQuery> {
		this.logger.logQuery(query, params);

		return await this.client.execute(query, params, { as: 'array' });
	}

	async queryObjects(
		query: string,
		params: unknown[],
	): Promise<ExecutedQuery> {
		return this.client.execute(query, params, { as: 'object' });
	}

	override all<T = unknown>(query: SQL): Promise<T[]> {
		const querySql = this.dialect.sqlToQuery(query);
		this.logger.logQuery(querySql.sql, querySql.params);

		return this.client.execute<T>(querySql.sql, querySql.params, { as: 'object' }).then((
			eQuery,
		) => eQuery.rows);
	}

	override async count(sql: SQL): Promise<number> {
		const res = await this.execute<{ rows: [{ count: string }] }>(sql);

		return Number(
			res['rows'][0]['count'],
		);
	}

	override transaction<T>(
		transaction: (tx: PlanetScaleTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
	): Promise<T> {
		return this.baseClient.transaction((pstx) => {
			const session = new PlanetscaleSession(
				this.baseClient,
				this.dialect,
				pstx,
				this.relations,
				this.schema,
				this.options,
			);
			const tx = new PlanetScaleTransaction<TFullSchema, TRelations, TSchema>(
				this.dialect,
				session as MySqlSession<any, any, any, any, any>,
				this.relations,
				this.schema,
			);
			return transaction(tx);
		});
	}
}

export class PlanetScaleTransaction<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends MySqlTransaction<
	PlanetscaleQueryResultHKT,
	PlanetScalePreparedQueryHKT,
	TFullSchema,
	TRelations,
	TSchema
> {
	static override readonly [entityKind]: string = 'PlanetScaleTransaction';

	constructor(
		dialect: MySqlDialect,
		session: MySqlSession,
		relations: TRelations,
		schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		nestedIndex = 0,
	) {
		super(dialect, session, relations, schema, nestedIndex, 'planetscale');
	}

	override async transaction<T>(
		transaction: (tx: PlanetScaleTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new PlanetScaleTransaction<TFullSchema, TRelations, TSchema>(
			this.dialect,
			this.session,
			this.relations,
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

export interface PlanetscaleQueryResultHKT extends MySqlQueryResultHKT {
	type: ExecutedQuery;
}

export interface PlanetScalePreparedQueryHKT extends MySqlPreparedQueryHKT {
	type: PlanetScalePreparedQuery<Assume<this['config'], MySqlPreparedQueryConfig>>;
}
