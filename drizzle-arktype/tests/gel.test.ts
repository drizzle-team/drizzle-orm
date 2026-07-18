import { type } from 'arktype';
import { gelTable } from 'drizzle-orm/gel-core';
import { DateDuration, Duration, LocalDate, LocalDateTime, LocalTime, RelativeDuration } from 'gel';
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
	expect(schema(valid) instanceof type.errors).toBe(false);

	// swapping any single field for a non-matching value must fail (previously these all passed as unknown)
	expect(schema({ ...valid, dateDuration: 'P1D' }) instanceof type.errors).toBe(true);
	expect(schema({ ...valid, duration: 'PT1H' }) instanceof type.errors).toBe(true);
	expect(schema({ ...valid, relDuration: {} }) instanceof type.errors).toBe(true);
	expect(schema({ ...valid, localDate: '2024-01-01' }) instanceof type.errors).toBe(true);
	expect(schema({ ...valid, localTime: '12:00:00' }) instanceof type.errors).toBe(true);
	expect(schema({ ...valid, localDateTime: new Date() }) instanceof type.errors).toBe(true);
});
