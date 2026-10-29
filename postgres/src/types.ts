import type * as tls from 'node:tls'
/** The STRUCTURAL surface Drizzle Postgres needs from a custom `socket` — node's Duplex satisfies it, so a
 *  node stream passes unchanged; other runtimes implement it directly (no `as unknown as` casts).
 *  Required: the event trio + write + end (all a replication connection touches). Optional methods
 *  unlock specific features and degrade loudly, not silently, when absent: `once`/`off` — COPY FROM
 *  drain backpressure; `pause`/`resume` — cursor/stream/copyTo memory bounds (without them the
 *  socket keeps pushing and buffers grow unboundedly); `destroy` — hard teardown on cancel;
 *  `setKeepAlive` — TCP liveness probes for replication; a transport without it silently skips. */
export interface PostgresSocket {
  on(event: 'data', listener: (chunk: Buffer | Uint8Array) => void): unknown
  on(event: 'error', listener: (err: Error) => void): unknown
  on(event: 'close', listener: () => void): unknown
  write(data: Uint8Array): boolean | void
  end(cb?: () => void): unknown
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural boundary: node's typed-overload once/off must remain assignable
  once?(event: string, listener: (...args: any[]) => void): unknown
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off?(event: string, listener: (...args: any[]) => void): unknown
  pause?(): unknown
  resume?(): unknown
  destroy?(err?: Error): unknown
  setKeepAlive?(enable: boolean, initialDelayMs?: number): unknown
}

/** How a connection dials the server and cancels a running query. `connect` resolves to a connected,
 *  TLS-negotiated socket. `cancel` sends an out-of-band CancelRequest and resolves once the server has
 *  closed that connection; without `cancel`, a canceled query falls back to closing its socket. */
export interface Transport {
  connect(config: TransportTarget, signal: AbortSignal): Promise<PostgresSocket>
  cancel?(config: TransportTarget, key: { pid: number; secret: number }): Promise<void>
}
/** The connection settings that a transport reads, after the URL and the defaults apply. */
export type TransportTarget = Pick<NormalizedConfig, 'host' | 'port' | 'path' | 'ssl' | 'connectTimeout'>
import type { NormalizedConfig } from './connection.ts'
import type { Plugin, QueryMetrics } from './plugin.ts'
import type { ShapeSpec, ParamType } from './spec.ts'
import type { ShapeMapper } from './shape.ts'

/** Row-shape of a query result. */
/** 'wire' returns the statement's raw backend messages (Uint8Array[]) — the answer to "what did this
 *  statement return": {T,D,C,E,I} with framing intact, protocol acks (1/2/3/t), the nondeterministic
 *  'n', and connection-level events (Z/S/N/A/K) excluded. Entries are CONTIGUOUS RUNS of messages
 *  (concatenate for the stream) — entry count scales with socket chunks, never with rows. Resolves
 *  even when the statement FAILED (the E frame is in the array); only connection-level failures reject. */
export type ResultMode = 'array' | 'object' | 'buffer' | 'raw' | 'wire'

/** Decodes the raw text-format bytes of a single field into a JS value. */
export type Decoder = (buf: Buffer) => unknown

export interface Field {
  name: string
  tableOid: number
  columnId: number
  dataTypeOid: number
  dataTypeSize: number
  typeModifier: number
  format: number
}

export interface QueryResult<Row = unknown[]> {
  rows: Row[]
  columns: string[]
  rowCount: number | null
  command: string | null
  /** Per-query timings + sizes, present only when the query opted in with `{ metrics: true }`. */
  metrics?: QueryMetrics
  /** The resolved decode plan, present only when the query opted in with `{ debug: true }`. */
  debug?: QueryDebug
}

