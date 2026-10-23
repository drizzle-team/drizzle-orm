// Shared test harness: connection/pool factories + small assertion helpers.
// Integration tests expect a running cluster from `bun run test:setup`
// (override with PGTEST_* env vars).
// ONE merged driver; MINIPG_VARIANT selects the decode strategy (jit default, or interpreted), which
// testConnect/testPool inject as `decode`. So the query/decode suite runs against BOTH mappers of the
// same driver — `bun run test:query` (jit) and MINIPG_VARIANT=interpreted (interpreted catalog).
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as nodeDriver from '../../src/index.ts'
import * as neonWsDriver from '../../src/neon-ws.ts'
import type { ConnectConfig, PoolConfig } from '../../src/index.ts'

export const VARIANT: 'jit' | 'interpreted' = process.env.MINIPG_VARIANT === 'interpreted' ? 'interpreted' : 'jit'

// Per-test timeout budget. Default 5s (localhost). Bump for a remote target (e.g. Neon over WAN, where
// sequential-round-trip tests need headroom) via the CLI flag, which the test scripts wire to the env:
// `MINIPG_TEST_TIMEOUT_MS=45000 bun run test:query` -> `bun test --timeout 45000 …`. Exposed here too
// for any test that wants to size its own budget off it. (A helper-level setDefaultTimeout is unreliable:
// bun resets the default per test FILE and this module is cached, so only the first file would see it.)
export const TEST_TIMEOUT = Number(process.env.MINIPG_TEST_TIMEOUT_MS ?? 5000)

// Optional remote target: set MINIPG_TEST_URL to a `postgres://…` string to run the suite against a
// remote database instead of the local cluster (`bun run test:setup`). MINIPG_TEST_TRANSPORT=neon-ws
// additionally routes every connection through the Neon WebSocket proxy (src/neon-ws.ts) — the same
// portable protocol/decode tests then double as a parity check for that transport. Default (no env):
// unchanged — the local cluster over the node net/tls transport.
const REMOTE_URL = process.env.MINIPG_TEST_URL
/** True when the suite targets a REMOTE database (MINIPG_TEST_URL) rather than the local `test:setup`
 *  cluster. Use `test.skipIf(REMOTE)` for tests that depend on local-cluster semantics a managed provider
 *  (e.g. Neon) doesn't offer: the known fixture password, or `pg_terminate_backend(backendKey.pid)` (Neon
 *  virtualizes the reported backend pid, so external termination by that pid is a no-op). */
export const REMOTE = !!REMOTE_URL
const driver = process.env.MINIPG_TEST_TRANSPORT === 'neon-ws' ? neonWsDriver : nodeDriver
const connect = driver.connect
const createPool = driver.createPool
export type PgError = nodeDriver.PgError
export const PgError = nodeDriver.PgError

export const TEST_CONFIG: ConnectConfig = REMOTE_URL
  ? { url: REMOTE_URL }
  : {
      host: process.env.PGTEST_HOST ?? '127.0.0.1',
      port: Number(process.env.PGTEST_PORT ?? 54329),
      user: process.env.PGTEST_USER ?? 'postgres',
      password: process.env.PGTEST_PASSWORD ?? 'postgres',
      database: process.env.PGTEST_DB ?? 'testdb',
    }

// bun test can be invoked from any directory, so the cert fixture path must derive from the
// module rather than the CWD or a hardcoded literal — matches how test/setup-pg.sh resolves
// PGDATA. Shared here so tls-ssl.test.ts and security.test.ts can't drift with two copies.
export const SERVER_CA_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '.pgdata', 'server.crt')

export const testConnect = (o: Partial<ConnectConfig> = {}) => connect({ ...TEST_CONFIG, decode: VARIANT, ...o })
export const testPool = (o: Partial<PoolConfig> = {}) => createPool({ ...TEST_CONFIG, decode: VARIANT, ...o })

/** Run `fn` with a fresh connection that is always ended afterwards. */
export async function withConn<T>(fn: (c: Awaited<ReturnType<typeof connect>>) => Promise<T>, o: Partial<ConnectConfig> = {}): Promise<T> {
  const c = await testConnect(o)
  try { return await fn(c) } finally { await c.end() }
}

/** Capture a rejection; throws if the operation unexpectedly resolves. Accepts any thenable/value
 *  (e.g. a lazy PoolQuery, which `await` forces to run), not just a Promise. */
export async function caught(fn: () => unknown): Promise<unknown> {
  try { await fn() } catch (e) { return e }
  throw new Error('expected the operation to reject, but it resolved')
}
