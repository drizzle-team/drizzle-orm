// Real-workerd test for the minipg/cf adapter (nodejs_compat path). Verifies the pieces that our
// Node-based simulation can't: cloudflare:sockets connect(), SCRAM auth via nodejs_compat node:crypto,
// Buffer, and — the open question — Duplex.from({readable,writable}) under workerd's node:stream.
//
// Needs the local PG cluster reachable from workerd (`bun run test:setup`, listening on 127.0.0.1:54329).
// Run with: `bun run test:cf`.
import { expect, it } from 'vitest';
import { connect, createPool } from '../../src/cf.ts';

const CFG = { host: '127.0.0.1', port: 54329, user: 'postgres', password: 'postgres', database: 'testdb' };

it('connects over cloudflare:sockets, authenticates, and text-decodes', async () => {
	const db = await connect(CFG);
	try {
		const r = await db.query('select 1 as n, $1::text as t, (g * 1.5)::float8 as f from generate_series(1, 3) g', [
			'hi',
		], { mode: 'object' });
		expect(r.rows.length).toBe(3);
		expect(r.rows[0]).toEqual({ n: 1, t: 'hi', f: 1.5 });
	} finally {
		await db.end();
	}
});

it('binary flow (queryTyped) + a larger stream survive the workerd transport', async () => {
	const db = await connect(CFG);
	try {
		const b = await db.queryTyped(
			`select 3.141592653589793::float8, 9223372036854775807::int8, 42::int4`,
			[],
			[
				{ name: 'f', oid: 701, format: 'binary' },
				{ name: 'big', oid: 20, format: 'binary' },
				{ name: 'i', oid: 23, format: 'binary' },
			],
			{ mode: 'object' },
		);
		expect(b.rows[0]).toEqual({ f: 3.141592653589793, big: 9223372036854775807n, i: 42 });

		// stress chunking/backpressure through Duplex.from under workerd
		const big = await db.query('select g from generate_series(1, 1000) g');
		expect(big.rows.length).toBe(1000);
	} finally {
		await db.end();
	}
});

it('a url-only config dials the URL host/port, not localhost:5432 (cf-transport regression)', async () => {
	// pre-fix, cfSocket read the RAW config (host undefined -> localhost:5432) and only the
	// startup message saw the parsed url — right user, wrong server. 54329 != the 5432 default,
	// so this connect only succeeds if the url actually reached the dialer.
	const db = await connect('postgres://postgres:postgres@127.0.0.1:54329/testdb');
	try {
		const r = await db.query('select current_database() as db', [], { mode: 'object' });
		expect(r.rows[0]).toEqual({ db: 'testdb' });
	} finally {
		await db.end();
	}
});

it(
	'sslmode=require does the Postgres STARTTLS dance (reaches TLS; self-signed cert then fails verification)',
	async () => {
		// The local cluster has ssl=on with a SELF-SIGNED cert. Pre-fix (implicit TLS) this died before
		// any TLS with a protocol error; post-fix the SSLRequest exchange succeeds and the failure moves
		// to the TLS handshake itself (workerd trusts no self-signed cert) — proving STARTTLS negotiated.
		let err: Error | null = null;
		try {
			await connect({ ...CFG, ssl: 'require', connectTimeout: 8000 });
		} catch (e) {
			err = e as Error;
		}
		expect(err).not.toBeNull();
		expect(err!.message).toMatch(/TLS handshake failed/);
		expect(err!.message).not.toMatch(/startup|SSLRequest reply/i);
	},
	15000,
);

it('`channel_binding=require` is refused up front, naming the workerd limit', async () => {
	// cloudflare:sockets owns the TLS session and its Socket exposes no certificate API, so SCRAM's
	// tls-server-end-point cannot be computed here by anyone. This entry dials ANY Postgres, so a caller
	// who asked for binding is told it is impossible rather than silently downgraded to an unbound session.
	// (minipg/neon-ws relaxes instead — one provider, whose own drivers ignore the parameter.)
	let err: Error | null = null;
	try {
		await connect('postgres://postgres:postgres@127.0.0.1:54329/testdb?channel_binding=require');
	} catch (e) {
		err = e as Error;
	}
	expect(err).not.toBeNull();
	expect(err!.message).toMatch(/channel_binding=require cannot be honoured/);
	expect(err!.message).toMatch(/cloudflare:sockets/); // says WHY, not just "unsupported"
	expect(err!.message).toContain('`channel_binding=prefer`'); // …and what to do instead,
	expect(err!.message).toContain('`minipg/node`'); // …or where to go for a bound connection
	expect((err as unknown as { fatal?: boolean }).fatal).toBe(true); // a pool must not retry this
});

it('createPool refuses it synchronously too — no lazy 30s breaker timeout', () => {
	expect(() => createPool('postgres://postgres:postgres@127.0.0.1:54329/testdb?channel_binding=require'))
		.toThrow(/channel_binding=require cannot be honoured/);
});

it('channel_binding=prefer and disable still connect normally', async () => {
	for (const mode of ['prefer', 'disable']) {
		const db = await connect(`postgres://postgres:postgres@127.0.0.1:54329/testdb?channel_binding=${mode}`);
		try {
			expect((await db.query('select 1 as ok', [], { mode: 'object' })).rows[0]).toEqual({ ok: 1 });
		} finally {
			await db.end();
		}
	}
});

// The package root resolves to THIS entry under the `workerd` export condition, so it must expose
// everything the root does — with its own connect/createPool (cloudflare:sockets), not the core's.
it('exposes the whole core API, with its own connect/createPool', async () => {
	const cf = await import('../../src/cf.ts');
	const core = await import('../../src/core.ts');
	const missing = Object.keys(core).filter((k) => !(k in cf));
	expect(missing).toEqual([]);
	expect(cf.connect).not.toBe(core.connect);
	expect(cf.createPool).not.toBe(core.createPool);
	expect(cf.Shape).toBe(core.Shape);
});

// Without a cancel request, the server keeps running pg_sleep(5), so the next query waits about 5 s for it.
it('a timeout cancels the query on the server, and the same backend serves the next query', async () => {
	const db = await connect(CFG);
	try {
		const pid = db.backendKey!.pid;
		const t0 = Date.now();
		const err = await db.query('select pg_sleep(5)', [], { timeout: 200 }).then(() => null, (e: Error) => e);
		expect((err as { code?: string } | null)?.code).toBe('QUERY_TIMEOUT');
		const r = await db.query('select pg_backend_pid() as pid', [], { mode: 'object' });
		expect(Date.now() - t0).toBeLessThan(3000);
		expect((r.rows[0] as { pid: number }).pid).toBe(pid);
	} finally {
		await db.end();
	}
});
