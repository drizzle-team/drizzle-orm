// Domain: "query-protocol" — minipg's extended-protocol-only query lifecycle.
// Grounded in src/connection.ts (startTask/handle/finishTask) and src/protocol.ts (W/Parser).
// Isolation: public.t is READ-ONLY; all writes/DDL go to CONNECTION-SCOPED TEMP tables
// or objects prefixed "qp_". Every connection/pool is ended.
import { test, expect, describe } from 'bun:test'
import { testConnect, withConn, caught, PgError, REMOTE } from '../../helpers/db.ts'
import { W, Parser } from '../../../src/protocol.ts'
import { encodeParam } from '../../../src/encode.ts'

// Extract the sequence of frontend message-type bytes from a buffer the driver
// wrote to the socket (each msg = 1 type byte + Int32 length covering len+payload).
function feMessageTypes(buf: Buffer): string[] {
  const types: string[] = []
  let off = 0
  while (off + 5 <= buf.length) {
    types.push(String.fromCharCode(buf[off]!))
    off += buf.readInt32BE(off + 1) + 1
  }
  return types
}

describe('extended-protocol message byte layout (W.*)', () => {
  test('parse(name, sql): P + len + cstr(name) + cstr(sql) + Int16(0) param-oid count', () => {
    const b = W.parse('', 'select 1')
    expect(b[0]).toBe(0x50) // 'P'
    expect(b.readInt32BE(1)).toBe(b.length - 1) // length covers payload + itself, not the type byte
    // payload = cstr('')(=1 NUL) + cstr('select 1')(=9) + Int16(0)(=2)
    expect(b[5]).toBe(0x00) // empty statement name terminator
    expect(b.subarray(6, 6 + 9).toString('latin1')).toBe('select 1\0') // single trailing NUL on sql cstr
    expect(b.readInt16BE(b.length - 2)).toBe(0) // zero param-type oids -> server infers
  })

  test('bind(empty params): result-format section is Int16(1) then Int16(0) (one text code, all columns)', () => {
    const b = W.bind('', '', [], 0)
    expect(b[0]).toBe(0x42) // 'B'
    expect(b.readInt32BE(1)).toBe(b.length - 1)
    // tail: ...paramFormatCount(0) + valueCount(0) + resultFormatCount(1) + resultFormat(0)
    expect(b.readInt16BE(b.length - 4)).toBe(1) // exactly one result-format code
    expect(b.readInt16BE(b.length - 2)).toBe(0) // text
  })

  test('bind with one Buffer param: format=1, then Int32 len + bytes; a NULL param is Int32(-1) with no bytes', () => {
    const withBytes = W.bind('', 's', [encodeParam(Buffer.from([1, 2, 3]))], 0)
    // payload: cstr('') cstr('s') i16(paramFmtCount=1) i16(fmt=1) i16(valCount=1) i32(len=3) bytes(3) i16(1) i16(0)
    // last 4 bytes are the result-format section; before that 3 value bytes; before that the i32 len.
    const valBytes = withBytes.subarray(withBytes.length - 4 - 3, withBytes.length - 4)
    expect([...valBytes]).toEqual([1, 2, 3])
    expect(withBytes.readInt32BE(withBytes.length - 4 - 3 - 4)).toBe(3) // value length prefix

    const withNull = W.bind('', 's', [encodeParam(null)], 0)
    // ...i16(valCount=1) i32(-1) i16(1) i16(0)  -> the -1 sits right before the 4-byte result-format tail
    expect(withNull.readInt32BE(withNull.length - 4 - 4)).toBe(-1) // NULL = -1, no value bytes
  })

  test('describe/execute/sync exact framing', () => {
    expect([...W.describe('S', 'st')]).toEqual([0x44, 0, 0, 0, 8, 0x53, 0x73, 0x74, 0x00]) // 'D' 'S' "st\0"
    expect([...W.execute('', 0)]).toEqual([0x45, 0, 0, 0, 9, 0x00, 0, 0, 0, 0]) // 'E' "\0" Int32(0)
    expect([...W.sync()]).toEqual([0x53, 0, 0, 0, 4]) // 'S' empty payload (len 4)
  })

  test('W.parse throws on NUL in SQL before any write (guardNul)', () => {
    expect(() => W.parse('', 'select \0 1')).toThrow(/NUL byte \(0x00\)/)
  })
})

