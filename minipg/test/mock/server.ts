// MockPgServer — a scriptable, in-process PostgreSQL v3 backend for deterministic
// unit testing of the driver: canned results, arbitrary errors, and fault injection
// (mid-query kill, FATAL-then-close, hang, malformed bytes, restart window). No real PG.
import net from 'node:net'
import { Duplex, PassThrough } from 'node:stream'
import type { ConnectConfig, PoolConfig } from '../../src/index.ts'

// ---- backend message builders ----
const u16 = (n: number) => { const b = Buffer.allocUnsafe(2); b.writeUInt16BE(n); return b }
const i32 = (n: number) => { const b = Buffer.allocUnsafe(4); b.writeInt32BE(n); return b }
const cstr = (s: string) => Buffer.concat([Buffer.from(s, 'utf8'), Buffer.from([0])])
const be = (type: string, payload: Buffer = Buffer.alloc(0)) =>
  Buffer.concat([Buffer.from(type, 'latin1'), i32(payload.length + 4), payload])

export interface MockField { name: string; oid?: number; size?: number }
export interface MockResult { fields?: MockField[]; rows?: (string | null)[][]; command?: string; rowCount?: number }
export interface MockError { error: { code: string; message?: string; severity?: string } }
export type QueryReply = MockResult | MockError | void
export type QueryHandler = (sql: string, params: (string | null)[]) => QueryReply

const isError = (r: QueryReply): r is MockError => !!r && typeof r === 'object' && 'error' in r

const B = {
  authOk: () => be('R', i32(0)),
  authCleartext: () => be('R', i32(3)),
  paramStatus: (k: string, v: string) => be('S', Buffer.concat([cstr(k), cstr(v)])),
  backendKey: (pid: number, secret: number) => be('K', Buffer.concat([i32(pid), i32(secret)])),
  ready: (s = 'I') => be('Z', Buffer.from(s, 'latin1')),
  parseComplete: () => be('1'),
  bindComplete: () => be('2'),
  closeComplete: () => be('3'),
  noData: () => be('n'),
  emptyQuery: () => be('I'),
  paramDesc: (oids: number[] = []) => be('t', Buffer.concat([u16(oids.length), ...oids.map(i32)])),
  rowDesc: (fields: MockField[]) => be('T', Buffer.concat([
    u16(fields.length),
    ...fields.map((f) => Buffer.concat([cstr(f.name), i32(0), u16(0), i32(f.oid ?? 25), u16(f.size ?? 0xffff), i32(-1), u16(0)])),
  ])),
  dataRow: (row: (string | null)[]) => be('D', Buffer.concat([
    u16(row.length),
    ...row.map((v) => (v == null ? i32(-1) : (() => { const b = Buffer.from(v, 'utf8'); return Buffer.concat([i32(b.length), b]) })())),
  ])),
  commandComplete: (tag: string) => be('C', cstr(tag)),
  error: (f: { code: string; message?: string; severity?: string }) => be('E', Buffer.concat([
    Buffer.concat([Buffer.from('S', 'latin1'), cstr(f.severity ?? 'ERROR')]),
    Buffer.concat([Buffer.from('V', 'latin1'), cstr(f.severity ?? 'ERROR')]),
    Buffer.concat([Buffer.from('C', 'latin1'), cstr(f.code)]),
    Buffer.concat([Buffer.from('M', 'latin1'), cstr(f.message ?? f.code)]),
    Buffer.from([0]),
  ])),
}

export type FaultMode = 'normal' | 'drop-mid-query' | 'fatal-then-close' | 'hang'

export interface MockOptions {
  auth?: 'trust' | 'cleartext'
  onQuery?: QueryHandler
}

interface Conn {
  socket: Duplex
  buf: Buffer
  phase: 'startup' | 'running'
  stmts: Map<string, string> // prepared name -> sql
  portals: Map<string, string> // portal -> stmt name
  errored: boolean // skip extended messages until Sync after an error
  pid: number
  hung?: boolean // a query is parked (hang mode) — cancellable via CancelRequest
}

const defaultHandler: QueryHandler = () => ({ fields: [{ name: '?column?', oid: 23 }], rows: [['1']], command: 'SELECT' })

export class MockPgServer {
  readonly port: number
  private server: net.Server
  private conns = new Set<Conn>()
  private handler: QueryHandler
  private mode: FaultMode = 'normal'
  private connSeq = 0
  private opts: MockOptions
  private available = true
  private startupError: { code: string; message?: string } | null = null
  private attempts = 0
  private cancels = 0
  private cacheOn = false
  private respCache = new Map<string, Buffer>()

  private constructor(server: net.Server, port: number, opts: MockOptions) {
    this.server = server; this.port = port; this.opts = opts; this.handler = opts.onQuery ?? defaultHandler
  }

