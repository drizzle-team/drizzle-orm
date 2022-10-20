import { QueryResult, QueryResultRow } from 'pg';

import { PgDialect, PgSession } from './connection';

export class PgTestSession implements PgSession {
	private queries: { query: string; params: unknown[] }[] = [];
	private lastQuery: { query: string; params: unknown[] } | undefined;
	private nextResponse: QueryResult | undefined;

	getQueries() {
		return this.queries;
	}

	getLastQuery() {
		return this.lastQuery;
	}

	setNextResponse(response: QueryResult): void {
		this.nextResponse = response;
	}

	async query(query: string, params: unknown[]): Promise<QueryResult> {
		console.log({ query, params });

		this.queries.push({ query, params });
		this.lastQuery = { query, params };

		if (this.nextResponse) {
			const response = this.nextResponse;
			this.nextResponse = undefined;
			return response;
		}

		return {
			rows: [],
			rowCount: 0,
			command: '',
			oid: 0,
			fields: [],
		};
	}

	queryObjects<T extends QueryResultRow>(query: string, params: unknown[]): Promise<QueryResult<T>> {
		return this.query(query, params);
	}
}

export class PgTestDriver {
	async connect(): Promise<PgTestSession> {
		return new PgTestSession();
	}
}

export class PgTestConnector {
	dialect = new PgDialect();
	driver = new PgTestDriver();

	connect() {
		return this.dialect.createDB(new PgTestSession());
	}
}
