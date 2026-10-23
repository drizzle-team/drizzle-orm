// Transactions domain: raw BEGIN/COMMIT/ROLLBACK/SAVEPOINT driven through query()
// on a dedicated connection. Grounded in the ACTUAL driver: connection.ts tracks the
// ReadyForQuery tx-status byte (txStatus I/T/E + inTransaction getter), and pool.ts
// ROLLs BACK an open/failed transaction on release (no tx-state leak). Non-transactional
// SET GUCs are NOT reset on release and therefore DO leak across pooled checkouts.
//
// Isolation: single-connection tests use connection-scoped TEMP tables; cross-connection
// visibility/locking tests use a uniquely-prefixed regular table (created/dropped here),
// treated as private to this suite. public.t is never mutated.
import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { testConnect, testPool, caught, PgError } from '../helpers/db.ts'
import type { Connection } from '../../src/index.ts'

const SUF = Math.random().toString(36).slice(2, 8)
const T = `tx_xact_${SUF}` // shared, suite-private regular table for cross-connection tests

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const code = (e: unknown) => (e as PgError).code
const cell0 = (r: { rows: unknown[] }) => (r.rows[0] as unknown[])[0]
const objRow = (r: { rows: unknown[] }) => r.rows[0] as Record<string, unknown>

let setup: Connection
beforeAll(async () => {
  setup = await testConnect()
  await setup.query(`drop table if exists ${T}`)
  await setup.query(`create table ${T} (id serial primary key, v int)`)
})
afterAll(async () => {
  await setup.query(`drop table if exists ${T}`)
  await setup.end()
})

// ---------------------------------------------------------------------------
describe('happy-path transaction lifecycle (single dedicated connection)', () => {
  test('BEGIN/INSERT/COMMIT persists; inTransaction & txStatus track I->T->I', async () => {
    const c = await testConnect()
    try {
      await c.query('create temp table tx_life (v int)')
      expect(c.inTransaction).toBe(false)
      expect(c.txStatus).toBe('I')
      await c.query('begin')
      expect(c.inTransaction).toBe(true)
      expect(c.txStatus).toBe('T')
      await c.query('insert into tx_life(v) values ($1)', [42])
      await c.query('commit')
      expect(c.inTransaction).toBe(false)
      expect(c.txStatus).toBe('I')
      const r = await c.query('select v from tx_life')
      expect(r.rows.length).toBe(1)
      expect(cell0(r)).toBe(42)
    } finally { await c.end() }
  })

  test('BEGIN/INSERT/ROLLBACK undoes the work', async () => {
    const c = await testConnect()
    try {
      await c.query('create temp table tx_rb (v int)')
      await c.query('begin')
      await c.query('insert into tx_rb(v) values (7)')
      await c.query('rollback')
      expect(c.inTransaction).toBe(false)
      const r = await c.query('select count(*)::int as n from tx_rb', [], { mode: 'object' })
      expect(objRow(r).n).toBe(0)
    } finally { await c.end() }
  })

  test('control statements return their verb as command, rowCount null, empty rows', async () => {
    const c = await testConnect()
    try {
      const begin = await c.query('begin')
      expect(begin.command).toBe('BEGIN')
      expect(begin.rowCount).toBeNull()
      expect(begin.rows).toEqual([])
      expect(begin.columns).toEqual([])

      const sp = await c.query('savepoint s')
      expect(sp.command).toBe('SAVEPOINT')
      expect(sp.rowCount).toBeNull()

      const rb = await c.query('rollback')
      expect(rb.command).toBe('ROLLBACK')

      await c.query('begin')
      const commit = await c.query('commit')
      expect(commit.command).toBe('COMMIT')
      expect(commit.rowCount).toBeNull()
    } finally { await c.end() }
  })

  test('after ROLLBACK a fresh BEGIN starts a clean, usable transaction (no lingering 25P02)', async () => {
    const c = await testConnect()
    try {
      await c.query('begin')
      await c.query('rollback')
      await c.query('begin')
      const r = await c.query('select 1 as x', [], { mode: 'object' })
      expect(objRow(r).x).toBe(1)
      await c.query('commit')
    } finally { await c.end() }
  })

  test('BEGIN/INSERT/UPDATE/DELETE/COMMIT commits atomically', async () => {
    const c = await testConnect()
    try {
      await c.query('create temp table tx_crud (id int primary key, v int)')
      await c.query('begin')
      await c.query('insert into tx_crud values (1,10),(2,20),(3,30)')
      await c.query('update tx_crud set v = v + 1 where id = 1')
      await c.query('delete from tx_crud where id = 3')
      await c.query('commit')
      const r = await c.query('select id, v from tx_crud order by id', [], { mode: 'object' })
      expect(r.rows.length).toBe(2)
      expect(objRow(r)).toEqual({ id: 1, v: 11 })
    } finally { await c.end() }
  })

  test('empty transaction BEGIN; COMMIT succeeds and leaves connection ready', async () => {
    const c = await testConnect()
    try {
      await c.query('begin')
      await c.query('commit')
      expect(c.inTransaction).toBe(false)
      const r = await c.query('select 99 as x')
      expect(cell0(r)).toBe(99)
    } finally { await c.end() }
  })
})

