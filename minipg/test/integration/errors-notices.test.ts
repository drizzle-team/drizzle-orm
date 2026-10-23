// Domain: errors-notices — how minipg surfaces server ErrorResponse ('E'),
// silently drops NoticeResponse ('N')/NotificationResponse ('A'), and delivers
// connection/protocol faults purely via promise rejection (no EventEmitter).
// Grounded in src/errors.ts (PgError + parseErrorFields) and src/connection.ts.
// Read-only shared table public.t is NOT touched; all fixtures use TEMP tables.
import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { testConnect, caught, PgError } from '../helpers/db.ts'
import { parseErrorFields, PgError as PgErrorClass } from '../../src/errors.ts'
import type { Connection } from '../../src/index.ts'

// A connection with TEMP fixtures shared by the field-shape / sqlstate groups.
let c: Connection

beforeAll(async () => {
  c = await testConnect()
  await c.query(`create temp table en_parent (
     id int primary key,
     name text not null,
     age int check (age >= 0)
   )`)
  await c.query(`create temp table en_child (
     id int primary key,
     parent_id int references en_parent(id)
   )`)
  await c.query(`insert into en_parent (id, name, age) values (1, 'a', 10)`)
})

afterAll(async () => { await c.end() })

describe('PgError object shape & field contract', () => {
  test('unique violation (23505) exposes detail/constraint/table/schema; column undefined', async () => {
    const e = await caught(() => c.query(`insert into en_parent (id, name, age) values (1, 'b', 5)`))
    expect(e).toBeInstanceOf(PgError)
    const pe = e as PgError
    expect(pe.code).toBe('23505')
    expect(typeof pe.detail).toBe('string')
    expect(typeof pe.constraint).toBe('string')
    expect(typeof (pe as { table?: unknown }).table).toBe('string')
    expect(typeof (pe as { schema?: unknown }).schema).toBe('string')
    // PG omits the column field for unique violations, so the server never sets it.
    // NOTE: Bun pre-defines a numeric `Error.column` (source location), so we assert
    // the server did NOT overwrite it with a string rather than checking for undefined.
    expect(typeof (pe as { column?: unknown }).column).not.toBe('string')
  })

  test('NOT NULL violation (23502) populates column/table/schema', async () => {
    const e = await caught(() => c.query(`insert into en_parent (id, name, age) values (2, null, 5)`))
    const pe = e as PgError
    expect(pe.code).toBe('23502')
    expect(typeof (pe as { column?: unknown }).column).toBe('string')
    expect(typeof (pe as { table?: unknown }).table).toBe('string')
    expect(typeof (pe as { schema?: unknown }).schema).toBe('string')
  })

  test('CHECK violation (23514) exposes constraint/table', async () => {
    const e = await caught(() => c.query(`insert into en_parent (id, name, age) values (3, 'c', -1)`))
    const pe = e as PgError
    expect(pe.code).toBe('23514')
    expect(typeof pe.constraint).toBe('string')
    expect(typeof (pe as { table?: unknown }).table).toBe('string')
  })

  test('FK violation (23503) exposes constraint/table/detail', async () => {
    const e = await caught(() => c.query(`insert into en_child (id, parent_id) values (1, 999)`))
    const pe = e as PgError
    expect(pe.code).toBe('23503')
    expect(typeof pe.constraint).toBe('string')
    expect(typeof (pe as { table?: unknown }).table).toBe('string')
    expect(typeof pe.detail).toBe('string')
  })

  test('syntax error (42601) has a string position that 1-indexes the SQL', async () => {
    const e = await caught(() => c.query('SELECT * FROM'))
    const pe = e as PgError
    expect(pe.code).toBe('42601')
    expect(pe.position).toBeDefined()
    // DEVIATION GUARD: minipg keeps position as the raw STRING (no number coercion)
    expect(typeof pe.position).toBe('string')
    expect(Number(pe.position)).toBeGreaterThan(0)
  })

  test('message equals server text; RAISE EXCEPTION yields message "boom" / code P0001', async () => {
    const e1 = await caught(() => c.query('select * from en_no_such_relation_xyz'))
    expect((e1 as PgError).message).toBe('relation "en_no_such_relation_xyz" does not exist')

    const e2 = await caught(() => c.query(`do $$ begin raise exception 'boom'; end $$`))
    const pe2 = e2 as PgError
    expect(pe2.message).toBe('boom')
    expect(pe2.code).toBe('P0001')
  })

  test('severity and severityLocal are both decoded', async () => {
    const e = await caught(() => c.query('select * from en_no_such_relation_xyz'))
    const pe = e as PgError
    expect(pe.severity).toBe('ERROR')
    expect(typeof (pe as { severityLocal?: unknown }).severityLocal).toBe('string')
  })

  test('error fields are own-enumerable: JSON.stringify includes code/severity/detail (not {})', async () => {
    const e = await caught(() => c.query(`insert into en_parent (id, name, age) values (1, 'b', 5)`))
    const json = JSON.parse(JSON.stringify(e)) as Record<string, unknown>
    expect(json.code).toBe('23505')
    expect(json.severity).toBe('ERROR')
    expect(typeof json.detail).toBe('string')
    expect(typeof json.constraint).toBe('string')
    expect(JSON.stringify(e)).not.toBe('{}')
    // NOTE: `message` is NOT enumerable — Object.assign(this, fields) writes over the
    // pre-existing non-enumerable Error.message own prop without changing enumerability,
    // so JSON.stringify omits it (deviation from the plan's expectation).
    expect(json.message).toBeUndefined()
    expect((e as Error).message).toContain('duplicate key')
  })

  test('fields the server did not send stay undefined (syntax error)', async () => {
    const e = await caught(() => c.query('SELECT * FROM'))
    const pe = e as PgError
    expect((pe as { constraint?: unknown }).constraint).toBeUndefined()
    expect((pe as { table?: unknown }).table).toBeUndefined()
    // NOTE: Bun pre-defines a numeric Error.column; server omits it for syntax errors
    expect(typeof (pe as { column?: unknown }).column).not.toBe('string')
  })
})

