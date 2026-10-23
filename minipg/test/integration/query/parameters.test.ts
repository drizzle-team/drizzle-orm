// Domain: "parameters" — how JS values bind to $1..$N in the extended protocol.
// minipg does ZERO client-side SQL parsing: SQL is sent verbatim to Parse (only a
// NUL guard inspects it), Parse declares 0 param-type OIDs (server infers types),
// and Bind ships encodeParam()'d values in order. These tests pin that contract.
// Requires a running cluster (see test/helpers/db.ts). public.t is READ-ONLY.
import { test, expect, describe } from 'bun:test'
import { testConnect, caught, PgError } from '../../helpers/db.ts'
import { encodeParam } from '../../../src/encode.ts'

// ---- helpers for strict TS (noUncheckedIndexedAccess) ----
const NUL = String.fromCharCode(0) // an actual 0x00 byte (source stays printable)
const cell0 = (r: { rows: unknown[] }): unknown => (r.rows[0] as unknown[])[0]
const obj0 = (r: { rows: unknown[] }): Record<string, unknown> => r.rows[0] as Record<string, unknown>

describe('encodeParam (unit) — JS value -> Bind bytes', () => {
  test('null and undefined both encode to SQL NULL (format 0, bytes null), never throw', () => {
    expect(encodeParam(null)).toEqual({ format: 0, bytes: null })
    expect(encodeParam(undefined)).toEqual({ format: 0, bytes: null })
  })

  test('boolean -> t / f (text)', () => {
    expect(encodeParam(true).bytes?.toString('utf8')).toBe('t')
    expect(encodeParam(false).bytes?.toString('utf8')).toBe('f')
    expect(encodeParam(true).format).toBe(0)
  })

  test('bigint goes through the String() path with no precision loss', () => {
    expect(encodeParam(9007199254740993n).bytes?.toString('utf8')).toBe('9007199254740993')
    expect(encodeParam(0n).bytes?.toString('utf8')).toBe('0')
    expect(encodeParam(-12345678901234567890n).bytes?.toString('utf8')).toBe('-12345678901234567890')
  })

  test('Date -> ISO-8601 UTC text, format 0', () => {
    const d = new Date('2020-03-04T05:06:07.890Z')
    const e = encodeParam(d)
    expect(e.format).toBe(0)
    expect(e.bytes?.toString('utf8')).toBe('2020-03-04T05:06:07.890Z')
  })

  test('Buffer -> binary param (format 1) referencing the same bytes', () => {
    const b = Buffer.from([0x00, 0x01, 0xff, 0x7f])
    const e = encodeParam(b)
    expect(e.format).toBe(1)
    expect(e.bytes).toBeInstanceOf(Buffer)
    expect(Buffer.compare(e.bytes as Buffer, b)).toBe(0)
  })

  test('plain object -> JSON.stringify; custom toJSON() honored exactly once', () => {
    expect(encodeParam({ a: 1 }).bytes?.toString('utf8')).toBe('{"a":1}')
    const withToJSON = { toJSON() { return { x: 1 } } }
    expect(encodeParam(withToJSON).bytes?.toString('utf8')).toBe('{"x":1}')
  })

  test('a JS array encodes as a PG array literal {1,2,3} (Option A), NOT JSON', () => {
    expect(encodeParam([1, 2, 3]).bytes?.toString('utf8')).toBe('{1,2,3}')
    // a null element becomes an unquoted SQL NULL inside the array literal
    expect(encodeParam([1, null, 2]).bytes?.toString('utf8')).toBe('{1,NULL,2}')
  })

  test('footgun: Set / Map serialize to {} (their members are lost), silently', () => {
    expect(encodeParam(new Set([1, 2, 3])).bytes?.toString('utf8')).toBe('{}')
    expect(encodeParam(new Map([['a', 1]])).bytes?.toString('utf8')).toBe('{}')
  })

  test('footgun: a Promise serializes to {} (silently bound blank, not thrown)', () => {
    // note: current behavior; a future "throw on thenable" would be a deliberate change
    expect(encodeParam(Promise.resolve(1)).bytes?.toString('utf8')).toBe('{}')
  })

  test('a NUL byte in a text param throws /NUL/ (String path guard)', () => {
    expect(() => encodeParam('a' + NUL + 'b')).toThrow(/NUL/)
  })

  test('order-preserving & 1:1 with input length (no dedup of repeated values)', () => {
    const out = [5, 5, 'x', 5].map(encodeParam)
    expect(out.length).toBe(4)
    expect(out.map((e) => e.bytes?.toString('utf8'))).toEqual(['5', '5', 'x', '5'])
  })

  test('query() does not mutate the caller params array', () => {
    const params: unknown[] = [1, 'two', new Date('2020-01-01T00:00:00Z')]
    const snapshot = [params[0], params[1], params[2]]
    params.map(encodeParam) // same call query() makes internally
    expect(params[0]).toBe(snapshot[0])
    expect(params[1]).toBe(snapshot[1])
    expect(params[2]).toBe(snapshot[2]) // same Date reference, not mutated/stringified
  })
})

