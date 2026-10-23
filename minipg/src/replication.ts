// Logical replication client (`replication()`): a walsender connection speaking the replication
// grammar over the simple protocol + CopyBoth pgoutput streaming. Reuses the driver's transports
// (node net/tls or config.socket), full auth (SCRAM/md5/cleartext), and decoder catalog — tuple
// values decode exactly like plain text-format query cells.
//
//   const repl = await replication({ host, port, user, password, database })
//   const slot = await repl.createSlot('pulse', { temporary: true, snapshot: 'export' })
//   // gapless backfill: pin the snapshot with a cursor before the next command here
//   for await (const e of repl.start({ slot: slot.slot, publications: ['pub'] })) { … repl.ack(e.endLsn) }
import type { Duplex } from 'node:stream'
import { W, Parser, parseRowDescription, parseDataRow, type RawMessage } from './protocol.ts'
import { md5Password, scramForChannel, parseSaslMechanisms, peerCertDer, type Scram } from './auth.ts'
import { PgError, parseErrorFields } from './errors.ts'
import { getDefaultTransport, type NormalizedConfig } from './connection.ts'
import { resolveUrl } from './url.ts'
import { buildDecoders } from './decode.ts'
import { pickDecoder, replBinaryFor, replBinaryForCol, tagArrayCol, type CellDecoder, type CodegenCol } from './decode.ts'
import { shapeCols, type TypeSpec } from './spec.ts'
import type { JsonMarker, TransformMarker, SpecEntries } from './json.ts'
import type { CustomMarker } from './registry.ts'
import type { ConnectConfig, Decoder } from './types.ts'

const PG_EPOCH_US = 946684800000000n // 2000-01-01T00:00:00Z in µs

// ---- LSNs: strings ('16/B374D848') publicly, bigint internally ----
export const lsnToString = (lsn: bigint): string => `${(lsn >> 32n).toString(16).toUpperCase()}/${(lsn & 0xffffffffn).toString(16).toUpperCase()}`
export const lsnFromString = (s: string): bigint => { const [hi, lo] = s.split('/'); return (BigInt(parseInt(hi!, 16)) << 32n) | BigInt(parseInt(lo!, 16)) }
const toLsn = (v: string | bigint): bigint => (typeof v === 'bigint' ? v : lsnFromString(v))

// ---- event model ----
export interface ReplicationRelation { schema: string; table: string; replicaIdentity: 'd' | 'n' | 'f' | 'i'; columns: { name: string; oid: number; key: boolean }[] }
export type Row = Record<string, unknown>
// LSN taxonomy: begin.finalLsn === commit.lsn (the commit record's own position) < commit.endLsn
// (the first position after it). ack() acks endLsn — see below.
export type ReplicationEvent =
  | {
      kind: 'begin'; xid: number; commitTime: Date
      /** Same instant as `commitTime`, as epoch microseconds — carries pgoutput's full precision where `Date` floors to milliseconds. */
      commitTimeUs: number
      /** The tx's commit-record LSN — identical to the matching commit event's `lsn`. */
      finalLsn: string
    }
  | {
      kind: 'commit'
      /** The commit record's OWN position (=== `begin.finalLsn`). Not the ack target. */
      lsn: string
      /** First LSN after the commit record — `repl.ack(e.endLsn)` acknowledges this tx. `ack()`
       *  normalizes any value inside `[lsn, endLsn)` to `endLsn`, so acking `lsn` by mistake still works. */
      endLsn: string
      commitTime: Date
      /** Same instant as `commitTime`, as epoch microseconds — carries pgoutput's full precision where `Date` floors to milliseconds. */
      commitTimeUs: number
    }
  | { kind: 'insert'; schema: string; table: string; new: Row }
  | ({
      kind: 'update'; schema: string; table: string; new: Row
      /** SHAPE keys of TOASTed columns pgoutput omitted because they're unmodified — listed in
       *  BOTH modes. With {@link StartOptions.hydrateToast} (default true) and a FULL old row the
       *  driver fills them into `new` from `old`; otherwise they're ABSENT from `new` (not null —
       *  null would mean SQL NULL) and unrecoverable: a follow-up query reads the CURRENT row, not this event's. */
      unchanged: string[]
      /** Present only when {@link TableShape.key} was declared. Under `oldKind: 'full'` the declared
       *  key columns are compared (see `sameValue`); under `'key'` it's `true` with no comparison
       *  (the tuple's presence is the signal); under `null` it's `false`. Exact only when the
       *  declared key equals the replica identity key — a proper-subset key over-reports `true` on any identity change, even unchanged. */
      keyChanged?: boolean
    } & (
      | {
          /** Under identity DEFAULT/INDEX, `'key'` appears only when the identity key changed — exact,
           *  no declared key needed; the old row is full width with `null` (not-carried, not SQL
           *  NULL) outside the identity. Under FULL every column is flagged `key: true`, so that flag alone can't identify the real key — declare {@link TableShape.key} for `keyChanged`. */
          oldKind: 'key' | 'full'
          old: Row
        }
      | { oldKind: null; old: null }
    ))
  | { kind: 'delete'; schema: string; table: string; old: Row; oldKind: 'key' | 'full' }
  | { kind: 'truncate'; tables: { schema: string; table: string }[]; cascade: boolean; restartIdentity: boolean }
  | { kind: 'message'; transactional: boolean; prefix: string; content: Buffer; lsn: string }
  | { kind: 'relation'; relation: ReplicationRelation } // schema (re-)announced — fires again on DDL changes

export type ReplicationConfig = Pick<ConnectConfig,
  'url' | 'host' | 'port' | 'user' | 'password' | 'database' | 'ssl' | 'path' | 'socket' | 'applicationName' | 'connectTimeout' | 'types' | 'jsonBigints' | 'options' | 'channelBinding'> & {
  /** Enable TCP keepalive (`SO_KEEPALIVE`) — a liveness signal independent of `receiveTimeoutMs`.
   *  `true` uses the OS default delay; the object form sets it explicitly. Applied via
   *  `setKeepAlive()` after connect, not a `tls.connect()` option (which silently drops keepalive
   *  — nodejs/node#62003). No-op on unix-socket and custom `socket` transports without `setKeepAlive`. */
  keepAlive?: boolean | { initialDelayMs?: number }
}

/** One table's declared decode shape for `start({ shapes })`. An ARRAY of these (not a keyed
 *  object) so schema/table names containing dots or quotes never need escaping. */
export interface TableShape {
  /** Table schema; default `'public'`. */
  schema?: string
  table: string
  /** shape key -> SQL column name, for keys that differ (e.g. drizzle JS property names). Keys
   *  absent here read the column named like the key; every key must exist in `shape` (typo throws). */
  columns?: Record<string, string>
  /** SHAPE keys (not SQL column names) forming this table's identity for `keyChanged`; each must
   *  exist in `shape` (a typo throws). A shape with only the key columns costs nothing — undeclared
   *  columns keep default decoding. Array/json-valued keys always compare as changed (no recursive
   *  branch), so `keyChanged` is `true` on every update for those — prefer scalar keys; empty arrays throw. */
  key?: string[]
  /** OUTPUT key -> spec: the same grammar as `query()`'s `{ shape }` — {@link TypeSpec} strings,
   *  `Json()`/`Jsonb()`, `Transform()`, `defineType()`/minipg-geometry markers; object literal or
   *  ordered `[key, spec]` entries. `Collect()` can't apply to a replication row and throws at `start()`. */
  shape: Record<string, TypeSpec | JsonMarker | TransformMarker | CustomMarker> | SpecEntries<TypeSpec | JsonMarker | TransformMarker | CustomMarker>
}