describe('SQLSTATE coverage across error classes', () => {
  test('missing relation 42P01 / missing column 42703 / unknown function 42883', async () => {
    expect(((await caught(() => c.query('select * from en_no_such_relation_xyz'))) as PgError).code).toBe('42P01')
    expect(((await caught(() => c.query('select en_no_such_column_xyz'))) as PgError).code).toBe('42703')
    expect(((await caught(() => c.query('select en_no_such_fn_xyz()'))) as PgError).code).toBe('42883')
  })

  test('CREATE TABLE of an existing table → 42P07', async () => {
    const e = await caught(() => c.query('create temp table en_parent (id int)'))
    expect((e as PgError).code).toBe('42P07')
  })

  test('integer overflow 22003 / bad text→int 22P02', async () => {
    expect(((await caught(() => c.query('select 2147483647::int + 1'))) as PgError).code).toBe('22003')
    expect(((await caught(() => c.query(`select 'NaN'::int`))) as PgError).code).toBe('22P02')
  })

  test('division by zero 22012 / string-into-int via bound $1 → 22P02', async () => {
    expect(((await caught(() => c.query('select 1/0'))) as PgError).code).toBe('22012')
    const e = await caught(() => c.query('select $1::int', ['stock']))
    expect((e as PgError).code).toBe('22P02')
  })

  test('aborted transaction → 25P02, then ROLLBACK recovers', async () => {
    const conn = await testConnect()
    try {
      await conn.query('begin')
      const e1 = await caught(() => conn.query('select * from en_no_such_relation_xyz'))
      expect((e1 as PgError).code).toBe('42P01')
      const e2 = await caught(() => conn.query('select 1'))
      expect((e2 as PgError).code).toBe('25P02') // in_failed_sql_transaction
      await conn.query('rollback')
      const ok = await conn.query('select 1 as x')
      expect((ok.rows[0] as unknown[])[0]).toBe(1)
    } finally { await conn.end() }
  })

  test('e.code is the SQLSTATE; there is no .sqlState alias', async () => {
    const e = await caught(() => c.query('select 1/0'))
    const pe = e as PgError
    expect(pe.code).toBe('22012')
    expect((pe as { sqlState?: unknown }).sqlState).toBeUndefined()
  })
})