describe('positional placeholders & verbatim transmission', () => {
  test('$1,$2 map positionally', async () => {
    const c = await testConnect()
    try {
      const r = await c.query('select $1::int as a, $2::text as b', [7, 'x'])
      expect(cell0(r)).toBe(7)
      expect((r.rows[0] as unknown[])[1]).toBe('x')
    } finally { await c.end() }
  })

  test('a reused placeholder binds the single value to every occurrence', async () => {
    const c = await testConnect()
    try {
      const r = await c.query('select $1::int + $1::int as s', [5])
      expect(cell0(r)).toBe(10)
    } finally { await c.end() }
  })

  test('multi-digit indices ($10,$11,...) bind to the correct positions (no $1+0 misparse)', async () => {
    const c = await testConnect()
    try {
      const params = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11']
      // reference every placeholder (else $2..$9 are uninferable -> 42P18); the point is
      // that $10/$11 parse as indices 10/11, not $1 followed by a literal 0/1.
      const sql = 'select ' + params.map((_, i) => `$${i + 1}::text`).join(',')
      const r = await c.query(sql, params)
      const row = r.rows[0] as unknown[]
      expect(row[0]).toBe('p1')
      expect(row[9]).toBe('p10')
      expect(row[10]).toBe('p11')
    } finally { await c.end() }
  })

  test('an embedded $2 inside a string VALUE is data, never a second placeholder', async () => {
    const c = await testConnect()
    try {
      const r = await c.query('select $1::text as v', ['$2 not a placeholder'])
      expect(cell0(r)).toBe('$2 not a placeholder')
    } finally { await c.end() }
  })

  test('? is NOT rewritten to $1: reaches the server verbatim and is a 42601 syntax error', async () => {
    const c = await testConnect()
    try {
      const err = await caught(() => c.query('select 1 where 1=?', [1]))
      expect((err as PgError).code).toBe('42601')
    } finally { await c.end() }
  })

  test('empty / omitted param list both succeed', async () => {
    const c = await testConnect()
    try {
      expect(cell0(await c.query('select 1', []))).toBe(1)
      expect(cell0(await c.query('select 1'))).toBe(1)
    } finally { await c.end() }
  })

  test('a verbatim value with quotes / ; / -- is treated as DATA, not SQL', async () => {
    const c = await testConnect()
    try {
      const evil = `Robert'); DROP TABLE students; --`
      const r = await c.query('select $1::text as v', [evil])
      expect(cell0(r)).toBe(evil)
    } finally { await c.end() }
  })
})