export interface StartOptions {
  slot: string
  /** Publications to subscribe. Empty rejects with {@link PublicationEmpty}; a missing one with
   *  {@link PublicationMissing} — checked before `START_REPLICATION` since pgoutput reports it
   *  late (PG18: not at all). One that exists but publishes no tables yet is legal: warns via
   *  `onWarning` and streams. A publication created after the slot may still be invisible to its historical snapshot. */
  publications: string[]
  /** Per-table decode shapes, matched by (schema, table) at relation announce. Declared columns
   *  decode like a `query()` shape spec, keyed by the SHAPE keys (`columns` maps a key to its SQL
   *  column when differing; `unchanged` uses the same keys). Undeclared columns/tables keep default
   *  decoding; `'unknown'` defers to the relation oid. Never silent: unknown column, duplicate mapping, or key collision all throw. Applies to new AND old tuples. */
  shapes?: TableShape[]
  /** LSN to start from; default = the server resumes from the slot's confirmed position. */
  from?: string | bigint
  /** Deliver `pg_logical_emit_message()` events (default true). */
  messages?: boolean
  /** Standby-status heartbeat interval, ms (default 10_000). */
  statusIntervalMs?: number
  /** Fail the stream if no message (including keepalives) arrives for this many ms — a black-holed
   *  TCP connection otherwise parks forever. Off by default; undefined/zero/negative disarm it. The
   *  server's `wal_sender_timeout` (default 60s) pings at half that interval once quiet, but the
   *  client's own status updates (`statusIntervalMs`) postpone it — size well above `wal_sender_timeout` to avoid a false-fire on a healthy idle stream. */
  receiveTimeoutMs?: number
  /** Ceiling on buffered-but-undelivered message bytes before the socket pauses (resumes once the
   *  queue drains below half) — bounds memory when the consumer stops reading. Default 64 MiB;
   *  `Infinity` disables it; zero/negative/non-finite fall back to the default so misconfiguration
   *  can't leave the socket paused forever. Counts each message body only — real retention runs higher. */
  maxQueueBytes?: number
  /** BINARY tuple values (PG14+ pgoutput option). Default `'auto'`: enabled when the server is 14+
   *  AND the driver can binary-decode every published column and shaped target (a pre-start
   *  capability probe). Arrays decode to real JS arrays and `float4` to the exact stored f32;
   *  anything binary can't honor keeps the whole stream on text — auto never crashes. `true` forces
   *  binary and errors loudly naming `table.column`; `false` = text. DDL after start isn't re-probed. */
  binary?: boolean | 'auto'
  /** Fills unchanged TOASTed columns into `new` from a REPLICA IDENTITY FULL old row (default
   *  true). `false` keeps the sparse WAL shape where those columns are ABSENT from `new`;
   *  `unchanged` lists them either way. Only a FULL old row can fill it. */
  hydrateToast?: boolean
  /** When idle with nothing unacked, advance the flushed LSN to the server's keepalive position
   *  so an idle slot doesn't retain WAL forever (default true). */
  idleAck?: boolean
  /** Abort = the consumer's own stop: the iterator finishes cleanly (no throw) and the connection
   *  closes — same as calling `end()` while parked in `next()`. */
  signal?: AbortSignal
  /** Called ONCE when the server accepts `START_REPLICATION` (CopyBothResponse) — the moment the
   *  slot shows active in `pg_stat_activity`. A slot-already-active {@link PgError} fires before
   *  it; a throw from the callback fails the stream's current `next()`. */
  onReady?: () => void
  /** The library's only warning channel — non-fatal conditions detected before the stream begins
   *  and, for event-triggered diagnostics, as the triggering event decodes. Called synchronously,
   *  zero or more times; absent means not delivered. A throw here goes to stderr while the stream
   *  keeps going — unlike `onReady`, whose throw fails the current `next()`; later diagnostics add new `kind` members here. */
  onWarning?: (w: ReplicationWarning) => void
}

/** The SERVER ended the replication stream (`CopyDone`): clean primary shutdown, failover, or a
 *  pooler closing the copy. The consumer must react (re-`start()` or reconnect) — the slot keeps
 *  retaining WAL either way — so this is a THROW, not a clean return (`for await` discards return
 *  values). The connection has finished the `CopyDone` handshake and is reusable for `start()`. */
export class ReplicationStreamEnded extends Error {
  readonly reason = 'copy-done' as const
  constructor() { super('minipg: server ended the replication stream (CopyDone) — start() again or reconnect to resume') }
}

/** A `CommandComplete`/`ReadyForQuery` frame arrived during copy mode without a preceding server
 *  `CopyDone` (`'c'`) — `START_REPLICATION` was accepted but streaming never began. The one known
 *  cause: PostgreSQL BUG #18754 (open PG14-18) — a second `START_REPLICATION` on one walsender
 *  session never re-arms the `streamingDone` flags left set. Unlike {@link ReplicationStreamEnded} (reusable), this connection hits the same bug again — reconnect instead. */
export class ReplicationSessionSpent extends Error {
  readonly reason = 'session-spent' as const
  constructor() { super("minipg: server ended the session without a CopyDone (PostgreSQL BUG #18754 — a second START_REPLICATION on one walsender connection never re-arms streaming) — reconnect rather than calling start() again on this connection") }
}

/** No message — not even a keepalive — arrived for `receiveTimeoutMs`: the connection is presumed
 *  dead. The slot keeps retaining WAL; reconnect and `start()` again, raising `receiveTimeoutMs` if this fires on a healthy link. */
export class ReplicationReceiveTimeout extends Error {
  readonly reason = 'receive-timeout' as const
  constructor(readonly ms: number) { super(`minipg: no message received for ${ms}ms (receiveTimeoutMs) — the connection is presumed dead; reconnect, or raise receiveTimeoutMs relative to the server's wal_sender_timeout`) }
}

// Postgres restricts slot names to [a-z0-9_]{1,63} (ReplicationSlotValidateName) so the name can
// double as a directory name on every OS — rejecting beats escaping (no escape form the walsender grammar accepts).
const SLOT_NAME = /^[a-z0-9_]{1,63}$/

/** A replication slot name outside Postgres's allowed set (`[a-z0-9_]`, 1-63 chars) — rejected
 *  before any `CREATE_REPLICATION_SLOT` / `DROP_REPLICATION_SLOT` / `START_REPLICATION` command is sent. */
export class InvalidSlotName extends Error {
  readonly reason = 'invalid-slot-name' as const
  constructor(readonly slot: string) { super(`minipg: invalid replication slot name ${JSON.stringify(slot)} — Postgres allows only lower-case letters, digits and underscore, 1 to 63 characters`) }
}
const checkSlot = (s: string): string => { if (!SLOT_NAME.test(s)) throw new InvalidSlotName(s); return s }

/** `command()` or a second `start()` was called while a `start()` stream holds the connection. A
 *  `start()` generator reserves the connection from its first `next()` — not merely once the stream
 *  goes live — because a second `start()` or `command()` would drain the same message queue the
 *  reservation's own catalog probes use. Finish the stream or `end()` the connection, then retry. */
export class ReplicationBusy extends Error {
  readonly reason = 'streaming' as const
  constructor() { super('minipg: a start() stream is already active on this connection — finish the stream (break/return the iterator) or end() the connection before another start() or command()') }
}

