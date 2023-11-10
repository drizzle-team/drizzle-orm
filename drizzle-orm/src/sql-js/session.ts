import type { BindParams, Database, Statement } from 'sql.js';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type Query, sql } from '~/sql/sql.ts';
import type { SQLiteSyncDialect } from '~/sqlite-core/dialect.ts';
import { SQLiteTransaction } from '~/sqlite-core/index.ts';
import type { SelectedFieldsOrdered } from '~/sqlite-core/query-builders/select.types.ts';
import type {
	PreparedQueryConfig as PreparedQueryConfigBase,
	SQLiteExecuteMethod,
	SQLiteTransactionConfig,
} from '~/sqlite-core/session.ts';
import { SQLitePreparedQuery as PreparedQueryBase, SQLiteSession } from '~/sqlite-core/session.ts';
import { mapResultRow } from '~/utils.ts';

export interface SQLJsSessionOptions {
	logger?: Logger;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class SQLJsSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends SQLiteSession<'sync', void, TFullSchema, TSchema> {
	static readonly [entityKind]: string = 'SQLJsSession';

	private logger: Logger;

	constructor(
		private client: Database,
		dialect: SQLiteSyncDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		options: SQLJsSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
	): PreparedQuery<T> {
		const stmt = this.client.prepare(query.sql);
		return new PreparedQuery(stmt, query, this.logger, fields, executeMethod);
	}

	override prepareOneTimeQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		customResultMapper?: (rows: unknown[][]) => unknown,
	): PreparedQuery<T> {
		const stmt = this.client.prepare(query.sql);
		return new PreparedQuery(
			stmt,
			query,
			this.logger,
			fields,
			executeMethod,
			customResultMapper,
			true,
		);
	}

	override transaction<T>(
		transaction: (tx: SQLJsTransaction<TFullSchema, TSchema>) => T,
		config: SQLiteTransactionConfig = {},
	): T {
		const tx = new SQLJsTransaction('sync', this.dialect, this, this.schema);
		this.run(sql.raw(`begin${config.behavior ? ` ${config.behavior}` : ''}`));
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

export class SQLJsTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends SQLiteTransaction<'sync', void, TFullSchema, TSchema> {
	static readonly [entityKind]: string = 'SQLJsTransaction';

	override transaction<T>(transaction: (tx: SQLJsTransaction<TFullSchema, TSchema>) => T): T {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new SQLJsTransaction('sync', this.dialect, this.session, this.schema, this.nestedIndex + 1);
		tx.run(sql.raw(`savepoint ${savepointName}`));
		try {
			const result = transaction(tx);
			tx.run(sql.raw(`release savepoint ${savepointName}`));
			return result;
		} catch (err) {
			tx.run(sql.raw(`rollback to savepoint ${savepointName}`));
			throw err;
		}
	}
}

export class PreparedQuery<T extends PreparedQueryConfig = PreparedQueryConfig> extends PreparedQueryBase<
	{ type: 'sync'; run: void; all: T['all']; get: T['get']; values: T['values']; execute: T['execute'] }
> {
	static readonly [entityKind]: string = 'SQLJsPreparedQuery';

	constructor(
		private stmt: Statement,
		query: Query,
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		private customResultMapper?: (rows: unknown[][], mapColumnValue?: (value: unknown) => unknown) => unknown,
		private isOneTimeQuery = false,
	) {
		super('sync', executeMethod, query);
	}

	run(placeholderValues?: Record<string, unknown>): void {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);
		const result = this.stmt.run(params as BindParams);

		if (this.isOneTimeQuery) {
			this.free();
		}

		return result;
	}

	all(placeholderValues?: Record<string, unknown>): T['all'] {
		const { fields, joinsNotNullableMap, logger, query, stmt, isOneTimeQuery, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			const params = fillPlaceholders(query.params, placeholderValues ?? {});
			logger.logQuery(query.sql, params);
			stmt.bind(params as BindParams);
			const rows: unknown[] = [];
			while (stmt.step()) {
				rows.push(stmt.getAsObject());
			}

			if (isOneTimeQuery) {
				this.free();
			}

			return rows;
		}

		const rows = this.values(placeholderValues) as unknown[][];

		if (customResultMapper) {
			return customResultMapper(rows, normalizeFieldValue) as T['all'];
		}

		return rows.map((row) => mapResultRow(fields!, row.map((v) => normalizeFieldValue(v)), joinsNotNullableMap));
	}

	get(placeholderValues?: Record<string, unknown>): T['get'] {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);

		const { fields, stmt, isOneTimeQuery, joinsNotNullableMap, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			const result = stmt.getAsObject(params as BindParams);

			if (isOneTimeQuery) {
				this.free();
			}

			return result;
		}

		const row = stmt.get(params as BindParams);

		if (isOneTimeQuery) {
			this.free();
		}

		if (!row || (row.length === 0 && fields!.length > 0)) {
			return undefined;
		}

		if (customResultMapper) {
			return customResultMapper([row], normalizeFieldValue) as T['get'];
		}

		return mapResultRow(fields!, row.map((v) => normalizeFieldValue(v)), joinsNotNullableMap);
	}

	values(placeholderValues?: Record<string, unknown>): T['values'] {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);
		this.stmt.bind(params as BindParams);
		const rows: unknown[] = [];
		while (this.stmt.step()) {
			rows.push(this.stmt.get());
		}

		if (this.isOneTimeQuery) {
			this.free();
		}

		return rows;
	}

	free(): boolean {
		return this.stmt.free();
	}
}

function normalizeFieldValue(value: unknown) {
	if (value instanceof Uint8Array) { // eslint-disable-line no-instanceof/no-instanceof
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
