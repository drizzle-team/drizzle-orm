import {
	dateDuration,
	duration,
	gelTable,
	localDate,
	localTime,
	relDuration,
	timestamp,
} from 'drizzle-orm/gel-core';
import * as v from 'valibot';
import { expect, test } from 'vitest';
import { createInsertSchema, createSelectSchema } from '../src';

// Regression test for https://github.com/drizzle-team/drizzle-orm/issues/6027:
// the 6 Gel-only ColumnDataType variants (dateDuration, duration, relDuration,
// localTime, localDate, localDateTime) were falling through columnToSchema()'s
// if/else chain to the `v.any()` catch-all, so the generated schemas validated
// nothing for these columns.
const gelTemporalColumns = {
	dateDuration: dateDuration().notNull(),
	duration: duration().notNull(),
	relDuration: relDuration().notNull(),
	localTime: localTime().notNull(),
	localDate: localDate().notNull(),
	localDateTime: timestamp().notNull(),
} as const;

const columnKeys = Object.keys(gelTemporalColumns) as (keyof typeof gelTemporalColumns)[];

test('gel temporal columns do not produce v.any() - select', () => {
	const table = gelTable('test', gelTemporalColumns);
	const result = createSelectSchema(table);

	for (const key of columnKeys) {
		const columnSchema = result.entries[key];
		expect(columnSchema, `${key} should have a schema`).toBeDefined();
		// v.any() reports `.type === 'any'` and validates nothing.
		expect(columnSchema!.type, `${key} should not be v.any()`).not.toBe('any');
		// A real schema rejects primitives that v.any() would happily accept.
		expect(v.safeParse(columnSchema!, 123).success, `${key} should reject a number`).toBe(false);
		expect(v.safeParse(columnSchema!, 'not-a-temporal').success, `${key} should reject a string`).toBe(false);
		expect(v.safeParse(columnSchema!, null).success, `${key} should reject null`).toBe(false);
	}
});

test('gel temporal columns do not produce v.any() - insert', () => {
	const table = gelTable('test', gelTemporalColumns);
	const result = createInsertSchema(table);

	for (const key of columnKeys) {
		const columnSchema = result.entries[key];
		expect(columnSchema, `${key} should have a schema`).toBeDefined();
		expect(columnSchema!.type, `${key} should not be v.any()`).not.toBe('any');
	}
});
