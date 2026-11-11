// Domain: "pipelining" — multiple queries in flight on ONE connection (src/connection.ts:
// processQueue/startTask/finishTask + the inflight FIFO + outbound batch). Default on (depth 'auto');
// `pipeline:false` gates to one-at-a-time. Read-only: only SELECTs, every connection is ended.
import { describe, expect, test } from 'bun:test';
import net from 'node:net';
import { PgError, TEST_CONFIG, testConnect, withConn } from '../../helpers/db.ts';

const nums = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('pipelining (default on)', () => {
	test('Promise.all on one connection keeps many queries in flight, results in request order', async () => {
		await withConn(async (c) => {
			const N = 20;
			const rows = await Promise.all(
				nums(N).map((i) => c.query('select $1::int as n, pg_backend_pid() as pid', [i], { mode: 'object' })),
			);
			// correctness + ORDER: result i is query i (the backend replies in request order)
			rows.forEach((r, i) => expect((r.rows[0] as { n: number }).n).toBe(i));
			// same backend served them all (one connection), and they genuinely overlapped in flight
			const pids = new Set(rows.map((r) => (r.rows[0] as { pid: number }).pid));
			expect(pids.size).toBe(1);
			expect(c.stats.maxInflight).toBeGreaterThan(1);
			expect(c.stats.maxInflight).toBe(N); // all N were dispatched before any result returned
			expect(c.stats.inflight).toBe(0); // fully drained afterward
		});
	});

	test('a serialize failure (NUL in SQL) rejects only its own query via the batch rewind; siblings still succeed', async () => {
		await withConn(async (c) => {
			const settled = await Promise.allSettled([
				c.query('select 1 as n', [], { mode: 'object' }),
				c.query('select 2 as n\0oops', [], { mode: 'object' }), // NUL byte -> serialize throws -> outbuf.rewind(mark)
				c.query('select 3 as n', [], { mode: 'object' }),
			]);
			expect(settled.map((s) => s.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
			const val = (i: number) =>
				(settled[i] as PromiseFulfilledResult<{ rows: Record<string, unknown>[] }>).value.rows[0]!.n;
			expect(val(0)).toBe(1);
			expect(val(2)).toBe(3); // batch not corrupted by the rewound query
		});
	});

	test('a server error mid-pipeline (division by zero) rejects only that query; siblings + connection survive', async () => {
		await withConn(async (c) => {
			const settled = await Promise.allSettled([
				c.query('select 10 as n', [], { mode: 'object' }),
				c.query('select 1/0 as n', [], { mode: 'object' }), // 22012 division_by_zero — its own Sync isolates it
				c.query('select 30 as n', [], { mode: 'object' }),
			]);
			expect(settled.map((s) => s.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
			expect((settled[1] as PromiseRejectedResult).reason).toBeInstanceOf(PgError);
			expect(((settled[1] as PromiseRejectedResult).reason as PgError).code).toBe('22012');
			// connection is still usable after the isolated failure
			const after = await c.query('select 42 as n', [], { mode: 'object' });
			expect((after.rows[0] as { n: number }).n).toBe(42);
		});
	});

	test('microtask flush (default) coalesces a same-tick Promise.all into ONE socket write', async () => {
		await withConn(async (c) => {
			const N = 20;
			const rows = await Promise.all(nums(N).map((i) => c.query('select $1::int as n', [i], { mode: 'object' })));
			rows.forEach((r, i) => expect((r.rows[0] as { n: number }).n).toBe(i)); // correct + ordered
			expect(c.stats.maxInflight).toBe(N); // all N pipelined
			expect(c.stats.writes).toBe(1); // …and sent as a single coalesced socket write
		});
	});

	test("flush:'sync' issues one socket write per query (no coalescing), still correct + pipelined", async () => {
		await withConn(async (c) => {
			const N = 20;
			const rows = await Promise.all(nums(N).map((i) => c.query('select $1::int as n', [i], { mode: 'object' })));
			rows.forEach((r, i) => expect((r.rows[0] as { n: number }).n).toBe(i));
			expect(c.stats.maxInflight).toBe(N); // still fully pipelined (round trips collapsed)
			expect(c.stats.writes).toBe(N); // but N separate writes (no coalescing)
		}, { pipeline: { flush: 'sync' } });
	});

	test('depth caps concurrency: with depth 4, at most 4 are ever in flight', async () => {
		await withConn(async (c) => {
			const rows = await Promise.all(nums(20).map((i) => c.query('select $1::int as n', [i], { mode: 'object' })));
			rows.forEach((r, i) => expect((r.rows[0] as { n: number }).n).toBe(i)); // still correct + ordered
			expect(c.stats.maxInflight).toBe(4);
			expect(c.stats.pipelineDepth).toBe(4);
		}, { pipeline: { depth: 4 } });
	});
});

describe('pipeline: false (gated)', () => {
	test('one query in flight at a time even under Promise.all; results still correct', async () => {
		await withConn(async (c) => {
			const rows = await Promise.all(nums(10).map((i) => c.query('select $1::int as n', [i], { mode: 'object' })));
			rows.forEach((r, i) => expect((r.rows[0] as { n: number }).n).toBe(i));
			expect(c.stats.pipelineDepth).toBe(1);
			expect(c.stats.maxInflight).toBe(1); // gated: never more than one in flight
		}, { pipeline: false });
	});
});

// A TCP proxy that holds every chunk for `delayMs` in each direction, so the round trip grows by 2x.
async function delayProxy(delayMs: number): Promise<{ port: number; close: () => void }> {
	const sockets = new Set<net.Socket>();
	const srv = net.createServer((client) => {
		const server = net.connect({ host: TEST_CONFIG.host!, port: TEST_CONFIG.port! });
		for (const [from, to] of [[client, server], [server, client]] as const) {
			sockets.add(from);
			from.on('data', (d) => setTimeout(() => to.write(d), delayMs));
			from.on('error', () => to.destroy());
			from.on('close', () => to.destroy());
		}
	});
	await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
	return {
		port: (srv.address() as net.AddressInfo).port,
		close: () => {
			for (const s of sockets) s.destroy();
			srv.close();
		},
	};
}

describe("depth: 'auto' follows the round trip", () => {
	test('a local connection keeps the floor of 100', async () => {
		await withConn(async (c) => {
			await c.query('select 1');
			expect(c.rtt.min).toBeLessThan(1);
			expect(c.stats.pipelineDepth).toBe(100);
		});
	});

	test('a 12 ms round trip raises the depth to about 100 per ms', async () => {
		if (TEST_CONFIG.host === undefined) return; // remote URL: no proxy
		const proxy = await delayProxy(6);
		const c = await testConnect({ host: '127.0.0.1', port: proxy.port });
		try {
			await c.query('select 1');
			const rtt = c.rtt.min!;
			expect(rtt).toBeGreaterThanOrEqual(12);
			expect(c.stats.pipelineDepth).toBe(Math.min(4096, Math.ceil(100 * rtt)));
			const rows = await Promise.all(nums(300).map((i) => c.query('select $1::int as n', [i])));
			expect(rows.map((r) => (r.rows[0] as unknown[])[0])).toEqual(nums(300));
			expect(c.stats.maxInflight).toBeGreaterThan(100); // beyond the old fixed default
		} finally {
			await c.end();
			proxy.close();
		}
	});

	test('a fixed depth does not follow the round trip', async () => {
		if (TEST_CONFIG.host === undefined) return;
		const proxy = await delayProxy(6);
		const c = await testConnect({ host: '127.0.0.1', port: proxy.port, pipeline: { depth: 50 } });
		try {
			await c.query('select 1');
			expect(c.stats.pipelineDepth).toBe(50);
		} finally {
			await c.end();
			proxy.close();
		}
	});
});