describe('on-wire single round trip (P,D,B,E,S in one socket write)', () => {
  test('a single query("select $1::int",[7]) writes one buffer in order P,D,B,E,S', async () => {
    const c = await testConnect()
    try {
      const sock = (c as unknown as { socket: { write: (b: Buffer) => boolean } }).socket
      const orig = sock.write.bind(sock)
      const writes: Buffer[] = []
      sock.write = ((b: Buffer) => { writes.push(Buffer.from(b)); return orig(b) }) as typeof sock.write
      const r = await c.query('select $1::int as v', [7])
      sock.write = orig
      expect((r.rows[0] as unknown[])[0]).toBe(7) // resolves despite driver ignoring Parse/BindComplete acks
      expect(writes.length).toBe(1) // unnamed statement -> one concatenated write
      expect(feMessageTypes(writes[0]!)).toEqual(['P', 'D', 'B', 'E', 'S'])
    } finally {
      await c.end()
    }
  })
})

describe('empty / whitespace / comment-only queries (EmptyQueryResponse)', () => {
  test('"" resolves to {rows:[],columns:[],rowCount:null,command:null}', async () => {
    await withConn(async (c) => {
      const r = await c.query('')
      expect(r.rows).toEqual([])
      expect(r.columns).toEqual([])
      expect(r.rowCount).toBeNull()
      expect(r.command).toBeNull()
    })
  })

  test('whitespace-only resolves identically to empty', async () => {
    await withConn(async (c) => {
      const r = await c.query('   \n\t  ')
      expect(r.command).toBeNull()
      expect(r.rowCount).toBeNull()
      expect(r.rows).toEqual([])
    })
  })

  test('comment-only (line and block) resolve as empty, not an error', async () => {
    await withConn(async (c) => {
      expect((await c.query('-- just a comment')).command).toBeNull()
      expect((await c.query('/* block */')).command).toBeNull()
    })
  })

  test('"select 1;" (trailing semicolon, single command) succeeds', async () => {
    await withConn(async (c) => {
      const r = await c.query('select 1;')
      expect(r.command).toBe('SELECT')
      expect((r.rows[0] as unknown[])[0]).toBe(1)
    })
  })

  test('connection is not desynced by the ignored EmptyQueryResponse', async () => {
    await withConn(async (c) => {
      await c.query('')
      const r = await c.query('select 42 as v')
      expect((r.rows[0] as unknown[])[0]).toBe(42)
    })
  })
})

describe('NoData vs RowDescription', () => {
  test('select 1 -> RowDescription: columns ["?column?"], rows present', async () => {
    await withConn(async (c) => {
      const r = await c.query('select 1')
      expect(r.columns).toEqual(['?column?'])
      expect(r.rows.length).toBe(1)
    })
  })

  test('DDL (create temp table) -> NoData: columns [], rowCount null, command "CREATE"', async () => {
    await withConn(async (c) => {
      const r = await c.query('create temp table qp_nodata(id int)')
      expect(r.columns).toEqual([])
      expect(r.rows).toEqual([])
      expect(r.rowCount).toBeNull()
      expect(r.command).toBe('CREATE') // multi-word "CREATE TABLE" truncated to first token
    })
  })

  test('insert without RETURNING -> NoData: rows [], command "INSERT", rowCount = affected', async () => {
    await withConn(async (c) => {
      await c.query('create temp table qp_ins(id int)')
      const r = await c.query('insert into qp_ins(id) values (1),(2),(3)')
      expect(r.rows).toEqual([])
      expect(r.command).toBe('INSERT')
      expect(r.rowCount).toBe(3)
      expect(r.columns).toEqual([])
    })
  })

  test('insert ... returning id -> RowDescription with returned ids', async () => {
    await withConn(async (c) => {
      await c.query('create temp table qp_ret(id int)')
      const r = await c.query('insert into qp_ret(id) values (10),(20) returning id')
      expect(r.command).toBe('INSERT')
      expect(r.rowCount).toBe(2)
      expect(r.columns).toEqual(['id'])
      expect(r.rows.map((row) => (row as unknown[])[0])).toEqual([10, 20])
    })
  })

  test('typed-but-empty result (select ... where false) -> RowDescription, rows [], rowCount 0', async () => {
    await withConn(async (c) => {
      const r = await c.query('select 1 where false')
      expect(r.columns).toEqual(['?column?']) // row set exists (distinct from NoData)
      expect(r.rows).toEqual([])
      expect(r.rowCount).toBe(0)
    })
  })

  test('utility command (SET) -> NoData, command "SET", rowCount null', async () => {
    await withConn(async (c) => {
      const r = await c.query('set search_path to public')
      expect(r.command).toBe('SET')
      expect(r.rowCount).toBeNull()
      expect(r.columns).toEqual([])
    })
  })
})

