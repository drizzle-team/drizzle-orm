// Minimal raw LOGICAL REPLICATION client — the playground prototype for drizzle-pulse support
// in minipg (like copy-client.ts was for COPY). Unix-socket + trust auth only (the local test
// cluster). Speaks: startup with replication=database, the walsender grammar over simple 'Q',
// CopyBoth streaming ('W'), XLogData/keepalive envelopes, standby-status acks, and a full
// pgoutput (proto v1 + messages) parser with per-relation column caching.
import { W, Parser, parseRowDescription, parseDataRow, type RawMessage } from '../../src/protocol.ts'

const PG_EPOCH_MS = 946684800000n // 2000-01-01T00:00:00Z

// ---------- LSN helpers ----------
export const lsnToString = (lsn: bigint): string => `${(lsn >> 32n).toString(16).toUpperCase()}/${(lsn & 0xffffffffn).toString(16).toUpperCase()}`
export const lsnFromString = (s: string): bigint => { const [hi, lo] = s.split('/'); return (BigInt(parseInt(hi!, 16)) << 32n) | BigInt(parseInt(lo!, 16)) }

// ---------- pgoutput event model ----------
export interface RelInfo { id: number; schema: string; name: string; replicaIdentity: string; columns: { name: string; oid: number; key: boolean }[] }
export type Tuple = (string | null | { unchangedToast: true })[]
export type PgoutputEvent =
  | { kind: 'begin'; finalLsn: bigint; commitTime: Date; xid: number }
  | { kind: 'commit'; commitLsn: bigint; endLsn: bigint; commitTime: Date }
  | { kind: 'relation'; relation: RelInfo }
  | { kind: 'insert'; relation: RelInfo; new: Tuple }
  | { kind: 'update'; relation: RelInfo; old: Tuple | null; oldKind: 'key' | 'full' | null; new: Tuple }
  | { kind: 'delete'; relation: RelInfo; old: Tuple; oldKind: 'key' | 'full' }
  | { kind: 'truncate'; relations: RelInfo[]; cascade: boolean; restartIdentity: boolean }
  | { kind: 'message'; transactional: boolean; prefix: string; content: Buffer; lsn: bigint }
  | { kind: 'origin' | 'type' }

const frame = (type: string, payload: Buffer): Buffer => {
  const head = Buffer.allocUnsafe(5)
  head.write(type, 0, 'latin1'); head.writeInt32BE(payload.length + 4, 1)
  return Buffer.concat([head, payload])
}

interface BunSocket { write(data: Uint8Array): number; end(): void }

export class ReplClient {
  private sock!: BunSocket
  private parser = new Parser()
  private q: RawMessage[] = []
  private wake: (() => void) | null = null
  private err: Error | null = null
  private ended = false
  private relations = new Map<number, RelInfo>() // pgoutput 'R' cache — the decode registry

  lastReceivedLsn = 0n
  flushedLsn = 0n // what we've ACKED (confirmed_flush advances to this)

  static async connect(o: { unix: string; user: string; database: string }): Promise<ReplClient> {
    const c = new ReplClient()
    c.sock = (await Bun.connect({
      unix: o.unix,
      socket: {
        data: (_s: unknown, d: Uint8Array) => c.onData(d),
        error: (_s: unknown, e: Error) => { c.err = e; c.wake?.() },
        close: () => { if (!c.ended) c.err ??= new Error('replication connection closed'); c.wake?.() },
      },
    })) as unknown as BunSocket
    // THE one special bit of the handshake: replication=database selects the logical walsender
    c.write(W.startup({ user: o.user, database: o.database, replication: 'database' }))
    for (;;) {
      const m = await c.next()
      if (m.type === 'R' && m.body.readInt32BE(0) !== 0) throw new Error('trust auth only in the playground client')
      if (m.type === 'E') throw c.pgErr(m.body)
      if (m.type === 'Z') break
    }
    return c
  }

  private onData(d: Uint8Array): void {
    const msgs = this.parser.push(Buffer.from(d))
    if (msgs.length) this.q.push(...msgs)
    const r = this.wake; this.wake = null; r?.()
  }
  private async next(): Promise<RawMessage> {
    for (;;) {
      const m = this.q.shift()
      if (m) { if (m.type === 'S' || m.type === 'K' || m.type === 'N' || m.type === 'A') continue; return m }
      if (this.err) throw this.err
      await new Promise<void>((r) => { this.wake = r })
    }
  }
  private write(b: Buffer): void { this.sock.write(b) }
  private pgErr(body: Buffer): Error {
    const f = new Map<string, string>()
    let off = 0
    while (off < body.length && body[off] !== 0) { let e = off + 1; while (body[e] !== 0) e++; f.set(String.fromCharCode(body[off]!), body.toString('utf8', off + 1, e)); off = e + 1 }
    return new Error(`${f.get('C')}: ${f.get('M')}`)
  }