/** A named publication in `start()`'s publications list does not exist right now — caught by an
 *  unconditional catalog probe before `START_REPLICATION` is sent, since pgoutput itself only
 *  reports this lazily (PG14-17) or not at all (PG18). See {@link StartOptions.publications} for
 *  the historical-snapshot case this probe can't cover. */
export class PublicationMissing extends Error {
  readonly reason = 'publication-missing' as const
  constructor(readonly publications: string[]) {
    super(`minipg: publication ${publications.map((p) => JSON.stringify(p)).join(', ')} does not exist — create it before start(), or remove it from publications`)
  }
}

/** `start({ publications: [] })` — no publication to subscribe. There is no wire form for this:
 *  pgoutput reads an empty `publication_names` list as absent. A publication that EXISTS but
 *  publishes no tables is a different, legal case — it warns (see {@link ReplicationWarning}) and streams. */
export class PublicationEmpty extends Error {
  readonly reason = 'publications-empty' as const
  constructor() { super('minipg: publications is empty — pgoutput needs at least one publication to stream') }
}

/** A `start({ shapes })` entry could not be resolved: a duplicate `schema.table`, a rejected type
 *  or decode target, or a `Collect()` group (can't apply to a single replication row). Thrown
 *  before `CREATE_REPLICATION_SLOT` is sent — a deterministic consumer bug, not one that retries away. */
export class InvalidReplicationShape extends Error {
  readonly reason = 'invalid-shape' as const
  constructor(message: string) { super(message) }
}

/** A non-fatal condition detected before or during the stream — the library's only warning channel
 *  (see {@link StartOptions.onWarning}).
 *  - `publication-empty`: exists but publishes no tables yet, so the stream delivers nothing until
 *    tables are added.
 *  - `replica-identity`: an update/delete arrived without a full old row, so prior state couldn't
 *    be reconstructed — fires per table per stream as the event decodes.
 *  - `partition-relation`: events arrive under a leaf partition's own name since its publication
 *    doesn't set `publish_via_partition_root`, at Relation announce. Warned once per table PER KIND. */
export type ReplicationWarning =
  | { kind: 'publication-empty'; publication: string; message: string }
  | { kind: 'replica-identity'; schema: string; table: string; replicaIdentity: 'd' | 'n' | 'f' | 'i'; message: string }
  | { kind: 'partition-relation'; schema: string; table: string; publication: string; message: string }

/** Open a logical-replication connection (walsender). One purpose per connection: this cannot
 *  run extended-protocol queries — use a normal `connect()` alongside it. */
export async function replication(config: string | ReplicationConfig = {}): Promise<ReplicationConnection> {
  const c = new ReplicationConnection(typeof config === 'string' ? { url: config } : config)
  await c.connect()
  return c
}

// onWarning is diagnostic: a throw from it must not take down the stream it reports on — its own
// failure goes to stderr instead of failing next(). The one thing minipg writes to a process stream.
const deliverWarning = (cb: ((w: ReplicationWarning) => void) | undefined, w: ReplicationWarning): void => {
  if (!cb) return
  try { cb(w) } catch (e) { console.error('minipg: onWarning callback threw', e) }
}

interface RelEntry { info: ReplicationRelation; names: string[]; decoders: CellDecoder[]; bin: (CellDecoder | null)[] | null; key?: string[] } // names[i] = row OUTPUT key for column i (shape key when shaped, else the SQL name)

// Key-column equality for keyChanged: Object.is covers primitives/bigint/same-ref; Date compares by
// getTime(); ArrayBuffer views compare byte-wise. Arrays/json always read as changed — exotic enough as a key that documenting the limitation beats a recursive comparator.
const sameValue = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true
  if (a instanceof Date && b instanceof Date) return Object.is(a.getTime(), b.getTime())
  if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
    const x = new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
    const y = new Uint8Array(b.buffer, b.byteOffset, b.byteLength)
    if (x.length !== y.length) return false
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false
    return true
  }
  return false
}

export class ReplicationConnection {
  private cfg: NormalizedConfig
  private decoders: Map<number, Decoder>
  private socket: Duplex | null = null
  private parser = new Parser()
  private q: RawMessage[] = []
  private wake: (() => void) | null = null
  private err: Error | null = null
  private ended = false
  private scramState?: Scram
  private relations = new Map<number, RelEntry>()
  private shaped = new Map<string, { cols: CodegenCol[]; columns?: Record<string, string>; key?: string[] }>() // '<schema>\0<table>' -> resolved shape for the active start() stream
  private lastReceived = 0n
  private flushed = 0n
  private lastDeliveredEnd = 0n   // highest commit endLsn handed to the consumer (guards idleAck)
  private lastDeliveredStart = 0n // that same commit's lsn — ack() normalizes values inside [start, end)
  private binaryMode = false    // resolved binary decision for the active start() stream
  private hydrateToast = true   // resolved TOAST-fill decision for the active start() stream
  private warn?: (w: ReplicationWarning) => void // onWarning for the active start() stream — cleared in the finally
  private warned = new Set<string>()             // 'kind\0schema\0table' — cleared at the top of start() beside relations.clear()
  private leafPartitions = new Map<string, string>() // 'schema\0table' -> publication, from the pre-start probe; empty when opts.onWarning is absent
  private serverMajor = 0       // from the server_version ParameterStatus at startup
  private lastMessageAt = 0     // stamped on every raw socket read — the receiveTimeoutMs liveness clock
  private qPaused = false       // set by maxQueueBytes backpressure; a paused socket has no liveness signal to offer
  private qBytes = 0            // buffered-but-undelivered message bytes — the maxQueueBytes ceiling
  private maxQueue = Infinity   // resolved from opts.maxQueueBytes at the top of start()
  private streaming = false     // held from the top of an iterated start() until the stream ends — guards command() and a second start() alike
  private copyOpen = false      // true once CopyBothResponse is accepted until a server CopyDone; command() exits copy mode first
  // Held on the instance, not in start()'s frame: only end() can reach a suspended generator's finally to stop these.
  private timers: ReturnType<typeof setInterval>[] = []
  private keepAlive?: boolean | { initialDelayMs?: number }

  constructor(config: ReplicationConfig = {}) {
    const rc = resolveUrl(config)
    // As in Connection: only "no TLS at all" is decidable up front. A custom `socket` owns its TLS and may
    // expose the certificate, so scramForChannel decides that case at auth time.
    if (rc.channelBinding === 'require' && !rc.socket && (!rc.ssl || rc.ssl === 'disable')) {
      throw new Error('minipg: channel_binding=require needs TLS — the binding is a property of the TLS channel. Enable `ssl`, or use `channel_binding=prefer` to connect unbound.')
    }
    const user = rc.user || process.env.PGUSER || process.env.USER || process.env.USERNAME || 'postgres'
    this.decoders = buildDecoders(rc.types, rc.jsonBigints)
    this.keepAlive = rc.keepAlive
    this.cfg = {
      host: rc.host || process.env.PGHOST || 'localhost',
      port: rc.port || Number(process.env.PGPORT) || 5432,
      user,
      password: rc.password ?? process.env.PGPASSWORD ?? '',
      database: rc.database || process.env.PGDATABASE || user,
      ssl: rc.ssl && rc.ssl !== 'disable' ? rc.ssl : false,
      applicationName: rc.applicationName || 'minipg-replication',
      connectTimeout: rc.connectTimeout ?? 30000,
      // startup-packet GUCs — e.g. '-c wal_sender_timeout=10s' bounds a stranded walsender when the
      // consumer dies without end() (serverless eviction); NUL-checked here so it throws at construction
      options: ((o) => { if (o?.includes('\0')) throw new Error('minipg: startup parameter options contains NUL byte (0x00)'); return o })(rc.options),
      channelBinding: rc.channelBinding,
      path: rc.path,
      socket: rc.socket,
      // unused by the transport, present to satisfy NormalizedConfig:
      decoders: this.decoders, prepare: false, binaryParams: false, pipelineDepth: 1, pipelineFlush: 'sync',
      temporal: 'date', reuseBinaryOids: new Set(), reconnect: { enabled: false, base: 0, max: 0, maxRetries: 0 }, plugins: [],
    }
  }

