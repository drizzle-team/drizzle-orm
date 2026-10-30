// Domain: "results" — Result Modes & Metadata.
// Pins the QueryResult shape `{ rows, columns, rowCount, command }` across the
// four row modes (array/object/buffer/raw), plus command-tag / rowCount /
// column-metadata semantics. Grounded in src/connection.ts makeRow()/handle().
// Requires a running cluster: `bun run test:setup`. public.t is READ-ONLY;
// all writes/DDL go through CONNECTION-SCOPED TEMP tables.
import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { testConnect, withConn } from '../../helpers/db.ts'
import type { Connection } from '../../../src/index.ts'
import { PgError } from '../../helpers/db.ts'

// Shared read-only connection for the SELECT-only groups.
let c: Connection
beforeAll(async () => { c = await testConnect() })
afterAll(async () => { await c?.end() })

const arr = (r: { rows: unknown[] }, i = 0) => r.rows[i] as unknown[]
const obj = (r: { rows: unknown[] }, i = 0) => r.rows[i] as Record<string, unknown>

describe('array mode (default) row shape', () => {
  test('select 1 a, 2 b -> positional array [1,2], length == columns.length', async () => {
    const r = await c.query('select 1 a, 2 b')
    expect(arr(r)).toEqual([1, 2])
    expect(arr(r).length).toBe(r.columns.length)
    expect(Object.getPrototypeOf(r.rows[0])).toBe(Array.prototype)
    expect(r.columns).toEqual(['a', 'b'])
  })

  test('preserves SELECT-list order (no name sorting)', async () => {
    const r = await c.query('select 3 c, 1 a, 2 b')
    expect(arr(r)).toEqual([3, 1, 2])
    expect(r.columns).toEqual(['c', 'a', 'b'])
  })

  test('duplicate column names preserve BOTH values', async () => {
    const r = await c.query('select 1 as x, 2 as x')
    expect(arr(r)).toEqual([1, 2])
    expect(r.columns).toEqual(['x', 'x'])
  })

  test('LEFT JOIN same-named columns: NULL from unmatched side does not overwrite the other', async () => {
    const r = await c.query('select l.v, r.v from (values (1)) l(v) left join (values (2)) r(v) on false')
    expect(arr(r)).toEqual([1, null]) // independent positions
    expect(r.columns).toEqual(['v', 'v'])
  })
})

describe('object mode row shape & duplicate-column collapse', () => {
  test('plain record with all distinct keys (Object.prototype-backed, like pg/postgres.js)', async () => {
    const r = await c.query('select 1 as a, 2 as b', [], { mode: 'object' })
    const row = obj(r)
    // rows are plain {} (V8 keeps these in fast hidden-class mode; null-proto demotes to dictionary).
    expect(Object.getPrototypeOf(row)).toBe(Object.prototype)
    expect(JSON.stringify(row)).toBe('{"a":1,"b":2}')
  })

  test('a column named __proto__ is set as an OWN property, never a prototype mutation', async () => {
    const r = await c.query(`select 1 as a, 'x' as "__proto__"`, [], { mode: 'object' })
    const row = obj(r) as Record<string, unknown>
    expect(Object.getPrototypeOf(row)).toBe(Object.prototype) // not polluted
    expect(Object.prototype.hasOwnProperty.call(row, '__proto__')).toBe(true)
    expect(row.a).toBe(1)
  })

  test('duplicate names collapse rightmost-wins: select 1 as x, 2 as x -> {x:2}', async () => {
    const r = await c.query('select 1 as x, 2 as x', [], { mode: 'object' })
    expect(obj(r)).toEqual({ x: 2 })
  })

  test('rightmost-wins is position-based, not value-based', async () => {
    const r1 = await c.query('select 1 as x, null as x', [], { mode: 'object' })
    expect(obj(r1)).toEqual({ x: null }) // rightmost wins even when null
    const r2 = await c.query('select null as x, 2 as x', [], { mode: 'object' })
    expect(obj(r2)).toEqual({ x: 2 })
  })

  test('columns still lists all collapsed names', async () => {
    const r = await c.query('select 1 x, 2 x, 3 x', [], { mode: 'object' })
    expect(r.columns.length).toBe(3)
    expect(Object.keys(obj(r))).toEqual(['x'])
  })

  test('quoted mixed-case identifier preserved exactly as the key', async () => {
    const r = await c.query('select now() as "theTime"', [], { mode: 'object' })
    expect('theTime' in obj(r)).toBe(true)
  })

  test('unquoted identifier folded to lowercase by server; driver does not re-case', async () => {
    const q = await c.query('select 1 as "FirstName"', [], { mode: 'object' })
    const u = await c.query('select 1 as FirstName', [], { mode: 'object' })
    expect(Object.keys(obj(q))).toEqual(['FirstName'])
    expect(Object.keys(obj(u))).toEqual(['firstname'])
  })

  test("special-char column name (apostrophe) becomes a key without crashing", async () => {
    const r = await c.query(`select 1 as "it's a col"`, [], { mode: 'object' })
    expect("it's a col" in obj(r)).toBe(true)
  })

  test('unaliased expression keys: ?column? and count', async () => {
    const a = await c.query('select 1', [], { mode: 'object' })
    expect('?column?' in obj(a)).toBe(true)
    const b = await c.query('select count(*) from t', [], { mode: 'object' })
    expect('count' in obj(b)).toBe(true)
  })
})

