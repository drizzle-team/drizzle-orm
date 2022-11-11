import { Database, RunResult, Statement } from 'better-sqlite3';
import { Logger, NoopLogger } from 'drizzle-orm';
import { Placeholder, Query, SQL } from 'drizzle-orm/sql';
import { SQLiteDialect } from '~/dialect';
import { PreparedQuery, SQLiteSession } from '~/session';

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

	run(query: SQL | PreparedQuery): RunResult {
		const preparedQuery = query instanceof SQL ? this.prepareQuery(this.dialect.sqlToQuery(query)) : query;
		this.logger.logQuery(preparedQuery.queryString, preparedQuery.params);

		const stmt = preparedQuery.stmt as Statement;
		return stmt.run(...preparedQuery.params);
	}

	all<T extends any[] = unknown[]>(query: SQL | PreparedQuery): T[] {
		const preparedQuery = query instanceof SQL ? this.prepareQuery(this.dialect.sqlToQuery(query)) : query;
		this.logger.logQuery(preparedQuery.queryString, preparedQuery.params);

		const stmt = preparedQuery.stmt as Statement;
		stmt.raw();
		return stmt.all(...preparedQuery.params);
	}

	allObjects<T = unknown>(query: SQL | PreparedQuery): T[] {
		const preparedQuery = query instanceof SQL ? this.prepareQuery(this.dialect.sqlToQuery(query)) : query;
		this.logger.logQuery(preparedQuery.queryString, preparedQuery.params);

		const stmt = preparedQuery.stmt as Statement;
		return stmt.all(...preparedQuery.params);
	}

	prepareQuery(query: Query): PreparedQuery {
		const stmt = this.client.prepare(query.sql);
		return { stmt, queryString: query.sql, params: query.params };
	}
}
