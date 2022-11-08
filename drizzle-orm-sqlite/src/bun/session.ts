import { Database, Statement } from 'bun:sqlite';
import { Logger, NoopLogger } from 'drizzle-orm';
import { Query, SQL } from 'drizzle-orm/sql';
import { SQLiteDialect } from '~/dialect';
import { PreparedQuery, RunResult, SQLiteSession } from '~/session';

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

	run(query: SQL | PreparedQuery): RunResult {
		const preparedQuery = query instanceof SQL ? this.prepareQuery(this.dialect.sqlToQuery(query)) : query;
		this.logger.logQuery(preparedQuery.queryString, preparedQuery.params);

		const stmt = preparedQuery.stmt as Statement<unknown>;
		stmt.run(...preparedQuery.params);
		return { changes: 0, lastInsertRowid: 0 };
	}

	all<T extends any[] = unknown[]>(query: SQL | PreparedQuery): T[] {
		const preparedQuery = query instanceof SQL ? this.prepareQuery(this.dialect.sqlToQuery(query)) : query;
		this.logger.logQuery(preparedQuery.queryString, preparedQuery.params);

		const stmt = preparedQuery.stmt as Statement<unknown>;
		return stmt.values(...preparedQuery.params) as T[];
	}

	allObjects<T = unknown>(query: SQL | PreparedQuery): T[] {
		const preparedQuery = query instanceof SQL ? this.prepareQuery(this.dialect.sqlToQuery(query)) : query;
		this.logger.logQuery(preparedQuery.queryString, preparedQuery.params);

		const stmt = preparedQuery.stmt as Statement<unknown>;
		return stmt.all(...preparedQuery.params);
	}

	prepareQuery(query: Query): PreparedQuery {
		const stmt = this.client.prepare(query.sql);
		return { stmt, queryString: query.sql, params: query.params };
	}
}
