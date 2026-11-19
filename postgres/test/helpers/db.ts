// Shared test harness: connection/pool factories + small assertion helpers.
// Integration tests expect a running cluster from `bun run test:setup`
// (override with PGTEST_* env vars).
// ONE merged driver; DRIZZLE_POSTGRES_VARIANT selects the decode strategy (jit default, or interpreted), which
// testConnect/testPool inject as `decode`. So the query/decode suite runs against BOTH mappers of the
// same driver — `bun run test:query` (jit) and DRIZZLE_POSTGRES_VARIANT=interpreted (interpreted catalog).
import type { PGlite } from '@electric-sql/pglite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as nodeDriver from '../../src/index.ts';
import type { ConnectConfig, Pool, PoolConfig } from '../../src/index.ts';
import * as neonWsDriver from '../../src/neon-ws.ts';
import * as pgliteDriver from '../../src/pglite.ts';

export const VARIANT: 'jit' | 'interpreted' = process.env.DRIZZLE_POSTGRES_VARIANT === 'interpreted'
	? 'interpreted'
	: 'jit';

// Per-test timeout budget. Default 5s (localhost). Bump for a remote target (e.g. Neon over WAN, where
// sequential-round-trip tests need headroom) via the CLI flag, which the test scripts wire to the env:
// `DRIZZLE_POSTGRES_TEST_TIMEOUT_MS=45000 bun run test:query` -> `bun test --timeout 45000 …`. Exposed here too
// for any test that wants to size its own budget off it. (A helper-level setDefaultTimeout is unreliable:
// bun resets the default per test FILE and this module is cached, so only the first file would see it.)
export const TEST_TIMEOUT = Number(process.env.DRIZZLE_POSTGRES_TEST_TIMEOUT_MS ?? 5000);

// Optional remote target: set DRIZZLE_POSTGRES_TEST_URL to a `postgres://…` string to run the suite against a
// remote database instead of the local cluster (`bun run test:setup`). DRIZZLE_POSTGRES_TEST_TRANSPORT=neon-ws
// additionally routes every connection through the Neon WebSocket proxy (src/neon-ws.ts) — the same
// portable protocol/decode tests then double as a parity check for that transport. Default (no env):
// unchanged — the local cluster over the node net/tls transport.
const REMOTE_URL = process.env.DRIZZLE_POSTGRES_TEST_URL;
/** True when the suite targets a REMOTE database (DRIZZLE_POSTGRES_TEST_URL) rather than the local `test:setup`
 *  cluster. Use `test.skipIf(REMOTE)` for tests that depend on local-cluster semantics a managed provider
 *  (e.g. Neon) doesn't offer: the known fixture password, or `pg_terminate_backend(backendKey.pid)` (Neon
 *  virtualizes the reported backend pid, so external termination by that pid is a no-op). */
export const REMOTE = !!REMOTE_URL;
const driver = process.env.DRIZZLE_POSTGRES_TEST_TRANSPORT === 'neon-ws' ? neonWsDriver : nodeDriver;
const connect = driver.connect;
const createPool = driver.createPool;
export type PgError = nodeDriver.PgError;
export const PgError = nodeDriver.PgError;

/** The database `test:setup` (or `bash compose/dockers.sh up postgres`) seeds. */
export const BASE_DATABASE = process.env.PGTEST_DB ?? 'testdb';
/** The worker of `bun test --parallel=N` this file runs in, or undefined in a serial run. */
export const WORKER_ID = process.env.BUN_TEST_WORKER_ID;
/** The database this file's tests use: in a parallel run one per worker, which test/helpers/worker-db.ts creates
 *  and seeds as BASE_DATABASE is seeded, so files in different workers don't see each other's tables. */
export const TEST_DATABASE = WORKER_ID === undefined ? BASE_DATABASE : `${BASE_DATABASE}_w${WORKER_ID}`;

/** The local cluster's settings, for tests that only run against it */
export const LOCAL_CONFIG = {
	host: process.env.PGTEST_HOST ?? '127.0.0.1',
	port: Number(process.env.PGTEST_PORT ?? 54329),
	user: process.env.PGTEST_USER ?? 'postgres',
	password: process.env.PGTEST_PASSWORD ?? 'postgres',
	database: TEST_DATABASE,
};

export const TEST_CONFIG: ConnectConfig = REMOTE_URL ? { url: REMOTE_URL } : LOCAL_CONFIG;

// bun test can be invoked from any directory, so the cert fixture path must derive from the
// module rather than the CWD or a hardcoded literal — matches how test/setup-pg.sh resolves
// PGDATA. Shared here so tls-ssl.test.ts and security.test.ts can't drift with two copies.
export const SERVER_CA_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '.pgdata', 'server.crt');

/** True when the suite runs on an in-process PGlite (DRIZZLE_POSTGRES_TEST_TRANSPORT=pglite) instead of a server. A
 *  PGlite is one session: tests that need a second one, TLS, authentication or a server-side cancel skip themselves
 *  with `skipIf(PGLITE)`. */
export const PGLITE = process.env.DRIZZLE_POSTGRES_TEST_TRANSPORT === 'pglite';