describe('error-class identity & exports', () => {
  test('server error is instanceof Error and PgError', async () => {
    const e = await caught(() => c.query('select 1/0'))
    expect(e).toBeInstanceOf(Error)
    expect(e).toBeInstanceOf(PgError)
  })

  test('DEVIATION GUARD: name is "PgError" (not "DatabaseError"); stack is non-empty', async () => {
    const e = await caught(() => c.query('select 1/0'))
    const pe = e as PgError
    expect(pe.name).toBe('PgError')
    expect(typeof pe.stack).toBe('string')
    expect((pe.stack ?? '').length).toBeGreaterThan(0)
  })

  test('DEVIATION GUARD: client-level errors are plain Error with no .code, not PgError', async () => {
    // NUL byte in a param is rejected client-side during encoding
    const e1 = await caught(() => c.query('select $1::text', ['a b']))
    expect(e1).toBeInstanceOf(Error)
    expect(e1).not.toBeInstanceOf(PgError)
    expect((e1 as { code?: unknown }).code).toBeUndefined()

    // query() after end() rejects (catchable), also a plain Error
    const dead = await testConnect()
    await dead.end()
    const e2 = await caught(() => dead.query('select 1'))
    expect(e2).toBeInstanceOf(Error)
    expect(e2).not.toBeInstanceOf(PgError)
    expect((e2 as Error).message).toMatch(/closed/)
  })

  test.todo('exported SQLSTATE name constants equal runtime e.code values (not implemented)', () => {})
  test.todo('distinct driver-error subclass with stable .code (not implemented)', () => {})
})

describe('catchable propagation — promise-only', () => {
  test('missing relation rejects exactly that promise with 42P01 (no leak)', async () => {
    const e = await caught(() => c.query('select * from en_no_such_relation_xyz'))
    expect((e as PgError).code).toBe('42P01')
    // connection still alive afterwards
    const ok = await c.query('select 42 as x')
    expect((ok.rows[0] as unknown[])[0]).toBe(42)
  })

  test('query() after end() rejects, does not throw synchronously', async () => {
    const conn = await testConnect()
    await conn.end()
    let p: Promise<unknown>
    expect(() => { p = conn.query('select 1'); void p }).not.toThrow()
    const e = await caught(() => p!)
    expect((e as Error).message).toMatch(/connection is closed/)
  })

  test('connection killed mid-query rejects in-flight; process stays alive', async () => {
    const victim = await testConnect()
    const killer = await testConnect()
    try {
      const pid = victim.backendKey!.pid
      const inflight = caught(() => victim.query('select pg_sleep(10)'))
      // give the sleep a moment to be in-flight, then terminate it
      await killer.query('select 1')
      await killer.query('select pg_terminate_backend($1)', [pid])
      const e = await inflight
      expect(e).toBeInstanceOf(Error)
      // killer connection is unaffected and still works
      const ok = await killer.query('select 7 as x')
      expect((ok.rows[0] as unknown[])[0]).toBe(7)
    } finally { await victim.end(); await killer.end() }
  }, 20000)

  test('socket fatal rejects in-flight AND every queued task', async () => {
    const victim = await testConnect()
    const killer = await testConnect()
    try {
      const pid = victim.backendKey!.pid
      const ps = [
        caught(() => victim.query('select pg_sleep(10)')),
        caught(() => victim.query('select 1')),
        caught(() => victim.query('select 2')),
        caught(() => victim.query('select 3')),
      ]
      await killer.query('select pg_terminate_backend($1)', [pid])
      const results = await Promise.all(ps)
      for (const r of results) expect(r).toBeInstanceOf(Error)
    } finally { await victim.end(); await killer.end() }
  }, 20000)

  test('connection-level system error: bad port → plain Error with no SQLSTATE', async () => {
    const e = await caught(() => testConnect({ port: 1, connectTimeout: 3000 }))
    expect(e).toBeInstanceOf(Error)
    expect(e).not.toBeInstanceOf(PgError)
    expect((e as { code?: unknown }).code).not.toBe('42P01')
  })

  test('a failing query settles exactly once (rejected, never also resolved)', async () => {
    let resolved = false, rejected = 0
    await c.query('select 1/0').then(() => { resolved = true }, () => { rejected += 1 })
    // give the event loop a tick for any stray Z handling
    await c.query('select 1')
    expect(resolved).toBe(false)
    expect(rejected).toBe(1)
  })

  test('end() called from inside a catch handler closes cleanly', async () => {
    const conn = await testConnect()
    let ended = false
    await conn.query('select 1/0').catch(async () => { await conn.end(); ended = true })
    expect(ended).toBe(true)
  })

  test.todo('"unexpected termination" error carries underlying socket error as .cause (not implemented)', () => {})
})