/** How a query's result was decoded — surfaced by `{ debug: true }` for inspection/tuning. */
export interface QueryDebug {
  sql: string
  mode: ResultMode
  /** Server-side prepared-statement name (undefined = unnamed / simple execution). */
  statementName?: string
  /** True if this reused a cached prepared statement (Parse skipped — 2nd+ execution). */
  reusedPreparedStatement: boolean
  /** True if this statement name was cached bound to DIFFERENT SQL, so the old prepared statement was
   *  deallocated and re-Parsed. Reusing one name for alternating SQL re-Parses on every switch (a footgun —
   *  prefer one name per distinct SQL). */
  repreparedSqlChanged?: boolean
  /** Which row mapper ran: 'jit' (compiled per-shape function), 'interpreted' (per-column loop, no eval),
   *  or 'none' (buffer/raw modes return undecoded cells). */
  decode: 'jit' | 'interpreted' | 'none'
  /** The generated JIT mapper source (only when `decode === 'jit'`). */
  mapperSource?: string
  /** The resolved column plan: wire OID + the format we requested + any JS-target/JSON override. */
  columns: Array<{ name: string; oid: number; format: 'text' | 'binary'; js?: string; json?: boolean }>
  /** Transparent auto-retries performed on this query (absent if the first attempt succeeded). A prepared
   *  statement invalidated by DDL (SQLSTATE 0A000 "cached plan must not change result type" / 26000
   *  "prepared statement does not exist") is Close+re-Parsed and re-run once — safe because both are raised
   *  before execution, so no rows were affected. */
  retries?: number
  /** SQLSTATE codes of the swallowed attempts that triggered a retry, e.g. `['0A000']`. */
  retriedErrors?: string[]
}

