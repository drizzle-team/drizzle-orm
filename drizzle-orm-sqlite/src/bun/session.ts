import { Database } from 'bun:sqlite';
import { Logger, NoopLogger } from 'drizzle-orm';
import { SQL } from 'drizzle-orm/sql';
import { SQLiteDialect } from '~/dialect';
import { RunResult, SQLiteSession, SQLiteStatement } from '~/session';

export interface SQLiteBunSessionOptions {
	logger?: Logger;
}

export class SQLiteBunSession implements SQLiteSession {
	private logger: Logger;

	constructor(
		private client: Database,
		private dialect: SQLiteDialect,
		options: SQLiteBunSessionOptions = {},
	) {
		this.logger = options.logger ?? new NoopLogger();
	}

	run(query: SQL): RunResult {
		const preparedQuery = this.dialect.prepareSQL(query);
		this.logger.logQuery(preparedQuery.sql, preparedQuery.params);
		this.client.exec(preparedQuery.sql, ...preparedQuery.params);
		return { changes: 0, lastInsertRowid: 0 };
	}

	all<T extends any[] = unknown[]>(query: SQL): T[] {
		const preparedQuery = this.dialect.prepareSQL(query);
		this.logger.logQuery(preparedQuery.sql, preparedQuery.params);
		return this.client.prepare(preparedQuery.sql, ...preparedQuery.params).values() as T[];
	}

	allObjects<T = unknown>(query: SQL): T[] {
		const preparedQuery = this.dialect.prepareSQL(query);
		this.logger.logQuery(preparedQuery.sql, preparedQuery.params);
		return this.client.prepare(preparedQuery.sql, ...preparedQuery.params).all();
	}

	prepare<T>(query: SQL): SQLiteStatement<T> {
		const preparedQuery = this.dialect.prepareSQL(query);
		this.logger.logQuery(preparedQuery.sql, preparedQuery.params);
		return new SQLiteStatement(this.client.prepare(preparedQuery.sql, ...preparedQuery.params));
	}
}