// ---------------------------------------------------------------------------
describe('aborted-transaction state (25P02)', () => {
  test('error inside txn poisons it: COMMIT of an aborted txn behaves as ROLLBACK (nothing persists)', async () => {
    const c = await testConnect()
    try {
      await c.query('create temp table tx_abort (v int)')
      await c.query('begin')
      await c.query('insert into tx_abort(v) values (1)')
      const err = await caught(() => c.query('select 1/0'))
      expect(err).toBeInstanceOf(PgError)
      expect(code(err)).toBe('22012') // division_by_zero
      expect(c.txStatus).toBe('E')
      const commit = await c.query('commit')
      expect(commit.command).toBe('ROLLBACK') // PG reports aborted COMMIT as ROLLBACK
      const r = await c.query('select count(*)::int as n from tx_abort', [], { mode: 'object' })
      expect(objRow(r).n).toBe(0)
    } finally { await c.end() }
  })

  test('after a mid-txn error every subsequent query rejects with 25P02 until ROLLBACK', async () => {
    const c = await testConnect()
    try {
      await c.query('begin')
      await caught(() => c.query('select 1/0'))
      const e1 = await caught(() => c.query('select 1'))
      expect(code(e1)).toBe('25P02') // in_failed_sql_transaction
      const rb = await c.query('rollback')
      expect(rb.command).toBe('ROLLBACK')
      const ok = await c.query('select 1 as x', [], { mode: 'object' })
      expect(objRow(ok).x).toBe(1)
    } finally { await c.end() }
  })

  test('failing statement rejects promptly (no hang) and the connection drains its queue', async () => {
    const c = await testConnect()
    try {
      await c.query('begin')
      // enqueue synchronously: a failing statement followed by two valid SELECTs
      const fail = caught(() => c.query('select 1/0'))
      const q1 = caught(() => c.query('select 1'))
      const q2 = caught(() => c.query('select 2'))
      expect(code(await fail)).toBe('22012')
      // minipg has no client-side abort short-circuit: queued statements ARE sent and
      // each rejects with 25P02 (documents actual behavior vs node-postgres#323).
      expect(code(await q1)).toBe('25P02')
      expect(code(await q2)).toBe('25P02')
      await c.query('rollback')
      const ok = await c.query('select 1 as x')
      expect(cell0(ok)).toBe(1)
    } finally { await c.end() }
  })

  test('a duplicate-key error mid-txn leaves the connection recoverable via ROLLBACK', async () => {
    const c = await testConnect()
    try {
      await c.query('create temp table tx_uniq (id int primary key)')
      await c.query('begin')
      await c.query('insert into tx_uniq values (1)')
      const err = await caught(() => c.query('insert into tx_uniq values (1)'))
      expect(code(err)).toBe('23505') // unique_violation
      expect(c.inTransaction).toBe(true) // still in (failed) tx
      await c.query('rollback')
      const ok = await c.query('select 1 as x')
      expect(cell0(ok)).toBe(1)
    } finally { await c.end() }
  })
})

