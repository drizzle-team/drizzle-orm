// minipg/http — the httpostgres gateway client. No gateway needed here: mode:'wire' against the
// real cluster produces EXACTLY the bytes the gateway would forward (that is the whole protocol),
// so a stub fetch serving wire captures gives end-to-end tests over real backend frames.
import { test, expect, describe } from 'bun:test'
import { client, PgError } from '../../src/http.ts'
import { Parser } from '../../src/protocol.ts'
import { testConnect, caught, TEST_TIMEOUT } from '../helpers/db.ts'
import { rowDescription, dataRow, frame as wireFrame, type WireCol } from '../helpers/wire.ts'

// capture: each sql as its own wire result, concatenated — the gateway's N-statement body
async function wireBody(...sqls: string[]): Promise<Buffer> {
  const c = await testConnect()
  try {
    const parts: Buffer[] = []
    for (const sql of sqls) for (const f of await c.query(sql, [], { mode: 'wire' })) parts.push(Buffer.from(f))
    return Buffer.concat(parts)
  } finally { c.end() }
}
const frame = (tag: string, body: Buffer): Buffer => {
  const h = Buffer.allocUnsafe(5); h.write(tag, 0, 'latin1'); h.writeInt32BE(body.length + 4, 1)
  return Buffer.concat([h, body])
}
// a served response + captured requests
function serve(bodies: (Buffer | { status?: number; ct?: string; body: Buffer })[]) {
  const calls: { url: string; headers: Record<string, string>; body: unknown }[] = []
  let i = 0
  const fetchImpl = (async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    calls.push({ url: String(url), headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)), body: JSON.parse(init?.body as string) })
    const b = bodies[Math.min(i++, bodies.length - 1)]!
    const r = Buffer.isBuffer(b) ? { body: b } : b
    return new Response(new Uint8Array(r.body), { status: r.status ?? 200, headers: { 'Content-Type': r.ct ?? 'application/vnd.minipg.pgwire' } })
  }) as typeof fetch
  return { fetchImpl, calls }
}

// SYNTHETIC result frames (no cluster needed) — for column-plan cases a captured wire body can't
// express, e.g. a shape column whose type must come from the RowDescription.
function wireResult(cols: WireCol[], rows: (string | null)[][], tag = `SELECT ${rows.length}`): Buffer {
  return Buffer.concat([
    wireFrame('T', rowDescription(cols)),
    ...rows.map((r) => wireFrame('D', dataRow(r))),
    wireFrame('C', Buffer.concat([Buffer.from(tag, 'utf8'), Buffer.from([0])])),
  ])
}
const httpStub = (body: Buffer, cfg: Partial<Parameters<typeof client>[0]> = {}) => {
  const { fetchImpl, calls } = serve([body])
  return { db: client({ url: 'https://gw.example/query', fetch: fetchImpl, ...cfg }), calls }
}

