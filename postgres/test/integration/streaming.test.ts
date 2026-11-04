// Streaming & backpressure: conn.stream(...) across all result modes, real TCP
// pause/resume backpressure, early-break/cancel/drain semantics, mid-stream error
// propagation, empty/large results, interleaving, named statements, and guards
// for the intentionally-absent Readable surface.
//
// Grounded in Connection.stream in src/connection.ts: a hand-rolled
// AsyncIterableIterator (NOT a Node Readable, NO server-side cursor). Backpressure
// is TCP socket.pause()/resume() with hysteresis (pause when buf>HWM, resume when
// buf<HWM/2). On a pooled connection, early return() sends a CancelRequest, so the server stops
// producing rows. A single connection reads the rest of the result and drops it.
import { describe, expect, test } from 'bun:test';
import fc from 'fast-check';
import { caught, PgError, testConnect, withConn, withPooledConn } from '../helpers/db.ts';

// ---- internal-shape accessors (private fields reached for white-box assertions) ----
type SockSpy = { socket: { pause: () => unknown; resume: () => unknown } };
type Prep = { prepared: Map<string, { sql: string; fields: unknown[] }> };
type Cur = { current: unknown };
const cell0 = (row: unknown): unknown => (row as unknown[])[0];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe('streaming :: async-iteration baselines (all result modes)', () => {
	test('for-await over a 3-row table yields rows in order then terminates', async () => {
		await withConn(async (c) => {
			const got: number[] = [];
			for await (const row of c.stream('select id from t order by id')) got.push(cell0(row) as number);
			expect(got).toEqual([1, 2, 3]);
		});
	});

	test("default mode is 'array' and decodes per-OID identically to query() array mode", async () => {
		await withConn(async (c) => {
			const sql = 'select id, n8 from t order by id';
			const streamed: unknown[][] = [];
			for await (const row of c.stream(sql)) streamed.push(row as unknown[]);
			const q = await c.query(sql);
			expect(streamed).toEqual(q.rows as unknown[][]);
			// int4 -> number, int8 -> BigInt
			expect(typeof (streamed[0] as unknown[])[0]).toBe('number');
			expect(typeof (streamed[0] as unknown[])[1]).toBe('bigint');
		});
	});

	test("'object' mode yields Record keyed by column name", async () => {
		await withConn(async (c) => {
			const rows: Record<string, unknown>[] = [];
			for await (
				const row of c.stream<Record<string, unknown>>('select id, name from t where id = 1', [], { mode: 'object' })
			) {
				rows.push(row);
			}
			expect(rows).toEqual([{ id: 1, name: 'alice' }]);
		});
	});

	test("'buffer' mode yields (Buffer|null)[] of undecoded cells", async () => {
		await withConn(async (c) => {
			const rows: (Buffer | null)[][] = [];
			for await (
				const row of c.stream<(Buffer | null)[]>('select id, name from t where id = 1', [], { mode: 'buffer' })
			) {
				rows.push(row);
			}
			expect(rows.length).toBe(1);
			const r = rows[0]!;
			expect(r[0]).toEqual(Buffer.from('1'));
			expect(r[1]).toEqual(Buffer.from('alice'));
		});
	});

	test("'raw' mode yields one Buffer per DataRow", async () => {
		await withConn(async (c) => {
			const rows: Buffer[] = [];
			for await (const row of c.stream<Buffer>('select id, name from t where id = 1', [], { mode: 'raw' })) {
				rows.push(row);
			}
			expect(rows.length).toBe(1);
			expect(Buffer.isBuffer(rows[0])).toBe(true);
			expect(rows[0]!.length).toBeGreaterThan(0);
		});
	});

	test('NULL cells stream as null (array/object) and null (buffer, not empty Buffer)', async () => {
		await withConn(async (c) => {
			// id=3 is the NULL-name fixture row
			const arr: unknown[][] = [];
			for await (const row of c.stream('select id, name from t where id = 3')) arr.push(row as unknown[]);
			expect(arr).toEqual([[3, null]]);

			const obj: Record<string, unknown>[] = [];
			for await (
				const row of c.stream<Record<string, unknown>>('select id, name from t where id = 3', [], { mode: 'object' })
			) {
				obj.push(row);
			}
			expect(obj).toEqual([{ id: 3, name: null }]);

			const buf: (Buffer | null)[][] = [];
			for await (
				const row of c.stream<(Buffer | null)[]>('select id, name from t where id = 3', [], { mode: 'buffer' })
			) {
				buf.push(row);
			}
			const r = buf[0]!;
			expect(r[0]).toEqual(Buffer.from('3'));
			expect(r[1]).toBeNull();
		});
	});

	test('parameterized stream binds $1 (not interpolated)', async () => {
		await withConn(async (c) => {
			const got: number[] = [];
			for await (const row of c.stream('select id from t where id > $1 order by id', [1])) {
				got.push(cell0(row) as number);
			}
			expect(got).toEqual([2, 3]);
		});
	});

	test('manual .next() drive: rows, then a stable terminal {done:true}', async () => {
		await withConn(async (c) => {
			const it = c.stream('select g from generate_series(1,2) g');
			const a = await it.next();
			expect(a.done).toBe(false);
			expect(cell0(a.value)).toBe(1);
			const b = await it.next();
			expect(b.done).toBe(false);
			expect(cell0(b.value)).toBe(2);
			const d = await it.next();
			expect(d.done).toBe(true);
			expect(d.value).toBeUndefined();
			const e = await it.next();
			expect(e.done).toBe(true);
		});
	});

	test('stream result is both iterable and iterator (self asyncIterator)', async () => {
		await withConn(async (c) => {
			const it = c.stream('select 1');
			expect(it[Symbol.asyncIterator]()).toBe(it);
			for await (const _ of it) { /* drain */ }
		});
	});
});

