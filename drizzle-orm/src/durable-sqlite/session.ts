import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { fillPlaceholders, type Query } from '~/sql/sql.ts';
import { type SQLiteSyncDialect, SQLiteTransaction } from '~/sqlite-core/index.ts';
import type { SelectedFieldsOrdered } from '~/sqlite-core/query-builders/select.types.ts';
import {
	type PreparedQueryConfig as PreparedQueryConfigBase,
	type SQLiteExecuteMethod,
	SQLiteSession,
	type SQLiteTransactionConfig,
} from '~/sqlite-core/session.ts';
import { SQLitePreparedQuery as PreparedQueryBase } from '~/sqlite-core/session.ts';
import { mapResultRow } from '~/utils.ts';

export interface SQLiteDOSessionOptions {
	logger?: Logger;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class SQLiteDOSession<TFullSchema extends Record<string, unknown>, TSchema extends TablesRelationalConfig>
	extends SQLiteSession<
		'sync',
		SqlStorageCursor<Record<string, SqlStorageValue>>,
		TFullSchema,
		TSchema
	>
{
	static override readonly [entityKind]: string = 'SQLiteDOSession';

	private logger: Logger;

	constructor(
		private client: DurableObjectStorage,
		dialect: SQLiteSyncDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		options: SQLiteDOSessionOptions = {},
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
	): SQLiteDOPreparedQuery<T> {
		return new SQLiteDOPreparedQuery(
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
		transaction: (
			tx: SQLiteTransaction<'sync', SqlStorageCursor<Record<string, SqlStorageValue>>, TFullSchema, TSchema>,
		) => T,
		_config?: SQLiteTransactionConfig,
	): T {
		const tx = new SQLiteDOTransaction('sync', this.dialect, this, this.schema);
		return this.client.transactionSync(() => transaction(tx));
	}
}

export class SQLiteDOTransaction<TFullSchema extends Record<string, unknown>, TSchema extends TablesRelationalConfig>
	extends SQLiteTransaction<
		'sync',
		SqlStorageCursor<Record<string, SqlStorageValue>>,
		TFullSchema,
		TSchema
	>
{
	static override readonly [entityKind]: string = 'SQLiteDOTransaction';

	override transaction<T>(transaction: (tx: SQLiteDOTransaction<TFullSchema, TSchema>) => T): T {
		const tx = new SQLiteDOTransaction('sync', this.dialect, this.session, this.schema, this.nestedIndex + 1);
		return this.session.transaction(() => transaction(tx));
	}
}

export class SQLiteDOPreparedQuery<T extends PreparedQueryConfig = PreparedQueryConfig> extends PreparedQueryBase<{
	type: 'sync';
	run: void;
	all: T['all'];
	get: T['get'];
	values: T['values'];
	execute: T['execute'];
}> {
	static override readonly [entityKind]: string = 'SQLiteDOPreparedQuery';

	constructor(
		private client: DurableObjectStorage,
		query: Query,
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		private _isResponseInArrayMode: boolean,
		private customResultMapper?: (rows: unknown[][]) => unknown,
	) {
		// 3-6 params are for cache. As long as we don't support sync cache - it will be skipped here
		super('sync', executeMethod, query, undefined, undefined, undefined);
	}

	run(placeholderValues?: Record<string, unknown>): void {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);

		params.length > 0 ? this.client.sql.exec(this.query.sql, ...params) : this.client.sql.exec(this.query.sql);
	}

	all(placeholderValues?: Record<string, unknown>): T['all'] {
		const { fields, joinsNotNullableMap, query, logger, client, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			const params = fillPlaceholders(query.params, placeholderValues ?? {});
			logger.logQuery(query.sql, params);

			return params.length > 0 ? client.sql.exec(query.sql, ...params).toArray() : client.sql.exec(query.sql).toArray();
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

		const { fields, client, joinsNotNullableMap, customResultMapper, query } = this;
		if (!fields && !customResultMapper) {
			return (params.length > 0 ? client.sql.exec(query.sql, ...params) : client.sql.exec(query.sql)).next().value;
		}

		const rows = this.values(placeholderValues) as unknown[][];
		const row = rows[0];

		if (!row) {
			return undefined;
		}

		if (customResultMapper) {
			return customResultMapper(rows) as T['get'];
		}

		return mapResultRow(fields!, row, joinsNotNullableMap);
	}

	values(placeholderValues?: Record<string, unknown>): T['values'] {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);

		const res = params.length > 0
			? this.client.sql.exec(this.query.sql, ...params)
			: this.client.sql.exec(this.query.sql);

		// @ts-ignore .raw().toArray() exists
		return res.raw().toArray();
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}
}
