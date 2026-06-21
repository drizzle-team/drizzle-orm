import { Column } from 'drizzle-orm';
import { CodecsCollection } from 'drizzle-orm/codecs';
import { MySqlAsyncDatabase, MySqlDialect } from 'drizzle-orm/mysql-core';
import { MySqlEffectDatabase } from 'drizzle-orm/mysql-core/effect/db';

export function normalizeDataWithDbCodecs(
	cfg: {
		db: MySqlAsyncDatabase<any, any> | MySqlEffectDatabase<any, any, any>;
		data: Record<string, unknown>[] | string;
		columns: Record<string, Column>;
		mode: 'json' | 'query';
	},
) {
	const { db, data: rawData, columns, mode } = cfg;
	const dialect = (<any> db).dialect as MySqlDialect;
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
