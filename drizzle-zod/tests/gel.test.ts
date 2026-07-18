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

	// each column must accept its real Gel driver instance
	expect(schema.shape.dateDuration.safeParse(new DateDuration(0, 0, 0)).success).toBe(true);
	expect(schema.shape.duration.safeParse(new Duration()).success).toBe(true);
	expect(schema.shape.relDuration.safeParse(new RelativeDuration()).success).toBe(true);
	expect(schema.shape.localDate.safeParse(new LocalDate(2024, 1, 1)).success).toBe(true);
	expect(schema.shape.localTime.safeParse(new LocalTime(12, 0, 0)).success).toBe(true);
	expect(schema.shape.localDateTime.safeParse(new LocalDateTime(2024, 1, 1, 12, 0, 0)).success).toBe(true);

	// and must reject values that aren't the matching Gel class (previously these all passed as z.any())
	expect(schema.shape.dateDuration.safeParse('P1D').success).toBe(false);
	expect(schema.shape.duration.safeParse('PT1H').success).toBe(false);
	expect(schema.shape.relDuration.safeParse({}).success).toBe(false);
	expect(schema.shape.localDate.safeParse('2024-01-01').success).toBe(false);
	expect(schema.shape.localTime.safeParse('12:00:00').success).toBe(false);
	expect(schema.shape.localDateTime.safeParse(new Date()).success).toBe(false);
});
