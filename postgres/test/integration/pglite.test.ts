// @drizzle-team/postgres/pglite: the driver over an in-process PGlite. Covers what differs from a server: one
// session per instance (settings applied at startup, the session ended on close, one connection at a time),
// PGlite's own locks shared with pg.query()/pg.transaction(), and cancel without an out-of-band request.
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { connect, createPool, PgError } from '../../src/pglite.ts';

let pg: PGlite;
beforeAll(async () => {
	pg = await PGlite.create();
});
afterAll(async () => {
	await pg?.close();
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const signal = () => {
	let fire!: () => void;
	const fired = new Promise<void>((r) => (fire = r));
	return { fire, fired };
};

describe('queries', () => {
	test('rows, types and named statements', async () => {
		const pool = createPool(pg);
		try {
			const sql =
				`select $1::int4 i, 9007199254740993::int8 b, 'café'::text t, '2024-02-03 12:34:56+00'::timestamptz ts,
				'{"a":[1,2]}'::jsonb j, array[1,null,3]::int4[] arr, null::text n`;
			for (let i = 0; i < 3; i++) { // Parse once, then Bind/Execute (binary results from the second run)
				const r = await pool.query(sql, [i], { name: 'types', mode: 'object' });
				expect(r.rows as unknown).toEqual([{
					i,
					b: 9007199254740993n,
					t: 'café',
					ts: new Date('2024-02-03T12:34:56Z'),
					j: { a: [1, 2] },
					arr: [1, null, 3],
					n: null,
				}]);
			}
			expect((await pg.query<{ n: number }>('select count(*)::int n from pg_prepared_statements')).rows[0]!.n).toBe(1);
		} finally {
			await pool.end();
		}
	});

	test('a burst is pipelined, and an error fails only its own query', async () => {
		const pool = createPool(pg);
		try {
			const rs = await Promise.allSettled(
				Array.from(
					{ length: 200 },
					(_, i) => pool.query(i === 77 ? 'select 1/0' : 'select $1::int4 v', i === 77 ? [] : [i]),
				),
			);
			expect(rs.filter((r) => r.status === 'rejected').map((r) => (r.reason as PgError).code)).toEqual(['22012']);
			expect(rs.flatMap((r, i) => (r.status === 'fulfilled' ? [r.value.rows[0]![0] === i] : []))).not.toContain(false);
		} finally {
			await pool.end();
		}
	});

	test('transactions commit and roll back', async () => {
		const pool = createPool(pg);
		try {
			await pool.query('create table tx_t (id int)');
			await pool.transaction(async (tx) => {
				await tx.query('insert into tx_t values (1)');
			});
			await pool.transaction(async (tx) => {
				await tx.query('insert into tx_t values (2)');
				throw new Error('roll back');
			}).catch(() => {});
			expect((await pool.query('select id from tx_t')).rows as unknown).toEqual([[1]]);
		} finally {
			await pool.query('drop table tx_t');
			await pool.end();
		}
	});
});

test('an instance that is still starting (new PGlite()) is waited for', async () => {
	const fresh = new PGlite();
	const pool = createPool(fresh);
	try {
		expect((await pool.query('select 1')).rows as unknown).toEqual([[1]]);
	} finally {
		await pool.end();
		await fresh.close();
	}
});

describe('one session per instance', () => {
	test('startup settings are applied, and reported to the driver', async () => {
		const c = await connect(pg, {
			applicationName: 'pglite-test',
			options: '-c search_path=app,public -c work_mem=8MB',
			statementTimeout: 1500,
		});
		try {
			const { rows } = await c.query(
				"select current_setting('application_name') a, current_setting('search_path') p, current_setting('work_mem') w, current_setting('statement_timeout') t",
				[],
				{ mode: 'object' },
			);
			expect(rows).toEqual([{ a: 'pglite-test', p: 'app,public', w: '8MB', t: '1500ms' }]);
			expect(c.serverParams.application_name).toBe('pglite-test');
		} finally {
			await c.end();
		}
	});

	test('a setting PGlite rejects fails the connection, and the next one opens', async () => {
		const err = await connect(pg, { options: '-c work_mem=banana' }).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(PgError);
		expect((err as PgError).code).toBe('22023');
		const c = await connect(pg);
		expect((await c.query('select 1')).rows as unknown).toEqual([[1]]);
		await c.end();
	});

	test('closing a connection ends its session: transaction, statements, temp tables, settings', async () => {
		const { rows: [defaults] } = await pg.query<{ p: string; w: string }>(
			"select current_setting('search_path') p, current_setting('work_mem') w",
		);
		const c1 = await connect(pg, { options: '-c search_path=elsewhere' });
		await c1.query('select $1::int4', [1], { name: 'kept' });
		await c1.query('begin');
		await c1.query('create temp table t1 (x int)');
		await c1.query("set work_mem = '16MB'");
		await c1.end();

		const c2 = await connect(pg);
		try {
			const { rows } = await c2.query(
				`select (select count(*)::int from pg_prepared_statements) ps, to_regclass('pg_temp.t1') is null no_temp,
					current_setting('search_path') p, current_setting('work_mem') w`,
				[],
				{ mode: 'object' },
			);
			expect(rows).toEqual([{ ps: 0, no_temp: true, ...defaults }]);
			await c2.query('select $1::int4', [2], { name: 'kept' }); // the name is free again
		} finally {
			await c2.end();
		}
		expect((await pg.query('select 1 v')).rows).toEqual([{ v: 1 }]); // PGlite is out of the transaction
	});

	test('a second pool on the instance fails while the first is open', async () => {
		const a = createPool(pg);
		await a.query('select 1');
		const b = createPool(pg, { reconnect: false });
		try {
			expect(await b.query('select 1').catch((e: unknown) => (e as Error).message)).toContain(
				'already has a driver connection open',
			);
		} finally {
			await b.end();
			await a.end();
		}
		const c = createPool(pg);
		expect((await c.query('select 1')).rows as unknown).toEqual([[1]]);
		await c.end();
	});

	test('max must be 1', () => {
		expect(() => createPool(pg, { max: 2 as never })).toThrow('max must be 1');
	});
});

describe("PGlite's own API on the same instance", () => {
	test("pg.query() waits for the driver's transaction to end", async () => {
		const pool = createPool(pg);
		await pool.query('create table lock_a (x int)');
		try {
			const order: string[] = [];
			const inserted = signal();
			const tx = pool.transaction(async (t) => {
				await t.query('insert into lock_a values (1)');
				inserted.fire();
				await sleep(20);
				await t.query('insert into lock_a values (2)');
				order.push('driver commits');
			});
			await inserted.fired;
			const direct = pg.query<{ n: number }>('select count(*)::int n from lock_a').then((r) => {
				order.push(`pg.query sees ${r.rows[0]!.n}`);
			});
			await Promise.all([tx, direct]);
			expect(order).toEqual(['driver commits', 'pg.query sees 2']);
		} finally {
			await pool.query('drop table lock_a');
			await pool.end();
		}
	});

	test('driver queries wait for a pg.transaction() to end', async () => {
		await pg.exec('create table lock_b (x int)');
		const pool = createPool(pg);
		try {
			const order: string[] = [];
			const inserted = signal();
			const tx = pg.transaction(async (t) => {
				await t.query('insert into lock_b values (1)');
				inserted.fire();
				await sleep(20);
				await t.rollback();
				order.push('pg.transaction rolls back');
			});
			await inserted.fired;
			const q = pool.query('select count(*)::int n from lock_b').then((r) => {
				order.push(`driver sees ${r.rows[0]![0]}`);
			});
			await Promise.all([tx, q]);
			expect(order).toEqual(['pg.transaction rolls back', 'driver sees 0']);
		} finally {
			await pool.end();
			await pg.exec('drop table lock_b');
		}
	});

	test('PGlite is usable directly after the pool ends', async () => {
		const pool = createPool(pg);
		await pool.query('select 1');
		await pool.end();
		expect((await pg.query('select 2 v')).rows).toEqual([{ v: 2 }]);
	});
});

describe('cancel', () => {
	test('a canceled query closes the connection; the pool opens a clean one', async () => {
		const pool = createPool(pg);
		try {
			const held = signal();
			const release = signal();
			const tx = pool.transaction(async (t) => {
				await t.query('select 1');
				held.fire();
				await release.fired;
			});
			await held.fired;
			const ac = new AbortController();
			const canceled = pool.query('select 2', [], { signal: ac.signal }).catch((e: unknown) => e);
			ac.abort();
			release.fire();
			expect(await canceled).toBeInstanceOf(Error);
			await tx.catch(() => {});
			expect((await pool.query('select 3')).rows as unknown).toEqual([[3]]);
		} finally {
			await pool.end();
		}
	});
});
