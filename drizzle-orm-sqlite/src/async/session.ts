import { Logger, NoopLogger } from 'drizzle-orm';
import { Query, SQL } from 'drizzle-orm/sql';
import { Database, RunResult, Statement } from 'sqlite3';
import { SQLiteDialect } from '~/dialect';
import { PreparedQuery as PreparedQueryBase, SQLiteAsyncSession } from '~/session';

export interface SQLite3SessionOptions {
	logger?: Logger;
}

export class PreparedQuery implements PreparedQueryBase<Statement> {
	constructor(
		public stmt: Statement,
		public queryString: string,
		public params: unknown[],
	) {
	}

	finalize(): void {
		this.stmt.finalize();
	}
}

export class SQLite3Session implements SQLiteAsyncSession<Statement, RunResult> {
	private logger: Logger;

	constructor(
		private client: Database,
		private dialect: SQLiteDialect,
		options: SQLite3SessionOptions = {},
	) {
		this.logger = options.logger ?? new NoopLogger();
	}

	run(query: SQL | PreparedQuery): Promise<RunResult> {
		const [{ stmt, queryString, params }, isTempStmt] = (() => {
			if (query instanceof SQL) {
				return [this.prepareQuery(this.dialect.sqlToQuery(query)), true];
			}
			return [query, false];
		})();
		this.logger.logQuery(queryString, params);

		return new Promise((resolve, reject) => {
			stmt.run(params, function(err) {
				if (err) {
					reject(err);
				} else {
					if (isTempStmt) {
						stmt.finalize();
					}
					resolve(this);
				}
			});
		});
	}

	all<T extends any[] = unknown[]>(query: SQL | PreparedQuery): Promise<T[]> {
		const [{ stmt, queryString, params }, isTempStmt] = (() => {
			if (query instanceof SQL) {
				return [this.prepareQuery(this.dialect.sqlToQuery(query)), true];
			}
			return [query, false];
		})();
		this.logger.logQuery(queryString, params);

		return new Promise((resolve, reject) => {
			stmt.all(params, function(err, rows) {
				if (err) {
					reject(err);
				} else {
					if (isTempStmt) {
						stmt.finalize();
					}
					console.log('rows:', rows);
					resolve(rows);
				}
			});
		});
	}

	allObjects<T = unknown>(query: SQL | PreparedQuery): Promise<T[]> {
		const [{ stmt, queryString, params }, isTempStmt] = (() => {
			if (query instanceof SQL) {
				return [this.prepareQuery(this.dialect.sqlToQuery(query)), true];
			}
			return [query, false];
		})();
		this.logger.logQuery(queryString, params);

		return new Promise((resolve, reject) => {
			stmt.all(params, function(err, rows) {
				if (err) {
					reject(err);
				} else {
					if (isTempStmt) {
						stmt.finalize();
					}
					resolve(rows);
				}
			});
		});
	}

	prepareQuery(query: Query): PreparedQuery {
		const stmt = this.client.prepare(query.sql);
		return new PreparedQuery(stmt, query.sql, query.params);
	}
}