export interface ConnectConfig {
  /** A `postgres://user:pass@host:port/db?sslmode=…` connection string. Its values are used as defaults;
   *  any explicit field below overrides the matching part of the URL. Also accepted as `connect(url)` /
   *  `createPool(url)`. Supports the sslmode/application_name/connect_timeout params + unix `?host=/path`. */
  url?: string
  host?: string
  port?: number
  user?: string
  password?: string
  database?: string
  /** `true`/`'require'` = encrypt (no CA verification); object = passed to tls.connect. */
  ssl?: boolean | 'require' | 'verify-ca' | 'verify-full' | 'disable' | tls.ConnectionOptions
  applicationName?: string
  connectTimeout?: number
  /** Command-line options sent IN THE STARTUP PACKET (e.g. '-c search_path=app -c lock_timeout=2s'),
   *  like node-postgres' `options`. Server-applied at connection time, so `RESET ALL` RESTORES these
   *  values instead of wiping them — the fail-safe property session-level set_config lacks. */
  options?: string
  /** Per-session statement_timeout in ms, sent as a startup parameter (survives RESET ALL). */
  statementTimeout?: number
  /** Per-session idle_in_transaction_session_timeout in ms, sent as a startup parameter. */
  idleInTransactionSessionTimeout?: number
  /** SCRAM channel-binding stance (URL `?channel_binding=`), libpq semantics. On the node TLS
   *  transport Drizzle Postgres speaks SCRAM-SHA-256-PLUS with RFC 5929 tls-server-end-point — under
   *  'prefer' (default) binding engages automatically whenever the server offers -PLUS over TLS,
   *  and when it can't bind it sends the honest gs2 'y' flag (downgrade tripwire). 'require'
   *  fails LOUDLY when binding can't happen: no TLS, a custom/cf socket (the server certificate
   *  isn't reachable there), an unsupported cert signature algorithm, or a server without -PLUS.
   *  Never silently unbound.
   *
   *  A custom `socket` CAN satisfy 'require' — it just has to expose the certificate; see `socket`.
   *
   *  Entries that own their TLS cannot reach the certificate, and split two ways on what to do with
   *  'require':
   *   - @drizzle-team/postgres/neon-ws and @drizzle-team/postgres/neon-http RELAX it to 'prefer'. They point at one provider whose URLs
   *     always carry `?channel_binding=require`, and whose own drivers ignore it —
   *     `@neondatabase/serverless` always picks plain SCRAM-SHA-256 with the gs2 header `n,,`. Refusing
   *     would reject Neon's own default connection string; relaxed, Drizzle Postgres sends the identical bytes.
   *   - @drizzle-team/postgres/cf and @drizzle-team/postgres/deno REFUSE it, naming the runtime limit (workerd's Socket and Deno's
   *     TlsConn expose no certificate API). Those dial any Postgres, so a caller who asked for binding
   *     is told it cannot happen instead of being quietly downgraded. */
  channelBinding?: 'disable' | 'prefer' | 'require'
  /** Connect via a unix-domain socket at this path (e.g. /tmp/.s.PGSQL.5432) instead of
   *  host/port TCP — lower latency / higher throughput on the same machine; SSL is skipped. */
  path?: string
  /** Row-decode strategy for 'array'/'object' modes: 'jit' compiles a per-shape mapper with new Function
   *  (fastest, needs eval — Node/Bun/Deno); 'interpreted' resolves per-column decoders and loops (no eval —
   *  CSP / Cloudflare Workers); 'auto' (default) uses jit where eval is available, else interpreted. */
  decode?: 'auto' | 'jit' | 'interpreted'
  /** Param-encode strategy when a binary plan applies (declared `params` or prepared reuse): 'jit'
   *  compiles a per-statement Bind+Execute+Sync encoder with new Function (fastest, needs eval); 'interpreted'
   *  uses the generic write-through plan (no eval — CSP / Cloudflare Workers); 'auto' (default) uses jit where
   *  eval is available, else interpreted. Byte-identical output either way; this only trades compile for speed. */
  encode?: 'auto' | 'jit' | 'interpreted'
  /** How date/timestamp/timestamptz columns decode by default: 'date' (default) = a JS Date (like
   *  pg/postgres.js); 'string' = the exact PG text, lossless (keeps µs, BC eras, 5-digit years, and
   *  infinity, none of which a JS Date can hold). Per-column `:string`/`:date`/`:ms` targets in a
   *  shape/queryTyped always override this. Note: Date is millisecond-precision. */
  temporal?: 'date' | 'string'
  /** Per-OID decoder overrides for the parsed ('array'/'object') modes. */
  types?: Record<number, Decoder>
  /** How to decode integers inside ANY json/jsonb value that exceed 2^53 (which plain
   *  JSON.parse silently truncates). 'number' (default) = plain JSON.parse; 'string' /
   *  'bigint' = auto-preserve oversized integers as their exact string / BigInt, via the
   *  native JSON source-text reviver. Order-independent (works for jsonb). For a known
   *  shape, Json()/JsonArray() is faster — this is the zero-declaration safety net. */
  jsonBigints?: 'number' | 'string' | 'bigint'
  /** Use server-side NAMED prepared statements for `{ name }` queries and the reused-chunks builder.
   *  Set `false` behind a transaction-mode pooler (PgBouncer/Supavisor) where a named statement prepared
   *  on one backend may not exist on the next — every query then goes unnamed (Parse+Bind+Execute).
   *  Default: auto — off when a pooler is detected (Neon `-pooler` host, Supabase `pooler.supabase.com`
   *  / port 6543, or the Vercel serverless runtime), on otherwise. Explicit value always wins. */
  prepare?: boolean
  /** Declares whether the connection goes through a transaction-mode pooler, such as PgBouncer. It
   *  replaces the detection from the host and port that `prepare` describes. Behind a pooler, `prepare`
   *  and `pipeline` default to off, and a connection whose query was canceled is closed. */
  pooler?: boolean
  /** Encode params in BINARY wire format for the fast types (int2/int4/int8, float8, bool,
   *  timestamp/timestamptz) when a named prepared statement is REUSED — the param OIDs are then
   *  known from the first round trip's ParameterDescription. A value whose JS type/range doesn't
   *  match its column falls back to text for that one value, so server semantics (including
   *  out-of-range errors) are unchanged. First executions always go out text. Default: on. */
  binaryParams?: boolean
  /** Pipeline independent queries on a SINGLE connection: keep several in flight at once instead of
   *  waiting a full round trip between each (collapses N round trips into ~1 for concurrently-issued
   *  queries, e.g. `Promise.all`). Results still return in request order; the server executes them
   *  serially (pipelining hides network latency, not server CPU). Default: on (depth 100), auto-off
   *  behind a transaction-mode pooler. `false` = one query at a time (gated); `{ depth }` caps in-flight.
   *  `flush` controls socket-write batching: `'microtask'` (default) coalesces queries issued in the same
   *  tick into ONE write (fewer syscalls); `'sync'` writes each as it's dispatched (lowest latency). */
  pipeline?: boolean | { depth?: number; flush?: 'sync' | 'microtask' }
  /** Auto-reconnect this connection after an unexpected drop (default off). Object
   *  tunes backoff (baseMs/maxMs) and maxRetries (null/omitted = retry forever). */
  reconnect?: boolean | { baseMs?: number; maxMs?: number; maxRetries?: number }
  /** Custom transport: return an already-connected duplex stream (bypasses net.connect
   *  and SSL). Enables unix sockets, alternative runtimes, and in-process testing.
   *  Structurally typed (see PostgresSocket) — node's Duplex satisfies it, and non-node
   *  runtimes implement the small surface directly instead of casting.
   *
   *  SCRAM channel binding: a transport that terminates its own TLS can support
   *  `channelBinding: 'require'` by resolving to a stream that also carries
   *  `getPeerX509Certificate()` or `getPeerCertificate(true)` returning a `raw` DER —
   *  node's own TLSSocket already does, so `tls.connect({ socket })` works as-is.
   *  Without one of those, binding is impossible and `'require'` is refused at auth. */
  socket?: () => PostgresSocket | Promise<PostgresSocket>
  /** Dials and cancels with this transport instead of the one that the Node entry registers for the
   *  whole process. A `socket` still takes precedence for dialing. */
  transport?: Transport
  /** Telemetry/observability plugins (e.g. otel()/sentry() from '@drizzle-team/postgres/telemetry'). They subscribe
   *  to query + connection lifecycle hooks; enabling any plugin turns on per-query timing capture. */
  plugins?: Plugin[]
}

