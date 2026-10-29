// Domain: "pool lazy query API" — pool.query() is a lazy thenable, pool.execute() is eager, and
// pool.batch() runs a set pipelined (one connection) or concurrently (fan-out). Read-only SELECTs.
import { test, expect, describe } from 'bun:test'
import { testPool, caught, PgError } from '../../helpers/db.ts'

const cell = (r: { rows: unknown[] }, k: string) => (r.rows[0] as Record<string, unknown>)[k]

describe('pool.query is lazy; pool.execute is eager', () => {
  test('pool.query() does not run until awaited — no connection acquired before then', async () => {
    const pool = testPool()
    try {
      const q = pool.query('select 1 as n', [], { mode: 'object' })
      expect(pool.size).toBe(0)            // lazy: nothing checked out yet
      const r = await q                     // awaiting forces execution
      expect(cell(r, 'n')).toBe(1)
      expect(pool.size).toBe(1)            // one connection opened by the await
      expect(await q).toBe(r)              // memoized: awaiting again runs it once (same result object)
    } finally { await pool.end() }
  })

  test('toSQL() previews a lazy query without executing it', async () => {
    const pool = testPool()
    try {
      const q = pool.query('select $1::int4 as n', [7], { mode: 'object' })
      expect(q.toSQL()).toEqual({ sql: 'select $1::int4 as n', params: [7], options: { mode: 'object' } })
      expect(pool.size).toBe(0) // still lazy — toSQL() had no side effects
      const r = await q
      expect(cell(r, 'n')).toBe(7) // and the query still runs normally afterwards
    } finally { await pool.end() }
  })

  test('pool.execute() runs now and returns a Promise', async () => {
    const pool = testPool()
    try {
      const p = pool.execute('select 42 as n', [], { mode: 'object' })
      expect(p).toBeInstanceOf(Promise)
      expect(cell(await p, 'n')).toBe(42)
    } finally { await pool.end() }
  })
})

describe('pool.batch (atomic transaction) / pipeline (one conn) / parallel (fan-out)', () => {
  test('batch runs the set on ONE connection, in input order', async () => {
    const pool = testPool()
    try {
      const rs = await pool.batch([
        pool.query('select pg_backend_pid() as pid, $1::int as n', [0], { mode: 'object' }),
        pool.query('select pg_backend_pid() as pid, $1::int as n', [1], { mode: 'object' }),
        pool.query('select pg_backend_pid() as pid, $1::int as n', [2], { mode: 'object' }),
      ])
      rs.forEach((r, i) => expect(cell(r, 'n')).toBe(i))            // order preserved
      expect(new Set(rs.map((r) => cell(r, 'pid'))).size).toBe(1)  // one backend
      expect(pool.size).toBe(1)                                     // one reserved connection
    } finally { await pool.end() }
  })

  test('batch is ATOMIC but pipeline is NOT: a failing member rolls back a batch, not a pipeline', async () => {
    const pool = testPool()
    const cnt = async () => Number(cell(await pool.execute('select count(*)::int as n from pb_atomic', [], { mode: 'object' }), 'n'))
    await pool.execute('create table pb_atomic(v int)') // regular table: visible across connections
    try {
      // batch: the two inserts + a failing query -> whole transaction rolls back
      const e1 = await caught(() => pool.batch([
        pool.query('insert into pb_atomic values (1)'),
        pool.query('insert into pb_atomic values (2)'),
        pool.query('select 1/0'),
      ]))
      expect((e1 as PgError).code).toBe('22012')
      expect(await cnt()).toBe(0) // rolled back — nothing persisted

      // pipeline: same shape, but each autocommits -> the inserts survive the later failure
      const e2 = await caught(() => pool.pipeline([
        pool.query('insert into pb_atomic values (3)'),
        pool.query('insert into pb_atomic values (4)'),
        pool.query('select 1/0'),
      ]))
      expect((e2 as PgError).code).toBe('22012')
      expect(await cnt()).toBe(2) // 3 and 4 committed despite the failing sibling
    } finally { await pool.execute('drop table if exists pb_atomic'); await pool.end() }
  })

  test('pipeline runs on ONE connection, in input order', async () => {
    const pool = testPool()
    try {
      const rs = await pool.pipeline([
        pool.query('select pg_backend_pid() as pid, $1::int as n', [0], { mode: 'object' }),
        pool.query('select pg_backend_pid() as pid, $1::int as n', [1], { mode: 'object' }),
      ])
      rs.forEach((r, i) => expect(cell(r, 'n')).toBe(i))
      expect(new Set(rs.map((r) => cell(r, 'pid'))).size).toBe(1) // one backend, no BEGIN/COMMIT
    } finally { await pool.end() }
  })

  test('parallel fans the set out across connections', async () => {
    const pool = testPool({ max: 5 })
    try {
      const rs = await pool.parallel([
        pool.query('select $1::int as n', [0], { mode: 'object' }),
        pool.query('select $1::int as n', [1], { mode: 'object' }),
        pool.query('select $1::int as n', [2], { mode: 'object' }),
      ])
      rs.forEach((r, i) => expect(cell(r, 'n')).toBe(i))  // order preserved
      expect(pool.size).toBeGreaterThan(1)                // opened multiple connections (fan-out)
    } finally { await pool.end() }
  })
})
