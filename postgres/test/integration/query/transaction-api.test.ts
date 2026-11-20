// Domain: "transaction API" — pool.begin/conn.begin (+ transaction alias): auto BEGIN/COMMIT/ROLLBACK,
// isolation options, nested SAVEPOINTs, and pipelining inside a transaction. Writes go to CONNECTION-
// SCOPED temp tables; every connection/pool is ended.
import { describe, expect, test } from 'bun:test';
import type { PgError } from '../../helpers/db.ts';
import { caught, testPool, withConn } from '../../helpers/db.ts';

const cell = (r: { rows: unknown[] }, k: string) => (r.rows[0] as Record<string, unknown>)[k];
const count = async (
	c: { query: (s: string, p: unknown[], o: { mode: 'object' }) => Promise<{ rows: unknown[] }> },
	t: string,
) => Number(cell(await c.query(`select count(*)::int as n from ${t}`, [], { mode: 'object' }), 'n'));

describe('conn.begin — commit / rollback / return value', () => {
	test('commits: work persists, returns the callback value, txStatus tracks I→(T)→I', async () => {
		await withConn(async (c) => {
			await c.query('create temp table tb(v int)');
			expect(c.inTransaction).toBe(false);
			const out = await c.begin(async (tx) => {
				await tx.query('insert into tb values (1),(2)');
				expect(tx.inTransaction).toBe(true); // T inside
				return 'done';
			});
			expect(out).toBe('done');
			expect(c.inTransaction).toBe(false); // I after commit
			expect(await count(c, 'tb')).toBe(2);
		});
	});

	test('rolls back and rethrows the original error when the callback throws', async () => {
		await withConn(async (c) => {
			await c.query('create temp table tr(v int)');
			const err = await caught(() =>
				c.begin(async (tx) => {
					await tx.query('insert into tr values (1)');
					throw new Error('boom');
				})
			);
			expect((err as Error).message).toBe('boom');
			expect(c.inTransaction).toBe(false); // rolled back, connection clean
			expect(await count(c, 'tr')).toBe(0); // nothing persisted
		});
	});

	// Postgres answers COMMIT of an aborted transaction with the ROLLBACK tag. A statement whose error the callback
	// caught aborted it, so begin() must reject: resolving would report as committed work that was rolled back.
	test('rejects when a statement failed inside and the callback caught its error', async () => {
		await withConn(async (c) => {
			await c.query('create temp table ta(v int primary key)');
			const err = await caught(() =>
				c.begin(async (tx) => {
					await tx.query('insert into ta values (1)');
					await tx.query('insert into ta values (1)').catch(() => undefined);
					return 'done';
				})
			);
			expect(err).toBeInstanceOf(Error);
			expect((err as Error).message).toMatch(/COMMIT rolled back/);
			expect(c.inTransaction).toBe(false);
			expect(await count(c, 'ta')).toBe(0);
		});
	});
});

describe('nested begin → SAVEPOINT (partial rollback)', () => {
	test('inner failure rolls back only its work; the outer transaction commits the rest', async () => {
		await withConn(async (c) => {
			await c.query('create temp table ts(v int)');
			await c.begin(async (tx) => {
				await tx.query('insert into ts values (1)'); // keep
				await caught(() =>
					tx.begin(async (inner) => { // nested savepoint
						await inner.query('insert into ts values (2)'); // roll back
						throw new Error('inner');
					})
				);
				await tx.query('insert into ts values (3)'); // keep (savepoint rollback left tx usable)
			});
			const rows = await c.query('select v from ts order by v', [], { mode: 'array' });
			expect(rows.rows).toEqual([[1], [3]]);
		});
	});
});

// Nested transactions started at the same time on one transaction. Each is a SAVEPOINT, and Postgres nests savepoints
// in the order they are created, not by caller: releasing or rolling back to the first one also ends every savepoint
// made after it. So a nested transaction must not start while a sibling is still open.
describe('concurrent nested begin', () => {
	const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

	test('both commit their work', async () => {
		await withConn(async (c) => {
			await c.query('create temp table tcn(v int)');
			await c.begin(async (tx) => {
				await Promise.all([
					tx.begin(async (a) => {
						await a.query('insert into tcn values (1)');
					}),
					tx.begin(async (b) => {
						await b.query('insert into tcn values (2)');
					}),
				]);
			});
			expect((await c.query('select v from tcn order by v', [], { mode: 'array' })).rows).toEqual([[1], [2]]);
		});
	});

	test("a failing one rolls back only its own work, not a sibling's that already committed", async () => {
		await withConn(async (c) => {
			await c.query('create temp table tcf(v int)');
			const outcome: { a?: string; b?: string } = {};
			await c.begin(async (tx) => {
				await Promise.all([
					tx.begin(async (a) => {
						await a.query('insert into tcf values (1)');
						await sleep(50);
						throw new Error('a fails');
					}).then(() => (outcome.a = 'committed'), () => (outcome.a = 'rolled back')),
					tx.begin(async (b) => {
						await sleep(10);
						await b.query('insert into tcf values (2)');
					}).then(() => (outcome.b = 'committed'), () => (outcome.b = 'rolled back')),
				]);
			});
			expect(outcome).toEqual({ a: 'rolled back', b: 'committed' });
			expect((await c.query('select v from tcf order by v', [], { mode: 'array' })).rows).toEqual([[2]]);
		});
	});
});

