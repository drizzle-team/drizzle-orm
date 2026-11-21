// Query cancellation (timeout + AbortSignal -> out-of-band CancelRequest), driven
// against the MockPgServer — deterministic, no real PostgreSQL.
import { describe, expect, test } from 'bun:test';
import net from 'node:net';
import os from 'node:os';
import { Duplex } from 'node:stream';
import { connect, createPool, type Transport } from '../../src/index.ts';
import { nodeCancel, nodeTransport } from '../../src/transport-node.ts';
import { sendCancelRequest } from '../../src/webstream.ts';
import { acquireFromOwnPool } from '../helpers/db.ts';
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
const pooledConnection = (m: MockPgServer) => acquireFromOwnPool(createPool(m.connectConfig({ max: 1 })));
const hasIpv6Loopback = Object.values(os.networkInterfaces()).flat().some((i) => i?.address === '::1');

describe('per-query timeout', () => {
	test('a hung query times out, sends ONE CancelRequest, and the connection recovers', async () => {
		await withMock(async (m) => {
			const c = await pooledConnection(m);
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
			const c = await pooledConnection(m);
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
			const c = await pooledConnection(m);
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
			const c = await pooledConnection(m);
			const ac = new AbortController();
			ac.abort();
			expect(await c.query('select 1', [], { signal: ac.signal }).catch((e) => e)).toBeInstanceOf(Error);
			expect(m.cancelRequests).toBe(0);
			await c.end();
		});
	});

	test('aborting a QUEUED query drops it without a CancelRequest', async () => {
		await withMock(async (m) => {
			const c = await pooledConnection(m);
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

describe('the cancel connection', () => {
	// The host name does not resolve, so the cancel reaches the mock only through the IP address of the session.
	test('dials the IP address of the session, not the host name', async () => {
		await withMock(async (m) => {
			const transport: Transport = {
				connect: (target, signal) => nodeTransport({ ...target, host: '127.0.0.1' }, signal),
				cancel: nodeCancel,
			};
			const pool = createPool(m.connectConfig({ max: 1, host: 'db.invalid', transport }));
			try {
				m.setMode('hang');
				const err = await pool.query('select 1', [], { timeout: 50 }).then(() => null, (e) => e);
				expect((err as { code?: string }).code).toBe('QUERY_TIMEOUT');
				await tick(100);
				expect(m.cancelRequests).toBe(1);
			} finally {
				await pool.end();
			}
		});
	});

	// The proxy listens on ::1 and the mock on 127.0.0.1 only, so a cancel that dials the peer of the
	// socket finds no server.
	test.skipIf(!hasIpv6Loopback)('dials the host when a socket factory opened the session', async () => {
		await withMock(async (m) => {
			const proxy = net.createServer((client) => {
				const server = net.connect(m.port, '127.0.0.1');
				client.on('error', () => server.destroy());
				server.on('error', () => client.destroy());
				client.pipe(server).pipe(client);
			});
			await new Promise<void>((resolve) => proxy.listen(0, '::1', resolve));
			const proxyPort = (proxy.address() as net.AddressInfo).port;
			const pool = createPool(m.connectConfig({ max: 1, socket: () => net.connect(proxyPort, '::1') }));
			try {
				m.setMode('hang');
				const err = await pool.query('select 1', [], { timeout: 50 }).then(() => null, (e) => e);
				expect((err as { code?: string }).code).toBe('QUERY_TIMEOUT');
				await tick(100);
				expect(m.cancelRequests).toBe(1);
			} finally {
				await pool.end();
				proxy.close();
			}
		});
	});
});

describe('a query that has ended', () => {
	test('gets no CancelRequest, and the connection stays in use', async () => {
		await withMock(async (m) => {
			let openCancel!: () => void;
			const isCancelHeld = new Promise<void>((resolve) => {
				openCancel = resolve;
			});
			// The real cancel waits until the query has ended. A real network cannot be timed that precisely.
			const transport: Transport = {
				connect: nodeTransport,
				cancel: async (target, key, isQueryRunning) => {
					await isCancelHeld;
					await nodeCancel(target, key, isQueryRunning);
				},
			};
			// Behind a pooler, a cancel that was sent retires the connection. Reuse shows that nothing was sent.
			const c = await acquireFromOwnPool(createPool(m.connectConfig({ max: 1, pooler: true, transport })));
			try {
				m.setMode('hang');
				const err = await c.query('select 1', [], { timeout: 50 }).then(() => null, (e) => e);
				expect((err as { code?: string }).code).toBe('QUERY_TIMEOUT');
				m.setMode('normal');
				m.finishHung();
				await tick();
				openCancel();
				await tick(50);
				expect(m.cancelRequests).toBe(0);
				expect(c.cancelSettled).toBeUndefined();
				expect((await c.query('select 1')).rows).toEqual([[1]] as never);
			} finally {
				await c.end();
			}
		});
	});

	test('nodeCancel writes a CancelRequest only while the query runs', async () => {
		await withMock(async (m) => {
			const target = {
				...m.connectConfig(),
				host: '127.0.0.1',
				port: m.port,
				ssl: false as const,
				connectTimeout: 1000,
			};
			await nodeCancel(target, { pid: 1, secret: 1 }, () => false);
			await nodeCancel(target, { pid: 1, secret: 1 }, () => true);
			await tick();
			expect(m.cancelRequests).toBe(1);
			expect(m.connectAttempts).toBe(2);
		});
	});

	test('sendCancelRequest writes a CancelRequest only while the query runs', async () => {
		await withMock(async (m) => {
			const send = async (isQueryRunning: () => boolean) => {
				const socket = net.connect(m.port, '127.0.0.1');
				await new Promise((resolve) => socket.once('connect', resolve));
				const { readable, writable } = Duplex.toWeb(socket);
				try {
					await sendCancelRequest(readable, writable, { pid: 1, secret: 1 }, isQueryRunning);
				} finally {
					socket.destroy();
				}
			};
			await send(() => false);
			await send(() => true);
			await tick();
			expect(m.cancelRequests).toBe(1);
			expect(m.connectAttempts).toBe(2);
		});
	});
});

describe('a single connection', () => {
	test('rejects a query with timeout or signal before anything is sent', async () => {
		let queries = 0;
		const m = await MockPgServer.start({
			onQuery: () => {
				queries++;
				return OK();
			},
		});
		try {
			const c = await connect(m.connectConfig());
			const signal = new AbortController().signal;
			const columns = { id: 'int4', n: 'int4' } as const;
			const rows = [[1, 1], [2, 2]];
			const results = await Promise.all([
				c.query('select 1', [], { timeout: 1000 } as never).catch((e) => e),
				c.query('select 1', [], { signal } as never).catch((e) => e),
				c.query('select 1', [], { snapshot: '00000003-1', timeout: 1000 } as never).catch((e) => e),
				c.queryTyped('select 1', [], [], { signal } as never).catch((e) => e),
				c.bulkInsert('t', columns, rows, { chunk: 1, timeout: 1000 } as never).catch((e) => e),
				c.bulkUpdate('t', columns, rows, { by: 'id', chunk: 1, signal } as never).catch((e) => e),
				c.copyFrom('copy t from stdin', [], { timeout: 1000 } as never).catch((e) => e),
				c.copyMany('t', columns, rows, { chunk: 1, signal } as never).catch((e) => e),
				c.stream('select 1', [], { timeout: 1000 } as never).next().catch((e) => e),
				c.copyTo('copy t to stdout', { signal } as never).next().catch((e) => e),
			]);
			for (const err of results as Error[]) {
				expect((err as { code?: string }).code).toBe('CANCEL_NEEDS_POOL');
				expect(err.message).toBe(
					'Canceling a query needs a pooled connection. Create the connection with createPool, or remove timeout and signal.',
				);
			}
			expect(queries).toBe(0);
			await c.end();
		} finally {
			await m.close();
		}
	});

	test('an early close of stream() reads and drops the rest of the result', async () => {
		await withMock(async (m) => {
			const c = await connect(m.connectConfig());
			m.setMode('hang');
			const it = c.stream('select 1');
			await tick();
			await it.return!();
			await tick();
			expect(m.cancelRequests).toBe(0);
			m.setMode('normal');
			m.finishHung();
			expect((await c.query('select 1')).rows).toEqual([[1]] as never);
			await c.end();
		});
	});

	test('an early close of copyTo() reads and drops the rest of the result', async () => {
		await withMock(async (m) => {
			const c = await connect(m.connectConfig());
			m.setMode('hang');
			const it = c.copyTo('copy t to stdout');
			await tick();
			await it.return!();
			await tick();
			expect(m.cancelRequests).toBe(0);
			m.setMode('normal');
			m.finishHung();
			expect((await c.query('select 1')).rows).toEqual([[1]] as never);
			await c.end();
		});
	});
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
