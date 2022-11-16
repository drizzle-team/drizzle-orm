import { Logger, NoopLogger } from 'drizzle-orm';
import { Query, SQL } from 'drizzle-orm/sql';
import { SQLiteDialect } from '~/dialect';
import { PreparedQuery as PreparedQueryBase, SQLiteAsyncSession } from '~/session';

export interface SQLiteD1SessionOptions {
	logger?: Logger;
}

export type PreparedQuery = PreparedQueryBase<D1PreparedStatement>;

export class SQLiteD1Session implements SQLiteAsyncSession<D1PreparedStatement, D1Result> {
	private logger: Logger;

	constructor(
		private client: D1Database,
		private dialect: SQLiteDialect,
		options: SQLiteD1SessionOptions = {},
	) {
		this.logger = options.logger ?? new NoopLogger();
	}

	run(query: SQL | PreparedQuery): Promise<D1Result> {
		const { stmt, queryString, params } = query instanceof SQL
			? this.prepareQuery(this.dialect.sqlToQuery(query))
			: query;
		this.logger.logQuery(queryString, params);

		return stmt.bind(...params).run();
	}

	all<T extends any[] = unknown[]>(query: SQL | PreparedQuery): Promise<T[]> {
		const { stmt, queryString, params } = query instanceof SQL
			? this.prepareQuery(this.dialect.sqlToQuery(query))
			: query;
		this.logger.logQuery(queryString, params);

		return stmt.bind(...params).raw() as Promise<T[]>;
	}

	allObjects<T = unknown>(query: SQL | PreparedQuery): Promise<T[]> {
		const { stmt, queryString, params } = query instanceof SQL
			? this.prepareQuery(this.dialect.sqlToQuery(query))
			: query;
		this.logger.logQuery(queryString, params);

		return stmt.bind(...params).all().then(({ results }) => results) as Promise<T[]>;
	}

	prepareQuery(query: Query): PreparedQuery {
		const stmt = this.client.prepare(query.sql);
		return { stmt, queryString: query.sql, params: query.params };
	}
}
