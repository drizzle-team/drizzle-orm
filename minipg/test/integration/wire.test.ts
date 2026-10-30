// mode:'wire' — the statement's raw backend frames, undigested. The driver answers "what did this
// statement return": {T, D, C, E, I} with framing intact; protocol acks (1/2/3/t), the
// nondeterministic 'n', and connection-level events (Z/S/N/A/K) never appear. Errors are DATA:
// a backend ErrorResponse resolves (the E frame is in the array); only connection-level failures
// reject. Built for the httpostgres gateway (PROTOCOL.md): the HTTP response body IS these bytes.
import { test, expect, describe } from 'bun:test'
import { connect, PgError } from '../../src/index.ts'
import { Parser, parseRowDescription, parseDataRow } from '../../src/protocol.ts'
import { TEST_CONFIG, testConnect, caught, TEST_TIMEOUT } from '../helpers/db.ts'

const K = `wire_${process.pid}`
// reassemble the runs and parse them with the SAME parser a socket client uses
function reparse(frames: Uint8Array[]): { type: string; body: Buffer }[] {
  return new Parser().push(Buffer.concat(frames.map((f) => Buffer.from(f))))
}
const tags = (frames: Uint8Array[]) => reparse(frames).map((m) => m.type) // entries are RUNS — tag list comes from reparsing

