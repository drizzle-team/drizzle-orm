import { describe, expect, it } from 'vitest';
import { date, pgTable, timestamp } from '~/pg-core/index.ts';

const testTable = pgTable('test_date_timestamp', {
	ts: timestamp('ts', { mode: 'date' }),
	tsTz: timestamp('ts_tz', { mode: 'date', withTimezone: true }),
	tsStr: timestamp('ts_str', { mode: 'string' }),
	d: date('d', { mode: 'date' }),
	dStr: date('d_str', { mode: 'string' }),
});

describe('PostgreSQL Date and Timestamp year >= 10000 normalization', () => {
	it('formats standard years without alteration', () => {
		const standardDate = new Date(Date.UTC(2024, 5, 15, 12, 30, 0));
		expect(testTable.ts.mapToDriverValue(standardDate)).toBe('2024-06-15T12:30:00.000Z');
		expect(testTable.d.mapToDriverValue(standardDate)).toBe('2024-06-15T12:30:00.000Z');
	});

	it('normalizes expanded year 10000 by stripping leading + and redundant zeros', () => {
		const year10k = new Date(Date.UTC(10000, 0, 1, 0, 0, 0));
		// ECMA-262 toISOString() produces "+010000-01-01T00:00:00.000Z", which PostgreSQL rejects with SQLSTATE 22009
		expect(testTable.ts.mapToDriverValue(year10k)).toBe('10000-01-01T00:00:00.000Z');
		expect(testTable.tsTz.mapToDriverValue(year10k)).toBe('10000-01-01T00:00:00.000Z');
		expect(testTable.d.mapToDriverValue(year10k)).toBe('10000-01-01T00:00:00.000Z');
	});

	it('normalizes expanded years far into the future (e.g. year 59009)', () => {
		const distantDate = new Date(Date.UTC(59009, 5, 15, 12, 30, 45));
		expect(testTable.ts.mapToDriverValue(distantDate)).toBe('59009-06-15T12:30:45.000Z');
		expect(testTable.d.mapToDriverValue(distantDate)).toBe('59009-06-15T12:30:45.000Z');
	});

	it('maps driver Date values for date(mode: string) without +0 prefix', () => {
		const year10k = new Date(Date.UTC(10000, 0, 1, 0, 0, 0));
		expect(testTable.dStr.mapFromDriverValue(year10k)).toBe('10000-01-01');
	});

	it('maps driver Date values for timestamp(mode: string) without +0 prefix', () => {
		const year10k = new Date(Date.UTC(10000, 0, 1, 0, 0, 0));
		expect(testTable.tsStr.mapFromDriverValue(year10k)).toBe('10000-01-01 00:00:00.000');
	});
});