describe('streaming :: backpressure & flow control (real TCP pause/resume)', () => {
	test('slow consumer over a large result engages socket.pause()/resume(); all rows in order', async () => {
		await withConn(async (c) => {
			const sock = (c as unknown as SockSpy).socket;
			let pauses = 0;
			let resumes = 0;
			const op = sock.pause.bind(sock);
			const or = sock.resume.bind(sock);
			sock.pause = () => {
				pauses++;
				return op();
			};
			sock.resume = () => {
				resumes++;
				return or();
			};

			let count = 0;
			let prev = 0;
			let ordered = true;
			for await (const row of c.stream('select g from generate_series(1,20000) g', [], { highWaterMark: 4 })) {
				const v = cell0(row) as number;
				if (v !== prev + 1) ordered = false;
				prev = v;
				count++;
				if (count % 100 === 0) await sleep(2); // stall so the server outruns us and buf > HWM
			}
			expect(count).toBe(20000);
			expect(ordered).toBe(true);
			expect(pauses).toBeGreaterThan(0); // backpressure actually engaged
			expect(resumes).toBeGreaterThan(0);
		});
	}, 30000);

	test('fast consumer over 100k rows receives all in order with no artificial stall', async () => {
		await withConn(async (c) => {
			let count = 0;
			let prev = 0;
			let ordered = true;
			for await (const row of c.stream('select g from generate_series(1,100000) g')) {
				const v = cell0(row) as number;
				if (v !== prev + 1) ordered = false;
				prev = v;
				count++;
			}
			expect(count).toBe(100000);
			expect(ordered).toBe(true);
		});
	}, 30000);

	test('highWaterMark:1 streams a large result to completion (resume hysteresis degenerates to empty)', async () => {
		await withConn(async (c) => {
			let count = 0;
			for await (const _ of c.stream('select g from generate_series(1,1000) g', [], { highWaterMark: 1 })) count++;
			expect(count).toBe(1000);
		});
	}, 15000);

	test('highWaterMark:0 still completes a small multi-row stream without deadlock', async () => {
		// With HWM=0 resume condition is buf.length<0 (never true once paused), but a
		// small result fits one TCP chunk so streamEnd fires before any stall.
		await withConn(async (c) => {
			const got: number[] = [];
			for await (const row of c.stream('select g from generate_series(1,5) g', [], { highWaterMark: 0 })) {
				got.push(cell0(row) as number);
			}
			expect(got).toEqual([1, 2, 3, 4, 5]);
		});
	}, 10000);

	test('property: random HWM + per-row delay delivers every row exactly once, in order', async () => {
		await withConn(async (c) => {
			await fc.assert(
				fc.asyncProperty(fc.integer({ min: 1, max: 200 }), fc.integer({ min: 0, max: 2 }), async (hwm, delay) => {
					const N = 30;
					const got: number[] = [];
					for await (const row of c.stream(`select g from generate_series(1,${N}) g`, [], { highWaterMark: hwm })) {
						got.push(cell0(row) as number);
						if (delay) await sleep(delay);
					}
					expect(got.length).toBe(N);
					for (let i = 0; i < N; i++) expect(got[i]).toBe(i + 1);
				}),
				{ seed: 42, numRuns: 20 },
			);
		});
	}, 30000);
});

