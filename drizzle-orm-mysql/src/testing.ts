import { MySqlDialect, MySqlQueryResult, MySqlSession } from './connection';
import { AnyMySqlTable } from './table';

export class MySqlTestSession implements MySqlSession {
	private queries: { query: string; params: unknown[] }[] = [];
	private lastQuery: { query: string; params: unknown[] } | undefined;
	private nextResponse: MySqlQueryResult | undefined;

	getQueries() {
		return this.queries;
	}

	getLastQuery() {
		return this.lastQuery;
	}

	setNextResponse(response: MySqlQueryResult): void {
		this.nextResponse = response;
	}

	async query(query: string, params: unknown[]): Promise<MySqlQueryResult> {
		console.log({ query, params });

		this.queries.push({ query, params });
		this.lastQuery = { query, params };

		if (this.nextResponse) {
			const response = this.nextResponse;
			this.nextResponse = undefined;
			return response;
		}

		return [{}, []];
	}

	queryObjects(query: string, params: unknown[]): Promise<MySqlQueryResult> {
		return this.query(query, params);
	}
}

export class MySqlTestDriver {
	async connect(): Promise<MySqlTestSession> {
		return new MySqlTestSession();
	}
}

export class MySqlTestConnector<TDBSchema extends Record<string, AnyMySqlTable>> {
	dialect: MySqlDialect<TDBSchema>;
	driver: MySqlTestDriver;

	constructor(dbSchema: TDBSchema) {
		this.dialect = new MySqlDialect(dbSchema);
		this.driver = new MySqlTestDriver();
	}
}
