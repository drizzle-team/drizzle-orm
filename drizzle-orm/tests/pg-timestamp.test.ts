import { expect, test } from 'vitest';
import { pgTable, serial, timestamp } from '~/pg-core';
import { drizzle } from '~/pglite';
import { sql } from '~/sql';

test('timestamp mapToDriverValue strips expanded-year leading plus and zero padding for years past 9999', async () => {
	const events = pgTable('events', {
		id: serial('id').primaryKey(),
		at: timestamp('at', { withTimezone: true }).notNull(),
		atStr: timestamp('at_str', { mode: 'string', withTimezone: true }).notNull(),
	});

	expect(events.at.mapToDriverValue(new Date('2024-01-02T03:04:05.678Z'))).toBe('2024-01-02T03:04:05.678Z');
	expect(events.at.mapToDriverValue(new Date(Date.UTC(10000, 0, 1)))).toBe('10000-01-01T00:00:00.000Z');
	expect(events.at.mapToDriverValue(new Date(Date.UTC(59009, 0, 1)))).toBe('59009-01-01T00:00:00.000Z');
	expect(events.at.mapToDriverValue(new Date(Date.UTC(100000, 0, 1)))).toBe('100000-01-01T00:00:00.000Z');
	expect(events.atStr.mapToDriverValue(new Date(Date.UTC(10000, 0, 1)))).toBe('10000-01-01T00:00:00.000Z');

	const db = drizzle('memory://');
	await db.execute(
		sql`create table events (id serial primary key, at timestamptz not null, at_str timestamptz not null)`,
	);

	const year10000 = new Date(Date.UTC(10000, 0, 1));
	const [inserted] = await db
		.insert(events)
		.values({ at: year10000, atStr: year10000 as unknown as string })
		.returning();

	expect(inserted!.at.getTime()).toBe(year10000.getTime());
});
