import type { SQLiteDatabase, SQLiteRunResult, SQLiteStatement } from 'expo-sqlite';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
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

export interface ExpoSQLiteAsyncSessionOptions {
	logger?: Logger;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class ExpoSQLiteAsyncSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends SQLiteSession<'async', SQLiteRunResult, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'ExpoSQLiteAsyncSession';

	private logger: Logger;

	constructor(
		private client: SQLiteDatabase,
		dialect: SQLiteAsyncDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		options: ExpoSQLiteAsyncSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		isResponseInArrayMode: boolean,
		customResultMapper?: (rows: unknown[][]) => unknown,
	): ExpoSQLiteAsyncPreparedQuery<T> {
		const stmt = this.client.prepareSync(query.sql);
		return new ExpoSQLiteAsyncPreparedQuery(
			stmt,
			query,
			this.logger,
			fields,
			executeMethod,
			isResponseInArrayMode,
			customResultMapper,
		);
	}

	override async transaction<T>(
		transaction: (tx: ExpoSQLiteAsyncTransaction<TFullSchema, TSchema>) => Promise<T>,
		config: SQLiteTransactionConfig = {},
	): Promise<T> {
		const tx = new ExpoSQLiteAsyncTransaction('async', this.dialect, this, this.schema);
		await this.run(sql.raw(`begin${config?.behavior ? ' ' + config.behavior : ''}`));
		try {
			const result = await transaction(tx);
			await this.run(sql`commit`);
			return result;
		} catch (err) {
			await this.run(sql`rollback`);
			throw err;
		}
	}
}

export class ExpoSQLiteAsyncTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends SQLiteTransaction<'async', SQLiteRunResult, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'ExpoSQLiteAsyncTransaction';

	override async transaction<T>(
		transaction: (tx: ExpoSQLiteAsyncTransaction<TFullSchema, TSchema>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex}`;
		const tx = new ExpoSQLiteAsyncTransaction(
			'async',
			this.dialect,
			this.session,
			this.schema,
			this.nestedIndex + 1,
		);
		await this.session.run(sql.raw(`savepoint ${savepointName}`));
		try {
			const result = await transaction(tx);
			await this.session.run(sql.raw(`release savepoint ${savepointName}`));
			return result;
		} catch (err) {
			await this.session.run(sql.raw(`rollback to savepoint ${savepointName}`));
			throw err;
		}
	}
}

export class ExpoSQLiteAsyncPreparedQuery<T extends PreparedQueryConfig = PreparedQueryConfig>
	extends SQLitePreparedQuery<
		{ type: 'async'; run: SQLiteRunResult; all: T['all']; get: T['get']; values: T['values']; execute: T['execute'] }
	>
{
	static override readonly [entityKind]: string = 'ExpoSQLiteAsyncPreparedQuery';

	constructor(
		private stmt: SQLiteStatement,
		query: Query,
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		private _isResponseInArrayMode: boolean,
		private customResultMapper?: (rows: unknown[][]) => unknown,
	) {
		super('async', executeMethod, query);
	}

	async run(placeholderValues?: Record<string, unknown>): Promise<SQLiteRunResult> {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);
		const result = await this.stmt.executeAsync(params as any[]);
		return {
			changes: result.changes,
			lastInsertRowId: result.lastInsertRowId,
		};
	}

	async all(placeholderValues?: Record<string, unknown>): Promise<T['all']> {
		const { fields, joinsNotNullableMap, query, logger, stmt, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			const params = fillPlaceholders(query.params, placeholderValues ?? {});
			logger.logQuery(query.sql, params);
			const result = await stmt.executeAsync(params as any[]);
			return result.getAllAsync();
		}

		const rows = await this.values(placeholderValues) as unknown[][];
		if (customResultMapper) {
			return customResultMapper(rows) as T['all'];
		}
		return rows.map((row) => mapResultRow(fields!, row, joinsNotNullableMap));
	}

	async get(placeholderValues?: Record<string, unknown>): Promise<T['get']> {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);

		const { fields, stmt, joinsNotNullableMap, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			const result = await stmt.executeAsync(params as any[]);
			return result.getFirstAsync();
		}

		const rows = await this.values(placeholderValues) as unknown[][];
		const row = rows[0];

		if (!row) {
			return undefined;
		}

		if (customResultMapper) {
			return customResultMapper(rows) as T['get'];
		}

		return mapResultRow(fields!, row, joinsNotNullableMap);
	}

	async values(placeholderValues?: Record<string, unknown>): Promise<T['values']> {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);
		const result = await this.stmt.executeForRawResultAsync(params as any[]);
		return result.getAllAsync();
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}
}
