// Domain: "transaction API" — pool.begin/conn.begin (+ transaction alias): auto BEGIN/COMMIT/ROLLBACK,
// isolation options, nested SAVEPOINTs, and pipelining inside a transaction. Writes go to CONNECTION-
// SCOPED temp tables; every connection/pool is ended.
import { test, expect, describe } from 'bun:test'
import { withConn, testPool, caught, PgError } from '../../helpers/db.ts'

const cell = (r: { rows: unknown[] }, k: string) => (r.rows[0] as Record<string, unknown>)[k]
const count = async (c: { query: (s: string, p: unknown[], o: { mode: 'object' }) => Promise<{ rows: unknown[] }> }, t: string) =>
  Number(cell(await c.query(`select count(*)::int as n from ${t}`, [], { mode: 'object' }), 'n'))

describe('conn.begin — commit / rollback / return value', () => {
  test('commits: work persists, returns the callback value, txStatus tracks I→(T)→I', async () => {
    await withConn(async (c) => {
      await c.query('create temp table tb(v int)')
      expect(c.inTransaction).toBe(false)
      const out = await c.begin(async (tx) => {
        await tx.query('insert into tb values (1),(2)')
        expect(tx.inTransaction).toBe(true) // T inside
        return 'done'
      })
      expect(out).toBe('done')
      expect(c.inTransaction).toBe(false)  // I after commit
      expect(await count(c, 'tb')).toBe(2)
    })
  })

  test('rolls back and rethrows the original error when the callback throws', async () => {
    await withConn(async (c) => {
      await c.query('create temp table tr(v int)')
      const err = await caught(() => c.begin(async (tx) => {
        await tx.query('insert into tr values (1)')
        throw new Error('boom')
      }))
      expect((err as Error).message).toBe('boom')
      expect(c.inTransaction).toBe(false)   // rolled back, connection clean
      expect(await count(c, 'tr')).toBe(0)  // nothing persisted
    })
  })
})

describe('nested begin → SAVEPOINT (partial rollback)', () => {
  test('inner failure rolls back only its work; the outer transaction commits the rest', async () => {
    await withConn(async (c) => {
      await c.query('create temp table ts(v int)')
      await c.begin(async (tx) => {
        await tx.query('insert into ts values (1)')                  // keep
        await caught(() => tx.begin(async (inner) => {               // nested savepoint
          await inner.query('insert into ts values (2)')             // roll back
          throw new Error('inner')
        }))
        await tx.query('insert into ts values (3)')                  // keep (savepoint rollback left tx usable)
      })
      const rows = await c.query('select v from ts order by v', [], { mode: 'array' })
      expect(rows.rows).toEqual([[1], [3]])
    })
  })
})

describe('pool.begin / pool.transaction', () => {
  test('pool.begin commits on a reserved connection and returns the value', async () => {
    const pool = testPool()
    try {
      const v = await pool.begin(async (tx) => {
        await tx.query('create temp table pb(v int)')
        await tx.query('insert into pb values (7)')
        return cell(await tx.query('select v from pb', [], { mode: 'object' }), 'v')
      })
      expect(v).toBe(7)
    } finally { await pool.end() }
  })

  test('pool.transaction is an alias for begin', async () => {
    const pool = testPool()
    try {
      const n = await pool.transaction(async (tx) => cell(await tx.query('select 5 as n', [], { mode: 'object' }), 'n'))
      expect(n).toBe(5)
    } finally { await pool.end() }
  })

  test('rethrows on throw (and the pool stays usable afterward)', async () => {
    const pool = testPool()
    try {
      const err = await caught(() => pool.begin(async () => { throw new Error('nope') }))
      expect((err as Error).message).toBe('nope')
      const r = await pool.query('select 1 as n', [], { mode: 'object' }) // pool still works
      expect(cell(r, 'n')).toBe(1)
    } finally { await pool.end() }
  })
})

describe('options', () => {
  test("readOnly (object form) makes a write reject 25006", async () => {
    const pool = testPool()
    try {
      const err = await caught(() => pool.begin({ readOnly: true }, async (tx) => { await tx.query('create temp table ro_fail(i int)') }))
      expect((err as PgError).code).toBe('25006')
    } finally { await pool.end() }
  })

  test("string form ('read only') also rejects a write", async () => {
    const pool = testPool()
    try {
      const err = await caught(() => pool.begin('read only', async (tx) => { await tx.query('create temp table ro_fail2(i int)') }))
      expect((err as PgError).code).toBe('25006')
    } finally { await pool.end() }
  })

  test('isolation: serializable runs a normal transaction', async () => {
    const pool = testPool()
    try {
      const n = await pool.begin({ isolation: 'serializable' }, async (tx) => cell(await tx.query('select 9 as n', [], { mode: 'object' }), 'n'))
      expect(n).toBe(9)
    } finally { await pool.end() }
  })
})

describe('pipelining inside a transaction', () => {
  test('concurrent queries in the callback pipeline on the one reserved connection', async () => {
    const pool = testPool()
    try {
      const out = await pool.begin(async (tx) => {
        const rs = await Promise.all([
          tx.query('select 1 as n', [], { mode: 'object' }),
          tx.query('select 2 as n', [], { mode: 'object' }),
          tx.query('select 3 as n', [], { mode: 'object' }),
        ])
        expect(tx.stats.maxInflight).toBeGreaterThan(1) // they overlapped in flight
        return rs.map((r) => cell(r, 'n'))
      })
      expect(out).toEqual([1, 2, 3])
    } finally { await pool.end() }
  })
})
