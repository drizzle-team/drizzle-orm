// Domain: cancellation & timeouts.
// IMPLEMENTED in the driver: the connect-phase deadline (`connectTimeout`, a single
// timer spanning TCP + optional SSL + startup + auth) and correct surfacing of
// server-side timeout cancellations (statement_timeout / lock_timeout / idle-in-tx).
// NOT implemented (roadmap, marked test.todo): per-query timeout, AbortSignal,
// out-of-band CancelRequest using backendKey, auto-applied GUCs, pool acquire timeout.
//
// Requires a running cluster: `bun run test:setup`.
import { describe, expect, test } from 'bun:test';
import net from 'node:net';
import { Connection } from '../../src/index.ts';
import { caught, PgError, TEST_CONFIG, testConnect } from '../helpers/db.ts';

// A raw-TCP stub: accepts connections and (optionally) runs `onConn` per socket.
function stubServer(onConn?: (sock: net.Socket) => void): Promise<{ port: number; close: () => Promise<void> }> {
	// A stub socket that never reads its buffered input does not notice that the client closed, so
	// srv.close() alone would wait for it forever.
	const sockets = new Set<net.Socket>();
	return new Promise((resolve) => {
		const srv = net.createServer((sock) => {
			sockets.add(sock);
			sock.on('error', () => {/* ignore client teardown */});
			onConn?.(sock);
		});
		srv.on('error', () => {/* ignore */});
		srv.listen(0, '127.0.0.1', () => {
			const addr = srv.address() as net.AddressInfo;
			resolve({
				port: addr.port,
				close: () => {
					for (const s of sockets) s.destroy();
					return new Promise<void>((r) => srv.close(() => r()));
				},
			});
		});
	});
}

describe('connect timeout — handshake deadline (implemented)', () => {
	test('unroutable host rejects within the bound, not the 30s default', async () => {
		const t0 = Date.now();
		const err = await caught(() => testConnect({ host: '10.255.255.1', port: 54329, connectTimeout: 800 }));
		const dt = Date.now() - t0;
		expect(err).toBeInstanceOf(Error);
		expect(dt).toBeLessThan(3000); // the key invariant: it does NOT hang for ~30s
	}, 8000);

	test('refused port rejects promptly', async () => {
		const t0 = Date.now();
		const err = await caught(() => testConnect({ host: '127.0.0.1', port: 59999, connectTimeout: 3000 }));
		const dt = Date.now() - t0;
		expect(err).toBeInstanceOf(Error);
		expect(dt).toBeLessThan(2500);
	}, 8000);

	test('stub that accepts TCP but never speaks still times out (timer spans the startup phase)', async () => {
		const stub = await stubServer(); // accept and stay silent
		try {
			const t0 = Date.now();
			const err = await caught(() => testConnect({ host: '127.0.0.1', port: stub.port, connectTimeout: 350 }));
			const dt = Date.now() - t0;
			expect((err as Error).message).toMatch(/connect timeout after 350ms/);
			expect(dt).toBeGreaterThanOrEqual(250);
			expect(dt).toBeLessThan(2000);
		} finally {
			await stub.close();
		}
	}, 8000);

	test('stub that ACKs SSLRequest ("S") then stalls the TLS upgrade still times out (timer covers SSL)', async () => {
		const stub = await stubServer((sock) => {
			sock.once('data', () => {
				try {
					sock.write(Buffer.from('S'));
				} catch { /* */ }
			}); // accept SSL, never do TLS
		});
		try {
			const t0 = Date.now();
			const err = await caught(() =>
				testConnect({ host: '127.0.0.1', port: stub.port, ssl: true, connectTimeout: 350 })
			);
			const dt = Date.now() - t0;
			expect((err as Error).message).toMatch(/connect timeout after 350ms/);
			expect(dt).toBeLessThan(2000);
		} finally {
			await stub.close();
		}
	}, 8000);

	test('happy path: a generous deadline succeeds and the timer is cleared (no late rejection)', async () => {
		const c = await testConnect({ connectTimeout: 400 });
		expect(c.state).toBe('ready');
		await new Promise((r) => setTimeout(r, 700)); // outlive connectTimeout: if the timer leaked it would close us here
		expect(c.state).toBe('ready');
		const ok = await c.query('select 1 as x');
		expect((ok.rows[0] as unknown[])[0]).toBe(1);
		await c.end();
	}, 8000);

	test('backendKey {pid, secret} is captured after connect (numeric)', async () => {
		const c = await testConnect();
		expect(c.backendKey).not.toBeNull();
		expect(typeof c.backendKey!.pid).toBe('number');
		expect(typeof c.backendKey!.secret).toBe('number');
		expect(Number.isInteger(c.backendKey!.pid)).toBe(true);
		await c.end();
	});

	test('connect() is re-entrant: a second call returns the same cached promise, one timer', async () => {
		const c = new Connection(TEST_CONFIG);
		const p1 = c.connect();
		const p2 = c.connect();
		expect(p1).toBe(p2); // same connectPromise, no second timer armed
		await p1;
		expect(c.state).toBe('ready');
		await c.end();
	});
});