describe('NULL and undefined binding', () => {
  test('null into integer / uuid / text columns stores SQL NULL (no invalid-input errors)', async () => {
    const c = await testConnect()
    try {
      await c.query('create temp table param_null_t (i int, u uuid, t text)')
      await c.query('insert into param_null_t (i,u,t) values ($1,$2,$3)', [null, null, null])
      const r = await c.query('select i,u,t from param_null_t', [], { mode: 'object' })
      const row = obj0(r)
      expect(row.i).toBeNull()
      expect(row.u).toBeNull()
      expect(row.t).toBeNull()
    } finally { await c.end() }
  })

  test('undefined binds as SQL NULL (minipg fixed policy = NULL), round-trips as null', async () => {
    const c = await testConnect()
    try {
      await c.query('create temp table param_undef_t (t text)')
      await c.query('insert into param_undef_t (t) values ($1)', [undefined])
      const r = await c.query('select t from param_undef_t')
      expect(cell0(r)).toBeNull()
    } finally { await c.end() }
  })

  test('select $1::int is null with [null] -> true (explicit cast resolves the type)', async () => {
    const c = await testConnect()
    try {
      expect(cell0(await c.query('select $1::int is null', [null]))).toBe(true)
    } finally { await c.end() }
  })

  test('bare select $1 with [null] succeeds (server infers text) and returns null', async () => {
    const c = await testConnect()
    try {
      // note: a *bare* `select $1` is inferable as text; `$1 is null` is not (see type-inference group)
      expect(cell0(await c.query('select $1', [null]))).toBeNull()
    } finally { await c.end() }
  })

  test('a null element inside a jsonb-declared array param is JSON null (params:[jsonb] keeps it JSON)', async () => {
    const c = await testConnect()
    try {
      // untyped, a JS array now encodes as a PG '{…}' literal (Option A); declare jsonb to keep it JSON
      const r = await c.query('select $1 as j', [[1, null, 2]], { params: ['jsonb'] })
      expect(cell0(r)).toEqual([1, null, 2])
    } finally { await c.end() }
  })
})

describe('number / bigint / boolean / string scalar encoding', () => {
  test('JS number into ::int binds as integer', async () => {
    const c = await testConnect()
    try {
      expect(cell0(await c.query('select $1::int', [123]))).toBe(123)
    } finally { await c.end() }
  })

  test('float8 round-trips; integer-valued float stringifies cleanly', async () => {
    const c = await testConnect()
    try {
      expect(cell0(await c.query('select $1::float8', [1.5]))).toBe(1.5)
      expect(cell0(await c.query('select $1::int', [8.0]))).toBe(8) // String(8.0) === '8'
    } finally { await c.end() }
  })

  test('bigint round-trips through ::int8 as BigInt with no precision loss', async () => {
    const c = await testConnect()
    try {
      // int8 decodes to a JS BigInt in minipg (precision-safe)
      expect(cell0(await c.query('select $1::int8', [9007199254740993n]))).toBe(9007199254740993n)
      expect(cell0(await c.query('select $1::int8', [0n]))).toBe(0n)
      expect(cell0(await c.query('select $1::int8', [-9007199254740993n]))).toBe(-9007199254740993n)
    } finally { await c.end() }
  })

  test('boolean true/false -> ::bool returns true/false', async () => {
    const c = await testConnect()
    try {
      expect(cell0(await c.query('select $1::bool', [true]))).toBe(true)
      expect(cell0(await c.query('select $1::bool', [false]))).toBe(false)
    } finally { await c.end() }
  })

  test('strings with quotes/backslash/regex/commas stored verbatim, no escaping/injection', async () => {
    const c = await testConnect()
    try {
      const s = `it's a "test", \\s\\w+$ , 50% off`
      expect(cell0(await c.query('select $1::text', [s]))).toBe(s)
    } finally { await c.end() }
  })

  test('the full string is transmitted (first char not stripped)', async () => {
    const c = await testConnect()
    try {
      const s = 'Xhello world'
      const r = await c.query('select $1::text as v, length($1::text) as n', [s])
      expect(cell0(r)).toBe(s)
      expect((r.rows[0] as unknown[])[1]).toBe(s.length)
    } finally { await c.end() }
  })

  test('numeric LIMIT $1 binds and limits rows', async () => {
    const c = await testConnect()
    try {
      const r = await c.query('select g from generate_series(1,100) g limit $1', [5])
      expect(r.rows.length).toBe(5)
    } finally { await c.end() }
  })
})