describe('CommandComplete tag parsing (command + rowCount)', () => {
  test('SELECT over 3 rows -> command SELECT, rowCount 3', async () => {
    await withConn(async (c) => {
      const r = await c.query('select * from (values (1),(2),(3)) as v(x)')
      expect(r.command).toBe('SELECT')
      expect(r.rowCount).toBe(3)
    })
  })

  test('INSERT 0 5 / DELETE / UPDATE -> last integer is rowCount, not the oid 0', async () => {
    await withConn(async (c) => {
      await c.query('create temp table qp_tags(id int)')
      const ins = await c.query('insert into qp_tags(id) values (1),(2),(3),(4),(5)')
      expect(ins.command).toBe('INSERT')
      expect(ins.rowCount).toBe(5) // tag "INSERT 0 5"
      const upd = await c.query('update qp_tags set id = id + 100 where id <= 4')
      expect(upd.command).toBe('UPDATE')
      expect(upd.rowCount).toBe(4)
      const del = await c.query('delete from qp_tags where id > 100')
      expect(del.command).toBe('DELETE')
      expect(del.rowCount).toBe(4)
    })
  })

  test('FOOTGUN: multi-word "CREATE TABLE" tag truncated to "CREATE", rowCount null', async () => {
    await withConn(async (c) => {
      const r = await c.query('create temp table qp_trunc(id int)')
      expect(r.command).toBe('CREATE') // not "CREATE TABLE" (tag.split(" ")[0])
      expect(r.rowCount).toBeNull()
    })
  })

  test('rowCount parsed from the CommandComplete tag, not the SQL text (trailing digit in literal)', async () => {
    await withConn(async (c) => {
      const r = await c.query("select 'abc9' as s")
      expect(r.command).toBe('SELECT')
      expect(r.rowCount).toBe(1) // tag "SELECT 1", not influenced by the 9 in 'abc9'
    })
  })

  // MERGE n requires PG15+; this cluster is PG14 -> pending.
  test.todo('MERGE n tag -> command MERGE, rowCount n (PG15+)', () => {})
})

describe('multi-statement string is rejected (extended-protocol consequence)', () => {
  test('"select 1; select 2" -> PgError 42601, does not silently run only the first', async () => {
    await withConn(async (c) => {
      const err = await caught(() => c.query('select 1; select 2'))
      expect(err).toBeInstanceOf(PgError)
      expect((err as PgError).code).toBe('42601')
    })
  })

  test('multi-statement WITH a param -> identical 42601; connection recovers', async () => {
    await withConn(async (c) => {
      const err = await caught(() => c.query('select $1::int; select 2', [1]))
      expect((err as PgError).code).toBe('42601')
      const ok = await c.query('select 99 as v') // recovered (Sync -> ReadyForQuery)
      expect((ok.rows[0] as unknown[])[0]).toBe(99)
    })
  })

  test('DDL batch "create ...; create ..." -> 42601 (cannot batch on extended path)', async () => {
    await withConn(async (c) => {
      const err = await caught(() => c.query('create temp table qp_a(i int); create temp table qp_b(i int)'))
      expect((err as PgError).code).toBe('42601')
    })
  })

  test('data-modifying CTE is ONE statement (not split): reports affected rows', async () => {
    await withConn(async (c) => {
      await c.query('create temp table qp_parent(id int primary key)')
      await c.query('create temp table qp_child(id int)')
      const r = await c.query(
        'with ins as (insert into qp_parent values (1) returning id) insert into qp_child select id from ins',
      )
      expect(r.command).toBe('INSERT')
      expect(r.rowCount).toBe(1)
    })
  })

  test('multi-table WITH ... select returns correct rows (single statement)', async () => {
    await withConn(async (c) => {
      const r = await c.query('with a as (select 1 as x), b as (select 2 as y) select x, y from a, b')
      expect(r.rows.length).toBe(1)
      expect(r.rows[0]).toEqual([1, 2])
    })
  })

  // Pending: a future simple-query path would execute all of these.
  test.todo('simple-query path: "select 1; select 2; select 3" runs all and returns results', () => {})
  test.todo('simple-query path: "insert ...; select 1/0" rolls back the insert (implicit tx)', () => {})
  test.todo('simple-query path: CREATE INDEX CONCURRENTLY as sole statement (no auto BEGIN/COMMIT)', () => {})
})

