// Prepared statements: the extended-query path (Parse/Describe/Bind/Execute/Sync).
// Naming is opt-in via opts.name; the connection keeps a per-connection cache of
// {name -> {sql, fields}} populated only after RowDescription ('T') or NoData ('n').
// Grounded in src/connection.ts (startTask / handle) — see DOMAIN NOTES.
// Requires a running cluster: `bun run test:setup`. public.t is READ-ONLY.
import { test, expect, describe } from 'bun:test'
import { testConnect, testPool, withConn, caught, PgError, TEST_TIMEOUT } from '../../helpers/db.ts'

// Unique per-process prefix so concurrently-running suites never collide on
// statement names visible in pg_prepared_statements (names are per-session, but
// belt-and-suspenders for any shared-session edge cases).
const K = `ps_${process.pid}`

describe('named: parse-once, bind-many, cached RowDescription', () => {
  test('same name+SQL run N times with different params returns per-call-correct rows; one cache entry, from_sql=false', async () => {
    await withConn(async (c) => {
      const name = `${K}_byid`
      const ids = [1, 2, 3, 1, 2]
      for (const id of ids) {
        const r = await c.query('select id, name from public.t where id = $1', [id], { name })
        expect((r.rows[0] as unknown[])[0]).toBe(id) // each call binds its own param, not the first
      }
      const pp = await c.query(
        'select count(*)::int as n, bool_or(from_sql) as anysql from pg_prepared_statements where name = $1',
        [name],
      )
      expect((pp.rows[0] as unknown[])[0]).toBe(1) // exactly one server-side entry for the name
      expect((pp.rows[0] as unknown[])[1]).toBe(false) // protocol-Parse'd, not SQL-level PREPARE
    })
  })

  test('reuse call returns the same columns as the first even though no Describe is sent', async () => {
    await withConn(async (c) => {
      const name = `${K}_cols`
      const first = await c.query('select id as the_id, name as the_name from public.t where id=$1', [1], { name })
      expect(first.columns).toEqual(['the_id', 'the_name'])
      // 2nd call hits the reuse path (cached fields, no Parse/Describe on the wire)
      const reuse = await c.query('select id as the_id, name as the_name from public.t where id=$1', [2], { name })
      expect(reuse.columns).toEqual(['the_id', 'the_name'])
      expect((reuse.rows[0] as unknown[])[0]).toBe(2)
    })
  })

  test('named INSERT (NoData) caches fields:[] and reuses Bind/Execute with correct rowCount', async () => {
    await withConn(async (c) => {
      await c.query('create temp table ins_nd(x int, y int)')
      const name = `${K}_insnd`
      const r1 = await c.query('insert into ins_nd(x,y) values($1,$2)', [1, 10], { name })
      expect(r1.columns).toEqual([]) // NoData -> no columns
      expect(r1.rowCount).toBe(1)
      const r2 = await c.query('insert into ins_nd(x,y) values($1,$2)', [2, 20], { name })
      expect(r2.columns).toEqual([])
      expect(r2.rowCount).toBe(1)
      const all = await c.query('select count(*)::int from ins_nd')
      expect((all.rows[0] as unknown[])[0]).toBe(2)
    })
  })

  test('named SELECT returning zero rows still caches and reuses correctly', async () => {
    await withConn(async (c) => {
      const name = `${K}_zero`
      const r1 = await c.query('select id from public.t where id = $1', [-999], { name })
      expect(r1.rows).toEqual([])
      expect(r1.rowCount).toBe(0)
      expect(r1.command).toBe('SELECT')
      const r2 = await c.query('select id from public.t where id = $1', [-1], { name })
      expect(r2.rows).toEqual([])
      expect(r2.rowCount).toBe(0)
    })
  })
})

