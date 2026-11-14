import type { Column, SQL } from 'drizzle-orm';
import type { CodecsCollection } from 'drizzle-orm/codecs';
import type { SQLiteAsyncDatabase, SQLiteDialect, SQLiteSession } from 'drizzle-orm/sqlite-core';

export function normalizeDataWithDbCodecs(
	cfg: {
		db: SQLiteAsyncDatabase<any, any, any>;
		data: Record<string, unknown>[] | string;
		columns: Record<string, Column>;
		mode: 'json' | 'query';
	},
) {
	const { db, data: rawData, columns, mode } = cfg;
	const dialect = (<any> db).dialect as SQLiteDialect;
	const codecs = (<any> dialect).codecs as CodecsCollection;
	const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;

	const dbNamedColumns = Object.values(columns).map((c) => {
		return [c.name, c];
	}) as [string, Column][];

	const res: Record<string, any>[] = [];
	for (const item of data) {
		const current: Record<string, any> = {};

		for (const [k, v] of dbNamedColumns) {
			current[k] = item[k] === null
				? item[k]
				: codecs.apply(v, mode === 'query' ? 'normalize' : 'normalizeInJson', item[k]!);
		}

		res.push(current);
	}

	return res;
}

/**
 * Raw rows of a query fetched the way drizzle fetches the queries it decodes (with a mapper): clients reading integers
 * as bigints per statement do so only for such queries
 */
export function fetchDecodedQueryRows<T = Record<string, unknown>>(
	db: SQLiteAsyncDatabase<any, any, any>,
	query: SQL,
): Promise<T[]> {
	const { session, dialect } = db as unknown as {
		session: SQLiteSession<any, any>;
		dialect: SQLiteDialect;
	};
	return Promise.resolve(
		(<any> session).prepareQuery(dialect.sqlToQuery(query), 'objects', false, 'all', (rows: T[]) => rows).all(),
	);
}
