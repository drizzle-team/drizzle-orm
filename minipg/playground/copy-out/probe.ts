// Read-path probe: DECLARE/FETCH cursor vs COPY TO STDOUT on a 1M-row drain.
//   bun playground/copy-out/probe.ts
import { connect } from '../../src/index.ts'
import { W, Parser, type RawMessage } from '../../src/protocol.ts'

const SOCK = '/tmp/minipg_sock/.s.PGSQL.54329'
const DB = { user: 'postgres', database: 'testdb' }

// minimal raw client with CopyOut support (trust unix socket)
class Raw {
  sock!: { write(d: Uint8Array): number; end(): void }
  parser = new Parser(); q: RawMessage[] = []; wake: (() => void) | null = null; err: Error | null = null
  static async connect(): Promise<Raw> {
    const c = new Raw()
    c.sock = (await Bun.connect({ unix: SOCK, socket: {
      data: (_s: unknown, d: Uint8Array) => { const ms = c.parser.push(Buffer.from(d)); if (ms.length) c.q.push(...ms); const w = c.wake; c.wake = null; w?.() },
      error: (_s: unknown, e: Error) => { c.err = e; c.wake?.() }, close: () => { c.wake?.() },
    } })) as never
    c.sock.write(W.startup({ ...DB, } as never))
    for (;;) { const m = await c.next(); if (m.type === 'E') throw new Error('auth'); if (m.type === 'Z') break }
    return c
  }
  async next(): Promise<RawMessage> {
    for (;;) {
      const m = this.q.shift()
      if (m) { if (m.type === 'S' || m.type === 'K' || m.type === 'N') continue; return m }
      if (this.err) throw this.err
      await new Promise<void>((r) => { this.wake = r })
    }
  }
  /** COPY … TO STDOUT: returns total bytes + rows (newline count), optional per-field split. */
  async copyOut(sql: string, decode: boolean): Promise<{ rows: number; bytes: number }> {
    const b = Buffer.from(sql + '\0', 'utf8'); const head = Buffer.allocUnsafe(5)
    head.write('Q', 0, 'latin1'); head.writeInt32BE(b.length + 4, 1)
    this.sock.write(Buffer.concat([head, b]))
    let rows = 0, bytes = 0, leftover = ''
    for (;;) {
      const m = await this.next()
      if (m.type === 'd') {
        bytes += m.body.length
        if (decode) { // approximate real decode cost: utf8 + line/field split into strings
          const text = leftover + m.body.toString('utf8')
          const lines = text.split('\n'); leftover = lines.pop()!
          for (const ln of lines) { const f = ln.split('\t'); if (f.length) rows++ }
        } else { for (let i = 0; i < m.body.length; i++) if (m.body[i] === 10) rows++ }
      }
      else if (m.type === 'E') throw new Error('copy failed')
      else if (m.type === 'Z') break
    }
    return { rows, bytes }
  }
  end(): void { try { this.sock.write(W.terminate()) } catch { /* */ } this.sock.end() }
}

const mc = await connect({ path: SOCK, ...DB })
await mc.query('drop table if exists cop')
await mc.query('create table cop(id int8 primary key, name text, qty int4, price float8, flag bool, created_at timestamptz)')
{
  const N = 1_000_000
  const rows: Record<string, unknown>[] = new Array(N)
  for (let i = 0; i < N; i++) rows[i] = { id: i + 1, name: `n_${i}`, qty: i % 1000, price: i + 0.25, flag: i % 2 === 0, created_at: new Date(1767225600000 + (i % 86400) * 1000) }
  await mc.copyMany('cop', { id: 'int8', name: 'text', qty: 'int4', price: 'float8', flag: 'bool', created_at: 'timestamptz' }, rows, { chunk: 250_000, atomic: false })
  await mc.query('vacuum analyze cop')
}
const raw = await Raw.connect()

const LANES: [string, () => Promise<number>][] = [
  ['cursor fetchSize=5000 (decoded objects)', async () => {
    let n = 0
    for await (const batch of mc.cursor({ sql: 'select * from cop', fetchSize: 5000, fullScan: true }).batches()) n += batch.length
    return n
  }],
  ['cursor fetchSize=20000 (decoded objects)', async () => {
    let n = 0
    for await (const batch of mc.cursor({ sql: 'select * from cop', fetchSize: 20000, fullScan: true }).batches()) n += batch.length
    return n
  }],
  ['COPY TO text (transport only)', async () => (await raw.copyOut('copy cop to stdout', false)).rows],
  ['COPY TO text (line+field split)', async () => (await raw.copyOut('copy cop to stdout', true)).rows],
  ['single SELECT * (all in memory)', async () => (await mc.query('select * from cop', [], { mode: 'object' })).rows.length],
]
const res = new Map<string, number[]>(LANES.map(([k]) => [k, []]))
for (const [, run] of LANES) await run() // warmup
for (let round = 0; round < 3; round++) {
  for (const [k, run] of LANES) {
    const t0 = performance.now()
    const n = await run()
    if (n !== 1_000_000) throw new Error(`${k}: bad count ${n}`)
    res.get(k)!.push(performance.now() - t0)
  }
}
for (const [k] of LANES) {
  const s = [...res.get(k)!].sort((a, b) => a - b)
  console.log(`${k.padEnd(42)} ${Math.round(1_000_000 / (s[1]! / 1000)).toLocaleString().padStart(10)} rows/s  (${Math.round(1_000_000 / (s[2]! / 1000)).toLocaleString()}..${Math.round(1_000_000 / (s[0]! / 1000)).toLocaleString()})`)
}
await mc.query('drop table cop')
raw.end(); await mc.end()
process.exit(0)