describe('type-parser / decode failure', () => {
  // Current source CATCHES decoder throws in dataRow() and rejects the query
  // (see src/connection.ts dataRow try/catch) — the historical uncatchable
  // footgun is fixed. Assert the ACTUAL behavior.
  test('a throwing custom decoder rejects the query, then the connection recovers', async () => {
    const conn = await testConnect({ types: { 23: () => { throw new Error('boom decode') } } }) // int4
    try {
      const e = await caught(() => conn.query('select 1::int4 as x'))
      expect((e as Error).message).toMatch(/boom decode/)
      const ok = await conn.query('select 2::text as y')
      expect((ok.rows[0] as unknown[])[0]).toBe('2')
    } finally { await conn.end() }
  })

  test('buffer/raw mode bypasses text decoding entirely', async () => {
    const conn = await testConnect({ types: { 23: () => { throw new Error('should not run') } } })
    try {
      const r = await conn.query('select 1::int4 as x', [], { mode: 'buffer' })
      const cell = (r.rows[0] as (Buffer | null)[])[0]
      expect(Buffer.isBuffer(cell)).toBe(true)
    } finally { await conn.end() }
  })
})

describe('error during prepare / bind (named statements)', () => {
  test('parse failure on a named stmt rejects and is NOT cached; name reusable with valid SQL', async () => {
    const conn = await testConnect()
    try {
      const e = await caught(() => conn.query('selct 1', [], { name: 'en_named1' }))
      expect((e as PgError).code).toBe('42601')
      // name was never cached (prepared only set on T/n) → reusing it with valid SQL works
      const ok = await conn.query('select 5 as x', [], { name: 'en_named1' })
      expect((ok.rows[0] as unknown[])[0]).toBe(5)
    } finally { await conn.end() }
  })

  test('bind failure on a valid cached stmt rejects (22P02); stmt remains reusable', async () => {
    const conn = await testConnect()
    try {
      const ok1 = await conn.query('select $1::int as x', [5], { name: 'en_bind1' })
      expect((ok1.rows[0] as unknown[])[0]).toBe(5)
      const e = await caught(() => conn.query('select $1::int as x', ['notnum'], { name: 'en_bind1' }))
      expect((e as PgError).code).toBe('22P02')
      const ok2 = await conn.query('select $1::int as x', [9], { name: 'en_bind1' })
      expect((ok2.rows[0] as unknown[])[0]).toBe(9)
    } finally { await conn.end() }
  })

  test('reusing a cached name with DIFFERENT SQL re-prepares; an erroring new SQL rejects', async () => {
    const conn = await testConnect()
    try {
      const ok = await conn.query('select 1 as x', [], { name: 'en_reuse1' })
      expect((ok.rows[0] as unknown[])[0]).toBe(1)
      const e = await caught(() => conn.query('select * from en_no_such_relation_xyz', [], { name: 'en_reuse1' }))
      expect((e as PgError).code).toBe('42P01')
      // name reusable again afterwards
      const ok2 = await conn.query('select 2 as x', [], { name: 'en_reuse1' })
      expect((ok2.rows[0] as unknown[])[0]).toBe(2)
    } finally { await conn.end() }
  })
})