describe('buffer mode row shape', () => {
  test('each cell is a Buffer of the raw text bytes (undecoded)', async () => {
    const r = await c.query(`select 'alice'::text, 42::int4`, [], { mode: 'buffer' })
    const row = r.rows[0] as (Buffer | null)[]
    expect(Buffer.isBuffer(row[0])).toBe(true)
    expect((row[0] as Buffer).toString()).toBe('alice')
    expect((row[1] as Buffer).toString()).toBe('42') // ASCII digits, not a number
  })

  test('int8 cell is the ASCII digits of the bigint, not numeric', async () => {
    const r = await c.query(`select 9007199254740993::int8`, [], { mode: 'buffer' })
    const row = r.rows[0] as (Buffer | null)[]
    expect((row[0] as Buffer).toString()).toBe('9007199254740993')
  })

  test('row length == columns.length; each entry is Buffer or null', async () => {
    const r = await c.query(`select 'a'::text, null::int4, 'b'::text`, [], { mode: 'buffer' })
    const row = r.rows[0] as (Buffer | null)[]
    expect(row.length).toBe(r.columns.length)
    for (const cell of row) expect(Buffer.isBuffer(cell) || cell === null).toBe(true)
  })

  test('buffer cells are copies (mutating one does not corrupt later reads)', async () => {
    const r = await c.query(`select 'abc'::text`, [], { mode: 'buffer' })
    const cell = (r.rows[0] as (Buffer | null)[])[0] as Buffer
    cell.fill(0x58) // mutate the returned copy
    const r2 = await c.query(`select 'abc'::text`, [], { mode: 'buffer' })
    expect(((r2.rows[0] as (Buffer | null)[])[0] as Buffer).toString()).toBe('abc')
  })
})

describe('raw mode row shape (whole-DataRow bytes)', () => {
  // Parse a raw DataRow body: u16 column count, then per-cell i32 length (-1 = NULL) + bytes.
  function parseRawBody(body: Buffer): { count: number; lengths: number[] } {
    const count = body.readUInt16BE(0)
    let off = 2
    const lengths: number[] = []
    for (let i = 0; i < count; i++) {
      const len = body.readInt32BE(off); off += 4
      lengths.push(len)
      if (len > 0) off += len
    }
    return { count, lengths }
  }

  test('one Buffer per row equal to the full DataRow body, not a per-cell array', async () => {
    const r = await c.query('select 1, 2', [], { mode: 'raw' })
    const body = r.rows[0] as Buffer
    expect(Buffer.isBuffer(body)).toBe(true)
    const { count, lengths } = parseRawBody(body)
    expect(count).toBe(2)
    expect(lengths).toEqual([1, 1]) // '1' and '2' each one byte
    // full body (header + length prefixes + cells) is larger than the 2 payload bytes
    expect(body.length).toBeGreaterThan(2)
  })

  test('raw-mode row buffer is independent per row (copy, no aliasing)', async () => {
    const rows: Buffer[] = []
    for await (const row of c.stream<Buffer>(`select g from generate_series(1,2) g`, [], { mode: 'raw' })) rows.push(row)
    expect(rows.length).toBe(2)
    expect(rows[0]).not.toBe(rows[1])
    const before = Buffer.from(rows[1] as Buffer)
    ;(rows[0] as Buffer).fill(0)
    expect(Buffer.compare(rows[1] as Buffer, before)).toBe(0) // second row untouched
  })

  test('NULL cell encodes the -1 length sentinel in the row body', async () => {
    const r = await c.query('select null::int4, 1::int4', [], { mode: 'raw' })
    const { count, lengths } = parseRawBody(r.rows[0] as Buffer)
    expect(count).toBe(2)
    expect(lengths[0]).toBe(-1) // NULL sentinel
    expect(lengths[1]).toBe(1)
  })
})