// ---------------------------------------------------------------------------
describe('connection isolation under concurrency (cross-connection)', () => {
  test('read-committed: uncommitted INSERT is invisible to another connection until COMMIT', async () => {
    await setup.query(`delete from ${T}`)
    const a = await testConnect()
    const b = await testConnect()
    try {
      await a.query('begin')
      await a.query(`insert into ${T}(v) values (111)`)
      const before = await b.query(`select count(*)::int as n from ${T}`, [], { mode: 'object' })
      expect(objRow(before).n).toBe(0) // B cannot see A's uncommitted row
      await a.query('commit')
      const after = await b.query(`select count(*)::int as n from ${T}`, [], { mode: 'object' })
      expect(objRow(after).n).toBe(1)
    } finally { await a.end(); await b.end() }
  })

  test('two concurrent dedicated transactions keep their own statements (no boundary crossing)', async () => {
    await setup.query(`delete from ${T}`)
    const a = await testConnect()
    const b = await testConnect()
    try {
      await a.query('begin'); await b.query('begin')
      await a.query(`insert into ${T}(v) values (1001)`)
      await b.query(`insert into ${T}(v) values (2002)`)
      await a.query('commit')
      await b.query('rollback') // B's row discarded; A's survives
      const r = await setup.query(`select v from ${T} order by v`, [], { mode: 'object' })
      expect(r.rows.map((row) => (row as Record<string, unknown>).v)).toEqual([1001])
    } finally { await a.end(); await b.end() }
  })

  test('chaos: client.end() mid-txn lets the server roll the transaction back', async () => {
    await setup.query(`delete from ${T}`)
    const a = await testConnect()
    try {
      await a.query('begin')
      await a.query(`insert into ${T}(v) values (777)`)
      await a.end() // socket closed without COMMIT -> server rolls back
    } finally { /* a already ended */ }
    const seen = await setup.query(`select count(*)::int as n from ${T}`, [], { mode: 'object' })
    expect(objRow(seen).n).toBe(0)
  })

  test('many rapid pool.connect()+txn+release cycles all commit without corruption', async () => {
    await setup.query(`delete from ${T}`)
    const pool = testPool({ max: 3 })
    try {
      const cycles = 20
      await Promise.all(
        Array.from({ length: cycles }, async (_unused, i) => {
          const { client, release } = await pool.connect()
          try {
            await client.query('begin')
            await client.query(`insert into ${T}(v) values ($1)`, [3000 + i])
            await client.query('commit')
          } finally { release() }
        }),
      )
      const r = await pool.query(`select count(*)::int as n from ${T}`, [], { mode: 'object' })
      expect((r.rows[0] as unknown as Record<string, unknown>).n).toBe(cycles)
    } finally { await pool.end() }
  })
})

// ---------------------------------------------------------------------------
describe('savepoints & nesting', () => {
  test('ROLLBACK TO SAVEPOINT undoes post-savepoint work, keeps pre-savepoint work', async () => {
    const c = await testConnect()
    try {
      await c.query('create temp table tx_sp (v int)')
      await c.query('begin')
      await c.query('insert into tx_sp(v) values (1)') // a
      await c.query('savepoint s')
      await c.query('insert into tx_sp(v) values (2)') // b
      await c.query('rollback to savepoint s')
      await c.query('commit')
      const r = await c.query('select v from tx_sp order by v', [], { mode: 'object' })
      expect(r.rows.map((row) => (row as Record<string, unknown>).v)).toEqual([1])
    } finally { await c.end() }
  })

  test('ROLLBACK TO SAVEPOINT clears an in-savepoint error; the txn continues and commits', async () => {
    const c = await testConnect()
    try {
      await c.query('create temp table tx_sperr (v int)')
      await c.query('begin')
      await c.query('insert into tx_sperr(v) values (1)')
      await c.query('savepoint s')
      await caught(() => c.query('select 1/0')) // aborts to the savepoint
      expect(c.txStatus).toBe('E')
      await c.query('rollback to savepoint s') // recover
      const ok = await c.query('insert into tx_sperr(v) values (2)')
      expect(ok.command).toBe('INSERT')
      await c.query('commit')
      const r = await c.query('select v from tx_sperr order by v', [], { mode: 'object' })
      expect(r.rows.map((row) => (row as Record<string, unknown>).v)).toEqual([1, 2])
    } finally { await c.end() }
  })

  test('SAVEPOINT / RELEASE / nested savepoints all run on one retained client', async () => {
    const c = await testConnect()
    try {
      await c.query('create temp table tx_spn (v int)')
      await c.query('begin')
      await c.query('savepoint outer_sp')
      await c.query('insert into tx_spn(v) values (1)')
      await c.query('savepoint inner_sp')
      await c.query('insert into tx_spn(v) values (2)')
      await c.query('release savepoint inner_sp')
      const rel = await c.query('release savepoint outer_sp')
      expect(rel.command).toBe('RELEASE')
      await c.query('commit')
      const r = await c.query('select count(*)::int as n from tx_spn', [], { mode: 'object' })
      expect(objRow(r).n).toBe(2)
    } finally { await c.end() }
  })

  test('the same savepoint name is reusable across two sequential transactions', async () => {
    const c = await testConnect()
    try {
      await c.query('begin'); await c.query('savepoint s'); await c.query('commit')
      await c.query('begin'); await c.query('savepoint s'); await c.query('commit')
      expect(c.inTransaction).toBe(false)
    } finally { await c.end() }
  })

  test('ROLLBACK TO a nonexistent savepoint rejects 3B001 and leaves an aborted, recoverable txn', async () => {
    const c = await testConnect()
    try {
      await c.query('begin')
      const err = await caught(() => c.query('rollback to savepoint nope'))
      expect(code(err)).toBe('3B001') // invalid_savepoint_specification
      expect(c.txStatus).toBe('E')
      await c.query('rollback')
      const ok = await c.query('select 1 as x')
      expect(cell0(ok)).toBe(1)
    } finally { await c.end() }
  })
})