describe('same name + different SQL -> Close + re-Parse (no client error)', () => {
  test('re-pointing a name to new SQL returns the new result (silent re-prepare, not a "must be unique" error)', async () => {
    await withConn(async (c) => {
      const name = `${K}_q`
      const a = await c.query('select 1 as a', [], { name })
      expect(a.columns).toEqual(['a'])
      expect((a.rows[0] as unknown[])[0]).toBe(1)
      const b = await c.query('select 2 as b', [], { name }) // same name, different SQL
      expect(b.columns).toEqual(['b']) // re-prepared, not the cached 'a' text
      expect((b.rows[0] as unknown[])[0]).toBe(2)
    })
  })

  test('after re-pointing, pg_prepared_statements still shows one entry with the NEW text', async () => {
    await withConn(async (c) => {
      const name = `${K}_rp`
      await c.query('select 1 as a', [], { name })
      await c.query('select 42 as zzz', [], { name })
      const pp = await c.query(
        'select count(*)::int as n, max(statement) as stmt from pg_prepared_statements where name=$1',
        [name],
      )
      expect((pp.rows[0] as unknown[])[0]).toBe(1) // old plan was Closed, not leaked
      expect(String((pp.rows[0] as unknown[])[1])).toContain('zzz') // current text is the new SQL
    })
  })

  test('re-pointing from a SELECT (had fields) to an INSERT (NoData) replaces cached fields with []', async () => {
    await withConn(async (c) => {
      await c.query('create temp table rp_ins(v int)')
      const name = `${K}_s2i`
      const sel = await c.query('select v from rp_ins where v=$1', [1], { name })
      expect(sel.columns).toEqual(['v'])
      const ins = await c.query('insert into rp_ins(v) values($1)', [5], { name })
      expect(ins.columns).toEqual([]) // stale ['v'] not reused
      expect(ins.rowCount).toBe(1)
    })
  })
})

describe('unnamed statement (default path)', () => {
  test('repeated unnamed param queries (50x) never register in pg_prepared_statements', async () => {
    await withConn(async (c) => {
      for (let i = 0; i < 50; i++) {
        const r = await c.query('select id from public.t where id=$1', [(i % 3) + 1])
        expect((r.rows[0] as unknown[])[0]).toBe((i % 3) + 1)
      }
      const pp = await c.query('select count(*)::int from pg_prepared_statements')
      expect((pp.rows[0] as unknown[])[0]).toBe(0) // empty statement name is never registered
    })
  })

  test('consecutive different unnamed SQLs each work without cross-contamination', async () => {
    await withConn(async (c) => {
      const a = await c.query('select $1::int as one', [11])
      const b = await c.query('select $1::text as two', ['hi'])
      expect((a.rows[0] as unknown[])[0]).toBe(11)
      expect((b.rows[0] as unknown[])[0]).toBe('hi')
      const pp = await c.query('select count(*)::int from pg_prepared_statements')
      expect((pp.rows[0] as unknown[])[0]).toBe(0)
    })
  })

  test('two unnamed queries with DIFFERENT param counts back-to-back each bind their own count', async () => {
    await withConn(async (c) => {
      const one = await c.query('select $1::int as a', [7])
      expect((one.rows[0] as unknown[])[0]).toBe(7)
      const two = await c.query('select $1::int + $2::int as s', [3, 4])
      expect((two.rows[0] as unknown[])[0]).toBe(7) // 3+4, no carried-over count
    })
  })
})

describe('many distinct names & texts, no cross-contamination', () => {
  test('prepare 100 distinct names, re-execute shuffled; each correct; 100 entries registered', async () => {
    await withConn(async (c) => {
      const names: string[] = []
      for (let i = 0; i < 100; i++) {
        const name = `${K}_m${i}`
        names.push(name)
        const r = await c.query(`select ${i} as v`, [], { name })
        expect((r.rows[0] as unknown[])[0]).toBe(i)
      }
      // shuffle
      for (let i = names.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[names[i], names[j]] = [names[j]!, names[i]!]
      }
      for (const name of names) {
        const i = Number(name.slice(`${K}_m`.length))
        const r = await c.query(`select ${i} as v`, [], { name })
        expect((r.rows[0] as unknown[])[0]).toBe(i) // reuse path returns its own cached plan
      }
      const pp = await c.query(`select count(*)::int from pg_prepared_statements where name like $1`, [`${K}_m%`])
      expect((pp.rows[0] as unknown[])[0]).toBe(100)
    })
  }, TEST_TIMEOUT) // 100 sequential prepare+execute round-trips: needs headroom over a WAN link

  test('two named texts selecting different columns interleaved never reuse each other', async () => {
    await withConn(async (c) => {
      const n1 = `${K}_i1`
      const n2 = `${K}_i2`
      await c.query('select id from public.t where id=$1', [1], { name: n1 })
      await c.query('select name from public.t where id=$1', [1], { name: n2 })
      const r1 = await c.query('select id from public.t where id=$1', [2], { name: n1 })
      const r2 = await c.query('select name from public.t where id=$1', [2], { name: n2 })
      expect(r1.columns).toEqual(['id'])
      expect(r2.columns).toEqual(['name'])
      expect((r1.rows[0] as unknown[])[0]).toBe(2)
    })
  })
})

