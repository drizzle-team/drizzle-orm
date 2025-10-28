import type { OPSQLiteConnection, QueryResult } from '@op-engineering/op-sqlite';
import type * as V1 from '~/_relations.ts';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { AnyRelations } from '~/relations.ts';
import { fillPlaceholders, type Query, sql } from '~/sql/sql.ts';
import type { SQLiteAsyncDialect } from '~/sqlite-core/dialect.ts';
import { SQLiteTransaction } from '~/sqlite-core/index.ts';
import type { SelectedFieldsOrdered } from '~/sqlite-core/query-builders/select.types.ts';
import {
	type PreparedQueryConfig as PreparedQueryConfigBase,
	type SQLiteExecuteMethod,
	SQLitePreparedQuery,
	SQLiteSession,
	type SQLiteTransactionConfig,
} from '~/sqlite-core/session.ts';
import { mapResultRow } from '~/utils.ts';

export interface OPSQLiteSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class OPSQLiteSession<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends SQLiteSession<'async', QueryResult, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'OPSQLiteSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: OPSQLiteConnection,
		dialect: SQLiteAsyncDialect,
		private relations: TRelations,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		options: OPSQLiteSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		isResponseInArrayMode: boolean,
		customResultMapper?: (rows: unknown[][]) => unknown,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): OPSQLitePreparedQuery<T> {
		return new OPSQLitePreparedQuery(
			this.client,
			query,
			this.logger,
			this.cache,
			queryMetadata,
			cacheConfig,
			fields,
			executeMethod,
			isResponseInArrayMode,
			customResultMapper,
		);
	}

	prepareRelationalQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		customResultMapper: (rows: Record<string, unknown>[]) => unknown,
	): OPSQLitePreparedQuery<T, true> {
		return new OPSQLitePreparedQuery(
			this.client,
			query,
			this.logger,
			this.cache,
			undefined,
			undefined,
			fields,
			executeMethod,
			false,
			customResultMapper,
			true,
		);
	}

	override transaction<T>(
		transaction: (tx: OPSQLiteTransaction<TFullSchema, TRelations, TSchema>) => T,
		config: SQLiteTransactionConfig = {},
	): T {
		const tx = new OPSQLiteTransaction('async', this.dialect, this, this.relations, this.schema);
		this.run(sql.raw(`begin${config?.behavior ? ' ' + config.behavior : ''}`));
		try {
			const result = transaction(tx);
			this.run(sql`commit`);
			return result;
		} catch (err) {
			this.run(sql`rollback`);
			throw err;
		}
	}
}

export class OPSQLiteTransaction<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends SQLiteTransaction<'async', QueryResult, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'OPSQLiteTransaction';

	override transaction<T>(
		transaction: (tx: OPSQLiteTransaction<TFullSchema, TRelations, TSchema>) => T,
	): T {
		const savepointName = `sp${this.nestedIndex}`;
		const tx = new OPSQLiteTransaction(
			'async',
			this.dialect,
			this.session,
			this.relations,
			this.schema,
			this.nestedIndex + 1,
		);
		this.session.run(sql.raw(`savepoint ${savepointName}`));
		try {
			const result = transaction(tx);
			this.session.run(sql.raw(`release savepoint ${savepointName}`));
			return result;
		} catch (err) {
			this.session.run(sql.raw(`rollback to savepoint ${savepointName}`));
			throw err;
		}
	}
}

export class OPSQLitePreparedQuery<
	T extends PreparedQueryConfig = PreparedQueryConfig,
	TIsRqbV2 extends boolean = false,
> extends SQLitePreparedQuery<
	{ type: 'async'; run: QueryResult; all: T['all']; get: T['get']; values: T['values']; execute: T['execute'] }
> {
	static override readonly [entityKind]: string = 'OPSQLitePreparedQuery';

	constructor(
		private client: OPSQLiteConnection,
		query: Query,
		private logger: Logger,
		cache: Cache,
		queryMetadata: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		} | undefined,
		cacheConfig: WithCacheConfig | undefined,
		private fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		private _isResponseInArrayMode: boolean,
		private customResultMapper?: (
			rows: TIsRqbV2 extends true ? Record<string, unknown>[] : unknown[][],
		) => unknown,
		private isRqbV2Query?: TIsRqbV2,
	) {
		super('sync', executeMethod, query, cache, queryMetadata, cacheConfig);
	}

	async run(placeholderValues?: Record<string, unknown>): Promise<QueryResult> {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);

		return await this.queryWithCache(this.query.sql, params, async () => {
			return this.client.executeAsync(this.query.sql, params);
		});
	}

	async all(placeholderValues?: Record<string, unknown>): Promise<T['all']> {
		if (this.isRqbV2Query) return this.allRqbV2(placeholderValues);

		const { fields, joinsNotNullableMap, query, logger, customResultMapper, client } = this;
		if (!fields && !customResultMapper) {
			const params = fillPlaceholders(query.params, placeholderValues ?? {});
			logger.logQuery(query.sql, params);

			return await this.queryWithCache(query.sql, params, async () => {
				return client.execute(query.sql, params).rows?._array || [];
			});
		}

		const rows = await this.values(placeholderValues) as unknown[][];
		if (customResultMapper) {
			return (customResultMapper as (rows: unknown[][]) => unknown)(rows) as T['all'];
		}
		return rows.map((row) => mapResultRow(fields!, row, joinsNotNullableMap));
	}

	private async allRqbV2(placeholderValues?: Record<string, unknown>): Promise<T['all']> {
		const { query, logger, customResultMapper, client } = this;

		const params = fillPlaceholders(query.params, placeholderValues ?? {});
		logger.logQuery(query.sql, params);

		const rows = client.execute(query.sql, params).rows?._array || [];

		return (customResultMapper as (rows: Record<string, unknown>[]) => unknown)(rows) as T['all'];
	}

	async get(placeholderValues?: Record<string, unknown>): Promise<T['get']> {
		if (this.isRqbV2Query) return this.getRqbV2(placeholderValues);

		const { fields, joinsNotNullableMap, customResultMapper, query, logger, client } = this;
		const params = fillPlaceholders(query.params, placeholderValues ?? {});
		logger.logQuery(query.sql, params);
		if (!fields && !customResultMapper) {
			const rows = await this.queryWithCache(query.sql, params, async () => {
				return client.execute(query.sql, params).rows?._array || [];
			});
			return rows[0];
		}

		const rows = await this.values(placeholderValues) as unknown[][];
		const row = rows[0];

		if (!row) {
			return undefined;
		}

		if (customResultMapper) {
			return (customResultMapper as (rows: unknown[][]) => unknown)(rows) as T['get'];
		}

		return mapResultRow(fields!, row, joinsNotNullableMap);
	}

	private async getRqbV2(placeholderValues?: Record<string, unknown>): Promise<T['get']> {
		const { customResultMapper, query, logger, client } = this;

		const params = fillPlaceholders(query.params, placeholderValues ?? {});
		logger.logQuery(query.sql, params);

		const rows = client.execute(query.sql, params).rows?._array || [];
		const row = rows[0];

		if (!row) {
			return undefined;
		}

		return (customResultMapper as (rows: Record<string, unknown>[]) => unknown)([row]) as T['get'];
	}

	async values(placeholderValues?: Record<string, unknown>): Promise<T['values']> {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);
		return await this.queryWithCache(this.query.sql, params, async () => {
			return await this.client.executeRawAsync(this.query.sql, params);
		});
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}
}
