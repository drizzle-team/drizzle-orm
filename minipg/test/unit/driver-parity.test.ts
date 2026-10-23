// Behaviour that must hold IDENTICALLY on every stateless entry (minipg/http, /neon-http, /aurora).
// Each entry carries its own copy of this plumbing, so these tests exist to catch the copies drifting —
// which is exactly how the bugs below shipped:
//   - http combined `timeout` + `signal` with AbortSignal.any (Node 20.3+, package says node >= 18), so
//     passing both threw "AbortSignal.any is not a function" instead of running the query;
//   - aurora accepted `timeout` in its options and on every query overload, but never applied it.
// Everything here goes through the PUBLIC api — no reaching into private helpers.
import { test, expect, describe } from 'bun:test'
import { client } from '../../src/http.ts'
import { createPool as neonClient } from '../../src/neon-http.ts'
import { connect as auroraConnect, bind, type AuroraConfig } from '../../src/aurora.ts'
import type { NeonHttpConfig } from '../../src/neon-http.ts'
import { rowDescription, dataRow, frame, type WireCol } from '../helpers/wire.ts'

// a fetch that never answers until its signal aborts — a timeout is the only way out
const hangingFetch = (async (_url: Parameters<typeof fetch>[0], init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    const sig = init?.signal
    if (!sig) return // hangs forever; every caller here passes one
    if (sig.aborted) return reject(sig.reason)
    sig.addEventListener('abort', () => reject(sig.reason), { once: true })
  })) as typeof fetch

const AURORA: AuroraConfig = {
  resourceArn: 'arn:aws:rds:eu-central-1:123456789012:cluster:c', secretArn: 'arn:aws:secretsmanager:eu-central-1:123456789012:secret:s',
  database: 'db0', credentials: { accessKeyId: 'AKID', secretAccessKey: 'SECRET' },
}
const httpDb = () => client({ url: 'https://gw.example/query', fetch: hangingFetch })
const neonDb = () => neonClient({ url: 'postgres://u:p@ep-x.region.aws.neon.tech/db', fetch: hangingFetch })
const auroraDb = () => auroraConnect({ ...AURORA, fetch: hangingFetch })

describe('`timeout` is honored on every entry', () => {
  test('minipg/http', async () => {
    const err = await httpDb().query('select 1', [], { timeout: 10 }).catch((e) => e) as Error
    expect(err).toBeInstanceOf(Error)
  })

  test('minipg/neon-http', async () => {
    const err = await neonDb().query('select 1', [], { timeout: 10 }).catch((e) => e) as Error
    expect(err).toBeInstanceOf(Error)
  })

  // aurora typed `timeout` on every query overload but never read it — the option did nothing
  test('minipg/aurora (was declared but ignored)', async () => {
    const db = await auroraDb()
    const err = await db.query('select 1', [bind.int(1)], { timeout: 10 }).catch((e) => e) as Error
    expect(err).toBeInstanceOf(Error)
    expect((err as { code?: string }).code === 'QUERY_TIMEOUT' || err.message.includes('timed out')).toBe(true)
  })
})

describe('timeout + signal combine without AbortSignal.any (Node 18 compatibility)', () => {
  const withoutAbortSignalAny = async (fn: () => Promise<unknown>) => {
    const saved = (AbortSignal as unknown as { any?: unknown }).any
    delete (AbortSignal as unknown as { any?: unknown }).any // simulate Node 18
    try { return await fn() } finally { (AbortSignal as unknown as { any?: unknown }).any = saved }
  }

  test('minipg/http still times out when BOTH are passed', async () => {
    const err = await withoutAbortSignalAny(() =>
      httpDb().query('select 1', [], { timeout: 10, signal: new AbortController().signal }).catch((e) => e)) as Error
    expect(err.message).toContain('timed out after 10ms')
    expect((err as { code?: string }).code).toBe('QUERY_TIMEOUT') // tagged, so it is distinguishable from an external abort
  })

  test('minipg/neon-http and /aurora too', async () => {
    const neon = await withoutAbortSignalAny(() =>
      neonDb().query('select 1', [], { timeout: 10, signal: new AbortController().signal }).catch((e) => e)) as Error
    expect(neon.message).toContain('timed out after 10ms')
    const db = await auroraDb()
    const aurora = await withoutAbortSignalAny(() =>
      db.query('select 1', [], { timeout: 10, signal: new AbortController().signal }).catch((e) => e)) as Error
    expect(aurora.message).toContain('timed out after 10ms')
  })

  test("an EXTERNAL abort forwards the caller's own reason, not the timeout error", async () => {
    const outer = new AbortController()
    const p = httpDb().query('select 1', [], { timeout: 10_000, signal: outer.signal }).catch((e) => e) as Promise<Error>
    outer.abort(new Error('caller changed its mind'))
    expect((await p).message).toBe('caller changed its mind')
  })
})

