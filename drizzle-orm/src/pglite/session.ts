import type { PGlite, QueryOptions, Results, Row, Transaction } from '@electric-sql/pglite';
import type * as V1 from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import { PgAsyncPreparedQuery, PgAsyncSession } from '~/pg-core/async/session.ts';
import { PgAsyncTransaction } from '~/pg-core/async/session.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { SelectedFieldsOrdered } from '~/pg-core/query-builders/select.types.ts';
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import { fillPlaceholders, type Query, sql } from '~/sql/sql.ts';
import { type Assume, mapResultRow } from '~/utils.ts';

import { types } from '@electric-sql/pglite';
import { type Cache, NoopCache } from '~/cache/core/cache.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import type { AnyRelations } from '~/relations.ts';

export type PgliteClient = PGlite;

export class PglitePreparedQuery<T extends PreparedQueryConfig, TIsRqbV2 extends boolean = false>
	extends PgAsyncPreparedQuery<T>
{
	static override readonly [entityKind]: string = 'PglitePreparedQuery';

	private rawQueryConfig: QueryOptions;
	private queryConfig: QueryOptions;

	constructor(
		private client: PgliteClient | Transaction,
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
		name: string | undefined,
		private _isResponseInArrayMode: boolean,
		private customResultMapper?: (
			rows: TIsRqbV2 extends true ? Record<string, unknown>[] : unknown[][],
		) => T['execute'],
		private isRqbV2Query?: TIsRqbV2,
	) {
		super({ sql: queryString, params }, cache, queryMetadata, cacheConfig);
		this.rawQueryConfig = {
			rowMode: 'object',
			parsers: {
				[types.TIMESTAMP]: (value) => value,
				[types.TIMESTAMPTZ]: (value) => value,
				[types.INTERVAL]: (value) => value,
				[types.DATE]: (value) => value,
				// numeric[]
				[1231]: (value) => value,
				// timestamp[]
				[1115]: (value) => value,
				// timestamp with timezone[]
				[1185]: (value) => value,
				// interval[]
				[1187]: (value) => value,
				// date[]
				[1182]: (value) => value,
			},
		};
		this.queryConfig = {
			rowMode: 'array',
			parsers: {
				[types.TIMESTAMP]: (value) => value,
				[types.TIMESTAMPTZ]: (value) => value,
				[types.INTERVAL]: (value) => value,
				[types.DATE]: (value) => value,
				// numeric[]
				[1231]: (value) => value,
				// timestamp[]
				[1115]: (value) => value,
				// timestamp with timezone[]
				[1185]: (value) => value,
				// interval[]
				[1187]: (value) => value,
				// date[]
				[1182]: (value) => value,
			},
		};
	}

	async execute(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		if (this.isRqbV2Query) return this.executeRqbV2(placeholderValues);

		const params = fillPlaceholders(this.params, placeholderValues);

		this.logger.logQuery(this.queryString, params);

		const { fields, client, queryConfig, joinsNotNullableMap, customResultMapper, queryString, rawQueryConfig } = this;

		if (!fields && !customResultMapper) {
			return this.queryWithCache(queryString, params, async () => {
				return await client.query<any[]>(queryString, params, rawQueryConfig);
			});
		}

		const result = await this.queryWithCache(queryString, params, async () => {
			return await client.query<any[]>(queryString, params, queryConfig);
		});

		return customResultMapper
			? (customResultMapper as (rows: unknown[][]) => T['execute'])(result.rows)
			: result.rows.map((row) => mapResultRow<T['execute']>(fields!, row, joinsNotNullableMap));
	}

	private async executeRqbV2(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['execute']> {
		const params = fillPlaceholders(this.params, placeholderValues);

		this.logger.logQuery(this.queryString, params);

		const { rawQueryConfig, client, customResultMapper, queryString } = this;

		const result = await client.query<Record<string, unknown>>(queryString, params, rawQueryConfig);

		return (customResultMapper as (rows: Record<string, unknown>[]) => T['execute'])(result.rows);
	}

	all(placeholderValues: Record<string, unknown> | undefined = {}): Promise<T['all']> {
		const params = fillPlaceholders(this.params, placeholderValues);
		this.logger.logQuery(this.queryString, params);
		return this.queryWithCache(this.queryString, params, async () => {
			return await this.client.query<any[]>(this.queryString, params, this.rawQueryConfig);
		}).then((result) => result.rows);
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}
}

export interface PgliteSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export class PgliteSession<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends PgAsyncSession<PgliteQueryResultHKT, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'PgliteSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: PgliteClient | Transaction,
		dialect: PgDialect,
		private relations: TRelations,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		private options: PgliteSessionOptions = {},
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
	): PgAsyncPreparedQuery<T> {
		return new PglitePreparedQuery(
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

	prepareRelationalQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		customResultMapper: (rows: Record<string, unknown>[]) => T['execute'],
	): PgAsyncPreparedQuery<T> {
		return new PglitePreparedQuery(
			this.client,
			query.sql,
			query.params,
			this.logger,
			this.cache,
			undefined,
			undefined,
			fields,
			name,
			false,
			customResultMapper,
			true,
		);
	}

	override async transaction<T>(
		transaction: (tx: PgliteTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
		config?: PgTransactionConfig | undefined,
	): Promise<T> {
		return (this.client as PgliteClient).transaction(async (client) => {
			const session = new PgliteSession<TFullSchema, TRelations, TSchema>(
				client,
				this.dialect,
				this.relations,
				this.schema,
				this.options,
			);
			const tx = new PgliteTransaction<TFullSchema, TRelations, TSchema>(
				this.dialect,
				session,
				this.relations,
				this.schema,
			);
			if (config) {
				await tx.setTransaction(config);
			}
			return transaction(tx);
		}) as Promise<T>;
	}
}

export class PgliteTransaction<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends PgAsyncTransaction<PgliteQueryResultHKT, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'PgliteTransaction';

	override async transaction<T>(
		transaction: (tx: PgliteTransaction<TFullSchema, TRelations, TSchema>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new PgliteTransaction<TFullSchema, TRelations, TSchema>(
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

export interface PgliteQueryResultHKT extends PgQueryResultHKT {
	type: Results<Assume<this['row'], Row>>;
}
