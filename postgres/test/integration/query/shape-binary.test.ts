// Shape auto-binary: a declared shape requests the BINARY result wire format for the types whose binary
// decode is materially faster (bench/per-type-decode.bench.ts -> BINARY_FAST): int2/int4/oid, int8,
// float4/8, date/timestamp(tz), bytea. Everything else stays TEXT — bool/text (tie), uuid (text wins),
// numeric/money (no binary decoder), json/jsonb (the scanner needs the JSON text), and `:string` targets
// on non-int8 types (binary yields the decoded value, never the PG text). Runs under both decode variants.
import { test, expect, describe } from 'bun:test'
import { shapeCols } from '../../../src/spec.ts'
import { BINARY_FAST } from '../../../src/decode.ts'
import { Json, type ShapeSpec } from '../../../src/index.ts'
import { withConn } from '../../helpers/db.ts'

const fmtOf = (spec: ShapeSpec) => Object.fromEntries(shapeCols(spec).map((c) => [c.name, c.format ?? 'text']))

// ============================================================================
describe('shapeCols wire-format resolution', () => {
  test('boost types -> binary, everything else -> text', () => {
    const f = fmtOf({
      i2: 'int2', i4: 'int4', o: 'oid', big: 'int8', f8: 'float8',
      dt: 'date', ts: 'timestamp', tstz: 'timestamptz', by: 'bytea', // -> binary
      f4p: 'float4:precise', // float4:precise -> binary (exact f32); bare/:pretty -> text (canonical)
      f4: 'float4', f4y: 'float4:pretty', b: 'bool', u: 'uuid', t: 'text', v: 'varchar', n: 'numeric', m: 'money', ti: 'time', iv: 'interval', // -> text
    })
    for (const k of ['i2', 'i4', 'o', 'big', 'f8', 'dt', 'ts', 'tstz', 'by', 'f4p']) expect(f[k]).toBe('binary')
    for (const k of ['f4', 'f4y', 'b', 'u', 't', 'v', 'n', 'm', 'ti', 'iv']) expect(f[k]).toBe('text')
  })

  test('BINARY_FAST is exactly the auto-binary OID set (guards against drift)', () => {
    expect([...BINARY_FAST].sort((a, b) => a - b)).toEqual([17, 20, 21, 23, 26, 701, 1082, 1114, 1184])
  })

  test('all binary-eligible targets stay binary (incl. int8:number, float4:precise — accepted imprecision)', () => {
    const f = fmtOf({
      ms: 'timestamptz:ms', dd: 'date:date', bb: 'int8:bigint',
      ss: 'int8:string', // int8:string -> binary reconstructs the exact decimal string from the int64
      bn: 'int8:number', f4: 'float4:precise', // binary returns the exact stored value (diverges from text — OK)
    })
    for (const k of ['ms', 'dd', 'bb', 'ss', 'bn', 'f4']) expect(f[k]).toBe('binary')
  })

  test(':string (non-int8) and bare/:pretty float4 force TEXT (binary can\'t yield PG canonical text)', () => {
    const f = fmtOf({ a: 'timestamptz:string', b: 'int4:string', c: 'date:string', d: 'float8:string', e: 'bytea:string', g: 'float4:string', h: 'float4:pretty' })
    for (const k of ['a', 'b', 'c', 'd', 'e', 'g', 'h']) expect(f[k]).toBe('text')
  })

  test('shaped json/jsonb columns never go binary (the scanner parses JSON text)', () => {
    const f = fmtOf({ j: Json({ id: 'int4' }), plain: 'jsonb' })
    expect(f.j).toBe('text')
    expect(f.plain).toBe('text')
  })
})

