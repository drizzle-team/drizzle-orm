// Shape ENTRIES form ([['key', spec], …]) + the integer-key guard on the object form.
// Positional matching relies on declaration order; JS enumerates integer-string object keys
// ('0', '2024') FIRST in numeric order — an object literal LOSES their written position before
// minipg sees it. So: object form throws on such keys; the entries array is the order-safe form.
// Dual-variant (jit + interpreted) like every decode-path suite.
import { test, expect, describe } from 'bun:test'
import { withConn, caught, TEST_TIMEOUT } from '../../helpers/db.ts'
import { Shape, Json, Jsonb, Collect } from '../../../src/index.ts'

describe('shape entries form + integer-key guard', () => {
  test('entries at top level: integer-string column names decode positionally', async () => {
    await withConn(async (c) => {
      const r = await c.query(`select 7 as "2024", 'x' as name`, [], {
        shape: [['2024', 'int4'], ['name', 'text']],
      })
      expect(r.rows[0]).toEqual({ 2024: 7, name: 'x' })
    })
  }, TEST_TIMEOUT)

  test('object form with an integer-string key throws (position already lost)', async () => {
    await withConn(async (c) => {
      const err = await caught(() => c.query(`select 7 as "2024", 'x' as name`, [], { shape: { '2024': 'int4', name: 'text' } }))
      expect((err as Error).message).toMatch(/shape key "2024" is an integer string/)
      // non-canonical numeric-ish keys are ordinary string keys — insertion order holds, no throw
      const ok = await c.query(`select 1 as "01", 2 as "1.5", 3 as "-3"`, [], { shape: { '01': 'int4', '1.5': 'int4', '-3': 'int4' } })
      expect(ok.rows[0]).toEqual({ '01': 1, '1.5': 2, '-3': 3 })
    })
  }, TEST_TIMEOUT)

  test('entries inside Json()/Jsonb()/Collect(); object guard applies there too', async () => {
    await withConn(async (c) => {
      const r = await c.query(
        `select '{"big":42,"2024":1}'::json j, '{"a":1,"bb":43}'::jsonb jb, 5 as id, 'n' as nm`,
        [], {
          shape: [
            ['j', Json([['big', 'int8'], ['2024', 'int4']])], // int8 (scanner path in jit) + integer key, declared order
            ['jb', Jsonb([['bb', 'int8'], ['a', 'int4']])],   // declared order ≠ jsonb sorted wire order
            ['grp', Collect([['id', 'int4'], ['nm', 'text']])],
          ],
        })
      const row = r.rows[0] as Record<string, unknown>
      expect(row.j).toEqual({ big: 42n, 2024: 1 })          // int8 -> BigInt, both engines
      expect(row.jb).toEqual({ bb: 43n, a: 1 })             // read in wire order, assembled in declared order
      expect(row.grp).toEqual({ id: 5, nm: 'n' })
      const err = await caught(() => c.query(`select '{"2024":1}'::json j`, [], { shape: { j: Json({ '2024': 'int4' }) } }))
      expect((err as Error).message).toMatch(/shape key "2024" is an integer string/)
    })
  }, TEST_TIMEOUT)

  test('Shape() takes entries; duplicate entries keys throw', () => {
    const m = Shape([['2024', 'int4'], ['name', 'text']])
    expect(m.$cols.map((c) => c.name)).toEqual(['2024', 'name'])
    expect(() => Shape({ '2024': 'int4' })).toThrow(/integer string/)
    expect(() => Shape([['a', 'int4'], ['a', 'text']])).toThrow(/duplicate shape key "a"/)
  })
})