describe("mode:'wire'", () => {
  test('select: [T, D…, C]; reparsed values match mode:object exactly', async () => {
    const c = await testConnect()
    try {
      const frames = await c.query(`select 1 as a, 'hi' as b, null::text as n`, [], { mode: 'wire' })
      expect(tags(frames)).toEqual(['T', 'D', 'C'])
      const msgs = reparse(frames)
      const fields = parseRowDescription(msgs[0]!.body)
      expect(fields.map((f) => f.name)).toEqual(['a', 'b', 'n'])
      const cells = parseDataRow(msgs[1]!.body)
      expect(cells.map((x) => (x === null ? null : x.toString('utf8')))).toEqual(['1', 'hi', null])
      const obj = await c.query(`select 1 as a, 'hi' as b, null::text as n`, [], { mode: 'object' })
      expect(obj.rows[0]).toEqual({ a: 1, b: 'hi', n: null })
    } finally { c.end() }
  }, TEST_TIMEOUT)

  test("insert without returning: ['C'] — no T, no 'n' (NoData excluded as nondeterministic)", async () => {
    const c = await testConnect()
    try {
      await c.query(`create temp table ${K}_i(v int4)`)
      const frames = await c.query(`insert into ${K}_i values (1)`, [], { mode: 'wire' })
      expect(tags(frames)).toEqual(['C'])
      expect(reparse(frames)[0]!.body.toString('latin1')).toContain('INSERT 0 1')
      expect(tags(await c.query('', [], { mode: 'wire' }))).toEqual(['I']) // empty sql -> EmptyQueryResponse
    } finally { c.end() }
  }, TEST_TIMEOUT)

  test('a failing statement RESOLVES with the E frame in-band; the connection stays usable', async () => {
    const c = await testConnect()
    try {
      // execute-time failure: Describe already produced T, then Execute errors -> [T, E]
      const frames = await c.query('select 1/0', [], { mode: 'wire' })
      expect(tags(frames)).toEqual(['T', 'E'])
      expect(reparse(frames)[1]!.body.toString('latin1')).toContain('22012') // division_by_zero, verbatim backend bytes
      // parse-time failure: nothing precedes the E
      expect(tags(await c.query('selec 1', [], { mode: 'wire' }))).toEqual(['E'])
      expect((await c.query('select 41+1 as x', [], { mode: 'object' })).rows[0]).toEqual({ x: 42 })
    } finally { c.end() }
  }, TEST_TIMEOUT)

  test('prepared reuse: second run legitimately has no T — and stays TEXT (no binary-on-reuse upgrade)', async () => {
    const c = await connect({ ...TEST_CONFIG, prepare: true })
    try {
      const first = await c.query('select 9007199254740993::int8 as v, now()::date as d', [], { mode: 'wire', name: `${K}_p` })
      const again = await c.query('select 9007199254740993::int8 as v, now()::date as d', [], { mode: 'wire', name: `${K}_p` })
      expect(tags(first)).toEqual(['T', 'D', 'C'])
      expect(tags(again)).toEqual(['D', 'C']) // no T on reuse — the proxy replays its cached T frame
      // text pinned: the reused D payload is byte-identical to the first execution's (int8+date are
      // reuseBinaryOids types — array/object modes WOULD have flipped them to binary here)
      const dOf = (fr: Uint8Array[]) => Buffer.from(reparse(fr).find((m) => m.type === 'D')!.body)
      expect(dOf(again).equals(dOf(first))).toBe(true)
    } finally { c.end() }
  }, TEST_TIMEOUT)

  test('DDL-invalidated named statement: E resolves in-band (no transparent retry), next run self-heals with a fresh T', async () => {
    const c = await connect({ ...TEST_CONFIG, prepare: true })
    const c2 = await testConnect()
    try {
      await c2.query(`create table ${K}_ddl(a int4)`)
      await c.query(`select * from ${K}_ddl`, [], { mode: 'wire', name: `${K}_d` })
      await c2.query(`alter table ${K}_ddl add column b int4`)
      const invalidated = await c.query(`select * from ${K}_ddl`, [], { mode: 'wire', name: `${K}_d` })
      expect(tags(invalidated)).toEqual(['E'])
      expect(reparse(invalidated)[0]!.body.toString('latin1')).toContain('0A000') // cached plan must not change result type
      const healed = await c.query(`select * from ${K}_ddl`, [], { mode: 'wire', name: `${K}_d` })
      expect(tags(healed)).toEqual(['T', 'C']) // re-Parsed: fresh T with BOTH columns
      expect(parseRowDescription(reparse(healed)[0]!.body).map((f) => f.name)).toEqual(['a', 'b'])
    } finally {
      await c2.query(`drop table ${K}_ddl`).catch(() => {})
      c.end(); c2.end()
    }
  }, TEST_TIMEOUT)

  test('concurrent wire statements on one connection: each gets its own frames, in request order', async () => {
    const c = await testConnect()
    try {
      const [a, b, d] = await Promise.all([
        c.query(`select 'first' as t`, [], { mode: 'wire' }),
        c.query('select 1/0', [], { mode: 'wire' }),
        c.query(`select 'third' as t`, [], { mode: 'wire' }),
      ])
      expect(Buffer.concat(a.map((f) => Buffer.from(f))).toString('latin1')).toContain('first')
      expect(tags(b)).toEqual(['T', 'E'])
      expect(Buffer.concat(d.map((f) => Buffer.from(f))).toString('latin1')).toContain('third')
    } finally { c.end() }
  }, TEST_TIMEOUT)

  test('wire BEGIN…COMMIT composition: a deferred-constraint failure AT COMMIT is visible in the COMMIT entry', async () => {
    const c = await testConnect()
    try {
      await c.query(`create table ${K}_dc(id int4, constraint ${K}_dc_u unique (id) deferrable initially immediate)`)
      // the gateway's batch shape: everything in wire mode, fired in one tick — NOTHING rejects
      const rs = await Promise.all([
        c.query('begin', [], { mode: 'wire' }),
        c.query('set constraints all deferred', [], { mode: 'wire' }),
        c.query(`insert into ${K}_dc values (1)`, [], { mode: 'wire' }),
        c.query(`insert into ${K}_dc values (1)`, [], { mode: 'wire' }), // duplicate — fires at COMMIT
        c.query(`select count(*)::int4 from ${K}_dc`, [], { mode: 'wire' }),
        c.query('commit', [], { mode: 'wire' }),
      ])
      for (const r of rs.slice(0, 5)) expect(tags(r as Uint8Array[]).includes('E')).toBe(false) // five clean results
      const commit = rs[5] as Uint8Array[]
      expect(tags(commit)).toEqual(['E']) // the failure lives at the COMMIT index — no walking, no synthesis
      expect(reparse(commit)[0]!.body.toString('latin1')).toContain('23505')
      const n = await c.query(`select count(*)::int4 as n from ${K}_dc`, [], { mode: 'object' })
      expect(n.rows[0]).toEqual({ n: 0 }) // nothing committed
    } finally {
      await c.query(`drop table ${K}_dc`).catch(() => {})
      c.end()
    }
  }, TEST_TIMEOUT)

  test('connection-level failures still REJECT: timeout, and wire+shape/binary are refused', async () => {
    const c = await testConnect()
    try {
      const err = await caught(() => c.query('select pg_sleep(2)', [], { mode: 'wire', timeout: 60 }))
      expect(err).toBeInstanceOf(Error)
      expect(err).not.toBeInstanceOf(PgError) // a timeout is not a backend message
      const combo = await caught(() => (c as unknown as { query: (...a: unknown[]) => Promise<unknown> }).query('select 1', [], { mode: 'wire', binary: true }))
      expect((combo as Error).message).toMatch(/shape\/binary decode options don't apply/)
    } finally { c.end() }
  }, TEST_TIMEOUT)

  test('>64KB pipelined burst: boundaries survive the mid-burst flush; every statement stays whole and ordered', async () => {
    const c = await testConnect()
    try {
      const big = 'x'.repeat(9000)
      const rs = await Promise.all(Array.from({ length: 12 }, (_, i) =>
        c.query(`select $1::text as pad, ${i} as i`, [big + i], { mode: 'wire' })))
      rs.forEach((frames, i) => {
        expect(tags(frames)).toEqual(['T', 'D', 'C'])
        const cells = parseDataRow(reparse(frames)[1]!.body)
        expect(cells[0]!.toString('utf8')).toBe(big + i)
        expect(cells[1]!.toString('utf8')).toBe(String(i))
      })
    } finally { c.end() }
  }, TEST_TIMEOUT)
})

test("span coalescing: entry count is independent of row count ('nothing per message, nothing per row')", async () => {
  const c = await testConnect()
  try {
    const frames = await c.query(`select g, 'pad-' || g as p from generate_series(1, 1000) g`, [], { mode: 'wire' })
    const msgs = reparse(frames)
    expect(msgs.filter((m) => m.type === 'D').length).toBe(1000)   // one thousand rows…
    expect(frames.length).toBeLessThan(10)                          // …a handful of contiguous runs (chunk-bounded, never row-bounded)
  } finally { c.end() }
}, TEST_TIMEOUT)
