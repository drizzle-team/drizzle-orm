// A single PostgreSQL connection: transport (net/tls), auth, and the extended
// query protocol. One query in flight at a time (queries queue). No LISTEN/NOTIFY.
import type { Duplex } from 'node:stream'
import { W, Writer, writeParse, writeDescribe, writeBindWith, writeBindRaw, writeExecute, writeClose, writeSync, writeQuery, Parser, parseRowDescription, parseDataRow, parseParameterDescription, type ParamsEncoder } from './protocol.ts'
import { md5Password, scramForChannel, peerCertDer, type Scram } from './auth.ts'
import { encodeValueInto, compileParamPlan, compileBindEncoder, type BindEncoder, copyRowsBinary, copyRowsText, copyBinarySupported, isRawParams, type RawParams } from './encode.ts'
import { buildDecoders, decoderFor } from './decode.ts'
import { PgError, parseErrorFields } from './errors.ts'
import type { ConnectConfig, Decoder, Field, PostgresSocket, QueryDebug, QueryOptions, QueryResult, ResultMode, StreamOptions, Transport, TxOptions } from './types.ts'
import { INSTANT_OIDS, BINARY_FAST, tagArrayCol, type CodegenCol } from './decode.ts'
import { buildMapperFactory, isEvalAvailable, type RowMapper, type RowMapperFactory } from './mapper.ts'
import { resolveUrl } from './url.ts'
import { shapeCols, resolveParamTypes, paramTypeOid, mergeUnknownCols as mergeUnknown, type ShapeSpec, type ShapeOf, type ShapeEntries, type ParamType, type PgType } from './spec.ts'

// QueryOptions keys, for the query(sql, opts) arg-shift — an unknown key means "not an options object"
const OPTION_KEYS = new Set(['name', 'snapshot', 'mode', 'params', 'shape', 'binary', 'metrics', 'debug', 'timeout', 'signal', 'trace'])
import type { ShapeMapper } from './shape.ts'
import type { Plugin, QueryInfo, QueryMetrics } from './plugin.ts'
import { Cursor, type CursorOptions } from './cursor.ts'

type ConnState = 'idle' | 'connecting' | 'ready' | 'reconnecting' | 'closed'

// The node:net/tls transport is registered here by the Node entry (@drizzle-team/postgres/node) so the core never
// statically imports node:net/tls (which don't exist on workerd). A config.transport or config.socket
// takes precedence over it: the cf and Deno entries and the Effect entry point dial that way.
type TransportFactory = (cfg: NormalizedConfig, signal: AbortSignal) => Promise<Duplex>
type CancelFn = (cfg: NormalizedConfig, key: { pid: number; secret: number }) => Promise<void>
let defaultTransport: TransportFactory | null = null
let defaultCancel: CancelFn | null = null
export function registerDefaultTransport(transport: TransportFactory, cancel: CancelFn): void {
  defaultTransport = transport; defaultCancel = cancel
}
/** The transport that the runtime entry registered, or null under ./core. Replication dials with it. */
export function getDefaultTransport(): TransportFactory | null { return defaultTransport }

export interface NormalizedConfig {
  host: string; port: number; user: string; password: string; database: string
  ssl: Exclude<NonNullable<ConnectConfig['ssl']>, 'disable'> // 'disable' normalized to false
  applicationName: string; connectTimeout: number; decoders: Map<number, Decoder>
  options?: string // startup-packet command-line options ('-c key=val …'); RESET ALL restores these
  statementTimeout?: number; idleInTransactionSessionTimeout?: number // ms, sent as startup parameters
  channelBinding?: 'disable' | 'prefer' | 'require' // SCRAM channel-binding stance ('prefer' default)
  prepare: boolean // false -> never use server-side named prepared statements (transaction-pooler safe)
  binaryParams: boolean // upgrade fast-type params to binary on prepared reuse (OIDs from ParameterDescription)
  pipelineDepth: number // max queries in flight on one connection at once (1 = gated / no pipelining)
  pipelineFlush: 'sync' | 'microtask' // batch same-tick writes into one socket write ('microtask') or write per dispatch ('sync')
  temporal: 'date' | 'string' // default decode for date/timestamp(tz) columns without an explicit target
  reuseBinaryOids: Set<number> // BINARY_FAST minus config.types overrides: cols to upgrade to binary on prepared-statement reuse
  reconnect: { enabled: boolean; base: number; max: number; maxRetries: number | null }
  transport?: Transport
  socket?: () => PostgresSocket | Promise<PostgresSocket> // structural (node Duplex satisfies it); internals treat it as Duplex, guarding optional methods
  path?: string
  plugins: Plugin[]
  isBehindPooler?: boolean
}

const RTT_WINDOW = 5 // keep this many most-recent round-trip samples (ms) for connection.rtt
const DEFAULT_PIPELINE_DEPTH = 100 // max in-flight queries on one connection when pipelining is on (matches postgres.js)
const FLUSH_THRESHOLD = 64 * 1024  // flush the batch immediately once it reaches this many bytes, even in microtask mode (bounds memory, starts the transfer)

// Per-name statement cache. paramOids come from ParameterDescription; the binary param plan is
// compiled from them LAZILY on first reuse (null = compiled, nothing binary-able -> plain text path).
interface PreparedEntry { sql: string; fields: Field[]; paramOids?: number[]; plan?: ParamsEncoder | null }

// Identity of a Parse on the wire: same name may NOT be reused for different sql OR different declared
// param types (the parseInflight burst-dedup compares this key).
// Fill 'unknown' (oid 0) shape columns with the REAL type OIDs from the result, positionally.
// The merge itself lives in spec.ts so http/neon-http run the SAME one (they used to skip it).
const mergeUnknownCols = (cols: CodegenCol[], fields: Field[]): CodegenCol[] => mergeUnknown(cols, fields, (f) => f.dataTypeOid)

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const firstCstr = (b: Buffer): string => { const z = b.indexOf(0); return b.toString('utf8', 0, z < 0 ? b.length : z) }

const parseKey = (t: Task): string => (t.paramTypes && t.paramTypes.length ? t.sql + '\u0000' + t.paramTypes.join(',') : t.sql)

/** Per-chunk progress for bulkInsert/bulkUpdate/copyMany. Fired as each chunk is CONFIRMED
 *  by the server (FIFO, so cumulative fields are monotone). */
export interface BulkProgress {
  rows: number      // input rows whose chunks have been confirmed so far (cumulative)
  totalRows: number
  affected: number  // cumulative server rowCount (== rows for inserts; matched rows for updates)
  bytes: number     // wire bytes written so far (exact, from per-query metrics)
  elapsedMs: number // since the bulk call started
  chunk: number     // 1-based index of the chunk that just completed
  chunks: number
}

/** A COPY FROM STDIN payload source: any (async) iterable of raw COPY-format bytes/strings —
 *  arrays of chunks, generators, Node Readable streams. Chunks need not align with row boundaries. */
export type CopySource = Iterable<string | Uint8Array> | AsyncIterable<string | Uint8Array>

const qIdent = (s: string): string => '"' + s.replace(/"/g, '""') + '"'

// Default bulkInsert chunk: 64 rows, pulled DOWN for FAT rows (bytes guard) so ONE unnest statement's array
// materialization stays ~<=32KB server-side. Re-derived on a REALISTIC WAL-on server across shapes
// (playground/inserts/shape-sweep.bench.ts): 64 is at/above the best chunk for EVERY shape — narrow/standard/
// wide are ~flat and fat-text peaks small (64 beats a larger default by +16% by clearing the 128-256 dip).
// The old 1024-cells cap + multi-row sampling earned nothing on a realistic server (wide was flat, large
// chunks never won) and were dropped; the earlier +32%/+115% were fsync-off/UNLOGGED artifacts. The bytes
// guard now only bites for >512B/row (safety against giant statements). Explicit opts.chunk still wins.
function defaultChunk(names: readonly string[], rows: readonly (readonly unknown[] | Readonly<Record<string, unknown>>)[]): number {
  if (rows.length === 0) return 64
  const row = rows[0]! // one sampled row is enough for a size cap; typical batches are size-uniform
  let b = 24 // per-row byte estimate (tuple + element headers)
  for (let c = 0; c < names.length; c++) {
    const v = Array.isArray(row) ? row[c] : (row as Record<string, unknown>)[names[c]!]
    b += typeof v === 'string' ? v.length + 4 : v instanceof Uint8Array ? v.byteLength + 4 : 12
  }
  return Math.max(16, Math.min(64, Math.floor(32768 / b)))
}

// build the $n::type[] cast list + array OIDs for a bulk statement (aliases are validated by
// paramTypeOid, so splicing them into SQL is safe)
function bulkCasts(names: readonly string[], columns: Readonly<Record<string, string>>): { casts: string[]; oids: number[] } {
  const casts: string[] = new Array(names.length)
  const oids: number[] = new Array(names.length)
  for (let i = 0; i < names.length; i++) {
    const alias = columns[names[i]!]!
    oids[i] = paramTypeOid(alias + '[]')
    casts[i] = `$${i + 1}::${alias.toLowerCase()}[]`
  }
  return { casts, oids }
}

// pivot a [start,end) row range -> one array per column (unnest is column-major). Shared by the
// bulkInsert/bulkUpdate unnest paths.
function pivotRows(names: readonly string[], rows: readonly (readonly unknown[] | Readonly<Record<string, unknown>>)[], start: number, end: number): unknown[][] {
  const cols: unknown[][] = new Array(names.length)
  for (let c = 0; c < names.length; c++) cols[c] = new Array(end - start)
  for (let r = start; r < end; r++) {
    const row = rows[r]!
    if (Array.isArray(row)) for (let c = 0; c < names.length; c++) cols[c]![r - start] = row[c]
    else for (let c = 0; c < names.length; c++) cols[c]![r - start] = (row as Record<string, unknown>)[names[c]!]
  }
  return cols
}

// merge per-chunk QueryResults (bulkInsert/copyMany chunked modes): rows concat in input order
function mergeResults(rs: QueryResult<never>[]): QueryResult<never> {
  return {
    rows: ([] as never[]).concat(...rs.map((r) => r.rows)),
    columns: rs[0]?.columns ?? [],
    rowCount: rs.reduce((s, r) => s + (r.rowCount ?? 0), 0),
    command: rs[0]?.command ?? null,
  }
}

/** The callback run inside begin()/transaction(), given the transaction-scoped connection. */
export type TxFn<T> = (tx: Connection) => T | Promise<T>

// Build the `BEGIN …` statement from TxOptions. String form is sanitized (letters/spaces only) like
// postgres.js; the object form composes the standard clauses. Values are a fixed vocabulary, so safe.
function beginClause(o: TxOptions | undefined): string {
  if (o == null) return 'begin'
  if (typeof o === 'string') { const s = o.replace(/[^a-zA-Z ]/g, '').trim(); return s ? 'begin ' + s : 'begin' }
  const parts: string[] = []
  if (o.isolation) parts.push('isolation level ' + o.isolation)
  if (o.readOnly != null) parts.push(o.readOnly ? 'read only' : 'read write')
  if (o.deferrable != null) parts.push(o.deferrable ? 'deferrable' : 'not deferrable')
  return parts.length ? 'begin ' + parts.join(' ') : 'begin'
}

// Detect a transaction-mode pooler (where server-side NAMED prepared statements are unsafe — a Parse on
// one backend may not exist on the next Bind). Used only to DEFAULT `prepare` off; explicit config wins.
function transactionPoolerDetected(host: string, port: number): boolean {
  if (host.includes('-pooler.')) return true                              // Neon PgBouncer pooled endpoint
  if (host.includes('pooler.supabase.com') || port === 6543) return true  // Supabase Supavisor transaction pooler
  if (process.env.VERCEL || process.env.VERCEL_ENV) return true           // Vercel serverless: connections are ~always pooled
  return false
}
// Errors that won't fix themselves on retry (bad auth/config) — stop reconnecting.
function isFatalAuth(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code
  if (code === '28P01' || code === '28000' || code === '3D000') return true
  return !!(err as { fatal?: boolean } | null)?.fatal || isUntrustedCertificate(err)
}

// Node and Bun codes for a certificate that only a config or certificate change can fix. An expired
// or not-yet-valid certificate is left out, because a renewal or a clock fix clears it without a
// client change.
const UNTRUSTED_CERTIFICATE_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'CERT_UNTRUSTED', 'CERT_REVOKED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
])
/** Whether TLS verification rejected the server certificate for a reason that a retry cannot fix. */
export function isUntrustedCertificate(err: unknown): boolean {
  const e = err as { code?: string; name?: string; message?: string } | null
  if (e?.code !== undefined && UNTRUSTED_CERTIFICATE_CODES.has(e.code)) return true
  // Deno reports rustls errors by message only, for example "invalid peer certificate: UnknownIssuer".
  const message = e?.message ?? ''
  return e?.name === 'InvalidData' && message.includes('invalid peer certificate') && !/Expired|NotValidYet/.test(message)
}

// head: the canceled query until it ends. isConfirmed: the server closed the cancel connection, so the
// backend already has the signal. hasFailed: the cancel connection errored, so its delivery is unknown.
interface PendingCancel { head: Task | null; isConfirmed: boolean; hasFailed: boolean; timer?: ReturnType<typeof setTimeout> }

// per-query timing accumulator, attached only when instrumented (plugins present) or metrics requested
interface TaskPerf { t0: number; tStart?: number; tWrite?: number; tFirst?: number; decodeMs: number; sent: number; recv: number; states?: unknown[]; metrics?: QueryMetrics }

