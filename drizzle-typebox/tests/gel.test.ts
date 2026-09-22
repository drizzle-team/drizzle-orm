import { Kind } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
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
// if/else chain to the `t.Any()` catch-all, so the generated schemas validated
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

test('gel temporal columns do not produce t.Any() - select', () => {
	const table = gelTable('test', gelTemporalColumns);
	const result = createSelectSchema(table);

	for (const key of columnKeys) {
		const columnSchema = result.properties[key];
		expect(columnSchema, `${key} should have a schema`).toBeDefined();
		// t.Any() reports `[Kind] === 'Any'` and validates nothing.
		expect(columnSchema![Kind], `${key} should not be t.Any()`).not.toBe('Any');
		// A real schema rejects primitives that t.Any() would happily accept.
		expect(Value.Check(columnSchema!, 123), `${key} should reject a number`).toBe(false);
		expect(Value.Check(columnSchema!, 'not-a-temporal'), `${key} should reject a string`).toBe(false);
		expect(Value.Check(columnSchema!, null), `${key} should reject null`).toBe(false);
	}
});

test('gel temporal columns do not produce t.Any() - insert', () => {
	const table = gelTable('test', gelTemporalColumns);
	const result = createInsertSchema(table);

	for (const key of columnKeys) {
		const columnSchema = result.properties[key];
		expect(columnSchema, `${key} should have a schema`).toBeDefined();
		expect(columnSchema![Kind], `${key} should not be t.Any()`).not.toBe('Any');
	}
});