describe('NULL cells across every mode', () => {
  test('all-NULL typed row in array / object / buffer modes', async () => {
    const a = await c.query('select null::int4, null::text, null::jsonb')
    expect(arr(a)).toEqual([null, null, null])
    const o = await c.query('select null::int4 a, null::text b, null::jsonb d', [], { mode: 'object' })
    expect(obj(o)).toEqual({ a: null, b: null, d: null })
    const b = await c.query('select null::int4, null::text, null::jsonb', [], { mode: 'buffer' })
    expect(b.rows[0]).toEqual([null, null, null])
  })

  test('mixed NULL/non-NULL decode independently per mode', async () => {
    const a = await c.query(`select 1::int4, null::int4, 'x'::text`)
    expect(arr(a)).toEqual([1, null, 'x'])
    const o = await c.query(`select 1::int4 a, null::int4 b, 'x'::text d`, [], { mode: 'object' })
    expect(obj(o)).toEqual({ a: 1, b: null, d: 'x' })
    const buf = await c.query(`select 1::int4, null::int4, 'x'::text`, [], { mode: 'buffer' })
    const row = buf.rows[0] as (Buffer | null)[]
    expect(Buffer.isBuffer(row[0])).toBe(true)
    expect(row[1]).toBeNull()
    expect(Buffer.isBuffer(row[2])).toBe(true)
  })

  test('an entirely-NULL row is still a real row (rowCount counts it)', async () => {
    const r = await c.query('select null, null')
    expect(r.rowCount).toBe(1)
    expect(r.rows.length).toBe(1)
    expect(arr(r)).toEqual([null, null])
  })
})

describe('columns metadata', () => {
  test('columns is ALWAYS an array — [] for NoData (INSERT without RETURNING)', async () => {
    await withConn(async (conn) => {
      await conn.query('create temp table cm_ins(i int)')
      const r = await conn.query('insert into cm_ins values (1)')
      expect(Array.isArray(r.columns)).toBe(true)
      expect(r.columns).toEqual([])
    })
  })

  test('columns order matches SELECT-list incl. numeric/quoted names', async () => {
    const r = await c.query('select 1 as "2", 2 as "1"')
    expect(r.columns).toEqual(['2', '1'])
  })

  test('composite/record select yields ONE column named "row"; plain select yields two', async () => {
    const comp = await c.query('select (id, name) from t limit 1')
    expect(comp.columns).toEqual(['row'])
    const flat = await c.query('select id, name from t limit 1')
    expect(flat.columns).toEqual(['id', 'name'])
  })

  test('named-prepared reuse serves cached fields and keeps columns correct', async () => {
    await withConn(async (conn) => {
      const sql = 'select 7 as seven, 8 as eight'
      const r1 = await conn.query(sql, [], { name: 'cm_named' })
      const r2 = await conn.query(sql, [], { name: 'cm_named' }) // served from this.prepared cache
      expect(r1.columns).toEqual(['seven', 'eight'])
      expect(r2.columns).toEqual(['seven', 'eight'])
      expect(r2.rows[0]).toEqual(r1.rows[0])
    })
  })

  test.todo('rich field descriptors (dataTypeID/tableID/format) — not yet exposed; only column names', () => {})
})

