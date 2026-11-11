// Domain: "pool lazy query API" — pool.query() is a lazy thenable, pool.execute() is eager, and
// pool.batch() runs a set pipelined (one connection) or concurrently (fan-out). Read-only SELECTs.
import { describe, expect, test } from 'bun:test';
import { caught, PgError, testPool } from '../../helpers/db.ts';

const cell = (r: { rows: unknown[] }, k: string) => (r.rows[0] as Record<string, unknown>)[k];

describe('pool.query is lazy; pool.execute is eager', () => {
	test('pool.query() does not run until awaited — no connection acquired before then', async () => {
		const pool = testPool();
		try {
			const q = pool.query('select 1 as n', [], { mode: 'object' });
			expect(pool.size).toBe(0); // lazy: nothing checked out yet
			const r = await q; // awaiting forces execution
			expect(cell(r, 'n')).toBe(1);
			expect(pool.size).toBe(1); // one connection opened by the await
			expect(await q).toBe(r); // memoized: awaiting again runs it once (same result object)
		} finally {
			await pool.end();
		}
	});

	test('toSQL() previews a lazy query without executing it', async () => {
		const pool = testPool();
		try {
			const q = pool.query('select $1::int4 as n', [7], { mode: 'object' });
			expect(q.toSQL()).toEqual({ sql: 'select $1::int4 as n', params: [7], options: { mode: 'object' } });
			expect(pool.size).toBe(0); // still lazy — toSQL() had no side effects
			const r = await q;
			expect(cell(r, 'n')).toBe(7); // and the query still runs normally afterwards
		} finally {
			await pool.end();
		}
	});

	test('pool.execute() runs now and returns a Promise', async () => {
		const pool = testPool();
		try {
			const p = pool.execute('select 42 as n', [], { mode: 'object' });
			expect(p).toBeInstanceOf(Promise);
			expect(cell(await p, 'n')).toBe(42);
		} finally {
			await pool.end();
		}
	});
});

