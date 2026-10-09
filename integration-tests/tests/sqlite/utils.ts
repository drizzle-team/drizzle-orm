import type { Column } from 'drizzle-orm';
import type { CodecsCollection } from 'drizzle-orm/codecs';
import type { SQLiteAsyncDatabase, SQLiteDialect } from 'drizzle-orm/sqlite-core';

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
