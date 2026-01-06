/**
 * Type cache performance benchmarks
 *
 * These benchmarks test whether type inference is properly cached when using a same table multiple times.
 * Run with: tsx benches/type-cache.bench.ts
 */
import { bench } from '@ark/attest';
import { integer, pgTable, text } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';

const db = drizzle.mock();

// Define a table once
const cachedTable = pgTable('cached', {
	id: integer().primaryKey(),
	name: text().notNull(),
});

bench('same table - 3 references', () => {
	return {
		t1: {} as typeof cachedTable,
		t2: {} as typeof cachedTable,
		t3: {} as typeof cachedTable,
	};
}).types([24, 'instantiations']);

bench('same table - 5 references', () => {
	return {
		t1: {} as typeof cachedTable,
		t2: {} as typeof cachedTable,
		t3: {} as typeof cachedTable,
		t4: {} as typeof cachedTable,
		t5: {} as typeof cachedTable,
	};
}).types([24, 'instantiations']);

bench('inline tables - 1 times', () => {
	const t1 = pgTable('t1', { id: integer().primaryKey(), name: text().notNull() });
	return {
		table: {} as typeof t1,
	};
}).types([41, 'instantiations']);

bench('inline tables - 1 times', () => {
	const t1 = pgTable('t1', { id: integer().primaryKey(), name: text({ enum: ['one', 'two'] }).notNull() });
	return {
		table: {} as typeof t1,
	};
}).types([168, 'instantiations']);

bench('inline tables - 2 times', () => {
	const t1 = pgTable('t1', { id: integer().primaryKey(), name: text().notNull() });
	const t2 = pgTable('t2', { id: integer().primaryKey(), name: text().notNull() });
	return {
		t1: {} as typeof t1,
		t2: {} as typeof t2,
	};
}).types([63, 'instantiations']);

bench('inline tables - 3 times', () => {
	const t1 = pgTable('t1', { id: integer().primaryKey(), name: text().notNull() });
	const t2 = pgTable('t2', { id: integer().primaryKey(), name: text().notNull() });
	const t3 = pgTable('t3', { id: integer().primaryKey(), name: text().notNull() });
	return {
		t1: {} as typeof t1,
		t2: {} as typeof t2,
		t3: {} as typeof t3,
	};
}).types([85, 'instantiations']);

bench('inferSelect once', () => {
	return {} as typeof cachedTable.$inferSelect;
}).types([60, 'instantiations']);

bench('inferSelect+select', () => {
	const _ = {} as typeof cachedTable.$inferSelect;
	const res2 = db.select().from(cachedTable);
	return {};
}).types([514, 'instantiations']); // 617

bench('inferSelect+select2', () => {
	const _ = {} as typeof cachedTable.$inferSelect;
	const res2 = db.select().from(cachedTable).where(undefined).limit(10).offset(10);
	return {};
}).types([1534, 'instantiations']); // 1666

// hmm, it's indeed cached
bench('inferSelect+select3', () => {
	const _ = {} as typeof cachedTable.$inferSelect;
	const res1 = db.select().from(cachedTable);
	const res2 = db.select().from(cachedTable).where(undefined).limit(10).offset(10);
	return {};
}).types([1534, 'instantiations']);

bench('access inferInsert', () => {
	return {
		ins: {} as typeof cachedTable.$inferInsert,
	};
}).types([378, 'instantiations']); // down from 445

bench('access inferInsert', () => {
	return {
		in: {} as typeof cachedTable.$inferInsert,
		ins: {} as typeof cachedTable.$inferInsert,
	};
}).types([378, 'instantiations']); // down from 445

bench('inline $ - 1 times', () => {
	const t1 = pgTable('t1', { id: integer().primaryKey(), name: text().notNull() });
	return {
		table: {} as typeof t1,
		sel: {} as typeof t1.$inferSelect,
		ins: {} as typeof t1.$inferInsert,
	};
}).types([430, 'instantiations']); // from 494

bench('inline $ - 2 times', () => {
	const t1 = pgTable('t1', { id: integer().primaryKey(), name: text().notNull() });
	const t2 = pgTable('t2', { id: integer().primaryKey(), name: text().notNull() });
	return {
		t1: {} as typeof t1,
		t1Sel: {} as typeof t1.$inferSelect,
		t1Ins: {} as typeof t1.$inferInsert,
		t2: {} as typeof t2,
		t2Sel: {} as typeof t2.$inferSelect,
		t2Ins: {} as typeof t2.$inferInsert,
	};
}).types([658, 'instantiations']); // from 733
