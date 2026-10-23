// query(..., { snapshot }): one-shot queries pinned to an exported snapshot,
// wrapped in a pipelined BEGIN/SET SNAPSHOT/query/COMMIT (single round trip).
import { test, expect, describe } from 'bun:test'
import { withConn, testConnect, testPool, caught, TEST_TIMEOUT } from '../helpers/db.ts'

const K = `snap_${process.pid}`

describe('query with { snapshot }', () => {
  test('sees the exported snapshot, not current data; limit/params work', async () => {
    await withConn(async (c) => {
      await c.query(`create table ${K}_t(id int4 primary key)`)
      await c.query(`insert into ${K}_t select generate_series(1, 10)`)
      // export a snapshot from a second connection and KEEP its tx open
      const exporter = await testConnect()
      try {
        await exporter.query('begin isolation level repeatable read')
        const snap = ((await exporter.query('select pg_export_snapshot()')).rows[0] as string[])[0]!
        await c.query(`insert into ${K}_t values (11)`) // after the snapshot
        const pinned = await c.query(`select count(*)::int4 from ${K}_t`, [], { snapshot: snap })
        expect((pinned.rows[0] as unknown[])[0]).toBe(10) // row 11 invisible
        const limited = await c.query(`select id from ${K}_t where id > $1 order by id limit 3`, [5], { snapshot: snap, mode: 'object' })
        expect(limited.rows).toEqual([{ id: 6 }, { id: 7 }, { id: 8 }] as never)
        const now = await c.query(`select count(*)::int4 from ${K}_t`)
        expect((now.rows[0] as unknown[])[0]).toBe(11) // un-pinned query sees current data
      } finally {
        await exporter.end()
        await c.query(`drop table ${K}_t`)
      }
    })
  }, TEST_TIMEOUT)

  test('invalid snapshot rejects cleanly; connection stays usable (auto-rollback)', async () => {
    await withConn(async (c) => {
      const e = await caught(() => c.query('select 1', [], { snapshot: '00000099-00000001-1' }))
      expect(String((e as Error).message)).toMatch(/snapshot/i)
      const ok = await c.query('select 42 as v') // tx rolled back by the pipelined COMMIT
      expect((ok.rows[0] as unknown[])[0]).toBe(42)
      expect(c.inTransaction).toBe(false)
    })
  }, TEST_TIMEOUT)

  test('rejects inside an open transaction', async () => {
    await withConn(async (c) => {
      const e = await caught(() => c.begin((tx) => tx.query('select 1', [], { snapshot: 'x-y-z' })))
      expect(String((e as Error).message)).toMatch(/fresh transaction/)
    })
  }, TEST_TIMEOUT)

  test('works through pool.query / pool.execute', async () => {
    const exporter = await testConnect()
    const pool = testPool({ max: 2 })
    try {
      await exporter.query('begin isolation level repeatable read')
      const snap = ((await exporter.query('select pg_export_snapshot()')).rows[0] as string[])[0]!
      const r = await pool.execute('select 1 as v', [], { snapshot: snap, mode: 'object' })
      expect(r.rows).toEqual([{ v: 1 }] as never)
    } finally {
      await exporter.end()
      await pool.end()
    }
  }, TEST_TIMEOUT)
})