describe('parameter count, binding & server-side type inference', () => {
  test('named INSERT with one bound value (Parse declares 0 OIDs, count from SQL)', async () => {
    await withConn(async (c) => {
      await c.query('create temp table p_one(x int)')
      const r = await c.query('insert into p_one(x) values($1)', [99], { name: `${K}_p1` })
      expect(r.rowCount).toBe(1) // no "supplies 1 parameters, but requires 0"
    })
  })

  test('CTE with two params binds both', async () => {
    await withConn(async (c) => {
      const r = await c.query('with v(a,b) as (values($1::int,$2::int)) select a+b as s from v', [10, 5], {
        name: `${K}_cte`,
      })
      expect((r.rows[0] as unknown[])[0]).toBe(15)
    })
  })

  test('$1::int, $2::text cast: values decoded by type (int4->number, text->string)', async () => {
    await withConn(async (c) => {
      const r = await c.query('select $1::int as i, $2::text as t', [123, 'abc'], { name: `${K}_cast` })
      expect((r.rows[0] as unknown[])[0]).toBe(123)
      expect((r.rows[0] as unknown[])[1]).toBe('abc')
    })
  })

  test('NULL param: select $1::int with [null] decodes to null', async () => {
    await withConn(async (c) => {
      const r = await c.query('select $1::int as i', [null], { name: `${K}_null` })
      expect((r.rows[0] as unknown[])[0]).toBeNull()
    })
  })

  test('array param: a JS array binds to a native int[] (Option A: PG array literal)', async () => {
    await withConn(async (c) => {
      // a JS array now encodes as the PG array literal '{1,2}' — works directly against int[]
      const ok = await c.query('select id from public.t where id = any($1::int[]) order by id', [[1, 2]])
      expect(ok.rows.map((r) => (r as unknown[])[0])).toEqual([1, 2])
      // the array-literal string form still works too
      const ok2 = await c.query('select id from public.t where id = any($1::int[]) order by id', ['{1,2}'])
      expect(ok2.rows.map((r) => (r as unknown[])[0])).toEqual([1, 2])
    })
  })
})