describe('parser framing & chunk reassembly (Parser.push)', () => {
  const Z = Buffer.from([0x5a, 0, 0, 0, 5, 0x49]) // ReadyForQuery 'I'

  test('5-byte header split across two chunks (1 byte then 4) — no read until >=5 buffered', () => {
    const p = new Parser()
    expect(p.push(Z.subarray(0, 1))).toEqual([]) // 1 byte
    expect(p.push(Z.subarray(1, 5))).toEqual([]) // header now complete but body missing
    const out = p.push(Z.subarray(5))
    expect(out.length).toBe(1)
    expect(out[0]!.type).toBe('Z')
  })

  test('a DataRow fed byte-by-byte yields exactly one complete message, no over-read', () => {
    // DataRow 'D': len + Int16(1 col) + Int32(3) + "abc"
    const body = Buffer.concat([Buffer.from([0, 1]), Buffer.from([0, 0, 0, 3]), Buffer.from('abc')])
    const full = Buffer.concat([Buffer.from('D'), (() => { const b = Buffer.alloc(4); b.writeInt32BE(body.length + 4); return b })(), body])
    const p = new Parser()
    let out: ReturnType<Parser['push']> = []
    for (const byte of full) out = out.concat(p.push(Buffer.from([byte])))
    expect(out.length).toBe(1)
    expect(out[0]!.type).toBe('D')
    expect(out[0]!.body.length).toBe(body.length)
  })

  test('two full messages in one chunk emit two; trailing partial of a third is retained', () => {
    const p = new Parser()
    const out = p.push(Buffer.concat([Z, Z, Z.subarray(0, 3)]))
    expect(out.map((m) => m.type)).toEqual(['Z', 'Z']) // third not emitted yet
    const rest = p.push(Z.subarray(3))
    expect(rest.map((m) => m.type)).toEqual(['Z'])
  })

  test('NoticeResponse / ParameterStatus mid-query are absorbed without desync', async () => {
    await withConn(async (c) => {
      // SET emits a ParameterStatus ('S'); a notice can be raised via client_min_messages + a DO that RAISEs.
      await c.query('set client_min_messages to notice')
      const r = await c.query("do $$ begin raise notice 'qp notice'; end $$")
      expect(r.command).toBe('DO')
      const after = await c.query('select 5 as v') // still ready
      expect((after.rows[0] as unknown[])[0]).toBe(5)
    })
  })
})

describe('extended-path error recovery & lifecycle', () => {
  test('undefined table -> 42P01, then connection returns to ready and next query succeeds', async () => {
    await withConn(async (c) => {
      const err = await caught(() => c.query('select * from qp_does_not_exist'))
      expect((err as PgError).code).toBe('42P01')
      const ok = await c.query('select 7 as v')
      expect((ok.rows[0] as unknown[])[0]).toBe(7)
    })
  })

  test('runtime error mid-rows rejects (no partial resolve); next query clean', async () => {
    await withConn(async (c) => {
      const err = await caught(() => c.query('select 1 union all select 1/0'))
      expect(err).toBeInstanceOf(PgError)
      expect((err as PgError).code).toBe('22012') // division_by_zero
      const ok = await c.query('select 3 as v')
      expect((ok.rows[0] as unknown[])[0]).toBe(3)
    })
  })

  test('connection reusable after error without a manual reset (Sync always sent)', async () => {
    await withConn(async (c) => {
      for (let i = 0; i < 3; i++) {
        const err = await caught(() => c.query('select * from qp_nope'))
        expect(err).toBeInstanceOf(PgError)
      }
      const ok = await c.query('select 1 as v')
      expect((ok.rows[0] as unknown[])[0]).toBe(1)
    })
  })

  test('failed parse under a NEW named statement leaves no stale cache; a different valid name still works', async () => {
    await withConn(async (c) => {
      const err = await caught(() => c.query('select bad syntax here', [], { name: 'qp_bad' }))
      expect(err).toBeInstanceOf(PgError)
      // reusing the SAME name with valid SQL re-prepares cleanly (no poisoned cache entry)
      const reuse = await c.query('select 1 as v', [], { name: 'qp_bad' })
      expect((reuse.rows[0] as unknown[])[0]).toBe(1)
      // a different valid name also works
      const other = await c.query('select 2 as v', [], { name: 'qp_good' })
      expect((other.rows[0] as unknown[])[0]).toBe(2)
    })
  })

  // relies on pg_terminate_backend(backendKey.pid) hitting a real, terminable backend — skip on a remote
  // target (REMOTE) like Neon, which virtualizes the reported backend pid so external termination no-ops.
  test.skipIf(REMOTE)('socket close mid-query (self-terminate) rejects in-flight; later query rejects "connection is closed"', async () => {
    const victim = await testConnect()
    const killer = await testConnect()
    try {
      const inflight = caught(() => victim.query('select pg_sleep(5)'))
      await killer.query('select pg_terminate_backend($1)', [victim.backendKey!.pid])
      expect(await inflight).toBeInstanceOf(Error) // in-flight settled, not hung
      const later = await caught(() => victim.query('select 1'))
      expect((later as Error).message).toMatch(/connection is closed|terminated/)
    } finally {
      await victim.end()
      await killer.end()
    }
  }, 15000)
})

