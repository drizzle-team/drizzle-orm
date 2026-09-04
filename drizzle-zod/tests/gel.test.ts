import { dateDuration, duration, gelTable, localDate, localTime, relDuration, timestamp } from 'drizzle-orm/gel-core';
import { expect, test } from 'vitest';
import { createInsertSchema, createSelectSchema } from '../src';

// Regression test for #6027: the 6 Gel-only ColumnDataType variants
// (dateDuration, duration, relDuration, localTime, localDate, localDateTime)
// were falling through columnToSchema()'s if/else chain to the `z.any()`
// catch-all, so the generated schema validated nothing.
const gelTemporalColumns = {
	dateDuration: dateDuration().notNull(),
	duration: duration().notNull(),
	relDuration: relDuration().notNull(),
	localTime: localTime().notNull(),
	localDate: localDate().notNull(),
	localDateTime: timestamp().notNull(),
} as const;

const columnKeys = Object.keys(gelTemporalColumns) as (keyof typeof gelTemporalColumns)[];

test('gel temporal columns do not produce z.any() - select', () => {
	const table = gelTable('test', gelTemporalColumns);
	const result = createSelectSchema(table);

	for (const key of columnKeys) {
		const columnSchema = result.shape[key];
		expect(columnSchema, `${key} should have a schema`).toBeDefined();
		// z.any() reports `._zod.def.type === 'any'` and validates nothing.
		expect(columnSchema!._zod.def.type, `${key} should not be z.any()`).not.toBe('any');
		// A real schema rejects primitives that z.any() would happily accept.
		expect(columnSchema!.safeParse(123).success, `${key} should reject a number`).toBe(false);
		expect(columnSchema!.safeParse('not-a-temporal').success, `${key} should reject a string`).toBe(false);
	}
});

test('gel temporal columns do not produce z.any() - insert', () => {
	const table = gelTable('test', gelTemporalColumns);
	const result = createInsertSchema(table);

	for (const key of columnKeys) {
		const columnSchema = result.shape[key];
		expect(columnSchema, `${key} should have a schema`).toBeDefined();
		expect(columnSchema!._zod.def.type, `${key} should not be z.any()`).not.toBe('any');
	}
});
