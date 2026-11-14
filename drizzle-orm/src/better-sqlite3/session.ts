import type { Database, RunResult, Statement } from 'better-sqlite3';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { DrizzleQueryError, mapSQLiteConstraintError } from '~/errors.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type Query, sql } from '~/sql/sql.ts';
import type { SQLiteSyncDialect } from '~/sqlite-core/dialect.ts';
import { SQLiteTransaction } from '~/sqlite-core/index.ts';
import type { SelectedFieldsOrdered } from '~/sqlite-core/query-builders/select.types.ts';
import {
	type PreparedQueryConfig as PreparedQueryConfigBase,
	type SQLiteExecuteMethod,
	SQLitePreparedQuery as PreparedQueryBase,
	SQLiteSession,
	type SQLiteTransactionConfig,
} from '~/sqlite-core/session.ts';
import { mapResultRow } from '~/utils.ts';

export interface BetterSQLiteSessionOptions {
	logger?: Logger;
	cache?: Cache;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class BetterSQLiteSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends SQLiteSession<'sync', RunResult, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'BetterSQLiteSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: Database,
		dialect: SQLiteSyncDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		options: BetterSQLiteSessionOptions = {},
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
	): PreparedQuery<T> {
		const stmt = this.client.prepare(query.sql);
		return new PreparedQuery(
			stmt,
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

	override transaction<T>(
		transaction: (tx: BetterSQLiteTransaction<TFullSchema, TSchema>) => T,
		config: SQLiteTransactionConfig = {},
	): T {
		const tx = new BetterSQLiteTransaction('sync', this.dialect, this, this.schema);
		const nativeTx = this.client.transaction(transaction);
		return nativeTx[config.behavior ?? 'deferred'](tx);
	}
}

export class BetterSQLiteTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends SQLiteTransaction<'sync', RunResult, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'BetterSQLiteTransaction';

	override transaction<T>(transaction: (tx: BetterSQLiteTransaction<TFullSchema, TSchema>) => T): T {
		const savepointName = `sp${this.nestedIndex}`;
		const tx = new BetterSQLiteTransaction('sync', this.dialect, this.session, this.schema, this.nestedIndex + 1);
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

export class PreparedQuery<T extends PreparedQueryConfig = PreparedQueryConfig> extends PreparedQueryBase<
	{ type: 'sync'; run: RunResult; all: T['all']; get: T['get']; values: T['values']; execute: T['execute'] }
> {
	static override readonly [entityKind]: string = 'BetterSQLitePreparedQuery';

	constructor(
		private stmt: Statement,
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
		private customResultMapper?: (rows: unknown[][]) => unknown,
	) {
		super('sync', executeMethod, query, cache, queryMetadata, cacheConfig);
	}

	/** Wraps raw driver errors in `DrizzleQueryError`, mapping constraint violations to typed errors */
	private mapError(error: unknown): Error {
		if (error instanceof DrizzleQueryError) return error;
		return new DrizzleQueryError(
			this.query.sql,
			this.query.params,
			mapSQLiteConstraintError(error) ?? (error as Error),
		);
	}

	run(placeholderValues?: Record<string, unknown>): RunResult {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);
		try {
			return this.stmt.run(...params);
		} catch (e) {
			throw this.mapError(e);
		}
	}

	all(placeholderValues?: Record<string, unknown>): T['all'] {
		const { fields, joinsNotNullableMap, query, logger, stmt, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			const params = fillPlaceholders(query.params, placeholderValues ?? {});
			logger.logQuery(query.sql, params);
			try {
				return stmt.all(...params);
			} catch (e) {
				throw this.mapError(e);
			}
		}

		const rows = this.values(placeholderValues) as unknown[][];
		if (customResultMapper) {
			return customResultMapper(rows) as T['all'];
		}
		return rows.map((row) => mapResultRow(fields!, row, joinsNotNullableMap));
	}

	get(placeholderValues?: Record<string, unknown>): T['get'] {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);

		const { fields, stmt, joinsNotNullableMap, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			try {
				return stmt.get(...params);
			} catch (e) {
				throw this.mapError(e);
			}
		}

		try {
			const row = stmt.raw().get(...params) as unknown[];

			if (!row) {
				return undefined;
			}

			if (customResultMapper) {
				return customResultMapper([row]) as T['get'];
			}

			return mapResultRow(fields!, row, joinsNotNullableMap);
		} catch (e) {
			throw this.mapError(e);
		}
	}

	values(placeholderValues?: Record<string, unknown>): T['values'] {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);
		try {
			return this.stmt.raw().all(...params) as T['values'];
		} catch (e) {
			throw this.mapError(e);
		}
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}
}