describe('minipg/http', () => {
  test('decode parity over real backend frames: int8 -> BigInt, exactly as every other entry', async () => {
    const body = await wireBody(`select 9007199254740993::int8 as big, 'café' as s, 10.50::numeric as n, null::text as z`)
    const { fetchImpl, calls } = serve([body])
    const db = client({ url: 'https://gw.example/query', token: 'k', fetch: fetchImpl })
    const r = await db.query('select …', [], { mode: 'object' })
    expect(r.rows[0]).toEqual({ big: 9007199254740993n, s: 'café', n: '10.50', z: null }) // int8 -> BigInt: a transport never changes what a value decodes to
    expect(r.command).toBe('SELECT'); expect(r.rowCount).toBe(1)
    expect(calls[0]!.headers['Accept']).toBe('application/vnd.minipg.pgwire') // never trips casual mode
    expect(calls[0]!.headers['Authorization']).toBe('Bearer k')
    // int8:'string' is the opt-in for Response.json(rows) in a Worker, where a BigInt would throw
    const jsonSafe = client({ url: 'https://gw.example/query', fetch: serve([body]).fetchImpl, int8: 'string' })
    expect((await jsonSafe.query('x', [], { mode: 'object' })).rows[0]).toEqual({ big: '9007199254740993', s: 'café', n: '10.50', z: null })
  }, TEST_TIMEOUT)

  test('params encode like the wire driver (BigInt/bytea/Date as text); an E under 200 rejects with the backend PgError', async () => {
    const err = await wireBody('select 1/0')
    const { fetchImpl, calls } = serve([err])
    const db = client({ url: 'https://gw.example/query', fetch: fetchImpl })
    const e = await caught(() => db.query('select $1, $2, $3', [9007199254740993n, Buffer.from('deadbeef', 'hex'), new Date('2024-01-02T03:04:05Z')]))
    expect(e).toBeInstanceOf(PgError)
    expect((e as PgError).code).toBe('22012')
    expect((calls[0]!.body as { params: unknown[] }).params).toEqual(['9007199254740993', '\\xdeadbeef', '2024-01-02T03:04:05.000Z'])
  }, TEST_TIMEOUT)

  test('batch: mid-statement failure rejects with the FIRST error; a TRAILING E (commit-time failure) also rejects the whole call', async () => {
    const mid = await wireBody(`select 1 as a`, 'select 1/0', `select 2 as b`)
    const db1 = client({ url: 'https://gw.example/query', fetch: serve([mid]).fetchImpl })
    const e1 = await caught(() => db1.batch([{ sql: 'a' }, { sql: 'b' }, { sql: 'c' }]))
    expect((e1 as PgError).code).toBe('22012')

    // commit-time failure: N clean results, then an E AFTER the Nth — deferred constraint / 40001
    const okBody = await wireBody(`select 1 as a`, `select 2 as b`)
    const commitE = frame('E', Buffer.concat([Buffer.from('SERROR\0C23505\0Mduplicate key (deferred)\0'), Buffer.from([0])]))
    const db2 = client({ url: 'https://gw.example/query', fetch: serve([Buffer.concat([okBody, commitE])]).fetchImpl })
    const e2 = await caught(() => db2.batch([{ sql: 'a' }, { sql: 'b' }]))
    expect((e2 as PgError).code).toBe('23505') // rows for undone work are never surfaced
  }, TEST_TIMEOUT)

  test('pipeline: statement i failed, the rest committed — full per-statement outcome array', async () => {
    const body = await wireBody(`select 1 as a`, 'select 1/0', `select 3 as c`)
    const db = client({ url: 'https://gw.example/query', fetch: serve([body]).fetchImpl })
    const rs = await db.pipeline([{ sql: 'a', mode: 'object' }, { sql: 'b' }, { sql: 'c', mode: 'object' }])
    expect(rs[0]).toEqual({ status: 'fulfilled', value: expect.objectContaining({ rows: [{ a: 1 }] }) })
    expect(rs[1]!.status).toBe('rejected')
    expect(((rs[1] as { reason: PgError }).reason).code).toBe('22012')
    expect((rs[2] as { value: { rows: unknown[] } }).value.rows).toEqual([{ c: 3 }])
  }, TEST_TIMEOUT)

  test('desc elision: 2nd request carries the T-frame hash; a T-less response decodes via the cached descriptor', async () => {
    const sql = `select 7 as id, 'ada' as name`
    const full = await wireBody(sql)
    // simulate a desc hit: the gateway omits T — strip it from the capture
    const msgs = new Parser().push(full)
    const noT = Buffer.concat(msgs.filter((m) => m.type !== 'T').map((m) => frame(m.type, m.body)))
    const { fetchImpl, calls } = serve([full, noT])
    const db = client({ url: 'https://gw.example/query', fetch: fetchImpl })
    expect((await db.query(sql, [], { mode: 'object' })).rows[0]).toEqual({ id: 7, name: 'ada' })
    expect((calls[0]!.body as { desc?: string }).desc).toBeUndefined() // cold: nothing to claim
    const r2 = await db.query(sql, [], { mode: 'object' })
    expect(r2.rows[0]).toEqual({ id: 7, name: 'ada' }) // decoded with the cached fields
    expect((calls[1]!.body as { desc?: string }).desc).toMatch(/^[0-9a-f]{16}$/) // FNV-1a 64 of the raw T frame
  }, TEST_TIMEOUT)

  test('guards + transport errors: tx-control refused locally; wrong content-type refused; non-200 synthetic E -> PgError', async () => {
    const db = client({ url: 'https://gw.example/query', fetch: serve([Buffer.alloc(0)]).fetchImpl })
    expect(() => db['guard']('commit')).toThrow(/GATEWAY owns the transaction boundary/)
    await expect(db.query('begin')).rejects.toThrow(/transaction control/)

    const wrongCt = client({ url: 'https://gw.example/query', fetch: serve([{ body: Buffer.from('{}'), ct: 'application/json' }]).fetchImpl })
    await expect(wrongCt.query('select 1')).rejects.toThrow(/unexpected response content-type/)

    const authE = frame('E', Buffer.concat([Buffer.from('SFATAL\0C28000\0Mbad key\0'), Buffer.from([0])]))
    const denied = client({ url: 'https://gw.example/query', fetch: serve([{ body: authE, status: 401 }]).fetchImpl })
    const e = await caught(() => denied.query('select 1'))
    expect(e).toBeInstanceOf(PgError)
    expect((e as PgError).code).toBe('28000') // one parse path: gateway errors ARE pgwire
  }, TEST_TIMEOUT)

  test('connection-level frames in the body are refused (the gateway must never forward Z/S/R/K)', async () => {
    const z = frame('Z', Buffer.from('I'))
    const db = client({ url: 'https://gw.example/query', fetch: serve([Buffer.concat([await wireBody('select 1 as x'), z])]).fetchImpl })
    await expect(db.query('select 1')).rejects.toThrow(/connection-level frame 'Z'/)
  }, TEST_TIMEOUT)
})


