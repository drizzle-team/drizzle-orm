// Transform() and 'unknown' INSIDE Json()/Jsonb() shapes. The field decodes per its base type (scanner or
// JSON.parse), then the Transform fn visits the decoded value; 'unknown' passes the parsed value through as-is;
// a NULL field skips the fn (null passes through). Run through BOTH mappers (jit + interpreted) and asserted equal.
import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { testConnect } from '../../helpers/db.ts'
import { Json, JsonArray, Jsonb, Transform } from '../../../src/index.ts'
import type { Connection } from '../../../src/index.ts'
import type { ShapeSpec } from '../../../src/spec.ts'

let jit: Connection, interp: Connection
beforeAll(async () => { jit = await testConnect({ decode: 'jit' }); interp = await testConnect({ decode: 'interpreted' }) })
afterAll(async () => { await jit?.end(); await interp?.end() })

const eq = (a: unknown, b: unknown): boolean => {
  if (a === b) return true
  if (typeof a === 'bigint' || typeof b === 'bigint') return a === b
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => eq(x, b[i]))
  const ka = Object.keys(a as object), kb = Object.keys(b as object)
  return ka.length === kb.length && ka.every((k) => eq((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

async function one(sql: string, shape: ShapeSpec): Promise<unknown> {
  const j = (await jit.query(sql, [], { shape: shape as never })).rows[0]
  const i = (await interp.query(sql, [], { shape: shape as never })).rows[0]
  expect(eq(j, i)).toBe(true) // dual-variant: jit === interpreted
  return j
}

describe('Transform + unknown inside Json', () => {
  test('Transform on json fields (fast path), unknown passthrough, null skips the fn', async () => {
    const sql = `select json_build_object('big', 42, 'ts', '2026-01-15T10:30:00Z'::timestamptz, 'meta', json_build_object('a',1), 'name', 'bob', 'maybe', null::text) as data`
    const r = await one(sql, { data: Json({
      big: Transform('int4', (n: number) => n + 1),
      ts: Transform('timestamptz', (d: Date) => d.getTime()), // timestamptz forces the positional scanner + a transform walk
      meta: 'unknown',
      name: Transform('text', (s: string) => s.toUpperCase()),
      maybe: Transform('text', (s: string) => 'X' + s), // null -> NOT called
    }) })
    expect(r).toEqual({ data: { big: 43, ts: Date.UTC(2026, 0, 15, 10, 30, 0), meta: { a: 1 }, name: 'BOB', maybe: null } })
  })

  test("Transform on int8:number (JSON.parse-safe base)", async () => {
    const r = await one(`select json_build_object('n', 42::int8) as d`, { d: Json({ n: Transform('int8:number', (n: number) => n + 1) }) })
    expect(r).toEqual({ d: { n: 43 } })
  })

  test('JsonArray + Transform (json_agg)', async () => {
    const r = await one(`select json_agg(json_build_object('v', g)) as d from generate_series(1,3) g`, { d: JsonArray({ v: Transform('int4', (n: number) => n * 10) }) })
    expect(r).toEqual({ d: [{ v: 10 }, { v: 20 }, { v: 30 }] })
  })

  test('nested Json + Transform', async () => {
    const r = await one(`select json_build_object('inner', json_build_object('x', 5)) as d`, { d: Json({ inner: Json({ x: Transform('int4', (n: number) => n + 1) }) }) })
    expect(r).toEqual({ d: { inner: { x: 6 } } })
  })

  test("'unknown' passes any json value through (object, array, scalar, null)", async () => {
    const r = await one(`select json_build_object('o', json_build_object('a',1), 'arr', json_build_array(1,2), 's', 'hi', 'x', null) as d`,
      { d: Json({ o: 'unknown', arr: 'unknown', s: 'unknown', x: 'unknown' }) })
    expect(r).toEqual({ d: { o: { a: 1 }, arr: [1, 2], s: 'hi', x: null } })
  })

  test('Transform on unknown (visit an arbitrary json value)', async () => {
    const r = await one(`select json_build_object('v', json_build_object('a',1,'b',2)) as d`,
      { d: Json({ v: Transform('unknown', (o: { a: number; b: number }) => o.a + o.b) }) })
    expect(r).toEqual({ d: { v: 3 } })
  })

  test('jsonb: Transform + unknown (sorted wire order preserved)', async () => {
    const r = await one(`select jsonb_build_object('name','bob','n',7) as d`, { d: Jsonb({ name: Transform('text', (s: string) => s.toUpperCase()), n: Transform('int4', (n: number) => n * 2) }) })
    expect(r).toEqual({ d: { name: 'BOB', n: 14 } })
  })
})