describe('error during prepare / cache poisoning guards', () => {
  test('invalid SQL under a name (42601) is not cached; same name re-Parses fresh and succeeds', async () => {
    await withConn(async (c) => {
      const name = `${K}_bad`
      const err = await caught(() => c.query('selct nope', [], { name }))
      expect((err as PgError).code).toBe('42601')
      // No T/n arrived -> nothing cached; a valid query under the same name works.
      const ok = await c.query('select 7 as a', [], { name })
      expect((ok.rows[0] as unknown[])[0]).toBe(7)
    })
  })

  test('execute-time error (23505) keeps the NoData cache entry; next reuse Binds/Executes fine', async () => {
    await withConn(async (c) => {
      await c.query('create temp table uq(id int primary key)')
      const name = `${K}_uq`
      const r1 = await c.query('insert into uq(id) values($1)', [1], { name })
      expect(r1.rowCount).toBe(1)
      const dup = await caught(() => c.query('insert into uq(id) values($1)', [1], { name }))
      expect((dup as PgError).code).toBe('23505')
      const r2 = await c.query('insert into uq(id) values($1)', [2], { name }) // cache survived, reuse path
      expect(r2.rowCount).toBe(1)
    })
  })

  test('empty SQL resolves promptly (EmptyQueryResponse) without hanging the connection', async () => {
    await withConn(async (c) => {
      const r = await c.query('')
      expect(r.rows).toEqual([])
      expect(r.rowCount).toBeNull() // no CommandComplete tag for an empty query
      expect(r.command).toBeNull()
      const live = await c.query('select 1 as a') // connection still usable
      expect((live.rows[0] as unknown[])[0]).toBe(1)
    })
  })

  test('NUL byte in SQL is rejected client-side without wedging the queue', async () => {
    await withConn(async (c) => {
      const err = await caught(() => c.query('select 1\0 -- nul', [], { name: `${K}_nul` }))
      expect((err as Error).message).toMatch(/NUL/)
      const live = await c.query('select 5 as a') // next queued query proceeds
      expect((live.rows[0] as unknown[])[0]).toBe(5)
    })
  })

  test('NUL byte rejection does not commit current; a query queued behind it still runs', async () => {
    await withConn(async (c) => {
      // Fire a throwing-encode query and a good one without awaiting the first, so the
      // good one is queued behind it (serialize-before-commit invariant).
      const bad = caught(() => c.query('select $1', ['a\0b']))
      const good = c.query('select 8 as a')
      expect((await bad as Error).message).toMatch(/NUL/)
      expect(((await good).rows[0] as unknown[])[0]).toBe(8)
    })
  })
})

describe('prepared-statement cache invalidation (self-heal + collisions)', () => {
  test('ALTER selected column type then reuse: transparently re-parses (0A000 swallowed)', async () => {
    await withConn(async (c) => {
      await c.query('create temp table fg_alt(id int, v int)')
      await c.query('insert into fg_alt values(1,10)')
      const name = `${K}_fga`
      await c.query('select * from fg_alt where id=$1', [1], { name })
      await c.query('select * from fg_alt where id=$1', [1], { name }) // warm to binary
      await c.query('alter table fg_alt alter column v type bigint')
      const r = await c.query('select * from fg_alt where id=$1', [1], { name, mode: 'object', debug: true }) // 0A000 -> auto re-parse
      expect((r.rows[0] as { v: unknown }).v).toBe(10n) // v is int8 now -> BigInt, decoded after the transparent retry
      expect(r.debug!.retries).toBe(1)
      expect(r.debug!.retriedErrors).toEqual(['0A000'])
    })
  })

  test('DEALLOCATE the name via raw SQL then reuse: transparently re-parses (26000 swallowed)', async () => {
    await withConn(async (c) => {
      const name = `${K}_fgd`
      await c.query('select 1 as a', [], { name })
      await c.query(`deallocate "${name}"`)
      const r = await c.query('select 1 as a', [], { name, mode: 'object', debug: true }) // 26000 -> auto re-parse
      expect((r.rows[0] as { a: unknown }).a).toBe(1)
      expect(r.debug!.retries).toBe(1)
      expect(r.debug!.retriedErrors).toEqual(['26000'])
    })
  })

  test('a shape (_typed) query is NOT auto-retried on 0A000 — it surfaces (the declared mapper could be stale)', async () => {
    await withConn(async (c) => {
      await c.query('create temp table fg_shape(a int4)')
      await c.query('insert into fg_shape values (1000000)')
      const name = `${K}_fgs`
      const shape = { a: 'int4' } as const
      await c.query('select a from fg_shape', [], { name, shape })
      await c.query('select a from fg_shape', [], { name, shape })
      await c.query('alter table fg_shape alter column a type bigint') // shape declares int4 but col is int8 now
      const err = await caught(() => c.query('select a from fg_shape', [], { name, shape }))
      expect((err as PgError).code).toBe('0A000') // surfaced, not silently decoded with the stale int4 mapper
    })
  })

  test('0A000 inside a transaction surfaces the real code (a retry would only hit 25P02)', async () => {
    await withConn(async (c) => {
      await c.query('create temp table fg_tx(a int4)')
      await c.query('insert into fg_tx values (1)')
      const name = `${K}_fgtx`
      await c.query('select a from fg_tx', [], { name })
      await c.query('select a from fg_tx', [], { name })
      await c.query('alter table fg_tx alter column a type bigint')
      await c.query('begin')
      const err = await caught(() => c.query('select a from fg_tx', [], { name }))
      expect((err as PgError).code).toBe('0A000')
      await c.query('rollback')
    })
  })

  test('server-side PREPARE then a driver named query with that name -> 42P05, recovers', async () => {
    await withConn(async (c) => {
      const name = `${K}_fgp`
      await c.query(`prepare "${name}" as select 1`)
      const err = await caught(() => c.query('select 2', [], { name }))
      expect((err as PgError).code).toBe('42P05') // already exists
      const live = await c.query('select 3 as a')
      expect((live.rows[0] as unknown[])[0]).toBe(3)
    })
  })

  test('BEGIN; PREPARE; ROLLBACK survives in PG (statement not deallocated) then driver name -> 42P05', async () => {
    await withConn(async (c) => {
      const name = `${K}_fgr`
      await c.query('begin')
      await c.query(`prepare "${name}" as select 1`)
      await c.query('rollback')
      // note: in this cluster (PG14) the SQL-level PREPARE survives ROLLBACK, so the
      // driver's Parse for the same name collides. minipg keeps no tx-tied belief.
      const survived = await c.query('select count(*)::int from pg_prepared_statements where name=$1', [name])
      expect((survived.rows[0] as unknown[])[0]).toBe(1)
      const err = await caught(() => c.query('select 9', [], { name }))
      expect((err as PgError).code).toBe('42P05')
    })
  })

  test('parameterized INSERT...SELECT UNION ALL named, executed twice, no stale relation/type error', async () => {
    await withConn(async (c) => {
      await c.query('create temp table ua(v int)')
      const name = `${K}_ua`
      const sql = 'insert into ua select $1::int union all select $2::int'
      const r1 = await c.query(sql, [1, 2], { name })
      expect(r1.rowCount).toBe(2)
      const r2 = await c.query(sql, [3, 4], { name }) // reuse, no "relation with OID does not exist"
      expect(r2.rowCount).toBe(2)
    })
  })
})

