import type { DatabaseSync, SQLInputValue, StatementResultingChanges, StatementSync } from 'node:sqlite';
import type * as V1 from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { AnyRelations } from '~/relations.ts';
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
import { type DrizzleTypeError, mapResultRow } from '~/utils.ts';

export interface NodeSQLiteSessionOptions {
	logger?: Logger;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class NodeSQLiteSession<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends SQLiteSession<'sync', StatementResultingChanges, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'SQLJsSession';

	private logger: Logger;

	constructor(
		private client: DatabaseSync,
		dialect: SQLiteSyncDialect,
		private relations: TRelations,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		options: NodeSQLiteSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		isResponseInArrayMode: boolean,
	): NodeSQLitePreparedQuery<T> {
		const stmt = this.client.prepare(query.sql);
		return new NodeSQLitePreparedQuery(stmt, query, this.logger, fields, executeMethod, isResponseInArrayMode);
	}

	prepareRelationalQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		customResultMapper: (rows: Record<string, unknown>[]) => unknown,
	): NodeSQLitePreparedQuery<T, true> {
		const stmt = this.client.prepare(query.sql);
		return new NodeSQLitePreparedQuery(
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
		transaction: (tx: NodeSQLiteTransaction<TFullSchema, TRelations, TSchema>) => T,
		config: SQLiteTransactionConfig = {},
	): T {
		const tx = new NodeSQLiteTransaction('sync', this.dialect, this, this.relations, this.schema);
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

export class NodeSQLiteTransaction<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends SQLiteTransaction<'sync', StatementResultingChanges, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'SQLJsTransaction';

	override transaction<T>(
		transaction: (
			tx: NodeSQLiteTransaction<TFullSchema, TRelations, TSchema>,
		) => T extends Promise<any> ? DrizzleTypeError<"Sync drivers can't use async functions in transactions!">
			: T,
	): T {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new NodeSQLiteTransaction(
			'sync',
			this.dialect,
			this.session,
			this.relations,
			this.schema,
			this.nestedIndex + 1,
		);
		tx.run(sql.raw(`savepoint ${savepointName}`));
		try {
			const result = transaction(tx);
			tx.run(sql.raw(`release savepoint ${savepointName}`));
			return result as T;
		} catch (err) {
			tx.run(sql.raw(`rollback to savepoint ${savepointName}`));
			throw err;
		}
	}
}

export class NodeSQLitePreparedQuery<
	T extends PreparedQueryConfig = PreparedQueryConfig,
	TIsRqbV2 extends boolean = false,
> extends PreparedQueryBase<
	{ type: 'sync'; run: void; all: T['all']; get: T['get']; values: T['values']; execute: T['execute'] }
> {
	static override readonly [entityKind]: string = 'SQLJsPreparedQuery';

	constructor(
		private stmt: StatementSync,
		query: Query,
		private logger: Logger,
		private fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		private _isResponseInArrayMode: boolean,
		private customResultMapper?: (
			rows: TIsRqbV2 extends true ? Record<string, unknown>[] : unknown[][],
			mapColumnValue?: (value: unknown) => unknown,
		) => unknown,
		private isRqbV2Query?: TIsRqbV2,
	) {
		super('sync', executeMethod, query);
	}

	run(placeholderValues: Record<string, unknown> = {}): StatementResultingChanges {
		const { stmt } = this;

		const params = fillPlaceholders(this.query.params, placeholderValues);
		this.logger.logQuery(this.query.sql, params);

		const result = stmt.run(...params as SQLInputValue[]);

		return result;
	}

	all(placeholderValues: Record<string, unknown> = {}): T['all'] {
		if (this.isRqbV2Query) return this.allRqbV2(placeholderValues);
		const { stmt } = this;

		const { fields, joinsNotNullableMap, logger, query, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			const params = fillPlaceholders(query.params, placeholderValues);
			logger.logQuery(query.sql, params);

			stmt.setReturnArrays(false);
			const rows = stmt.all(...params as SQLInputValue[]);

			return rows;
		}

		stmt.setReturnArrays(true);
		const rows = this.values(placeholderValues) as unknown[][];

		if (customResultMapper) {
			return (customResultMapper as (
				rows: unknown[][],
				mapColumnValue?: (value: unknown) => unknown,
			) => unknown)(rows) as T['all'];
		}

		return rows.map((row) => mapResultRow(fields!, row, joinsNotNullableMap));
	}

	private allRqbV2(placeholderValues: Record<string, unknown> = {}): T['all'] {
		const { stmt } = this;

		const { logger, query, customResultMapper } = this;
		const params = fillPlaceholders(query.params, placeholderValues);
		logger.logQuery(query.sql, params);

		stmt.setReturnArrays(false);
		const rows = stmt.all(...params as SQLInputValue[]);

		return (customResultMapper as (
			rows: Record<string, unknown>[],
			mapColumnValue?: (value: unknown) => unknown,
		) => unknown)(rows) as T['all'];
	}

	get(placeholderValues: Record<string, unknown> = {}): T['get'] {
		if (this.isRqbV2Query) return this.getRqbV2(placeholderValues);
		const { stmt } = this;

		const params = fillPlaceholders(this.query.params, placeholderValues);
		this.logger.logQuery(this.query.sql, params);

		const { fields, joinsNotNullableMap, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			stmt.setReturnArrays(false);
			const result = stmt.get(...params as SQLInputValue[]);

			return result;
		}

		stmt.setReturnArrays(true);
		const row = stmt.get(...params as SQLInputValue[]) as any as unknown[];

		if (!row) {
			return undefined;
		}

		if (customResultMapper) {
			return (customResultMapper as (
				rows: unknown[][],
				mapColumnValue?: (value: unknown) => unknown,
			) => unknown)([row]) as T['get'];
		}

		return mapResultRow(fields!, row, joinsNotNullableMap);
	}

	private getRqbV2(placeholderValues: Record<string, unknown> = {}): T['get'] {
		const { stmt } = this;

		const params = fillPlaceholders(this.query.params, placeholderValues);
		this.logger.logQuery(this.query.sql, params);

		const { customResultMapper } = this;

		stmt.setReturnArrays(false);
		const row = stmt.get(...params as SQLInputValue[]);

		if (!row) {
			return undefined;
		}

		return (customResultMapper as (
			rows: Record<string, unknown>[],
			mapColumnValue?: (value: unknown) => unknown,
		) => unknown)([row]) as T['get'];
	}

	values(placeholderValues: Record<string, unknown> = {}): T['values'] {
		const { stmt } = this;

		const params = fillPlaceholders(this.query.params, placeholderValues);
		this.logger.logQuery(this.query.sql, params);

		stmt.setReturnArrays(true);
		return stmt.all(...params as SQLInputValue[]);
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}
}
