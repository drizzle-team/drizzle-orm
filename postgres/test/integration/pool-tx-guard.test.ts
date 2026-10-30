// txGuard + acquireTimeoutMillis (src/pool.ts).
//
// The bug guarded against: using the POOL inside its own transaction() callback. It checks out a SECOND
// connection, so the query runs OUTSIDE the transaction — and once the pool is saturated it deadlocks
// forever, because release() waits on the callback and the callback waits on release().
//
// The two faces matter separately: saturated => hang (acquireTimeoutMillis catches it); NOT saturated =>
// no hang at all, the query just silently runs on another backend and returns wrong data (only txGuard
// catches that). Hence both, and hence the false-positive tests — a guard that rejects legitimate
// concurrency would be worse than the bug.
import { test, expect, describe } from 'bun:test'
import { testPool, caught } from '../helpers/db.ts'

const TEST_TIMEOUT = 15000

describe('txGuard: the pool is banned inside its own transaction()', () => {
  test('rejects even when the pool is NOT saturated (the silent-corruption face)', async () => {
    const pool = testPool({ max: 5 }) // room for a 2nd connection: no deadlock, so only the guard can catch it
    try {
      const e = await caught(() => pool.transaction(async () => { await pool.query('select 1') }))
      expect(String((e as Error).message)).toMatch(/used INSIDE its own transaction\(\) callback/)
      expect(String((e as Error).message)).toMatch(/tx\.query/) // names the fix, not just the sin
    } finally { await pool.end() }
  }, TEST_TIMEOUT)

  test('every pool entrypoint is covered (all funnel through acquire)', async () => {
    const pool = testPool({ max: 5 })
    try {
      expect(await caught(() => pool.transaction(async () => { await pool.execute('select 1') }))).toBeTruthy()
      expect(await caught(() => pool.transaction(async () => { await pool.batch([pool.query('select 1')]) }))).toBeTruthy()
      expect(await caught(() => pool.transaction(async () => { await pool.pipeline([pool.query('select 1')]) }))).toBeTruthy()
      expect(await caught(() => pool.transaction(async () => { await pool.transaction(async () => {}) }))).toBeTruthy()
      expect(await caught(() => pool.transaction(async () => { const { release } = await pool.connect(); release() }))).toBeTruthy()
    } finally { await pool.end() }
  }, TEST_TIMEOUT)

  test('the handed-in tx still works and really is inside the transaction', async () => {
    const pool = testPool({ max: 5 })
    try {
      const seen = await pool.transaction(async (tx) => {
        await tx.query('create temp table g_marker (x int)')
        await tx.query('insert into g_marker values (1)')
        return ((await tx.query('select count(*)::int from g_marker')).rows[0] as unknown as number[])[0]
      })
      expect(seen).toBe(1)
    } finally { await pool.end() }
  }, TEST_TIMEOUT)

  test('outsideTransaction() lifts the ban (survives the lazy PoolQuery)', async () => {
    const pool = testPool({ max: 5 })
    try {
      // resolving is the assertion: a guard misfire would reject and fail the test
      const r = await pool.transaction(async () => pool.outsideTransaction(async () => (await pool.query('select 1')).rows[0] as unknown as number[]))
      expect(r[0]).toBe(1)
    } finally { await pool.end() }
  }, TEST_TIMEOUT)

  test('txGuard:false restores the unguarded behaviour', async () => {
    const pool = testPool({ max: 5, txGuard: false })
    try {
      const r = await pool.transaction(async () => (await pool.query('select 1')).rows[0] as unknown as number[])
      expect(r[0]).toBe(1)
    } finally { await pool.end() }
  }, TEST_TIMEOUT)
})

describe('txGuard does not fire on legitimate code', () => {
  test('a DIFFERENT pool inside the callback is fine (ALS is per-pool, not global)', async () => {
    const a = testPool({ max: 2 }), b = testPool({ max: 2 })
    try {
      const r = await a.transaction(async () => (await b.query('select 1')).rows[0] as unknown as number[])
      expect(r[0]).toBe(1)
    } finally { await a.end(); await b.end() }
  }, TEST_TIMEOUT)

  test('concurrent unrelated queries while a tx is open are fine (a global flag would reject these)', async () => {
    const pool = testPool({ max: 5 })
    try {
      const tx = pool.transaction(async (t) => { await new Promise((r) => setTimeout(r, 60)); await t.query('select 1') })
      const rs = await Promise.all([tx, pool.query('select 1'), pool.query('select 2')])
      expect((rs[1].rows[0] as unknown as number[])[0]).toBe(1)
    } finally { await pool.end() }
  }, TEST_TIMEOUT)

  test('a detached task that OUTLIVES the tx is fine (the ban is lifetime-scoped, not context-scoped)', async () => {
    const pool = testPool({ max: 5 })
    try {
      let escaped: Promise<number[]> | undefined
      await pool.transaction(async () => {
        escaped = (async () => { await new Promise((r) => setTimeout(r, 40)); return (await pool.query('select 1')).rows[0] as unknown as number[] })()
      })
      expect((await escaped!)[0]).toBe(1) // inherits the tx's ALS context, but it settled -> allowed
    } finally { await pool.end() }
  }, TEST_TIMEOUT)
})

describe('acquireTimeoutMillis: exhaustion fails loudly instead of hanging', () => {
  test('a saturated pool times out and the message names the likely cause', async () => {
    // txGuard off so we reach the REAL deadlock the timeout exists to catch.
    const pool = testPool({ max: 1, txGuard: false, acquireTimeoutMillis: 700 })
    try {
      const e = await caught(() => pool.transaction(async (tx) => { await tx.query('select 1'); await pool.query('select 2') }))
      expect(String((e as Error).message)).toMatch(/acquire timed out after 700ms/)
      expect(String((e as Error).message)).toMatch(/IDLE inside an open transaction/)
      expect(String((e as Error).message)).toMatch(/transaction\(\) callback/)
    } finally { await pool.end() }
  }, TEST_TIMEOUT)

  test('a slow-but-healthy queue is NOT killed: waiters still get served', async () => {
    const pool = testPool({ max: 1, acquireTimeoutMillis: 5000 })
    try {
      const rs = await Promise.all([pool.query('select 1'), pool.query('select 2'), pool.query('select 3')])
      expect(rs.map((r) => (r.rows[0] as unknown as number[])[0])).toEqual([1, 2, 3])
    } finally { await pool.end() }
  }, TEST_TIMEOUT)
})