// ---------------------------------------------------------------------------
describe('isolation levels, serialization & deadlocks', () => {
  test('SERIALIZABLE write-skew: the loser COMMIT rejects with 40001', async () => {
    await setup.query(`delete from ${T}`)
    await setup.query(`insert into ${T}(id, v) values (1, 10), (2, 20)`)
    const a = await testConnect()
    const b = await testConnect()
    try {
      await a.query('begin isolation level serializable')
      await b.query('begin isolation level serializable')
      await a.query(`select sum(v) from ${T}`)
      await b.query(`select sum(v) from ${T}`)
      await a.query(`insert into ${T}(id, v) values (3, 1)`)
      await b.query(`insert into ${T}(id, v) values (4, 1)`)
      await a.query('commit') // first committer wins
      const err = await caught(() => b.query('commit')) // second sees the conflict
      expect(err).toBeInstanceOf(PgError)
      expect(code(err)).toBe('40001') // serialization_failure
    } finally { await a.end(); await b.end() }
  })

  test('deadlock: two cross-locking transactions -> one statement rejects 40P01, the other proceeds', async () => {
    await setup.query(`delete from ${T}`)
    await setup.query(`insert into ${T}(id, v) values (1, 0), (2, 0)`)
    const a = await testConnect()
    const b = await testConnect()
    try {
      await a.query("set deadlock_timeout = '60ms'")
      await b.query("set deadlock_timeout = '60ms'")
      await a.query('begin'); await b.query('begin')
      await a.query(`update ${T} set v = v + 1 where id = 1`)
      await b.query(`update ${T} set v = v + 1 where id = 2`)
      // now cross-lock: each waits on the other's row -> deadlock detected
      const pa = a.query(`update ${T} set v = v + 1 where id = 2`)
      const pb = b.query(`update ${T} set v = v + 1 where id = 1`)
      const results = await Promise.allSettled([pa, pb])
      const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]
      expect(rejected.length).toBe(1) // exactly one victim
      expect(code(rejected[0]!.reason)).toBe('40P01') // deadlock_detected
      await a.query('rollback').catch(() => {})
      await b.query('rollback').catch(() => {})
    } finally { await a.end(); await b.end() }
  }, 15000)

  test('LOCK TABLE blocks a conflicting reader until the holder commits (no early return)', async () => {
    await setup.query(`delete from ${T}`)
    await setup.query(`insert into ${T}(id, v) values (1, 5)`)
    const a = await testConnect()
    const b = await testConnect()
    try {
      await a.query('begin')
      await a.query(`lock table ${T} in access exclusive mode`)
      const bSelect = b.query(`select v from ${T} where id = 1`) // needs ACCESS SHARE -> blocks
      const race = await Promise.race([bSelect.then(() => 'resolved'), delay(250).then(() => 'pending')])
      expect(race).toBe('pending') // still blocked while A holds the lock
      await a.query('commit') // release the lock
      const r = await bSelect // now resolves
      expect(cell0(r)).toBe(5)
    } finally { await a.end(); await b.end() }
  }, 15000)

  test('deferred FK constraint: violating INSERT defers; COMMIT rejects with the constraint error', async () => {
    const c = await testConnect()
    try {
      await c.query('create temp table tx_par (id int primary key)')
      await c.query('create temp table tx_chi (id int, pid int references tx_par(id) deferrable initially deferred)')
      await c.query('insert into tx_par values (1)')
      await c.query('begin')
      const ins = await c.query('insert into tx_chi values (1, 999)') // bad fk, but deferred
      expect(ins.command).toBe('INSERT') // succeeds at statement time
      const err = await caught(() => c.query('commit'))
      expect(code(err)).toBe('23503') // foreign_key_violation surfaced at COMMIT
      const ok = await c.query('select 1 as x') // connection recovered
      expect(cell0(ok)).toBe(1)
    } finally { await c.end() }
  })
})

