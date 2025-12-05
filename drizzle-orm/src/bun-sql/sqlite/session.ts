/// <reference types="bun-types" />

import type { SQL } from 'bun';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type Query } from '~/sql/sql.ts';
import type { SQLiteAsyncDialect } from '~/sqlite-core/dialect.ts';
import type { SelectedFieldsOrdered } from '~/sqlite-core/query-builders/select.types.ts';
import type {
	PreparedQueryConfig as PreparedQueryConfigBase,
	SQLiteExecuteMethod,
	SQLiteTransactionConfig,
} from '~/sqlite-core/session.ts';
import { SQLitePreparedQuery as PreparedQueryBase, SQLiteSession, SQLiteTransaction } from '~/sqlite-core/session.ts';
import { mapResultRow } from '~/utils.ts';

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'> & { type: 'async' };

export class BunSQLSQLitePreparedQuery<T extends PreparedQueryConfig> extends PreparedQueryBase<
	{ type: 'async'; run: void; all: T['all']; get: T['get']; values: T['values']; execute: T['execute'] }
> {
	static override readonly [entityKind]: string = 'BunSQLSQLitePreparedQuery';

	constructor(
		private client: SQL,
		query: Query,
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		private _isResponseInArrayMode: boolean,
		private customResultMapper?: (rows: unknown[][]) => unknown,
	) {
		super('async', executeMethod, query);
	}

	run(placeholderValues?: Record<string, unknown>) {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);
		return this.client.unsafe(this.query.sql, params as any[]);
	}

	async all(placeholderValues?: Record<string, unknown>): Promise<T['all']> {
		const { fields, query, logger, joinsNotNullableMap, customResultMapper, client } = this;
		if (!fields && !customResultMapper) {
			const params = fillPlaceholders(query.params, placeholderValues ?? {});
			logger.logQuery(query.sql, params);
			return client.unsafe(query.sql, params as any[]);
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
		const [row] = await this.client.unsafe(this.query.sql, params as any[]).values();

		if (!row) {
			return undefined;
		}

		const { fields, joinsNotNullableMap, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			return row;
		}

		if (customResultMapper) {
			return customResultMapper([row]) as T['get'];
		}

		console.error(this.query.sql, params, row);

		return mapResultRow(fields!, row, joinsNotNullableMap);
	}

	async values(placeholderValues?: Record<string, unknown>): Promise<T['values']> {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);
		return this.client.unsafe(this.query.sql, params as any[]).values();
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}
}

export interface BunSQLSessionOptions {
	logger?: Logger;
}

export class BunSQLSQLiteSession<
	TSQL extends SQL,
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends SQLiteSession<'async', void, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'BunSQLSQLiteSession';

	logger: Logger;

	constructor(
		public client: TSQL,
		dialect: SQLiteAsyncDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		readonly options: BunSQLSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	async exec(query: string): Promise<void> {
		await this.client.unsafe(query);
	}

	prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		isResponseInArrayMode: boolean,
		customResultMapper?: (rows: unknown[][]) => unknown,
	): BunSQLSQLitePreparedQuery<T> {
		return new BunSQLSQLitePreparedQuery(
			this.client,
			query,
			this.logger,
			fields,
			executeMethod,
			isResponseInArrayMode,
			customResultMapper,
		);
	}

	override transaction<T>(
		transaction: (tx: BunSQLSQLiteTransaction<TFullSchema, TSchema>) => T | Promise<T>,
		config?: SQLiteTransactionConfig,
	): Promise<T> {
		return this.client.transaction(config?.behavior ?? 'deferred', async (tx) => {
			const trx = new BunSQLSQLiteTransaction(this.dialect, this, this.schema!, tx, 0);
			return transaction(trx);
		});
	}
}

export class BunSQLSQLiteTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends SQLiteTransaction<'async', void, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'BunSQLSQLiteTransaction';

	constructor(
		dialect: SQLiteAsyncDialect,
		session: BunSQLSQLiteSession<SQL, TFullSchema, TSchema>,
		schema: RelationalSchemaConfig<TSchema>,
		private tx: Bun.TransactionSQL,
		nestedIndex: number,
	) {
		super('async', dialect, session, schema, nestedIndex);
	}

	override transaction<T>(
		transaction: (tx: BunSQLSQLiteTransaction<TFullSchema, TSchema>) => T | Promise<T>,
	): Promise<T> {
		if (this.nestedIndex === 2) {
			throw new Error('Nested transaction limit reached');
		}
		return this.tx.savepoint(async () => {
			return transaction(
				new BunSQLSQLiteTransaction(
					this.dialect,
					this.session as BunSQLSQLiteSession<SQL, TFullSchema, TSchema>,
					this.schema!,
					this.tx,
					this.nestedIndex + 1,
				),
			);
		});
	}
}