  /** Current stream position (highest LSN seen) and acknowledged position, as `'X/Y'` strings. */
  get lastReceivedLsn(): string { return lsnToString(this.lastReceived) }
  get flushedLsn(): string { return lsnToString(this.flushed) }

  async connect(): Promise<void> {
    const transport = this.cfg.socket ? null : getDefaultTransport()
    if (!this.cfg.socket && !transport) throw new Error('minipg: no transport — import minipg (node) or pass config.socket')
    const ac = new AbortController()
    const timer = setTimeout(() => { ac.abort(); this.fail(new Error(`replication connect timed out after ${this.cfg.connectTimeout}ms`)) }, this.cfg.connectTimeout)
    try {
      this.socket = this.cfg.socket ? (await this.cfg.socket()) as unknown as Duplex : await transport!(this.cfg, ac.signal)
      if (this.keepAlive) {
        const delay = typeof this.keepAlive === 'object' ? this.keepAlive.initialDelayMs ?? 0 : 0
        try { (this.socket as unknown as { setKeepAlive?: (e: boolean, d?: number) => unknown }).setKeepAlive?.(true, delay) } catch { /* */ }
      }
      this.socket.on('data', (d: Buffer) => this.onData(d))
      this.socket.on('error', (e: Error) => this.fail(e))
      this.socket.on('close', () => { if (!this.ended) this.fail(this.err ?? new Error('replication connection closed unexpectedly')) })
      // THE one special startup parameter: replication=database selects the logical walsender
      this.socket.write(W.startup({ user: this.cfg.user, database: this.cfg.database, application_name: this.cfg.applicationName, replication: 'database', options: this.cfg.options }))
      for (;;) {
        const m = await this.next()
        if (!m) throw new Error('minipg: replication connection ended during startup')
        if (m.type === 'R') { this.auth(m.body); continue }
        if (m.type === 'E') throw new PgError(parseErrorFields(m.body))
        if (m.type === 'Z') break // ParameterStatus/BackendKeyData skipped by next()
      }
    } finally { clearTimeout(timer) }
  }

  private auth(body: Buffer): void {
    const code = body.readInt32BE(0)
    const sock = this.socket!
    switch (code) {
      case 0: return
      case 3: sock.write(W.password(this.cfg.password)); return
      case 5: sock.write(W.password(md5Password(this.cfg.user, this.cfg.password, body.subarray(4, 8)))); return
      case 10: { // SASL: channel-bind when the TLS transport exposes the cert and the server offers -PLUS
        this.scramState = scramForChannel(this.cfg.password, parseSaslMechanisms(body), this.cfg.channelBinding ?? 'prefer', peerCertDer(this.socket))
        sock.write(W.saslInitial(this.scramState.mechanism, this.scramState.clientFirst)); return
      }
      case 11: sock.write(W.saslResponse(this.scramState!.continue(body.subarray(4).toString('utf8')))); return
      case 12: this.scramState!.final(body.subarray(4).toString('utf8')); return
      default: throw new Error('unsupported authentication request: ' + code)
    }
  }

  private onData(d: Buffer): void {
    this.lastMessageAt = Date.now() // raw bytes prove liveness even when no full message parsed yet
    let msgs: RawMessage[]
    try { msgs = this.parser.push(Buffer.from(d)) } catch (e) { this.fail(e as Error); return }
    if (msgs.length) {
      this.q.push(...msgs)
      for (const m of msgs) this.qBytes += m.body.length + 5 // +5 = the type byte + int32 length the parser strips
      if (this.qBytes > this.maxQueue && !this.qPaused) {
        this.qPaused = true
        try { (this.socket as unknown as { pause?: () => void } | null)?.pause?.() } catch { /* */ }
      }
    }
    const w = this.wake; this.wake = null; w?.()
  }
  private fail(e: Error): void { this.err ??= e; const w = this.wake; this.wake = null; w?.() }
  private forceResume(): void {
    if (!this.qPaused) return
    this.qPaused = false
    try { (this.socket as unknown as { resume?: () => void } | null)?.resume?.() } catch { /* */ }
  }
  private param(b: Buffer): void { // ParameterStatus: name\0value\0 — we only care about the version
    let z = 0; while (b[z] !== 0) z++
    if (b.toString('latin1', 0, z) !== 'server_version') return
    let e = z + 1; while (b[e] !== 0) e++
    this.serverMajor = parseInt(b.toString('latin1', z + 1, e), 10) || 0
  }
  /** Next protocol message; null once {@link ReplicationConnection.end} was called and the queue
   *  is drained — so a parked consumer finishes deterministically instead of waiting for a keepalive timer over a dead socket. */
  private async next(): Promise<RawMessage | null> {
    for (;;) {
      const m = this.q.shift()
      if (m) {
        this.qBytes -= m.body.length + 5
        if (this.qPaused && this.qBytes < this.maxQueue / 2) this.forceResume()
        if (m.type === 'S') { this.param(m.body); continue } if (m.type === 'K' || m.type === 'N' || m.type === 'A') continue; return m
      }
      if (this.err) throw this.err
      if (this.ended) return null
      await new Promise<void>((r) => { this.wake = r })
    }
  }
  private frame(type: string, payload: Buffer): void {
    const head = Buffer.allocUnsafe(5)
    head.write(type, 0, 'latin1'); head.writeInt32BE(payload.length + 4, 1)
    this.socket?.write(Buffer.concat([head, payload]))
  }

  // A consumer that stops reading without a server CopyDone leaves the walsender thinking copy
  // mode is still open — exit it lazily here, right before the next command, so ack()-after-break still works.
  private async exitCopyModeIfOpen(): Promise<void> {
    if (!this.copyOpen) return
    this.copyOpen = false
    try {
      this.frame('c', Buffer.alloc(0))
      for (;;) { const n = await this.next(); if (!n || n.type === 'Z') break }
    } catch { /* connection unusable — the command below surfaces the failure */ }
  }

  /** Simple-protocol command: the walsender grammar (`IDENTIFY_SYSTEM`, `CREATE_REPLICATION_SLOT`, …)
   *  or plain SQL — the logical walsender accepts both. Rows come back as text. */
  async command(sql: string): Promise<{ columns: string[]; rows: (string | null)[][] }> {
    if (this.streaming) throw new ReplicationBusy()
    return this.run(sql)
  }

  // guard-free body of command(): used above, and by start()'s own pre-stream probes once
  // start() already holds the reservation those probes run under.
  private async run(sql: string): Promise<{ columns: string[]; rows: (string | null)[][] }> {
    await this.exitCopyModeIfOpen()
    this.frame('Q', Buffer.from(sql + '\0', 'utf8'))
    let columns: string[] = []
    const rows: (string | null)[][] = []
    let err: Error | null = null
    for (;;) {
      const m = await this.next()
      if (!m) throw new Error('minipg: replication connection ended')
      if (m.type === 'T') columns = parseRowDescription(m.body).map((f) => f.name)
      else if (m.type === 'D') rows.push(parseDataRow(m.body).map((c) => (c === null ? null : c.toString('utf8'))))
      else if (m.type === 'E') err = new PgError(parseErrorFields(m.body))
      else if (m.type === 'Z') break
      else if (m.type === 'W') { this.q.unshift(m); this.qBytes += m.body.length + 5; break } // CopyBothResponse — streaming begins
    }
    if (err) throw err
    return { columns, rows }
  }

