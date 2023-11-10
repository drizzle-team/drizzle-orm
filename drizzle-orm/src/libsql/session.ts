import type { Client, InArgs, InStatement, ResultSet, Transaction } from '@libsql/client';
import type { BatchItem as BatchItem } from '~/batch.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import type { PreparedQuery } from '~/session.ts';
import { fillPlaceholders, type Query, sql } from '~/sql/sql.ts';
import type { SQLiteAsyncDialect } from '~/sqlite-core/dialect.ts';
import { SQLiteTransaction } from '~/sqlite-core/index.ts';
import type { SelectedFieldsOrdered } from '~/sqlite-core/query-builders/select.types.ts';
import type {
	PreparedQueryConfig as PreparedQueryConfigBase,
	SQLiteExecuteMethod,
	SQLiteTransactionConfig,
} from '~/sqlite-core/session.ts';
import { SQLitePreparedQuery, SQLiteSession } from '~/sqlite-core/session.ts';
import { mapResultRow } from '~/utils.ts';

export interface LibSQLSessionOptions {
	logger?: Logger;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class LibSQLSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends SQLiteSession<'async', ResultSet, TFullSchema, TSchema> {
	static readonly [entityKind]: string = 'LibSQLSession';

	private logger: Logger;

	constructor(
		private client: Client,
		dialect: SQLiteAsyncDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		private options: LibSQLSessionOptions,
		private tx: Transaction | undefined,
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		customResultMapper?: (rows: unknown[][]) => unknown,
	): LibSQLPreparedQuery<T> {
		return new LibSQLPreparedQuery(
			this.client,
			query,
			this.logger,
			fields,
			this.tx,
			executeMethod,
			customResultMapper,
		);
	}

	async batch<T extends BatchItem<'sqlite'>[] | readonly BatchItem<'sqlite'>[]>(queries: T) {
		const preparedQueries: PreparedQuery[] = [];
		const builtQueries: InStatement[] = [];

		for (const query of queries) {
			const preparedQuery = query.prepare();
			const builtQuery = preparedQuery.getQuery();
			preparedQueries.push(preparedQuery);
			builtQueries.push({ sql: builtQuery.sql, args: builtQuery.params as InArgs });
		}

		const batchResults = await this.client.batch(builtQueries);
		return batchResults.map((result, i) => preparedQueries[i]!.mapResult(result, true));
	}

	override async transaction<T>(
		transaction: (db: LibSQLTransaction<TFullSchema, TSchema>) => T | Promise<T>,
		_config?: SQLiteTransactionConfig,
	): Promise<T> {
		// TODO: support transaction behavior
		const libsqlTx = await this.client.transaction();
		const session = new LibSQLSession(this.client, this.dialect, this.schema, this.options, libsqlTx);
		const tx = new LibSQLTransaction('async', this.dialect, session, this.schema);
		try {
			const result = await transaction(tx);
			await libsqlTx.commit();
			return result;
		} catch (err) {
			await libsqlTx.rollback();
			throw err;
		}
	}

	override extractRawAllValueFromBatchResult(result: unknown): unknown {
		return (result as ResultSet).rows;
	}

	override extractRawGetValueFromBatchResult(result: unknown): unknown {
		return (result as ResultSet).rows[0];
	}

	override extractRawValuesValueFromBatchResult(result: unknown): unknown {
		return (result as ResultSet).rows;
	}
}

export class LibSQLTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends SQLiteTransaction<'async', ResultSet, TFullSchema, TSchema> {
	static readonly [entityKind]: string = 'LibSQLTransaction';