describe('empty result set (0 rows keeps columns)', () => {
  test('select ... where false resolves with rows:[], SELECT, rowCount:0, columns present', async () => {
    const r = await c.query('select id, name from t where false')
    expect(r.rows).toEqual([])
    expect(r.command).toBe('SELECT')
    expect(r.rowCount).toBe(0)
    expect(r.columns).toEqual(['id', 'name'])
  })

  test('select * from an empty table returns rows:[] with full column list', async () => {
    await withConn(async (conn) => {
      await conn.query('create temp table empty_t(a int, b text)')
      const r = await conn.query('select * from empty_t')
      expect(r.rows).toEqual([])
      expect(r.columns).toEqual(['a', 'b'])
      expect(r.rowCount).toBe(0)
    })
  })

  test('select * from a view returns the view DATA rows, not an empty array', async () => {
    await withConn(async (conn) => {
      await conn.query('create temp view t_view as select id, name from t')
      const r = await conn.query('select * from t_view')
      expect(r.rows.length).toBe(3)
      expect(r.columns).toEqual(['id', 'name'])
    })
  })

  test('zero-row result never fabricates a row of nulls', async () => {
    const r = await c.query('select 1 where false')
    expect(r.rows.length).toBe(0)
    expect(Array.isArray(r.rows)).toBe(true)
  })
})

describe('command tag & rowCount semantics', () => {
  test('SELECT: rowCount === rows.length for a 3-row select', async () => {
    const r = await c.query('select * from t')
    expect(r.command).toBe('SELECT')
    expect(r.rowCount).toBe(r.rows.length)
    expect(r.rowCount).toBe(3)
  })

  test('INSERT without RETURNING: INSERT / rows:[] / columns:[] / rowCount:1', async () => {
    await withConn(async (conn) => {
      await conn.query('create temp table ct_ins(i int)')
      const r = await conn.query('insert into ct_ins values (1)')
      expect(r.command).toBe('INSERT')
      expect(r.rows).toEqual([])
      expect(r.columns).toEqual([])
      expect(r.rowCount).toBe(1)
    })
  })

  test('UPDATE / DELETE affecting N (and 0) rows report rowCount precisely', async () => {
    await withConn(async (conn) => {
      await conn.query('create temp table ct_ud(i int)')
      await conn.query('insert into ct_ud select generate_series(1,3)')
      const upd = await conn.query('update ct_ud set i = i + 10 where i <= 2')
      expect(upd.command).toBe('UPDATE')
      expect(upd.rowCount).toBe(2)
      const noop = await conn.query('update ct_ud set i = 0 where i = 999')
      expect(noop.command).toBe('UPDATE')
      expect(noop.rowCount).toBe(0)
      const del = await conn.query('delete from ct_ud where i > 5')
      expect(del.command).toBe('DELETE')
      expect(del.rowCount).toBe(2)
      const delNone = await conn.query('delete from ct_ud where i = 999')
      expect(delNone.rowCount).toBe(0)
    })
  })

  test('DDL create table: CREATE / rows:[] / columns:[] / rowCount:null', async () => {
    await withConn(async (conn) => {
      const r = await conn.query('create temp table ct_ddl(i int)')
      expect(r.command).toBe('CREATE')
      expect(r.rows).toEqual([])
      expect(r.columns).toEqual([])
      expect(r.rowCount).toBeNull()
    })
  })

  test('anonymous DO block: DO / rows:[] / rowCount:null', async () => {
    const r = await c.query('do $$ begin perform 1; end $$')
    expect(r.command).toBe('DO')
    expect(r.rows).toEqual([])
    expect(r.rowCount).toBeNull()
  })

  test('begin / commit transaction control: BEGIN / COMMIT, rowCount null', async () => {
    await withConn(async (conn) => {
      const b = await conn.query('begin')
      expect(b.command).toBe('BEGIN')
      expect(b.rowCount).toBeNull()
      const cm = await conn.query('commit')
      expect(cm.command).toBe('COMMIT')
      expect(cm.rowCount).toBeNull()
    })
  })

  test('rowCount is always a number or null, never NaN/undefined', async () => {
    await withConn(async (conn) => {
      await conn.query('create temp table ct_rc(i int)')
      const ins = await conn.query('insert into ct_rc select generate_series(1,5)')
      expect(ins.rowCount).toBe(5)
      const del = await conn.query('delete from ct_rc')
      expect(del.rowCount).toBe(5)
      const sel0 = await conn.query('select * from ct_rc')
      expect(sel0.rowCount).toBe(0)
      const create = await conn.query('create temp table ct_rc2(i int)')
      expect(create.rowCount).toBeNull()
      for (const v of [ins.rowCount, del.rowCount, sel0.rowCount, create.rowCount]) {
        expect(typeof v === 'number' || v === null).toBe(true)
        expect(Number.isNaN(v as number)).toBe(false)
      }
    })
  })

  test('multi-word tags take only the first token (CREATE/ALTER/DROP)', async () => {
    await withConn(async (conn) => {
      const cr = await conn.query('create temp table ct_mw(i int)')
      expect(cr.command).toBe('CREATE')
      const al = await conn.query('alter table ct_mw add column j int')
      expect(al.command).toBe('ALTER')
      expect(al.rowCount).toBeNull()
      const dr = await conn.query('drop table ct_mw')
      expect(dr.command).toBe('DROP')
      expect(dr.rowCount).toBeNull()
    })
  })

  test.todo('MERGE command tag (PG15+) — cluster is PG14, gated out', () => {})
})