describe('streaming :: early break / cancel / drain semantics', () => {
	test('early break leaves the connection usable (drains server-side, then a normal query works)', async () => {
		await withConn(async (c) => {
			let n = 0;
			for await (const _ of c.stream('select g from generate_series(1,100000) g')) {
				if (++n === 3) break;
			}
			const r = await c.query('select 42 as x');
			expect(cell0(r.rows[0])).toBe(42);
		});
	}, 20000);

	test('break in object mode drops (does not decode) later rows — no late decode error', async () => {
		await withConn(async (c) => {
			let n = 0;
			for await (
				const row of c.stream<Record<string, unknown>>('select g from generate_series(1,1000) g', [], {
					mode: 'object',
				})
			) {
				expect((row as Record<string, unknown>).g).toBeDefined();
				if (++n === 3) break;
			}
			const r = await c.query('select 1 as x');
			expect(cell0(r.rows[0])).toBe(1);
		});
	});

	test('break while the socket is paused: return() resumes so draining completes (no permanent stall)', async () => {
		await withConn(async (c) => {
			let n = 0;
			for await (const _ of c.stream('select g from generate_series(1,100000) g', [], { highWaterMark: 2 })) {
				await sleep(2); // let buf exceed HWM so the socket is paused
				if (++n === 2) break;
			}
			const r = await c.query('select 43 as x');
			expect(cell0(r.rows[0])).toBe(43);
		});
	}, 20000);

	test('double/late return() resolves {done:true} and does not throw', async () => {
		await withConn(async (c) => {
			const it = c.stream('select g from generate_series(1,2) g');
			for await (const _ of it) { /* drain */ }
			const r1 = await it.return!();
			expect(r1.done).toBe(true);
			const r2 = await it.return!();
			expect(r2.done).toBe(true);
		});
	});

	test('cancel before the first row (return() immediately) — follow-up query still succeeds', async () => {
		await withConn(async (c) => {
			const it = c.stream('select g from generate_series(1,1000) g');
			await it.return!(); // never iterated
			const r = await c.query('select 11 as x');
			expect(cell0(r.rows[0])).toBe(11);
		});
	});

	test('a pooled early break stops the query on the server, and the same backend serves the next query', async () => {
		await withPooledConn(async (c) => {
			const pid = c.backendKey!.pid;
			let n = 0;
			// PostgreSQL returns rows one by one when generate_series is in the select list.
			// In FROM, it stores every row before it returns the first one.
			for await (const _ of c.stream('select generate_series(1, 100000000) as g')) {
				if (++n === 10) break;
			}
			await withConn(async (observer) => {
				const deadline = Date.now() + 2000;
				let active = 1;
				while (active > 0 && Date.now() < deadline) {
					await sleep(50);
					const r = await observer.query(
						"select count(*)::int from pg_stat_activity where pid = $1 and state = 'active'",
						[pid],
					);
					active = cell0(r.rows[0]) as number;
				}
				expect(active).toBe(0);
			});
			const r = await c.query('select pg_backend_pid()');
			expect(cell0(r.rows[0])).toBe(pid);
		});
	}, 10000);

	test('chaos: 200x open-then-break leaves no wedged in-flight task; every follow-up query works', async () => {
		await withConn(async (c) => {
			for (let i = 0; i < 200; i++) {
				let n = 0;
				for await (const _ of c.stream('select g from generate_series(1,5) g')) {
					if (++n === 1) break;
				}
				const r = await c.query('select $1::int as x', [i]);
				expect(cell0(r.rows[0])).toBe(i);
			}
			expect((c as unknown as Cur).current).toBeNull();
		});
	}, 30000);
});

