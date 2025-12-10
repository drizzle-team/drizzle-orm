import type { BindParams, Database } from 'sql.js';
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
import { mapResultRow } from '~/utils.ts';

export interface SQLJsSessionOptions {
	logger?: Logger;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class SQLJsSession<
	TFullSchema extends Record<string, unknown>,
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends SQLiteSession<'sync', void, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'SQLJsSession';

	private logger: Logger;

	constructor(
		private client: Database,
		dialect: SQLiteSyncDialect,
		private relations: TRelations,
		private schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		options: SQLJsSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		isResponseInArrayMode: boolean,
	): PreparedQuery<T> {
		return new PreparedQuery(this.client, query, this.logger, fields, executeMethod, isResponseInArrayMode);
	}

	prepareRelationalQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		customResultMapper: (rows: Record<string, unknown>[]) => unknown,
	): PreparedQuery<T, true> {
		return new PreparedQuery(
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
		transaction: (tx: SQLJsTransaction<TFullSchema, TRelations, TSchema>) => T,
		config: SQLiteTransactionConfig = {},
	): T {
		const tx = new SQLJsTransaction('sync', this.dialect, this, this.relations, this.schema);
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
	TRelations extends AnyRelations,
	TSchema extends V1.TablesRelationalConfig,
> extends SQLiteTransaction<'sync', void, TFullSchema, TRelations, TSchema> {
	static override readonly [entityKind]: string = 'SQLJsTransaction';

	override transaction<T>(
		transaction: (tx: SQLJsTransaction<TFullSchema, TRelations, TSchema>) => T,
	): T {
		const savepointName = `sp${this.nestedIndex + 1}`;
		const tx = new SQLJsTransaction(
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
			return result;
		} catch (err) {
			tx.run(sql.raw(`rollback to savepoint ${savepointName}`));
			throw err;
		}
	}
}

export class PreparedQuery<T extends PreparedQueryConfig = PreparedQueryConfig, TIsRqbV2 extends boolean = false>
	extends PreparedQueryBase<
		{ type: 'sync'; run: void; all: T['all']; get: T['get']; values: T['values']; execute: T['execute'] }
	>
{
	static override readonly [entityKind]: string = 'SQLJsPreparedQuery';

	constructor(
		private client: Database,
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

	run(placeholderValues?: Record<string, unknown>): void {
		const stmt = this.client.prepare(this.query.sql);

		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);
		const result = stmt.run(params as BindParams);

		stmt.free();

		return result;
	}

	all(placeholderValues?: Record<string, unknown>): T['all'] {
		if (this.isRqbV2Query) return this.allRqbV2(placeholderValues);
		const stmt = this.client.prepare(this.query.sql);

		const { fields, joinsNotNullableMap, logger, query, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			const params = fillPlaceholders(query.params, placeholderValues ?? {});
			logger.logQuery(query.sql, params);
			stmt.bind(params as BindParams);
			const rows: unknown[] = [];
			while (stmt.step()) {
				rows.push(stmt.getAsObject());
			}

			stmt.free();

			return rows;
		}

		const rows = this.values(placeholderValues) as unknown[][];

		if (customResultMapper) {
			return (customResultMapper as (
				rows: unknown[][],
				mapColumnValue?: (value: unknown) => unknown,
			) => unknown)(rows, normalizeFieldValue) as T['all'];
		}

		return rows.map((row) => mapResultRow(fields!, row.map((v) => normalizeFieldValue(v)), joinsNotNullableMap));
	}

	private allRqbV2(placeholderValues?: Record<string, unknown>): T['all'] {
		const stmt = this.client.prepare(this.query.sql);

		const { logger, query, customResultMapper } = this;
		const params = fillPlaceholders(query.params, placeholderValues ?? {});
		logger.logQuery(query.sql, params);
		stmt.bind(params as BindParams);
		const rows: Record<string, unknown>[] = [];
		while (stmt.step()) {
			rows.push(stmt.getAsObject());
		}

		stmt.free();

		return (customResultMapper as (
			rows: Record<string, unknown>[],
			mapColumnValue?: (value: unknown) => unknown,
		) => unknown)(rows, normalizeFieldValue) as T['all'];
	}

	get(placeholderValues?: Record<string, unknown>): T['get'] {
		if (this.isRqbV2Query) return this.getRqbV2(placeholderValues);
		const stmt = this.client.prepare(this.query.sql);

		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);

		const { fields, joinsNotNullableMap, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			const result = stmt.getAsObject(params as BindParams);

			stmt.free();

			return result;
		}

		const row = stmt.get(params as BindParams);

		stmt.free();

		if (!row || (row.length === 0 && fields!.length > 0)) {
			return undefined;
		}

		if (customResultMapper) {
			return (customResultMapper as (
				rows: unknown[][],
				mapColumnValue?: (value: unknown) => unknown,
			) => unknown)([row], normalizeFieldValue) as T['get'];
		}

		return mapResultRow(fields!, row.map((v) => normalizeFieldValue(v)), joinsNotNullableMap);
	}

	private getRqbV2(placeholderValues?: Record<string, unknown>): T['get'] {
		const stmt = this.client.prepare(this.query.sql);

		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);

		const { customResultMapper } = this;

		const row = stmt.getAsObject(params as BindParams);

		stmt.free();

		if (!row) {
			return undefined;
		}

		let nonUndef = false;
		for (const v of Object.values(row)) {
			if (v !== undefined) {
				nonUndef = true;
				break;
			}
		}
		if (!nonUndef) return undefined;

		return (customResultMapper as (
			rows: Record<string, unknown>[],
			mapColumnValue?: (value: unknown) => unknown,
		) => unknown)([row], normalizeFieldValue) as T['get'];
	}

	values(placeholderValues?: Record<string, unknown>): T['values'] {
		const stmt = this.client.prepare(this.query.sql);

		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);
		stmt.bind(params as BindParams);
		const rows: unknown[] = [];
		while (stmt.step()) {
			rows.push(stmt.get());
		}

		stmt.free();

		return rows;
	}

	/** @internal */
	isResponseInArrayMode(): boolean {
		return this._isResponseInArrayMode;
	}
}

function normalizeFieldValue(value: unknown) {
	if (value instanceof Uint8Array) { // oxlint-disable-line drizzle-internal/no-instanceof
		if (typeof Buffer !== 'undefined') {
			if (!(value instanceof Buffer)) { // oxlint-disable-line drizzle-internal/no-instanceof
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