interface Task {
  sql: string
  params: readonly unknown[]
  name?: string | undefined
  mode: ResultMode
  rows: unknown[]
  perf?: TaskPerf
  info?: QueryInfo
  wantMetrics?: boolean
  metricsUnit?: 'ms' | 'us'
  metricsRound?: boolean
  debug?: boolean // { debug: true }: attach the resolved decode plan to the result
  _debugCols?: CodegenCol[] // captured column plan (name/oid/format/js) for debug
  _reused?: boolean // this execution reused a cached prepared statement (Parse skipped)
  _retries?: number // transparent auto-retries performed (DDL-invalidated prepared statement)
  _retryErrors?: string[] // SQLSTATE codes of the swallowed attempts
  _repreparedSqlChanged?: boolean // the name was cached with DIFFERENT SQL -> old statement deallocated + re-Parsed
  _paramOids?: number[] // ParameterDescription ('t') OIDs from THIS response cycle (cached with the statement on 'T'/'n')
  _shapeCols?: CodegenCol[] // shape with 'unknown' columns: mapper build DEFERRED until real OIDs arrive ('T' or cached fields)
  paramTypes?: readonly number[] // caller-declared param OIDs: sent in Parse + binary plan from the FIRST execution
  copySource?: CopySource // COPY FROM STDIN payload source — marks the task as a copy (simple 'Q', runs solo)
  stopCopy?: () => void // ends pumpCopy's wait on a source that stalls after the task settled
  _instrDone?: boolean // guard so onQueryEnd/Error fires exactly once across the settle paths
  _wAt?: number // write timestamp (performance.now) — for the always-on live round-trip sample
  _rttDone?: boolean // guard so a query contributes at most one RTT sample (its first response byte)
  fields?: Field[]
  mapper?: RowMapper
  wire?: Buffer[] // mode:'wire' — CONTIGUOUS RUNS of {T,D,C,E,I} frames (concatenation = the statement's stream)
  _wireBuf?: ArrayBufferLike // open span's underlying buffer; adjacent kept-frames extend [_wireStart,_wireEnd) allocation-free
  _wireStart?: number
  _wireEnd?: number
  raw?: RawParams // rawParams() — pre-encoded Bind formats+values, written verbatim (no encode, no binary plan)
  command?: string | null
  rowCount?: number | null
  error?: Error
  cancelled?: boolean
  stream?: boolean
  _cacheName?: string
  resultFormat?: number | number[] // result-format code(s) for Bind (ORM binary flow)
  _typed?: boolean // builder came from a caller-supplied column plan — don't override from RowDescription
  binary?: boolean // { binary: true }: force all columns binary; build the mapper binary from RowDescription OIDs
  timeout?: number
  signal?: AbortSignal
  timer?: ReturnType<typeof setTimeout>
  graceTimer?: ReturnType<typeof setTimeout>
  settled?: boolean // caller already resolved/rejected (by timeout/abort) — don't settle again
  signalCleanup?: () => void
  onRow?: (row: unknown) => void
  copyOut?: boolean // copyTo(): COPY … TO STDOUT — simple 'Q', solo-gated via stream, payload via onCopyData
  onCopyData?: (chunk: Buffer) => void // per-'d' CopyData payload (a parser view — relayed, never decoded)
  streamEnd?: (summary: { command?: string | null; rowCount?: number | null }) => void
  streamError?: (e: Error) => void
  resolve?: (r: QueryResult<never>) => void
  reject?: (e: Error) => void
}

function defaultUser(): string {
  // env-derived so the core needs no node:os (absent on workerd); Node/Bun always set one of these.
  return process.env.USER || process.env.USERNAME || process.env.LOGNAME || 'postgres'
}
function readCstrings(buf: Buffer): string[] {
  const out: string[] = []; let i = 0
  while (i < buf.length && buf[i] !== 0) { let e = i; while (e < buf.length && buf[e] !== 0) e++; out.push(buf.toString('utf8', i, e)); i = e + 1 }
  return out
}

function makeRow(cells: (Buffer | null)[], body: Buffer, mode: ResultMode, fields: Field[], decoders: Map<number, Decoder>): unknown {
  switch (mode) {
    case 'raw': return Buffer.from(body)
    case 'buffer': return cells.map((c) => (c == null ? null : Buffer.from(c)))
    case 'object': {
      const o: Record<string, unknown> = Object.create(null) // null-proto: a column named __proto__ can't pollute
      for (let i = 0; i < fields.length; i++) { const f = fields[i]!; const c = cells[i]; o[f.name] = c == null ? null : decoderFor(f.dataTypeOid, decoders)(c) }
      return o
    }
    default: { // 'array'
      const r = new Array(fields.length)
      for (let i = 0; i < fields.length; i++) { const f = fields[i]!; const c = cells[i]; r[i] = c == null ? null : decoderFor(f.dataTypeOid, decoders)(c) }
      return r
    }
  }
}

export class Connection {
  readonly cfg: NormalizedConfig
  state: ConnState = 'idle'
  serverParams: Record<string, string> = {}
  backendKey: { pid: number; secret: number } | null = null
  txStatus = 'I' // last ReadyForQuery transaction status: I idle | T in-tx | E failed-tx

  /** True if the connection is inside (or in a failed) transaction. */
  get inTransaction(): boolean { return this.txStatus === 'T' || this.txStatus === 'E' }

  // The task currently receiving results — the head of the in-flight FIFO. Every backend message
  // (RowDescription/DataRow/CommandComplete/Error) belongs to it until its ReadyForQuery arrives.
  private get current(): Task | null { return this.inflight[0] ?? null }

  /** Live scheduler snapshot: how many queries are queued, in flight now, and the max ever in flight
   *  at once (a nonzero-above-1 max confirms pipelining actually engaged). */
  get stats(): { queued: number; inflight: number; maxInflight: number; pipelineDepth: number; writes: number } {
    return { queued: this.queue.length, inflight: this.inflight.length, maxInflight: this._maxInflight, pipelineDepth: this.cfg.pipelineDepth, writes: this._flushes }
  }

  /** Recent network round-trip samples in ms (oldest→newest, up to RTT_WINDOW). Seeded at connect
   *  from the auth-handshake legs (the polluted startup→first-response leg is skipped), then kept
   *  fresh by each query's time-to-first-byte. `min` ≈ the network floor; `avg` smooths jitter.
   *  Handy for tuning things like pipelining. All fields are null/empty until the first sample. */
  get rtt(): { avg: number | null; min: number | null; last: number | null; count: number; samples: number[] } {
    const s = this.rttSamples
    if (s.length === 0) return { avg: null, min: null, last: null, count: 0, samples: [] }
    let sum = 0, min = Infinity
    for (const x of s) { sum += x; if (x < min) min = x }
    return { avg: sum / s.length, min, last: s[s.length - 1]!, count: s.length, samples: s.slice() }
  }
  private recordRtt(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return
    this.rttSamples.push(ms)
    if (this.rttSamples.length > RTT_WINDOW) this.rttSamples.shift()
  }
  private markPing(): void { this.lastPingAt = performance.now() }                                                    // sent a client msg that expects a reply
  private pong(): void { if (this.lastPingAt > 0) { this.recordRtt(performance.now() - this.lastPingAt); this.lastPingAt = 0 } } // …its reply arrived: record + disarm

  private socket: Duplex | null = null
  private parser = new Parser()
  private queue: Task[] = []
  private inflight: Task[] = [] // in-flight FIFO (oldest→newest); the backend replies in this order, so the
                               // head (inflight[0]) is the task currently receiving results. length ≤ pipelineDepth
  private outbuf = new Writer() // outbound batch: pipelined tasks serialize here, flushed once per dispatch pass
  private flushScheduled = false // a microtask flush is pending (guards against scheduling more than one)
  private writeBackedUp = false // socket write buffer is full — pause dispatching new pipelined tasks until 'drain'
  private _maxInflight = 0      // high-water mark of concurrent in-flight queries (diagnostics / tests)
  private _flushes = 0          // count of outbound socket writes for query batches (coalescing diagnostic)
  private spCounter = 0         // monotonic counter for auto-generated SAVEPOINT names (nested begin)
  private rttSamples: number[] = [] // network round-trip samples (ms), oldest→newest, capped at RTT_WINDOW
  private lastPingAt = 0            // send time of the last handshake msg awaiting a reply (0 = none pending)
  private prepared = new Map<string, PreparedEntry>()
  private staleStatements = new Set<string>() // names invalidated by DDL (0A000/26000) — Close before re-Parse
  // (name -> sql) of a NAMED Parse written to the wire but not yet confirmed by its Describe response.
  // A concurrent burst of first-uses of the same name would otherwise each write their own Parse and
  // the server rejects the duplicate with 42P05 — later tasks in the burst skip Parse and Bind against
  // the name directly (the server processes the pipeline in order, so the statement exists by then).
  private parseInflight = new Map<string, string>()
  // per-declared-params binary plans, keyed by array identity (ORMs pass a stable array). WeakMap => auto-GC.
  private paramPlanCache = new WeakMap<readonly number[], ParamsEncoder | null>()
  // JIT Bind+Execute+Sync encoders, keyed by binary-plan identity (stable per statement/paramTypes). Rebuilt
  // only when the statement name or result-format changes for that plan. Empty unless encode:'jit'/'auto'+eval.
  private jitEncodeCache = new Map<ParamsEncoder, { jit: BindEncoder | null; name: string; rfSig: number | string }>()
  private jitEncode = false // eval available AND encode !== 'interpreted'
  // bulkInsert: (table+columns+returning) -> generated unnest SQL + array OIDs (stable identity) + auto statement name
  private insertMeta = new Map<string, { sql: string; oids: number[]; name: string }>()
  // bulkInsert({ defaults:true }): VALUES-with-DEFAULT SQL -> auto statement name. Keyed by the full SQL
  // (default-token positions + row count), so identical patterns reuse one prepared statement. EVERY
  // distinct pattern is named — re-Parsing per chunk instead costs ~2.5x at scale (defaults-prepare.bench),
  // so naming always wins. The common (uniform) case is 1-2 statements; only a pathological per-row-varying
  // batch accrues one statement per distinct chunk SQL. (On a transaction pooler query() drops names anyway.)
  private valuesMeta = new Map<string, string>()
  private mapperCache = new Map<string, RowMapper>() // per-shape row mappers (standard + typed queries)
  private mapperFactory: RowMapperFactory            // interpreted or jit, chosen once from config.decode
  // query-builder fast path: a chunks array (tagged template / builder) has stable identity, so cache
  private scramState?: Scram

  // The CancelRequest in progress. Nothing new is dispatched while it is set: a cancel that reaches the
  // backend after its query ended would stop the next query. See finishTask for how it resolves.
  private pendingCancel: PendingCancel | null = null
  private isRetiring = false // the connection closes as soon as nothing is in flight
  // The queries that were pipelined behind a canceled query that ended on its own. Its cancel request
  // can still stop one of them. This outlives pendingCancel, because the cancel connection can close
  // before the stopped query's error is read.
  private lateCancel: { pending: PendingCancel; suspects: Set<Task> } | null = null
  private cancelDone?: { promise: Promise<void>; resolve: () => void }

  private connecting = false
  private connectAbort?: AbortController // aborted on failAttempt so a pending transport tears down its socket
  private connTimer?: ReturnType<typeof setTimeout>
  private connectPromise?: Promise<this>
  private attemptResolve?: () => void
  private attemptReject?: (e: Error) => void
  private ended = false
  private everConnected = false
  private instrumented = false // plugins present -> capture per-query timings + fire hooks

  constructor(config: ConnectConfig = {}) {
    config = resolveUrl(config) // fold a `url` connection string into defaults (explicit fields still win)
    // Only the no-TLS-at-all case is decidable here. A custom `socket` owns its own TLS (so `ssl: false`
    // means "I handle it", not "no encryption") and may well expose the certificate — see the `socket`
    // docs — so whether binding is possible is only known once the transport has connected. scramForChannel
    // makes that call at auth time, with a more specific message than a blanket refusal could give.
    if (config.channelBinding === 'require' && !config.socket && (!config.ssl || config.ssl === 'disable')) {
      throw new Error('@drizzle-team/postgres: channel_binding=require needs TLS — the binding is a property of the TLS channel. Enable `ssl`, or use `channel_binding=prefer` to connect unbound.')
    }
    const user = config.user || process.env.PGUSER || defaultUser()
    const host = config.host || process.env.PGHOST || 'localhost'
    // The DNS error would repeat the host, and with it any password inside. So the host is not echoed.
    if (host.includes('@')) throw new Error('@drizzle-team/postgres: the host contains "@", so it looks like a connection URL or includes credentials. Pass a connection URL as `url`, and credentials as `user` and `password`.')
    const port = config.port || Number(process.env.PGPORT) || 5432
    const pooled = config.pooler ?? transactionPoolerDetected(host, port) // gates the `prepare` + `pipeline` auto-defaults
    this.cfg = {
      host,
      port,
      user,
      password: config.password ?? process.env.PGPASSWORD ?? '',
      database: config.database || process.env.PGDATABASE || user,
      ssl: config.ssl && config.ssl !== 'disable' ? config.ssl : false, // 'disable'/falsy -> no TLS
      applicationName: config.applicationName || 'drizzle-postgres',
      connectTimeout: config.connectTimeout ?? 30000,
      // NUL-checked HERE so a bad value throws synchronously at connect() — the startup packet is
      // written inside a socket callback, where a late guardNul throw can't reach the caller's promise.
      options: ((o) => { if (o?.includes('\0')) throw new Error('@drizzle-team/postgres: startup parameter options contains NUL byte (0x00)'); return o })(config.options),
      statementTimeout: config.statementTimeout,
      idleInTransactionSessionTimeout: config.idleInTransactionSessionTimeout,
      channelBinding: config.channelBinding,
      prepare: config.prepare ?? !pooled, // explicit wins; else off behind a pooler
      binaryParams: config.binaryParams ?? true,
      // Pipelining: default on (auto-off behind a transaction pooler, where multiple in-flight implicit
      // transactions on one client conn confuse the pooler's per-tx server assignment). Explicit wins.
      pipelineDepth: ((p) => (p === false ? 1 : p === true ? DEFAULT_PIPELINE_DEPTH : p == null ? (pooled ? 1 : DEFAULT_PIPELINE_DEPTH) : Math.max(1, p.depth ?? DEFAULT_PIPELINE_DEPTH)))(config.pipeline),
      pipelineFlush: (typeof config.pipeline === 'object' && config.pipeline.flush) || 'microtask', // coalesce same-tick writes by default
      temporal: config.temporal ?? 'date',
      decoders: buildDecoders(config.types, config.jsonBigints),
      // types to auto-upgrade to binary on prepared-statement reuse — the bench-fast set, minus any OID the
      // user overrode via config.types (binary decode bypasses the text override, so leave those as text).
      reuseBinaryOids: new Set([...BINARY_FAST].filter((oid) => !(config.types && oid in config.types))),
      reconnect: ((rc) => {
        const o = rc && typeof rc === 'object' ? rc : {}
        return { enabled: rc === true || (rc != null && typeof rc === 'object'), base: o.baseMs ?? 100, max: o.maxMs ?? 5000, maxRetries: o.maxRetries ?? null }
      })(config.reconnect),
      socket: config.socket,
      transport: config.transport,
      path: config.path,
      plugins: config.plugins ?? [],
      isBehindPooler: pooled,
    }
    this.instrumented = this.cfg.plugins.length > 0
    const hasEval = isEvalAvailable()
    this.mapperFactory = buildMapperFactory(config.decode, hasEval) // 'auto' (default): jit where eval available, else interpreted
    const encMode = config.encode ?? 'auto'
    if (encMode === 'jit' && !hasEval) throw new Error("@drizzle-team/postgres: encode:'jit' needs eval (new Function), which this runtime disallows — use encode:'interpreted' or 'auto'")
    this.jitEncode = encMode === 'interpreted' ? false : encMode === 'jit' ? true : hasEval
    // keep the password out of console.log / JSON / inspection of the connection
    Object.defineProperty(this.cfg, 'password', { value: this.cfg.password, enumerable: false, writable: true, configurable: true })
  }