  /** Simple-protocol command (walsender grammar or plain SQL) -> rows as text arrays. */
  async command(sql: string): Promise<{ columns: string[]; rows: (string | null)[][] }> {
    this.write(frame('Q', Buffer.from(sql + '\0', 'utf8')))
    let columns: string[] = []
    const rows: (string | null)[][] = []
    let err: Error | null = null
    for (;;) {
      const m = await this.next()
      if (m.type === 'T') columns = parseRowDescription(m.body).map((f) => f.name)
      else if (m.type === 'D') rows.push(parseDataRow(m.body).map((c) => (c === null ? null : c.toString('utf8'))))
      else if (m.type === 'E') err = this.pgErr(m.body)
      else if (m.type === 'Z') break
      else if (m.type === 'W') { this.q.unshift(m); break } // CopyBothResponse: streaming starts — caller takes over
    }
    if (err) throw err
    return { columns, rows }
  }

  async identify(): Promise<Record<string, string | null>> {
    const r = await this.command('IDENTIFY_SYSTEM')
    return Object.fromEntries(r.columns.map((c, i) => [c, r.rows[0]![i]!]))
  }

  /** CREATE_REPLICATION_SLOT ... LOGICAL pgoutput. Returns consistent point + exported snapshot. */
  async createSlot(name: string, opts: { temporary?: boolean; exportSnapshot?: boolean } = {}): Promise<{ slot: string; consistentPoint: bigint; snapshot: string | null }> {
    // legacy keyword form: works on PG 10-17 (the parenthesized `(SNAPSHOT 'export')` form is 15+ only)
    const sql = `CREATE_REPLICATION_SLOT ${name}${opts.temporary ? ' TEMPORARY' : ''} LOGICAL pgoutput ${opts.exportSnapshot ? 'EXPORT_SNAPSHOT' : 'NOEXPORT_SNAPSHOT'}`
    const r = await this.command(sql)
    const row = Object.fromEntries(r.columns.map((c, i) => [c, r.rows[0]![i]]))
    return { slot: row.slot_name as string, consistentPoint: lsnFromString(row.consistent_point as string), snapshot: (row.snapshot_name as string | null) ?? null }
  }

  /** START_REPLICATION -> async iterator of decoded pgoutput events. Handles keepalives and
   *  sends standby-status acks (flushed = this.flushedLsn — the CONSUMER advances it via ack()). */
  async *start(slot: string, from: bigint, publications: string[], opts: { statusIntervalMs?: number } = {}): AsyncGenerator<PgoutputEvent> {
    const pubs = publications.map((p) => `"${p}"`).join(',')
    this.write(frame('Q', Buffer.from(`START_REPLICATION SLOT ${slot} LOGICAL ${lsnToString(from)} (proto_version '1', publication_names '${pubs}', messages 'true')\0`, 'utf8')))
    for (;;) { // wait for CopyBothResponse
      const m = await this.next()
      if (m.type === 'W') break
      if (m.type === 'E') throw this.pgErr(m.body)
    }
    const status = setInterval(() => this.sendStatus(false), opts.statusIntervalMs ?? 5000)
    try {
      for (;;) {
        const m = await this.next()
        if (m.type === 'E') throw this.pgErr(m.body)
        if (m.type === 'c') break // server CopyDone (e.g. timeline end) — not expected in logical
        if (m.type !== 'd') continue
        const p = m.body
        if (p[0] === 0x6b) { // 'k' keepalive: walEnd, clock, replyRequested
          this.lastReceivedLsn = p.readBigUInt64BE(1) > this.lastReceivedLsn ? p.readBigUInt64BE(1) : this.lastReceivedLsn
          if (p[17] === 1) this.sendStatus(false)
          continue
        }
        if (p[0] !== 0x77) continue // not XLogData
        const walStart = p.readBigUInt64BE(1)
        if (walStart > this.lastReceivedLsn) this.lastReceivedLsn = walStart
        yield this.decode(p.subarray(25)) // 'w' + 3x int64 header = 25 bytes
      }
    } finally { clearInterval(status) }
  }

  /** Consumer acknowledgement: mark everything <= lsn durably processed, tell the server. */
  ack(lsn: bigint): void { if (lsn > this.flushedLsn) { this.flushedLsn = lsn; this.sendStatus(false) } }

