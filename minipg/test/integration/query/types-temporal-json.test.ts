// Domain: types-temporal-json
// Pins minipg's decode/encode behavior for temporal (date/time/timetz/timestamp/
// timestamptz/interval) and JSON (json/jsonb/jsonb[]) types. Grounded in
// src/encode.ts: temporal types have no entry in defaultDecoders so they fall back
// to asString (verbatim UTF-8 passthrough — sidesteps the TZ-shift bug class);
// json(114)/jsonb(3802) decode via JSON.parse; params encode object/array via a
// single JSON.stringify, Date via toISOString().
import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { testConnect, testPool, withConn, caught, PgError } from '../../helpers/db.ts'
import { encodeParam } from '../../../src/encode.ts'
import { buildDecoders, decoderFor, defaultDecoders } from '../../../src/decode.ts'
import type { Connection } from '../../../src/index.ts'

// ---------- helpers ----------
const cell = (r: { rows: unknown[] }): unknown => (r.rows[0] as unknown[])[0]
const objRow = (r: { rows: unknown[] }): Record<string, unknown> => r.rows[0] as Record<string, unknown>

// ============================================================================
describe('temporal decode — string passthrough (ISO/UTC session)', () => {
  let c: Connection
  beforeAll(async () => {
    c = await testConnect({ temporal: 'string' }) // this block pins the exact-text decode (now the opt-in)
    await c.query("SET datestyle = 'ISO, YMD'")
    await c.query("SET TIME ZONE 'UTC'")
    await c.query("SET intervalstyle = 'postgres'")
  })
  afterAll(async () => { await c.end() })

  test("timestamp returns the exact literal string (no Date coercion)", async () => {
    const r = await c.query("SELECT '2020-06-01 13:45:00'::timestamp")
    expect(typeof cell(r)).toBe('string')
    expect(cell(r)).toBe('2020-06-01 13:45:00')
  })

  test('generate_series over timestamp yields 4 verbatim string rows, no DST distortion', async () => {
    const r = await c.query(
      "SELECT g::timestamp AS t FROM generate_series('2020-01-01'::timestamp, '2020-01-01 03:00', '1 hour') g",
      [], { mode: 'object' },
    )
    expect(r.rows.length).toBe(4)
    const vals = r.rows.map((row) => (row as Record<string, unknown>).t)
    expect(vals).toEqual([
      '2020-01-01 00:00:00', '2020-01-01 01:00:00',
      '2020-01-01 02:00:00', '2020-01-01 03:00:00',
    ])
    for (const v of vals) expect(typeof v).toBe('string')
  })

  test('large non-null timestamp select never yields spurious null', async () => {
    const r = await c.query(
      "SELECT (timestamp '2020-01-01' + (g || ' minutes')::interval)::timestamp AS t FROM generate_series(1, 200) g",
      [], { mode: 'object' },
    )
    expect(r.rows.length).toBe(200)
    for (const row of r.rows) {
      const v = (row as Record<string, unknown>).t
      expect(typeof v).toBe('string')
      expect((v as string).length).toBeGreaterThan(0)
    }
  })

  test('date returns the calendar day string verbatim (no rollover)', async () => {
    const r = await c.query("SELECT '1975-05-11'::date")
    expect(typeof cell(r)).toBe('string')
    expect(cell(r)).toBe('1975-05-11')
  })

  test('date and timestamp::date are internally consistent (no acquired time suffix)', async () => {
    const r = await c.query(
      "SELECT '2020-03-15'::date AS a, ('2020-03-15 09:00'::timestamp)::date AS b",
      [], { mode: 'object' },
    )
    const row = objRow(r)
    expect(row.a).toBe('2020-03-15')
    expect(row.b).toBe('2020-03-15')
  })

  test('time (1083) returns string verbatim', async () => {
    const r = await c.query("SELECT '12:34:56'::time")
    expect(cell(r)).toBe('12:34:56')
  })

  test('timetz (1266) is handled via string fallback, not dropped', async () => {
    const r = await c.query("SELECT '12:34:56+05:30'::timetz")
    expect(typeof cell(r)).toBe('string')
    expect(cell(r)).toBe('12:34:56+05:30')
  })

  test('interval text form survives verbatim incl. leading-zero fields', async () => {
    const r = await c.query("SELECT '1 year 2 mons 3 days 04:05:06'::interval AS a, '00:00:08'::interval AS b", [], { mode: 'object' })
    const row = objRow(r)
    expect(row.a).toBe('1 year 2 mons 3 days 04:05:06')
    expect(row.b).toBe('00:00:08')
  })

  test('negative interval keeps full negative text, no per-component sign flip', async () => {
    const r = await c.query("SELECT '-1 day -02:00:00'::interval")
    expect(cell(r)).toBe('-1 days -02:00:00')
  })

  test('BC era is preserved in timestamp text', async () => {
    const r = await c.query("SELECT '0063-01-01 00:00:00 BC'::timestamp")
    expect(cell(r) as string).toContain('BC')
  })

  test('5-digit year survives without truncation', async () => {
    const r = await c.query("SELECT '12020-01-01'::date")
    expect(cell(r)).toBe('12020-01-01')
  })

  test("infinity / -infinity timestamps pass through as strings", async () => {
    const pos = await c.query("SELECT 'infinity'::timestamp")
    const neg = await c.query("SELECT '-infinity'::timestamp")
    expect(pos.rows[0] && cell(pos)).toBe('infinity')
    expect(cell(neg)).toBe('-infinity')
  })

  test('microsecond precision is lossless (no truncation to ms)', async () => {
    const r = await c.query("SELECT '2020-01-01 00:00:00.123456'::timestamp")
    expect(cell(r)).toBe('2020-01-01 00:00:00.123456')
  })

  test('pre-2000 timestamp decodes correctly as string', async () => {
    const r = await c.query("SELECT '1970-01-01 00:00:01'::timestamp")
    expect(cell(r)).toBe('1970-01-01 00:00:01')
  })

  test('interval with iso_8601 style renders P3M', async () => {
    const c2 = await testConnect()
    try {
      await c2.query("SET intervalstyle = 'iso_8601'")
      const r = await c2.query("SELECT '3 months'::interval")
      expect(cell(r)).toBe('P3M')
    } finally { await c2.end() }
  })
})