describe('Date / Buffer (binary) encoding', () => {
  test('Date -> ::timestamptz round-trips to the same instant', async () => {
    const c = await testConnect()
    try {
      const d = new Date('2021-07-08T09:10:11.000Z')
      const r = await c.query('select $1::timestamptz = $2::timestamptz as eq', [d, '2021-07-08T09:10:11Z'])
      expect(cell0(r)).toBe(true)
    } finally { await c.end() }
  })

  test('Buffer -> ::bytea round-trips exact bytes including high bytes', async () => {
    const c = await testConnect()
    try {
      const b = Buffer.from([0x01, 0x10, 0xff, 0x80, 0x7f])
      const r = await c.query('select $1::bytea as b', [b], { mode: 'object' })
      const out = obj0(r).b as Buffer
      expect(Buffer.isBuffer(out)).toBe(true)
      expect(Buffer.compare(out, b)).toBe(0)
    } finally { await c.end() }
  })

  test('a Buffer CONTAINING 0x00 is accepted (binary path skips the NUL guard) and stored byte-exact', async () => {
    const c = await testConnect()
    try {
      const b = Buffer.from([0x00, 0x41, 0x00, 0x42, 0x00])
      const r = await c.query('select $1::bytea as b', [b], { mode: 'object' })
      const out = obj0(r).b as Buffer
      expect(Buffer.compare(out, b)).toBe(0)
    } finally { await c.end() }
  })

  test('encoding is deterministic & does not mutate the input Buffer across two calls', async () => {
    const c = await testConnect()
    try {
      const b = Buffer.from([0x09, 0x08, 0x07])
      const copy = Buffer.from(b)
      await c.query('select $1::bytea', [b])
      await c.query('select $1::bytea', [b])
      expect(Buffer.compare(b, copy)).toBe(0) // unchanged
    } finally { await c.end() }
  })
})

describe('object / JSON & the JS-array footgun', () => {
  test('plain object -> ::jsonb parses back to the same object', async () => {
    const c = await testConnect()
    try {
      const r = await c.query('select $1::jsonb as j', [{ a: 1, b: [2, 3], c: 'x' }])
      expect(cell0(r)).toEqual({ a: 1, b: [2, 3], c: 'x' })
    } finally { await c.end() }
  })

  test('a JS array to ::int[] / =ANY($1) now WORKS (Option A: encoded as {1,2,3})', async () => {
    const c = await testConnect()
    try {
      expect(cell0(await c.query('select 2 = any($1::int[])', [[1, 2, 3]]))).toBe(true)
      expect(cell0(await c.query('select 9 = any($1::int[])', [[1, 2, 3]]))).toBe(false)
    } finally { await c.end() }
  })

  test('the working idiom: pass the literal string {1,2,3} to ::int[] / =ANY($1)', async () => {
    const c = await testConnect()
    try {
      expect(cell0(await c.query('select 2 = any($1::int[])', ['{1,2,3}']))).toBe(true)
      expect(cell0(await c.query('select 9 = any($1::int[])', ['{1,2,3}']))).toBe(false)
    } finally { await c.end() }
  })

  test('a JS array into a jsonb column: DECLARE jsonb (an untyped array is now a PG literal)', async () => {
    const c = await testConnect()
    try {
      await c.query('create temp table param_json_t (j jsonb)')
      // untyped, a JS array is now a PG array literal '{1,2,3}' (invalid jsonb) — declare jsonb to store a JSON array
      await c.query('insert into param_json_t (j) values ($1)', [[1, 2, 3]], { params: ['jsonb'] })
      const r = await c.query('select j from param_json_t')
      expect(cell0(r)).toEqual([1, 2, 3])
    } finally { await c.end() }
  })

  test('a bigint nested in an object param throws cleanly (BigInt) and the connection survives', async () => {
    const c = await testConnect()
    try {
      const err = await caught(() => c.query('select $1::jsonb', [{ a: 1n }]))
      expect((err as Error).message).toMatch(/BigInt/i)
      // queue not wedged: the next query runs fine
      expect(cell0(await c.query('select 42::int4'))).toBe(42)
    } finally { await c.end() }
  })
})