  /** Cached JIT Bind+Execute+Sync encoder for a binary plan. Keyed by plan identity (stable per
   *  statement/paramTypes); recompiled only if the statement name or result-format changes for that plan. */
  private jitFor(plan: ParamsEncoder, name: string, oids: readonly number[], rf: number | number[]): BindEncoder | null {
    const rfSig = typeof rf === 'number' ? rf : rf.join(',')
    const je = this.jitEncodeCache.get(plan)
    if (je !== undefined && je.name === name && je.rfSig === rfSig) return je.jit
    const jit = compileBindEncoder(name, oids, rf) // null when the row width exceeds the JIT cap -> caller falls back
    this.jitEncodeCache.set(plan, { jit, name, rfSig })
    return jit
  }

  private rejectTask(t: Task, err: Error): void {
    t.stopCopy?.()
    if (t.stream) t.streamError?.(err); else t.reject?.(err)
  }

  // ---- telemetry helpers (no-ops unless instrumented / metrics requested) ----
  private beginPerf(t: Task, params: readonly unknown[], metrics: boolean | 'ms' | 'us' | undefined): void {
    if (!this.instrumented && !metrics) return
    t.wantMetrics = !!metrics
    t.metricsUnit = metrics === 'us' ? 'us' : 'ms'
    t.metricsRound = metrics === 'ms' || metrics === 'us' // 'ms'/'us' -> integer; true -> keep sub-ms float
    t.perf = { t0: performance.now(), decodeMs: 0, sent: 0, recv: 0 }
    t.info = { sql: t.sql, statementName: t.name, paramCount: Array.isArray(params) ? params.length : 0, database: this.cfg.database, host: this.cfg.host, prepared: false }
  }
  private fireStart(t: Task): void {
    const p = t.perf; if (!p) return
    if (t.info) { t.info.backendPid = this.backendKey?.pid; }
    if (this.instrumented && p.states === undefined) p.states = this.cfg.plugins.map((pl) => pl.onQueryStart?.(t.info!)) // once, even across a retry
  }
  // Compute metrics + fire onQueryEnd/onQueryError exactly once. Returns the metrics (for result attach).
  private fireEnd(t: Task, err?: Error): QueryMetrics | undefined {
    const p = t.perf; if (!p || t._instrDone) return p?.metrics
    t._instrDone = true
    const end = performance.now()
    const start = p.tStart ?? p.t0, wrote = p.tWrite ?? start
    // performance.now() is float ms, so 'us' MULTIPLIES by 1000 (no division anywhere); 'ms' rounds; true
    // keeps the float. 1000/1e6 aren't powers of two, so there's no bit-shift shortcut — but none is needed.
    const unit = t.metricsUnit ?? 'ms'
    const c = t.metricsRound ? (unit === 'us' ? (x: number) => Math.round(x * 1000) : (x: number) => Math.round(x)) : (x: number) => x
    const m: QueryMetrics = {
      unit,
      queueWait: c(start - p.t0), write: c(wrote - start),
      ttfb: c(p.tFirst !== undefined ? p.tFirst - wrote : 0),
      download: c(p.tFirst !== undefined ? end - p.tFirst : 0),
      decode: c(p.decodeMs), total: c(end - p.t0),
      bytesSent: p.sent, bytesReceived: p.recv,
      rowCount: t.rowCount ?? (t.rows ? t.rows.length : null), columnCount: t.fields?.length ?? 0,
      command: t.command ?? null, prepared: t.info?.prepared ?? false, ...(err ? { error: err } : {}),
    }
    p.metrics = m
    const info = t.info!
    for (let i = 0; i < this.cfg.plugins.length; i++) {
      const pl = this.cfg.plugins[i]!, st = p.states?.[i]
      try { if (err) pl.onQueryError?.(st, info, err, m); else pl.onQueryEnd?.(st, info, m) } catch { /* plugin errors never break the query */ }
    }
    return m
  }

  connect(): Promise<this> {
    if (this.connectPromise) return this.connectPromise
    this.connectPromise = this.establish().then(
      () => this,
      (err: Error) => { if (!this.everConnected) { this.state = 'closed'; this.rejectQueue(err) } throw err },
    )
    return this.connectPromise
  }

