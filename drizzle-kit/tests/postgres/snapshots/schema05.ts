import { sql } from 'orm044';
import { check, index, integer, pgSchema, pgTable, text, uuid, vector } from 'orm044/pg-core';

export const docs = pgTable(
	'docs',
	{
		id: uuid().primaryKey().defaultRandom(),
		product: text().notNull(),
		rank: integer().notNull(),
		embedding: vector({ dimensions: 3 }),
	},
	(t) => [
		index('docs_embedding_hnsw').using('hnsw', t.embedding.op('vector_cosine_ops')).with({
			m: 16,
			ef_construction: 64,
		}),
		index('docs_rank_idx').on(t.rank).with({ fillfactor: 70 }),
		check('docs_product_nonempty', sql`length(${t.product}) > 0`),
		check('docs_rank_range', sql`${t.rank} >= 0 AND ${t.rank} <= 100`),
	],
);

export const app = pgSchema('app');

export const items = app.table(
	'items',
	{
		id: uuid().primaryKey().defaultRandom(),
		label: text().notNull(),
	},
	(t) => [
		check('items_label_nonempty', sql`length(${t.label}) > 0`),
	],
);