  private sendStatus(reply: boolean): void {
    const b = Buffer.allocUnsafe(1 + 8 * 4 + 1)
    b.write('r', 0, 'latin1')
    b.writeBigUInt64BE(this.lastReceivedLsn, 1)      // written
    b.writeBigUInt64BE(this.flushedLsn, 9)           // flushed <- THE ack that releases WAL
    b.writeBigUInt64BE(this.flushedLsn, 17)          // applied
    b.writeBigUInt64BE((BigInt(Date.now()) - PG_EPOCH_MS) * 1000n, 25)
    b[33] = reply ? 1 : 0
    try { this.write(frame('d', b)) } catch { /* socket gone; the stream loop will surface it */ }
  }

  // ---------- pgoutput (proto v1 + messages) ----------
  private decode(b: Buffer): PgoutputEvent {
    const tag = String.fromCharCode(b[0]!)
    let off = 1
    const cstr = (): string => { let e = off; while (b[e] !== 0) e++; const s = b.toString('utf8', off, e); off = e + 1; return s }
    const tuple = (): Tuple => {
      const n = b.readInt16BE(off); off += 2
      const out: Tuple = new Array(n)
      for (let i = 0; i < n; i++) {
        const k = b[off]!; off += 1
        if (k === 0x6e) out[i] = null                                      // 'n'
        else if (k === 0x75) out[i] = { unchangedToast: true }             // 'u'
        else { const len = b.readInt32BE(off); off += 4; out[i] = b.toString('utf8', off, off + len); off += len } // 't'
      }
      return out
    }
    const rel = (id: number): RelInfo => this.relations.get(id) ?? { id, schema: '?', name: `?${id}`, replicaIdentity: '?', columns: [] }
    const ts = (us: bigint): Date => new Date(Number(us / 1000n + PG_EPOCH_MS))
    switch (tag) {
      case 'B': return { kind: 'begin', finalLsn: b.readBigUInt64BE(1), commitTime: ts(b.readBigUInt64BE(9)), xid: b.readInt32BE(17) }
      case 'C': return { kind: 'commit', commitLsn: b.readBigUInt64BE(2), endLsn: b.readBigUInt64BE(10), commitTime: ts(b.readBigUInt64BE(18)) }
      case 'R': {
        const id = b.readInt32BE(off); off += 4
        const schema = cstr(), name = cstr()
        const replicaIdentity = String.fromCharCode(b[off]!); off += 1
        const n = b.readInt16BE(off); off += 2
        const columns: RelInfo['columns'] = []
        for (let i = 0; i < n; i++) { const key = b[off]! === 1; off += 1; const cname = cstr(); const oid = b.readInt32BE(off); off += 8 /* oid + typmod */; columns.push({ name: cname, oid, key }) }
        const info: RelInfo = { id, schema, name, replicaIdentity, columns }
        this.relations.set(id, info)
        return { kind: 'relation', relation: info }
      }
      case 'I': { const id = b.readInt32BE(off); off += 5 /* relid + 'N' */; return { kind: 'insert', relation: rel(id), new: tuple() } }
      case 'U': {
        const id = b.readInt32BE(off); off += 4
        let old: Tuple | null = null, oldKind: 'key' | 'full' | null = null
        let k = String.fromCharCode(b[off]!); off += 1
        if (k === 'K' || k === 'O') { oldKind = k === 'K' ? 'key' : 'full'; old = tuple(); k = String.fromCharCode(b[off]!); off += 1 }
        return { kind: 'update', relation: rel(id), old, oldKind, new: tuple() } // k === 'N' here
      }
      case 'D': { const id = b.readInt32BE(off); off += 4; const k = String.fromCharCode(b[off]!); off += 1; return { kind: 'delete', relation: rel(id), old: tuple(), oldKind: k === 'K' ? 'key' : 'full' } }
      case 'T': {
        const n = b.readInt32BE(off); off += 4
        const flags = b[off]!; off += 1
        const rels: RelInfo[] = []
        for (let i = 0; i < n; i++) { rels.push(rel(b.readInt32BE(off))); off += 4 }
        return { kind: 'truncate', relations: rels, cascade: (flags & 1) !== 0, restartIdentity: (flags & 2) !== 0 }
      }
      case 'M': {
        const transactional = b[off]! === 1; off += 1
        const lsn = b.readBigUInt64BE(off); off += 8
        const prefix = cstr()
        const len = b.readInt32BE(off); off += 4
        return { kind: 'message', transactional, prefix, content: b.subarray(off, off + len), lsn }
      }
      case 'O': return { kind: 'origin' }
      case 'Y': return { kind: 'type' }
      default: throw new Error(`unknown pgoutput message '${tag}'`)
    }
  }

  end(): void { this.ended = true; try { this.write(W.terminate()) } catch { /* */ } this.sock.end() }
}