// ---------------------------------------------------------------------------
describe('autocommit & implicit-transaction semantics', () => {
  test('pool.query inserts without an explicit BEGIN each autocommit independently', async () => {
    await setup.query(`delete from ${T}`)
    const pool = testPool({ max: 2 })
    try {
      for (let i = 0; i < 5; i++) await pool.query(`insert into ${T}(v) values ($1)`, [9000 + i])
      const r = await pool.query(`select count(*)::int as n from ${T}`, [], { mode: 'object' })
      expect((r.rows[0] as unknown as Record<string, unknown>).n).toBe(5)
    } finally { await pool.end() }
  })

  test('DECLARE CURSOR requires an explicit transaction block (autocommit rejects 25P01)', async () => {
    const c = await testConnect()
    try {
      // without BEGIN: each statement autocommits, so a cursor cannot survive
      const err = await caught(() => c.query('declare tx_cur cursor for select 1'))
      expect(code(err)).toBe('25P01') // no_active_sql_transaction
      // inside an explicit txn the cursor lives across query() calls
      await c.query('begin')
      await c.query('declare tx_cur2 cursor for select generate_series(1, 3) as g')
      const f = await c.query('fetch all from tx_cur2', [], { mode: 'object' })
      expect(f.rows.length).toBe(3)
      await c.query('commit')
    } finally { await c.end() }
  })

  test('GUARD: semicolon-joined multi-statement strings reject (extended-protocol only)', async () => {
    const c = await testConnect()
    try {
      const err = await caught(() => c.query('select 1; select 2'))
      expect(err).toBeInstanceOf(PgError)
      expect(code(err)).toBe('42601') // cannot insert multiple commands into a prepared statement
      const ok = await c.query('select 1 as x') // connection unaffected
      expect(cell0(ok)).toBe(1)
    } finally { await c.end() }
  })

  test.todo('simple-query protocol (mode:"simple") enabling one-round-trip BEGIN; ...; COMMIT [roadmap]', () => {})
})

// ---------------------------------------------------------------------------
describe('commit visibility & failure surfacing', () => {
  test('after COMMIT resolves, same client and a different connection both see the rows', async () => {
    await setup.query(`delete from ${T}`)
    const a = await testConnect()
    try {
      await a.query('begin')
      await a.query(`insert into ${T}(v) values (555)`)
      await a.query('commit')
      const onSame = await a.query(`select v from ${T} where v = 555`)
      expect(cell0(onSame)).toBe(555)
      const onOther = await setup.query(`select v from ${T} where v = 555`)
      expect(cell0(onOther)).toBe(555)
    } finally { await a.end() }
  })

  test('a failing COMMIT is a normal rejection and the connection returns to ready', async () => {
    const c = await testConnect()
    try {
      await c.query('create temp table tx_cpar (id int primary key)')
      await c.query('create temp table tx_cchi (pid int references tx_cpar(id) deferrable initially deferred)')
      await c.query('begin')
      await c.query('insert into tx_cchi values (404)')
      const err = await caught(() => c.query('commit'))
      expect(err).toBeInstanceOf(PgError) // rejected, not unhandled
      expect(c.inTransaction).toBe(false) // back to ready (txStatus I)
      const ok = await c.query('select 1 as x')
      expect(cell0(ok)).toBe(1)
    } finally { await c.end() }
  })
})

// ---------------------------------------------------------------------------
describe('connection-reuse safety & tx-status tracking', () => {
  test('release() after COMMIT returns a clean connection that the next checkout reuses', async () => {
    const pool = testPool({ max: 1 })
    try {
      const h1 = await pool.connect()
      await h1.client.query('begin')
      await h1.client.query('select 1')
      await h1.client.query('commit')
      h1.release() // clean (txStatus I) — plain checkin

      const h2 = await pool.connect() // same physical connection
      expect(h2.client.inTransaction).toBe(false)
      const r = await h2.client.query('select 2 as x', [], { mode: 'object' })
      expect(objRow(r).x).toBe(2)
      h2.release()
    } finally { await pool.end() }
  })

  test('txStatus reflects I outside a txn, T after BEGIN, E after an in-txn error', async () => {
    const c = await testConnect()
    try {
      expect(c.txStatus).toBe('I')
      await c.query('begin')
      expect(c.txStatus).toBe('T')
      await caught(() => c.query('select 1/0'))
      expect(c.txStatus).toBe('E')
      await c.query('rollback')
      expect(c.txStatus).toBe('I')
    } finally { await c.end() }
  })
})