describe('FIFO queueing (serialized pseudo-pipelining)', () => {
  test('N=10 queries fired without awaiting each resolve in submission order', async () => {
    await withConn(async (c) => {
      const promises = Array.from({ length: 10 }, (_, i) => c.query('select $1::int as v', [i]))
      const results = await Promise.all(promises)
      expect(results.map((r) => (r.rows[0] as unknown[])[0])).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    })
  })

  test('a failing query among queued ones rejects on its own; siblings resolve correctly', async () => {
    await withConn(async (c) => {
      const a = c.query('select 1 as v')
      const bad = caught(() => c.query('select * from qp_missing'))
      const b = c.query('select 2 as v')
      expect((await a).rows[0]).toEqual([1])
      expect(await bad).toBeInstanceOf(PgError)
      expect((await b).rows[0]).toEqual([2]) // no cross-talk to the wrong promise
    })
  })

  test.todo('true client-side pipelining (multiple Bind/Execute before one Sync) — not supported', () => {})
})

describe('large / boundary query text', () => {
  test('~1MB valid SQL round-trips without truncation', async () => {
    await withConn(async (c) => {
      const big = 'x'.repeat(1_000_000)
      const r = await c.query('select length($1::text) as n', [big])
      expect((r.rows[0] as unknown[])[0]).toBe(1_000_000)
    })
  })

  test('hundreds of bind parameters honored (Int16 param count)', async () => {
    await withConn(async (c) => {
      const n = 300
      const placeholders = Array.from({ length: n }, (_, i) => `$${i + 1}`).join(',')
      const params = Array.from({ length: n }, (_, i) => i + 1)
      const r = await c.query(`select array[${placeholders}]::int[] as a`, params)
      const arr = (r.rows[0] as unknown[])[0] as number[]
      // int[] decodes to a JS array; assert every bound param landed in order
      expect(Array.isArray(arr)).toBe(true)
      expect(arr).toEqual(params)
    })
  })

  test('streaming generate_series with early break cancels and leaves connection usable', async () => {
    await withConn(async (c) => {
      const it = c.stream<unknown[]>('select g from generate_series(1, 1000000) as g')
      let seen = 0
      for await (const _row of it) {
        void _row
        seen++
        if (seen >= 5) break // triggers iterator.return -> t.cancelled, socket.resume
      }
      expect(seen).toBe(5)
      const ok = await c.query('select 1 as v') // connection still usable after cancel
      expect((ok.rows[0] as unknown[])[0]).toBe(1)
    })
  }, 20000)
})

