// DateStyle against a live server: the driver sends DateStyle=ISO (and IntervalStyle=postgres) at startup,
// so a database or role default can't change how dates print; a session that changes it anyway (SET,
// SET LOCAL, -c datestyle in options) gets a clear error for text date columns instead of Invalid Date.
// The decoders themselves: test/unit/datestyle.test.ts. Neon HTTP: test/integration/neon-http.test.ts.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { replication } from '../../src/index.ts';
import { REMOTE, TEST_CONFIG, testConnect, withConn } from '../helpers/db.ts';

const NOT_ISO = /cannot decode ".+" as a date or timestamp: it is not ISO text/;
const TS = "select '2024-02-03 12:34:56.789+00'::timestamptz as v";
const iso = (r: { rows: unknown[] }) => ((r.rows[0] as unknown[])[0] as Date).toISOString();
const show = async (c: { query(sql: string): Promise<{ rows: unknown[] }> }, name: string) =>
	(((await c.query(`show ${name}`)).rows[0]) as string[])[0];

describe('DateStyle', () => {
	test('a connection starts with DateStyle ISO and IntervalStyle postgres', async () => {
		await withConn(async (c) => {
			expect(c.serverParams.DateStyle).toMatch(/^ISO, /);
			expect(c.serverParams.IntervalStyle).toBe('postgres');
			expect(iso(await c.query(TS))).toBe('2024-02-03T12:34:56.789Z');
			// 'client': set by this connection's startup, not a server or database default
			const r = await c.query(
				"select name, source from pg_settings where name in ('DateStyle', 'IntervalStyle') order by name",
			);
			expect(r.rows).toEqual([['DateStyle', 'client'], ['IntervalStyle', 'client']]);
		});
	});

	test('SET datestyle: date columns fail with a clear error, the connection stays usable, RESET restores', async () => {
		await withConn(async (c) => {
			await c.query("set time zone 'UTC'");
			await c.query("set datestyle = 'German'");
			expect(c.serverParams.DateStyle).toBe('German, DMY');
			await expect(c.query(TS)).rejects.toThrow('cannot decode "03.02.2024 12:34:56.789 UTC"');
			await expect(c.query("select '2024-02-03'::date as v", [], { mode: 'object' })).rejects.toThrow(NOT_ISO);
			await expect(c.query("select array['2024-02-03 12:00'::timestamp] as v")).rejects.toThrow(NOT_ISO);
			expect((await c.query("select 1 as n, '2024-02-03'::date::text as d")).rows).toEqual([[1, '03.02.2024']]);
			await c.query('reset datestyle');
			expect(c.serverParams.DateStyle).toMatch(/^ISO, /);
			expect(iso(await c.query(TS))).toBe('2024-02-03T12:34:56.789Z');
		});
	});

	test('pipelined queries decode in the style that was set before them', async () => {
		await withConn(async (c) => {
			const [before, , during, , after] = await Promise.allSettled([
				c.query(TS),
				c.query("set datestyle = 'SQL, DMY'"),
				c.query(TS),
				c.query('reset datestyle'),
				c.query(TS),
			]);
			expect(before.status === 'fulfilled' && iso(before.value)).toBe('2024-02-03T12:34:56.789Z');
			expect(during.status === 'rejected' && String(during.reason)).toMatch(NOT_ISO);
			expect(after.status === 'fulfilled' && iso(after.value)).toBe('2024-02-03T12:34:56.789Z');
		});
	});

	test('SET LOCAL lasts until the transaction ends', async () => {
		await withConn(async (c) => {
			await c.transaction(async (tx) => {
				await tx.query("set local datestyle = 'Postgres'");
				await expect(tx.query(TS)).rejects.toThrow(NOT_ISO);
			});
			expect(c.serverParams.DateStyle).toMatch(/^ISO, /);
			expect(iso(await c.query(TS))).toBe('2024-02-03T12:34:56.789Z');
		});
	});

	test("a datestyle in options is the caller's: dates fail, temporal: 'string' returns the text", async () => {
		const c = await testConnect({ options: '-c datestyle=German -c timezone=UTC' });
		const s = await testConnect({ options: '-c datestyle=German -c timezone=UTC', temporal: 'string' });
		try {
			expect(c.serverParams.DateStyle).toBe('German, DMY');
			await expect(c.query(TS)).rejects.toThrow(NOT_ISO);
			expect((await s.query(TS)).rows).toEqual([['03.02.2024 12:34:56.789 UTC']]);
		} finally {
			await Promise.all([c.end(), s.end()]);
		}
	});

	// Database defaults need a database of their own: ALTER DATABASE on the shared one would leak into other tests.
	describe.skipIf(REMOTE)('a database whose default DateStyle is German', () => {
		const DB = `datestyle_${process.pid}`;
		beforeAll(async () => {
			await withConn(async (c) => {
				await c.query(`drop database if exists ${DB}`);
				await c.query(`create database ${DB}`);
				await c.query(`alter database ${DB} set datestyle = 'German'`);
				await c.query(`alter database ${DB} set intervalstyle = 'iso_8601'`);
			});
		});
		afterAll(async () => {
			await withConn((c) => c.query(`drop database if exists ${DB} with (force)`));
		});

		test('the startup DateStyle and IntervalStyle win over it', async () => {
			const c = await testConnect({ database: DB });
			try {
				expect(await show(c, 'datestyle')).toMatch(/^ISO, /);
				expect(await show(c, 'intervalstyle')).toBe('postgres');
				expect(iso(await c.query(TS))).toBe('2024-02-03T12:34:56.789Z');
				await c.query('reset all');
				expect(await show(c, 'datestyle')).toMatch(/^ISO, /);
			} finally {
				await c.end();
			}
		});

		test('behind a transaction pooler only DateStyle is sent', async () => {
			const c = await testConnect({ database: DB, pooler: true });
			try {
				expect(await show(c, 'datestyle')).toMatch(/^ISO, /);
				expect(await show(c, 'intervalstyle')).toBe('iso_8601'); // the database default: not sent
			} finally {
				await c.end();
			}
		});

		test('a replication connection starts with DateStyle ISO too', async () => {
			const repl = await replication({ ...TEST_CONFIG, database: DB });
			try {
				expect((await repl.command('show datestyle')).rows[0]![0]).toMatch(/^ISO, /);
			} finally {
				repl.end();
			}
		});
	});
});