  async identify(): Promise<{ systemId: string; timeline: number; xlogpos: string; dbname: string | null }> {
    const r = await this.command('IDENTIFY_SYSTEM')
    const row = Object.fromEntries(r.columns.map((c, i) => [c, r.rows[0]![i]]))
    return { systemId: row.systemid as string, timeline: Number(row.timeline), xlogpos: row.xlogpos as string, dbname: (row.dbname as string | null) ?? null }
  }

  /** Create a logical slot (pgoutput). `snapshot: 'export'` returns a snapshot name a normal
   *  connection can pin for a GAPLESS backfill (valid only until this connection's next command).
   *  Uses the legacy keyword syntax (PG 10-17). `'export'` always yields a snapshot name;
   *  `'nothing'`/omitted always yields null. */
  async createSlot(name: string, opts: { temporary?: boolean; snapshot: 'export' }): Promise<{ slot: string; consistentPoint: string; snapshot: string }>
  async createSlot(name: string, opts?: { temporary?: boolean; snapshot?: 'nothing' }): Promise<{ slot: string; consistentPoint: string; snapshot: null }>
  async createSlot(name: string, opts: { temporary?: boolean; snapshot?: 'export' | 'nothing' } = {}): Promise<{ slot: string; consistentPoint: string; snapshot: string | null }> {
    checkSlot(name)
    const snap = opts.snapshot === 'export' ? 'EXPORT_SNAPSHOT' : 'NOEXPORT_SNAPSHOT'
    const r = await this.command(`CREATE_REPLICATION_SLOT ${name}${opts.temporary ? ' TEMPORARY' : ''} LOGICAL pgoutput ${snap}`)
    const row = Object.fromEntries(r.columns.map((c, i) => [c, r.rows[0]![i]]))
    return { slot: row.slot_name as string, consistentPoint: row.consistent_point as string, snapshot: (row.snapshot_name as string | null) ?? null }
  }

  async dropSlot(name: string, opts: { wait?: boolean } = {}): Promise<void> {
    checkSlot(name)
    await this.command(`DROP_REPLICATION_SLOT ${name}${opts.wait ? ' WAIT' : ''}`)
  }

  /** Consumer acknowledgement: everything <= the value is durably processed — ack a commit's
   *  `endLsn`. Forgiving: a value inside the LAST delivered commit's record (`[lsn, endLsn)`) counts
   *  as that commit's `endLsn`, so acking `e.lsn` by mistake still fully acks a sequential stream.
   *  Advances the slot's `confirmed_flush` (releases WAL) on the next status message. */
  ack(lsn: string | bigint): void {
    let v = toLsn(lsn)
    if (v >= this.lastDeliveredStart && v < this.lastDeliveredEnd) v = this.lastDeliveredEnd
    if (v > this.flushed) { this.flushed = v; this.sendStatus() }
  }

  /** `START_REPLICATION`: an async stream of decoded {@link ReplicationEvent}s (proto v1 + messages).
   *  Tuple values decode via the driver's text decoder catalog (`config.types` honored).
   *  At-least-once: unacked events replay after a reconnect — dedupe by commit LSN. */
  /** Whether the ACTIVE `start()` stream negotiated binary tuples (resolved `'auto'` included). */
  get binaryTuples(): boolean { return this.binaryMode }