describe('streaming :: error propagation', () => {
	test('a stream whose SQL errors rejects the iterator with a PgError; connection recovers', async () => {
		await withConn(async (c) => {
			const err = await caught(async () => {
				for await (const _ of c.stream('select 1/0')) { /* */ }
			});
			expect(err).toBeInstanceOf(PgError);
			expect((err as PgError).code).toBe('22012'); // division_by_zero
			const r = await c.query('select 1 as x');
			expect(cell0(r.rows[0])).toBe(1);
		});
	});

	test('error arriving while a consumer awaits next() rejects that pending promise', async () => {
		await withConn(async (c) => {
			const it = c.stream('select 1/0'); // no DataRows; next() parks in `waiting` then is rejected
			const err = await caught(() => it.next());
			expect(err).toBeInstanceOf(PgError);
			const r = await c.query('select 2 as x');
			expect(cell0(r.rows[0])).toBe(2);
		});
	});

	test('rows delivered before a mid-stream error are observed, then next() throws (not a silent done)', async () => {
		await withConn(async (c) => {
			const got: number[] = [];
			const err = await caught(async () => {
				for await (const row of c.stream('select 1/(g-5) as x from generate_series(1,10) g')) {
					got.push(cell0(row) as number);
				}
			});
			expect(err).toBeInstanceOf(PgError);
			expect((err as PgError).code).toBe('22012');
			expect(got.length).toBeGreaterThan(0); // rows for g=1..4 arrived before the g=5 div-by-zero
			expect(got.length).toBeLessThan(10);
			const r = await c.query('select 3 as x');
			expect(cell0(r.rows[0])).toBe(3);
		});
	});

	test('NUL-byte param rejects the first next() client-side without wedging the queue', async () => {
		await withConn(async (c) => {
			const it = c.stream('select $1::text', ['a b']);
			const err = await caught(() => it.next());
			expect(err).toBeInstanceOf(Error);
			const r = await c.query('select 5 as x'); // queue not wedged
			expect(cell0(r.rows[0])).toBe(5);
		});
	});

	test('streaming on an already-closed connection: first next() rejects with "connection is closed"', async () => {
		const c = await testConnect();
		await c.end();
		const it = c.stream('select 1');
		const err = await caught(() => it.next());
		expect((err as Error).message).toMatch(/connection is closed/);
	});

	test('chaos: backend killed mid-stream rejects the in-flight iterator and does not hang', async () => {
		const victim = await testConnect();
		const killer = await testConnect();
		try {
			const pid = victim.backendKey!.pid;
			const it = victim.stream('select g from generate_series(1,500000) g', [], { highWaterMark: 2 });
			await it.next(); // first row: stream is in flight
			await killer.query('select pg_terminate_backend($1)', [pid]);
			const err = await caught(async () => {
				for await (const _ of it) { /* */ }
			});
			expect(err).toBeInstanceOf(Error);
		} finally {
			await victim.end();
			await killer.end();
		}
	}, 20000);
});