describe('RETURNING and affected-row data', () => {
  test('insert ... returning id (serial) surfaces the generated id', async () => {
    await withConn(async (conn) => {
      await conn.query('create temp table ins(id serial primary key, v text)')
      const r = await conn.query(`insert into ins (v) values ('a') returning id`)
      expect(r.command).toBe('INSERT')
      expect(r.rowCount).toBe(1)
      expect(r.columns).toContain('id')
      expect((arr(r))[0]).toBe(1)
    })
  })

  test('delete ... where id in ($1,$2) returning * returns ALL matched rows', async () => {
    await withConn(async (conn) => {
      await conn.query('create temp table del_t(id int primary key, v text)')
      await conn.query(`insert into del_t values (1,'a'),(2,'b'),(3,'c')`)
      const r = await conn.query('delete from del_t where id in ($1,$2) returning *', [1, 2])
      expect(r.rows.length).toBe(2)
      expect(r.rowCount).toBe(2)
      expect(r.command).toBe('DELETE')
    })
  })

  test('insert ... select ... returning * returns each inserted row; rowCount == rows.length', async () => {
    await withConn(async (conn) => {
      await conn.query('create temp table is_t(id int, v text)')
      const r = await conn.query(`insert into is_t select g, 'x' from generate_series(1,4) g returning *`)
      expect(r.command).toBe('INSERT')
      expect(r.rows.length).toBe(4)
      expect(r.rowCount).toBe(r.rows.length)
    })
  })

  test('insert ... on conflict do update ... returning * returns the upserted row', async () => {
    await withConn(async (conn) => {
      await conn.query('create temp table oc_t(id int primary key, v text)')
      await conn.query(`insert into oc_t values (1,'a')`)
      const r = await conn.query(
        `insert into oc_t values (1,'b') on conflict (id) do update set v = excluded.v returning *`,
        [],
        { mode: 'object' },
      )
      expect(r.rowCount).toBe(1)
      expect(obj(r).v).toBe('b')
    })
  })

  test('same insert with vs without RETURNING', async () => {
    await withConn(async (conn) => {
      await conn.query('create temp table wr_t(id serial primary key, v text)')
      const without = await conn.query(`insert into wr_t (v) values ('a')`)
      expect(without.columns).toEqual([])
      expect(without.rows).toEqual([])
      expect(without.rowCount).toBe(1)
      const withR = await conn.query(`insert into wr_t (v) values ('b') returning id, v`)
      expect(withR.columns).toEqual(['id', 'v'])
      expect(withR.rows.length).toBe(1)
    })
  })

  test('RETURNING in object mode applies duplicate-collapse/casing identically to SELECT', async () => {
    await withConn(async (conn) => {
      await conn.query('create temp table ret_obj(id int, v text)')
      const r = await conn.query(
        `insert into ret_obj values (1,'a') returning id as "Id", v`,
        [],
        { mode: 'object' },
      )
      expect(Object.keys(obj(r))).toEqual(['Id', 'v'])
    })
  })
})