// ============================================================================
describe('timestamptz decode — instant preserved, session-zone controls text', () => {
  test('same instant renders with the session TimeZone offset; minipg passes text through', async () => {
    await withConn(async (c) => {
      await c.query("SET TIME ZONE 'UTC'")
      const utc = await c.query("SELECT '2020-01-01 00:00:00+05:30'::timestamptz")
      expect(typeof cell(utc)).toBe('string')
      expect(cell(utc) as string).toContain('2019-12-31 18:30:00')

      await c.query("SET TIME ZONE 'Asia/Kolkata'")
      const ist = await c.query("SELECT '2020-01-01 00:00:00+05:30'::timestamptz")
      expect(cell(ist) as string).toContain('2020-01-01 00:00:00')

      // same instant regardless of textual offset
      expect(Date.parse(cell(utc) as string)).toBe(Date.parse(cell(ist) as string))
    }, { temporal: 'string' })
  })

  test('the same timestamptz literal selected twice decodes identically', async () => {
    await withConn(async (c) => {
      await c.query("SET TIME ZONE 'UTC'")
      const a = await c.query("SELECT '2020-06-01 12:00:00+00'::timestamptz")
      const b = await c.query("SELECT '2020-06-01 12:00:00+00'::timestamptz")
      expect(cell(a)).toBe(cell(b))
    }, { temporal: 'string' })
  })

  test('SET TIME ZONE on a pooled client affects subsequent timestamptz text', async () => {
    const pool = testPool({ max: 1, temporal: 'string' })
    try {
      const { client, release } = await pool.connect()
      try {
        await client.query("SET TIME ZONE 'UTC'")
        const utc = await client.query("SELECT '2020-01-01 00:00:00+05:30'::timestamptz")
        expect(cell(utc) as string).toContain('2019-12-31 18:30:00')
        await client.query("SET TIME ZONE 'Asia/Kolkata'")
        const ist = await client.query("SELECT '2020-01-01 00:00:00+05:30'::timestamptz")
        expect(cell(ist) as string).toContain('2020-01-01 00:00:00')
      } finally { release() }
    } finally { await pool.end() }
  })
})

