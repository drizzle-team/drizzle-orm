import type { BindParams, Database } from 'sql.js';
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

const VALID_TX_BEHAVIORS = new Set(['deferred', 'immediate', 'exclusive']);

export class SQLJsSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends SQLiteSession<'sync', void, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'SQLJsSession';

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
		isResponseInArrayMode: boolean,
	): PreparedQuery<T> {
		return new PreparedQuery(this.client, query, this.logger, fields, executeMethod, isResponseInArrayMode);
	}

	override transaction<T>(
		transaction: (tx: SQLJsTransaction<TFullSchema, TSchema>) => T,
		config: SQLiteTransactionConfig = {},
	): T {
		const tx = new SQLJsTransaction('sync', this.dialect, this, this.schema);
		const behavior = config.behavior;
		const behaviorClause = behavior
			? (VALID_TX_BEHAVIORS.has(behavior) ? ` ${behavior}` : (() => { throw new Error(`Invalid transaction behavior: "${behavior}". Must be one of: ${[...VALID_TX_BEHAVIORS].join(', ')}`); })())
			: '';
		this.run(sql.raw(`begin${behaviorClause}`));
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
	static override readonly [entityKind]: string = 'SQLJsTransaction';

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

export class PreparedQuery<T extends Omit<PreparedQueryConfig, 'run'>> extends PreparedQueryBase<T> {
	static override readonly [entityKind]: string = 'SQLJsPreparedQuery';

	private stmt: ReturnType<Database['prepare']> | undefined;

	constructor(
		private client: Database,
		query: Query,
		private logger: Logger,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		isResponseInArrayMode: boolean,
	) {
		super('sync', executeMethod, query, fields, isResponseInArrayMode);
	}

	all(placeholderValues?: Record<string, unknown>): T['all'] {
		const params = this.query.params
			? fillPlaceholders(this.query.params, placeholderValues ?? {})
			: [];

		this.logger.logQuery(this.query.sql, params);

		this._ensureStmt();
		this.stmt!.bind(params as BindParams);

		const rows: unknown[][] = [];
		while (this.stmt!.step()) {
			rows.push(this.stmt!.get());
		}
		this.stmt!.reset();

		if (this.fields) {
			return rows.map((row) => mapResultRow(this.fields!, row, this.joinsNotNullableMap));
		}

		return rows as T['all'];
	}

	get(placeholderValues?: Record<string, unknown>): T['get'] {
		const params = this.query.params
			? fillPlaceholders(this.query.params, placeholderValues ?? {})
			: [];

		this.logger.logQuery(this.query.sql, params);

		this._ensureStmt();
		this.stmt!.bind(params as BindParams);

		const rows: unknown[][] = [];
		while (this.stmt!.step()) {
			rows.push(this.stmt!.get());
		}
		this.stmt!.reset();

		const row = rows[0];

		if (!row) {
			return undefined as T['get'];
		}

		if (this.fields) {
			return mapResultRow(this.fields, row, this.joinsNotNullableMap) as T['get'];
		}

		return row as T['get'];
	}

	run(placeholderValues?: Record<string, unknown>): T['run'] {
		const params = this.query.params
			? fillPlaceholders(this.query.params, placeholderValues ?? {})
			: [];

		this.logger.logQuery(this.query.sql, params);

		this._ensureStmt();
		this.stmt!.bind(params as BindParams);
		this.stmt!.step();
		this.stmt!.reset();

		return undefined as T['run'];
	}

	values(placeholderValues?: Record<string, unknown>): T['values'] {
		const params = this.query.params
			? fillPlaceholders(this.query.params, placeholderValues ?? {})
			: [];

		this.logger.logQuery(this.query.sql, params);

		this._ensureStmt();
		this.stmt!.bind(params as BindParams);

		const rows: unknown[][] = [];
		while (this.stmt!.step()) {
			rows.push(this.stmt!.get());
		}
		this.stmt!.reset();

		return rows as T['values'];
	}

	private _ensureStmt() {
		if (this.stmt) {
			return;
		}
		this.stmt = this.client.prepare(this.query.sql);
	}
}