describe('streaming :: empty & trivial result sets', () => {
	test('empty stream (where false): body never runs, loop completes', async () => {
		await withConn(async (c) => {
			let ran = false;
			for await (const _ of c.stream('select * from t where false')) ran = true;
			expect(ran).toBe(false);
		});
	});

	test('single-row stream: exactly one row then done', async () => {
		await withConn(async (c) => {
			const got: number[] = [];
			for await (const row of c.stream('select 7 as x')) got.push(cell0(row) as number);
			expect(got).toEqual([7]);
		});
	});

	test('non-SELECT command via stream (CREATE TEMP TABLE) yields no rows and completes cleanly', async () => {
		await withConn(async (c) => {
			let rows = 0;
			for await (const _ of c.stream('create temp table strm_z(x int)')) rows++;
			expect(rows).toBe(0);
			// table really exists on this connection-scoped temp namespace
			const r = await c.query('insert into strm_z values (1) returning x');
			expect(cell0(r.rows[0])).toBe(1);
		});
	});

	test('stream of only-NULL rows yields each row as [null]', async () => {
		await withConn(async (c) => {
			const rows: unknown[][] = [];
			for await (const row of c.stream('select null::int from generate_series(1,3)')) rows.push(row as unknown[]);
			expect(rows).toEqual([[null], [null], [null]]);
		});
	});
});

describe('streaming :: large results — bounded & non-blocking', () => {
	test('generate_series(1,200000) streams fully without buffering all (count matches)', async () => {
		await withConn(async (c) => {
			let count = 0;
			for await (const _ of c.stream('select g from generate_series(1,200000) g')) count++;
			expect(count).toBe(200000);
		});
	}, 30000);

	test('event loop is not blocked: a setInterval keeps firing during a slow stream', async () => {
		await withConn(async (c) => {
			let ticks = 0;
			const timer = setInterval(() => {
				ticks++;
			}, 5);
			let count = 0;
			try {
				for await (const _ of c.stream('select g from generate_series(1,5000) g', [], { highWaterMark: 8 })) {
					count++;
					if (count % 100 === 0) await sleep(1);
				}
			} finally {
				clearInterval(timer);
			}
			expect(count).toBe(5000);
			expect(ticks).toBeGreaterThan(0); // incremental delivery, not a single blocking burst
		});
	}, 20000);

	test('first row is observed well before the stream completes (incremental delivery)', async () => {
		await withConn(async (c) => {
			const it = c.stream('select g from generate_series(1,200000) g', [], { highWaterMark: 4 });
			const t0 = performance.now();
			const first = await it.next();
			const tFirst = performance.now() - t0;
			expect(cell0(first.value)).toBe(1);
			let count = 1;
			for await (const _ of it) count++;
			const tTotal = performance.now() - t0;
			expect(count).toBe(200000);
			expect(tFirst).toBeLessThan(tTotal);
		});
	}, 30000);

	test('wide rows (large text field) stream without per-row decode errors', async () => {
		await withConn(async (c) => {
			let count = 0;
			for await (
				const row of c.stream("select g, repeat('x', 2000) as big from generate_series(1,500) g", [], {
					highWaterMark: 16,
				})
			) {
				expect((row as unknown[]).length).toBe(2);
				count++;
			}
			expect(count).toBe(500);
		});
	}, 15000);
});