describe('parameter count, mismatch & limit', () => {
  test('too FEW params -> 08P01, connection recovers', async () => {
    const c = await testConnect()
    try {
      const err = await caught(() => c.query('select $1,$2', [1]))
      expect((err as PgError).code).toBe('08P01')
      expect(cell0(await c.query('select 1'))).toBe(1) // recovered
    } finally { await c.end() }
  })

  test('too MANY params -> 08P01 (extras not silently dropped)', async () => {
    const c = await testConnect()
    try {
      const err = await caught(() => c.query('select $1::int', [1, 2]))
      expect((err as PgError).code).toBe('08P01')
    } finally { await c.end() }
  })

  test("$1 inside a single-quoted literal is 0 placeholders -> 08P01", async () => {
    const c = await testConnect()
    try {
      const err = await caught(() => c.query("select '$1'", [1]))
      expect((err as PgError).code).toBe('08P01')
    } finally { await c.end() }
  })

  test("LIKE: '%$1%' is a count mismatch; '%'||$1||'%' is the correct form", async () => {
    const c = await testConnect()
    try {
      const err = await caught(() => c.query("select 'smith' like '%$1%'", ['smith']))
      expect((err as PgError).code).toBe('08P01')
      expect(cell0(await c.query("select 'smith' like '%'||$1||'%'", ['mit']))).toBe(true)
    } finally { await c.end() }
  })

  test('exactly N placeholders + N params binds with no mismatch (bulk)', async () => {
    const c = await testConnect()
    try {
      const N = 300
      const params = Array.from({ length: N }, (_, i) => i + 1)
      const sql = 'select ' + params.map((_, i) => `$${i + 1}::int`).join(',')
      const r = await c.query(sql, params)
      expect((r.rows[0] as unknown[]).length).toBe(N)
      expect(cell0(r)).toBe(1)
      expect((r.rows[0] as unknown[])[N - 1]).toBe(N)
    } finally { await c.end() }
  })

  test('client-side guard: >65535 params reject with /too many bind parameters/ (not PgError); connection survives', async () => {
    const c = await testConnect()
    try {
      const err = await caught(() => c.query('select 1', new Array(65536).fill(1)))
      expect(err).not.toBeInstanceOf(PgError)
      expect((err as Error).message).toMatch(/too many bind parameters/)
      // note: the driver has a clean client-side max-65535 guard in protocol.ts (W.bind),
      // so no corrupted/truncated 16-bit count is ever written.
      expect(cell0(await c.query('select 7::int4'))).toBe(7)
    } finally { await c.end() }
  })

  test('boundary: exactly 65535 params reaches the server (08P01 count mismatch vs `select 1`)', async () => {
    const c = await testConnect()
    try {
      const err = await caught(() => c.query('select 1', new Array(65535).fill(1)))
      expect((err as PgError).code).toBe('08P01') // sent to server, server reports mismatch
    } finally { await c.end() }
  })

  test('non-array params (e.g. a string) -> TypeError caught in startTask -> reject; queue not wedged', async () => {
    const c = await testConnect()
    try {
      const err = await caught(() => c.query('select 1', 'nope' as unknown as unknown[]))
      expect((err as Error).message).toMatch(/params must be an array/)
      expect(cell0(await c.query('select 8::int4'))).toBe(8)
    } finally { await c.end() }
  })
})