describe('spec-correctness guards', () => {
  test('params in a DO block surface the server rejection deterministically (08P01), recovers', async () => {
    await withConn(async (c) => {
      const err = await caught(() => c.query('do $$ begin perform $1; end $$', [1]))
      expect((err as PgError).code).toBe('08P01') // bind supplies 1 but the block requires 0
      const live = await c.query('select 1 as a')
      expect((live.rows[0] as unknown[])[0]).toBe(1)
    })
  })

  test('CREATE VIEW with a param is rejected (no params allowed in DDL), recovers', async () => {
    await withConn(async (c) => {
      const err = await caught(() => c.query(`create view ${K}_v as select $1::int as x`))
      expect((err as PgError).code).toBe('42P02') // there is no parameter $1
      const live = await c.query('select 1 as a')
      expect((live.rows[0] as unknown[])[0]).toBe(1)
    })
  })

  test('reusing a named prepared statement repeatedly inside one transaction (unnamed portal) -> no cursor collision', async () => {
    await withConn(async (c) => {
      const name = `${K}_tx`
      await c.query('begin')
      for (let i = 1; i <= 4; i++) {
        const r = await c.query('select $1::int as v', [i], { name })
        expect((r.rows[0] as unknown[])[0]).toBe(i) // always Bind('') -> no "cursor already exists"
      }
      await c.query('commit')
    })
  })
})