/** The PGlite databases of a test file in a PGlite run, which test/helpers/worker-db.ts creates before the file runs.
 *  `own` is the file's database, seeded as a server's test database is. A PGlite runs one session, so a connection
 *  opened while `own` is in use gets one of `spares` instead: a separate database, as a second session on a server
 *  sees only what is committed, cloned from the seeded state when the file started. */
export interface TestPGlites {
	own: PGlite;
	ownInUse: boolean;
	spares: PGlite[];
	/** Clones another spare from the seeded state, in the background */
	refill(): void;
	/** A new clone of the seeded state */
	clone(): Promise<PGlite>;
}

const testPGlites = (): TestPGlites => {
	const pglites = (globalThis as { drizzleTestPGlites?: TestPGlites }).drizzleTestPGlites;
	if (pglites === undefined) {
		throw new Error(
			'No PGlite for this file: test/helpers/worker-db.ts creates them when DRIZZLE_POSTGRES_TEST_TRANSPORT=pglite',
		);
	}
	return pglites;
};

/** A PGlite for one connection or pool: the file's own while it is free, else a spare. Give it back with the returned
 *  function when the connection or pool has ended. */
export const borrowPGlite = (): [pg: PGlite, giveBack: () => void] => {
	const pglites = testPGlites();
	if (!pglites.ownInUse) {
		pglites.ownInUse = true;
		return [pglites.own, () => (pglites.ownInUse = false)];
	}
	const spare = pglites.spares.pop();
	if (spare === undefined) {
		throw new Error('All PGlite spares of this file are in use: raise SPARES in test/helpers/worker-db.ts');
	}
	pglites.refill();
	return [spare, () => void spare.close()];
};

// What names a server: a PGlite has none, and its pool has one connection.
const SERVER_ONLY = ['url', 'host', 'port', 'path', 'user', 'password', 'database', 'ssl', 'max'];
const forPGlite = (o: object) => Object.fromEntries(Object.entries(o).filter(([key]) => !SERVER_ONLY.includes(key)));

/** Calls `giveBack` once `end` has finished. */
const givingBack = <T extends { end(): Promise<void> }>(target: T, giveBack: () => void): T => {
	const end = target.end.bind(target);
	let given = false;
	target.end = async () => {
		try {
			await end();
		} finally {
			if (!given) {
				given = true;
				giveBack();
			}
		}
	};
	return target;
};

async function pgliteConnect(o: object) {
	const pglites = testPGlites();
	// a connection can wait for a clone when no spare is ready; a pool (testPool) can't
	const [pg, giveBack] = !pglites.ownInUse || pglites.spares.length > 0
		? borrowPGlite()
		: await pglites.clone().then((clone): [PGlite, () => void] => [clone, () => void clone.close()]);
	try {
		return givingBack(await pgliteDriver.connect(pg, forPGlite({ decode: VARIANT, ...o })), giveBack);
	} catch (e) {
		giveBack();
		throw e;
	}
}

export const testConnect = (o: Partial<ConnectConfig> = {}): ReturnType<typeof connect> =>
	PGLITE
		? pgliteConnect(o) as unknown as ReturnType<typeof connect>
		: connect({ ...TEST_CONFIG, decode: VARIANT, ...o });
export const testPool = (o: Partial<PoolConfig> = {}): Pool => {
	if (!PGLITE) return createPool({ ...TEST_CONFIG, decode: VARIANT, ...o });
	const [pg, giveBack] = borrowPGlite();
	return givingBack(pgliteDriver.createPool(pg, forPGlite({ decode: VARIANT, ...o })), giveBack);
};

/** A connection checked out of its own pool, so it can cancel queries. `end()` also ends the pool. */
export const testPooledConnect = (o: Partial<PoolConfig> = {}) => acquireFromOwnPool(testPool({ max: 1, ...o }));

/** Checks a connection out of `pool`, which nothing else uses. `end()` also ends the pool. */
export async function acquireFromOwnPool(pool: Pool) {
	const conn = await pool.acquire();
	const endConnection = conn.end.bind(conn);
	return Object.assign(conn, {
		end: async () => {
			await endConnection();
			await pool.end();
		},
	});
}

/** Run `fn` with a fresh connection that is always ended afterwards. */
export async function withConn<T>(
	fn: (c: Awaited<ReturnType<typeof connect>>) => Promise<T>,
	o: Partial<ConnectConfig> = {},
): Promise<T> {
	const c = await testConnect(o);
	try {
		return await fn(c);
	} finally {
		await c.end();
	}
}

/** Run `fn` with a fresh pooled connection that is always ended afterwards, with its pool. */
export async function withPooledConn<T>(
	fn: (c: Awaited<ReturnType<typeof testPooledConnect>>) => Promise<T>,
	o: Partial<PoolConfig> = {},
): Promise<T> {
	const c = await testPooledConnect(o);
	try {
		return await fn(c);
	} finally {
		await c.end();
	}
}

/** Capture a rejection; throws if the operation unexpectedly resolves. Accepts any thenable/value
 *  (e.g. a lazy PoolQuery, which `await` forces to run), not just a Promise. */
export async function caught(fn: () => unknown): Promise<unknown> {
	try {
		await fn();
	} catch (e) {
		return e;
	}
	throw new Error('expected the operation to reject, but it resolved');
}