describe('pool.batch (atomic transaction) / pipeline (one conn) / parallel (fan-out)', () => {
	test('batch runs the set on ONE connection, in input order', async () => {
		const pool = testPool();
		try {
			const rs = await pool.batch([
				pool.query('select pg_backend_pid() as pid, $1::int as n', [0], { mode: 'object' }),
				pool.query('select pg_backend_pid() as pid, $1::int as n', [1], { mode: 'object' }),
				pool.query('select pg_backend_pid() as pid, $1::int as n', [2], { mode: 'object' }),
			]);
			rs.forEach((r, i) => expect(cell(r, 'n')).toBe(i)); // order preserved
			expect(new Set(rs.map((r) => cell(r, 'pid'))).size).toBe(1); // one backend
			expect(pool.size).toBe(1); // one reserved connection
		} finally {
			await pool.end();
		}
	});

	test('batch is ONE round trip: BEGIN, the queries and COMMIT leave in a single socket write', async () => {
		const pool = testPool({ max: 1 });
		try {
			const conn = await pool.acquire(); // the one connection every op on this pool reuses
			await conn.query('select 1'); // past startup, so the counters below measure the batch alone
			const writes = conn.stats.writes;
			pool.release(conn);

			const rs = await pool.batch([
				pool.query('select $1::int as n', [0], { mode: 'object' }),
				pool.query('select $1::int as n', [1], { mode: 'object' }),
				pool.query('select $1::int as n', [2], { mode: 'object' }),
			]);
			rs.forEach((r, i) => expect(cell(r, 'n')).toBe(i));
			expect(conn.stats.writes).toBe(writes + 1); // begin + 3 queries + commit: one socket write
			expect(conn.stats.maxInflight).toBeGreaterThanOrEqual(5); // all five were in flight together
			expect(conn.inTransaction).toBe(false); // COMMIT went out with the set — nothing left open

			// the failing shape is still a single write: the aborted tx turns the trailing COMMIT into a ROLLBACK
			const before = conn.stats.writes;
			const e = await caught(() => pool.batch([pool.query('select 1'), pool.query('select 1/0')]));
			expect((e as PgError).code).toBe('22012');
			expect(conn.stats.writes).toBe(before + 1);
			expect(conn.inTransaction).toBe(false);
		} finally {
			await pool.end();
		}
	});

	test('batch metrics: one round trip, every query measured, and what the server parsed or reused', async () => {
		const pool = testPool({ max: 1 });
		try {
			const named = (n: number) => pool.query('select $1::int as n', [n], { name: 'pb_metrics_n', mode: 'object' });
			const first = await pool.batch([named(1), named(2), pool.query('select 3 as n', [], { mode: 'object' })], {
				metrics: true,
			});
			expect(first.map((r) => cell(r, 'n'))).toEqual([1, 2, 3]);
			expect(first.metrics).toMatchObject({
				unit: 'ms',
				statements: 5, // BEGIN, three queries, COMMIT
				writes: 1,
				roundTrips: 1,
				parsed: 1, // the first use of the name
				reused: 1, // the second use, queued behind that Parse
				unnamed: 1,
			});
			expect(first.metrics.backendPid).toBeNumber();
			expect(first.metrics.total).toBeGreaterThanOrEqual(first.metrics.acquire);
			// each query's own metrics, as the same objects its result carries
			expect(first.metrics.queries).toHaveLength(3);
			first.forEach((r, i) => expect(first.metrics.queries[i]).toBe(r.metrics!));
			expect(first.metrics.queries.map((m) => [m.statementName, m.prepared])).toEqual([
				['pb_metrics_n', false],
				['pb_metrics_n', true],
				[undefined, false],
			]);

			// the connection now holds the statement: no Parse at all
			const again = await pool.batch([named(4), named(5)], { metrics: 'us' });
			expect(again.metrics).toMatchObject({ unit: 'us', statements: 4, roundTrips: 1, parsed: 0, reused: 2 });
			expect(Number.isInteger(again.metrics.total)).toBe(true);
		} finally {
			await pool.end();
		}
	});

	test('a batch is one write and one round trip even with pipelining off', async () => {
		const pool = testPool({ max: 1, pipeline: false });
		try {
			const rs = await pool.batch([pool.query('select 1'), pool.query('select 2'), pool.query('select 3')], {
				metrics: true,
			});
			expect(rs.metrics).toMatchObject({ statements: 5, writes: 1, roundTrips: 1, unnamed: 3 });
		} finally {
			await pool.end();
		}
	});

	test('batch without metrics carries none', async () => {
		const pool = testPool();
		try {
			const rs = await pool.batch([pool.query('select 1')]);
			expect(rs.metrics).toBeUndefined();
			expect(rs[0]!.metrics).toBeUndefined();
		} finally {
			await pool.end();
		}
	});

	test('batch is ATOMIC but pipeline is NOT: a failing member rolls back a batch, not a pipeline', async () => {
		const pool = testPool();
		const cnt = async () =>
			Number(cell(await pool.execute('select count(*)::int as n from pb_atomic', [], { mode: 'object' }), 'n'));
		await pool.execute('create table pb_atomic(v int)'); // regular table: visible across connections
		try {
			// batch: the two inserts + a failing query -> whole transaction rolls back
			const e1 = await caught(() =>
				pool.batch([
					pool.query('insert into pb_atomic values (1)'),
					pool.query('insert into pb_atomic values (2)'),
					pool.query('select 1/0'),
				])
			);
			expect((e1 as PgError).code).toBe('22012');
			expect((e1 as PgError).failedQueryIndex).toBe(2);
			expect(await cnt()).toBe(0); // rolled back — nothing persisted

			// pipeline: same shape, but each autocommits -> the inserts survive the later failure
			const rs = await pool.pipeline([
				pool.query('insert into pb_atomic values (3)'),
				pool.query('insert into pb_atomic values (4)'),
				pool.query('select 1/0'),
			]);
			expect(rs.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled', 'rejected']);
			expect(((rs[2] as PromiseRejectedResult).reason as PgError).code).toBe('22012');
			expect(await cnt()).toBe(2); // 3 and 4 committed despite the failing sibling
		} finally {
			await pool.execute('drop table if exists pb_atomic');
			await pool.end();
		}
	});

	test('batch stays ATOMIC when a member fails CLIENT-side and never reaches the server', async () => {
		// A NUL byte can't be encoded into a text param, so the statement is rejected before it is sent; the
		// pre-queued COMMIT would otherwise commit its siblings. Pipelining on: the failure is synchronous
		// (counted as unsent). Pipelining off: the statement is serialized LATER, behind the queued COMMIT,
		// and flips its batch group — both end with ROLLBACK on the wire.
		for (const pipeline of [true, false]) {
			const pool = testPool({ max: 1, pipeline });
			await pool.execute('create table pb_client_fail(v text)');
			try {
				const e = await caught(() =>
					pool.batch([
						pool.query('insert into pb_client_fail values ($1)', ['before']),
						pool.query('insert into pb_client_fail values ($1)', ['bad\0byte']),
						pool.query('insert into pb_client_fail values ($1)', ['after']),
					])
				);
				expect(e).toBeInstanceOf(Error);
				expect((e as PgError).failedQueryIndex).toBe(1);
				const { rows } = await pool.execute('select count(*)::int as n from pb_client_fail', [], { mode: 'object' });
				expect(rows[0] as unknown).toEqual({ n: 0 }); // neither sibling persisted
				const conn = await pool.acquire();
				expect(conn.inTransaction).toBe(false); // the ROLLBACK closed it; nothing for release() to clean up
				pool.release(conn);
			} finally {
				await pool.execute('drop table if exists pb_client_fail');
				await pool.end();
			}
		}
	});

	test('batch takes transaction options: isolation, readOnly, deferrable', async () => {
		const pool = testPool();
		try {
			const [rs] = await pool.batch([
				pool.query(
					`select current_setting('transaction_isolation') as iso, current_setting('transaction_read_only') as ro, current_setting('transaction_deferrable') as def`,
					[],
					{ mode: 'object' },
				),
			], { isolation: 'serializable', readOnly: true, deferrable: true });
			expect(rs!.rows[0] as unknown).toEqual({ iso: 'serializable', ro: 'on', def: 'on' });

			// readOnly is enforced, not just reported
			const e = await caught(() => pool.batch([pool.query('create temp table pb_ro(v int)')], { readOnly: true }));
			expect((e as PgError).code).toBe('25006');
			expect((e as PgError).failedQueryIndex).toBe(0);

			// no options: the server defaults
			const [def] = await pool.batch([
				pool.query(`select current_setting('transaction_isolation') as iso`, [], { mode: 'object' }),
			]);
			expect(def!.rows[0] as unknown).toEqual({ iso: 'read committed' });
		} finally {
			await pool.end();
		}
	});

	test('batch tags the error with the FIRST failing query, not a later one', async () => {
		const pool = testPool();
		try {
			// batch: query 1 fails; query 2 then fails too, in the aborted transaction (25P02) — not reported
			const e1 = await caught(() =>
				pool.batch([
					pool.query('select 1'),
					pool.query('select 1/0'),
					pool.query('select 2'),
				])
			);
			expect((e1 as PgError).code).toBe('22012');
			expect((e1 as PgError).failedQueryIndex).toBe(1);
		} finally {
			await pool.end();
		}
	});

	test('pipeline settles exactly like parallel: same entries, every query runs', async () => {
		const pool = testPool({ max: 3 });
		await pool.execute('create table pb_pipe_settled (v int)');
		try {
			const set = () => [
				pool.query('select $1::int as n', [0], { mode: 'object' }),
				pool.query('select * from pb_missing_table'),
				pool.query('insert into pb_pipe_settled values (1)'),
				pool.query('select 1/0'),
			];
			const strip = (rs: PromiseSettledResult<{ rows: unknown[]; command: string | null }>[]) =>
				rs.map((r) =>
					r.status === 'fulfilled'
						? { status: r.status, rows: r.value.rows, command: r.value.command }
						: { status: r.status, code: (r.reason as PgError).code, index: (r.reason as PgError).failedQueryIndex }
				);
			const piped = strip(await pool.pipeline(set()));
			const fanned = strip(await pool.parallel(set()));
			expect(piped).toEqual([
				{ status: 'fulfilled', rows: [{ n: 0 }], command: 'SELECT' },
				{ status: 'rejected', code: '42P01', index: undefined },
				{ status: 'fulfilled', rows: [], command: 'INSERT' },
				{ status: 'rejected', code: '22012', index: undefined },
			]);
			expect(fanned).toEqual(piped);
			// the insert ran despite earlier failures, in both
			const { rows } = await pool.execute('select v from pb_pipe_settled', [], { mode: 'object' });
			expect(rows as unknown).toEqual([{ v: 1 }, { v: 1 }]);
		} finally {
			await pool.execute('drop table if exists pb_pipe_settled');
			await pool.end();
		}
	});

	test('batch runs on an exported snapshot', async () => {
		const pool = testPool({ max: 3 });
		await pool.execute('create table pb_snapshot (v int)');
		await pool.execute('insert into pb_snapshot values (1)');
		const { client, release } = await pool.connect();
		try {
			await client.begin({ isolation: 'repeatable read' }, async (tx) => {
				const { rows } = await tx.query('select pg_export_snapshot() as s', [], { mode: 'object' });
				const snapshot = (rows[0] as { s: string }).s;
				// committed after the export: invisible to the snapshot
				await pool.execute('insert into pb_snapshot values (2)');

				const [count, iso] = await pool.batch([
					pool.query('select count(*)::int as n from pb_snapshot', [], { mode: 'object' }),
					pool.query(`select current_setting('transaction_isolation') as iso`, [], { mode: 'object' }),
				], { snapshot, isolation: 'repeatable read' });
				expect(count!.rows[0] as unknown).toEqual({ n: 1 }); // the snapshot's view
				expect(iso!.rows[0] as unknown).toEqual({ iso: 'repeatable read' });

				// read committed can't import a snapshot: a type error, and the server refuses it
				// @ts-expect-error - `snapshot` needs `isolation: 'repeatable read' | 'serializable'`
				const e = await caught(() => pool.batch([pool.query('select 1')], { snapshot, isolation: 'read committed' }));
				expect((e as PgError).code).toBe('0A000');
				expect((e as PgError).failedQueryIndex).toBeUndefined();
			});
			const [now] = await pool.batch([
				pool.query('select count(*)::int as n from pb_snapshot', [], { mode: 'object' }),
			]);
			expect(now!.rows[0] as unknown).toEqual({ n: 2 });
		} finally {
			release();
			await pool.execute('drop table if exists pb_snapshot');
			await pool.end();
		}
	});

	test('batch: an error from COMMIT belongs to no query and has no failedQueryIndex', async () => {
		const pool = testPool();
		await pool.execute(
			'create table pb_deferred(id int primary key, ref int references pb_deferred(id) deferrable initially deferred)',
		);
		try {
			const e = await caught(() => pool.batch([pool.query('insert into pb_deferred values (1, 9999)')]));
			expect((e as PgError).code).toBe('23503'); // deferred FK checked at COMMIT
			expect((e as PgError).failedQueryIndex).toBeUndefined();
		} finally {
			await pool.execute('drop table if exists pb_deferred');
			await pool.end();
		}
	});

	test('pipeline runs on ONE connection, in input order', async () => {
		const pool = testPool();
		try {
			const rs = await pool.pipeline([
				pool.query('select pg_backend_pid() as pid, $1::int as n', [0], { mode: 'object' }),
				pool.query('select pg_backend_pid() as pid, $1::int as n', [1], { mode: 'object' }),
			]);
			const values = rs.map((r) => (r as PromiseFulfilledResult<{ rows: unknown[] }>).value);
			values.forEach((r, i) => expect(cell(r, 'n')).toBe(i));
			expect(new Set(values.map((r) => cell(r, 'pid'))).size).toBe(1); // one backend, no BEGIN/COMMIT
		} finally {
			await pool.end();
		}
	});

	test('parallel fans the set out across connections', async () => {
		const pool = testPool({ max: 5 });
		try {
			const rs = await pool.parallel([
				pool.query('select $1::int as n', [0], { mode: 'object' }),
				pool.query('select $1::int as n', [1], { mode: 'object' }),
				pool.query('select $1::int as n', [2], { mode: 'object' }),
			]);
			rs.forEach((r, i) => {
				expect(r.status).toBe('fulfilled');
				expect(cell((r as PromiseFulfilledResult<{ rows: unknown[] }>).value, 'n')).toBe(i); // order preserved
			});
			expect(pool.size).toBeGreaterThan(1); // opened multiple connections (fan-out)
		} finally {
			await pool.end();
		}
	});

	test('parallel never rejects: waits for EVERY query and returns allSettled-style entries', async () => {
		const pool = testPool({ max: 5 });
		const cnt = async () =>
			Number(cell(await pool.execute('select count(*)::int as n from pb_parallel', [], { mode: 'object' }), 'n'));
		await pool.execute('create table pb_parallel(v int)');
		try {
			const rs = await pool.parallel([
				pool.query('select 1/0'), // fails fast
				pool.query('select pg_sleep(0.2), $1::int as n', [1], { mode: 'object' }),
				pool.query('select * from pb_parallel_missing'),
				// slow success: must have committed by the time parallel() resolves
				pool.query('with s as (select pg_sleep(0.3)) insert into pb_parallel select 1 from s'),
			]);
			expect(rs.map((r) => r.status)).toEqual(['rejected', 'fulfilled', 'rejected', 'fulfilled']);

			const [divByZero, sleep, missing, insert] = rs as [
				PromiseRejectedResult,
				PromiseFulfilledResult<{ rows: unknown[]; rowCount: number | null }>,
				PromiseRejectedResult,
				PromiseFulfilledResult<{ rows: unknown[]; rowCount: number | null }>,
			];
			expect(divByZero.reason).toBeInstanceOf(PgError);
			expect((divByZero.reason as PgError).code).toBe('22012');
			expect((missing.reason as PgError).code).toBe('42P01');
			expect(cell(sleep.value, 'n')).toBe(1);
			expect(insert.value.rowCount).toBe(1);
			expect(await cnt()).toBe(1); // resolved only after the slow sibling finished
		} finally {
			await pool.execute('drop table if exists pb_parallel');
			await pool.end();
		}
	});
});
