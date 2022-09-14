import { TableName } from 'drizzle-orm/branded-types';
import { SQLiteDialect, SQLiteSession } from './connection';
import { AnySQLiteSQL } from './sql';
import { AnySQLiteTable } from './table';

export class SQLiteTestSession implements SQLiteSession {
	private queries: { query: string; params: unknown[] }[] = [];
	private lastQuery: { query: string; params: unknown[] } | undefined;

	constructor(private dialect: SQLiteDialect<any>) {}

	getQueries() {
		return this.queries;
	}

	getLastQuery() {
		return this.lastQuery;
	}

	run(query: AnySQLiteSQL<TableName<string>>): void {}

	all(query: AnySQLiteSQL<TableName<string>>): any[][] {
		const preparedQuery = this.dialect.prepareSQL(query);
		this.queries.push({ query: preparedQuery.sql, params: preparedQuery.params });
		this.lastQuery = { query: preparedQuery.sql, params: preparedQuery.params };
		return [];
	}

	allObjects(query: AnySQLiteSQL<TableName<string>>): any[] {
		const preparedQuery = this.dialect.prepareSQL(query);
		this.queries.push({ query: preparedQuery.sql, params: preparedQuery.params });
		this.lastQuery = { query: preparedQuery.sql, params: preparedQuery.params };
		return [];
	}
}

export class SQLiteTestDriver {
	constructor(private dialect: SQLiteDialect<any>) {}

	connect(): SQLiteTestSession {
		return new SQLiteTestSession(this.dialect);
	}
}

export class SQLiteTestConnector<TDBSchema extends Record<string, AnySQLiteTable>> {
	dialect: SQLiteDialect<TDBSchema>;
	driver: SQLiteTestDriver;

	constructor(dbSchema: TDBSchema) {
		const dialect = new SQLiteDialect(dbSchema);
		this.dialect = dialect;
		this.driver = new SQLiteTestDriver(dialect);
	}
}