describe('large / numeric rowCount correctness', () => {
  test('insert ... select generate_series(1,5000) -> rowCount 5000 (number)', async () => {
    await withConn(async (conn) => {
      await conn.query('create temp table big_t(i int)')
      const r = await conn.query('insert into big_t select generate_series(1,5000)')
      expect(r.rowCount).toBe(5000)
      expect(typeof r.rowCount).toBe('number')
    })
  })
})

describe('result-object shape & destructuring contract', () => {
  test('result is exactly { rows, columns, rowCount, command }; missing props are undefined, not throws', async () => {
    const r = await c.query('select 1 as a')
    expect(Object.keys(r).sort()).toEqual(['columns', 'command', 'rowCount', 'rows'])
    // divergence from node-postgres (`fields`) / postgres.js (array-with-metadata)
    expect((r as unknown as { fields?: unknown }).fields).toBeUndefined()
  })

  test('rows is a plain Array; object-mode rows round-trip through JSON.stringify', async () => {
    const r = await c.query('select 1 as a, 2 as b', [], { mode: 'object' })
    expect(Object.getPrototypeOf(r.rows)).toBe(Array.prototype)
    expect(JSON.parse(JSON.stringify(r.rows))).toEqual([{ a: 1, b: 2 }])
  })

  test('JSON/array aggregate values surface under their server column key', async () => {
    const r = await c.query(
      `select row_to_json(x) as j from (select id, name from t order by id limit 1) x`,
      [],
      { mode: 'object' },
    )
    const row = obj(r)
    expect(row.j).toBeDefined()
    expect(typeof row.j).toBe('object') // json parsed
    // array_agg yields an array type (int4[] here) — the array decoder is bound to that wire OID.
    const agg = await c.query('select array_agg(id order by id) as ids from t', [], { mode: 'object' })
    expect(Array.isArray(obj(agg).ids)).toBe(true)
    expect(obj(agg).ids).toEqual([1, 2, 3])
    const adv = await c.query('select pg_try_advisory_lock($1,$2) as locked', [1, 2], { mode: 'object' })
    expect(typeof obj(adv).locked).toBe('boolean')
    await c.query('select pg_advisory_unlock($1,$2)', [1, 2])
  })
})

describe('guards: out-of-scope / not-yet-implemented behaviors', () => {
  test('multi-statement string rejects cleanly (PgError 42601), no array of result sets', async () => {
    await withConn(async (conn) => {
      let err: unknown
      try { await conn.query('select 1; select 2') } catch (e) { err = e }
      expect(err).toBeInstanceOf(PgError)
      expect((err as PgError).code).toBe('42601')
    })
  })

  test('single statement still returns a single result object (never wrapped in array)', async () => {
    const r = await c.query('select 1')
    expect(Array.isArray(r)).toBe(false)
    expect(Array.isArray(r.rows)).toBe(true)
  })

  test('no column-name transform hook: keys are exactly the server names (no snake->camel)', async () => {
    const r = await c.query('select 1 as user_id, 2 as first_name', [], { mode: 'object' })
    expect(Object.keys(obj(r))).toEqual(['user_id', 'first_name'])
  })

  test("unknown mode falls through to the 'array' branch (not a Map)", async () => {
    // mode is typed; cast through unknown to exercise the default branch in makeRow.
    const r = await c.query('select 1 a, 2 b', [], { mode: 'weird' as unknown as 'array' })
    expect(Array.isArray(r.rows[0])).toBe(true)
    expect(r.rows[0]).toEqual([1, 2])
    expect(r.rows[0] instanceof Map).toBe(false)
  })

  test.todo('binary RESULT format (roadmap) — buffer/raw cells would carry binary wire bytes', () => {})
})
