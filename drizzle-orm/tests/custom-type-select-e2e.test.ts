import { Database } from 'sqlite3';
import { describe, expect, it } from 'vitest';
import { sql } from '~/sql/sql.ts';
import { integer, sqliteTable } from '~/sqlite-core';
import { customType } from '~/sqlite-core/columns/custom.ts';
import { drizzle } from '~/sqlite-proxy/index.ts';

/**
 * End-to-end proof for issue #554:
 * A custom type whose DB value must be wrapped in SQL at SELECT time.
 *
 * Scenario: values are stored uppercase in the DB, but the custom type must
 * read them back lowercased via SQLite's lower() function — i.e. the column
 * MUST be wrapped in `lower("col")` at select time for correct results.
 */
const lowerOnRead = customType<{ data: string; driverData: string }>({
	dataType() {
		return 'text';
	},
	toDriver(value: string): string {
		return value.toUpperCase(); // stored uppercase in DB
	},
	fromDriver(value: string): string {
		return value; // value as returned by SQL (already lowercased by lower())
	},
	selectFromDb(column) {
		return sql`lower(${column})`;
	},
});

// control type: same mapping but NO selectFromDb wrapper
const plainUpper = customType<{ data: string; driverData: string }>({
	dataType() {
		return 'text';
	},
	toDriver(value: string): string {
		return value.toUpperCase();
	},
	fromDriver(value: string): string {
		return value;
	},
});

const items = sqliteTable('items_e2e', {
	id: integer('id').primaryKey(),
	label: lowerOnRead('label'),
	plain: plainUpper('plain'),
});

// persistent in-memory DB across calls so the test can create/insert/select
const sharedClient = new Database(':memory:');
function runShared(sqlText: string, params: any[], method: 'run' | 'all' | 'values' | 'get') {
	return new Promise<{ rows: any[] }>((resolve, reject) => {
		const callback = (err: Error | null, rows: any) => {
			if (err) return reject(err);
			if (method === 'run') return resolve({ rows: [] });
			const arr = Array.isArray(rows) ? rows : [rows];
			// sqlite-proxy contract: rows are arrays of values (positional)
			resolve({ rows: arr.map((r) => (typeof r === 'object' && r !== null ? Object.values(r) : [r])) });
		};
		if (method === 'run') sharedClient.run(sqlText, params, callback);
		else sharedClient.all(sqlText, params, callback);
	});
}

describe('custom type selectFromDb — end-to-end (real SQLite engine)', () => {
	it('generates wrapped SQL and returns correctly mapped values from a real DB', async () => {
		const db = drizzle(async (sqlText, params, method) => runShared(sqlText, params, method));

		// 1) generated SQL must contain the wrapper for label, but not for plain
		const q = db.select().from(items).toSQL();
		expect(q.sql).toContain('lower("items_e2e"."label")');
		expect(q.sql).not.toContain('lower("items_e2e"."plain")');

		// 2) create table + insert through the ORM (toDriver uppercases)
		await db.run(sql`CREATE TABLE items_e2e (id integer primary key, label text, plain text)`);
		await db.insert(items).values({ label: 'hello drizzle', plain: 'hello drizzle' });

		// 3) raw read: stored as uppercase (proof toDriver ran, no wrapper on insert)
		const raw = await db.all(sql`select label from items_e2e`);
		expect((raw[0] as unknown[])[0]).toBe('HELLO DRIZZLE');

		// 4) ORM read: wrapper lower() applied at SQL level
		const rows = await db.select().from(items);
		expect(rows[0]!.label).toBe('hello drizzle');
		// control: without selectFromDb, the raw uppercase value comes back
		expect(rows[0]!.plain).toBe('HELLO DRIZZLE');

		// 5) partial select also wrapped
		const rows2 = await db.select({ label: items.label }).from(items);
		expect(rows2[0]!.label).toBe('hello drizzle');
	});
});