/** Options for begin()/transaction(). A raw string is appended to `BEGIN` as-is (sanitized to letters/
 *  spaces, postgres.js-style); the object form builds the ISOLATION LEVEL / READ ONLY·WRITE / DEFERRABLE
 *  clauses for you. Applies only to the top-level BEGIN — a nested begin becomes a SAVEPOINT and ignores it. */
export type TxOptions =
  | string
  | {
      isolation?: 'serializable' | 'repeatable read' | 'read committed' | 'read uncommitted'
      readOnly?: boolean
      deferrable?: boolean
    }

export interface QueryOptions {
  /** Reuse a server-side prepared statement under this name (parse once, bind many). */
  name?: string
  /** Run this ONE query pinned to an exported snapshot (from replication createSlot or
   *  pg_export_snapshot()): wraps it in `begin repeatable read read only; set transaction
   *  snapshot …; <query>; commit` — all pipelined into a single round trip. Rejects if the
   *  connection is already inside a transaction. The exporting transaction must still be open. */
  snapshot?: string
  mode?: ResultMode
  /** Declare the param types upfront — the input-side mirror of `shape`. Aliases ('int8',
   *  'timestamptz'), array forms ('int8[]', 'text[]'), or raw OIDs. Sent in Parse — pinning the
   *  types server-side instead of inference — and fast types (plus whole ARRAYS of them, the
   *  unnest batch path) encode BINARY from the FIRST execution, no ParameterDescription round
   *  trip needed. Works for unnamed statements too (transaction-pooler safe). Pass a stable
   *  array (module-scope constant) — resolution + plans are cached by array identity. */
  params?: readonly ParamType[]
  /** Decode this query's result with a declared column shape (a `ShapeSpec` object, or a `Shape()` mapper —
   *  its `$cols` are reused). Enables typed/binary decode via the same cached jit/interpreted mapper the
   *  driver uses for every query; columns marked `format:'binary'` request the binary wire format. */
  shape?: ShapeSpec | ShapeMapper
  /** Force the BINARY result wire format for EVERY column (manual/testing lever — the shape path picks
   *  binary per-column automatically). Decodes via each column's binary decoder from the RowDescription
   *  OIDs. Columns whose type has no binary decoder (numeric, money, json, jsonb, …) will error — select
   *  only binary-supported types. Ignored when `shape` is given (the shape controls per-column formats). */
  binary?: boolean
  /** Attach per-query timings/sizes to the result as `.metrics` (works with or without plugins). `true`
   *  reports durations as sub-ms floating-point milliseconds; `'ms'` rounds to whole-integer milliseconds;
   *  `'us'` reports integer microseconds (best for sub-ms queries). The unit is echoed in `metrics.unit`. */
  metrics?: boolean | 'ms' | 'us'
  /** Attach the resolved decode plan to the result as `.debug` — statement name, jit/interpreted, the
   *  generated JIT mapper source, and the per-column text/binary format we picked. For inspection/tuning. */
  debug?: boolean
  /** Cancel the query (out-of-band CancelRequest) after this many milliseconds. If the query ends
   *  before the request arrives, the request can stop the next pipelined query. That query fails with
   *  57014 and `isLateCancel: true`. */
  timeout?: number
  /** Cancel the query when this AbortSignal fires. A late cancel can stop the next pipelined query,
   *  as described for `timeout`. */
  signal?: AbortSignal
  /** Repropagate error to preserve link to original call stack */
  trace?: boolean
}