  async *start(opts: StartOptions): AsyncGenerator<ReplicationEvent> {
    // Reserved before the first await, since a generator's body runs synchronously up to that
    // point. The guard stays outside the try below — a rejected second caller must never reach the finally, or it'd release the first caller's reservation.
    if (this.streaming) throw new ReplicationBusy()
    this.streaming = true
    const onAbort = (): void => this.end()
    try {
      checkSlot(opts.slot) // lazy by construction: an async generator's body runs on the first next(), so nothing is sent before this
      if (opts.signal?.aborted) return
      const from = opts.from !== undefined ? toLsn(opts.from) : 0n
      // publication_names is a comma-separated identifier list inside a single-quoted walsender
      // option literal, so each name is escaped twice — once for the identifier, once for the literal it rides in.
      const pubs = opts.publications.map((p) => `"${p.replace(/"/g, '""')}"`).join(',').replace(/'/g, "''")
      this.shaped.clear()
      this.relations.clear() // relations re-announce per stream; stale entries would carry the previous stream's shapes
      this.warned.clear() // per-stream warning dedupe; a re-start() after a reconnect warns again
      for (const s of opts.shapes ?? []) {
        const schema = s.schema ?? 'public'
        if (this.shaped.has(schema + '\0' + s.table)) throw new InvalidReplicationShape(`minipg: duplicate replication shape for ${schema}.${s.table}`)
        // shapeCols() is shared with plain query .shape(), where a bare Error is correct — re-thrown
        // here as InvalidReplicationShape so only the replication path gets cdc.ts's isPermanentFailure() classification.
        let cols: CodegenCol[]
        try { cols = shapeCols(s.shape) } catch (e) { throw e instanceof Error ? new InvalidReplicationShape(e.message) : e } // resolves + validates specs NOW (unknown types/targets fail before streaming)
        for (const c of cols) if (c.path) throw new InvalidReplicationShape(`minipg: replication shape for ${schema}.${s.table}: Collect() groups several result columns and can't apply to a replication row (group ${JSON.stringify(c.path[0])})`)
        const keys = new Set(cols.map((c) => c.name))
        for (const k of Object.keys(s.columns ?? {})) if (!keys.has(k)) throw new Error(`minipg: replication shape for ${schema}.${s.table}: columns maps ${JSON.stringify(k)} but the shape has no such key`)
        if (s.key && s.key.length === 0) throw new Error(`minipg: replication shape for ${schema}.${s.table}: key is an empty array — declare at least one shape key or omit key`)
        for (const k of s.key ?? []) if (!keys.has(k)) throw new Error(`minipg: replication shape for ${schema}.${s.table}: key lists ${JSON.stringify(k)} but the shape has no such key`)
        this.shaped.set(schema + '\0' + s.table, { cols, columns: s.columns, key: s.key })
      }
      // Unconditional catalog probe — pgoutput itself only reports a missing publication lazily or
      // not at all on PG18; see PublicationMissing. Uses run(): start() already holds the reservation.
      if (opts.publications.length === 0) throw new PublicationEmpty()
      const pubLits = opts.publications.map((p) => `'${p.replace(/'/g, "''")}'`).join(',')
      const pubProbe = await this.run(
        'select n.name, p.oid is not null as present, coalesce(t.cnt, 0)::text'
        + ` from unnest(array[${pubLits}]::text[]) as n(name)`
        + ' left join pg_publication p on p.pubname = n.name'
        + ' left join (select pubname, count(*)::int as cnt from pg_publication_tables group by 1) t on t.pubname = n.name')
      const missingPubs: string[] = []
      for (const row of pubProbe.rows) {
        const [name, present, tables] = row as [string, string, string]
        if (present !== 't') { missingPubs.push(name); continue }
        // legal and worth streaming: FOR ALL TABLES over a database with no tables yet, or a
        // publication whose tables are added after start() — those changes reach the stream
        if (tables === '0') deliverWarning(opts.onWarning, { kind: 'publication-empty', publication: name, message: `minipg: publication ${JSON.stringify(name)} exists but publishes no tables — the stream will start but deliver nothing until it does` })
      }
      if (missingPubs.length) throw new PublicationMissing(missingPubs)
      // Leaf-partition detection for the partition-relation warning — skipped when nobody passed
      // onWarning (no round trip for a consumer who never asked). Uses run(): reservation already held.
      const leaves = new Map<string, string>()
      if (opts.onWarning) {
        const leafProbe = await this.run(
          'select distinct pt.schemaname, pt.tablename, p.pubname'
          + ' from pg_publication p'
          + ' join pg_publication_tables pt on pt.pubname = p.pubname'
          + ' join pg_namespace n on n.nspname = pt.schemaname'
          + ' join pg_class c on c.relnamespace = n.oid and c.relname = pt.tablename'
          + ` where not p.pubviaroot and c.relispartition and p.pubname in (${pubLits})`)
        for (const row of leafProbe.rows) {
          const [schema, table, pub] = row as [string, string, string]
          leaves.set(schema + '\0' + table, pub)
        }
      }
      this.leafPartitions = leaves
      const want = opts.binary ?? 'auto'
      let bin = want === true
      if (want === 'auto' && this.serverMajor >= 14) {
        const lits = opts.publications.map((p) => `'${p.replace(/'/g, "''")}'`).join(',')
        const probe = await this.run(
          'select distinct a.atttypid from pg_publication_tables pt'
          + ' join pg_namespace n on n.nspname = pt.schemaname'
          + ' join pg_class c on c.relnamespace = n.oid and c.relname = pt.tablename'
          + ' join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped'
          + ` where pt.pubname in (${lits})`)
        // Capability gate, nothing more: every published AND shaped column must have a binary
        // decoder (unknown-typed shape cols defer to the relation default). One undecodable column keeps the whole stream text.
        bin = probe.rows.length > 0
          && probe.rows.every((r) => replBinaryFor(Number(r[0]), this.decoders) !== null)
          && [...this.shaped.values()].every(({ cols }) => cols.every((c) => c.oid === 0 || replBinaryForCol(c, this.decoders) !== null))
      }
      this.binaryMode = bin
      this.hydrateToast = opts.hydrateToast !== false
      this.warn = opts.onWarning
      // As late as possible, once nothing above can still throw — an abort listener from a failed
      // start() would end a connection the consumer goes on to re-start(), and a stale ceiling would govern plain command() traffic.
      if (opts.signal?.aborted) return
      const mqb = opts.maxQueueBytes ?? 64 * 1024 * 1024
      this.maxQueue = Number.isFinite(mqb) && mqb > 0 ? mqb : mqb === Infinity ? Infinity : 64 * 1024 * 1024
      opts.signal?.addEventListener('abort', onAbort, { once: true })
      const sql = `START_REPLICATION SLOT ${opts.slot} LOGICAL ${lsnToString(from)} (proto_version '1', publication_names '${pubs}'${opts.messages === false ? '' : ", messages 'true'"}${bin ? ", binary 'true'" : ''})`
      this.frame('Q', Buffer.from(sql + '\0', 'utf8'))
      let setupErr: PgError | null = null
      for (;;) {
        const m = await this.next()
        if (!m) return // end()/abort during setup — clean finish
        // Copy mode is open from the moment the server says so — a throw out of onReady() below
        // must not leave the driver believing otherwise, or the next command() desyncs the connection with a plain 'Q'.
        if (m.type === 'W') { this.copyOpen = true; break }
        // Simple-protocol errors are always followed by ReadyForQuery — drain to 'Z' before
        // throwing, or the connection's next command() reads this rejection's leftover 'Z' instead of its own results.
        if (m.type === 'E') { setupErr = new PgError(parseErrorFields(m.body)); continue }
        if (m.type === 'Z') { throw setupErr ?? new Error('minipg: START_REPLICATION returned no CopyBothResponse') }
      }
      // START_REPLICATION accepted (CopyBothResponse): the slot is active server-side NOW — the
      // "streaming established" moment start()'s laziness hides; onReady()'s throw fails this next() like any stream error.
      opts.onReady?.()
      const idleAck = opts.idleAck !== false
      this.timers.push(setInterval(() => this.sendStatus(), opts.statusIntervalMs ?? 10_000))
      this.lastMessageAt = Date.now()
      const recvMs = opts.receiveTimeoutMs ?? 0
      if (recvMs > 0) this.timers.push(setInterval(() => {
        if (this.qPaused) { this.lastMessageAt = Date.now(); return } // a paused socket has no liveness signal to offer
        if (Date.now() - this.lastMessageAt >= recvMs) this.fail(new ReplicationReceiveTimeout(recvMs))
      }, Math.max(250, Math.min(recvMs / 2, 5_000))))
      for (;;) {
        const m = await this.next()
        if (!m) return // end()/abort — the consumer's own stop: clean finish through the finally
        if (m.type === 'E') throw new PgError(parseErrorFields(m.body))
        if (m.type === 'c') { // SERVER CopyDone (shutdown/failover): handshake out of copy mode, then THROW — a clean return must stay reserved for the consumer's own stop
          this.copyOpen = false
          try {
            this.frame('c', Buffer.alloc(0))
            for (;;) { const n = await this.next(); if (!n || n.type === 'Z') break } // CommandComplete etc. skipped
          } catch { /* connection died mid-handshake — the stream ending is still the story */ }
          throw new ReplicationStreamEnded()
        }
        if (m.type === 'C' || m.type === 'Z') { // simple-query reply mid-copy with no server CopyDone — see ReplicationSessionSpent
          this.copyOpen = false
          if (m.type === 'C') { for (;;) { const n = await this.next(); if (!n || n.type === 'Z') break } } // drain to ReadyForQuery
          throw new ReplicationSessionSpent()
        }
        if (m.type !== 'd') continue
        const p = m.body
        if (p[0] === 0x6b) { // 'k' keepalive: walEnd, clock, replyRequested
          const walEnd = p.readBigUInt64BE(1)
          if (walEnd > this.lastReceived) this.lastReceived = walEnd
          // nothing unacked -> let the idle slot's confirmed position follow the server
          if (idleAck && this.flushed >= this.lastDeliveredEnd && walEnd > this.flushed) this.flushed = walEnd
          if (p[17] === 1) this.sendStatus()
          continue
        }
        if (p[0] !== 0x77) continue // not XLogData
        const walStart = p.readBigUInt64BE(1)
        if (walStart > this.lastReceived) this.lastReceived = walStart
        const e = this.decode(p.subarray(25)) // 'w' + 3x int64 header
        if (e) {
          if (e.kind === 'commit') { const end = lsnFromString(e.endLsn); if (end > this.lastDeliveredEnd) { this.lastDeliveredStart = lsnFromString(e.lsn); this.lastDeliveredEnd = end } }
          yield e
        }
      }
    } finally {
      this.streaming = false
      // Every stream entry assigns this.warn before any decode runs, so a stale callback never
      // fires — clearing here just releases the finished consumer's closure instead of retaining it.
      this.warn = undefined
      this.forceResume()
      this.maxQueue = Infinity
      // Recount rather than zero: a consumer that stopped mid-stream leaves undelivered frames
      // queued, and next() still subtracts their bytes as they drain — zeroing here would go negative.
      this.qBytes = this.q.reduce((n, m) => n + m.body.length + 5, 0)
      this.clearTimers()
      opts.signal?.removeEventListener('abort', onAbort)
    }
  }

  private sendStatus(): void {
    const b = Buffer.allocUnsafe(1 + 8 * 4 + 1)
    b.write('r', 0, 'latin1')
    b.writeBigUInt64BE(this.lastReceived, 1)
    b.writeBigUInt64BE(this.flushed, 9)  // <- the ack: confirmed_flush advances to this
    b.writeBigUInt64BE(this.flushed, 17)
    b.writeBigUInt64BE(BigInt(Date.now()) * 1000n - PG_EPOCH_US, 25)
    b[33] = 0
    try { this.frame('d', b) } catch { /* socket gone; the stream loop surfaces it */ }
  }

  // ---- pgoutput (proto v1 + messages) ----
  private decode(b: Buffer): ReplicationEvent | null {
    const tag = String.fromCharCode(b[0]!)
    let off = 1
    const cstr = (): string => { let e = off; while (b[e] !== 0) e++; const s = b.toString('utf8', off, e); off = e + 1; return s }
    const ts = (us: bigint): Date => new Date(Number((us + PG_EPOCH_US) / 1000n))
    const tsUs = (us: bigint): number => Number(us + PG_EPOCH_US)
    const tuple = (rel: RelEntry): { row: Row; unchanged: string[] } => {
      const n = b.readInt16BE(off); off += 2
      const row: Row = {}
      const unchanged: string[] = []
      for (let i = 0; i < n; i++) {
        const name = rel.names[i] ?? String(i)
        const k = b[off]!; off += 1
        if (k === 0x6e) row[name] = null                                  // 'n' NULL
        else if (k === 0x75) unchanged.push(name)                         // 'u' unchanged TOAST — absent, NOT null
        else {
          const len = b.readInt32BE(off); off += 4
          if (k === 0x62) { // 'b' binary (start({ binary: true }))
            const bd = rel.bin?.[i]
            if (!bd) throw new Error(`minipg: binary tuple value for ${rel.info.schema}.${rel.info.table}.${name} (oid ${rel.info.columns[i]?.oid}) has no binary decoder for its declared/default decode — start() without binary:true, use a binary-capable shape target, or override config.types for this type`)
            row[name] = bd(b, off, len)
          } else { // 't' text
            const dec = rel.decoders[i]
            row[name] = dec ? dec(b, off, len) : b.toString('utf8', off, off + len)
          }
          off += len
        }
      }
      return { row, unchanged }
    }
    const rel = (id: number): RelEntry => {
      const r = this.relations.get(id)
      if (!r) throw new Error(`minipg: unannounced relation ${id} — no Relation message was received for it (protocol desync)`)
      return r
    }
    switch (tag) {
      case 'B': return { kind: 'begin', finalLsn: lsnToString(b.readBigUInt64BE(1)), commitTime: ts(b.readBigUInt64BE(9) ), commitTimeUs: tsUs(b.readBigUInt64BE(9)), xid: b.readInt32BE(17) }
      case 'C': return { kind: 'commit', lsn: lsnToString(b.readBigUInt64BE(2)), endLsn: lsnToString(b.readBigUInt64BE(10)), commitTime: ts(b.readBigUInt64BE(18)), commitTimeUs: tsUs(b.readBigUInt64BE(18)) }
      case 'R': {
        const id = b.readInt32BE(off); off += 4
        const schema = cstr(), table = cstr()
        const replicaIdentity = String.fromCharCode(b[off]!) as ReplicationRelation['replicaIdentity']; off += 1
        const n = b.readInt16BE(off); off += 2
        const columns: ReplicationRelation['columns'] = []
        for (let i = 0; i < n; i++) { const key = b[off]! === 1; off += 1; const cname = cstr(); const oid = b.readInt32BE(off); off += 8; columns.push({ name: cname, oid, key }) }
        const info: ReplicationRelation = { schema, table, replicaIdentity, columns }
        this.relations.set(id, this.relEntry(info))
        this.warnPartition(schema, table)
        return { kind: 'relation', relation: info }
      }
      case 'I': { const r = rel(b.readInt32BE(off)); off += 5; const t = tuple(r); return { kind: 'insert', schema: r.info.schema, table: r.info.table, new: t.row } }
      case 'U': {
        const r = rel(b.readInt32BE(off)); off += 4
        let old: Row | null = null, oldKind: 'key' | 'full' | null = null
        let k = String.fromCharCode(b[off]!); off += 1
        if (k === 'K' || k === 'O') { oldKind = k === 'K' ? 'key' : 'full'; old = tuple(r).row; k = String.fromCharCode(b[off]!); off += 1 }
        if (oldKind !== 'full') this.warnIdentity(r, 'update')
        const t = tuple(r) // k === 'N'
        // TOAST fill: an unmodified TOASTed value is omitted from the new tuple ('u'), but with FULL
        // the same value is in the old tuple — copy it over. `unchanged` still lists filled columns, so consumers can tell retransmitted from filled.
        if (this.hydrateToast && old && oldKind === 'full') for (const name of t.unchanged) if (name in old) t.row[name] = old[name]
        // keyChanged: 'key' means the identity key changed (its presence IS the signal — it's
        // NULL-padded outside the identity). Under 'full', compare declared key columns, treating `unchanged` names as equal without reading t.row (hydrateToast must not change the answer).
        let keyChanged: boolean | undefined
        if (r.key) keyChanged = oldKind === 'key' ? true : oldKind === null ? false
          : r.key.some((name) => !t.unchanged.includes(name) && !sameValue(old![name], t.row[name]))
        const base = { kind: 'update' as const, schema: r.info.schema, table: r.info.table, new: t.row, unchanged: t.unchanged, ...(r.key ? { keyChanged } : {}) }
        return old ? { ...base, old, oldKind: oldKind as 'key' | 'full' } : { ...base, old: null, oldKind: null }
      }
      case 'D': {
        const r = rel(b.readInt32BE(off)); off += 4
        const k = String.fromCharCode(b[off]!); off += 1
        const oldKind = k === 'K' ? 'key' : 'full'
        if (oldKind !== 'full') this.warnIdentity(r, 'delete')
        return { kind: 'delete', schema: r.info.schema, table: r.info.table, old: tuple(r).row, oldKind }
      }
      case 'T': {
        const n = b.readInt32BE(off); off += 4
        const flags = b[off]!; off += 1
        const tables: { schema: string; table: string }[] = []
        for (let i = 0; i < n; i++) { const r = rel(b.readInt32BE(off)); off += 4; tables.push({ schema: r.info.schema, table: r.info.table }) }
        return { kind: 'truncate', tables, cascade: (flags & 1) !== 0, restartIdentity: (flags & 2) !== 0 }
      }
      case 'M': {
        const transactional = b[off]! === 1; off += 1
        const lsn = lsnToString(b.readBigUInt64BE(off)); off += 8
        const prefix = cstr()
        const len = b.readInt32BE(off); off += 4
        return { kind: 'message', transactional, prefix, content: Buffer.from(b.subarray(off, off + len)), lsn }
      }
      case 'O': case 'Y': return null // origin / type metadata — not surfaced
      default: throw new Error(`minipg: unknown pgoutput message '${tag}'`)
    }
  }

  // 'n' (NOTHING) is unreachable here — a publication rejects updates/deletes on a table with no
  // replica identity — but the type still allows it, so the message names it for completeness.
  private warnIdentity(r: RelEntry, ctx: 'update' | 'delete'): void {
    if (!this.warn) return
    const { schema, table, replicaIdentity } = r.info
    const key = 'replica-identity\0' + schema + '\0' + table
    if (this.warned.has(key)) return
    this.warned.add(key)
    const detail = ctx === 'update'
      ? 'the old row is absent or carries only identity-key columns (non-key columns read null meaning not-carried), and unchanged TOASTed columns cannot be filled into new'
      : 'the old row carries only the identity key'
    deliverWarning(this.warn, {
      kind: 'replica-identity', schema, table, replicaIdentity,
      message: `minipg: ${schema}.${table} ${ctx} arrived without a full old row (replica identity '${replicaIdentity}') — ${detail}; set REPLICA IDENTITY FULL to receive the full old row`,
    })
  }

  // Delivered at the Relation announce, not start(): Relation messages are lazy (only relations
  // that produce a change get announced), so this never false-positives on an idle partition or floods a FOR ALL TABLES publication.
  private warnPartition(schema: string, table: string): void {
    if (!this.warn) return
    const pub = this.leafPartitions.get(schema + '\0' + table)
    if (pub === undefined) return
    const key = 'partition-relation\0' + schema + '\0' + table
    if (this.warned.has(key)) return
    this.warned.add(key)
    deliverWarning(this.warn, {
      kind: 'partition-relation', schema, table, publication: pub,
      message: `minipg: ${schema}.${table} events arrive under the partition's own name because publication ${JSON.stringify(pub)} does not set publish_via_partition_root — create it with publish_via_partition_root = true to receive events under the root's name`,
    })
  }

  /** Per-column decoders + output keys for an announced relation. Shape-declared columns decode via
   *  their declared spec — same resolution as a `query() { shape }` — keyed by the SHAPE key
   *  ({@link TableShape.columns} maps key -> SQL column when they differ); the rest via {@link pickDecoder}'s defaults. */
  private relEntry(info: ReplicationRelation): RelEntry {
    const shape = this.shaped.get(info.schema + '\0' + info.table)
    const names = info.columns.map((c) => c.name)
    const bySql = new Map<string, CodegenCol>() // SQL column name -> shape col (the OUTPUT key rides in col.name)
    if (shape) {
      for (const sc of shape.cols) {
        const sql = shape.columns?.[sc.name] ?? sc.name
        const i = info.columns.findIndex((c) => c.name === sql)
        if (i < 0) throw new Error(`minipg: replication shape for ${info.schema}.${info.table} declares column ${JSON.stringify(sc.name)}${sql !== sc.name ? ` (-> ${JSON.stringify(sql)})` : ''} but the relation has: ${info.columns.map((c) => c.name).join(', ')}`)
        const prev = bySql.get(sql)
        if (prev) throw new Error(`minipg: replication shape for ${info.schema}.${info.table}: ${JSON.stringify(prev.name)} and ${JSON.stringify(sc.name)} both map to column ${JSON.stringify(sql)}`)
        bySql.set(sql, sc)
        names[i] = sc.name
      }
      const dup = names.find((n, i) => names.indexOf(n) !== i)
      if (dup !== undefined) throw new Error(`minipg: replication shape for ${info.schema}.${info.table}: output key ${JSON.stringify(dup)} collides with another column — map one of them via columns`)
    }
    const xf = (d: CellDecoder, f: (v: unknown) => unknown): CellDecoder => (b, o, l) => f(d(b, o, l))
    const decoders = info.columns.map((c) => {
      const sc = bySql.get(c.name)
      // tagArrayCol: a built-in array OID decodes '{…}' to a JS array, exactly as a plain query() does
      // (and as the binary tuple path already does via array_recv) — no-op on already-tagged shape cols.
      if (!sc) return pickDecoder(tagArrayCol({ name: c.name, oid: c.oid }), this.decoders)
      // oid 0 = 'unknown': defer to the live relation oid. format:'binary' is a QUERY wire
      // request (BINARY_FAST auto-request in resolveLeaf) — these tuple values arrive as text.
      const d = pickDecoder(tagArrayCol({ ...sc, oid: sc.oid === 0 ? c.oid : sc.oid, format: undefined }), this.decoders)
      return sc.xform ? xf(d, sc.xform) : d
    })
    const bin = this.binaryMode ? info.columns.map((c) => {
      const sc = bySql.get(c.name)
      if (!sc) return replBinaryFor(c.oid, this.decoders)
      const d = sc.oid === 0 && !sc.json ? replBinaryFor(c.oid, this.decoders) : replBinaryForCol(sc, this.decoders)
      return d && sc.xform ? xf(d, sc.xform) : d
    }) : null
    if (bin) {
      const i = bin.findIndex((d) => d === null)
      if (i >= 0) throw new Error(`minipg: binary tuple value for ${info.schema}.${info.table}.${names[i]} (oid ${info.columns[i]?.oid}) has no binary decoder for its declared/default decode — start() without binary:true, use a binary-capable shape target, or override config.types for this type`)
    }
    return { info, names, decoders, bin, key: shape?.key }
  }

  private clearTimers(): void { for (const t of this.timers) clearInterval(t); this.timers.length = 0 }

  end(): void {
    this.ended = true
    this.clearTimers()
    this.forceResume() // a paused socket left paused after the stream ends would never drain
    try { this.socket?.write(W.terminate()) } catch { /* */ }
    try { this.socket?.end() } catch { /* */ }
    const w = this.wake; this.wake = null; w?.() // wake a parked next() so an in-flight start() iterator finishes NOW
  }
}

/** `done:false` carries no commit fields — reading them requires narrowing to `done:true`, so a
 *  mid-transaction ack is a compile error rather than a runtime mistake. */
export type TransactionBatch =
  | { xid: number; events: ReplicationEvent[]; done: false }
  | {
      xid: number; events: ReplicationEvent[]; done: true
      commitLsn: string; endLsn: string; commitTime: Date; commitTimeUs: number
    }

/** The flat event stream -> per-transaction {@link TransactionBatch}es. begin/commit are consumed
 *  onto the envelope (never placed in `events[]`); commit fields land only on the `done:true`
 *  chunk. A throw mid-transaction discards buffered events, so nothing partial is ackable.
 *
 *  A non-transactional `pg_logical_emit_message` arrives outside any begin/commit pair, so there
 *  is no batch to hold it and it is DROPPED; a transactional one stays in `events[]`.
 *  `maxQueueBytes` bounds the socket's undelivered queue, NOT the assembled batch, so it is not
 *  batch memory safety. Unbounded unless `opts.maxEvents` is set, which chunks an oversized
 *  transaction into `done:false` pieces then a final `done:true` chunk carrying the commit fields
 *  — a transaction that is an exact multiple of `maxEvents` still ends in an empty `done:true` chunk to deliver them. */
export async function* batchTransactions(
  stream: AsyncIterable<ReplicationEvent>,
  opts: { maxEvents?: number } = {},
): AsyncGenerator<TransactionBatch> {
  const max = opts.maxEvents && opts.maxEvents > 0 ? opts.maxEvents : Infinity
  let xid = 0
  let events: ReplicationEvent[] = []
  for await (const e of stream) {
    if (e.kind === 'begin') { xid = e.xid; events = []; continue }
    if (e.kind === 'commit') {
      yield { xid, events, done: true, commitLsn: e.lsn, endLsn: e.endLsn, commitTime: e.commitTime, commitTimeUs: e.commitTimeUs }
      events = []
      continue
    }
    if (e.kind === 'message' && !e.transactional) continue // arrives outside any begin/commit — no batch to hold it
    events.push(e)
    if (events.length >= max) { yield { xid, events, done: false }; events = [] }
  }
}
