import type { SQLiteDatabase, SQLiteRunResult, SQLiteStatement } from 'expo-sqlite';
import type * as V1 from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { AnyRelations } from '~/relations.ts';
import { fillPlaceholders, type Query, sql } from '~/sql/sql.ts';
import type { SQLiteSyncDialect } from '~/sqlite-core/dialect.ts';
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

export interface ExpoSQLiteSessionOptions {
	logger?: Logger;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class ExpoSQLiteSession<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends SQLiteSession<'sync', SQLiteRunResult, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'ExpoSQLiteSession';

	private logger: Logger;

	constructor(
		private client: SQLiteDatabase,
		dialect: SQLiteSyncDialect,
		private relations: TRelations,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		options: ExpoSQLiteSessionOptions = {},
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
	): ExpoSQLitePreparedQuery<T> {
		const stmt = this.client.prepareSync(query.sql);
		return new ExpoSQLitePreparedQuery(
			stmt,
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
	): ExpoSQLitePreparedQuery<T, true> {
		const stmt = this.client.prepareSync(query.sql);
		return new ExpoSQLitePreparedQuery(
			stmt,
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
		transaction: (tx: ExpoSQLiteTransaction<TFullSchema, TRelations, TSchema>) => T,
		config: SQLiteTransactionConfig = {},
	): T {
		const tx = new ExpoSQLiteTransaction('sync', this.dialect, this, this.relations, this.schema);
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

export class ExpoSQLiteTransaction<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends SQLiteTransaction<'sync', SQLiteRunResult, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'ExpoSQLiteTransaction';

	override transaction<T>(
		transaction: (tx: ExpoSQLiteTransaction<TFullSchema, TRelations, TSchema>) => T,
	): T {
		const savepointName = `sp${this.nestedIndex}`;
		const tx = new ExpoSQLiteTransaction(
			'sync',
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

export class ExpoSQLitePreparedQuery<
	T extends PreparedQueryConfig = PreparedQueryConfig,
	TIsRqbV2 extends boolean = false,
> extends SQLitePreparedQuery<
	{ type: 'sync'; run: SQLiteRunResult; all: T['all']; get: T['get']; values: T['values']; execute: T['execute'] }
> {
	static override readonly [entityKind]: string = 'ExpoSQLitePreparedQuery';

	constructor(
		private stmt: SQLiteStatement,
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
		super('sync', executeMethod, query);
	}

	run(placeholderValues?: Record<string, unknown>): SQLiteRunResult {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);
		const { changes, lastInsertRowId } = this.stmt.executeSync(params as any[]);
		return {
			changes,
			lastInsertRowId,
		};
	}

	all(placeholderValues?: Record<string, unknown>): T['all'] {
		if (this.isRqbV2Query) return this.allRqbV2(placeholderValues);

		const { fields, joinsNotNullableMap, query, logger, stmt, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			const params = fillPlaceholders(query.params, placeholderValues ?? {});
			logger.logQuery(query.sql, params);
			return stmt.executeSync(params as any[]).getAllSync();
		}

		const rows = this.values(placeholderValues) as unknown[][];
		if (customResultMapper) {
			return (customResultMapper as (rows: unknown[][]) => unknown)(rows) as T['all'];
		}
		return rows.map((row) => mapResultRow(fields!, row, joinsNotNullableMap));
	}

	private allRqbV2(placeholderValues?: Record<string, unknown>): T['all'] {
		const { query, logger, stmt, customResultMapper } = this;
		const params = fillPlaceholders(query.params, placeholderValues ?? {});
		logger.logQuery(query.sql, params);
		const rows = stmt.executeSync(params as any[]).getAllSync() as Record<string, unknown>[];

		return (customResultMapper as (rows: Record<string, unknown>[]) => unknown)(rows) as T['all'];
	}

	get(placeholderValues?: Record<string, unknown>): T['get'] {
		if (this.isRqbV2Query) return this.getRqbV2(placeholderValues);

		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);

		const { fields, stmt, joinsNotNullableMap, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			return stmt.executeSync(params as any[]).getFirstSync();
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

		const { stmt, customResultMapper } = this;
		const row = stmt.executeSync(params as any[]).getFirstSync() as Record<string, unknown> | undefined;

		if (!row) {
			return undefined;
		}

		return (customResultMapper as (rows: Record<string, unknown>[]) => unknown)([row]) as T['get'];
	}

	values(placeholderValues?: Record<string, unknown>): T['values'] {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);
		return this.stmt.executeForRawResultSync(params as any[]).getAllSync();
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}
}
