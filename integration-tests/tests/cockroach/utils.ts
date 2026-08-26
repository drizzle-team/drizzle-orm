import type { Column } from 'drizzle-orm';
import type { CockroachDatabase, CockroachDialect } from 'drizzle-orm/cockroach-core';
import type { CodecsCollection } from 'drizzle-orm/codecs';

export function normalizeDataWithDbCodecs(
	cfg: {
		db: CockroachDatabase<any, any>;
		data: Record<string, unknown>[] | string;
		columns: Record<string, Column>;
		mode: 'json' | 'query';
	},
) {
	const { db, data: rawData, columns, mode } = cfg;
	const dialect = (<any> db).dialect as CockroachDialect;
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