  static start(opts: MockOptions = {}): Promise<MockPgServer> {
    return new Promise((resolve) => {
      const server = net.createServer()
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as net.AddressInfo
        const mock = new MockPgServer(server, addr.port, opts)
        server.on('connection', (s) => mock.handleSocket(s))
        resolve(mock)
      })
    })
  }

  // ---- controls ----
  onQuery(fn: QueryHandler): void { this.handler = fn }
  setMode(m: FaultMode): void { this.mode = m }
  /** While false, new TCP connections are refused (destroyed on accept) — simulates a down/restarting server. */
  setAvailable(v: boolean): void { this.available = v }
  /** Send this SQLSTATE as a FATAL at startup and close — simulates auth/config failure (unrecoverable). */
  failStartupWith(code: string | null, message?: string): void { this.startupError = code ? { code, message } : null }
  /** Total TCP connection attempts seen (use to assert single-flight reconnect). */
  get connectAttempts(): number { return this.attempts }
  /** Number of CancelRequest packets received (use to assert query cancellation). */
  get cancelRequests(): number { return this.cancels }
  /** Pre-serialize + cache each query's response (one write/query) so benches measure
   *  driver CPU, not the mock's serialization. Off by default (dynamic onQuery for tests). */
  cacheResponses(on: boolean): void { this.cacheOn = on; if (!on) this.respCache.clear() }
  get connectionCount(): number { return this.conns.size }
  /** Forget all prepared statements on every live connection (simulate a restart's lost state). */
  forgetStatements(): void { for (const c of this.conns) c.stmts.clear() }
  /** Abruptly destroy all live sockets (simulate a crash / ECONNRESET). */
  killActive(): void { for (const c of this.conns) c.socket.destroy() }
  connectConfig(overrides: Partial<PoolConfig> = {}): PoolConfig {
    return { host: '127.0.0.1', port: this.port, user: 'mock', database: 'mock', password: '', ssl: false, ...overrides }
  }
  async close(): Promise<void> {
    for (const c of this.conns) c.socket.destroy()
    await new Promise<void>((r) => this.server.close(() => r()))
  }

  // ---- per-connection protocol ----
  /** In-process transport: returns a client-side Duplex wired to a server-side handler,
   *  with NO TCP. Pass `() => mock.inProcessConnect()` as the driver's `socket` option to
   *  measure pure driver CPU (no network/RTT). */
  inProcessConnect(): Duplex {
    const toServer = new PassThrough()
    const toClient = new PassThrough()
    // ({readable, writable}) overload is valid at runtime; not in the bundled types.
    const clientSide = Duplex.from({ readable: toClient, writable: toServer } as never)
    const serverSide = Duplex.from({ readable: toServer, writable: toClient } as never)
    this.handleSocket(serverSide) // increments attempts + handles availability (destroy propagates to clientSide)
    return clientSide
  }

  private handleSocket(socket: Duplex): void {
    this.attempts++
    if (!this.available) { socket.on('error', () => {}); socket.destroy(); return } // refuse while "down"
    const c: Conn = { socket, buf: Buffer.alloc(0), phase: 'startup', stmts: new Map(), portals: new Map(), errored: false, pid: 1000 + (this.connSeq++) }
    this.conns.add(c)
    socket.on('data', (chunk) => this.onData(c, chunk as Buffer))
    socket.on('error', () => {})
    socket.on('close', () => this.conns.delete(c))
  }

  private onData(c: Conn, chunk: Buffer): void {
    c.buf = c.buf.length ? Buffer.concat([c.buf, chunk]) : chunk
    for (;;) {
      if (c.phase === 'startup') {
        if (c.buf.length < 8) return
        const len = c.buf.readInt32BE(0)
        if (c.buf.length < len) return
        const code = c.buf.readInt32BE(4)
        const body = c.buf.subarray(0, len)
        c.buf = c.buf.subarray(len)
        if (code === 80877103 || code === 80877104) { c.socket.write(Buffer.from('N')); continue } // decline SSL/GSS
        if (code === 80877102) { this.onCancel(body.readInt32BE(8)); c.socket.destroy(); return } // CancelRequest
        this.doStartup(c, body)
        c.phase = 'running'
        continue
      }
      // running: type-prefixed frames
      if (c.buf.length < 5) return
      const len = c.buf.readInt32BE(1)
      if (len < 4) { c.socket.destroy(); return }
      if (c.buf.length < len + 1) return
      const type = String.fromCharCode(c.buf[0]!)
      const body = c.buf.subarray(5, len + 1)
      c.buf = c.buf.subarray(len + 1)
      this.dispatch(c, type, body)
    }
  }

  private doStartup(c: Conn, _body: Buffer): void {
    if (this.startupError) { c.socket.write(B.error({ code: this.startupError.code, message: this.startupError.message ?? this.startupError.code, severity: 'FATAL' })); c.socket.destroy(); return }
    if (this.opts.auth === 'cleartext') { c.socket.write(B.authCleartext()); /* accept any password message later */ }
    c.socket.write(Buffer.concat([
      B.authOk(),
      B.paramStatus('server_version', '16.0 (mock)'),
      B.paramStatus('client_encoding', 'UTF8'),
      B.backendKey(c.pid, 0x5ec0_0000 + c.pid),
      B.ready('I'),
    ]))
  }

  private dispatch(c: Conn, type: string, body: Buffer): void {
    switch (type) {
      case 'p': return // password / SASL response (trust/cleartext-accept): ignore
      case 'P': { // Parse: name\0 sql\0 ...
        const z1 = body.indexOf(0); const name = body.toString('utf8', 0, z1)
        const z2 = body.indexOf(0, z1 + 1); const sql = body.toString('utf8', z1 + 1, z2)
        c.stmts.set(name, sql); c.socket.write(B.parseComplete()); return
      }
      case 'D': { // Describe: 'S'|'P' + name\0
        if (c.errored) return
        const kind = String.fromCharCode(body[0]!); const name = body.toString('utf8', 1, body.indexOf(0, 1))
        const sql = kind === 'S' ? c.stmts.get(name) : c.stmts.get(c.portals.get(name) ?? '')
        const res = this.handler(sql ?? '', [])
        if (isError(res)) return this.sendError(c, res)
        c.socket.write(B.paramDesc([]))
        const fields = (res && 'fields' in res && res.fields) ? res.fields : null
        c.socket.write(fields && fields.length ? B.rowDesc(fields) : B.noData())
        return
      }
      case 'B': { // Bind: portal\0 stmt\0 ...
        if (c.errored) return
        const z1 = body.indexOf(0); const portal = body.toString('utf8', 0, z1)
        const stmt = body.toString('utf8', z1 + 1, body.indexOf(0, z1 + 1))
        if (!c.stmts.has(stmt)) { // forgotten after a "restart" -> the classic 26000
          return this.sendError(c, { error: { code: '26000', message: `prepared statement "${stmt}" does not exist`, severity: 'ERROR' } })
        }
        c.portals.set(portal, stmt); c.socket.write(B.bindComplete()); return
      }
      case 'E': { // Execute: portal\0 maxRows
        if (c.errored) return
        const portal = body.toString('utf8', 0, body.indexOf(0))
        const sql = c.stmts.get(c.portals.get(portal) ?? '') ?? ''
        return this.runQuery(c, sql, [])
      }
      case 'Q': { // simple Query
        const sql = body.toString('utf8', 0, body.indexOf(0))
        this.runQuery(c, sql, [], true)
        if (this.mode !== 'hang') c.socket.write(B.ready('I')) // simple protocol: ready right after
        return
      }
      case 'S': c.errored = false; if (this.mode !== 'hang') c.socket.write(B.ready('I')); return // Sync (hang suppresses it)
      case 'C': c.socket.write(B.closeComplete()); return // Close
      case 'H': return // Flush
      case 'X': c.socket.destroy(); return // Terminate
      default: return
    }
  }

  private runQuery(c: Conn, sql: string, params: (string | null)[], simple = false): void {
    // fault injection
    if (this.mode === 'hang') { c.hung = true; return } // parked; a CancelRequest will free it
    if (this.mode === 'drop-mid-query') { c.socket.write(B.rowDesc([{ name: 'x', oid: 23 }])); c.socket.destroy(); return }
    if (this.mode === 'fatal-then-close') { c.socket.write(B.error({ code: '57P01', message: 'terminating connection due to administrator command', severity: 'FATAL' })); c.socket.destroy(); return }

    const cached = this.cacheOn ? this.respCache.get(sql) : undefined
    if (cached !== undefined) { c.socket.write(cached); return }
    const res = this.handler(sql, params)
    if (isError(res)) return this.sendError(c, res)
    const r = (res as MockResult) ?? {}
    const parts: Buffer[] = []
    if (simple && r.fields && r.fields.length) parts.push(B.rowDesc(r.fields))
    for (const row of r.rows ?? []) parts.push(B.dataRow(row))
    const cmd = r.command ?? 'SELECT'
    const n = r.rowCount ?? (r.rows ? r.rows.length : 0)
    parts.push(B.commandComplete(/^(SELECT|INSERT|UPDATE|DELETE|MERGE|COPY|MOVE|FETCH)/i.test(cmd) ? `${cmd}${cmd.toUpperCase().startsWith('INSERT') ? ' 0' : ''} ${n}` : cmd))
    const blob = Buffer.concat(parts) // one write per query (batched), not one per row
    if (this.cacheOn) this.respCache.set(sql, blob)
    c.socket.write(blob)
  }

  private sendError(c: Conn, e: MockError): void {
    c.socket.write(B.error(e.error))
    c.errored = true // extended protocol: ignore until Sync
  }

  // A CancelRequest arrived (on a separate socket); cancel the hung query on that backend.
  private onCancel(pid: number): void {
    this.cancels++
    for (const c of this.conns) {
      if (c.pid === pid && c.hung) {
        c.hung = false
        c.socket.write(Buffer.concat([B.error({ code: '57014', message: 'canceling statement due to user request', severity: 'ERROR' }), B.ready('I')]))
        return
      }
    }
  }
}
