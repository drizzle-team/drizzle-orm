// pool.query with a signal and `cancel: false`: an abortable query that still shares a connection with other
// queries. Requires `bun run test:setup`.
//
// A Postgres CancelRequest names a backend, not a query: it stops whatever that backend runs when it arrives. On a
// shared connection that can be another caller's query, so a query that may be cancelled on the server gets a
// connection to itself. With `cancel: false` the abort never reaches the server: a query that has not been sent is
// removed and never runs, and one that has been sent runs to the end with its result dropped. That is what makes
// it safe to pipeline. Effect's own Postgres driver does the same with `multiplex: true`.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { TEST_TIMEOUT, testPool } from '../helpers/db.ts';

const T = `abort_shared_${process.pid}`;
const admin = testPool({ max: 1 });

beforeAll(async () => {
	await admin.execute(`drop table if exists ${T}`);
	await admin.execute(`create table ${T}(tag text not null)`);
});
afterAll(async () => {
	await admin.execute(`drop table if exists ${T}`);
	await admin.end();
});

const tags = async (tag: string): Promise<number> => {
	const r = await admin.query(`select count(*)::int4 from ${T} where tag = $1`, [tag]);
	return (r.rows[0] as unknown as number[])[0]!;
};
// An insert that takes `seconds` on the server before it writes its row
const slowInsert = (seconds: number) => `insert into ${T}(tag) select $1 from pg_sleep(${seconds})`;
const settle = (p: Promise<unknown>) =>
	p.then(() => ({ ok: true as const }), (e: unknown) => ({ ok: false as const, error: e as Error }));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('pool.query({ signal, cancel: false })', () => {
	test('shares the connection: it stays checked in while the query runs', async () => {
		const pool = testPool({ max: 1 });
		try {
			await pool.execute('select 1'); // open the connection
			const controller = new AbortController();
			const running = pool.execute('select pg_sleep(0.3)', [], { signal: controller.signal, cancel: false });
			await sleep(50);
			expect(pool.idleCount).toBe(1);
			await running;

			// with a server-side cancel the query gets the connection to itself
			const exclusive = pool.execute('select pg_sleep(0.3)', [], { signal: controller.signal });
			await sleep(50);
			expect(pool.idleCount).toBe(0);
			await exclusive;
		} finally {
			await pool.end();
		}
	}, TEST_TIMEOUT);

	test(
		'aborted after it was sent: rejects at once, runs to the end on the server, and other queries are untouched',
		async () => {
			const pool = testPool({ max: 1 });
			try {
				await pool.execute('select 1');
				const controller = new AbortController();
				const t0 = performance.now();
				const aborted = settle(
					pool.execute(slowInsert(0.4), ['sent'], { signal: controller.signal, cancel: false }),
				);
				// pipelined behind it on the same connection
				const behind = pool.execute(`select 'behind' as v`, [], { mode: 'object' });
				await sleep(100);
				controller.abort();

				const result = await aborted;
				expect(result.ok).toBe(false);
				expect(result.ok ? undefined : result.error.name).toBe('AbortError');
				expect(performance.now() - t0).toBeLessThan(300);
				// no CancelRequest went out: the query behind it is not canceled in its place
				expect((await behind).rows as unknown[]).toEqual([{ v: 'behind' }]);
				await sleep(400);
				expect(await tags('sent')).toBe(1);
			} finally {
				await pool.end();
			}
		},
		TEST_TIMEOUT,
	);

	test('aborted before it was sent: never runs on the server', async () => {
		// depth 2: a third query waits in the connection's queue until one of the first two is done
		const pool = testPool({ max: 1, pipeline: { depth: 2 } });
		try {
			await pool.execute('select 1');
			const first = pool.execute('select pg_sleep(0.3)');
			const second = pool.execute('select pg_sleep(0.3)');
			const controller = new AbortController();
			const queued = settle(pool.execute(slowInsert(0), ['queued'], { signal: controller.signal, cancel: false }));
			await sleep(50);
			controller.abort();

			const result = await queued;
			expect(result.ok ? undefined : result.error.name).toBe('AbortError');
			await Promise.all([first, second]);
			await pool.execute('select 1');
			expect(await tags('queued')).toBe(0);
		} finally {
			await pool.end();
		}
	}, TEST_TIMEOUT);

	test('aborted while it waits for a connection: rejects at once and never runs', async () => {
		const pool = testPool({ max: 1 });
		try {
			const held = await pool.acquire(); // the only connection, checked out
			const controller = new AbortController();
			const waiting = settle(pool.execute(slowInsert(0), ['waiting'], { signal: controller.signal, cancel: false }));
			await sleep(50);
			expect(pool.waiting).toBe(1);
			controller.abort();

			const result = await waiting;
			expect(result.ok ? undefined : result.error.name).toBe('AbortError');
			expect(pool.waiting).toBe(0);
			pool.release(held);
			await pool.execute('select 1');
			expect(await tags('waiting')).toBe(0);
		} finally {
			await pool.end();
		}
	}, TEST_TIMEOUT);

	test('a signal that is already aborted never sends the query', async () => {
		const pool = testPool({ max: 1 });
		try {
			const result = await settle(
				pool.execute(slowInsert(0), ['pre'], { signal: AbortSignal.abort(), cancel: false }),
			);
			expect(result.ok).toBe(false);
			await pool.execute('select 1');
			expect(await tags('pre')).toBe(0);
		} finally {
			await pool.end();
		}
	}, TEST_TIMEOUT);

	test('a timeout behaves like an abort', async () => {
		const pool = testPool({ max: 1 });
		try {
			await pool.execute('select 1');
			const result = await settle(pool.execute(slowInsert(0.3), ['timeout'], { timeout: 50, cancel: false }));
			expect(result.ok).toBe(false);
			expect(pool.idleCount).toBe(1); // it shared the connection
			await sleep(400);
			expect(await tags('timeout')).toBe(1); // ran to the end on the server
		} finally {
			await pool.end();
		}
	}, TEST_TIMEOUT);

	test('without `cancel: false` an abort still cancels the query on the server', async () => {
		const pool = testPool({ max: 1 });
		try {
			await pool.execute('select 1');
			const controller = new AbortController();
			const aborted = settle(pool.execute(slowInsert(0.4), ['canceled'], { signal: controller.signal }));
			await sleep(100);
			controller.abort();
			expect((await aborted).ok).toBe(false);
			await sleep(400);
			expect(await tags('canceled')).toBe(0);
		} finally {
			await pool.end();
		}
	}, TEST_TIMEOUT);

	test('on a pool that does not pipeline, the query has its own connection and is canceled on the server', async () => {
		const pool = testPool({ max: 1, pipeline: false });
		try {
			await pool.execute('select 1');
			const controller = new AbortController();
			const aborted = settle(
				pool.execute(slowInsert(0.4), ['unshared'], { signal: controller.signal, cancel: false }),
			);
			await sleep(100);
			controller.abort();
			expect((await aborted).ok).toBe(false);
			await sleep(400);
			expect(await tags('unshared')).toBe(0);
		} finally {
			await pool.end();
		}
	}, TEST_TIMEOUT);
});