// ============================================================================
describe('temporal param round-trips (Date / strings)', () => {
  test('JS Date round-trips through a timestamp column as its ISO wall clock', async () => {
    await withConn(async (c) => {
      await c.query("SET datestyle = 'ISO, YMD'")
      await c.query('CREATE TEMP TABLE rt_ts(id int4 primary key, ts timestamp)')
      const d = new Date(Date.UTC(2020, 5, 1, 13, 45, 0))
      await c.query('INSERT INTO rt_ts VALUES (1, $1)', [d])
      const r = await c.query('SELECT ts FROM rt_ts WHERE id = 1')
      // stored text is the ISO calendar/wall-clock (timestamp drops the Z offset)
      expect(cell(r)).toBe('2020-06-01 13:45:00')
    }, { temporal: 'string' })
  })

  test('JS Date round-trips through timestamptz preserving the instant under any session zone', async () => {
    await withConn(async (c) => {
      await c.query('CREATE TEMP TABLE rt_tstz(id int4 primary key, ts timestamptz)')
      const d = new Date(Date.UTC(2020, 5, 1, 13, 45, 0))
      await c.query('INSERT INTO rt_tstz VALUES (1, $1)', [d])
      await c.query("SET TIME ZONE 'Asia/Kolkata'")
      const r = await c.query('SELECT ts FROM rt_tstz WHERE id = 1')
      expect(d.getTime()).toBe(Date.parse(cell(r) as string))
    })
  })

  test('Date bound to timestamptz works under DateStyle MDY and YMD (ISO is unambiguous)', async () => {
    for (const style of ['MDY', 'YMD']) {
      await withConn(async (c) => {
        await c.query(`SET datestyle = 'ISO, ${style}'`)
        await c.query('CREATE TEMP TABLE ds_t(id int4 primary key, ts timestamptz)')
        const d = new Date(Date.UTC(2020, 5, 1, 13, 45, 0))
        await c.query('INSERT INTO ds_t VALUES (1, $1)', [d])
        const r = await c.query('SELECT ts FROM ds_t WHERE id = 1')
        expect(Date.parse(cell(r) as string)).toBe(d.getTime())
      })
    }
  })

  test('date-string params in BETWEEN match the same rows as the literal form', async () => {
    await withConn(async (c) => {
      await c.query('CREATE TEMP TABLE dr(id int4 primary key, d date)')
      await c.query("INSERT INTO dr VALUES (1,'2019-12-31'),(2,'2020-06-15'),(3,'2021-01-01')")
      const param = await c.query('SELECT id FROM dr WHERE d BETWEEN $1 AND $2 ORDER BY id', ['2020-01-01', '2020-12-31'], { mode: 'object' })
      const literal = await c.query("SELECT id FROM dr WHERE d BETWEEN '2020-01-01' AND '2020-12-31' ORDER BY id", [], { mode: 'object' })
      expect(param.rows).toEqual(literal.rows)
      expect(param.rows.length).toBe(1)
    })
  })

  test('ISO string with explicit offset stored to timestamptz preserves the instant; fractional seconds not split', async () => {
    await withConn(async (c) => {
      await c.query('CREATE TEMP TABLE so(id int4 primary key, ts timestamptz)')
      await c.query('INSERT INTO so VALUES (1, $1), (2, $2)', ['2020-01-01T00:00:00+05:00', '2020-01-01 00:00:00.123'])
      const r = await c.query('SELECT ts FROM so WHERE id = 1')
      expect(Date.parse(cell(r) as string)).toBe(Date.parse('2020-01-01T00:00:00+05:00'))
      const r2 = await c.query('SELECT ts FROM so WHERE id = 2')
      expect(cell(r2) as string).toContain('.123')
    }, { temporal: 'string' })
  })

  test('a bogus string bound as ::timestamptz yields a clean PgError, not an encoder crash', async () => {
    await withConn(async (c) => {
      const err = await caught(() => c.query('SELECT $1::timestamptz', ['to_timestamp(now())']))
      expect(err).toBeInstanceOf(PgError)
    })
  })
})

