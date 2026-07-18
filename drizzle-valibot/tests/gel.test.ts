import { gelTable } from 'drizzle-orm/gel-core';
import { DateDuration, Duration, LocalDate, LocalDateTime, LocalTime, RelativeDuration } from 'gel';
import * as v from 'valibot';
import { expect, test } from 'vitest';
import { createSelectSchema } from '../src';

test('gel - dateDuration/duration/relDuration/localDate/localTime/localDateTime - select', (t) => {
	const table = gelTable('test', ({ dateDuration, duration, relDuration, localDate, localTime, timestamp }) => ({
		dateDuration: dateDuration().notNull(),
		duration: duration().notNull(),
		relDuration: relDuration().notNull(),
		localDate: localDate().notNull(),
		localTime: localTime().notNull(),
		localDateTime: timestamp().notNull(),
	}));

	const schema = createSelectSchema(table);

	const valid = {
		dateDuration: new DateDuration(0, 0, 0),
		duration: new Duration(),
		relDuration: new RelativeDuration(),
		localDate: new LocalDate(2024, 1, 1),
		localTime: new LocalTime(12, 0, 0),
		localDateTime: new LocalDateTime(2024, 1, 1, 12, 0, 0),
	};

	// the fully valid object (real Gel driver instances) must pass
	expect(v.safeParse(schema, valid).success).toBe(true);

	// swapping any single field for a non-matching value must fail (previously these all passed as v.any())
	expect(v.safeParse(schema, { ...valid, dateDuration: 'P1D' }).success).toBe(false);
	expect(v.safeParse(schema, { ...valid, duration: 'PT1H' }).success).toBe(false);
	expect(v.safeParse(schema, { ...valid, relDuration: {} }).success).toBe(false);
	expect(v.safeParse(schema, { ...valid, localDate: '2024-01-01' }).success).toBe(false);
	expect(v.safeParse(schema, { ...valid, localTime: '12:00:00' }).success).toBe(false);
	expect(v.safeParse(schema, { ...valid, localDateTime: new Date() }).success).toBe(false);
});
