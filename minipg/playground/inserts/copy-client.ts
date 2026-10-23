// Minimal raw-wire-protocol client for the COPY FROM STDIN prototype. Deliberately NOT part
// of src/ — this is the playground mock-up of what CopyIn support in minipg would look like
// (src/connection.ts currently answers CopyInResponse with CopyFail). Unix-socket + trust
// auth only (the local test cluster from test/setup-pg.sh), so no SCRAM/TLS here.
import { W, Parser, type RawMessage } from '../../src/protocol.ts'

const EMPTY = Buffer.alloc(0)
const frame = (type: string, payload: Buffer = EMPTY): Buffer => {
  const head = Buffer.allocUnsafe(5)
  head.write(type, 0, 'latin1')
  head.writeInt32BE(payload.length + 4, 1)
  return payload.length ? Buffer.concat([head, payload]) : head
}
const simpleQuery = (sql: string): Buffer => frame('Q', Buffer.from(sql + '\0', 'utf8'))

const parseTag = (body: Buffer): { command: string | null; rowCount: number | null } => {
  let end = 0
  while (body[end] !== 0) end += 1
  const tag = body.toString('utf8', 0, end)
  const m = tag.match(/(\d+)\s*$/)
  return { command: tag.split(' ')[0] ?? null, rowCount: m ? parseInt(m[1]!, 10) : null }
}

const pgError = (body: Buffer): Error => {
  const fields = new Map<string, string>()
  let off = 0
  while (off < body.length && body[off] !== 0) {
    const t = String.fromCharCode(body[off]!)
    let end = off + 1
    while (body[end] !== 0) end += 1
    fields.set(t, body.toString('utf8', off + 1, end))
    off = end + 1
  }
  return new Error(`${fields.get('C') ?? '?????'}: ${fields.get('M') ?? 'unknown error'}`)
}

interface BunSocket {
  write(data: Uint8Array): number
  end(): void
}

export class RawPg {
  private sock!: BunSocket
  private parser = new Parser()
  private q: RawMessage[] = []
  private wake: (() => void) | null = null
  private drainWake: (() => void) | null = null
  private err: Error | null = null
  private ended = false

  static async connect(o: { unix: string; user: string; database: string }): Promise<RawPg> {
    const c = new RawPg()
    c.sock = (await Bun.connect({
      unix: o.unix,
      socket: {
        data: (_s: unknown, d: Uint8Array) => c.onData(d),
        drain: () => { const r = c.drainWake; c.drainWake = null; r?.() },
        error: (_s: unknown, e: Error) => { c.err = e; c.wake?.(); c.drainWake?.() },
        close: () => { if (!c.ended) c.err ??= new Error('connection closed unexpectedly'); c.wake?.(); c.drainWake?.() },
      },
    })) as unknown as BunSocket
    await c.writeAll(W.startup({ user: o.user, database: o.database }))
    for (;;) {
      const m = await c.next()
      if (m.type === 'R' && m.body.readInt32BE(0) !== 0) throw new Error('playground COPY client only supports trust auth (use the unix socket)')
      if (m.type === 'E') throw pgError(m.body)
      if (m.type === 'Z') break // ParameterStatus/BackendKeyData just skipped
    }
    return c
  }

  private onData(d: Uint8Array): void {
    // copy: Bun may reuse the callback buffer, and Parser keeps subarray references
    const msgs = this.parser.push(Buffer.from(d))
    if (msgs.length) this.q.push(...msgs)
    const r = this.wake; this.wake = null; r?.()
  }

  private async next(): Promise<RawMessage> {
    for (;;) {
      const m = this.q.shift()
      if (m) { if (m.type === 'N' || m.type === 'S' || m.type === 'K' || m.type === 'A') continue; return m }
      if (this.err) throw this.err
      await new Promise<void>((r) => { this.wake = r })
    }
  }

  private async writeAll(buf: Buffer): Promise<void> {
    let off = 0
    while (off < buf.length) {
      if (this.err) throw this.err
      const n = this.sock.write(off === 0 ? buf : buf.subarray(off))
      off += n
      if (off < buf.length) await new Promise<void>((r) => { this.drainWake = r })
    }
  }

  /** Simple-protocol query ('Q'). Collects to ReadyForQuery; returns the CommandComplete tag. */
  async simple(sql: string): Promise<{ command: string | null; rowCount: number | null }> {
    await this.writeAll(simpleQuery(sql))
    let tag: { command: string | null; rowCount: number | null } = { command: null, rowCount: null }
    let err: Error | null = null
    for (;;) {
      const m = await this.next()
      if (m.type === 'C') tag = parseTag(m.body)
      else if (m.type === 'E') err = pgError(m.body)
      else if (m.type === 'Z') break
    }
    if (err) throw err
    return tag
  }

  /** COPY ... FROM STDIN. `chunks` are raw COPY-format payload slices (text or binary format —
   *  CopyData frame boundaries need not align with rows). Returns the copied row count. */
  async copyIn(sql: string, chunks: readonly Buffer[]): Promise<number> {
    await this.writeAll(simpleQuery(sql))
    for (;;) {
      const m = await this.next()
      if (m.type === 'G') break // CopyInResponse (per-column format codes in body — not needed here)
      if (m.type === 'E') { await this.drainToReady(); throw pgError(m.body) }
    }
    for (const c of chunks) await this.writeAll(frame('d', c))
    await this.writeAll(frame('c')) // CopyDone
    let count = 0
    let err: Error | null = null
    for (;;) {
      const m = await this.next()
      if (m.type === 'C') count = parseTag(m.body).rowCount ?? 0
      else if (m.type === 'E') err = pgError(m.body)
      else if (m.type === 'Z') break
    }
    if (err) throw err
    return count
  }

  private async drainToReady(): Promise<void> {
    for (;;) { if ((await this.next()).type === 'Z') return }
  }

  end(): void {
    this.ended = true
    try { this.sock.write(W.terminate()) } catch { /* already closed */ }
    this.sock.end()
  }
}