// ============================================================================
describe('temporal param encoding (unit, encode.ts)', () => {
  test('encodeParam(Date) yields text-format ISO bytes', () => {
    const e = encodeParam(new Date('2020-06-01T13:45:00.000Z'))
    expect(e.format).toBe(0)
    expect(e.bytes?.toString('utf8')).toBe('2020-06-01T13:45:00.000Z')
  })

  test('encodeParam(invalid Date) throws (RangeError from toISOString), not NaN bytes', () => {
    expect(() => encodeParam(new Date(undefined as unknown as number))).toThrow()
  })

  test('Date param equals the same ISO string embedded in jsonb (encoder consistency)', async () => {
    await withConn(async (c) => {
      const d = new Date('2020-06-01T13:45:00.000Z')
      const r = await c.query("SELECT ($1::text) AS a, (($2::jsonb)->>'t') AS b", [d, { t: d }], { mode: 'object' })
      const row = objRow(r)
      expect(row.a).toBe('2020-06-01T13:45:00.000Z')
      expect(row.b).toBe('2020-06-01T13:45:00.000Z')
    })
  })
})

// ============================================================================
describe('temporal custom decoder override (opt-in)', () => {
  test('config.types {1114: ...} makes timestamp columns return JS Date', async () => {
    const c = await testConnect({ types: { 1114: (b) => new Date(b.toString('utf8') + 'Z') } })
    try {
      await c.query("SET datestyle = 'ISO, YMD'")
      const r = await c.query("SELECT '2020-06-01 13:45:00'::timestamp")
      const v = cell(r)
      expect(v).toBeInstanceOf(Date)
      expect((v as Date).getTime()).toBe(Date.UTC(2020, 5, 1, 13, 45, 0))
    } finally { await c.end() }
  })

  test('a timestamp inside json_build_object bypasses the OID-1114 decoder; bare column does not', async () => {
    const c = await testConnect({ types: { 1114: () => 'DECODED' } })
    try {
      await c.query("SET datestyle = 'ISO, YMD'")
      const nested = await c.query("SELECT json_build_object('t', '2020-01-01 00:00:00'::timestamp) AS j", [], { mode: 'object' })
      // nested value is plain parsed JSON string, NOT 'DECODED'
      expect((objRow(nested).j as Record<string, unknown>).t).toBe('2020-01-01T00:00:00')
      const bare = await c.query("SELECT '2020-01-01 00:00:00'::timestamp")
      expect(cell(bare)).toBe('DECODED')
    } finally { await c.end() }
  })

  test('custom timestamp decoder applies to both literal and computed-expression columns', async () => {
    const c = await testConnect({ types: { 1114: () => 'X' } })
    try {
      const r = await c.query("SELECT '2020-01-01'::timestamp AS a, ('2020-01-01'::timestamp + '1 day'::interval) AS b", [], { mode: 'object' })
      const row = objRow(r)
      expect(row.a).toBe('X')
      expect(row.b).toBe('X')
    } finally { await c.end() }
  })
})

// ============================================================================
describe('[roadmap] built-in temporal Date decoders', () => {
  test.todo('built-in timestamptz(1184)->Date at correct instant regardless of host TZ', () => {})
  test.todo('built-in date(1082)->Date with no negative-offset rollover', () => {})
  test.todo('parse-as-UTC option: timestamp wall clock maps to getUTCHours()', () => {})
  test.todo('sub-ms rounding rule pinned for the built-in Date decoder', () => {})
  test.todo('interval(1186) structured decoder yields a fully-zeroed object for 00:00:00', () => {})
  test.todo('Temporal.Instant / Temporal.PlainDate round-trip equivalently to Date', () => {})
})