describe('type inference by server & explicit casts', () => {
  test('$1 is null (no cast) -> 42P18; adding ::int succeeds', async () => {
    const c = await testConnect()
    try {
      const err = await caught(() => c.query('select $1 is null', [null]))
      expect((err as PgError).code).toBe('42P18')
      expect(cell0(await c.query('select $1::int is null', [null]))).toBe(true)
    } finally { await c.end() }
  })

  test('cast must FOLLOW the placeholder: now()+$1::interval works; INTERVAL $1 is 42601', async () => {
    const c = await testConnect()
    try {
      const ok = await c.query("select (now() + $1::interval) > now() as later", ['1 day'])
      expect(cell0(ok)).toBe(true)
      const err = await caught(() => c.query('select INTERVAL $1', ['1 day']))
      expect((err as PgError).code).toBe('42601')
    } finally { await c.end() }
  })

  test('typed-literal grammar DATE $1 / TIMESTAMP $1 is always 42601 (only $1::date works)', async () => {
    const c = await testConnect({ temporal: 'string' })
    try {
      expect((await caught(() => c.query('select DATE $1', ['2020-01-01'])) as PgError).code).toBe('42601')
      expect((await caught(() => c.query('select TIMESTAMP $1', ['2020-01-01'])) as PgError).code).toBe('42601')
      expect(cell0(await c.query('select $1::date', ['2020-01-01']))).toBe('2020-01-01')
    } finally { await c.end() }
  })

  test('INSERT ... VALUES ($1) infers the column type (smallint) — no operator-mismatch', async () => {
    const c = await testConnect()
    try {
      await c.query('create temp table param_si_t (s smallint)')
      await c.query('insert into param_si_t (s) values ($1)', [42])
      expect(cell0(await c.query('select s from param_si_t'))).toBe(42)
    } finally { await c.end() }
  })

  test('to_tsquery(english,$1) binds the value as a real param and runs', async () => {
    const c = await testConnect()
    try {
      const r = await c.query("select to_tsquery('english',$1)::text as q", ['cat'])
      expect(String(cell0(r))).toMatch(/cat/)
    } finally { await c.end() }
  })

  test('set_config($1,$2,false) binds real params (the SET workaround)', async () => {
    const c = await testConnect()
    try {
      // application_name round-trips the value verbatim (statement_timeout would normalize to "12345ms")
      const r = await c.query("select set_config('application_name',$1,false)", ['param_probe'])
      expect(cell0(r)).toBe('param_probe')
    } finally { await c.end() }
  })

  test('re-execute the SAME parameterized SQL with different values each binds correctly', async () => {
    const c = await testConnect()
    try {
      for (const v of [1, 2, 99, -5]) {
        expect(cell0(await c.query('select $1::int', [v]))).toBe(v)
      }
    } finally { await c.end() }
  })

  test('named prepared statement: parse-once / bind-many across different values', async () => {
    const c = await testConnect()
    try {
      const name = 'param_named_ps'
      expect(cell0(await c.query('select $1::int * 2', [3], { name }))).toBe(6)
      expect(cell0(await c.query('select $1::int * 2', [10], { name }))).toBe(20)
    } finally { await c.end() }
  })
})

describe('identifiers / keywords / disallowed contexts are NOT parameterizable', () => {
  test('order by $1 with a column-name string is a constant -> rows NOT reordered', async () => {
    const c = await testConnect()
    try {
      // 'x' is a constant in ORDER BY (not an identifier), so order is unchanged
      const r = await c.query('select * from (values (3),(1),(2)) v(x) order by $1', ['x'])
      expect(r.rows.map((row) => (row as unknown[])[0])).toEqual([3, 1, 2])
    } finally { await c.end() }
  })

  test("LIMIT $1 with 'ALL' errors (bigint); IS $1 is 42601", async () => {
    const c = await testConnect()
    try {
      expect((await caught(() => c.query('select 1 limit $1', ['ALL'])) as PgError).code).toBe('22P02')
      expect((await caught(() => c.query('select 1 is $1', [null])) as PgError).code).toBe('42601')
    } finally { await c.end() }
  })

  test('table/column identifier as a param -> syntax error, never identifier injection', async () => {
    const c = await testConnect()
    try {
      expect((await caught(() => c.query('create table $1 (i int)', ['evil'])) as PgError).code).toBe('42601')
      expect((await caught(() => c.query('select * from $1', ['t'])) as PgError).code).toBe('42601')
    } finally { await c.end() }
  })

  test('SET search_path TO $1 -> 42601; set_config($1,...) is the workaround', async () => {
    const c = await testConnect()
    try {
      expect((await caught(() => c.query('set search_path to $1', ['public'])) as PgError).code).toBe('42601')
      expect(cell0(await c.query("select set_config('search_path',$1,true)", ['public']))).toBe('public')
    } finally { await c.end() }
  })

  test('anonymous DO $$ ... $$ block given a param -> 08P01 (0 placeholders)', async () => {
    const c = await testConnect()
    try {
      expect((await caught(() => c.query('do $$ begin end $$', [1])) as PgError).code).toBe('08P01')
    } finally { await c.end() }
  })

  test('multi-statement string with params -> 42601 (cannot insert multiple commands)', async () => {
    const c = await testConnect()
    try {
      const err = await caught(() => c.query('select $1::int; select $2::int', [1, 2]))
      expect((err as PgError).code).toBe('42601')
      expect(cell0(await c.query('select $1::int', [5]))).toBe(5) // single statement binds fine
    } finally { await c.end() }
  })
})

