import { Column } from 'drizzle-orm';
import { CasingCache } from 'drizzle-orm/casing';
import { PgAsyncDatabase, PgDialect } from 'drizzle-orm/pg-core';
import { PgCodecsCollection } from 'drizzle-orm/pg-core/codecs';
import { PgEffectDatabase } from 'drizzle-orm/pg-core/effect/db';

export function normalizeDataWithDbCodecs(
	cfg: {
		db: PgAsyncDatabase<any, any, any, any> | PgEffectDatabase<any, any, any, any, any>;
		data: Record<string, unknown>[];
		columns: Record<string, Column>;
		mode: 'jsonNormalize' | 'queryNormalize';
	},
) {
	const { db, data, columns, mode } = cfg;
	const dialect = (<any> db).dialect as PgDialect;
	const casing = (<any> dialect).casing as CasingCache;
	const codecs = (<any> dialect).codecs as PgCodecsCollection;

	const dbNamedColumns = Object.values(columns).map((c) => {
		return [casing.getColumnCasing(c), c];
	}) as [string, Column][];

	const res: Record<string, any>[] = [];
	for (const item of data) {
		const current: Record<string, any> = {};

		for (const [k, v] of dbNamedColumns) {
			current[k] = item[k] === null ? item[k] : codecs.apply(v, mode, item[k]!);
		}

		res.push(current);
	}

	return res;
}
