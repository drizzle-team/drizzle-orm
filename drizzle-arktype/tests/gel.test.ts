import {
	dateDuration,
	duration,
	gelTable,
	localDate,
	localTime,
	relDuration,
	timestamp,
} from 'drizzle-orm/gel-core';
import { expect, test } from 'vitest';
import { createInsertSchema, createSelectSchema } from '../src';

// Regression test for https://github.com/drizzle-team/drizzle-orm/issues/6027:
// the 6 Gel-only ColumnDataType variants (dateDuration, duration, relDuration,
// localTime, localDate, localDateTime) were falling through columnToSchema()'s
// if/else chain to the `type.unknown` catch-all, so the generated schemas
// validated nothing for these columns.
const gelTemporalColumns = {
	dateDuration: dateDuration().notNull(),
	duration: duration().notNull(),
	relDuration: relDuration().notNull(),
	localTime: localTime().notNull(),
	localDate: localDate().notNull(),
	localDateTime: timestamp().notNull(),
} as const;

const columnKeys = Object.keys(gelTemporalColumns) as (keyof typeof gelTemporalColumns)[];

// A row of non-null objects, which is what the gel driver produces for these
// columns at runtime.
const validRow = {
	dateDuration: {},
	duration: {},
	relDuration: {},
	localTime: {},
	localDate: {},
	localDateTime: {},
};

test('gel temporal columns do not produce type.unknown - select', () => {
	const table = gelTable('test', gelTemporalColumns);
	const result = createSelectSchema(table);

	expect(result.allows(validRow), 'a row of temporal objects should validate').toBe(true);

	for (const key of columnKeys) {
		// A real schema rejects primitives that type.unknown would happily accept.
		expect(result.allows({ ...validRow, [key]: 123 }), `${key} should reject a number`).toBe(false);
		expect(result.allows({ ...validRow, [key]: 'not-a-temporal' }), `${key} should reject a string`).toBe(false);
		expect(result.allows({ ...validRow, [key]: null }), `${key} should reject null`).toBe(false);
	}
});

test('gel temporal columns do not produce type.unknown - insert', () => {
	const table = gelTable('test', gelTemporalColumns);
	const result = createInsertSchema(table);

	expect(result.allows(validRow), 'a row of temporal objects should validate').toBe(true);

	for (const key of columnKeys) {
		expect(result.allows({ ...validRow, [key]: 123 }), `${key} should reject a number`).toBe(false);
		expect(result.allows({ ...validRow, [key]: 'not-a-temporal' }), `${key} should reject a string`).toBe(false);
		expect(result.allows({ ...validRow, [key]: null }), `${key} should reject null`).toBe(false);
	}
});
