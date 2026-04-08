import retry from 'async-retry';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { daterange, pgTable, serial } from 'drizzle-orm/pg-core';
import type { PgRange } from 'drizzle-orm/pg-core';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const connectionString = process.env['PG_CONNECTION_STRING'] ?? 'postgres://postgres:postgres@localhost:55432/postgres';

let client: Client;
let db: ReturnType<typeof drizzle>;

const testTable = pgTable('daterange_test', {
	id: serial('id').primaryKey(),
	period: daterange('period').notNull(),
	periodStr: daterange('period_str', { mode: 'string' }),
	optionalPeriod: daterange('optional_period'),
});

beforeAll(async () => {
	client = await retry(async () => {
		const c = new Client(connectionString);
		await c.connect();
		return c;
	}, { retries: 20, factor: 1, minTimeout: 250, maxTimeout: 250, randomize: false });

	db = drizzle(client);

	await db.execute(sql`DROP TABLE IF EXISTS daterange_test`);
	await db.execute(sql`
		CREATE TABLE daterange_test (
			id serial PRIMARY KEY,
			period daterange NOT NULL,
			period_str daterange,
			optional_period daterange
		)
	`);
});

afterAll(async () => {
	await db.execute(sql`DROP TABLE IF EXISTS daterange_test`);
	await client?.end();
});

describe('daterange column type', () => {
	test('insert and select a normal range (object mode)', async () => {
		const range: PgRange<string> = {
			lower: '2025-01-01',
			upper: '2025-12-31',
			lowerInc: true,
			upperInc: false,
			empty: false,
		};

		await db.insert(testTable).values({ period: range });

		const rows = await db.select().from(testTable);
		expect(rows.length).toBe(1);

		const result = rows[0]!.period;
		expect(result.empty).toBe(false);
		expect(result.lowerInc).toBe(true);
		expect(result.upperInc).toBe(false);
		// PG canonicalizes dates, so just check they parsed
		expect(result.lower).toBeTruthy();
		expect(result.upper).toBeTruthy();
	});

	test('insert and select a string-mode range', async () => {
		await db.execute(sql`DELETE FROM daterange_test`);

		await db.insert(testTable).values({
			period: { lower: '2025-06-01', upper: '2025-06-30', lowerInc: true, upperInc: true, empty: false },
			periodStr: '[2025-06-01,2025-06-30]',
		});

		const rows = await db.select().from(testTable);
		expect(rows.length).toBe(1);
		// String mode returns raw PG text
		expect(typeof rows[0]!.periodStr).toBe('string');
		expect(rows[0]!.periodStr).toContain('2025-');
	});

	test('insert and select an empty range', async () => {
		await db.execute(sql`DELETE FROM daterange_test`);

		const emptyRange: PgRange<string> = {
			lower: null,
			upper: null,
			lowerInc: false,
			upperInc: false,
			empty: true,
		};

		await db.insert(testTable).values({ period: emptyRange });

		const rows = await db.select().from(testTable);
		expect(rows.length).toBe(1);
		expect(rows[0]!.period.empty).toBe(true);
	});

	test('insert and select unbounded ranges', async () => {
		await db.execute(sql`DELETE FROM daterange_test`);

		// Lower unbounded
		const lowerUnbounded: PgRange<string> = {
			lower: null,
			upper: '2025-12-31',
			lowerInc: false,
			upperInc: false,
			empty: false,
		};

		// Upper unbounded
		const upperUnbounded: PgRange<string> = {
			lower: '2025-01-01',
			upper: null,
			lowerInc: true,
			upperInc: false,
			empty: false,
		};

		await db.insert(testTable).values([
			{ period: lowerUnbounded },
			{ period: upperUnbounded },
		]);

		const rows = await db.select().from(testTable);
		expect(rows.length).toBe(2);

		// Lower unbounded
		expect(rows[0]!.period.lower).toBeNull();
		expect(rows[0]!.period.upper).toBeTruthy();

		// Upper unbounded
		expect(rows[1]!.period.lower).toBeTruthy();
		expect(rows[1]!.period.upper).toBeNull();
	});

	test('nullable column returns null', async () => {
		await db.execute(sql`DELETE FROM daterange_test`);

		await db.insert(testTable).values({
			period: { lower: '2025-01-01', upper: '2025-12-31', lowerInc: true, upperInc: false, empty: false },
			optionalPeriod: null,
		});

		const rows = await db.select().from(testTable);
		expect(rows.length).toBe(1);
		expect(rows[0]!.optionalPeriod).toBeNull();
	});

	test('raw SQL with daterange works', async () => {
		await db.execute(sql`DELETE FROM daterange_test`);
		await db.execute(sql`INSERT INTO daterange_test (period) VALUES ('[2025-03-01,2025-03-31)'::daterange)`);

		const rows = await db.select().from(testTable);
		expect(rows.length).toBe(1);
		expect(rows[0]!.period.empty).toBe(false);
		expect(rows[0]!.period.lower).toBeTruthy();
		expect(rows[0]!.period.upper).toBeTruthy();
	});
});