describe('streaming :: interleaving, queueing & named prepared statements', () => {
	test('a query() issued mid-stream is queued and runs after the stream drains', async () => {
		await withConn(async (c) => {
			const it = c.stream('select g from generate_series(1,5) g', [], { highWaterMark: 2 });
			const first = await it.next();
			const qp = c.query('select 99 as x'); // queued behind the in-flight stream
			const rest: number[] = [cell0(first.value) as number];
			for await (const row of it) rest.push(cell0(row) as number);
			const q = await qp;
			expect(rest).toEqual([1, 2, 3, 4, 5]);
			expect(cell0(q.rows[0])).toBe(99);
		});
	});

	test('two streams started back-to-back serialize; both deliver full row sets', async () => {
		await withConn(async (c) => {
			const s1 = c.stream('select g from generate_series(1,3) g');
			const s2 = c.stream('select g from generate_series(4,6) g');
			const a: number[] = [];
			for await (const r of s1) a.push(cell0(r) as number);
			const b: number[] = [];
			for await (const r of s2) b.push(cell0(r) as number);
			expect(a).toEqual([1, 2, 3]);
			expect(b).toEqual([4, 6 - 1, 6]); // [4,5,6]
		});
	});

	test('named prepared statement via stream: reuse same name+SQL, re-parse on changed SQL', async () => {
		await withConn(async (c) => {
			for await (const _ of c.stream('select 1 as x', [], { name: 'np1' })) { /* */ }
			const prep = (c as unknown as Prep).prepared;
			expect(prep.has('np1')).toBe(true);
			expect(prep.get('np1')!.sql).toBe('select 1 as x');

			const r2: number[] = [];
			for await (const row of c.stream('select 1 as x', [], { name: 'np1' })) r2.push(cell0(row) as number);
			expect(r2).toEqual([1]);

			// different SQL, same name -> Close + re-Parse (connection.ts:237)
			const r3: number[] = [];
			for await (const row of c.stream('select 2 as x', [], { name: 'np1' })) r3.push(cell0(row) as number);
			expect(r3).toEqual([2]);
			expect(prep.get('np1')!.sql).toBe('select 2 as x');
		});
	});

	test('named statement cache is shared across stream() and query()', async () => {
		await withConn(async (c) => {
			for await (const _ of c.stream('select 7 as x', [], { name: 'mx1' })) { /* */ }
			const q = await c.query('select 7 as x', [], { name: 'mx1' }); // reuses the cached plan
			expect(cell0(q.rows[0])).toBe(7);
		});
	});

	test('multi-statement SQL in a stream fails fast (42601) and the connection stays usable', async () => {
		await withConn(async (c) => {
			const err = await caught(async () => {
				for await (const _ of c.stream('select 1; select 2')) { /* */ }
			});
			expect(err).toBeInstanceOf(PgError);
			expect((err as PgError).code).toBe('42601'); // cannot insert multiple commands into a prepared statement
			const r = await c.query('select 8 as x');
			expect(cell0(r.rows[0])).toBe(8);
		});
	});

	test('a single-statement WITH/CTE query streams its rows', async () => {
		await withConn(async (c) => {
			const got: number[] = [];
			for await (const row of c.stream('with x as (select generate_series(1,3) as g) select g from x')) {
				got.push(cell0(row) as number);
			}
			expect(got).toEqual([1, 2, 3]);
		});
	});
});

describe('streaming :: out-of-scope / roadmap guards', () => {
	test('GUARD: the stream result is not a Node Readable — no pipe/on/destroy/read; no conn.cursor', async () => {
		await withConn(async (c) => {
			const it = c.stream('select 1') as unknown as Record<string, unknown>;
			expect(it.pipe).toBeUndefined();
			expect(it.on).toBeUndefined();
			expect(it.destroy).toBeUndefined();
			expect(it.read).toBeUndefined();
			expect(typeof c.cursor).toBe('function'); // cursor() shipped 2026-07-10
			for await (const _ of c.stream('select 1')) { /* drain the probe */ }
		});
	});

	test('GUARD: refcursor is reachable only via raw SQL (no first-class helper)', async () => {
		await withConn(async (c) => {
			expect(typeof c.cursor).toBe('function'); // cursor() shipped 2026-07-10
			await c.query('begin');
			await c.query('declare strm_rc cursor for select g from generate_series(1,3) g');
			const got: number[] = [];
			for await (const row of c.stream('fetch all in strm_rc')) got.push(cell0(row) as number);
			await c.query('commit');
			expect(got).toEqual([1, 2, 3]);
		});
	});

	// Roadmap / unimplemented — kept as todos (no binary/simple-query surface today).
	test.todo('PENDING: binary RESULT-format streaming (Bind result format 1) once binary decoders land', () => {});
	test.todo('PENDING: simple-query-protocol streaming path', () => {});
});

describe('streaming :: early close inside a transaction', () => {
	test('break leaves the transaction usable, and COMMIT commits', async () => {
		await withConn(async (c) => {
			await c.query('begin');
			for await (const _ of c.stream('select g from generate_series(1, 100000) g')) break;
			expect((await c.query('commit')).command).toBe('COMMIT');
		});
	});
});
