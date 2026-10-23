// Collect() nested grouping + Transform() per-column decode-time fn + Nullable()/auto-null, run through BOTH
// mappers (decode:'jit' and decode:'interpreted') and asserted equal + against the expected nested rows.
// Uses VALUES-with-casts (no tables) to produce columns in a fixed wire order incl. NULLs (LEFT-JOIN miss).
import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { testConnect, caught } from '../../helpers/db.ts'
import { Collect, CollectNullable, Transform, Nullable, Json } from '../../../src/index.ts'
import { geometry, box2d, box3d } from '../../../src/geometry.ts'
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

async function rows(sql: string, shape: ShapeSpec): Promise<unknown[]> {
  const j = (await jit.query(sql, [], { shape: shape as never })).rows
  const i = (await interp.query(sql, [], { shape: shape as never })).rows
  expect(eq(j, i)).toBe(true) // dual-variant: jit === interpreted
  return j
}

describe('Collect / Transform / Nullable', () => {
  test('CollectNullable: auto-null when a required field is NULL (Collect stays an object)', async () => {
    const sql = `SELECT * FROM (VALUES (1::int8,'alice'::text,10::int8,'pro'::text),(2::int8,'bob'::text,NULL::int8,NULL::text)) t(uid,uname,sid,splan)`
    const r = await rows(sql, { user: Collect({ id: 'bigint:number', name: 'text' }), sub: CollectNullable({ id: 'bigint', plan: 'text' }) })
    expect(r[0]).toEqual({ user: { id: 1, name: 'alice' }, sub: { id: 10n, plan: 'pro' } })
    expect(r[1]).toEqual({ user: { id: 2, name: 'bob' }, sub: null }) // sub.id required + NULL -> whole group null (CollectNullable)
  })

  test('Collect ALWAYS returns an object — a LEFT-JOIN miss gives null fields, not null', async () => {
    const sql = `SELECT * FROM (VALUES (1::int8,'alice'::text,10::int8,'pro'::text),(2::int8,'bob'::text,NULL::int8,NULL::text)) t(uid,uname,sid,splan)`
    const r = await rows(sql, { user: Collect({ id: 'bigint:number', name: 'text' }), sub: Collect({ id: 'bigint:number', plan: 'text' }) })
    expect(r[0]).toEqual({ user: { id: 1, name: 'alice' }, sub: { id: 10, plan: 'pro' } })
    expect(r[1]).toEqual({ user: { id: 2, name: 'bob' }, sub: { id: null, plan: null } }) // Collect never nulls the group
  })

  test('Transform is SKIPPED for NULL cells — null passes through (changed 2026-07-09)', async () => {
    const sql = `SELECT * FROM (VALUES (5::int8,'hi'::text),(9::int8,NULL::text)) t(id,note)`
    const r = await rows(sql, { id: Transform('bigint:number', (n: number) => n * 100), note: Transform('text', (s: string) => s.toUpperCase()) })
    expect(r[0]).toEqual({ id: 500, note: 'HI' })
    expect(r[1]).toEqual({ id: 900, note: null }) // fn never called; no null-check needed inside fn
  })

  test('Nullable field does not trigger the group auto-null', async () => {
    const sql = `SELECT * FROM (VALUES (1::int8,NULL::text)) t(id,bio)`
    const r = await rows(sql, { u: Collect({ id: 'bigint', bio: Nullable('text') }) })
    expect(r[0]).toEqual({ u: { id: 1n, bio: null } }) // bio Nullable -> group present, bio null
  })

  test('all-Nullable group with EVERY field null -> group is null (changed 2026-07-09)', async () => {
    const sql = `SELECT * FROM (VALUES (NULL::int8,NULL::text)) t(a,b)`
    const r = await rows(sql, { g: CollectNullable({ a: Nullable('bigint'), b: Nullable('text') }) })
    expect(r[0]).toEqual({ g: null }) // all-Nullable CollectNullable, every field null -> LEFT-JOIN miss
  })

  test('Nullable(Transform(...)) composes; null skips the fn', async () => {
    const sql = `SELECT * FROM (VALUES (1::int8,NULL::text),(2::int8,'go'::text)) t(id,tag)`
    const r = await rows(sql, { u: Collect({ id: 'bigint:number', tag: Nullable(Transform('text', (s: string) => s.toUpperCase())) }) })
    expect(r[0]).toEqual({ u: { id: 1, tag: null } }) // fn not called on null
    expect(r[1]).toEqual({ u: { id: 2, tag: 'GO' } })
  })

  test('deep nesting (Collect in Collect) with inner auto-null', async () => {
    const sql = `SELECT * FROM (VALUES (1::int8,'nyc'::text,2::int8),(3::int8,NULL::text,NULL::int8)) t(id,city,zip)`
    const r = await rows(sql, { user: Collect({ id: 'bigint:number', address: CollectNullable({ city: 'text', zip: 'bigint:number' }) }) })
    expect(r[0]).toEqual({ user: { id: 1, address: { city: 'nyc', zip: 2 } } })
    expect(r[1]).toEqual({ user: { id: 3, address: null } }) // address.city required + NULL -> address null (CollectNullable); user present
  })

  test('multiple required fields: any NULL nulls the group', async () => {
    const sql = `SELECT * FROM (VALUES (1::int8,NULL::int8,'x'::text)) t(a,b,c)`
    const r = await rows(sql, { g: CollectNullable({ a: 'bigint', b: 'bigint', c: 'text' }) })
    expect(r[0]).toEqual({ g: null }) // b required + NULL
  })

  test('Json() inside a Collect (mixed marker nesting)', async () => {
    const sql = `SELECT * FROM (VALUES (1::int8,'{"theme":"dark","n":3}'::json)) t(id,prefs)`
    const r = await rows(sql, { u: Collect({ id: 'bigint:number', prefs: Json({ theme: 'text', n: 'int4' }) }) })
    expect(r[0]).toEqual({ u: { id: 1, prefs: { theme: 'dark', n: 3 } } })
  })

  test('all-Nullable Collect group: ALL fields null -> group is null (LEFT-JOIN miss)', async () => {
    const sql = `SELECT * FROM (VALUES (1::int8, NULL::text, NULL::int4), (2::int8, 'bob', NULL::int4)) t(id, name, age)`
    const r = await rows(sql, { id: 'bigint:number', u: CollectNullable({ name: Nullable('text'), age: Nullable('int4') }) })
    expect(r[0]).toEqual({ id: 1, u: null })                      // every field null -> whole group null
    expect(r[1]).toEqual({ id: 2, u: { name: 'bob', age: null } }) // partial null -> object survives
  })

  test('all-Nullable NESTED group nulls independently of its parent', async () => {
    const sql = `SELECT * FROM (VALUES (1::int8, 'x', NULL::text, NULL::text)) t(id, a, b, c)`
    const r = await rows(sql, { id: 'bigint:number', g: Collect({ a: Nullable('text'), inner: CollectNullable({ b: Nullable('text'), c: Nullable('text') }) }) })
    expect(r[0]).toEqual({ id: 1, g: { a: 'x', inner: null } }) // parent Collect present; empty CollectNullable child nulls
  })

  test("'unknown' column decodes by its RUNTIME type (like a plain query)", async () => {
    const sql = `SELECT * FROM (VALUES (1::int8, 42::int4, '2026-07-09T10:00:00Z'::timestamptz, '{"a":1}'::jsonb, 'txt'::text)) t(id, n, ts, j, s)`
    const r = await rows(sql, { id: 'bigint:number', n: 'unknown', ts: 'unknown', j: 'unknown', s: 'unknown' })
    const row = r[0] as Record<string, unknown>
    expect(row.n).toBe(42)                                  // int4 -> number
    expect((row.ts as Date).getTime()).toBe(Date.parse('2026-07-09T10:00:00Z')) // timestamptz -> Date
    expect(row.j).toEqual({ a: 1 })                          // jsonb -> object
    expect(row.s).toBe('txt')                                // text -> string
  })

  test("'unknown' works on prepared REUSE (mapper built from cached fields)", async () => {
    const sql = `SELECT * FROM (VALUES (7::int4, 2.5::float8)) t(a, b)`
    const shape = { a: 'unknown', b: 'unknown' } as const
    const name = `unk_${process.pid}`
    const first = await jit.query(sql, [], { shape: shape as never, name })
    const reused = await jit.query(sql, [], { shape: shape as never, name }) // no 'T' arrives on reuse
    expect(first.rows[0]).toEqual({ a: 7, b: 2.5 })
    expect(reused.rows[0]).toEqual({ a: 7, b: 2.5 })
  })

  test("'unknown' composes with Collect/Nullable/Transform", async () => {
    const sql = `SELECT * FROM (VALUES (1::int8, 5::int4, NULL::text), (2::int8, NULL::int4, NULL::text)) t(id, x, y)`
    const r = await rows(sql, {
      id: 'bigint:number',
      g: CollectNullable({ x: Nullable(Transform('unknown', (v: number) => v * 2)), y: Nullable('unknown') }),
    })
    expect(r[0]).toEqual({ id: 1, g: { x: 10, y: null } }) // runtime int4 -> number, then transform
    expect(r[1]).toEqual({ id: 2, g: null })                // all-null CollectNullable group -> null
  })

  test("geometric + extension types: point / vector / geometry targets", async () => {
    // vector + geometry come through as ::text fixtures — the decoder is chosen by the DECLARED
    // type (extension OIDs are dynamic), so the bench cluster needs neither pgvector nor PostGIS
    const sql = `SELECT '(1.5,2.5)'::point p, '(1.5,2.5)'::point pt, '(1.5,2.5)'::point ps,
                        '[1,2.5,3]'::text v, '[1,2.5,3]'::text vf,
                        '0101000020E6100000000000000000F03F0000000000000040'::text g,
                        '0101000020E6100000000000000000F03F0000000000000040'::text gh`
    const r = await rows(sql, {
      p: 'point:xy', pt: 'point:tuple', ps: 'point', // bare = raw text (explicit-only parsing)
      v: 'vector:array', vf: 'vector:f32',
      g: geometry('geojson'), gh: geometry(), // minipg/geometry markers (PostGIS left core)
    })
    const row = r[0] as Record<string, unknown>
    expect(row.p).toEqual({ x: 1.5, y: 2.5 })
    expect(row.pt).toEqual([1.5, 2.5])
    expect(row.ps).toBe('(1.5,2.5)') // bare 'point' -> raw text
    expect(row.v).toEqual([1, 2.5, 3])
    expect(row.vf).toBeInstanceOf(Float32Array)
    expect(Array.from(row.vf as Float32Array)).toEqual([1, 2.5, 3])
    expect(row.g).toEqual({ type: 'Point', coordinates: [1, 2], srid: 4326 })
    expect(row.gh).toBe('0101000020E6100000000000000000F03F0000000000000040') // bare 'geometry' -> raw hex
  })

  test('built-in line: raw text default, :abc / :tuple targets, arrays', async () => {
    const sql = `SELECT '{1,-2,3.5}'::line l, '{1,-2,3.5}'::line la, '{1,-2,3.5}'::line lt,
                        array['{1,-2,3.5}'::line, '{0,1,-7}'::line] ls,
                        array['{1,-2,3.5}'::line, '{0,1,-7}'::line] lsa`
    const r = await rows(sql, {
      l: 'line', la: 'line:abc', lt: 'line:tuple', // bare = raw '{A,B,C}' text (explicit-only parsing)
      ls: 'line[]', lsa: 'line[]:abc',
    })
    const row = r[0] as Record<string, unknown>
    expect(row.l).toBe('{1,-2,3.5}')
    expect(row.la).toEqual({ a: 1, b: -2, c: 3.5 })
    expect(row.lt).toEqual([1, -2, 3.5])
    expect(row.ls).toEqual(['{1,-2,3.5}', '{0,1,-7}'])                       // bare elements = raw text
    expect(row.lsa).toEqual([{ a: 1, b: -2, c: 3.5 }, { a: 0, b: 1, c: -7 }]) // element :target after []
  })

  test('ARRAYS of geo/extension types: element :target rides after []', async () => {
    // extension arrays come through as ::text array-literal fixtures (dynamic OIDs — decode is
    // driven by the DECLARED element name, so the cluster needs neither pgvector nor PostGIS)
    const sql = `SELECT array['(1.5,2.5)'::point, '(3,4)'::point] p,
                        array['(1.5,2.5)'::point, '(3,4)'::point] pt,
                        array['(1.5,2.5)'::point, '(3,4)'::point] praw,
                        '{"[1,2.5]","[3,4]"}'::text v, '{"[1,2.5]","[3,4]"}'::text vf,
                        '{"0101000020E6100000000000000000F03F0000000000000040"}'::text g,
                        '{"BOX(1 2,3 4)"}'::text b2`
    const r = await rows(sql, {
      p: 'point[]:xy', pt: 'point[]:tuple', praw: 'point[]',
      v: 'vector[]:array', vf: 'vector[]:f32',
      g: geometry.array('geojson'), b2: box2d.array('xy'),
    })
    const row = r[0] as Record<string, unknown>
    expect(row.p).toEqual([{ x: 1.5, y: 2.5 }, { x: 3, y: 4 }])
    expect(row.pt).toEqual([[1.5, 2.5], [3, 4]])
    expect(row.praw).toEqual(['(1.5,2.5)', '(3,4)'])                 // bare elements = raw text
    expect(row.v).toEqual([[1, 2.5], [3, 4]])
    const vf = row.vf as Float32Array[]
    expect(vf[0]).toBeInstanceOf(Float32Array)
    expect(Array.from(vf[1]!)).toEqual([3, 4])
    expect(row.g).toEqual([{ type: 'Point', coordinates: [1, 2], srid: 4326 }])
    expect(row.b2).toEqual([{ xmin: 1, ymin: 2, xmax: 3, ymax: 4 }])
  })

  test('pgvector halfvec/sparsevec + PostGIS boxes', async () => {
    const sql = `SELECT '[1,2.5]'::text hv, '{1:1.5,3:2}/5'::text sv, '{1:1.5,3:2}/5'::text sd,
                        'BOX(1 2,3 4)'::text b2, 'BOX3D(1 2 3,4 5 6)'::text b3, 'BOX(1 2,3 4)'::text braw`
    const r = await rows(sql, {
      hv: 'halfvec:array', sv: 'sparsevec:sparse', sd: 'sparsevec:array',
      b2: box2d('xy'), b3: box3d('xy'), braw: box2d(),
    })
    const row = r[0] as Record<string, unknown>
    expect(row.hv).toEqual([1, 2.5])
    expect(row.sv).toEqual({ dim: 5, indices: [1, 3], values: [1.5, 2] })
    expect(row.sd).toEqual([1.5, 0, 2, 0, 0])
    expect(row.b2).toEqual({ xmin: 1, ymin: 2, xmax: 3, ymax: 4 })
    expect(row.b3).toEqual({ xmin: 1, ymin: 2, zmin: 3, xmax: 4, ymax: 5, zmax: 6 })
    expect(row.braw).toBe('BOX(1 2,3 4)') // bare -> raw text
  })

  test('Collect in array mode is rejected', async () => {
    const err = await caught(() => jit.query(`SELECT 1::int4 v`, [], { shape: { g: Collect({ v: 'int4' }) } as never, mode: 'array' }))
    expect((err as Error).message).toMatch(/Collect|object mode|nest/i)
  })

  test('two Transforms with the same type but different fns get different mappers (cache key)', async () => {
    const sql = `SELECT 5::int8 v`
    const a = (await jit.query(sql, [], { shape: { v: Transform('bigint:number', (n: number) => n + 1) } as never })).rows[0]
    const b = (await jit.query(sql, [], { shape: { v: Transform('bigint:number', (n: number) => n + 2) } as never })).rows[0]
    expect(a).toEqual({ v: 6 })
    expect(b).toEqual({ v: 7 }) // must NOT reuse a's compiled mapper
  })

  test('__proto__ group/leaf keys are own properties (no prototype pollution)', async () => {
    const sql = `SELECT * FROM (VALUES (7::int4)) t(v)`
    // computed keys create OWN '__proto__' props (a plain `{ __proto__: … }` literal is the prototype-setter)
    const r = await rows(sql, { ['__proto__']: Collect({ ['__proto__']: 'int4' } as never) } as ShapeSpec)
    const row = r[0] as Record<string, unknown>
    expect(Object.getPrototypeOf(row)).toBe(Object.prototype)
    const grp = Object.getOwnPropertyDescriptor(row, '__proto__')!.value as Record<string, unknown>
    expect(Object.getOwnPropertyDescriptor(grp, '__proto__')!.value).toBe(7)
  })
})
