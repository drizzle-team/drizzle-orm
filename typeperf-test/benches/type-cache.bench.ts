/**
 * Type cache performance benchmarks
 *
 * These benchmarks test whether type inference is properly cached when using a same table multiple times.
 * Run with: tsx benches/type-cache.bench.ts
 */
import { bench } from '@ark/attest';
import { integer, pgTable, text } from 'drizzle-orm/pg-core';

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
}).types([14, 'instantiations']);

bench('same table - 5 references', () => {
	return {
		t1: {} as typeof cachedTable,
		t2: {} as typeof cachedTable,
		t3: {} as typeof cachedTable,
		t4: {} as typeof cachedTable,
		t5: {} as typeof cachedTable,
	};
}).types([14, 'instantiations']);

bench('inline tables - 1 times', () => {
	const t1 = pgTable('t1', { id: integer().primaryKey(), name: text().notNull() });
	return {
		table: {} as typeof t1,
	};
}).types([31, 'instantiations']);

bench('inline tables - 2 times', () => {
	const t1 = pgTable('t1', { id: integer().primaryKey(), name: text().notNull() });
	const t2 = pgTable('t2', { id: integer().primaryKey(), name: text().notNull() });
	return {
		t1: {} as typeof t1,
		t2: {} as typeof t2,
	};
}).types([53, 'instantiations']);

bench('inline tables - 3 times', () => {
	const t1 = pgTable('t1', { id: integer().primaryKey(), name: text().notNull() });
	const t2 = pgTable('t2', { id: integer().primaryKey(), name: text().notNull() });
	const t3 = pgTable('t3', { id: integer().primaryKey(), name: text().notNull() });
	return {
		t1: {} as typeof t1,
		t2: {} as typeof t2,
		t3: {} as typeof t3,
	};
}).types([75, 'instantiations']);

bench('access inferSelect once', () => {
	return {} as typeof cachedTable.$inferSelect;
}).types([46, 'instantiations']);

bench('access inferSelect 3 times', () => {
	return {
		t1: {} as typeof cachedTable.$inferSelect,
		t2: {} as typeof cachedTable.$inferSelect,
		t3: {} as typeof cachedTable.$inferSelect,
	};
}).types([46, 'instantiations']);

bench('access inferInsert', () => {
	return {
		ins: {} as typeof cachedTable.$inferInsert,
	};
}).types([445, 'instantiations']);

bench('access inferInsert', () => {
	return {
		in: {} as typeof cachedTable.$inferInsert,
		ins: {} as typeof cachedTable.$inferInsert,
	};
}).types([445, 'instantiations']);

bench('inline $ - 1 times', () => {
	const t1 = pgTable('t1', { id: integer().primaryKey(), name: text().notNull() });
	return {
		table: {} as typeof t1,
		sel: {} as typeof t1.$inferSelect,
		ins: {} as typeof t1.$inferInsert,
	};
}).types([494, 'instantiations']);

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
}).types([733, 'instantiations']);