describe('caller-data integrity & bulk binding', () => {
  test('multi-row INSERT with flattened $1..$n inserts all rows', async () => {
    const c = await testConnect()
    try {
      await c.query('create temp table param_bulk_t (a int, b text)')
      const rows: [number, string][] = [[1, 'a'], [2, 'b'], [3, 'c']]
      const flat = rows.flat()
      const tuples = rows.map((_, i) => `($${i * 2 + 1}::int,$${i * 2 + 2}::text)`).join(',')
      await c.query(`insert into param_bulk_t (a,b) values ${tuples}`, flat)
      const r = await c.query('select count(*)::int as n from param_bulk_t')
      expect(cell0(r)).toBe(3)
    } finally { await c.end() }
  })

  test('INSERT ... SELECT $1 WHERE NOT EXISTS (...) binds and executes', async () => {
    const c = await testConnect()
    try {
      await c.query('create temp table param_ine_t (v int)')
      await c.query('insert into param_ine_t (v) select $1 where not exists (select 1 from param_ine_t where v=$1)', [7])
      await c.query('insert into param_ine_t (v) select $1 where not exists (select 1 from param_ine_t where v=$1)', [7])
      const r = await c.query('select count(*)::int as n from param_ine_t')
      expect(cell0(r)).toBe(1) // second insert is a no-op
    } finally { await c.end() }
  })

  test('NUL-byte text param rejects client-side; nothing is sent; connection still usable', async () => {
    const c = await testConnect()
    try {
      const err = await caught(() => c.query('select $1::text', ['a' + NUL + 'b']))
      expect((err as Error).message).toMatch(/NUL/)
      expect(err).not.toBeInstanceOf(PgError) // client-side, never reached the server
      expect(cell0(await c.query('select 1'))).toBe(1)
    } finally { await c.end() }
  })

  test('SQL text containing a NUL rejects before any wire write (guardNul on query text)', async () => {
    const c = await testConnect()
    try {
      const err = await caught(() => c.query('select 1 ' + NUL))
      expect((err as Error).message).toMatch(/NUL/)
      expect(cell0(await c.query('select 1'))).toBe(1)
    } finally { await c.end() }
  })

  test('a NUL inside a STRING value of an OBJECT param is JSON-escaped (no real 0x00), bypasses the primitive guard, and is wire-safe', async () => {
    const c = await testConnect()
    try {
      // object path -> JSON.stringify: encodeParam does NOT throw on the inner NUL
      const enc = encodeParam({ k: 'a' + NUL + 'b' })
      expect(enc.bytes!.includes(0)).toBe(false) // no real 0x00 byte on the wire
      expect(enc.bytes!.toString('utf8')).toBe('{"k":"a\\u0000b"}') // 6-char \u0000 escape
      // sent as JSON text it round-trips verbatim (jsonb/json reject \u0000 with 22P05)
      const r = await c.query('select $1::text as v', [{ k: 'a' + NUL + 'b' }])
      expect(String(cell0(r))).toBe('{"k":"a\\u0000b"}')
    } finally { await c.end() }
  })
})

describe('public API surface (out-of-scope guard)', () => {
  test('only positional $N binding is offered - there is no sql`` template tag / sql() helper', async () => {
    const mod = await import('../../../src/index.ts')
    expect('sql' in mod).toBe(false)
    expect(typeof (mod as { sql?: unknown }).sql).toBe('undefined')
  })

  // roadmap (pending specs) — written as todos so the suite never goes red:
  test.todo('explicit per-query param type-OID hints (query.types) — Parse currently always sends 0 OIDs', () => {})
  // (SHIPPED) JS-array -> PG-array-literal encoding (Option A) + declared params:['<t>[]'] — see the
  // 'object / JSON & the JS-array footgun' group above and test/integration/param-arrays.test.ts.
  test.todo('throw on a Promise/thenable param instead of silently binding {}', () => {})
})