describe('NUL bytes & C-string fidelity (outbound)', () => {
  test('NUL in SQL is rejected client-side; connection stays usable', async () => {
    await withConn(async (c) => {
      const err = await caught(() => c.query('select 1 \0 bad'))
      expect((err as Error).message).toMatch(/NUL/)
      const ok = await c.query('select 1 as v') // queue advanced
      expect((ok.rows[0] as unknown[])[0]).toBe(1)
    })
  })

  test('NUL in a string param is rejected client-side; queue advances', async () => {
    await withConn(async (c) => {
      const err = await caught(() => c.query('select $1::text', ['a\0b']))
      expect((err as Error).message).toMatch(/NUL/)
      const ok = await c.query('select 2 as v')
      expect((ok.rows[0] as unknown[])[0]).toBe(2)
    })
  })
})

describe('query-text fidelity (driver passes SQL byte-for-byte)', () => {
  test('quoted identifier "user" is preserved (not folded to current_user)', async () => {
    await withConn(async (c) => {
      await c.query('create temp table "user" (id int)')
      await c.query('insert into "user"(id) values (1)')
      const r = await c.query('select id from "user"') // literal table named user, not the keyword
      expect((r.rows[0] as unknown[])[0]).toBe(1)
    })
  })

  test('schema-qualified name reaches the server unchanged', async () => {
    await withConn(async (c) => {
      const r = await c.query('select count(*) from pg_catalog.pg_class') // qualified prefix not dropped
      expect(r.command).toBe('SELECT')
      expect(r.rowCount).toBe(1)
    })
  })

  test('case-sensitive quoted identifier resolves exact-case (not folded)', async () => {
    await withConn(async (c) => {
      await c.query('create temp table "QpMixed" (id int)')
      await c.query('insert into "QpMixed"(id) values (7)')
      const r = await c.query('select id from "QpMixed"')
      expect((r.rows[0] as unknown[])[0]).toBe(7)
      // the unquoted (folded) name does not exist
      const err = await caught(() => c.query('select id from qpmixed'))
      expect((err as PgError).code).toBe('42P01')
    })
  })

  test('::date cast and operator expressions parse identically to plain SQL', async () => {
    await withConn(async (c) => {
      const r = await c.query("select ('2020-01-02'::date = date '2020-01-02') as eq, ('abc' ~ 'b') as m")
      expect(r.rows[0]).toEqual([true, true])
    })
  })

  test('non-breaking space (U+00A0) in SQL is sent as-is and the server reports a syntax error', async () => {
    await withConn(async (c) => {
      const err = await caught(() => c.query('select 1')) // NBSP is not SQL whitespace
      expect(err).toBeInstanceOf(PgError) // driver does not normalize whitespace
    })
  })

  test('SET cannot bind a parameter -> server syntax error at $1', async () => {
    await withConn(async (c) => {
      const err = await caught(() => c.query('set search_path to $1', ['public']))
      expect(err).toBeInstanceOf(PgError)
    })
  })
})

describe('out-of-scope guards', () => {
  test('psql backslash meta-command sent as a query rejects with 42601', async () => {
    await withConn(async (c) => {
      const err = await caught(() => c.query('\\d'))
      expect((err as PgError).code).toBe('42601')
    })
  })

  test('there is no simple-query API surface exported', async () => {
    const api = await import('../../../src/index.ts')
    const bag = api as unknown as Record<string, unknown>
    expect(bag.simple).toBeUndefined()
    expect(bag.simpleQuery).toBeUndefined()
  })

  test('query() returns a Promise, not an event-emitter', async () => {
    await withConn(async (c) => {
      const p = c.query('select 1')
      expect(p).toBeInstanceOf(Promise)
      expect((p as unknown as { on?: unknown }).on).toBeUndefined()
      await p // settle it
    })
  })

  test('LISTEN executes as a utility command; notifications never surface (no LISTEN/NOTIFY)', async () => {
    await withConn(async (c) => {
      const r = await c.query('listen qp_chan')
      expect(r.command).toBe('LISTEN')
      // self-notify: NotificationResponse ('A') is silently ignored by handle()
      const n = await c.query("select pg_notify('qp_chan', 'hi')")
      expect(n.command).toBe('SELECT') // no error, no surfaced notification
    })
  })
})

describe('roadmap pending specs (extended-protocol features not yet built)', () => {
  test.todo('binary result format: Bind result codes = 1 and values decode via binary parsers', () => {})
  test.todo('per-query timeout + AbortSignal + out-of-band CancelRequest using backendKey', () => {})
  test.todo('Execute with maxRows>0 + PortalSuspended (server-side chunked fetch)', () => {})
  test.todo('portal-level Describe / cursor support', () => {})
})