// ============================================================================
describe('json / jsonb decode to JS values', () => {
  let c: Connection
  beforeAll(async () => { c = await testConnect() })
  afterAll(async () => { await c.end() })

  test('jsonb object and json array decode to JS values, not strings', async () => {
    const o = await c.query(`SELECT '{"a":1,"b":"x"}'::jsonb`)
    expect(cell(o)).toEqual({ a: 1, b: 'x' })
    const a = await c.query(`SELECT '[1,2,3]'::json`)
    expect(cell(a)).toEqual([1, 2, 3])
  })

  test('empty json arrays decode to JS [] not the string "[]"', async () => {
    const r = await c.query(`SELECT to_jsonb(ARRAY[]::int[]) AS a, COALESCE(array_to_json(ARRAY[]::int[]),'[]')::json AS b`, [], { mode: 'object' })
    const row = objRow(r)
    expect(row.a).toEqual([])
    expect(row.b).toEqual([])
  })

  test('a SQL-NULL jsonb path decodes to JS null', async () => {
    const r = await c.query(`SELECT ('{"a":1}'::jsonb)->'missing'`)
    expect(cell(r)).toBeNull()
  })

  test("the JSON literal null ('null'::jsonb) decodes to JS null via JSON.parse", async () => {
    const r = await c.query(`SELECT 'null'::jsonb`)
    expect(cell(r)).toBeNull()
  })

  test('scalar JSON decodes through JSON.parse (string / boolean)', () => {
    const dec = decoderFor(3802, defaultDecoders)
    expect(dec(Buffer.from('"x"'))).toBe('x')
    expect(dec(Buffer.from('true'))).toBe(true)
  })
})

// ============================================================================
describe('json / jsonb param serialization', () => {
  test('object binds to $1::jsonb and reads back deep-equal (no manual stringify)', async () => {
    await withConn(async (c) => {
      const r = await c.query('SELECT $1::jsonb AS j', [{ a: 1, b: 'x' }], { mode: 'object' })
      expect(objRow(r).j).toEqual({ a: 1, b: 'x' })
    })
  })

  // NOTE: since Option A, an UNTYPED JS array encodes as a PG '{…}' literal, so binding a JS array to jsonb
  // must DECLARE it (params:['jsonb']) — otherwise '{1,2,3}' is invalid jsonb.
  test('a jsonb-declared array binds as a JSON array [1,2,3] (params:[jsonb])', async () => {
    await withConn(async (c) => {
      const r = await c.query('SELECT $1 AS j', [[1, 2, 3]], { params: ['jsonb'], mode: 'object' })
      expect(objRow(r).j).toEqual([1, 2, 3])
    })
  })

  test('empty jsonb-declared array reads back as JS [] (params:[jsonb])', async () => {
    await withConn(async (c) => {
      const r = await c.query('SELECT $1 AS j', [[]], { params: ['jsonb'], mode: 'object' })
      expect(objRow(r).j).toEqual([])
    })
  })

  test('nested/object/boolean jsonb-declared arrays round-trip as proper JSON (params:[jsonb])', async () => {
    await withConn(async (c) => {
      const r1 = await c.query('SELECT $1 AS j', [[{ x: 1 }, { y: 2 }]], { params: ['jsonb'], mode: 'object' })
      expect(objRow(r1).j).toEqual([{ x: 1 }, { y: 2 }])
      const r2 = await c.query('SELECT $1 AS j', [[true, false]], { params: ['jsonb'], mode: 'object' })
      expect(objRow(r2).j).toEqual([true, false])
    })
  })

  test('bare JS string is sent as raw text: invalid JSON errors, pre-quoted JSON works', async () => {
    await withConn(async (c) => {
      const err = await caught(() => c.query('SELECT $1::jsonb', ['hello']))
      expect((err as PgError).code).toBe('22P02')
      const ok = await c.query('SELECT $1::jsonb AS j', ['"hello"'], { mode: 'object' })
      expect(objRow(ok).j).toBe('hello')
    })
  })

  test('JS boolean true bound to ::jsonb emits text "t" -> 22P02 (footgun)', async () => {
    await withConn(async (c) => {
      const err = await caught(() => c.query('SELECT $1::jsonb', [true]))
      expect((err as PgError).code).toBe('22P02')
    })
  })

  test('null / undefined bound to a jsonb param send SQL NULL', async () => {
    await withConn(async (c) => {
      const r1 = await c.query('SELECT $1::jsonb AS j', [null], { mode: 'object' })
      expect(objRow(r1).j).toBeNull()
      const r2 = await c.query('SELECT $1::jsonb AS j', [undefined], { mode: 'object' })
      expect(objRow(r2).j).toBeNull()
    })
  })

  test('empty object {} binds without invalid-input error', async () => {
    await withConn(async (c) => {
      const r = await c.query('SELECT $1::jsonb AS j', [{}], { mode: 'object' })
      expect(objRow(r).j).toEqual({})
    })
  })

  test('undefined-valued keys are omitted per JSON.stringify semantics', async () => {
    await withConn(async (c) => {
      const r = await c.query('SELECT $1::jsonb AS j', [{ a: 1, b: undefined }], { mode: 'object' })
      expect(objRow(r).j).toEqual({ a: 1 })
    })
  })
})