describe('transaction-control SQL is rejected identically, with each entry naming its own alternative', () => {
  const REJECTED = ['begin', 'BEGIN', '  start transaction', 'commit', 'end', 'rollback', 'abort', 'prepare transaction x']

  test('all three reject every transaction-control verb', async () => {
    const aurora = await auroraDb()
    for (const sql of REJECTED) {
      for (const [name, run] of [
        ['minipg/http', () => httpDb().query(sql)],
        ['minipg/neon-http', () => neonDb().query(sql)],
        ['minipg/aurora', () => aurora.query(sql)],
      ] as const) {
        const err = await (run() as Promise<unknown>).catch((e: Error) => e) as Error
        expect(err).toBeInstanceOf(Error)
        expect(err.message).toContain(name) // its own message, naming its own alternative
      }
    }
  })

  test('SAVEPOINT forms are NOT caught — aurora issues them itself for nested transactions', async () => {
    const aurora = await auroraDb()
    for (const sql of ['savepoint s1', 'release savepoint s1', 'rollback to savepoint s1']) {
      // a short timeout proves it REACHED the transport instead of being refused up front
      const err = await aurora.query(sql, [], { timeout: 10 }).catch((e: Error) => e) as Error
      expect(err.message).not.toContain('bypasses the Data API')
      expect(err.message).toContain('timed out')
    }
  })
})


// ---- decode-parity fixtures: the same columns delivered the way each transport delivers them ----
function wireResult(cols: WireCol[], rows: (string | null)[][]): Buffer {
  return Buffer.concat([
    frame('T', rowDescription(cols)),
    ...rows.map((r) => frame('D', dataRow(r))),
    frame('C', Buffer.concat([Buffer.from(`SELECT ${rows.length}`, 'utf8'), Buffer.from([0])])),
  ])
}
function httpStub(body: Buffer, cfg: Partial<Parameters<typeof client>[0]> = {}) {
  const fetchImpl = (async () => new Response(new Uint8Array(body), { status: 200, headers: { 'Content-Type': 'application/vnd.minipg.pgwire' } })) as unknown as typeof fetch
  return client({ url: 'https://gw.example/query', fetch: fetchImpl, ...cfg })
}
function neonStub(fields: { name: string; dataTypeID: number }[], rows: (string | null)[][], cfg: Partial<NeonHttpConfig> = {}) {
  const fetchImpl = (async () => new Response(JSON.stringify({ command: 'SELECT', rowCount: rows.length, fields, rows }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch
  return neonClient({ url: 'postgres://u:p@ep-x.region.aws.neon.tech/db', fetch: fetchImpl, ...cfg })
}

// A transport decides how bytes are MOVED, never what a value decodes to. minipg/http used to default
// int8 to 'string' while the wire driver, neon-http and aurora all produced BigInt — so the same query
// returned a different JS type depending on which entry the app imported.
describe('decode defaults are identical across the HTTP entries', () => {
  const cols = [
    { name: 'big', oid: 20 }, { name: 'bigs', oid: 1016 }, // int8, int8[]
    { name: 'num', oid: 1700 }, { name: 'ts', oid: 1184 }, { name: 'tss', oid: 1185 }, // numeric, timestamptz, timestamptz[]
    { name: 'n', oid: 23 }, { name: 'b', oid: 16 },
  ]
  const row = ['9007199254740993', '{1,9007199254740993}', '10.50', '2024-01-02 03:04:05+00', '{"2024-01-02 03:04:05+00"}', '7', 't']
  const neonFields = cols.map((c) => ({ name: c.name, dataTypeID: c.oid })) // the same columns as neon reports them

  test('minipg/http defaults: int8 -> BigInt (scalar AND array), numeric -> string, temporal -> Date', async () => {
    const r = await httpStub(wireResult(cols, [row])).query('select …', [], { mode: 'object' }) as { rows: Record<string, unknown>[] }
    expect(r.rows[0]!.big).toBe(9007199254740993n)
    expect(r.rows[0]!.bigs).toEqual([1n, 9007199254740993n]) // int8[] elements follow the scalar rule
    expect(r.rows[0]!.num).toBe('10.50')
    expect(r.rows[0]!.ts).toBeInstanceOf(Date)
    expect((r.rows[0]!.tss as Date[])[0]).toBeInstanceOf(Date)
    expect(r.rows[0]!.n).toBe(7)
    expect(r.rows[0]!.b).toBe(true)
  })

  test('minipg/neon-http produces the identical values from the identical OIDs', async () => {
    const r = await neonStub(neonFields, [row]).query('select …', [], { mode: 'object' }) as { rows: Record<string, unknown>[] }
    expect(r.rows[0]!.big).toBe(9007199254740993n)
    expect(r.rows[0]!.bigs).toEqual([1n, 9007199254740993n])
    expect(r.rows[0]!.num).toBe('10.50')
    expect(r.rows[0]!.ts).toBeInstanceOf(Date)
    expect((r.rows[0]!.tss as Date[])[0]).toBeInstanceOf(Date)
    expect(r.rows[0]!.n).toBe(7)
    expect(r.rows[0]!.b).toBe(true)
  })

  test("temporal:'string' reaches temporal[] ELEMENTS on both, as resolveCols does on the wire", async () => {
    const h = await httpStub(wireResult(cols, [row]), { temporal: 'string' }).query('select …', [], { mode: 'object' }) as { rows: Record<string, unknown>[] }
    expect(h.rows[0]!.ts).toBe('2024-01-02 03:04:05+00')
    expect(h.rows[0]!.tss).toEqual(['2024-01-02 03:04:05+00']) // was left as Date[] on minipg/http
    const n = await neonStub(neonFields, [row], { temporal: 'string' }).query('select …', [], { mode: 'object' }) as { rows: Record<string, unknown>[] }
    expect(n.rows[0]!.ts).toBe('2024-01-02 03:04:05+00')
    expect(n.rows[0]!.tss).toEqual(['2024-01-02 03:04:05+00'])
  })
})
