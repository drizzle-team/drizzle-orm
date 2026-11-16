import { describe, expect, it } from 'vitest';
import { pgTable, timestamp } from '~/pg-core/index.ts';

const table = pgTable('t', {
	withTz: timestamp('with_tz', { withTimezone: true }),
	withoutTz: timestamp('without_tz'),
});

const iso = (value: string, withTimezone = true) => {
	const column = withTimezone ? table.withTz : table.withoutTz;
	const date = column.mapFromDriverValue(value);
	return Number.isNaN(date.getTime()) ? 'Invalid Date' : date.toISOString();
};

describe('pg timestamp text parsing', () => {
	it('reads the whole-hour offsets Postgres prints for most instants', () => {
		expect(iso('2026-10-12 00:00:01.123+00')).toBe('2026-10-12T00:00:01.123Z');
		expect(iso('2026-10-12 09:00:01.123+09')).toBe('2026-10-12T00:00:01.123Z');
		expect(iso('2026-10-11 19:00:01.123-05')).toBe('2026-10-12T00:00:01.123Z');
		expect(iso('2026-10-12 05:30:01.123+05:30')).toBe('2026-10-12T00:00:01.123Z');
	});

	it('reads offsets with seconds, as printed for local mean time', () => {
		// 1800-01-01 00:00:00 in Asia/Tokyo, which used +09:18:59 before 1888.
		expect(iso('1800-01-01 00:00:00+09:18:59')).toBe('1799-12-31T14:41:01.000Z');
		// Africa/Monrovia used -00:44:30 until 1972.
		expect(iso('1971-05-31 23:15:30-00:44:30')).toBe('1971-06-01T00:00:00.000Z');
	});

	it('keeps years 1–99 instead of mapping them into the twentieth century', () => {
		expect(iso('0013-01-01 00:00:00+00')).toBe('0013-01-01T00:00:00.000Z');
		expect(iso('0013-01-01 09:18:59+09:18:59')).toBe('0013-01-01T00:00:00.000Z');
		expect(iso('0099-12-31 23:59:59', false)).toBe('0099-12-31T23:59:59.000Z');
	});

	it('reads years with more than four digits', () => {
		expect(iso('10000-01-01 00:00:00+00')).toBe('+010000-01-01T00:00:00.000Z');
	});

	it('reads BC dates', () => {
		expect(iso('0001-01-01 00:00:00+00 BC')).toBe('0000-01-01T00:00:00.000Z');
		expect(iso('0044-03-15 12:00:00+00 BC')).toBe('-000043-03-15T12:00:00.000Z');
	});

	it('keeps microsecond precision down to the millisecond', () => {
		expect(iso('2026-10-12 00:00:01.1+00')).toBe('2026-10-12T00:00:01.100Z');
		expect(iso('2026-10-12 00:00:01.12+00')).toBe('2026-10-12T00:00:01.120Z');
		expect(iso('2026-10-12 00:00:01.123456+00')).toBe('2026-10-12T00:00:01.123Z');
		expect(iso('2026-10-12 00:00:01.999999+00')).toBe('2026-10-12T00:00:01.999Z');
	});

	it('treats a timestamp without time zone as UTC', () => {
		expect(iso('2026-10-12 00:00:01.123', false)).toBe('2026-10-12T00:00:01.123Z');
		expect(iso('2026-10-12 00:00:01', false)).toBe('2026-10-12T00:00:01.000Z');
	});

	it('still accepts the ISO 8601 form with a T separator', () => {
		expect(iso('2026-10-12T00:00:01.123+00:00')).toBe('2026-10-12T00:00:01.123Z');
		expect(iso('2026-10-12T00:00:01.123Z')).toBe('2026-10-12T00:00:01.123Z');
	});

	it('passes a Date through unchanged', () => {
		const date = new Date('2026-10-12T00:00:01.123Z');
		expect(table.withTz.mapFromDriverValue(date)).toBe(date);
	});
});