describe('pool: per-connection statement isolation', () => {
  test('each connection owns its own cache; a name prepared on A is unknown on B', async () => {
    const pool = testPool({ max: 2 })
    try {
      const name = `${K}_iso`
      const a = await pool.connect()
      const b = await pool.connect() // forced distinct: A still held
      try {
        await a.client.query('select 1 as a', [], { name })
        // B's own server session never saw a Parse for this name -> it Parses fresh, no error.
        const rb = await b.client.query('select 2 as a', [], { name })
        expect((rb.rows[0] as unknown as unknown[])[0]).toBe(2)
        const ppb = await b.client.query('select count(*)::int from pg_prepared_statements where name=$1', [name])
        expect((ppb.rows[0] as unknown as unknown[])[0]).toBe(1) // exactly its own entry
      } finally {
        a.release()
        b.release()
      }
    } finally {
      await pool.end()
    }
  })

  test('pool.query with a name, 10x across pooled connections, each correct (no global collision)', async () => {
    const pool = testPool({ max: 4 })
    try {
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          pool.query('select $1::int as v', [i], { name: `${K}_pq` }),
        ),
      )
      results.forEach((r, i) => expect((r.rows[0] as unknown as unknown[])[0]).toBe(i))
    } finally {
      await pool.end()
    }
  })

  test('single-conn pool: reacquiring the same connection reuses its cache (release does not clear it)', async () => {
    const pool = testPool({ max: 1 })
    try {
      const name = `${K}_reuse1`
      const h1 = await pool.connect()
      await h1.client.query('select 1 as a', [], { name })
      h1.release()
      const h2 = await pool.connect() // same physical connection (max=1)
      try {
        // Cache still holds the name; reuse path returns correct result and the
        // server still has exactly one entry (no re-Parse needed, none leaked).
        const r = await h2.client.query('select 1 as a', [], { name })
        expect((r.rows[0] as unknown as unknown[])[0]).toBe(1)
        const pp = await h2.client.query('select count(*)::int from pg_prepared_statements where name=$1', [name])
        expect((pp.rows[0] as unknown as unknown[])[0]).toBe(1)
      } finally {
        h2.release()
      }
    } finally {
      await pool.end()
    }
  })

  test('parallel named queries across a max:4 pool: no "already exists", all correct', async () => {
    const pool = testPool({ max: 4 })
    try {
      const work = Array.from({ length: 40 }, (_, i) =>
        pool.query('select $1::int as v', [i], { name: `${K}_par` }),
      )
      const results = await Promise.all(work)
      results.forEach((r, i) => expect((r.rows[0] as unknown as unknown[])[0]).toBe(i))
    } finally {
      await pool.end()
    }
  })
})