	override async transaction<T>(transaction: (tx: LibSQLTransaction<TFullSchema, TSchema>) => Promise<T>): Promise<T> {
		const savepointName = `sp${this.nestedIndex}`;
		const tx = new LibSQLTransaction('async', this.dialect, this.session, this.schema, this.nestedIndex + 1);
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

export class LibSQLPreparedQuery<T extends PreparedQueryConfig = PreparedQueryConfig> extends SQLitePreparedQuery<
	{ type: 'async'; run: ResultSet; all: T['all']; get: T['get']; values: T['values']; execute: T['execute'] }
> {
	static readonly [entityKind]: string = 'LibSQLPreparedQuery';

	constructor(
		private client: Client,
		query: Query,
		private logger: Logger,
		/** @internal */ public fields: SelectedFieldsOrdered | undefined,
		private tx: Transaction | undefined,
		executeMethod: SQLiteExecuteMethod,
		/** @internal */ public customResultMapper?: (
			rows: unknown[][],
			mapColumnValue?: (value: unknown) => unknown,
		) => unknown,
	) {
		super('async', executeMethod, query);
		this.customResultMapper = customResultMapper;
		this.fields = fields;
	}

	run(placeholderValues?: Record<string, unknown>): Promise<ResultSet> {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);
		const stmt: InStatement = { sql: this.query.sql, args: params as InArgs };
		return this.tx ? this.tx.execute(stmt) : this.client.execute(stmt);
	}

	async all(placeholderValues?: Record<string, unknown>): Promise<T['all']> {
		const { fields, logger, query, tx, client, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			const params = fillPlaceholders(query.params, placeholderValues ?? {});
			logger.logQuery(query.sql, params);
			const stmt: InStatement = { sql: query.sql, args: params as InArgs };
			return (tx ? tx.execute(stmt) : client.execute(stmt)).then(({ rows }) => this.mapAllResult(rows));
		}

		const rows = await this.values(placeholderValues) as unknown[][];

		return this.mapAllResult(rows);
	}

	override mapAllResult(rows: unknown, isFromBatch?: boolean): unknown {
		if (isFromBatch) {
			rows = (rows as ResultSet).rows;
		}

		if (!this.fields && !this.customResultMapper) {
			return (rows as unknown[]).map((row) => normalizeRow(row));
		}

		if (this.customResultMapper) {
			return this.customResultMapper(rows as unknown[][], normalizeFieldValue) as T['all'];
		}

		return (rows as unknown[]).map((row) => {
			return mapResultRow(
				this.fields!,
				Array.prototype.slice.call(row).map((v) => normalizeFieldValue(v)),
				this.joinsNotNullableMap,
			);
		});
	}

	async get(placeholderValues?: Record<string, unknown>): Promise<T['get']> {
		const { fields, logger, query, tx, client, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			const params = fillPlaceholders(query.params, placeholderValues ?? {});
			logger.logQuery(query.sql, params);
			const stmt: InStatement = { sql: query.sql, args: params as InArgs };
			return (tx ? tx.execute(stmt) : client.execute(stmt)).then(({ rows }) => this.mapGetResult(rows));
		}

		const rows = await this.values(placeholderValues) as unknown[][];

		return this.mapGetResult(rows);
	}

	override mapGetResult(rows: unknown, isFromBatch?: boolean): unknown {
		if (isFromBatch) {
			rows = (rows as ResultSet).rows;
		}

		const row = (rows as unknown[])[0];

		if (!this.fields && !this.customResultMapper) {
			return normalizeRow(row);
		}

		if (!row) {
			return undefined;
		}

		if (this.customResultMapper) {
			return this.customResultMapper(rows as unknown[][], normalizeFieldValue) as T['get'];
		}

		return mapResultRow(
			this.fields!,
			Array.prototype.slice.call(row).map((v) => normalizeFieldValue(v)),
			this.joinsNotNullableMap,
		);
	}

	values(placeholderValues?: Record<string, unknown>): Promise<T['values']> {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);
		const stmt: InStatement = { sql: this.query.sql, args: params as InArgs };
		return (this.tx ? this.tx.execute(stmt) : this.client.execute(stmt)).then(({ rows }) => rows) as Promise<
			T['values']
		>;
	}
}

function normalizeRow(obj: any) {
	// The libSQL node-sqlite3 compatibility wrapper returns rows
	// that can be accessed both as objects and arrays. Let's
	// turn them into objects what's what other SQLite drivers
	// do.
	return Object.keys(obj).reduce((acc: Record<string, any>, key) => {
		if (Object.prototype.propertyIsEnumerable.call(obj, key)) {
			acc[key] = obj[key];
		}
		return acc;
	}, {});
}

function normalizeFieldValue(value: unknown) {
	if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) { // eslint-disable-line no-instanceof/no-instanceof
		if (typeof Buffer !== 'undefined') {
			if (!(value instanceof Buffer)) { // eslint-disable-line no-instanceof/no-instanceof
				return Buffer.from(value);
			}
			return value;
		}
		if (typeof TextDecoder !== 'undefined') {
			return new TextDecoder().decode(value);
		}
		throw new Error('TextDecoder is not available. Please provide either Buffer or TextDecoder polyfill.');
	}
	return value;
}