// ============================================================================
describe('bigint-in-json precision', () => {
  test('default JSON.parse loses precision above 2^53 (documented lossy behavior)', async () => {
    await withConn(async (c) => {
      const r = await c.query("SELECT json_build_object('big', 9007199254740993::int8) AS j", [], { mode: 'object' })
      expect((objRow(r).j as Record<string, unknown>).big).toBe(9007199254740992)
    })
  })

  test('column-level int8 is lossless (decodes to BigInt)', async () => {
    await withConn(async (c) => {
      const r = await c.query('SELECT 9007199254740993::int8')
      expect(cell(r)).toBe(9007199254740993n)
    })
  })

  test('numeric/timestamp nested in row_to_json are raw JSON, not re-run through per-OID parsers', async () => {
    const c = await testConnect({ types: { 1700: () => 'NUM_DECODED' } })
    try {
      await c.query("SET datestyle = 'ISO, YMD'")
      const r = await c.query("SELECT row_to_json(t) AS j FROM (SELECT 1.5::numeric AS n) t", [], { mode: 'object' })
      // nested numeric is the raw JSON number 1.5, NOT 'NUM_DECODED'
      expect((objRow(r).j as Record<string, unknown>).n).toBe(1.5)
    } finally { await c.end() }
  })

  test('overriding OID 3802 with a raw-text parser preserves a bigint exactly', async () => {
    const c = await testConnect({ types: { 3802: (b) => b.toString('utf8') } })
    try {
      const r = await c.query("SELECT jsonb_build_object('big', 9007199254740993::int8)")
      expect(cell(r) as string).toContain('9007199254740993')
    } finally { await c.end() }
  })
})

// ============================================================================
describe('json parser override / raw passthrough', () => {
  test('config.types {3802: raw} returns exact raw JSON text incl. scalar JSON', async () => {
    const c = await testConnect({ types: { 3802: (b) => b.toString('utf8') } })
    try {
      const r = await c.query(`SELECT '"x"'::jsonb`)
      expect(cell(r)).toBe('"x"')
    } finally { await c.end() }
  })

  test('buildDecoders merges per-OID overrides without clobbering base map', () => {
    const id = (b: Buffer): unknown => b
    const m = buildDecoders({ 114: id, 3802: id })
    // overrides are applied (wrapped to the internal offset form), so they run instead of the
    // default json decoder — verify by behavior rather than function identity.
    expect((decoderFor(114, m)(Buffer.from('hi')) as Buffer).toString()).toBe('hi')
    expect((decoderFor(3802, m)(Buffer.from('yo')) as Buffer).toString()).toBe('yo')
    // unrelated OIDs keep defaults: int4 still decodes to number
    expect(decoderFor(23, m)(Buffer.from('42'))).toBe(42)
    // and the base map itself is untouched
    expect(decoderFor(114, defaultDecoders)).not.toBe(id)
  })
})