// A shape's 'unknown' (oid 0) column means "use the OID the server reports". This client took the
// shape's columns verbatim and never merged the RowDescription, so count(*) decoded as the string "2".
describe("minipg/http: shape 'unknown' resolves against the reported field types", () => {
  test('minipg/http: count(*)::int8, an int4 aggregate and a json -> field decode by the SERVER-reported OID', async () => {
    const { db } = httpStub(wireResult(
      [{ name: 'count', oid: 20 }, { name: 'usersCount', oid: 23 }, { name: 'jsonNumberField', oid: 114 }, { name: 'jsonStringField', oid: 114 }],
      [['2', '7', '123', '"test"']],
    ))
    const r = await db.query('select …', [], { shape: { count: 'unknown', usersCount: 'unknown', jsonNumberField: 'unknown', jsonStringField: 'unknown' } })
    expect(r.rows[0]).toEqual({ count: 2n, usersCount: 7, jsonNumberField: 123, jsonStringField: 'test' }) // count(*) is int8 -> BigInt, as on every entry
  })

  test('minipg/http: int8/temporal/array handling still applies to a column that arrived as unknown', async () => {
    const body = wireResult([{ name: 'big', oid: 20 }, { name: 'ts', oid: 1184 }, { name: 'tags', oid: 1009 }], [['9007199254740993', '2024-01-02 03:04:05+00', '{a,b}']])
    const shape = { big: 'unknown', ts: 'unknown', tags: 'unknown' } as const

    const r1 = await httpStub(body).db.query('select …', [], { shape })
    expect((r1.rows[0] as { big: bigint }).big).toBe(9007199254740993n)
    expect((r1.rows[0] as { ts: Date }).ts).toBeInstanceOf(Date)
    expect((r1.rows[0] as { tags: string[] }).tags).toEqual(['a', 'b']) // text[] parsed, not left as the literal '{a,b}'

    // the post-passes key off the REAL oid, so they must run after the merge, not before it
    const r2 = await httpStub(body, { temporal: 'string', int8: 'string' }).db.query('select …', [], { shape })
    expect((r2.rows[0] as { ts: string }).ts).toBe('2024-01-02 03:04:05+00')
    expect((r2.rows[0] as { big: string }).big).toBe('9007199254740993')
  })

  test('minipg/http: a shape column with a DECLARED type still wins over the reported OID', async () => {
    const { db } = httpStub(wireResult([{ name: 'n', oid: 25 }], [['42']]))
    const r = await db.query('select …', [], { shape: { n: 'int4' } })
    expect(r.rows[0]).toEqual({ n: 42 })
  })
})

// Array params must go out as a PG array literal '{"a","b"}', not JSON '["a","b"]' (22P02).
describe('minipg/http: array params and int8 opt-outs', () => {
  const int8Cols = [{ name: 'big', oid: 20 }, { name: 'bigs', oid: 1016 }] // int8, int8[]
  const int8Row = ['9007199254740993', '{1,9007199254740993}']

  test('minipg/http: query/batch/pipeline all send a PG array literal; declared jsonb sends JSON', async () => {
    const body = wireResult([{ name: 'n', oid: 23 }], [['1']])
    const q = httpStub(body)
    await q.db.query('select $1', [['abc', 'def']])
    expect((q.calls[0]!.body as { params: unknown[] }).params).toEqual(['{"abc","def"}'])

    const b = httpStub(body)
    await b.db.batch([{ sql: 'select $1', params: [['abc', 'def']] }])
    expect((b.calls[0]!.body as { queries: { params: unknown[] }[] }).queries[0]!.params).toEqual(['{"abc","def"}'])

    const p = httpStub(body)
    await p.db.pipeline([{ sql: 'select $1', params: [[1, 2]] }])
    expect((p.calls[0]!.body as { queries: { params: unknown[] }[] }).queries[0]!.params).toEqual(['{1,2}'])

    const j = httpStub(body)
    await j.db.query('select $1', [['a', 'b']], { types: ['jsonb'] })
    expect((j.calls[0]!.body as { params: unknown[] }).params).toEqual(['["a","b"]'])
    expect((j.calls[0]!.body as { types: unknown[] }).types).toEqual(['jsonb']) // the declared types still reach the gateway
  })

  test("int8:'string' / 'number' remain available as the JSON-safe opt-outs", async () => {
    const s = await httpStub(wireResult(int8Cols, [int8Row]), { int8: 'string' }).db.query('select …', [], { mode: 'object' }) as { rows: Record<string, unknown>[] }
    expect(s.rows[0]!.big).toBe('9007199254740993')
    expect(s.rows[0]!.bigs).toEqual(['1', '9007199254740993'])
    expect(() => JSON.stringify(s.rows[0])).not.toThrow() // the reason the option exists
    const n = await httpStub(wireResult(int8Cols, [int8Row]), { int8: 'number' }).db.query('select …', [], { mode: 'object' }) as { rows: Record<string, unknown>[] }
    expect(n.rows[0]!.big).toBe(9007199254740992) // lossy above 2^53, by construction
  })
})
