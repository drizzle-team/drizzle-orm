import type { Column } from 'drizzle-orm';
import type { CockroachDatabase, CockroachDialect } from 'drizzle-orm/cockroach-core';
import type { CodecsCollection } from 'drizzle-orm/codecs';

export function normalizeDataWithDbCodecs(
	cfg: {
		db: CockroachDatabase<any, any>;
		data: Record<string, unknown>[] | unknown[][] | string;
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

		for (let i = 0; i < dbNamedColumns.length; ++i) {
			const [k, v] = dbNamedColumns[i]!;
			const raw = Array.isArray(item) ? item[i] : item[k];
			current[k] = raw === null
				? raw
				: codecs.apply(v, mode === 'query' ? 'normalize' : 'normalizeInJson', raw!);
		}

		res.push(current);
	}

	return res;
}