export interface StreamOptions extends QueryOptions {
  /** Rows buffered before the socket is paused for backpressure (default 200). */
  highWaterMark?: number
}

export interface PoolConfig extends ConnectConfig {
  max?: number
  /** Close a connection that has sat idle in the pool for this many ms (0/omitted = never evict).
   *  Also surfaced as `pool.options.idleTimeoutMillis` + a `'release'` event so Vercel's
   *  attachDatabasePool() can keep the function instance alive long enough to drain idle connections. */
  idleTimeoutMillis?: number
  /** Single-flight reconnect on connection failure. `false` disables it (fail fast).
   *  Object tunes backoff (baseMs/maxMs) and how long an acquire waits for recovery.
   *  `probeConnectTimeoutMs` bounds ONE probe attempt (default min(5s, acquireTimeoutMs/2), capped
   *  by connectTimeout): it must stay well under `acquireTimeoutMs`, or a single stalled attempt
   *  outlives every waiter and the breaker never re-evaluates. */
  reconnect?: boolean | { baseMs?: number; maxMs?: number; acquireTimeoutMs?: number; probeConnectTimeoutMs?: number }
  /** Reject an acquire that has waited this long for a free connection (default 30000; 0 = wait forever).
   *  Without it an exhausted pool hangs with no diagnostic — the failure mode every pool has shipped at
   *  some point (pg's connectionTimeoutMillis defaults to off; knex's defaults to 60s). */
  acquireTimeoutMillis?: number
  /** Throw when this pool is used INSIDE its own transaction() callback (default true). Such a query
   *  checks out a SECOND connection, so it silently runs OUTSIDE the tx — blind to its uncommitted rows,
   *  and unaffected by its rollback — and deadlocks outright once the pool is saturated. Requires
   *  AsyncLocalStorage; where that is absent the guard is skipped and acquireTimeoutMillis is the
   *  backstop. Purely additive: it only ever rejects a call that was already a bug. */
  txGuard?: boolean
}