// ---------------------------------------------------------------------------
describe('session / SET state across pool checkouts (GUC behavior)', () => {
  test('SET TRANSACTION READ ONLY makes a subsequent write reject 25006', async () => {
    const c = await testConnect()
    try {
      // NB: temp tables are exempt from read-only txns, so target a regular table; the
      // write is rejected (25006) so nothing is actually mutated.
      await c.query('set session characteristics as transaction read only')
      const err = await caught(() => c.query(`insert into ${T}(v) values (-1)`))
      expect(code(err)).toBe('25006') // read_only_sql_transaction
      await c.query('set session characteristics as transaction read write') // restore (own conn)
      const ok = await c.query('select 1 as x')
      expect(cell0(ok)).toBe(1)
    } finally { await c.end() }
  })

  test('SET ROLE applies to subsequent statements on the checked-out connection', async () => {
    const c = await testConnect()
    try {
      await c.query('set role md5user')
      const who = await c.query('select current_user as u', [], { mode: 'object' })
      expect(objRow(who).u).toBe('md5user')
      await c.query('reset role')
      const back = await c.query('select current_user as u', [], { mode: 'object' })
      expect(objRow(back).u).toBe('postgres')
    } finally { await c.end() }
  })

  test('GUC LEAK: a non-transactional SET search_path survives release and the next checkout', async () => {
    const pool = testPool({ max: 1 })
    try {
      const h1 = await pool.connect()
      await h1.client.query('set search_path to pg_catalog, public')
      h1.release() // not in a txn -> no ROLLBACK/reset; the GUC stays set

      const h2 = await pool.connect() // same physical connection
      const r = await h2.client.query('show search_path', [], { mode: 'object' })
      expect(String(objRow(r).search_path)).toContain('pg_catalog') // leaked (minipg does not DISCARD)
      h2.release()
    } finally { await pool.end() }
  })

  test('SET LOCAL reverts automatically at COMMIT and does NOT leak', async () => {
    const c = await testConnect()
    try {
      const base = String(objRow(await c.query('show search_path', [], { mode: 'object' })).search_path)
      await c.query('begin')
      await c.query('set local search_path to pg_catalog')
      const during = String(objRow(await c.query('show search_path', [], { mode: 'object' })).search_path)
      expect(during).toContain('pg_catalog')
      await c.query('commit')
      const after = String(objRow(await c.query('show search_path', [], { mode: 'object' })).search_path)
      expect(after).toBe(base) // reverted, no leak
    } finally { await c.end() }
  })

  test.todo('pooled DISCARD ALL on release resets GUCs/temp tables/prepared statements [roadmap]', () => {})
})

// ---------------------------------------------------------------------------
describe('begin()/transaction helper sugar', () => {
  test('public surface exposes begin()/transaction() on pool + connection (template-tag sql still absent)', async () => {
    const pool = testPool({ max: 1 })
    const c = await testConnect()
    try {
      // COMMIT/ROLLBACK/return-value/nesting/isolation/pipelining behaviour is covered in transaction-api.test.ts.
      expect(typeof (pool as unknown as Record<string, unknown>).begin).toBe('function')
      expect(typeof (pool as unknown as Record<string, unknown>).transaction).toBe('function')
      expect(typeof (c as unknown as Record<string, unknown>).begin).toBe('function')
      expect(typeof (c as unknown as Record<string, unknown>).transaction).toBe('function')
      expect((c as unknown as Record<string, unknown>).sql).toBeUndefined() // no template-tag API
    } finally { await c.end(); await pool.end() }
  })

  test.todo('graceful rollback sentinel rolls back without throwing and keeps the connection usable', () => {})
})

// ---------------------------------------------------------------------------
describe('out-of-scope two-phase commit', () => {
  test.todo('PREPARE TRANSACTION / COMMIT PREPARED run as plain statements (no helper, env-dependent)', () => {})
})
