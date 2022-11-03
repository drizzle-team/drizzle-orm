import { Database, RunResult } from 'better-sqlite3';
import { Logger, NoopLogger } from 'drizzle-orm';
import { SQL } from 'drizzle-orm/sql';
import { SQLiteDialect } from '~/dialect';
import { SQLiteSession, SQLiteStatement } from '~/session';

export interface SQLiteDefaultSessionOptions {
	logger?: Logger;
}

export class SQLiteDefaultSession implements SQLiteSession {
	private logger: Logger;

	constructor(
		private client: Database,
		private dialect: SQLiteDialect,
		options: SQLiteDefaultSessionOptions = {},
	) {
		this.logger = options.logger ?? new NoopLogger();
	}

	run(query: SQL): RunResult {
		const preparedQuery = this.dialect.prepareSQL(query);
		this.logger.logQuery(preparedQuery.sql, preparedQuery.params);
		const stmt = this.client.prepare(preparedQuery.sql);
		return stmt.run(...preparedQuery.params);
	}

	all<T extends any[] = unknown[]>(query: SQL): T[] {
		const preparedQuery = this.dialect.prepareSQL(query);
		this.logger.logQuery(preparedQuery.sql, preparedQuery.params);
		const stmt = this.client.prepare(preparedQuery.sql);
		stmt.raw();
		return stmt.all(...preparedQuery.params);
	}

	allObjects<T = unknown>(query: SQL): T[] {
		const preparedQuery = this.dialect.prepareSQL(query);
		this.logger.logQuery(preparedQuery.sql, preparedQuery.params);
		const stmt = this.client.prepare(preparedQuery.sql);
		return stmt.all(...preparedQuery.params);
	}

	prepare<T>(query: SQL): SQLiteStatement<T> {
		const preparedQuery = this.dialect.prepareSQL(query);
		this.logger.logQuery(preparedQuery.sql, preparedQuery.params);
		return new SQLiteStatement(this.client.prepare(preparedQuery.sql).bind(preparedQuery.params));
	}
}
