// Query cancellation (timeout + AbortSignal -> out-of-band CancelRequest), driven
// against the MockPgServer — deterministic, no real PostgreSQL.
import { describe, expect, test } from 'bun:test';
import { connect } from '../../src/index.ts';
import { MockPgServer } from '../mock/server.ts';

const OK = () => ({ fields: [{ name: 'n', oid: 23 }], rows: [['1']] as string[][], command: 'SELECT' });
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
async function withMock<T>(fn: (m: MockPgServer) => Promise<T>): Promise<T> {
	const m = await MockPgServer.start({ onQuery: OK });
	try {
		return await fn(m);
	} finally {
		await m.close();
	}
}

describe('per-query timeout', () => {
	test('a hung query times out, sends ONE CancelRequest, and the connection recovers', async () => {
		await withMock(async (m) => {
			const c = await connect(m.connectConfig());
			m.setMode('hang');
			const err = await c.query('select 1', [], { timeout: 80 }).catch((e) => e);
			expect((err as { code?: string }).code).toBe('QUERY_TIMEOUT');
			await tick(50);
			expect(m.cancelRequests).toBe(1); // exactly one out-of-band cancel
			m.setMode('normal');
			expect((await c.query('select 1')).rows.length).toBe(1); // still usable
			await c.end();
		});
	}, 10000);

	test('a fast query under the timeout is never cancelled', async () => {
		await withMock(async (m) => {
			const c = await connect(m.connectConfig());
			expect((await c.query('select 1', [], { timeout: 1000 })).rows.length).toBe(1);
			await tick(30);
			expect(m.cancelRequests).toBe(0);
			await c.end();
		});
	});
});

describe('AbortSignal', () => {
	test('aborting an in-flight query rejects it and sends a CancelRequest', async () => {
		await withMock(async (m) => {
			const c = await connect(m.connectConfig());
			m.setMode('hang');
			const ac = new AbortController();
			const p = c.query('select 1', [], { signal: ac.signal }).catch((e) => e);
			await tick(30);
			ac.abort();
			expect(await p).toBeInstanceOf(Error);
			await tick(50);
			expect(m.cancelRequests).toBe(1);
			m.setMode('normal');
			expect((await c.query('select 1')).rows.length).toBe(1);
			await c.end();
		});
	}, 10000);

	test('an already-aborted signal rejects immediately and never hits the wire', async () => {
		await withMock(async (m) => {
			const c = await connect(m.connectConfig());
			const ac = new AbortController();
			ac.abort();
			expect(await c.query('select 1', [], { signal: ac.signal }).catch((e) => e)).toBeInstanceOf(Error);
			expect(m.cancelRequests).toBe(0);
			await c.end();
		});
	});

	test('aborting a QUEUED query drops it without a CancelRequest', async () => {
		await withMock(async (m) => {
			const c = await connect(m.connectConfig());
			m.setMode('hang');
			const first = c.query('select 1').catch((e) => e); // occupies the connection
			await tick(20);
			const ac = new AbortController();
			const queued = c.query('select 2', [], { signal: ac.signal }).catch((e) => e); // parked behind `first`
			ac.abort();
			expect(await queued).toBeInstanceOf(Error);
			expect(m.cancelRequests).toBe(0); // a queued task never reached the wire
			await c.end(); // settles the hung first query
			await first;
		});
	}, 10000);
});

describe('stream early close', () => {
	// A real server ignores a cancel that reaches an idle backend, so only the mock can see a needless one.
	test('a stream that is read to the end sends no CancelRequest', async () => {
		await withMock(async (m) => {
			const c = await connect(m.connectConfig());
			const it = c.stream('select 1');
			const rows: unknown[] = [];
			for await (const row of it) rows.push(row);
			await it.return!();
			await tick(30);
			expect(rows.length).toBe(1);
			expect(m.cancelRequests).toBe(0);
			await c.end();
		});
	});
});
