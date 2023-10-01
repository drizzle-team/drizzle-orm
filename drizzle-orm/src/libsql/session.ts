import { type Client, type InArgs, type InStatement, type ResultSet, type Transaction } from '@libsql/client';
import { entityKind, is } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import { type RelationalSchemaConfig, type TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type Query, sql } from '~/sql/index.ts';
import type { SQLiteAsyncDialect } from '~/sqlite-core/dialect.ts';
import { SQLiteDelete, SQLiteInsert, SQLiteSelect, SQLiteTransaction, SQLiteUpdate } from '~/sqlite-core/index.ts';
import { SQLiteRelationalQuery } from '~/sqlite-core/query-builders/query.ts';
import { SQLiteRaw } from '~/sqlite-core/query-builders/raw.ts';
import type { SelectedFieldsOrdered } from '~/sqlite-core/query-builders/select.types.ts';
import {
	type PreparedQueryConfig as PreparedQueryConfigBase,
	type SQLiteExecuteMethod,
	type SQLiteTransactionConfig,
} from '~/sqlite-core/session.ts';
import { PreparedQuery as PreparedQueryBase, SQLiteSession } from '~/sqlite-core/session.ts';
import { mapResultRow } from '~/utils.ts';
import type { BatchParameters } from './driver.ts';

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
	): PreparedQuery<T> {
		return new PreparedQuery(
			this.client,
			query.sql,
			query.params,
			this.logger,
			fields,
			this.tx,
			executeMethod,
			customResultMapper,
		);
	}

	/*override */ batch<U extends BatchParameters, T extends Readonly<[U, ...U[]]>>(queries: T) {
		const queryToType: (
			| { mode: 'all' }
			| {
				mode: 'all_mapped';
				config: { fields: SelectedFieldsOrdered; joinsNotNullableMap?: Record<string, boolean> };
			}
			| { mode: 'get' }
			| { mode: 'values' }
			| { mode: 'raw' }
			| { mode: 'rqb'; mapper: any }
		)[] = [];

		const builtQueries: InStatement[] = queries.map((query) => {
			const builtQuery = this.dialect.sqlToQuery(query.getSQL());

			if (is(query, SQLiteSelect)) {
				// @ts-expect-error
				const prepared = query.prepare() as PreparedQuery;
				prepared.fields === undefined
					? queryToType.push({ mode: 'all' })
					: queryToType.push({
						mode: 'all_mapped',
						config: { fields: prepared.fields, joinsNotNullableMap: prepared.joinsNotNullableMap },
					});
			} else if (is(query, SQLiteInsert) || is(query, SQLiteUpdate) || is(query, SQLiteDelete)) {
				queryToType.push(
					// @ts-expect-error
					query.config.returning
						? {
							mode: 'all_mapped',
							config: { fields: query.config.returning },
						}
						: { mode: 'raw' },
				);
			} else if (is(query, SQLiteRaw)) {
				queryToType.push(
					query.config.action === 'run' ? { mode: 'raw' } : { mode: query.config.action },
				);
			} else if (is(query, SQLiteRelationalQuery)) {
				const preparedRqb = query.prepare() as PreparedQuery;
				queryToType.push({ mode: 'rqb', mapper: preparedRqb.customResultMapper });
			}

			return { sql: builtQuery.sql, args: builtQuery.params as InArgs };
		});

		const res = this.client.batch(builtQueries).then((stmt) =>
			stmt.map(({ rows }, index) => {
				const action = queryToType[index]!;
				if (action.mode === 'all') {
					return rows.map((row) => normalizeRow(row));
				}
				if (action.mode === 'all_mapped') {
					return rows.map((row) => {
						return mapResultRow(
							action.config.fields,
							Array.prototype.slice.call(row).map((v) => normalizeFieldValue(v)),
							action.config.joinsNotNullableMap,
						);
					});
				}
				if (action.mode === 'get') {
					return normalizeRow(rows[0]);
				}
				if (action.mode === 'values') {
					return rows.map((row) => Object.values(row));
				}
				if (action.mode === 'raw') {
					return stmt[index];
				}
				return action.mapper(rows, normalizeFieldValue);
			})
		);
		return res;
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

export class PreparedQuery<T extends PreparedQueryConfig = PreparedQueryConfig> extends PreparedQueryBase<
	{ type: 'async'; run: ResultSet; all: T['all']; get: T['get']; values: T['values']; execute: T['execute'] }
> {
	static readonly [entityKind]: string = 'LibSQLPreparedQuery';

	/** @internal */
	customResultMapper?: (rows: unknown[][], mapColumnValue?: (value: unknown) => unknown) => unknown;

	/** @internal */
	fields?: SelectedFieldsOrdered;

	constructor(
		private client: Client,
		private queryString: string,
		private params: unknown[],
		private logger: Logger,
		fields: SelectedFieldsOrdered | undefined,
		private tx: Transaction | undefined,
		executeMethod: SQLiteExecuteMethod,
		customResultMapper?: (rows: unknown[][], mapColumnValue?: (value: unknown) => unknown) => unknown,
	) {
		super('async', executeMethod);
		this.customResultMapper = customResultMapper;
		this.fields = fields;
	}

	run(placeholderValues?: Record<string, unknown>): Promise<ResultSet> {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		const stmt: InStatement = { sql: this.queryString, args: params as InArgs };
		return this.tx ? this.tx.execute(stmt) : this.client.execute(stmt);
	}

	async all(placeholderValues?: Record<string, unknown>): Promise<T['all']> {
		const { fields, joinsNotNullableMap, logger, queryString, tx, client, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			const params = fillPlaceholders(this.params, placeholderValues ?? {});
			logger.logQuery(queryString, params);
			const stmt: InStatement = { sql: queryString, args: params as InArgs };
			return (tx ? tx.execute(stmt) : client.execute(stmt)).then(({ rows }) => rows.map((row) => normalizeRow(row)));
		}

		const rows = await this.values(placeholderValues) as unknown[][];

		if (customResultMapper) {
			return customResultMapper(rows, normalizeFieldValue) as T['all'];
		}

		return rows.map((row) => {
			return mapResultRow(
				fields!,
				Array.prototype.slice.call(row).map((v) => normalizeFieldValue(v)),
				joinsNotNullableMap,
			);
		});
	}

	async get(placeholderValues?: Record<string, unknown>): Promise<T['get']> {
		const { fields, joinsNotNullableMap, logger, queryString, tx, client, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			const params = fillPlaceholders(this.params, placeholderValues ?? {});
			logger.logQuery(queryString, params);
			const stmt: InStatement = { sql: queryString, args: params as InArgs };
			return (tx ? tx.execute(stmt) : client.execute(stmt)).then(({ rows }) => normalizeRow(rows[0]));
		}

		const rows = await this.values(placeholderValues) as unknown[][];

		if (!rows[0]) {
			return undefined;
		}

		if (customResultMapper) {
			return customResultMapper(rows, normalizeFieldValue) as T['get'];
		}

		return mapResultRow(
			fields!,
			Array.prototype.slice.call(rows[0]).map((v) => normalizeFieldValue(v)),
			joinsNotNullableMap,
		);
	}

	values(placeholderValues?: Record<string, unknown>): Promise<T['values']> {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		const stmt: InStatement = { sql: this.queryString, args: params as InArgs };
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
	if (value instanceof ArrayBuffer) { // eslint-disable-line no-instanceof/no-instanceof
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
