// Cancellation against REAL PostgreSQL — proves the out-of-band CancelRequest path
// actually stops a running query and that the connection recovers afterward.
import { describe, expect, test } from 'bun:test';
import net from 'node:net';
import { caught, type PgError, TEST_CONFIG, testConnect, testPool } from '../helpers/db.ts';

const CANCEL_REQUEST_CODE = 80877102;

// A TCP proxy in front of the test server that holds every CancelRequest for `delayMs`, or forever when
// `delayMs` is null. A cancel then reaches the server after a short query has already finished, which is
// the race that a slow network causes.
function delayCancelProxy(delayMs: number | null): Promise<{ port: number; close: () => Promise<void> }> {
	const sockets = new Set<net.Socket>();
	return new Promise((resolve) => {
		const srv = net.createServer({ allowHalfOpen: true }, (client) => {
			sockets.add(client);
			client.on('error', () => {});
			client.once('data', (first: Buffer) => {
				client.pause();
				const isCancel = first.length === 16 && first.readInt32BE(4) === CANCEL_REQUEST_CODE;
				if (isCancel && delayMs === null) return;
				setTimeout(() => {
					const server = net.connect({ host: TEST_CONFIG.host!, port: TEST_CONFIG.port! }, () => {
						server.write(first);
						client.pipe(server);
						server.pipe(client);
						client.resume();
					});
					sockets.add(server);
					server.on('error', () => client.destroy());
					client.on('close', () => server.destroy());
				}, isCancel ? delayMs! : 0);
			});
		});
		srv.listen(0, '127.0.0.1', () =>
			resolve({
				port: (srv.address() as net.AddressInfo).port,
				close: () => {
					for (const s of sockets) s.destroy();
					return new Promise<void>((r) => srv.close(() => r()));
				},
			}));
	});
}

const cell = (r: { rows: unknown[] }, i: number): unknown => (r.rows[0] as unknown[])[i];

// The first query outlives its timeout and ends normally before the delayed cancel arrives. Without
// protection, the cancel lands on whatever runs next on that backend and fails it with 57014.
describe('a cancel request that arrives after its query finished', () => {
	test('the next query on the same connection succeeds', async () => {
		const proxy = await delayCancelProxy(400);
		const c = await testConnect({ host: '127.0.0.1', port: proxy.port });
		try {
			const err = await caught(() => c.query('select pg_sleep(0.2)', [], { timeout: 50 }));
			expect((err as { code?: string }).code).toBe('QUERY_TIMEOUT');
			const r = await c.query('select pg_sleep(0.5), 1');
			expect(cell(r, 1)).toBe(1);
		} finally {
			await c.end();
			await proxy.close();
		}
	}, 10000);

	test('the next pool query on the same connection succeeds', async () => {
		const proxy = await delayCancelProxy(400);
		const pool = testPool({ host: '127.0.0.1', port: proxy.port, max: 1 });
		try {
			await caught(() => pool.query('select pg_sleep(0.2)', [], { timeout: 50 }));
			const r = await pool.query('select pg_sleep(0.5), 1');
			expect(cell(r, 1)).toBe(1);
		} finally {
			await pool.end();
			await proxy.close();
		}
	}, 10000);

	test('a cancel that the server never confirms closes the connection instead of failing the next query', async () => {
		const proxy = await delayCancelProxy(null);
		const c = await testConnect({ host: '127.0.0.1', port: proxy.port, connectTimeout: 500 });
		try {
			await caught(() => c.query('select pg_sleep(0.2)', [], { timeout: 50 }));
			const err = await caught(() => c.query('select 1'));
			expect((err as PgError).code).not.toBe('57014');
			expect(c.state).toBe('closed');
		} finally {
			await c.end();
			await proxy.close();
		}
	}, 10000);

	test('a pool replaces a connection whose cancel the server never confirms', async () => {
		const proxy = await delayCancelProxy(null);
		const pool = testPool({ host: '127.0.0.1', port: proxy.port, max: 1, connectTimeout: 500 });
		try {
			const first = await pool.query('select pg_backend_pid()');
			await caught(() => pool.query('select pg_sleep(0.2)', [], { timeout: 50 }));
			const r = await pool.query('select pg_backend_pid()');
			expect(cell(r, 0)).not.toBe(cell(first, 0));
		} finally {
			await pool.end();
			await proxy.close();
		}
	}, 10000);

	test('a late cancel that stops a pipelined query marks its error and keeps the connection', async () => {
		const proxy = await delayCancelProxy(400);
		const c = await testConnect({ host: '127.0.0.1', port: proxy.port });
		try {
			const pid = c.backendKey!.pid;
			const first = caught(() => c.query('select pg_sleep(0.2)', [], { timeout: 50 }));
			const second = caught(() => c.query('select pg_sleep(0.5), 1'));
			expect(((await first) as { code?: string }).code).toBe('QUERY_TIMEOUT');
			const err = (await second) as PgError;
			expect(err.code).toBe('57014');
			expect(err.isLateCancel).toBe(true);
			const r = await c.query('select pg_backend_pid()');
			expect(cell(r, 0)).toBe(pid);
		} finally {
			await c.end();
			await proxy.close();
		}
	}, 10000);

	test('a cancel that stops its query keeps the connection', async () => {
		const proxy = await delayCancelProxy(0);
		const c = await testConnect({ host: '127.0.0.1', port: proxy.port });
		try {
			const pid = c.backendKey!.pid;
			await caught(() => c.query('select pg_sleep(5)', [], { timeout: 50 }));
			const r = await c.query('select pg_backend_pid()');
			expect(cell(r, 0)).toBe(pid);
		} finally {
			await c.end();
			await proxy.close();
		}
	}, 10000);
});

describe('cancel over a unix socket', () => {
	test('a timeout cancels the query through the socket path, and the same backend serves the next query', async () => {
		// Port 59999 has no server, so the cancel works only if it uses the socket path.
		const c = await testConnect({ path: `/tmp/postgres_sock/.s.PGSQL.${TEST_CONFIG.port}`, port: 59999 });
		try {
			const pid = c.backendKey!.pid;
			const t0 = Date.now();
			await caught(() => c.query('select pg_sleep(5)', [], { timeout: 100 }));
			const r = await c.query('select pg_backend_pid()');
			expect(Date.now() - t0).toBeLessThan(3000);
			expect(cell(r, 0)).toBe(pid);
		} finally {
			await c.end();
		}
	}, 10000);
});

describe('cancellation (real PostgreSQL)', () => {
	test('a per-query timeout cancels a long-running query; the connection then recovers', async () => {
		const c = await testConnect();
		const t0 = Date.now();
		const err = await caught(() => c.query('select pg_sleep(5)', [], { timeout: 250 }));
		expect((err as { code?: string }).code).toBe('QUERY_TIMEOUT');
		expect(Date.now() - t0).toBeLessThan(3000); // did NOT wait the full 5s
		const ok = await c.query('select 7'); // recovered after the real server-side cancel
		expect((ok.rows[0] as unknown[])[0]).toBe(7);
		await c.end();
	}, 10000);

	test('AbortSignal cancels a long-running query', async () => {
		const c = await testConnect();
		const ac = new AbortController();
		const p = caught(() => c.query('select pg_sleep(5)', [], { signal: ac.signal }));
		setTimeout(() => ac.abort(), 150);
		expect(await p).toBeInstanceOf(Error);
		const ok = await c.query('select 1'); // connection still usable
		expect((ok.rows[0] as unknown[])[0]).toBe(1);
		await c.end();
	}, 10000);
});
