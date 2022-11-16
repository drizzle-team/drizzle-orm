import { Database, RunResult, Statement } from 'better-sqlite3';
import { Logger, NoopLogger } from 'drizzle-orm';
import { Query, SQL } from 'drizzle-orm/sql';
import { SQLiteDialect } from '~/dialect';
import { PreparedQuery as PreparedQueryBase, SQLiteSyncSession } from '~/session';

export interface SQLiteDefaultSessionOptions {
	logger?: Logger;
}

type PreparedQuery = PreparedQueryBase<Statement>;

export class BetterSQLiteSession implements SQLiteSyncSession<Statement, RunResult> {
	private logger: Logger;

	constructor(
		private client: Database,
		private dialect: SQLiteDialect,
		options: SQLiteDefaultSessionOptions = {},
	) {
		this.logger = options.logger ?? new NoopLogger();
	}

	run(query: SQL | PreparedQuery): RunResult {
		const { stmt, queryString, params } = query instanceof SQL
			? this.prepareQuery(this.dialect.sqlToQuery(query))
			: query;
		this.logger.logQuery(queryString, params);

		return stmt.run(...params);
	}

	all<T extends any[] = unknown[]>(query: SQL | PreparedQuery): T[] {
		const { stmt, queryString, params } = query instanceof SQL
			? this.prepareQuery(this.dialect.sqlToQuery(query))
			: query;
		this.logger.logQuery(queryString, params);

		stmt.raw();
		return stmt.all(...params);
	}

	allObjects<T = unknown>(query: SQL | PreparedQuery): T[] {
		const { stmt, queryString, params } = query instanceof SQL
			? this.prepareQuery(this.dialect.sqlToQuery(query))
			: query;
		this.logger.logQuery(queryString, params);

		return stmt.all(...params);
	}

	prepareQuery(query: Query): PreparedQuery {
		const stmt = this.client.prepare(query.sql);
		return { stmt, queryString: query.sql, params: query.params };
	}
}