// ============================================================================
describe('double-encoding footgun guard', () => {
  test('object inserted into a jsonb column round-trips as object (no double-escape), incl. concurrent pool inserts', async () => {
    const pool = testPool({ max: 4 })
    try {
      const setup = await pool.connect()
      try {
        await setup.client.query('CREATE TABLE IF NOT EXISTS de_probe(id int4 primary key, j jsonb)')
      } finally { setup.release() }
      // unique id space to avoid collisions; clean up after.
      const base = 900000
      await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          pool.query('INSERT INTO de_probe(id, j) VALUES ($1, $2)', [base + i, { a: i, nested: { b: 'x' } }]),
        ),
      )
      for (let i = 0; i < 8; i++) {
        const r = await pool.query('SELECT j FROM de_probe WHERE id = $1', [base + i], { mode: 'object' })
        expect((r.rows[0] as unknown as Record<string, unknown>).j).toEqual({ a: i, nested: { b: 'x' } })
      }
      await pool.query('DELETE FROM de_probe WHERE id >= $1 AND id < $2', [base, base + 100])
      const drop = await pool.connect()
      try { await drop.client.query('DROP TABLE IF EXISTS de_probe') } finally { drop.release() }
    } finally { await pool.end() }
  })

  test('a pre-stringified JSON string via the string param path is single-encoded', async () => {
    await withConn(async (c) => {
      const r = await c.query('SELECT $1::jsonb AS j', [JSON.stringify({ a: 1 })], { mode: 'object' })
      expect(objRow(r).j).toEqual({ a: 1 })
    })
  })
})

// ============================================================================
describe('jsonb[] (array-of-json column)', () => {
  test('a JS array of objects now binds to a jsonb[] column (Option A + object-element JSON)', async () => {
    await withConn(async (c) => {
      await c.query('CREATE TEMP TABLE ja(id int4 primary key, jba jsonb[])')
      // untyped array -> arrayLiteral, object elements JSON.stringify'd -> {"{\"x\":1}","{\"y\":2}"}; the INSERT target types $1 as jsonb[]
      await c.query('INSERT INTO ja VALUES (1, $1)', [[{ x: 1 }, { y: 2 }]])
      expect((await c.query('SELECT cardinality(jba) FROM ja WHERE id = 1')).rows[0]![0]).toBe(2)
    })
  })

  test('reading a jsonb[] column parses each element (wire OID 3807 binds the array decoder)', async () => {
    await withConn(async (c) => {
      await c.query('CREATE TEMP TABLE ja2(id int4 primary key, jba jsonb[])')
      await c.query(`INSERT INTO ja2 VALUES (1, ARRAY['{"a":1}'::jsonb, '{"b":2}'::jsonb])`)
      const r = await c.query('SELECT jba FROM ja2 WHERE id = 1')
      expect(cell(r)).toEqual([{ a: 1 }, { b: 2 }])
    })
  })
})

// ============================================================================
describe('comparison / cast ergonomics + out-of-scope guards', () => {
  test('= $1::json fails (no json equality op); ::jsonb succeeds', async () => {
    await withConn(async (c) => {
      await c.query('CREATE TEMP TABLE jc(id int4 primary key, j json)')
      await c.query(`INSERT INTO jc VALUES (1, '{"a":1}')`)
      const err = await caught(() => c.query('SELECT id FROM jc WHERE j = $1::json', [{ a: 1 }]))
      expect((err as PgError).code).toBe('42883')
      const ok = await c.query('SELECT id FROM jc WHERE j::jsonb = $1::jsonb', [{ a: 1 }], { mode: 'object' })
      expect(ok.rows.length).toBe(1)
    })
  })

  test('jsonb keys are never rewritten — returned verbatim incl. underscores and backslashes', async () => {
    await withConn(async (c) => {
      const r = await c.query(`SELECT '{"a_b":1,"c\\\\d":2}'::jsonb AS j`, [], { mode: 'object' })
      const j = objRow(r).j as Record<string, unknown>
      expect(j.a_b).toBe(1)
      expect(j['c\\d']).toBe(2)
    })
  })

  test('temporal/JSON decoding flows only through the extended-protocol query path', async () => {
    await withConn(async (c) => {
      const r = await c.query(`SELECT '{"a":1}'::jsonb AS j`, [], { mode: 'object' })
      expect(objRow(r).j).toEqual({ a: 1 })
    })
  })
})