describe('concurrent nested begin, each with a nested begin of its own', () => {
	// Siblings wait for each other; a nested begin inside one of them must not wait for its own parent.
	test('all four commit their work', async () => {
		await withConn(async (c) => {
			await c.query('create temp table tcd(v int)');
			await c.begin(async (tx) => {
				await Promise.all([
					tx.begin(async (a) => {
						await a.query('insert into tcd values (1)');
						await a.begin((inner) => inner.query('insert into tcd values (2)'));
					}),
					tx.begin(async (b) => {
						await b.query('insert into tcd values (3)');
						await b.begin((inner) => inner.query('insert into tcd values (4)'));
					}),
				]);
			});

			const res1 = await c.query('select v from tcd order by v', [], { mode: 'array' });

			expect(res1.rows).toEqual([[1], [2], [3], [4]]);
		});
	});
});

describe('pool.begin / pool.transaction', () => {
	test('pool.begin commits on a reserved connection and returns the value', async () => {
		const pool = testPool();
		try {
			const v = await pool.begin(async (tx) => {
				await tx.query('create temp table pb(v int)');
				await tx.query('insert into pb values (7)');
				return cell(await tx.query('select v from pb', [], { mode: 'object' }), 'v');
			});
			expect(v).toBe(7);
		} finally {
			await pool.end();
		}
	});

	test('pool.transaction is an alias for begin', async () => {
		const pool = testPool();
		try {
			const n = await pool.transaction(async (tx) =>
				cell(await tx.query('select 5 as n', [], { mode: 'object' }), 'n')
			);
			expect(n).toBe(5);
		} finally {
			await pool.end();
		}
	});

	test('rethrows on throw (and the pool stays usable afterward)', async () => {
		const pool = testPool();
		try {
			const err = await caught(() =>
				pool.begin(async () => {
					throw new Error('nope');
				})
			);
			expect((err as Error).message).toBe('nope');
			const r = await pool.query('select 1 as n', [], { mode: 'object' }); // pool still works
			expect(cell(r, 'n')).toBe(1);
		} finally {
			await pool.end();
		}
	});
});

describe('options', () => {
	test('readOnly (object form) makes a write reject 25006', async () => {
		const pool = testPool();
		try {
			const err = await caught(() =>
				pool.begin({ readOnly: true }, async (tx) => {
					await tx.query('create temp table ro_fail(i int)');
				})
			);
			expect((err as PgError).code).toBe('25006');
		} finally {
			await pool.end();
		}
	});

	test("string form ('read only') also rejects a write", async () => {
		const pool = testPool();
		try {
			const err = await caught(() =>
				pool.begin('read only', async (tx) => {
					await tx.query('create temp table ro_fail2(i int)');
				})
			);
			expect((err as PgError).code).toBe('25006');
		} finally {
			await pool.end();
		}
	});

	test('isolation: serializable runs a normal transaction', async () => {
		const pool = testPool();
		try {
			const n = await pool.begin(
				{ isolation: 'serializable' },
				async (tx) => cell(await tx.query('select 9 as n', [], { mode: 'object' }), 'n'),
			);
			expect(n).toBe(9);
		} finally {
			await pool.end();
		}
	});
});

describe('pipelining inside a transaction', () => {
	test('concurrent queries in the callback pipeline on the one reserved connection', async () => {
		const pool = testPool();
		try {
			const out = await pool.begin(async (tx) => {
				const rs = await Promise.all([
					tx.query('select 1 as n', [], { mode: 'object' }),
					tx.query('select 2 as n', [], { mode: 'object' }),
					tx.query('select 3 as n', [], { mode: 'object' }),
				]);
				expect(tx.stats.maxInflight).toBeGreaterThan(1); // they overlapped in flight
				return rs.map((r) => cell(r, 'n'));
			});
			expect(out).toEqual([1, 2, 3]);
		} finally {
			await pool.end();
		}
	});
});