// ============================================================================
describe('shape auto-binary end-to-end (real PG, both variants)', () => {
  // Every binary-eligible type in one row + a few text-only types. The plain query() decodes each column
  // by its DEFAULT TEXT decoder; the shape decodes the boost types via BINARY. Identical rows prove the
  // binary path agrees with the (well-tested) text path for every auto-binary type.
  const SQL = `select
      1::int2 as i2, -2000000000::int4 as i4, 4294967295::oid as o, 9223372036854775807::int8 as big,
      1.5::float4 as f4, 3.141592653589793::float8 as f8,
      '2021-06-02'::date as dt, '2021-06-02 12:34:56.789'::timestamp as ts,
      '2021-06-02 12:34:56.789+00'::timestamptz as tstz, '\\xdeadbeef00ff'::bytea as by,
      true as b, 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid as u, 'héllo €'::text as t, 1.50::numeric as n`
  const SHAPE: ShapeSpec = {
    i2: 'int2', i4: 'int4', o: 'oid', big: 'int8', f4: 'float4', f8: 'float8',
    dt: 'date', ts: 'timestamp', tstz: 'timestamptz', by: 'bytea',
    b: 'bool', u: 'uuid', t: 'text', n: 'numeric',
  }

  test('all-types shape (binary) decodes IDENTICALLY to the plain text query', async () => {
    await withConn(async (c) => {
      await c.query("SET TIME ZONE 'UTC'")
      const binary = (await c.query(SQL, [], { shape: SHAPE, mode: 'object' })).rows[0] as Record<string, unknown>
      const text = (await c.query(SQL, [], { mode: 'object' })).rows[0] as Record<string, unknown>
      expect(binary).toEqual(text)
      // and spot-check the actual decoded types/values (not just that both paths agree)
      expect(binary.big).toBe(9223372036854775807n)   // int8 -> BigInt (binInt8BigInt)
      expect(binary.i4).toBe(-2000000000)             // signed int4 via readInt32BE
      expect(binary.o).toBe(4294967295)               // oid unsigned via readUInt32BE
      expect(binary.f8).toBe(3.141592653589793)       // float8 exact IEEE
      expect(binary.tstz).toBeInstanceOf(Date)
      expect((binary.tstz as Date).toISOString()).toBe('2021-06-02T12:34:56.789Z')
      expect(binary.dt).toBeInstanceOf(Date)
      expect(Buffer.isBuffer(binary.by)).toBe(true)
      expect((binary.by as Buffer).toString('hex')).toBe('deadbeef00ff')
    })
  })

  test('low-year (0001-0099) temporal: shape binary agrees with plain text AND decodes the true year', async () => {
    // Regression: the text decoder used Date.UTC(Y,..) which remaps years 0-99 to 1900+Y; binary (raw wire
    // int) always decoded the true year -> a shape silently disagreed with a plain query. Now both agree.
    await withConn(async (c) => {
      await c.query("SET TIME ZONE 'UTC'")
      const sql = `select '0099-06-02 12:34:56.789'::timestamp as ts, '0050-01-01'::date as d,
                          '0001-03-04 05:06:07+00'::timestamptz as tstz`
      const shape = { ts: 'timestamp', d: 'date', tstz: 'timestamptz' } as const
      const binary = (await c.query(sql, [], { shape, mode: 'object' })).rows[0] as { ts: Date; d: Date; tstz: Date }
      const text = (await c.query(sql, [], { mode: 'object' })).rows[0] as { ts: Date; d: Date; tstz: Date }
      expect(binary).toEqual(text) // no 1900-year divergence between the two wire formats
      expect(binary.ts.getUTCFullYear()).toBe(99)  // NOT 1999
      expect(binary.d.getUTCFullYear()).toBe(50)   // NOT 1950
      expect(binary.tstz.getUTCFullYear()).toBe(1)  // NOT 1901
    })
  })

  test('temporal:string config downgrades a binary temporal shape column back to text', async () => {
    // resolveCols must clear the binary upgrade AND set :string, or the wire format (binary) and the mapper
    // would disagree — the value would come back a Date instead of the exact PG text.
    await withConn(async (c) => {
      await c.query("SET TIME ZONE 'UTC'")
      const r = await c.query("select '2021-06-02 12:34:56.789+00'::timestamptz as tstz", [], { shape: { tstz: 'timestamptz' }, mode: 'object' })
      expect(typeof (r.rows[0] as { tstz: unknown }).tstz).toBe('string')
      expect((r.rows[0] as { tstz: string }).tstz).toContain('2021-06-02 12:34:56.789')
    }, { temporal: 'string' })
  })

  test('float4 targets: :precise (binary, exact f32) vs :pretty/bare (text, canonical) — both variants', async () => {
    // float4:precise -> binary readFloatBE = the exact stored f32 (3.140000104904175). bare/:pretty -> text
    // Number(PG shortest) = the canonical 3.14. int8:number goes binary and is lossy >2^53 by design.
    await withConn(async (c) => {
      const r = await c.query('select 3.14::float4 as p, 3.14::float4 as y, 3.14::float4 as a, 9007199254740993::int8 as n', [],
        { shape: { p: 'float4:precise', y: 'float4:pretty', a: 'float4', n: 'int8:number' }, mode: 'object' })
      const row = r.rows[0] as { p: number; y: number; a: number; n: number }
      expect(row.p).toBe(3.140000104904175) // :precise -> exact f32 (binary)
      expect(row.y).toBe(3.14)               // :pretty  -> canonical (text)
      expect(row.a).toBe(3.14)               // bare     -> canonical (text)
      expect(typeof row.n).toBe('number')
    })
  })
})

// ============================================================================
describe('{ binary: true } forces the binary wire format for every column', () => {
  test('decodes binary-supported types, exposes raw bytes in buffer mode, errors on unsupported types', async () => {
    await withConn(async (c) => {
      await c.query("SET TIME ZONE 'UTC'")
      const r = await c.query(
        "select 42::int4 as i, 9223372036854775807::int8 as big, 3.5::float8 as f, '2021-06-02 12:34:56+00'::timestamptz as ts, '\\xdeadbeef'::bytea as by, true as ok",
        [], { binary: true, mode: 'object' },
      )
      expect(r.rows[0]).toEqual({ i: 42, big: 9223372036854775807n, f: 3.5, ts: new Date('2021-06-02T12:34:56Z'), by: Buffer.from('deadbeef', 'hex'), ok: true })
      // buffer mode + binary -> the raw binary wire bytes (int4 42 = 4 big-endian bytes)
      const raw = await c.query('select 42::int4 as i', [], { binary: true, mode: 'buffer' })
      expect((raw.rows[0] as (Buffer | null)[])[0]).toEqual(Buffer.from('0000002a', 'hex'))
      // a type with no binary decoder errors cleanly, and the connection stays usable
      await expect(c.query('select 1.5::numeric', [], { binary: true })).rejects.toThrow(/no binary decoder for oid 1700/)
      expect((await c.query('select 7::int4')).rows[0]).toEqual([7])
    })
  })
})