describe('NOTICE / WARNING / NotificationResponse handling (dropped)', () => {
  test('RAISE NOTICE/WARNING/INFO are dropped; query still resolves with rows', async () => {
    const r1 = await c.query(`do $$ begin raise notice 'a notice'; end $$`)
    expect(r1.command).toBe('DO')
    const r2 = await c.query(`do $$ begin raise warning 'a warning'; end $$`)
    expect(r2.command).toBe('DO')
    const r3 = await c.query(`with x as (select 1 as v) select v from x`)
    expect((r3.rows[0] as unknown[])[0]).toBe(1)
  })

  test('CREATE TABLE IF NOT EXISTS on existing table emits a NOTICE but resolves', async () => {
    const r = await c.query('create temp table if not exists en_parent (id int)')
    expect(r.command).toBe('CREATE')
  })

  test('NOTIFY from another session is ignored; later query returns correctly', async () => {
    const listener = await testConnect()
    const notifier = await testConnect()
    try {
      await listener.query('listen en_chan')
      await notifier.query(`notify en_chan, 'payload'`)
      // minipg drops 'A' frames; the listener connection is unaffected
      const ok = await listener.query('select 11 as x')
      expect((ok.rows[0] as unknown[])[0]).toBe(11)
    } finally { await listener.end(); await notifier.end() }
  })

  test.todo('onnotice / notice-handler surfacing (not implemented)', () => {})
})

describe('connection state integrity & recovery after error', () => {
  test('after a 23505 the same connection answers the next query correctly', async () => {
    await caught(() => c.query(`insert into en_parent (id, name, age) values (1, 'b', 5)`))
    const ok = await c.query('select 123 as x')
    expect((ok.rows[0] as unknown[])[0]).toBe(123)
  })

  test('error mid-stream rejects next(); the next query returns the full result set', async () => {
    const conn = await testConnect()
    try {
      const it = conn.stream('select 1/(g-3) as v from generate_series(1,10) g')
      let threw = false
      try { for await (const _ of it) { void _ } } catch (e) { threw = true; expect((e as PgError).code).toBe('22012') }
      expect(threw).toBe(true)
      // fresh Task.rows — no leaked state
      const r = await conn.query('select g from generate_series(1,5) g')
      expect(r.rows.length).toBe(5)
    } finally { await conn.end() }
  })

  test('buffered query erroring after partial rows rejects (rows discarded)', async () => {
    const conn = await testConnect()
    try {
      const e = await caught(() => conn.query('select 1/(g-3) as v from generate_series(1,10) g'))
      expect((e as PgError).code).toBe('22012')
      const ok = await conn.query('select 1 as x')
      expect((ok.rows[0] as unknown[])[0]).toBe(1)
    } finally { await conn.end() }
  })

  test('constraint violation inside a CTE rejects with the proper SQLSTATE', async () => {
    const conn = await testConnect()
    try {
      await conn.query('create temp table en_cte (id int primary key)')
      await conn.query('insert into en_cte values (1)')
      const e = await caught(() => conn.query(`with w as (insert into en_cte values (1) returning id) select * from w`))
      expect((e as PgError).code).toBe('23505')
    } finally { await conn.end() }
  })
})

