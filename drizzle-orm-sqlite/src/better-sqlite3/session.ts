import { Database, RunResult, Statement } from 'better-sqlite3';
import { Logger, NoopLogger } from 'drizzle-orm';
import { fillPlaceholders, Query } from 'drizzle-orm/sql';
import { mapResultRowV2 } from 'drizzle-orm/utils';
import { SQLiteSyncDialect } from '~/dialect';
import { SelectFieldsOrdered } from '~/operations';
import {
	PreparedQuery as PreparedQueryBase,
	PreparedQueryConfig as PreparedQueryConfigBase,
	SQLiteSession,
} from '~/session';

export interface BetterSQLiteSessionOptions {
	logger?: Logger;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class BetterSQLiteSession extends SQLiteSession<'sync', RunResult> {
	private logger: Logger;

	constructor(
		private client: Database,
		dialect: SQLiteSyncDialect,
		options: BetterSQLiteSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		fields?: SelectFieldsOrdered,
	): PreparedQuery<T> {
		const stmt = this.client.prepare(query.sql);
		return new PreparedQuery(stmt, query.sql, query.params, this.logger, fields);
	}
}

export class PreparedQuery<T extends PreparedQueryConfig = PreparedQueryConfig> extends PreparedQueryBase<
	{ type: 'sync'; run: RunResult; all: T['all']; get: T['get']; values: T['values'] }
> {
	constructor(
		private stmt: Statement,
		private queryString: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectFieldsOrdered | undefined,
	) {
		super();
	}

	run(placeholderValues?: Record<string, unknown>): RunResult {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		return this.stmt.run(...params);
	}

	all(placeholderValues?: Record<string, unknown>): T['all'] {
		const { fields } = this;
		if (!fields) {
			return this.stmt.all(...this.params)
		}

		const values = this.values(placeholderValues);

		return values.map((row) => mapResultRowV2(fields, row));
	}

	get(placeholderValues?: Record<string, unknown>): T['get'] {
		const { fields } = this;

		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		const value = this.stmt.raw().get(...params);

		if (!fields) {
			return value
		}

		return mapResultRowV2(fields, value);
	}

	values(placeholderValues?: Record<string, unknown>): T['values'] {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		return this.stmt.raw().all(...params);
	}
}
