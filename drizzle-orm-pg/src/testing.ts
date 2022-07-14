import { PgSession, PgDriverResponse } from './connection';

export class PgTestSession implements PgSession {
	private queries: { query: string; params: unknown[] }[] = [];
	private lastQuery: { query: string; params: unknown[] } | undefined;
	private nextResponse: PgDriverResponse | undefined;

	getQueries() {
		return this.queries;
	}

	getLastQuery() {
		return this.lastQuery;
	}

	setNextResponse(response: PgDriverResponse): void {
		this.nextResponse = response;
	}

	async query(query: string, params: unknown[]): Promise<PgDriverResponse> {
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
		};
	}
}

export class PgTestDriver {
	async connect(): Promise<PgTestSession> {
		return new PgTestSession();
	}
}