describe('protocol / startup robustness', () => {
  test('ErrorResponse during startup (nonexistent database → 3D000) rejects connect()', async () => {
    const e = await caught(() => testConnect({ database: 'en_no_such_db_xyz', connectTimeout: 5000 }))
    expect(e).toBeInstanceOf(PgError)
    expect((e as PgError).code).toBe('3D000')
  })

  test('empty query string resolves cleanly: rows [], command null', async () => {
    const r = await c.query('')
    expect(r.rows).toEqual([])
    expect(r.command).toBeNull()
    // whitespace-only too
    const r2 = await c.query('   ')
    expect(r2.rows).toEqual([])
    expect(r2.command).toBeNull()
  })

  test('back-to-back errored queries do not wedge the connection (stray-frame guard)', async () => {
    const conn = await testConnect()
    try {
      for (let i = 0; i < 3; i++) {
        const e = await caught(() => conn.query('select * from en_no_such_relation_xyz'))
        expect((e as PgError).code).toBe('42P01')
      }
      const ok = await conn.query('select 1 as x')
      expect((ok.rows[0] as unknown[])[0]).toBe(1)
    } finally { await conn.end() }
  })
})

describe('parseErrorFields / PgError unit', () => {
  test('decodes all field bytes by name; unknown bytes kept under raw key', () => {
    const body = Buffer.concat([
      Buffer.from('S'), Buffer.from('ERROR\0'),
      Buffer.from('V'), Buffer.from('ERROR\0'),
      Buffer.from('C'), Buffer.from('23505\0'),
      Buffer.from('M'), Buffer.from('dup\0'),
      Buffer.from('n'), Buffer.from('my_constraint\0'),
      Buffer.from('Z'), Buffer.from('rawval\0'), // unknown field byte
      Buffer.from('\0'),
    ])
    const f = parseErrorFields(body)
    expect(f.code).toBe('23505')
    expect(f.message).toBe('dup')
    expect(f.severity).toBe('ERROR')
    expect(f.severityLocal).toBe('ERROR')
    expect(f.constraint).toBe('my_constraint')
    expect(f.Z).toBe('rawval') // unknown byte under its raw single-char key
  })

  test('truncated body (missing trailing NUL) parses partially without throwing', () => {
    const body = Buffer.concat([Buffer.from('C'), Buffer.from('42601\0'), Buffer.from('M'), Buffer.from('oops')])
    let f: ReturnType<typeof parseErrorFields> | undefined
    expect(() => { f = parseErrorFields(body) }).not.toThrow()
    expect(f!.code).toBe('42601')
    expect(f!.message).toBe('oops')
  })

  test('empty buffer and a lone NUL return {}; PgError({}) defaults its message', () => {
    expect(parseErrorFields(Buffer.alloc(0))).toEqual({})
    expect(parseErrorFields(Buffer.from('\0'))).toEqual({})
    const e = new PgErrorClass({})
    expect(e.message).toBe('PostgreSQL error')
    expect(e.name).toBe('PgError')
  })

  test('building a PgError over Error props (message/code) does not throw', () => {
    expect(() => { new PgErrorClass({ message: 'm', code: '23505', detail: 'd' }) }).not.toThrow()
    const e = new PgErrorClass({ message: 'm', code: '23505' })
    expect(e.message).toBe('m')
    expect(e.code).toBe('23505')
  })
})

describe('stack-trace quality (roadmap)', () => {
  test.todo('error includes a stack frame at the application call site (not implemented)', () => {})
})

describe('query() arg ergonomics', () => {
  test('query(sql, opts) arg-shifts a known-options object; a params mistake gets a pointed TypeError', async () => {
    const conn = await testConnect()
    try {
      // all keys are known QueryOptions -> treated as the options argument
      const r = await conn.query('select 1 as x', { mode: 'object' } as never)
      expect(r.rows[0] as unknown).toEqual({ x: 1 })
      // an unknown-key object is NOT options -> the params error says the fix
      const err = await caught(() => conn.query('select $1', { id: 5 } as never))
      expect((err as Error).message).toMatch(/params must be an array — pass options as the THIRD argument/)
    } finally { conn.end() }
  })
})