  // Open one socket, negotiate SSL/auth, and resolve on the first ReadyForQuery.
  // Used by connect() and the reconnect loop.
  private establish(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.attemptResolve = resolve; this.attemptReject = reject
      this.connecting = true; this.state = this.everConnected ? 'reconnecting' : 'connecting'
      this.parser = new Parser(); this.scramState = undefined // fresh per attempt
      this.connTimer = setTimeout(() => this.failAttempt(new Error(`connect timeout after ${this.cfg.connectTimeout}ms`)), this.cfg.connectTimeout)
      // One transport path for all runtimes: config.socket (WS/unix/custom), config.transport (CF/Deno/Effect)
      // or the node:net/tls transport the Node entry registered. Each returns a connected, TLS-negotiated duplex.
      const ac = new AbortController(); this.connectAbort = ac // failAttempt() aborts -> transport destroys its pending socket
      const transport = this.cfg.transport
      const connect = transport ? transport.connect.bind(transport) : defaultTransport
      const factory = this.cfg.socket ?? (connect ? () => connect(this.cfg, ac.signal) : null)
      if (!factory) return this.failAttempt(Object.assign(new Error('no transport: import from @drizzle-team/postgres/node (net/tls), or pass config.transport or config.socket'), { fatal: true }))
      Promise.resolve(factory()).then((s) => {
        const sock = s as unknown as Duplex // structural PostgresSocket -> internal Duplex view (optional methods guarded at use)
        if (!this.connecting) { try { sock.destroy() } catch { /* superseded/aborted while connecting */ } return }
        this.socket = sock
        this.writeBackedUp = false // fresh socket: clear any stale write-backpressure gate from a prior connection
        this.attachSocket(sock)
        this.afterTransport()
      }, (e) => this.failAttempt(e as Error))
    })
  }

  // 'close' fires exactly once per socket; 'error' is captured (prevents an uncaught
  // throw) and surfaced via close. Guard on identity so a superseded socket is ignored.
  private attachSocket(sock: Duplex): void {
    let lastErr: Error | undefined
    sock.on('error', (e: Error) => { lastErr = e })
    sock.on('close', () => { if (sock === this.socket) this.onSocketDown(lastErr ?? new Error('connection terminated unexpectedly')) })
  }

  private afterTransport(): void {
    const sock = this.socket!
    sock.on('data', (c: Buffer) => this.onData(c))
    sock.write(W.startup({
      user: this.cfg.user, database: this.cfg.database, application_name: this.cfg.applicationName, client_encoding: 'UTF8',
      options: this.cfg.options, // '-c key=val …' — server-applied, so RESET ALL restores rather than wipes
      statement_timeout: this.cfg.statementTimeout != null ? String(Math.floor(this.cfg.statementTimeout)) : undefined,
      idle_in_transaction_session_timeout: this.cfg.idleInTransactionSessionTimeout != null ? String(Math.floor(this.cfg.idleInTransactionSessionTimeout)) : undefined,
    }))
  }

  private onData(chunk: Buffer | Uint8Array): void {
    // Web-stream transports (Deno/Cloudflare) deliver Uint8Array; wrap as a Buffer view (no copy).
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
    const cur = this.current
    // always-on live RTT: this query's first response byte -> round-trip = time-to-first-byte (network + the
    // server's time to first byte). One sample per query (guarded), independent of the metrics/telemetry path.
    if (cur && cur._wAt !== undefined && cur._rttDone !== true) { cur._rttDone = true; this.recordRtt(performance.now() - cur._wAt) }
    const p = cur?.perf; if (p) { if (p.tFirst === undefined) p.tFirst = performance.now(); p.recv += buf.length }
    let messages
    try { messages = this.parser.push(buf) } catch (e) { return this.onSocketDown(e as Error) }
    // A throw in a handler (protocol desync) tears down the socket; recoverable per-row
    // decode errors are caught inside dataRow() and never reach here.
    for (const m of messages) {
      try { this.handle(m.type, m.body) } catch (e) { return this.onSocketDown(e as Error) }
    }
  }

  private handle(type: string, body: Buffer): void {
    const wire = this.current?.wire
    if (wire !== undefined && (type === 'T' || type === 'D' || type === 'C' || type === 'E' || type === 'I')) {
      // SPAN-COALESCED collection: the frame (tag + int32 len + payload) is contiguous with `body`
      // in the parser's buffer, so a kept-frame that starts exactly where the open span ends just
      // extends it — ZERO allocation per message. A view materializes only when the run breaks (an
      // excluded frame in between, a new socket chunk) or at settle: entries scale with chunks, not
      // rows ("nothing per message, nothing per row").
      const t = this.current!
      const start = body.byteOffset - 5, end = body.byteOffset + body.length
      if (t._wireBuf === body.buffer && t._wireStart !== undefined && start === t._wireEnd) t._wireEnd = end
      else {
        if (t._wireBuf !== undefined) wire.push(Buffer.from(t._wireBuf, t._wireStart!, t._wireEnd! - t._wireStart!))
        t._wireBuf = body.buffer; t._wireStart = start; t._wireEnd = end
      }
    }
    switch (type) {
      case 'R': return this.auth(body)
      case 'S': { const z = body.indexOf(0); this.serverParams[body.toString('utf8', 0, z)] = body.toString('utf8', z + 1, body.indexOf(0, z + 1)); return }
      case 'K': this.backendKey = { pid: body.readInt32BE(0), secret: body.readInt32BE(4) }; return
      case 'Z': return this.ready(body)
      // CopyIn/CopyBoth: abort instead of hanging. CopyFail ends copy mode (server
      // replies ErrorResponse); the trailing Sync guarantees a ReadyForQuery, since
      // the Sync we already sent was swallowed by copy-in mode.
      case 'G': { // CopyInResponse: pump a copyFrom() source; a plain query('COPY … FROM STDIN') is aborted (extended path -> CopyFail + Sync)
        const t = this.current
        if (t && t.copySource) { void this.pumpCopy(t) }
        else { try { this.socket?.write(Buffer.concat([W.copyFail('use copyFrom() for COPY FROM STDIN'), W.sync()])) } catch { /* */ } }
        return
      }
      case 'W': { try { this.socket?.write(Buffer.concat([W.copyFail('CopyBoth is not supported by postgres'), W.sync()])) } catch { /* */ } return }
      case 'H': { // CopyOutResponse: copyTo() relays the payload; a plain query would silently DISCARD it
        const t = this.current
        if (t && !t.copyOut && !t.error) t.error = new Error('@drizzle-team/postgres: this statement is COPY … TO STDOUT — use copyTo() (a plain query() cannot return the copy payload and would silently discard it)')
        return
      }
      case 'd': { const t = this.current; if (t?.onCopyData && !t.cancelled && !t.error && !t.settled) t.onCopyData(body); return } // CopyData: raw relay
      case 'c': return // server CopyDone — CommandComplete ('COPY n') + ReadyForQuery follow
      case 't': if (this.current) this.current._paramOids = parseParameterDescription(body); return
      case 'T': if (this.current) { this.current.fields = parseRowDescription(body); if (this.current.wire) { if (this.current._cacheName) this.cacheStatement(this.current); return } if (this.current._typed && this.current._shapeCols && !this.current.mapper) { try { this.assignMapper(this.current, mergeUnknownCols(this.current._shapeCols, this.current.fields)) } catch (e) { this.current.error = e as Error } } else if (!this.current._typed) { const bin = this.current.binary; try { const cols = this.current.fields.map((f) => (bin ? { name: f.name, oid: f.dataTypeOid, format: 'binary' as const } : { name: f.name, oid: f.dataTypeOid })); this.assignMapper(this.current, cols) } catch (e) { this.current.error = e as Error } /* e.g. { binary: true } on a type with no binary decoder */ } if (this.current._cacheName) this.cacheStatement(this.current) } return
      case 'n': if (this.current) { this.current.fields = []; if (this.current._cacheName) this.cacheStatement(this.current) } return
      case 'D': if (wire !== undefined) return; return this.dataRow(body) // wire: the frame IS the row — nothing to decode
      case 'C': if (this.current && wire === undefined) { const tag = firstCstr(body); this.current.command = tag.split(' ')[0]; const m = tag.match(/(\d+)\s*$/); this.current.rowCount = m ? parseInt(m[1]!, 10) : null } return
      case 'E': { const err = new PgError(parseErrorFields(body)); if (this.connecting) return this.failAttempt(err); if (this.current) this.current.error = err; return }
      case 'N': return // NoticeResponse — ignored
      case 'A': return // NotificationResponse — ignored (no LISTEN/NOTIFY)
      default: return // ParseComplete/BindComplete/CloseComplete/PortalSuspended
    }
  }

  // The Describe(S) response arrived ('T' or 'n'): the named statement now provably exists server-side.
  // Cache fields + param OIDs (fields may be [] for row-less statements) and clear the in-flight-Parse marker.
  private cacheStatement(t: Task): void {
    this.prepared.set(t._cacheName!, { sql: t.sql, fields: t.fields ?? [], paramOids: t._paramOids })
    this.parseInflight.delete(t._cacheName!)
  }

  private auth(body: Buffer): void {
    const code = body.readInt32BE(0)
    const sock = this.socket!
    switch (code) {
      case 0: this.pong(); return // AuthenticationOk — records the md5/cleartext password leg (SCRAM already recorded at 12)
      case 3: this.markPing(); sock.write(W.password(this.cfg.password)); return // cleartext
      case 5: this.markPing(); sock.write(W.password(md5Password(this.cfg.user, this.cfg.password, body.subarray(4, 8)))); return // md5
      case 10: { // SASL: bind to the TLS channel when the transport exposes the cert AND the server offers -PLUS
        const mechs = readCstrings(body.subarray(4))
        if (!mechs.includes('SCRAM-SHA-256')) return this.failAttempt(Object.assign(new Error('unsupported SASL mechanisms: ' + mechs.join(', ')), { fatal: true }))
        try { this.scramState = scramForChannel(this.cfg.password, mechs, this.cfg.channelBinding ?? 'prefer', peerCertDer(this.socket)) }
        catch (e) { return this.failAttempt(Object.assign(e as Error, { fatal: true })) }
        this.markPing(); sock.write(W.saslInitial(this.scramState.mechanism, this.scramState.clientFirst)); return
      }
      case 11: this.pong(); this.markPing(); sock.write(W.saslResponse(this.scramState!.continue(body.subarray(4).toString('utf8')))); return // SASLContinue: record client-first→server-first, send client-final
      case 12: { this.pong(); try { this.scramState!.final(body.subarray(4).toString('utf8')) } catch (e) { this.failAttempt(Object.assign(e as Error, { fatal: true })) } return } // SASLFinal: record client-final→server-final
      default: return this.failAttempt(Object.assign(new Error('unsupported authentication request: ' + code), { fatal: true }))
    }
  }

  private ready(body: Buffer): void {
    this.txStatus = body.length ? String.fromCharCode(body[0]!) : 'I' // 'I' idle | 'T' in tx | 'E' failed tx
    if (this.connecting) {
      this.connecting = false; this.everConnected = true; this.state = 'ready'; clearTimeout(this.connTimer)
      this.connectAbort = undefined // connected: the socket is live, don't abort it
      if (this.instrumented) for (const pl of this.cfg.plugins) try { pl.onConnect?.({ database: this.cfg.database, host: this.cfg.host, backendPid: this.backendKey?.pid }) } catch { /* */ }
      const r = this.attemptResolve; this.attemptResolve = this.attemptReject = undefined
      r?.(); this.processQueue() // queued tasks (incl. ones enqueued while reconnecting) now run
    } else {
      this.finishTask()
    }
  }

  // Build (cached) the row mapper for a shape. array/object only; buffer/raw fall through to makeRow.
  // Serves BOTH the standard path (cols from RowDescription fields) and queryTyped (cols from caller).
  // Normalize a shape/typed column plan against connection config before building the mapper AND choosing
  // result formats (callers use this for both, so they agree). Built-in array OIDs are bound to the array
  // decoder here, so a PLAIN query yields JS arrays like a shaped one does (tagArrayCol).
  // temporal:'string' forces date/timestamp(tz)
  // columns with no explicit target to the exact-string TEXT decode — dropping any binary upgrade, since
  // binary can't yield the PG text (lossless for µs/BC/infinity that a JS Date can't represent).
  private resolveCols(cols: CodegenCol[]): CodegenCol[] {
    const tsString = this.cfg.temporal === 'string'
    return cols.map((c0) => {
      const c = tagArrayCol(c0) // wire array OID -> decode '{…}' to a JS array (no-op on already-tagged shape cols)
      if (!tsString) return c
      if (!c.js && !c.json && INSTANT_OIDS.has(c.oid)) return { ...c, js: 'string', format: 'text' }
      if (c.array && !c.array.js && INSTANT_OIDS.has(c.array.elem)) return { ...c, array: { ...c.array, js: 'string' } } // temporal[] elements follow the global too
      return c
    })
  }

  // Build + assign the row mapper for a task, capturing the resolved column plan when { debug: true }.
  private assignMapper(t: Task, cols: CodegenCol[]): void {
    t.mapper = this.getMapper(cols, t.mode)
    if (t.debug) t._debugCols = cols
  }

  // Assemble the { debug: true } decode plan from what the task resolved to.
  private buildDebug(t: Task): QueryDebug {
    const src = (t.mapper as (RowMapper & { source?: string }) | undefined)?.source // compileRow attaches .source; interpreted has none
    const cols = t._debugCols ?? (t.fields ?? []).map((f) => ({ name: f.name, oid: f.dataTypeOid } as CodegenCol))
    return {
      sql: t.sql, mode: t.mode, statementName: t.name, reusedPreparedStatement: !!t._reused,
      ...(t._repreparedSqlChanged ? { repreparedSqlChanged: true } : {}),
      decode: t.mapper ? (src ? 'jit' : 'interpreted') : 'none', // buffer/raw have no mapper
      ...(src ? { mapperSource: src } : {}),
      columns: cols.map((c) => ({
        name: c.name, oid: c.oid, format: c.format === 'binary' ? 'binary' : 'text',
        ...(c.js ? { js: c.js } : {}), ...(c.json ? { json: true } : {}),
      })),
      ...(t._retries ? { retries: t._retries, retriedErrors: t._retryErrors } : {}),
    }
  }

  private getMapper(cols: CodegenCol[], mode: ResultMode): RowMapper | undefined {
    if (mode !== 'array' && mode !== 'object') return undefined
    cols = this.resolveCols(cols)
    // NB: encode the whole json marker (its declared shape), not just "has json" — two shapes that differ
    // only inside a Json()/JsonArray() must get different mappers, else the first one is wrongly reused.
    const key = mode + '|' + cols.map((c) => `${c.name}:${c.oid}:${c.format ?? 't'}:${c.js ?? ''}:${c.json ? JSON.stringify(c.json) : ''}:${c.array ? 'a' + c.array.elem + (c.array.js ?? '') : ''}:${c.path ? c.path.join('.') : ''}:${c.groupNullable ? c.groupNullable.map((x) => (x ? '1' : '0')).join('') : ''}:${c.nullable ? 'n' : ''}:${c.xformId ?? ''}`).join(',')
    let m = this.mapperCache.get(key)
    if (!m) { m = this.mapperFactory(cols, mode, this.cfg.decoders); this.mapperCache.set(key, m) }
    return m
  }

  private dataRow(body: Buffer): void {
    const t = this.current
    if (!t || t.cancelled || t.error || t.settled) return
    let row: unknown
    const p = t.perf
    // A decoder (built-in or user-supplied via config.types) can throw; capture it
    // as the task error so the query rejects on ReadyForQuery — never an uncaught crash.
    try {
      if (p) { const s = performance.now(); row = t.mapper ? t.mapper(body) : makeRow(parseDataRow(body), body, t.mode, t.fields ?? [], this.cfg.decoders); p.decodeMs += performance.now() - s }
      else row = t.mapper ? t.mapper(body) : makeRow(parseDataRow(body), body, t.mode, t.fields ?? [], this.cfg.decoders)
    } catch (e) { t.error = e as Error; return }
    if (t.onRow) t.onRow(row); else t.rows.push(row)
  }

  // Dispatch as many queued tasks as the pipeline depth allows, then flush them in one socket write.
  // Depth 1 (pipelining off) makes this a strict one-at-a-time gate — identical to the pre-pipelining
  // behaviour. A serialize failure rejects that task and the loop moves on (no re-entrancy needed).
  private processQueue(): void {
    if (this.state !== 'ready') return
    if (this.isRetiring) { if (this.inflight.length === 0) this.retire(); return }
    while (this.queue.length && this.inflight.length < this.cfg.pipelineDepth && !this.writeBackedUp && this.canStartNext()) {
      this.startTask(this.queue.shift()!)
      // Flush mid-burst once the batch is large, so write() backpressure is OBSERVED before we bury the socket's
      // send buffer under a deep pipeline of big writes. Adaptive: on a fast/large-buffer link write() stays
      // writable and the loop keeps filling the pipe (deep pipelining hides RTT); on a slow/small-buffer one it
      // backs up here and the `!writeBackedUp` guard pauses dispatch until 'drain'. No fixed byte/RTT constant —
      // the socket's own flow-control encodes the transport + bandwidth-delay product.
      if (this.outbuf.mark() >= FLUSH_THRESHOLD) this.flushWrites()
    }
    // Coalesce writes: in 'microtask' mode, defer the flush so queries issued across SEPARATE query() calls
    // in the same tick (e.g. Promise.all) leave in ONE socket write. Flush synchronously when pipelining is
    // off (depth 1 — nothing to coalesce) or once the batch is already large (bound memory, start the wire
    // transfer). A microtask that fires after a sync flush just finds an empty batch and no-ops.
    if (this.cfg.pipelineFlush === 'microtask' && this.cfg.pipelineDepth > 1 && this.outbuf.mark() < FLUSH_THRESHOLD) this.scheduleFlush()
    else this.flushWrites()
  }

  // Defer one flush to the microtask checkpoint (end of the current synchronous stack, before any I/O), so
  // queries issued back-to-back in this tick batch into a single write. Only one is ever outstanding.
  private scheduleFlush(): void {
    if (this.flushScheduled) return
    this.flushScheduled = true
    queueMicrotask(() => { this.flushScheduled = false; this.flushWrites() })
  }

  // Barrier for stream queries: a stream pauses the socket for backpressure, which would stall every
  // pipelined query behind it, so a stream runs SOLO — nothing else in flight while it runs, and it
  // waits for the pipeline to drain before starting. (FIFO: we never dispatch past a queued stream.)
  private canStartNext(): boolean {
    if (this.pendingCancel) return false
    if (this.inflight.length === 0) return true
    const head = this.inflight[0]!
    if (head.stream || head.copySource) return false // a stream/COPY owns the connection until it ends
    const next = this.queue[0]!
    return !next.stream && !next.copySource          // don't start one while other queries are in flight
  }

  // COPY FROM STDIN pump: stream the task's source out as CopyData frames (small chunks coalesce
  // into ~256KB frames) with socket drain backpressure, then CopyDone. ALWAYS terminates the copy
  // with CopyDone or CopyFail — after a mid-copy error the backend discards messages until one of
  // them arrives, so bailing out silently would hang the connection.
  private async pumpCopy(t: Task): Promise<void> {
    const CHUNK = 1 << 18
    const w = new Writer(CHUNK + 4096)
    let open = false // an unclosed 'd' frame in w
    const flush = async (): Promise<void> => {
      if (open) { w.end(); open = false }
      if (w.mark() === 0) return
      const bytes = Buffer.from(w.slice()) // copy: the transport may retain the ref under backpressure
      w.reset()
      if (t.perf) t.perf.sent += bytes.length // CopyData bytes count toward metrics.bytesSent
      await this.writeRaw(bytes)
    }
    // While the server reads COPY data it holds back cancel requests, so only CopyFail ends the COPY.
    // A settled task must not wait for its source's next chunk, which may never come.
    const stopped = new Promise<'stopped'>((resolve) => { t.stopCopy = () => resolve('stopped') })
    const src = t.copySource!
    const it: Iterator<string | Uint8Array> | AsyncIterator<string | Uint8Array> =
      Symbol.asyncIterator in src ? src[Symbol.asyncIterator]() : src[Symbol.iterator]()
    try {
      for (;;) {
        const step = t.settled ? 'stopped' : await Promise.race([it.next(), stopped])
        if (step === 'stopped' || t.settled || t.error || t.cancelled) {
          void Promise.resolve(it.return?.()).catch(() => {})
          break
        }
        if (step.done) break
        const chunk = step.value
        const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8')
          : Buffer.isBuffer(chunk) ? chunk
          : Buffer.from((chunk as Uint8Array).buffer, (chunk as Uint8Array).byteOffset, (chunk as Uint8Array).byteLength)
        if (buf.length === 0) continue
        if (!open) { w.start('d'); open = true }
        w.bytes(buf)
        if (w.mark() >= CHUNK) await flush()
      }
      if (t.settled || t.error || t.cancelled) { w.reset(); open = false; w.start('f'); w.cstr('COPY aborted by client'); w.end() }
      else { if (open) { w.end(); open = false } w.start('c'); w.end() } // CopyDone (after closing a pending frame)
      await flush()
    } catch (e) {
      // the source threw or the socket died mid-copy: end copy mode; the server answers with an
      // ErrorResponse quoting the reason, which settles the task through the normal error path
      void Promise.resolve(it.return?.()).catch(() => {})
      try { this.socket?.write(W.copyFail(`COPY aborted: ${e instanceof Error ? e.message : String(e)}`)) } catch { /* socket gone; the task settles via the socket-down path */ }
    }
  }

  // Direct socket write with drain backpressure — COPY payloads bypass the outbuf batching.
  private writeRaw(bytes: Buffer): Promise<void> {
    const s = this.socket
    if (!s) return Promise.reject(new Error('connection is closed'))
    if (s.write(bytes)) return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      const ok = (): void => { cleanup(); resolve() }
      const bad = (e?: unknown): void => { cleanup(); reject(e instanceof Error ? e : new Error('socket closed during COPY')) }
      const cleanup = (): void => { s.off('drain', ok); s.off('close', bad); s.off('error', bad) }
      s.once('drain', ok); s.once('close', bad); s.once('error', bad)
    })
  }

  // Flush the accumulated outbound batch as one socket write. The buffer is copied (Node may retain the
  // reference under backpressure) so the reusable Writer can be reset and refilled immediately.
  private flushWrites(): void {
    if (this.outbuf.mark() === 0) return
    const bytes = Buffer.from(this.outbuf.slice())
    this.outbuf.reset()
    this._flushes++
    const s = this.socket
    if (s && !s.write(bytes) && !this.writeBackedUp) {
      // Write buffer full: its size reflects the transport + bandwidth-delay product, so this is where we learn
      // the pipe is as deep as the link can absorb. Pause dispatching new tasks until 'drain'; the count cap
      // (pipelineDepth) still bounds pending-response memory as a ceiling. Mirrors writeRaw's drain handling.
      this.writeBackedUp = true
      const resume = (): void => { off(); if (this.writeBackedUp) { this.writeBackedUp = false; this.processQueue() } }
      const stop = (): void => { off(); this.writeBackedUp = false } // socket died: socketDown() tears down; just clear the gate
      const off = (): void => { s.off('drain', resume); s.off('close', stop); s.off('error', stop) }
      s.once('drain', resume); s.once('close', stop); s.once('error', stop)
    }
  }

  private startTask(t: Task): void {
    // Serialize into the shared outbound batch. Param/SQL encoding can throw (e.g. NUL bytes); we snapshot
    // the batch offset first and rewind to it on a throw, so a bad task leaves earlier batched tasks intact
    // and can't wedge the queue. The task only joins `inflight` once it has valid bytes.
    if (t.perf) t.perf.tStart = performance.now() // execution begins (queue wait ends here)
    const w = this.outbuf
    const mark = w.mark()
    let parsedName: string | undefined // this task wrote a NAMED Parse (recorded in parseInflight only once the whole task serialized)
    try {
      if (t.copySource || t.copyOut) { writeQuery(w, t.sql) } // COPY: simple 'Q' (cleanest copy state machine); 'G' pumps the source, 'd' feeds copyTo
      else { // ---- everything below is the extended-protocol serialization ----
      if (!Array.isArray(t.params)) throw new TypeError('@drizzle-team/postgres: params must be an array — pass options as the THIRD argument: query(sql, [], opts)')
      const name = t.name ?? ''
      let reuse = false
      let entry: PreparedEntry | undefined
      if (t.name) {
        const cached = this.prepared.get(t.name)
        if (cached && cached.sql === t.sql) {
          reuse = true; entry = cached; t.fields = cached.fields
          if (t._typed) {
            // shape / queryTyped: the caller already chose per-column formats + mapper in query(); keep them.
            // Exception: a shape with 'unknown' columns deferred its mapper — build it from the cached fields.
            if (t._shapeCols && !t.mapper) this.assignMapper(t, mergeUnknownCols(t._shapeCols, cached.fields))
          } else if (t.binary) {
            this.assignMapper(t, cached.fields.map((f) => ({ name: f.name, oid: f.dataTypeOid, format: 'binary' as const }))) // { binary: true }: all binary
          } else if (t.mode === 'array' || t.mode === 'object') {
            // Plain query (no shape), 2nd+ execution: the result OIDs are now known from the first roundtrip's
            // RowDescription, so request BINARY for the bench-fast types (same decoded value as text, smaller +
            // faster). The first execution went out text. resolveCols honors temporal:'string'.
            const cols = this.resolveCols(cached.fields.map((f) => (this.cfg.reuseBinaryOids.has(f.dataTypeOid) ? { name: f.name, oid: f.dataTypeOid, format: 'binary' as const } : { name: f.name, oid: f.dataTypeOid })))
            this.assignMapper(t, cols)
            t.resultFormat = cols.map((c) => (c.format === 'binary' ? 1 : 0))
          } else {
            this.assignMapper(t, cached.fields.map((f) => ({ name: f.name, oid: f.dataTypeOid }))) // buffer/raw: text bytes
          }
        }
        else if (cached) { writeClose(w, 'S', t.name); this.prepared.delete(t.name); t._repreparedSqlChanged = true } // same name, different SQL -> deallocate + re-Parse
      }
      if (!reuse) {
        // a name invalidated by DDL still exists server-side (0A000) — deallocate it before re-Parsing, or
        // the Parse errors 42P05 "already exists". Close of an absent statement (26000 case) is a harmless no-op.
        if (t.name && this.staleStatements.has(t.name)) { writeClose(w, 'S', t.name); this.staleStatements.delete(t.name) }
        // A Parse for this exact (name, sql, declared types) is already queued ahead in this pipeline
        // (concurrent burst of first uses): DON'T Parse again — the server would 42P05 the duplicate. Still
        // Describe: the server processes the pipeline in order, so the statement exists by then, and the
        // response fills the cache.
        const myKey = parseKey(t)
        const inflightKey = t.name ? this.parseInflight.get(t.name) : undefined
        if (!t.name || inflightKey !== myKey) {
          if (t.name && inflightKey !== undefined) { writeClose(w, 'S', t.name); this.parseInflight.delete(t.name) } // same name, DIFFERENT sql/types still in flight
          writeParse(w, name, t.sql, t.paramTypes)
          if (t.name) parsedName = t.name
        }
        writeDescribe(w, 'S', name); if (t.name) t._cacheName = t.name
      }
      t._reused = reuse; if (t.info) t.info.prepared = reuse
      // Write-through params: values encode DIRECTLY into the outbound batch (no per-value Buffers or
      // wrapper objects). Fast types upgrade to BINARY via a compiled per-statement plan — the encode-side
      // mirror of reuseBinaryOids — from caller-declared paramTypes (first execution, unnamed too) or from
      // cached ParameterDescription OIDs on reuse. On reuse the SERVER-echoed OIDs win: they are the
      // statement's actual types, so a paramTypes drift across calls can never binary-misencode.
      let enc: ParamsEncoder = encodeValueInto
      let planOids: readonly number[] | undefined // set to the plan's OIDs when `enc` is a binary plan -> JIT-eligible
      if (this.cfg.binaryParams && !t.raw) { // rawParams: the caller chose the formats — no plan, no upgrade
        if (reuse && entry!.paramOids) {
          if (entry!.plan === undefined) entry!.plan = compileParamPlan(entry!.paramOids)
          if (entry!.plan) { enc = entry!.plan; planOids = entry!.paramOids }
        } else if (t.paramTypes) {
          let plan = this.paramPlanCache.get(t.paramTypes)
          if (plan === undefined) { plan = compileParamPlan(t.paramTypes); this.paramPlanCache.set(t.paramTypes, plan) }
          if (plan) { enc = plan; planOids = t.paramTypes }
        }
      }
      const rf = t.resultFormat ?? 0
      if (t.raw) { writeBindRaw(w, '', name, t.raw.formats, t.raw.values, rf); writeExecute(w, '', 0); writeSync(w) } // pre-encoded: verbatim into Bind
      else {
        const jitEnc = (this.jitEncode && planOids !== undefined && t.params.length === planOids.length) ? this.jitFor(enc, name, planOids, rf) : null
        if (jitEnc) jitEnc(w, t.params) // whole Bind+Execute+Sync from the compiled encoder (one row body, looped for VALUES chunks)
        else { writeBindWith(w, '', name, t.params, enc, rf); writeExecute(w, '', 0); writeSync(w) }
      }
      if (parsedName) this.parseInflight.set(parsedName, parseKey(t))
      } // ---- end extended-protocol serialization ----
      if (t.perf) t.perf.sent = w.mark() - mark // bytes this query contributed to the batch
    } catch (e) {
      w.rewind(mark) // discard this task's partial bytes; earlier batched tasks stay intact
      this.rejectTask(t, e as Error)
      return
    }
    this.inflight.push(t)
    if (this.inflight.length > this._maxInflight) this._maxInflight = this.inflight.length
    if (t.timeout != null) t.timer = setTimeout(() => this.cancelTask(t, Object.assign(new Error(`query timed out after ${t.timeout}ms`), { code: 'QUERY_TIMEOUT' })), t.timeout)
    t._wAt = performance.now() // stamp send time for the always-on live RTT sample (reused as tWrite when instrumented)
    if (t.perf) { t.perf.tWrite = t._wAt; this.fireStart(t) } // query now in flight (the batch is flushed by processQueue)
  }

  // Arm an AbortSignal on a task. Returns true if it was already aborted (and settled now).
  private armSignal(task: Task): boolean {
    const sig = task.signal
    if (!sig) return false
    const settle = (r: Error) => { task.settled = true; this.rejectTask(task, r) }
    if (sig.aborted) { settle((sig.reason as Error) ?? Object.assign(new Error('query aborted'), { name: 'AbortError' })); return true }
    const onAbort = () => this.cancelTask(task, (sig.reason as Error) ?? Object.assign(new Error('query aborted'), { name: 'AbortError' }))
    sig.addEventListener('abort', onAbort, { once: true })
    task.signalCleanup = () => sig.removeEventListener('abort', onAbort)
    return false
  }

  // Cancel a task: settle the caller immediately, and if it's in flight, send an
  // out-of-band CancelRequest and keep draining to ReadyForQuery (hard fallback: destroy).
  private cancelTask(task: Task, reason: Error): void {
    if (task.settled) return
    task.settled = true
    if (task.timer) clearTimeout(task.timer)
    const idx = this.inflight.indexOf(task)
    if (idx >= 0) {
      // Already on the wire: settle the caller now; its result still streams back and finishTask discards
      // it (it's settled). An out-of-band CancelRequest cancels whatever the backend is CURRENTLY running —
      // accurate only for the head (idx 0); for a query queued behind the head in the pipeline we just let
      // it run and drop the result (cancelling would hit the wrong query).
      this.fireEnd(task, reason)
      this.rejectTask(task, reason)
      if (idx === 0) {
        // CopyFail ends a COPY FROM STDIN, and the server holds back a CancelRequest while it reads COPY data.
        if (!task.copySource) this.sendCancelRequest(task)
        task.graceTimer = setTimeout(() => { try { this.socket?.destroy() } catch { /* */ } }, 5000) // dead-network fallback
      }
    } else {
      const i = this.queue.indexOf(task); if (i >= 0) this.queue.splice(i, 1)
      task.signalCleanup?.()
      this.rejectTask(task, reason)
    }
  }

  // Out-of-band CancelRequest through the transport's cancel, or the registered one when no transport is set.
  // Without either, the grace timer's socket.destroy() is the fallback.
  private sendCancelRequest(head: Task): void {
    const key = this.backendKey
    const cancel = this.cfg.transport ? this.cfg.transport.cancel?.bind(this.cfg.transport) : defaultCancel
    if (!key || !cancel) return
    // Two cancels in flight cannot be told apart, so the connection is not reused after the second one.
    if (this.pendingCancel) this.isRetiring = true
    const pending: PendingCancel = { head, isConfirmed: false, hasFailed: false }
    this.pendingCancel = pending
    // A cancel that is still open after connectTimeout counts as failed, so the connection retires
    // instead of waiting for the OS to give up on the cancel socket.
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('cancel request timed out')), this.cfg.connectTimeout) })
    Promise.race([cancel(this.cfg, key), deadline]).finally(() => clearTimeout(timer)).then(
      () => { pending.isConfirmed = true; if (this.pendingCancel === pending && !pending.head) this.resolveCanceledHead(pending) },
      () => { pending.hasFailed = true; if (this.pendingCancel === pending && !pending.head) this.resolveCanceledHead(pending) },
    )
  }

  /** Pending while a canceled query is still draining. Resolves when the connection is safe to reuse,
   *  or when it was closed because a cancel request might still reach a later query. */
  get cancelSettled(): Promise<void> | undefined {
    if (!this.pendingCancel && !this.isRetiring) return undefined
    if (!this.cancelDone) { let resolve!: () => void; const promise = new Promise<void>((r) => { resolve = r }); this.cancelDone = { promise, resolve } }
    return this.cancelDone.promise
  }

  private clearPendingCancel(): void {
    if (this.pendingCancel?.timer) clearTimeout(this.pendingCancel.timer)
    this.pendingCancel = null; this.isRetiring = false
    const done = this.cancelDone; this.cancelDone = undefined; done?.resolve()
  }

  // The canceled head ended. If it ended with 57014, the cancel was used up. If the server already
  // closed the cancel connection, the backend got the signal while it was running the head or while
  // it was idle, and Postgres ignores a cancel that reaches a backend that waits for a command. A
  // pooler can close that connection before the backend gets the signal, so there it does not count.
  // Otherwise wait for that confirmation, and retire the connection if it does not come.
  private endCanceledHead(t: Task): void {
    const pending = this.pendingCancel!
    pending.head = null
    const isStopped = (t.error as PgError | undefined)?.code === '57014'
    if (!isStopped && this.inflight.length > 0) this.lateCancel = { pending, suspects: new Set(this.inflight) }
    if (this.isRetiring) return
    if (isStopped) return this.clearPendingCancel()
    this.resolveCanceledHead(pending)
    if (this.pendingCancel === pending && !this.isRetiring) {
      pending.timer = setTimeout(() => { if (this.pendingCancel === pending) { this.isRetiring = true; this.processQueue() } }, Math.min(this.cfg.connectTimeout, 5000))
    }
  }

  private resolveCanceledHead(pending: PendingCancel): void {
    if (this.isRetiring) return
    if (pending.hasFailed || (pending.isConfirmed && this.cfg.isBehindPooler)) { this.isRetiring = true; this.processQueue() }
    else if (pending.isConfirmed) { this.clearPendingCancel(); this.processQueue() }
  }

  // A cancel request stops at most one query, so only the first 57014 among the suspects is marked.
  // A statement_timeout or a cancel from another session in the same window is marked too.
  private checkLateCancel(t: Task): void {
    const late = this.lateCancel!
    late.suspects.delete(t)
    const err = t.error as PgError | undefined
    if (err?.code === '57014' && !t.settled) {
      err.isLateCancel = true
      err.hint = 'A cancel request for an earlier query in the pipeline most likely reached the server after that query ended, and it stopped this query. The server rolled this query back, so it can run again.'
      late.suspects.clear()
      if (this.pendingCancel === late.pending && !this.isRetiring) this.clearPendingCancel()
    }
    if (late.suspects.size === 0) this.lateCancel = null
  }

  private retire(): void {
    try { this.socket?.write(W.terminate()) } catch { /* */ }
    this.onSocketDown(new Error('@drizzle-team/postgres: the connection was closed because a cancel request could still stop a later query on it. Run the query again on a new connection.'))
  }

  private finishTask(): void {
    const t = this.inflight.shift() ?? null // the head completed (its ReadyForQuery arrived); the next in-flight becomes head
    if (!t) { this.processQueue(); return }
    if (this.lateCancel?.suspects.has(t)) this.checkLateCancel(t)
    if (t === this.pendingCancel?.head) this.endCanceledHead(t)
    // This task wrote the burst's Parse but its cycle errored before the Describe response cached the name:
    // clear the in-flight marker (later first-uses must Parse again) and flag the name stale — if the Parse
    // itself DID succeed server-side, the next Parse would 42P05 without a Close first (Close of an absent
    // statement is a no-op, so over-flagging is harmless).
    if (t.error && t._cacheName && !this.prepared.has(t._cacheName)) {
      if (this.parseInflight.get(t._cacheName) === parseKey(t)) this.parseInflight.delete(t._cacheName)
      this.staleStatements.add(t._cacheName)
    }
    // A prepared statement invalidated by DDL — 0A000 "cached plan must not change result type" or 26000
    // "prepared statement does not exist" — is dropped from the cache and transparently RE-RUN once. Both
    // are raised before execution (no rows affected), so the retry is side-effect-safe. It Close+re-Parses
    // (staleStatements) and, for a plain query, goes back out TEXT since the new OIDs are unknown again.
    if (t.name && t.error) {
      const code = (t.error as PgError).code
      if (code === '0A000' || code === '26000') {
        this.prepared.delete(t.name); this.staleStatements.add(t.name)
        // NOT for _typed (shape/queryTyped): the caller-declared mapper isn't rebuilt from the fresh
        // RowDescription, so a schema change would silently decode with the stale plan — surface instead.
        // NOT inside a (now-aborted) transaction: the retry would only hit 25P02; surface the real 0A000.
        // NOT for 'wire': errors are DATA there (the E frame resolves in-band); a transparent re-run would
        // also reorder the response behind later pipeline entries. staleStatements above still self-heals
        // the statement for its next execution.
        if (!t.settled && !t.stream && !t._typed && !t.wire && !this.inTransaction && (t._retries ?? 0) < 1) {
          t._retries = (t._retries ?? 0) + 1
            ; (t._retryErrors ??= []).push(code)
          if (t.timer) clearTimeout(t.timer) // old timer cleared here; startTask re-arms a fresh one (else it leaks)
          if (t.graceTimer) clearTimeout(t.graceTimer)
          t.error = undefined; t.rows = []; t.command = undefined; t.rowCount = undefined; t.fields = undefined; t._debugCols = undefined; t._reused = undefined; t._paramOids = undefined
          if (t.perf) t.perf.tFirst = undefined // measure the retry's ttfb, not the failed attempt's error response
          if (!t.binary) t.resultFormat = undefined // plain query: re-run as text; { binary: true } keeps all-binary
          // Re-run at the BACK of the queue (not the front) — one uniform mechanic for gated AND pipelined
          // transport: under pipelining a front re-run can't preempt queries already in flight anyway, and
          // the failed attempt had no side effects (0A000/26000 fire pre-execution) so the later position is
          // correctness-safe. For the sequential-await case the queue is otherwise empty, so it's a no-op.
          this.queue.push(t); this.processQueue(); return // onQueryStart/End still fire exactly once
        }
      }
    }
    if (t.timer) clearTimeout(t.timer)
    if (t.graceTimer) clearTimeout(t.graceTimer)
    t.signalCleanup?.()
    if (!t.settled) { // a timed-out/aborted task was already settled by the caller
      // wire: a backend ErrorResponse is DATA (the E frame is in the array) — resolve. Anything that is
      // NOT a PgError has no frame on the wire (client-side failure) and falls through to the reject.
      if (t.wire && (!t.error || t.error instanceof PgError)) {
        if (t._wireBuf !== undefined) { t.wire.push(Buffer.from(t._wireBuf, t._wireStart!, t._wireEnd! - t._wireStart!)); t._wireBuf = undefined } // close the open span
        this.fireEnd(t, t.error); t.resolve?.(t.wire as never)
      }
      else if (t.error) { if (t.debug) (t.error as PgError & { debug?: QueryDebug }).debug = this.buildDebug(t); this.fireEnd(t, t.error); this.rejectTask(t, t.error) }
      else if (t.stream) { this.fireEnd(t); t.streamEnd?.({ command: t.command, rowCount: t.rowCount }) }
      else {
        const m = this.fireEnd(t)
        const res: QueryResult<never> = { rows: t.rows as never[], columns: (t.fields ?? []).map((f) => f.name), rowCount: t.rowCount ?? null, command: t.command ?? null }
        if (t.wantMetrics && m) res.metrics = m
        if (t.debug) res.debug = this.buildDebug(t)
        t.resolve?.(res)
      }
    }
    this.processQueue()
  }

  // Settle (reject) the in-flight query and everything queued — the "every
  // terminal event settles, no hung promise" invariant. Shared by fatal() and end().
  private settlePending(e: Error): void {
    this.outbuf.reset() // drop any batched-but-unflushed bytes
    this.parseInflight.clear() // any recorded Parse may never have reached the wire
    this.lateCancel = null
    // Reject every in-flight query. Prefer an informative server error already received for one (e.g. a
    // FATAL 57P01 admin_shutdown that arrives just before the socket closes); the rest take the given error.
    while (this.inflight.length) { const t = this.inflight.shift()!; if (t.timer) clearTimeout(t.timer); if (t.graceTimer) clearTimeout(t.graceTimer); t.signalCleanup?.(); if (!t.settled) { const reason = t.error ?? e; this.fireEnd(t, reason); this.rejectTask(t, reason) } }
    while (this.queue.length) { const t = this.queue.shift()!; t.signalCleanup?.(); if (!t.settled) { this.rejectTask(t, e) } }
  }

  // reject only the queued (not-yet-sent) tasks; the in-flight one is handled separately
  private rejectQueue(err: Error): void {
    while (this.queue.length) { const t = this.queue.shift()!; this.rejectTask(t, err) }
  }

  // An establish attempt (initial connect or a reconnect try) failed.
  private failAttempt(err: Error): void {
    if (!this.connecting) return
    this.connecting = false; clearTimeout(this.connTimer)
    try { this.connectAbort?.abort() } catch { /* */ } // tear down a pending transport socket (stalled handshake)
    this.connectAbort = undefined
    const dead = this.socket; this.socket = null
    try { dead?.destroy() } catch { /* */ }
    const rj = this.attemptReject; this.attemptResolve = this.attemptReject = undefined
    rj?.(err)
  }

  // A socket died. During an attempt -> fail the attempt. On a live connection ->
  // reject the in-flight query (NEVER replay) and either reconnect or close.
  private onSocketDown(err: Error): void {
    if (this.state === 'closed') return
    if (this.connecting) return this.failAttempt(err)
    this.clearPendingCancel()
    const dead = this.socket; this.socket = null // claim the death; further events from `dead` are ignored
    try { dead?.destroy() } catch { /* */ }
    this.outbuf.reset() // drop any batched-but-unflushed bytes
    // Reject every in-flight query (NEVER replay). The head may carry a server error; the rest take `err`.
    while (this.inflight.length) { const t = this.inflight.shift()!; if (t.timer) clearTimeout(t.timer); if (t.graceTimer) clearTimeout(t.graceTimer); t.signalCleanup?.(); if (!t.settled) { const reason = t.error ?? err; this.fireEnd(t, reason); this.rejectTask(t, reason) } }
    if (this.cfg.reconnect.enabled && !this.ended) {
      this.state = 'reconnecting'
      this.prepared.clear(); this.staleStatements.clear(); this.parseInflight.clear() // server-side prepared statements are gone after a drop/restart
      void this.startReconnect(err)
    } else {
      this.state = 'closed'
      this.rejectQueue(err)
    }
  }

  // Single connection's reconnect loop: backoff+jitter until ready, or give up on a fatal error.
  private async startReconnect(lastErr: Error): Promise<void> {
    const { base, max, maxRetries } = this.cfg.reconnect
    for (let attempt = 0; ; attempt++) {
      if (this.ended || this.state === 'closed') return
      if (maxRetries != null && attempt >= maxRetries) { this.state = 'closed'; this.rejectQueue(new Error(`reconnect failed after ${attempt} attempts: ${lastErr.message}`)); return }
      await sleep(Math.min(max, base * 2 ** attempt) * (0.5 + Math.random() * 0.5))
      if (this.ended || (this.state as string) === 'closed') return // end() may have run during the backoff
      if (this.instrumented) for (const pl of this.cfg.plugins) try { pl.onReconnect?.({ attempt, error: lastErr }) } catch { /* */ }
      try { await this.establish(); return } // success -> ready() flips to 'ready' and drains the queue
      catch (e) { lastErr = e as Error; if (isFatalAuth(e)) { this.state = 'closed'; this.rejectQueue(e as Error); return } }
    }
  }

  // ---- public query API ----
  // a shape (without an explicit non-object mode) decodes to objects — matches the runtime default.
  // generic over the shape's column names so editors autocomplete each value to the known type list.
  query<K extends string>(sql: string, params: readonly unknown[], opts: { shape: ShapeOf<K> | ShapeEntries | ShapeMapper; mode?: 'object'; name?: string; metrics?: boolean | 'ms' | 'us'; debug?: boolean; timeout?: number; signal?: AbortSignal }): Promise<QueryResult<Record<string, unknown>>>
  query(sql: string, params?: readonly unknown[] | RawParams, opts?: { name?: string; snapshot?: string; params?: readonly ParamType[]; mode?: 'array'; metrics?: boolean | 'ms' | 'us'; debug?: boolean; timeout?: number; signal?: AbortSignal; trace?: boolean; shape?: ShapeSpec | ShapeMapper; binary?: boolean }): Promise<QueryResult<unknown[]>>
  query(sql: string, params: readonly unknown[] | RawParams, opts: { name?: string; snapshot?: string; params?: readonly ParamType[]; mode: 'object'; metrics?: boolean | 'ms' | 'us'; debug?: boolean; timeout?: number; signal?: AbortSignal; trace?: boolean; shape?: ShapeSpec | ShapeMapper; binary?: boolean }): Promise<QueryResult<Record<string, unknown>>>
  // 'wire': the statement's raw backend messages ({T,D,C,E,I}, framing intact) as CONTIGUOUS RUNS —
  // concatenate the entries to get the byte stream; entry count scales with socket chunks, not rows.
  // RESOLVES even when the statement failed (the E frame is data); only connection-level failures reject.
  query(sql: string, params: readonly unknown[] | RawParams, opts: { name?: string; params?: readonly ParamType[]; mode: 'wire'; metrics?: boolean | 'ms' | 'us'; timeout?: number; signal?: AbortSignal; trace?: boolean }): Promise<Uint8Array[]>
  query(sql: string, params: readonly unknown[] | RawParams, opts: { name?: string; snapshot?: string; params?: readonly ParamType[]; mode: 'buffer'; metrics?: boolean | 'ms' | 'us'; debug?: boolean; timeout?: number; signal?: AbortSignal; trace?: boolean; binary?: boolean }): Promise<QueryResult<(Buffer | null)[]>>
  query(sql: string, params: readonly unknown[] | RawParams, opts: { name?: string; snapshot?: string; params?: readonly ParamType[]; mode: 'raw'; metrics?: boolean | 'ms' | 'us'; debug?: boolean; timeout?: number; signal?: AbortSignal; trace?: boolean; binary?: boolean }): Promise<QueryResult<Buffer>>
  // impl return is `any` ONLY to satisfy every overload (QueryResult<T> shapes + wire's Uint8Array[]);
  // all callers go through the typed overloads above.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(sql: string, params: readonly unknown[] | RawParams = [], opts: QueryOptions = {}): Promise<any> {
    // query(sql, opts) arg-shift for untyped callers: a non-array second argument whose keys are
    // all KNOWN options (and no third argument) is an options object, not a params mistake.
    if (params && !Array.isArray(params) && typeof params === 'object' && Object.keys(opts).length === 0) {
      const keys = Object.keys(params)
      if (keys.length > 0 && keys.every((k) => OPTION_KEYS.has(k))) { opts = params as QueryOptions; params = [] }
    }
    if (opts.snapshot) {
      // snapshot-pinned one-shot: BEGIN + SET SNAPSHOT + query + COMMIT fired back-to-back so
      // they PIPELINE (one round trip, contiguous in the dispatch queue). A failed query
      // aborts the tx, which turns the trailing COMMIT into a rollback — always cleaned up.
      if (this.inTransaction) return Promise.reject(new Error('snapshot queries need a fresh transaction — use them outside begin()'))
      const { snapshot, ...rest } = opts
      const parts = [
        this.query('begin isolation level repeatable read read only'),
        this.query(`set transaction snapshot '${snapshot.replace(/'/g, "''")}'`),
        this.query(sql, params, rest as never) as Promise<QueryResult<never>>,
        this.query('commit'),
      ] as const
      return Promise.allSettled(parts).then((r) => {
        for (const s of r) if (s.status === 'rejected') throw s.reason // first failure wins (SET before its 25P02 fallout)
        return (r[2] as PromiseFulfilledResult<QueryResult<never>>).value
      })
    }
    const p = new Promise<QueryResult<never>>((resolve, reject) => {
      if (this.state === 'closed') return reject(new Error('connection is closed'))
      if (typeof sql !== 'string') return reject(new TypeError('@drizzle-team/postgres: sql must be a string — the builder-chunks array form was removed; join your fragments into one $1/$2-parameterized string'))
      const text = sql
      let name = opts.name
      if (!this.cfg.prepare) name = undefined // pooler-safe: never a server-side named prepared statement
      const mode = opts.mode ?? (opts.shape ? 'object' : 'array') // a shape implies named columns -> object
      let raw: RawParams | undefined
      if (isRawParams(params)) { raw = params; params = [] } // pre-encoded Bind bytes: nothing to encode
      const nParams = raw ? raw.values.length : (params as unknown[]).length
      if (opts.params && nParams !== opts.params.length) return reject(new Error(`@drizzle-team/postgres: ${nParams} param value(s) but ${opts.params.length} type(s) declared in params:[…] — they must match one-to-one`))
      const task: Task = { sql: text, params: params as unknown[], raw, name, mode, rows: [], resolve, reject, timeout: opts.timeout, signal: opts.signal, debug: opts.debug, paramTypes: opts.params && resolveParamTypes(opts.params) }
      if (mode === 'wire') {
        if (opts.shape || opts.binary) return reject(new Error("@drizzle-team/postgres: mode:'wire' returns undecoded backend frames — shape/binary decode options don't apply (and binary would make the frames lie about their format)"))
        task.wire = [] // frames collect in handle(); resultFormat stays TEXT — remote clients decode by the T frame, which always claims text
      } else if (opts.shape) {
        // declared column shape: decode with the SAME cached jit/interpreted mapper as any query, and
        // request binary wire format for any column marked format:'binary'. (mode is array|object here.)
        const cols = this.resolveCols(typeof opts.shape === 'function' ? (opts.shape.$cols as CodegenCol[]) : shapeCols(opts.shape))
        if (cols.some((c) => c.oid === 0)) task._shapeCols = cols // 'unknown' cols: defer the mapper until real OIDs arrive
        else this.assignMapper(task, cols)
        task.resultFormat = cols.map((c) => (c.format === 'binary' ? 1 : 0)) // shapeCols upgraded boost types ('unknown' is always text)
        task._typed = true
      } else if (opts.binary) {
        // force BINARY for every column; the mapper is built binary from RowDescription OIDs in the 'T'
        // handler (a scalar resultFormat of 1 tells the server "all columns binary").
        task.binary = true
        task.resultFormat = 1
      }
      this.beginPerf(task, params, opts.metrics)
      if (this.armSignal(task)) return
      this.queue.push(task)
      this.processQueue()
    })
    return opts.trace ? this.retraced(p) : p
  }

  /** Run a query whose result columns are declared upfront (name + wire OID + per-column format/target).
   *  Requests the given wire formats from the server (binary for `format:'binary'` columns) and decodes
   *  with a typed mapper — enabling the binary result format for supported types without a Describe round
   *  trip. `columns` MUST match the SELECT's result columns (count + order). */
  queryTyped(sql: string, params: unknown[], columns: CodegenCol[], opts: { mode?: 'array' | 'object'; metrics?: boolean | 'ms' | 'us'; timeout?: number; signal?: AbortSignal; debug?: boolean; trace?: boolean } = {}): Promise<QueryResult<never>> {
    const p = new Promise<QueryResult<never>>((resolve, reject) => {
      if (this.state === 'closed') return reject(new Error('connection is closed'))
      const mode = opts.mode ?? 'object'
      const cols = this.resolveCols(columns)
      const task: Task = {
        sql, params, mode, rows: [], resolve, reject, timeout: opts.timeout, signal: opts.signal, debug: opts.debug,
        mapper: this.getMapper(cols, mode), resultFormat: cols.map((c) => (c.format === 'binary' ? 1 : 0)), _typed: true,
      }
      if (opts.debug) task._debugCols = cols
      this.beginPerf(task, params, opts.metrics)
      if (this.armSignal(task)) return
      this.queue.push(task)
      this.processQueue()
    })
    return opts.trace ? this.retraced(p) : p
  }

  /** Batch-insert rows via `insert into t (…) select * from unnest($1::x[], …)` — ONE prepared
   *  statement regardless of row count, params encoded as BINARY arrays from the first
   *  execution (declared types), transaction-pooler safe. Rows are arrays (column order) or
   *  records (keyed by column name). Large batches AUTO-CHUNK adaptively per batch (~1024
   *  cells and <=~32KB per statement, row size sampled from the batch; explicit `chunk` wins)
   *  (giant single unnest statements make the server materialize whole arrays first) — the
   *  chunks pipeline on this connection and the call stays ATOMIC: it wraps itself in a
   *  transaction unless one is already open. `atomic: false` flips to the WAL-friendly mode:
   *  chunks run SEQUENTIALLY and each COMMITS on its own — incremental WAL flushes and short
   *  transactions instead of one giant end-of-load flush; a failure stops at the chunk
   *  boundary, keeps prior chunks, and the error carries `insertedRows`. `returning` rows
   *  concatenate across chunks in input order. `chunk` overrides the chunk size; `metrics`
   *  applies to unchunked calls.
   *
   *  `defaults: true` opts OUT of unnest into a multi-row VALUES insert so per-cell column
   *  DEFAULTs can be requested: a cell that is `undefined` (or a missing object key) emits the
   *  literal `DEFAULT` keyword (the server applies the column default — a constant, `now()`,
   *  `nextval(…)`, anything), while an explicit `null` still inserts SQL NULL. (The unnest path
   *  can't express this: it sends every column, so an undefined there becomes NULL and OVERRIDES
   *  the default.) Trade-off: the statement text encodes the DEFAULT positions, so instead of one
   *  immutable statement you get one prepared statement per distinct (default-pattern, chunk-size)
   *  — the common case (the same columns omitted on every row) stays a single reusable statement.
   *  Params go out text-encoded with server type inference (no declared OIDs); every other option
   *  (chunking, atomic/WAL, returning, onProgress) behaves the same. */
  bulkInsert(
    table: string,
    columns: Readonly<Record<string, PgType>>,
    rows: readonly (readonly unknown[] | Readonly<Record<string, unknown>>)[],
    opts: { returning?: string; name?: string; chunk?: number; atomic?: boolean; defaults?: boolean; metrics?: boolean | 'ms' | 'us'; timeout?: number; signal?: AbortSignal; onProgress?: (p: BulkProgress) => void } = {},
  ): Promise<QueryResult<never>> {
    const names = Object.keys(columns)
    if (names.length === 0) return Promise.reject(new Error('bulkInsert: columns must not be empty'))
    if (opts.defaults) {
      // VALUES codegen: undefined cell -> literal DEFAULT, null -> SQL NULL, value -> $n param.
      const prefix = `insert into ${table.split('.').map(qIdent).join('.')} (${names.map(qIdent).join(',')}) values `
      const suffix = opts.returning ? ` returning ${opts.returning}` : ''
      const makeChunk = (start: number, end: number) => {
        const params: unknown[] = []
        const tuples: string[] = new Array(end - start)
        for (let r = start; r < end; r++) {
          const row = rows[r]!
          const isArr = Array.isArray(row)
          const cells: string[] = new Array(names.length)
          for (let c = 0; c < names.length; c++) {
            const v = isArr ? (row as readonly unknown[])[c] : (row as Record<string, unknown>)[names[c]!]
            if (v === undefined) cells[c] = 'DEFAULT'
            else { params.push(v); cells[c] = '$' + params.length }
          }
          tuples[r - start] = '(' + cells.join(',') + ')'
        }
        const sql = prefix + tuples.join(',') + suffix
        // one prepared-statement name per distinct SQL — naming always beats re-Parsing (measured ~2.5x)
        let name = this.valuesMeta.get(sql)
        if (name === undefined) { name = '_iv' + this.valuesMeta.size; this.valuesMeta.set(sql, name) }
        return { sql, params, name, oids: undefined }
      }
      return this.runBulk('bulkInsert', names, rows, opts, 'insertedRows', makeChunk)
    }
    const key = 'I\u0000' + table + '\u0000' + names.join('\u0000') + '\u0000' + names.map((n) => columns[n]).join('\u0000') + (opts.returning ? '\u0000' + opts.returning : '')
    let meta = this.insertMeta.get(key)
    if (!meta) {
      const { casts, oids } = bulkCasts(names, columns)
      const sql = `insert into ${table.split('.').map(qIdent).join('.')} (${names.map(qIdent).join(',')}) select * from unnest(${casts.join(',')})`
        + (opts.returning ? ` returning ${opts.returning}` : '')
      meta = { sql, oids, name: '_im' + this.insertMeta.size }
      this.insertMeta.set(key, meta)
    }
    const m = meta
    return this.runBulk('bulkInsert', names, rows, opts, 'insertedRows',
      (start, end) => ({ sql: m.sql, params: pivotRows(names, rows, start, end), name: opts.name ?? m.name, oids: m.oids }))
  }

  /** Bulk-UPDATE rows matched by key column(s):
   *  `update t set c = u.c, … from unnest($1::…[], …) u(cols…) where t.k = u.k`.
   *  `columns` declares key + SET columns together (one record, like bulkInsert); `by` names
   *  the key subset (string or array — composite keys allowed); the remaining columns are SET.
   *  Same engine as bulkInsert: ONE immutable prepared statement, binary array params,
   *  adaptive per-batch chunking, atomic by default; `atomic: false` = WAL-friendly per-chunk
   *  commits (a failure keeps prior chunks; the error carries `updatedRows`). rowCount = rows
   *  actually updated — keys that match nothing simply don't count. Caveats: a key appearing
   *  TWICE in one call is indeterminate (Postgres silently picks one winner) — dedupe first;
   *  NULL keys never match (SQL `=`); `returning` rows arrive in server order, not input order. */
  bulkUpdate(
    table: string,
    columns: Readonly<Record<string, PgType>>,
    rows: readonly (readonly unknown[] | Readonly<Record<string, unknown>>)[],
    opts: { by: string | readonly string[]; returning?: string; name?: string; chunk?: number; atomic?: boolean; metrics?: boolean | 'ms' | 'us'; timeout?: number; signal?: AbortSignal; onProgress?: (p: BulkProgress) => void },
  ): Promise<QueryResult<never>> {
    const names = Object.keys(columns)
    if (names.length === 0) return Promise.reject(new Error('bulkUpdate: columns must not be empty'))
    const by = typeof opts.by === 'string' ? [opts.by] : [...(opts.by ?? [])]
    if (by.length === 0) return Promise.reject(new Error('bulkUpdate: `by` must name at least one key column'))
    for (const k of by) if (!names.includes(k)) return Promise.reject(new Error(`bulkUpdate: \`by\` column "${k}" is not in columns`))
    const set = names.filter((n) => !by.includes(n))
    if (set.length === 0) return Promise.reject(new Error('bulkUpdate: no SET columns (every column is in `by`)'))
    const key = 'U\u0000' + table + '\u0000' + names.join('\u0000') + '\u0000' + names.map((n) => columns[n]).join('\u0000') + '\u0000' + by.join('\u0000') + (opts.returning ? '\u0000' + opts.returning : '')
    let meta = this.insertMeta.get(key)
    if (!meta) {
      const { casts, oids } = bulkCasts(names, columns)
      // unnest columns get POSITIONAL aliases (_c0.._cn) so user SQL in `returning` (and the
      // SET/WHERE refs) can never be ambiguous against the real column names
      const pos = (c: string) => `_c${names.indexOf(c)}`
      const sql = `update ${table.split('.').map(qIdent).join('.')} _t set ${set.map((c) => `${qIdent(c)} = _u.${pos(c)}`).join(', ')}`
        + ` from unnest(${casts.join(',')}) as _u(${names.map((n) => pos(n)).join(',')})`
        + ` where ${by.map((k) => `_t.${qIdent(k)} = _u.${pos(k)}`).join(' and ')}`
        + (opts.returning ? ` returning ${opts.returning}` : '')
      meta = { sql, oids, name: '_um' + this.insertMeta.size }
      this.insertMeta.set(key, meta)
    }
    const m = meta
    return this.runBulk('bulkUpdate', names, rows, opts, 'updatedRows',
      (start, end) => ({ sql: m.sql, params: pivotRows(names, rows, start, end), name: opts.name ?? m.name, oids: m.oids }))
  }

  // Shared chunked runner for bulkInsert/bulkUpdate. `makeChunk(start,end)` yields the SQL +
  // params + prepared-statement name (+ declared OIDs, if any) for one row range — the unnest
  // paths return a fixed SQL with column-pivoted params, the defaults path a VALUES statement.
  // Then: single statement / atomic pipelined tx / WAL-friendly sequential commits.
  private runBulk(
    label: string,
    names: readonly string[],
    rows: readonly (readonly unknown[] | Readonly<Record<string, unknown>>)[],
    opts: { chunk?: number; atomic?: boolean; metrics?: boolean | 'ms' | 'us'; timeout?: number; signal?: AbortSignal; onProgress?: (p: BulkProgress) => void },
    errProp: 'insertedRows' | 'updatedRows',
    makeChunk: (start: number, end: number) => { sql: string; params: unknown[]; name: string | undefined; oids: readonly number[] | undefined },
  ): Promise<QueryResult<never>> {
    const t0 = performance.now()
    const onProgress = opts.onProgress
    const track = onProgress ? { rows: 0, affected: 0, bytes: 0, chunk: 0 } : null
    const report = (chunkRows: number, r: QueryResult<never>, chunks: number): void => {
      if (!track || !onProgress) return
      track.rows += chunkRows; track.affected += r.rowCount ?? 0
      track.bytes += r.metrics?.bytesSent ?? 0; track.chunk += 1
      try { onProgress({ rows: track.rows, totalRows: rows.length, affected: track.affected, bytes: track.bytes, elapsedMs: performance.now() - t0, chunk: track.chunk, chunks }) } catch { /* user callback errors never break the bulk op */ }
    }
    // run one [start,end) range: build its statement, execute it (declared OIDs -> binary plan
    // cache hit by identity; undefined -> text-encoded params with server type inference)
    const run = (start: number, end: number, metrics: boolean | 'ms' | 'us' | undefined): Promise<QueryResult<never>> => {
      const c = makeChunk(start, end)
      return this.query(c.sql, c.params, { name: c.name, params: c.oids, timeout: opts.timeout, signal: opts.signal, metrics }) as Promise<QueryResult<never>>
    }
    const chunkMetrics = onProgress ? ('us' as const) : undefined
    const chunk = Math.max(1, opts.chunk ?? defaultChunk(names, rows)) // 64, bytes-capped for fat rows; explicit opts.chunk always wins
    if (rows.length <= chunk) {
      const p = run(0, rows.length, opts.metrics ?? chunkMetrics)
      return onProgress ? p.then((r) => { report(rows.length, r, 1); return r }) : p
    }
    const nChunks = Math.ceil(rows.length / chunk)
    if (opts.atomic === false) {
      // WAL-friendly mode: chunks run SEQUENTIALLY and each COMMITS on its own — incremental
      // WAL flushes + short transactions instead of one giant end-of-load flush. A failure
      // stops at the chunk boundary, keeps prior chunks, and the error carries insertedRows/updatedRows.
      if (this.inTransaction) return Promise.reject(new Error(`${label}: atomic:false inside an open transaction has no effect — chunks could not commit`))
      return (async () => {
        const rs: QueryResult<never>[] = []
        let done = 0
        for (let i = 0; i < rows.length; i += chunk) {
          try {
            const hi = Math.min(i + chunk, rows.length)
            const r = await run(i, hi, chunkMetrics)
            rs.push(r); done += r.rowCount ?? 0
            report(hi - i, r, nChunks)
          } catch (e) {
            throw Object.assign(e as Error, { [errProp]: done }) // chunks before this one are committed
          }
        }
        return mergeResults(rs)
      })()
    }
    // atomic (default): chunks PIPELINE inside ONE transaction (the caller's, or our own)
    const runAll = async (): Promise<QueryResult<never>> => {
      const ps: Promise<QueryResult<never>>[] = []
      for (let i = 0; i < rows.length; i += chunk) {
        const hi = Math.min(i + chunk, rows.length)
        const p = run(i, hi, chunkMetrics)
        ps.push(onProgress ? p.then((r) => { report(hi - i, r, nChunks); return r }) : p) // FIFO resolution -> monotone progress
      }
      return mergeResults(await Promise.all(ps))
    }
    return this.inTransaction ? runAll() : this.begin(runAll)
  }

  /** COPY FROM STDIN. `sql` must be a `COPY … FROM STDIN` statement; `source` yields raw
   *  COPY-format payload (text/csv/binary, matching the SQL) as strings or bytes — chunk
   *  boundaries need not align with rows, and Node Readable streams / generators work as-is.
   *  Runs SOLO on the connection (pipelined queries wait for it). Resolves with the server's
   *  `COPY n` row count. For a rows-in-memory one-liner see copyMany(). */
  copyFrom(sql: string, source: CopySource, opts: { metrics?: boolean | 'ms' | 'us'; timeout?: number; signal?: AbortSignal } = {}): Promise<QueryResult<never>> {
    return new Promise<QueryResult<never>>((resolve, reject) => {
      if (this.state === 'closed') return reject(new Error('connection is closed'))
      const task: Task = { sql, params: [], mode: 'array', rows: [], resolve, reject, timeout: opts.timeout, signal: opts.signal, copySource: source }
      this.beginPerf(task, [], opts.metrics)
      if (this.armSignal(task)) return
      this.queue.push(task)
      this.processQueue()
    })
  }

  /** Bulk-load rows with COPY — the fastest insert path. Uses FORMAT BINARY when every column
   *  type supports it (strict client-side typing; a mismatched value rejects with its row and
   *  column named), else the universal text format (the server parses/validates each field).
   *  COPY is all-or-nothing (one bad row aborts the whole load) and has no ON CONFLICT /
   *  RETURNING — for those, COPY into a temp/unlogged table and `insert … select`.
   *  `chunk` splits huge loads into one COPY statement per chunk (default: one COPY, which is
   *  fastest); with `atomic: false` each chunk COMMITS on its own — the WAL-friendly mode for
   *  very large loads (incremental WAL flushes, short transactions; a failure keeps prior
   *  chunks and the error carries `insertedRows`), otherwise chunks share one transaction. */
  copyMany(
    table: string,
    columns: Readonly<Record<string, PgType>>,
    rows: readonly (readonly unknown[] | Readonly<Record<string, unknown>>)[],
    opts: { format?: 'binary' | 'text'; chunk?: number; atomic?: boolean; metrics?: boolean | 'ms' | 'us'; timeout?: number; signal?: AbortSignal; onProgress?: (p: BulkProgress) => void } = {},
  ): Promise<QueryResult<never>> {
    const names = Object.keys(columns)
    if (names.length === 0) return Promise.reject(new Error('copyMany: columns must not be empty'))
    let oids: number[]
    try { oids = names.map((n) => paramTypeOid(columns[n]!)) } catch (e) { return Promise.reject(e as Error) } // also validates aliases
    const format = opts.format ?? (copyBinarySupported(oids) ? 'binary' : 'text')
    const sql = `copy ${table.split('.').map(qIdent).join('.')} (${names.map(qIdent).join(',')}) from stdin${format === 'binary' ? ' (format binary)' : ''}`
    const enc = (part: readonly (readonly unknown[] | Readonly<Record<string, unknown>>)[]) =>
      format === 'binary' ? copyRowsBinary(oids, names, part) : copyRowsText(names, part)
    const t0 = performance.now()
    const onProgress = opts.onProgress
    const cOpts = { metrics: onProgress ? ('us' as const) : opts.metrics, timeout: opts.timeout, signal: opts.signal }
    const track = onProgress ? { rows: 0, bytes: 0, chunk: 0 } : null
    const report = (chunkRows: number, r: QueryResult<never>, chunks: number): void => {
      if (!track || !onProgress) return
      track.rows += chunkRows; track.bytes += r.metrics?.bytesSent ?? 0; track.chunk += 1
      try { onProgress({ rows: track.rows, totalRows: rows.length, affected: track.rows, bytes: track.bytes, elapsedMs: performance.now() - t0, chunk: track.chunk, chunks }) } catch { /* user callback errors never break the copy */ }
    }
    const chunk = opts.chunk ?? 0 // default: ONE COPY statement (optimal throughput at every scale)
    if (chunk <= 0 || rows.length <= chunk) {
      const p = this.copyFrom(sql, enc(rows), cOpts)
      return onProgress ? p.then((r) => { report(rows.length, r, 1); return r }) : p
    }
    const nChunks = Math.ceil(rows.length / chunk)
    // Chunked COPY: one COPY statement per chunk, SEQUENTIAL (COPY runs solo anyway).
    const runSeq = async (): Promise<QueryResult<never>> => {
      const rs: QueryResult<never>[] = []
      let inserted = 0
      for (let i = 0; i < rows.length; i += chunk) {
        try {
          const part = rows.slice(i, i + chunk)
          const r = await this.copyFrom(sql, enc(part), cOpts)
          rs.push(r); inserted += r.rowCount ?? 0
          report(part.length, r, nChunks)
        } catch (e) {
          if (opts.atomic === false) throw Object.assign(e as Error, { insertedRows: inserted }) // committed chunks stay
          throw e // atomic: the wrapping transaction rolls everything back
        }
      }
      return mergeResults(rs)
    }
    if (opts.atomic === false) {
      // WAL-friendly mode: each COPY commits on its own — incremental WAL flushes, short
      // transactions, and a failure keeps prior chunks (error carries insertedRows).
      if (this.inTransaction) return Promise.reject(new Error('copyMany: atomic:false inside an open transaction has no effect — chunks could not commit'))
      return runSeq()
    }
    return this.inTransaction ? runSeq() : this.begin(runSeq)
  }

  /** Server-side cursor over a SELECT on THIS connection — created synchronously, opened
   *  lazily on the first next(). Owns the connection's transaction while open (like begin()):
   *  don't interleave other transactional work until it's closed/drained. For a dedicated
   *  connection per cursor, use pool.cursor(). */
  cursor<Row = Record<string, unknown>>(opts: CursorOptions): Cursor<Row> {
    return new Cursor<Row>(async () => ({ conn: this, release: () => {} }), opts)
  }

  /** Run `fn` inside a transaction on THIS connection. Sends BEGIN (with optional isolation/mode options),
   *  runs the callback with the transaction-scoped connection (`tx === this`), then COMMITs and resolves
   *  with the callback's return value — or ROLLBACKs and rethrows if it throws. A begin() while already in
   *  a transaction nests via SAVEPOINT (partial rollback). `transaction()` is an alias. Queries issued
   *  concurrently inside (e.g. Promise.all) pipeline on this one connection. */
  begin<T>(fn: TxFn<T>): Promise<T>
  begin<T>(options: TxOptions, fn: TxFn<T>): Promise<T>
  begin<T>(a: TxOptions | TxFn<T>, b?: TxFn<T>): Promise<T> {
    return typeof a === 'function' ? this.runTx(undefined, a) : this.runTx(a, b!)
  }
  transaction<T>(fn: TxFn<T>): Promise<T>
  transaction<T>(options: TxOptions, fn: TxFn<T>): Promise<T>
  transaction<T>(a: TxOptions | TxFn<T>, b?: TxFn<T>): Promise<T> {
    return typeof a === 'function' ? this.runTx(undefined, a) : this.runTx(a, b!)
  }

  private async runTx<T>(options: TxOptions | undefined, fn: TxFn<T>): Promise<T> {
    if (this.inTransaction) {
      // nested: a SAVEPOINT (options don't apply — the outermost BEGIN already set the tx's isolation/mode)
      const sp = `postgres_sp_${++this.spCounter}`
      await this.query(`savepoint ${sp}`)
      try { const r = await fn(this); await this.query(`release savepoint ${sp}`); return r }
      catch (e) {
        // roll back to the savepoint (clears any aborted state) and release it; the outer tx continues.
        try { await this.query(`rollback to savepoint ${sp}`); await this.query(`release savepoint ${sp}`) } catch { /* connection may be broken */ }
        throw e
      }
    }
    await this.query(beginClause(options))
    try { const r = await fn(this); await this.query('commit'); return r }
    catch (e) {
      // COMMIT that failed already ended the tx server-side, so this ROLLBACK is a harmless no-op then;
      // otherwise it undoes the work. Either way rethrow the ORIGINAL error.
      try { await this.query('rollback') } catch { /* connection may be broken; release()/reconnect handles it */ }
      throw e
    }
  }

  // `trace`: run the query promise through an async wrapper so a rejection is re-thrown as a fresh error born
  // INSIDE the awaited chain — the runtime's async stack traces then splice in the caller's frames (a raw
  // reject from onData/a timer can't carry them). One extra async hop per query; rebuilds the error only on
  // failure. No built-in links an IO-callback rejection to its origin (verified: async stack traces cover only
  // await/then; AsyncLocalStorage can't attribute a shared socket listener; console.createTask is DevTools-only
  // and absent on Bun/Deno), so moving error creation into the await chain is the one portable way.
  private async retraced<T>(p: Promise<T>): Promise<T> {
    try { return await p }
    catch (err) {
      if (!(err instanceof Error))throw err
      const fresh = new Error(err.message) // NEW error -> its stack is captured here, linked to the awaiting caller
      Object.setPrototypeOf(fresh, Object.getPrototypeOf(err) as object) // preserve PgError/AbortError instanceof
      Object.assign(fresh, err) // copy enumerable own props (code, severity, detail, debug, …); message/stack aren't enumerable
      fresh.name = err.name
      const inner = (err.stack ?? '').split('\n').slice(1).join('\n') // keep where it actually raised, as a tail
      if (inner && fresh.stack) fresh.stack += '\n    --- driver internals ---\n' + inner
      throw fresh
    }
  }

  stream<Row = unknown[]>(sql: string, params: readonly unknown[] = [], opts: StreamOptions = {}): AsyncIterableIterator<Row> {
    const self = this
    const buf: Row[] = []
    let waiting: { resolve: (r: IteratorResult<Row>) => void; reject: (e: Error) => void } | null = null
    let done = false, err: Error | null = null, paused = false
    const HWM = opts.highWaterMark ?? 200
    const t: Task = {
      sql, params, name: opts.name, mode: opts.mode ?? 'array', stream: true, rows: [], timeout: opts.timeout, signal: opts.signal,
      onRow(row) {
        buf.push(row as Row)
        if (waiting) { const w = waiting; waiting = null; w.resolve({ value: buf.shift()!, done: false }) }
        else if (buf.length > HWM && self.socket && !paused) { paused = true; self.socket.pause() }
      },
      streamEnd() { done = true; if (waiting) { const w = waiting; waiting = null; w.resolve({ value: undefined, done: true }) } },
      streamError(e) { err = e; if (waiting) { const w = waiting; waiting = null; w.reject(e) } },
    }
    if (this.state === 'closed') err = new Error('connection is closed')
    else if (!this.armSignal(t)) { this.queue.push(t); this.processQueue() }
    return {
      [Symbol.asyncIterator]() { return this },
      next(): Promise<IteratorResult<Row>> {
        if (buf.length) { const v = buf.shift()!; if (paused && buf.length < HWM / 2) { paused = false; self.socket?.resume() } return Promise.resolve({ value: v, done: false }) }
        if (err) return Promise.reject(err)
        if (done) return Promise.resolve({ value: undefined, done: true })
        return new Promise<IteratorResult<Row>>((resolve, reject) => { waiting = { resolve, reject } })
      },
      return(): Promise<IteratorResult<Row>> {
        t.cancelled = true
        // A cancel inside a transaction would abort the transaction, so there the rest is read and dropped.
        if (!done && !err && !self.inTransaction) self.cancelTask(t, Object.assign(new Error('stream closed early'), { name: 'AbortError' }))
        if (paused) { paused = false; try { self.socket?.resume() } catch { /* */ } }
        return Promise.resolve({ value: undefined, done: true })
      },
    }
  }

  /** COPY … TO STDOUT as a RAW byte relay — the sending half of a direct copy pipe:
   *
   *      await target.copyFrom('copy t from stdin (format binary)',
   *                            source.copyTo('copy t to stdout (format binary)'))
   *
   *  Chunks are opaque bytes with NO row/boundary alignment guarantee (copyFrom is equally
   *  boundary-agnostic); nothing is decoded, so memory stays bounded regardless of table size.
   *  Buffered bytes above `highWaterMark` (default 512KB) pause the socket where the transport
   *  supports pause/resume (node does); `result` resolves with the final 'COPY n' tag. Runs SOLO
   *  on the connection like copyFrom — pool users should check a connection out. break/return()
   *  cancels the COPY like timeout/signal do (CancelRequest where the transport has one, else the
   *  grace-timer teardown). Inside a transaction, where a cancel would abort the transaction, it
   *  detaches instead: the remaining frames are dropped as they arrive while the server finishes the
   *  copy. COPY accepts no $n params — any dynamic values must be inlined with care. */
  copyTo(sql: string, opts: { timeout?: number; signal?: AbortSignal; highWaterMark?: number } = {}): AsyncIterableIterator<Uint8Array> & { result: Promise<{ command: string | null; rowCount: number | null }> } {
    const self = this
    let chunks: Buffer[] = []
    let buffered = 0
    let waiting: { resolve: (r: IteratorResult<Uint8Array>) => void; reject: (e: Error) => void } | null = null
    let done = false, err: Error | null = null, paused = false
    const HWM = opts.highWaterMark ?? 512 * 1024 // BYTES buffered before pausing the socket
    let resolveResult!: (v: { command: string | null; rowCount: number | null }) => void, rejectResult!: (e: Error) => void
    const result = new Promise<{ command: string | null; rowCount: number | null }>((res, rej) => { resolveResult = res; rejectResult = rej })
    result.catch(() => { /* branch, not a swallow: errors also surface via the iterator — this stops the mirror becoming an unhandled rejection */ })
    const resume = (): void => { if (paused) { paused = false; try { (self.socket as unknown as { resume?: () => void } | null)?.resume?.() } catch { /* */ } } }
    // every next() drains ALL buffered frames as one coalesced yield — text COPY sends one 'd' PER ROW,
    // so a yield-per-frame iterator would pay an await per row
    const drain = (): Uint8Array => { const v = chunks.length === 1 ? chunks[0]! : Buffer.concat(chunks); chunks = []; buffered = 0; resume(); return v }
    const t: Task = {
      sql, params: [], mode: 'array', rows: [], stream: true, copyOut: true, timeout: opts.timeout, signal: opts.signal,
      onCopyData(chunk) {
        if (waiting) { const w = waiting; waiting = null; w.resolve({ value: chunk, done: false }); return } // direct handoff — no buffering, no copy
        chunks.push(chunk); buffered += chunk.length
        if (buffered > HWM && !paused && self.socket) { paused = true; try { (self.socket as unknown as { pause?: () => void }).pause?.() } catch { /* */ } }
      },
      streamEnd(s) {
        done = true; resolveResult({ command: s.command ?? null, rowCount: s.rowCount ?? null })
        if (waiting) { const w = waiting; waiting = null; w.resolve({ value: undefined as never, done: true }) } // waiting implies no buffered chunks
      },
      streamError(e) { err = e; rejectResult(e); if (waiting) { const w = waiting; waiting = null; w.reject(e) } },
    }
    if (this.state === 'closed') { err = new Error('connection is closed'); rejectResult(err) }
    else if (!this.armSignal(t)) { this.queue.push(t); this.processQueue() }
    const it = {
      [Symbol.asyncIterator]() { return it },
      next(): Promise<IteratorResult<Uint8Array>> {
        if (chunks.length) return Promise.resolve({ value: drain(), done: false })
        if (err) return Promise.reject(err)
        if (done) return Promise.resolve({ value: undefined as never, done: true })
        return new Promise<IteratorResult<Uint8Array>>((resolve, reject) => { waiting = { resolve, reject } })
      },
      return(): Promise<IteratorResult<Uint8Array>> {
        const isRunning = !done && !err
        t.cancelled = true; chunks = []; buffered = 0; resume(); done = true // later 'd' frames are dropped in handle()
        if (isRunning && !self.inTransaction) self.cancelTask(t, Object.assign(new Error('copy closed early'), { name: 'AbortError' }))
        return Promise.resolve({ value: undefined as never, done: true })
      },
      result,
    }
    return it
  }

  async end(): Promise<void> {
    if (this.state === 'closed') return
    this.ended = true // stop any reconnect loop
    clearTimeout(this.connTimer)
    const e = new Error('connection ended (end() called)')
    try { this.socket?.write(W.terminate()) } catch { /* */ }
    this.state = 'closed'
    if (this.connecting) { this.connecting = false; const rj = this.attemptReject; this.attemptResolve = this.attemptReject = undefined; rj?.(e) }
    this.settlePending(e) // never leave an in-flight or queued query hanging
    this.clearPendingCancel()
    // The 1s timer is a SAFETY NET for a socket whose end() callback never fires — it must be cleared on
    // the normal path, or every closed connection leaves a pending timer (Node lingers up to a second
    // before exiting; Deno's test sanitizer reports it as a leak).
    await new Promise<void>((r) => {
      let fin = false
      let safety: ReturnType<typeof setTimeout> | undefined
      const done = () => { if (fin) return; fin = true; if (safety !== undefined) clearTimeout(safety); r() }
      try { this.socket?.end(done) } catch { done() }
      if (!fin) safety = setTimeout(done, 1000) // end() may have called back synchronously
    })
    try { this.socket?.destroy() } catch { /* */ }
  }
}
