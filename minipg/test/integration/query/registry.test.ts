// defineType(): the user-extensible type registry. Name-keyed markers usable as shape columns,
// array elements, and Collect fields; bare = raw text; loud errors for unknown targets and
// unsupported placements. Dual-variant (jit + interpreted) like every decode-path suite.
import { test, expect, describe } from 'bun:test'
import { withConn, caught, TEST_TIMEOUT } from '../../helpers/db.ts'
import { defineType, Collect, Json } from '../../../src/index.ts'
import { geometry } from '../../../src/geometry.ts'

// a toy PG-ish type: 'complex' rendered as 'a+bi'
const complex = defineType('complex', {
  ascii: true,
  targets: { obj: (s) => { const i = s.indexOf('+'); return { re: Number(s.slice(0, i)), im: Number(s.slice(i + 1, -1)) } } },
  rawTargets: { len: (b, o, l) => l }, // zero-copy tier: cell byte length
})

describe('defineType registry', () => {
  test('scalar targets, bare raw text, rawTargets, arrays, Collect composition', async () => {
    await withConn(async (c) => {
      const r = await c.query(
        `select '1.5+2i'::text v, '1.5+2i'::text raw, '1.5+2i'::text len,
                '{"1+2i","3+4i"}'::text arr, '{"1+2i"}'::text arrraw, 7::int4 id`,
        [], { shape: {
          v: complex('obj'), raw: complex(), len: complex('len'),
          arr: complex.array('obj'), arrraw: complex.array(),
          grp: Collect({ id: 'int4' }),
        } })
      const row = r.rows[0] as Record<string, unknown>
      expect(row.v).toEqual({ re: 1.5, im: 2 })
      expect(row.raw).toBe('1.5+2i')                       // bare = raw text
      expect(row.len).toBe(6)                              // rawTargets got (b, o, l)
      expect(row.arr).toEqual([{ re: 1, im: 2 }, { re: 3, im: 4 }])
      expect(row.arrraw).toEqual(['1+2i'])                 // bare elements = raw text
      expect(row.grp).toEqual({ id: 7 })
    })
  }, TEST_TIMEOUT)

  test('minipg/geometry is a registry customer: same machinery end to end', async () => {
    await withConn(async (c) => {
      const PT = '0101000020E6100000000000000000F03F0000000000000040' // SRID=4326 POINT(1 2)
      const LINE = '010200000002000000' + '0000000000000000'.repeat(2) + '000000000000F03F'.repeat(2) // LINESTRING(0 0,1 1)
      const r = await c.query(`select '${PT}'::text g, '${PT}'::text gxy, '${PT}'::text gt, '{"${PT}"}'::text gs`,
        [], { shape: { g: geometry('geojson'), gxy: geometry('xy'), gt: geometry('tuple'), gs: geometry.array('xy') } })
      const row = r.rows[0] as Record<string, unknown>
      expect(row.g).toEqual({ type: 'Point', coordinates: [1, 2], srid: 4326 })
      expect(row.gxy).toEqual({ x: 1, y: 2 })
      expect(row.gt).toEqual([1, 2])
      expect(row.gs).toEqual([{ x: 1, y: 2 }])
      // the declared-Point contract is LOUD: a LineString under :xy rejects, connection survives
      const e = await caught(() => c.query(`select '${LINE}'::text g`, [], { shape: { g: geometry('xy') } }))
      expect(String((e as Error).message)).toMatch(/expect a Point geometry, got LineString/)
      expect((await c.query('select 1', [])).rowCount).toBe(1)
    })
  }, TEST_TIMEOUT)

  test('loud errors: unknown target at marker creation; markers inside Json() rejected', async () => {
    expect(() => complex('nope' as never)).toThrow(/has no target "nope"/)
    await withConn(async (c) => {
      const e = await caught(() => c.query('select 1 as d', [], { shape: { d: Json({ x: complex('obj') as never }) } }))
      expect(String((e as Error).message)).toMatch(/aren't supported inside a json shape/)
    })
  }, TEST_TIMEOUT)
})