// A reused prepared statement (no shape) learns its result OIDs from the first roundtrip's RowDescription,
// then requests BINARY for the bench-fast types on every subsequent execution — same values, smaller wire.
describe('prepared-statement reuse auto-upgrades to binary (plain queries, no shape)', () => {
  const norm = (r: unknown) => JSON.stringify(r, (_k, v) => (typeof v === 'bigint' ? v + 'n' : v))

  test('1st execution text, 2nd+ binary: identical values, smaller wire', async () => {
    await withConn(async (c) => {
      await c.query("SET TIME ZONE 'UTC'")
      const sql = `select (g*98765432109)::int8 as big, (g*1.123456789)::float8 as f,
        '2021-06-02 12:34:56.789+00'::timestamptz as ts from generate_series(1,50) g`
      const name = `${K}_bin`
      const r1 = await c.query(sql, [], { name, mode: 'object', metrics: true })
      const r2 = await c.query(sql, [], { name, mode: 'object', metrics: true })
      expect(norm(r2.rows)).toBe(norm(r1.rows)) // binary decode == text decode for these types
      expect(r2.metrics!.bytesReceived).toBeLessThan(r1.metrics!.bytesReceived) // 2nd exec came back binary (narrower)
    })
  })

  test('temporal:string keeps a reused timestamptz column as exact text (not a binary Date)', async () => {
    await withConn(async (c) => {
      await c.query("SET TIME ZONE 'UTC'")
      const sql = "select '2021-06-02 12:34:56.789+00'::timestamptz as ts"
      const name = `${K}_tstr`
      await c.query(sql, [], { name, mode: 'object' })
      const r = await c.query(sql, [], { name, mode: 'object' })
      expect(typeof (r.rows[0] as { ts: unknown }).ts).toBe('string')
    }, { temporal: 'string' })
  })

  test('a config.types override survives reuse (not bypassed by the binary upgrade)', async () => {
    const c = await testConnect({ types: { 23: (buf) => 'OV:' + buf.toString('utf8') } }) // override int4
    try {
      const name = `${K}_ov`
      await c.query('select 42::int4 as i', [], { name, mode: 'object' })
      const r = await c.query('select 42::int4 as i', [], { name, mode: 'object' })
      expect((r.rows[0] as { i: unknown }).i).toBe('OV:42') // override wins -> stayed text, not binary int4
    } finally { await c.end() }
  })

  test('reusing a name with DIFFERENT sql re-Parses (debug.repreparedSqlChanged), not the stale plan', async () => {
    await withConn(async (c) => {
      const name = `${K}_swap`
      await c.query('select 10::int8 as b', [], { name, mode: 'object' }) // caches name -> int8 sql
      const r = await c.query('select 10::int4 as b', [], { name, mode: 'object', debug: true }) // different sql, same name
      expect(r.debug!.reusedPreparedStatement).toBe(false)
      expect(r.debug!.repreparedSqlChanged).toBe(true)
      expect(r.debug!.columns[0]!.oid).toBe(23) // int4, decoded by the re-parsed plan (not the stale int8)
      expect((r.rows[0] as { b: unknown }).b).toBe(10)
      const fresh = await c.query('select 5::int2 as b', [], { name: `${K}_fresh`, mode: 'object', debug: true })
      expect(fresh.debug!.reusedPreparedStatement).toBe(false)
      expect(fresh.debug!.repreparedSqlChanged).toBeUndefined() // fresh first-use has no reprepare flag
    })
  })

  test('buffer mode reuse stays text (raw cells are the text wire bytes, not binary)', async () => {
    await withConn(async (c) => {
      const name = `${K}_buf`
      await c.query('select 12345::int8 as v', [], { name, mode: 'buffer' })
      const r = await c.query('select 12345::int8 as v', [], { name, mode: 'buffer' })
      expect((r.rows[0] as (Buffer | null)[])[0]).toEqual(Buffer.from('12345')) // ascii digits, not the int64 bytes
    })
  })

  test('DDL changing the result type: transparently re-parses in ONE call (0A000 swallowed), debug shows it', async () => {
    await withConn(async (c) => {
      await c.query('create temp table stheal(a int4)')
      await c.query('insert into stheal values (1)')
      const name = `${K}_heal`
      await c.query('select a from stheal', [], { name, mode: 'object' }) // 1st: text, caches a as int4
      await c.query('select a from stheal', [], { name, mode: 'object' }) // 2nd: binary reuse
      await c.query('alter table stheal alter column a type bigint')       // result type int4 -> int8
      const r = await c.query('select a from stheal', [], { name, mode: 'object', debug: true }) // no throw: auto re-parse
      expect((r.rows[0] as { a: unknown }).a).toBe(1n) // int8 now -> BigInt, decoded correctly after the retry
      expect(r.debug!.retries).toBe(1)
      expect(r.debug!.retriedErrors).toEqual(['0A000'])
      expect(r.debug!.columns[0]!.format).toBe('text') // the retry went out TEXT (new OIDs unknown until re-Describe)
      const r2 = await c.query('select a from stheal', [], { name, mode: 'object', debug: true }) // now stable
      expect(r2.debug!.retries).toBeUndefined()
      expect(r2.debug!.columns[0]!.format).toBe('binary') // reuse re-upgrades with the fresh int8 OID
    })
  })
})

describe('roadmap / not-yet-implemented', () => {
  // startTask always appends Bind+Execute+Sync; there is no Describe-only path.
  test.todo('describe(sql, {name?}): Parse+Describe only, returning param OIDs + columns without Execute', () => {})
  test.todo('describe() on a mutating INSERT must not execute it (zero rows written)', () => {})
  test.todo('prepare(name, sql) issuing Parse only, then execute(name, values) Binding later', () => {})
  test.todo('explicit deallocate(name)/close API that sends Close and clears the client cache', () => {})
  test.todo('prepare:false / simple-protocol switch forcing inlined values for pooler compatibility', () => {})
  test.todo('binary PARAM format (Bind param format 1) from ParameterDescription; params still text-encoded', () => {})
  test.todo('type inference resolved via ParameterDescription for ambiguous uncast params', () => {})
})
