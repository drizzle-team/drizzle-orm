import type * as V1 from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { AnyRelations } from '~/relations.ts';
import { fillPlaceholders, type Query } from '~/sql/sql.ts';
import { type SQLiteSyncDialect, SQLiteTransaction } from '~/sqlite-core/index.ts';
import type { SelectedFieldsOrdered } from '~/sqlite-core/query-builders/select.types.ts';
import {
	type PreparedQueryConfig as PreparedQueryConfigBase,
	type SQLiteExecuteMethod,
	SQLitePreparedQuery as PreparedQueryBase,
	SQLiteSession,
	type SQLiteTransactionConfig,
} from '~/sqlite-core/session.ts';
import { mapResultRow } from '~/utils.ts';

export interface SQLiteDOSessionOptions {
	logger?: Logger;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class SQLiteDOSession<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends SQLiteSession<
	'sync',
	SqlStorageCursor<Record<string, SqlStorageValue>>,
	TFullSchema,
	TRelations,
	TSchema
> {
	static override readonly [entityKind]: string = 'SQLiteDOSession';

	private logger: Logger;

	constructor(
		private client: DurableObjectStorage,
		dialect: SQLiteSyncDialect,
		private relations: TRelations,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
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

	prepareRelationalQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		customResultMapper: (rows: Record<string, unknown>[]) => unknown,
	): SQLiteDOPreparedQuery<T, true> {
		return new SQLiteDOPreparedQuery(
			this.client,
			query,
			this.logger,
			fields,
			executeMethod,
			false,
			customResultMapper,
			true,
		);
	}

	override transaction<T>(
		transaction: (
			tx: SQLiteTransaction<
				'sync',
				SqlStorageCursor<Record<string, SqlStorageValue>>,
				TFullSchema,
				TRelations,
				TSchema
			>,
		) => T,
		_config?: SQLiteTransactionConfig,
	): T {
		const tx = new SQLiteDOTransaction('sync', this.dialect, this, this.relations, this.schema, undefined, false, true);
		return this.client.transactionSync(() => transaction(tx));
	}
}

export class SQLiteDOTransaction<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends SQLiteTransaction<
	'sync',
	SqlStorageCursor<Record<string, SqlStorageValue>>,
	TFullSchema,
	TRelations,
	TSchema
> {
	static override readonly [entityKind]: string = 'SQLiteDOTransaction';

	override transaction<T>(
		transaction: (tx: SQLiteDOTransaction<TFullSchema, TRelations, TSchema>) => T,
	): T {
		const tx = new SQLiteDOTransaction(
			'sync',
			this.dialect,
			this.session,
			this.relations,
			this.schema,
			this.nestedIndex + 1,
			false,
			true,
		);
		return this.session.transaction(() => transaction(tx));
	}
}

export class SQLiteDOPreparedQuery<
	T extends PreparedQueryConfig = PreparedQueryConfig,
	TIsRqbV2 extends boolean = false,
> extends PreparedQueryBase<{
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
		private customResultMapper?: (
			rows: TIsRqbV2 extends true ? Record<string, unknown>[] : unknown[][],
		) => unknown,
		private isRqbV2Query?: TIsRqbV2,
	) {
		// 3-6 params are for cache. As long as we don't support sync cache - it will be skipped here
		super('sync', executeMethod, query, undefined, undefined, undefined);
	}

	run(placeholderValues?: Record<string, unknown>): SqlStorageCursor<Record<string, SqlStorageValue>> {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);

		if (params.length > 0) {
			return this.client.sql.exec(this.query.sql, ...params);
		}
		return this.client.sql.exec(this.query.sql);
	}

	all(placeholderValues?: Record<string, unknown>): T['all'] {
		if (this.isRqbV2Query) return this.allRqbV2(placeholderValues);

		const { fields, joinsNotNullableMap, query, logger, client, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			const params = fillPlaceholders(query.params, placeholderValues ?? {});
			logger.logQuery(query.sql, params);

			return params.length > 0 ? client.sql.exec(query.sql, ...params).toArray() : client.sql.exec(query.sql).toArray();
		}

		const rows = this.values(placeholderValues) as unknown[][];

		if (customResultMapper) {
			return (customResultMapper as (rows: unknown[][]) => unknown)(rows) as T['all'];
		}

		return rows.map((row) => mapResultRow(fields!, row, joinsNotNullableMap));
	}

	private allRqbV2(placeholderValues?: Record<string, unknown>): T['all'] {
		const { query, logger, client, customResultMapper } = this;

		const params = fillPlaceholders(query.params, placeholderValues ?? {});
		logger.logQuery(query.sql, params);

		const rows = params.length > 0
			? client.sql.exec(query.sql, ...params).toArray()
			: client.sql.exec(query.sql).toArray();

		return (customResultMapper as (rows: Record<string, unknown>[]) => unknown)(rows);
	}

	get(placeholderValues?: Record<string, unknown>): T['get'] {
		if (this.isRqbV2Query) return this.getRqbV2(placeholderValues);

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
			return (customResultMapper as (rows: unknown[][]) => unknown)(rows) as T['get'];
		}

		return mapResultRow(fields!, row, joinsNotNullableMap);
	}

	private getRqbV2(placeholderValues?: Record<string, unknown>): T['get'] {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);

		const { client, customResultMapper, query } = this;

		const row = (params.length > 0 ? client.sql.exec(query.sql, ...params) : client.sql.exec(query.sql)).next().value;

		if (!row) {
			return undefined;
		}

		return (customResultMapper as (rows: Record<string, unknown>[]) => unknown)([row]) as T['get'];
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