describe('server-side session timeouts (implemented surfacing)', () => {
	test('statement_timeout cancels with SQLSTATE 57014 and the connection recovers', async () => {
		const c = await testConnect();
		await c.query("set statement_timeout = '200ms'");
		const err = await caught(() => c.query('select pg_sleep(2)'));
		expect((err as PgError).code).toBe('57014'); // query_canceled
		const ok = await c.query('select 1 as x'); // recovered, queue not wedged
		expect((ok.rows[0] as unknown[])[0]).toBe(1);
		await c.end();
	}, 8000);

	test('a real SET statement_timeout persists across the recovered connection (SHOW reflects it)', async () => {
		const c = await testConnect();
		await c.query("set statement_timeout = '200ms'");
		const err = await caught(() => c.query('select pg_sleep(2)'));
		expect((err as PgError).code).toBe('57014');
		const show = await c.query('show statement_timeout');
		expect(String((show.rows[0] as unknown[])[0])).toMatch(/200/); // GUC was a real SET, not reset by the error
		await c.end();
	}, 8000);

	test('SET LOCAL statement_timeout is scoped to the txn and does not mutate the session default', async () => {
		const c = await testConnect();
		await c.query("set statement_timeout = '0'"); // disabled at session scope
		await c.query('begin');
		await c.query("set local statement_timeout = '150ms'");
		const err = await caught(() => c.query('select pg_sleep(2)'));
		expect((err as PgError).code).toBe('57014');
		await c.query('rollback'); // txn aborted by the cancel; clear it
		const show = await c.query('show statement_timeout');
		expect(String((show.rows[0] as unknown[])[0])).toBe('0'); // session default untouched by SET LOCAL
		await c.end();
	}, 8000);

	test('lock_timeout aborts a blocked SELECT ... FOR UPDATE with SQLSTATE 55P03', async () => {
		const name = `ct_lock_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
		const setup = await testConnect();
		const a = await testConnect();
		const b = await testConnect();
		try {
			await setup.query(`create table ${name}(id int primary key, v int)`);
			await setup.query(`insert into ${name} values (1, 1)`);
			await a.query('begin');
			await a.query(`select * from ${name} where id = 1 for update`); // A holds the row lock
			await b.query("set lock_timeout = '250ms'");
			await b.query('begin');
			const err = await caught(() => b.query(`select * from ${name} where id = 1 for update`));
			expect((err as PgError).code).toBe('55P03'); // lock_not_available
		} finally {
			await a.query('rollback').catch(() => {});
			await b.query('rollback').catch(() => {});
			await setup.query(`drop table if exists ${name}`).catch(() => {});
			await a.end();
			await b.end();
			await setup.end();
		}
	}, 12000);

	test('a query well under statement_timeout completes normally (no spurious cancel)', async () => {
		const c = await testConnect();
		await c.query("set statement_timeout = '2s'");
		const ok = await c.query('select pg_sleep(0.05) as s');
		expect(ok.rowCount).toBe(1);
		await c.end();
	}, 8000);
});

describe('idle_in_transaction termination (footgun: SQLSTATE 25P03 is lost)', () => {
	test(
		'an idle-in-tx kill surfaces as a catchable error (never an uncaught crash), but the original 25P03 is dropped',
		async () => {
			const c = await testConnect();
			await c.query('begin');
			await c.query("set idle_in_transaction_session_timeout = '200ms'");
			await new Promise((r) => setTimeout(r, 700)); // idle past the timeout; server sends FATAL + closes
			const err = await caught(() => c.query('select 1'));
			expect(err).toBeInstanceOf(Error); // catchable, not an unhandledRejection
			// FOOTGUN: the FATAL 'E' arrives while current===null and is swallowed; the socket
			// close drives fatal(), so we lose SQLSTATE 25P03 and get a generic close message.
			expect((err as Error).message).toMatch(/connection (is closed|terminated)/);
			expect((err as PgError).code).not.toBe('25P03');
			await c.end();
		},
		8000,
	);
});

describe('driver does not kill long work; cancelled work settles & leaves the connection usable', () => {
	test('a long query (pg_sleep 3s) runs to completion — no driver-side idle/keepalive cancel', async () => {
		const c = await testConnect();
		const t0 = Date.now();
		const r = await c.query('select pg_sleep(3) as s');
		expect(Date.now() - t0).toBeGreaterThanOrEqual(2500);
		expect(r.rowCount).toBe(1);
		expect(c.state).toBe('ready'); // never flipped to idle/closed mid-execution
		await c.end();
	}, 10000);

	test('after a server-cancelled query, a queued query is dispatched and returns correct results', async () => {
		const c = await testConnect();
		await c.query("set statement_timeout = '150ms'");
		const p1 = caught(() => c.query('select pg_sleep(2)')); // will be cancelled (57014)
		const p2 = c.query('select 42 as n'); // queued behind it
		expect((await p1 as PgError).code).toBe('57014');
		expect((((await p2).rows[0]) as unknown[])[0]).toBe(42); // queue not wedged
		await c.end();
	}, 8000);

	test('end() while a query is in flight settles the promise (no hung promise)', async () => {
		const c = await testConnect();
		const inflight = caught(() => c.query('select pg_sleep(5)'));
		await c.end();
		const err = await inflight;
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toMatch(/ended/);
	}, 8000);
});

describe('stream early-break (footgun: client-side only, no CancelRequest)', () => {
	test('breaking a cheap stream leaves the connection usable (rows drained, no CancelRequest sent)', async () => {
		const c = await testConnect();
		const it = c.stream('select generate_series(1, 100000) as n');
		let first: unknown;
		for await (const row of it) {
			first = row;
			break;
		} // return() -> cancelled, socket resumed, server keeps running
		expect(Array.isArray(first)).toBe(true);
		const ok = await c.query('select 7 as n'); // queued behind the drain; resolves once the server finishes
		expect((ok.rows[0] as unknown[])[0]).toBe(7);
		await c.end();
	}, 12000);
});

// ----------------------------------------------------------------------------
// Roadmap — not implemented in the current source. Precise specs for when built.
// ----------------------------------------------------------------------------
describe('roadmap: client-enforced query timeout', () => {
	test.todo('query(sql, params, {timeout: N}) rejects ~N ms with a timeout error and terminates/cancels the wedged query', () => {});
	test.todo('a query_timeout firing on a stream()/iterator path rejects the pending next() via streamError (no internal "callback is not a function")', () => {});
	test.todo('a normally-completed query clears the future timeout timer (no leaked timer keeping the event loop alive)', () => {});
	test.todo('a per-query timeout on pool.query aborts only that query, not siblings or a pool default', () => {});
});

describe('roadmap: AbortSignal integration', () => {
	test.todo('an already-aborted AbortSignal rejects query() immediately and never writes Parse/Bind', () => {});
	test.todo('aborting mid-flight triggers a CancelRequest, rejects with AbortError, and cancels server-side (57014)', () => {});
	test.todo('after an aborted query the connection drains to ready and is reusable', () => {});
});

describe('roadmap: out-of-band CancelRequest using backendKey', () => {
	test.todo('conn.cancel() opens a second socket and sends CancelRequest with THIS conn backendKey {pid,secret}; in-flight pg_sleep rejects 57014, conn drains to ready', () => {});
	test.todo('CancelRequest forwards this connection own pid/secret, never a stale or other connection key', () => {});
	test.todo('stream early-break sends a CancelRequest so an EXPENSIVE server-side query is actually aborted (today it runs to completion)', () => {});
});

describe('roadmap: config-driven timeouts (aliases / auto-applied GUCs / pool acquire)', () => {
	test.todo('connectionTimeoutMillis (node-postgres alias) is honored as the connect deadline (today only connectTimeout is read)', () => {});
	test.todo('connect_timeout connection-string param and PGCONNECT_TIMEOUT env (seconds!) are honored', () => {});
	test.todo('statement_timeout/lock_timeout/idle_in_transaction_session_timeout from config are injected on every new connection (verified via SHOW)', () => {});
	test.todo('Pool acquire timeout: a waiter at max rejects after N ms and is removed from the queue (not handed a later release)', () => {});
});
