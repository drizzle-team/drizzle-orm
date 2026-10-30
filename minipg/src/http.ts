// minipg for the httpostgres gateway — `import { client } from 'minipg/http'`.
//
// Speaks the gateway protocol (httpostgres PROTOCOL.md): POST /query with a JSON request, and the
// RESPONSE BODY IS the Postgres wire stream — {T, D, C, E, I} frames byte-for-byte as the backend
// framed them. The body is parsed with the driver's own message Parser and decoded with the same
// compiled row mappers as the socket driver, so QueryResult is identical across transports.
//
// No connection string: the bearer token is the whole identity — the gateway owns DATABASE_URL.
// No protocol headers: row shape (object/array) is a client-side decode choice.
//
// Decode defaults are the SAME as every other entry (wire, neon-http, aurora): int8 -> BigInt,
// numeric -> exact string, temporal -> Date. A transport must not change what a value decodes to.
// This entry's common fate is Response.json(rows) in a Worker, where BigInt throws — set
// `int8: 'string'` (lossless and JSON-serialisable) or `'number'` (lossy) for that; per-column
// shape targets always win over both.
import './buffer-polyfill.ts' // MUST be first: installs Buffer on runtimes without it (no-op elsewhere)
import { buildMapperFactory, type RowMapperFactory } from './mapper.ts'
import { buildDecoders, INSTANT_OIDS, tagArrayCol, type CodegenCol } from './decode.ts'
import { shapeCols, resolveParamTypes, mergeUnknownCols, type ShapeSpec, type ParamType } from './spec.ts'
import type { ShapeMapper } from './shape.ts'
import { Parser, parseRowDescription, type RawMessage } from './protocol.ts'
import { PgError, parseErrorFields } from './errors.ts'
import { encodeJsonParams } from './encode.ts'
import type { Decoder, ResultMode, QueryResult, Field } from './types.ts'

type Isolation = 'serializable' | 'repeatable read' | 'read committed' | 'read uncommitted'

export interface HttpConfig {
  /** The gateway's query endpoint, e.g. 'https://db.example.com/query'. */
  url: string
  /** Bearer token (or async getter) — the entire identity; nothing about the upstream is the client's business. */
  token?: string | (() => string | Promise<string>)
  /** Custom fetch (defaults to the global). */
  fetch?: typeof fetch
  /** Per-OID decoder overrides (same as the wire driver). */
  types?: Record<number, Decoder>
  jsonBigints?: 'number' | 'string' | 'bigint'
  /** date/timestamp(tz) default decode: 'date' (JS Date, default) or 'string' (exact PG text). */
  temporal?: 'date' | 'string'
  /** int8 decode target: 'bigint' (default — same as every other entry), 'string' (lossless and
   *  JSON-serialisable, for Response.json(rows)) or 'number' (lossy above 2^53). */
  int8?: 'string' | 'bigint' | 'number'
  decode?: 'auto' | 'jit' | 'interpreted'
  /** Descriptor elision (default true): echo a hash of each statement's T frame so the gateway may
   *  omit it next time. Hash = FNV-1a 64 over the raw T frame, 16 lowercase hex chars — the gateway
   *  must use the SAME algorithm or the optimization silently never engages (always harmless). */
  desc?: boolean
}

export interface HttpQueryOptions {
  mode?: ResultMode
  shape?: ShapeSpec | ShapeMapper
  /** Declared parameter types for Parse (minipg aliases or raw OIDs) — validated locally, sent as given. */
  types?: readonly ParamType[]
  timeout?: number
  signal?: AbortSignal
}

export interface HttpBatchQuery {
  sql: string
  params?: unknown[]
  types?: readonly ParamType[]
  mode?: ResultMode
  shape?: ShapeSpec | ShapeMapper
}

export interface HttpBatchOptions {
  isolation?: Isolation
  readOnly?: boolean
  deferrable?: boolean
  timeout?: number
  signal?: AbortSignal
}

/** pipeline(): per-statement outcomes — statement i failed while the others committed (autocommit). */
export type HttpPipelineResult = { status: 'fulfilled'; value: QueryResult } | { status: 'rejected'; reason: PgError }

// Transaction control never belongs in a statement: the GATEWAY owns the BEGIN…COMMIT boundary
// (batch mode), and a smuggled COMMIT would end it early. Mirrors the gateway's own rejection.

// FNV-1a 64 over the raw T frame -> 16 lowercase hex chars (the `desc` value). T frames are small
// (~240B for 8 columns), so the per-byte BigInt walk is irrelevant.
const TX_SQL = /^\s*(begin|start\s+transaction|commit|end|rollback(?!\s+to\b)|abort|prepare\s+transaction)\b/i
const firstCstr = (b: Buffer): string => { const z = b.indexOf(0); return b.toString('utf8', 0, z < 0 ? b.length : z) }

const FNV_PRIME = 0x100000001b3n, FNV_MASK = 0xffffffffffffffffn
function fnv1a64(b: Uint8Array): string {
  let h = 0xcbf29ce484222325n
  for (let i = 0; i < b.length; i++) { h ^= BigInt(b[i]!); h = (h * FNV_PRIME) & FNV_MASK }
  return h.toString(16).padStart(16, '0')
}

// One statement's slice of the stream (PROTOCOL.md "Splitting results": C/E/I terminate, never T).
interface RawResult { fields: Field[] | null; rows: Buffer[]; command: string | null; rowCount: number | null; error: PgError | null }


export class HttpClient {
  private cfg: HttpConfig
  private fetchImpl: typeof fetch
  private decoders: Map<number, Decoder>
  private mapperFactory: RowMapperFactory
  private sendDesc: boolean
  // desc cache: sql -> { hash (sent as `desc`), fields (decode when the gateway omits T) }. Harvested
  // from every T seen — including batch responses — self-correcting: a response WITH T overwrites.
  private descCache = new Map<string, { hash: string; fields: Field[] }>()

  constructor(config: HttpConfig) {
    if (!config.url) throw new Error('minipg/http: config.url (the gateway /query endpoint) is required')
    this.cfg = config
    const f = config.fetch ?? globalThis.fetch
    if (!f) throw new Error('minipg/http: no fetch available — pass { fetch }')
    this.fetchImpl = f
    this.decoders = buildDecoders(config.types, config.jsonBigints)
    this.mapperFactory = buildMapperFactory(config.decode)
    this.sendDesc = config.desc !== false
  }

  // ---- transport ----
  private async headers(): Promise<Record<string, string>> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      // EXPLICIT: any Accept mentioning json flips the gateway to casual (decoded JSON) mode
      Accept: 'application/vnd.minipg.pgwire',
    }
    const t = typeof this.cfg.token === 'function' ? await this.cfg.token() : this.cfg.token
    if (t) h['Authorization'] = 'Bearer ' + t
    return h
  }

  /** Combine a per-query `timeout` with the caller's `signal`. NOT AbortSignal.any: that is Node 20.3+
   *  while this package supports Node >= 18, where it is undefined and passing both would throw. The
   *  driver's own expiry aborts with a tagged error so callers can tell it from an external abort. */
  private signalFor(o: { timeout?: number; signal?: AbortSignal }): AbortSignal | undefined {
    if (o.timeout == null) return o.signal
    if (!o.signal) return AbortSignal.timeout(o.timeout)
    const ac = new AbortController()
    const sig = o.signal
    if (sig.aborted) ac.abort(sig.reason)
    else sig.addEventListener('abort', () => ac.abort(sig.reason), { once: true })
    setTimeout(() => ac.abort(Object.assign(new Error(`query timed out after ${o.timeout}ms`), { code: 'QUERY_TIMEOUT' })), o.timeout)
    return ac.signal
  }

  private async post(body: unknown, opts: { timeout?: number; signal?: AbortSignal }): Promise<RawMessage[]> {
    const res = await this.fetchImpl(this.cfg.url, { method: 'POST', headers: await this.headers(), body: JSON.stringify(body), signal: this.signalFor(opts) })
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('vnd.minipg.pgwire')) {
      throw new Error(`minipg/http: unexpected response content-type ${JSON.stringify(ct || '(none)')} — expected application/vnd.minipg.pgwire (is the url the gateway's /query endpoint?)`)
    }
    const buf = Buffer.from(await res.arrayBuffer())
    const msgs = new Parser().push(buf)
    if (!res.ok) { // gateway failures are synthetic E frames with a real SQLSTATE — same parse path as a database error
      const e = msgs.find((m) => m.type === 'E')
      throw e ? new PgError(parseErrorFields(e.body)) : new Error(`minipg/http: HTTP ${res.status} ${res.statusText}`)
    }
    return msgs
  }

  // ---- stream splitting (PROTOCOL.md): each result ends with C, E, or I — never T ----
  private split(msgs: RawMessage[], sqls: readonly string[]): { results: RawResult[]; trailing: PgError | null } {
    const results: RawResult[] = []
    let cur: RawResult = { fields: null, rows: [], command: null, rowCount: null, error: null }
    let trailing: PgError | null = null
    const push = (): void => { results.push(cur); cur = { fields: null, rows: [], command: null, rowCount: null, error: null } }
    for (const m of msgs) {
      switch (m.type) {
        case 'T': {
          cur.fields = parseRowDescription(m.body)
          // harvest for desc elision + T-less decode; frame = header (5B, contiguous below body) + body
          const i = results.length
          if (i < sqls.length) this.descCache.set(sqls[i]!, { hash: fnv1a64(Buffer.from(m.body.buffer, m.body.byteOffset - 5, m.body.length + 5)), fields: cur.fields })
          break
        }
        case 'D': cur.rows.push(m.body); break
        case 'C': { const tag = firstCstr(m.body); cur.command = tag.split(' ')[0] ?? null; const mm = tag.match(/(\d+)\s*$/); cur.rowCount = mm ? parseInt(mm[1]!, 10) : null; push(); break }
        case 'I': push(); break
        case 'E': {
          const err = new PgError(parseErrorFields(m.body))
          if (results.length >= sqls.length) { trailing = err } // E AFTER the Nth result = transaction-level commit failure
          else { cur.error = err; push() }
          break
        }
        case 'n': case 's': break // defensive: spec'd as strippable/unreachable — never terminators
        case 'R': case 'K': case 'S': case 'Z': throw new Error(`minipg/http: connection-level frame '${m.type}' in the response — the gateway must never forward it; refusing to parse`)
        default: break // unknown tags are ignored (forward-compatible)
      }
    }
    return { results, trailing }
  }

  // ---- decode: the SAME column plan + compiled mappers as the wire driver ----
  private planCols(fields: Field[], shape: ShapeSpec | ShapeMapper | undefined): CodegenCol[] {
    let cols: CodegenCol[]
    // 'unknown' (oid 0) columns defer their type to the RowDescription — resolve them BEFORE the
    // array/temporal/int8 passes below, which all key off the real OID.
    if (shape) cols = mergeUnknownCols((typeof shape === 'function' ? (shape.$cols as CodegenCol[]) : shapeCols(shape)).map((c) => (c.format === 'binary' ? { ...c, format: 'text' as const } : c)), fields, (f) => f.dataTypeOid) // the protocol GUARANTEES text
    else cols = fields.map((f) => ({ name: f.name, oid: f.dataTypeOid }))
    const temporal = this.cfg.temporal ?? 'date'
    const int8 = this.cfg.int8 ?? 'bigint' // parity with the wire driver's default decoder catalog
    return cols.map((c0) => {
      const c = tagArrayCol(c0)
      if (temporal === 'string') { // mirrors Connection.resolveCols, temporal[] ELEMENTS included
        if (!c.js && !c.json && INSTANT_OIDS.has(c.oid)) return { ...c, js: 'string' as const, format: 'text' as const }
        if (c.array && !c.array.js && INSTANT_OIDS.has(c.array.elem)) return { ...c, array: { ...c.array, js: 'string' as const } }
      }
      if (int8 !== 'bigint' && !c.js && !c.json) {
        if (c.oid === 20) return { ...c, js: int8 }
        if (c.array && c.array.elem === 20 && !c.array.js) return { ...c, array: { ...c.array, js: int8 } }
      }
      return c
    })
  }

  private decode(r: RawResult, sql: string, mode: ResultMode | undefined, shape: ShapeSpec | ShapeMapper | undefined): QueryResult<never> {
    if (r.error) throw r.error
    const m: ResultMode = mode ?? (shape ? 'object' : 'array')
    const fields = r.fields ?? this.descCache.get(sql)?.fields ?? null
    if (!fields) {
      if (r.rows.length > 0) throw new Error('minipg/http: rows arrived with no RowDescription and no cached descriptor — desc elision desync (the gateway omitted T for a statement this client never saw)')
      return { rows: [], columns: [], rowCount: r.rowCount, command: r.command }
    }
    const cols = this.planCols(fields, shape)
    const mapper = m === 'array' || m === 'object' ? this.mapperFactory(cols, m, this.decoders) : null
    const rows = r.rows.map((b) => (mapper ? mapper(b) : m === 'buffer' ? parseDataRowCells(b) : Buffer.from(b)))
    return { rows: rows as never[], columns: cols.map((c) => c.name), rowCount: r.rowCount, command: r.command }
  }

  private guard(sql: string): void {
    const tx = TX_SQL.exec(sql)
    if (tx) throw new Error(`minipg/http: "${tx[1]!.toUpperCase()}" is transaction control — the GATEWAY owns the transaction boundary; use batch([...], { isolation }) for atomicity`)
    if (this.cfg.token == null) return
  }

  // Returns the DECLARED type OIDs (or undefined) — encodeJsonParams needs them so a declared
  // json/jsonb param serializes as JSON text rather than by the value's own shape.
  private checkTypes(types: readonly ParamType[] | undefined, nParams: number, sql: string): readonly number[] | undefined {
    if (!types) return undefined
    const oids = resolveParamTypes(types) // local validation: a typo fails HERE with minipg's error, not a gateway round-trip
    if (types.length !== nParams) throw new Error(`minipg/http: ${nParams} param value(s) but ${types.length} type(s) declared for ${JSON.stringify(sql.slice(0, 40))}`)
    return oids
  }

  // ---- public API ----
  /** One statement. Rejects with the backend's PgError when the statement failed (an E under 200 is normal). */
  query(sql: string, params: unknown[], opts: HttpQueryOptions & { mode: 'object' }): Promise<QueryResult<Record<string, unknown>>>
  query(sql: string, params: unknown[], opts: HttpQueryOptions & { shape: ShapeSpec | ShapeMapper }): Promise<QueryResult<Record<string, unknown>>>
  query(sql: string, params?: unknown[], opts?: HttpQueryOptions): Promise<QueryResult>
  async query(sql: string, params: unknown[] = [], opts: HttpQueryOptions = {}): Promise<QueryResult<never>> {
    this.guard(sql)
    const oids = this.checkTypes(opts.types, params.length, sql)
    const body: Record<string, unknown> = { sql, params: encodeJsonParams(params, oids) }
    if (opts.types) body.types = opts.types
    const cached = this.sendDesc ? this.descCache.get(sql) : undefined
    if (cached) body.desc = cached.hash
    const { results, trailing } = this.split(await this.post(body, opts), [sql])
    if (trailing) throw trailing
    if (results.length !== 1) throw new Error(`minipg/http: expected 1 result, got ${results.length} — refusing to mis-attribute`)
    return this.decode(results[0]!, sql, opts.mode, opts.shape)
  }

  /** Atomic batch: BEGIN…COMMIT on one gateway connection. Any failure — including one that fires AT
   *  COMMIT (deferred constraint, serializable 40001) — rejects the whole call with the FIRST error;
   *  every result set is discarded (they describe undone work). */
  async batch(queries: HttpBatchQuery[], opts: HttpBatchOptions = {}): Promise<QueryResult[]> {
    const oids = queries.map((q) => { this.guard(q.sql); return this.checkTypes(q.types, (q.params ?? []).length, q.sql) })
    const body: Record<string, unknown> = { mode: 'batch', queries: queries.map((q, i) => ({ sql: q.sql, params: encodeJsonParams(q.params ?? [], oids[i]), ...(q.types ? { types: q.types } : {}) })) }
    if (opts.isolation) body.isolation = opts.isolation
    if (opts.readOnly != null) body.readOnly = opts.readOnly
    if (opts.deferrable != null) body.deferrable = opts.deferrable
    const { results, trailing } = this.split(await this.post(body, opts), queries.map((q) => q.sql))
    const firstErr = results.find((r) => r.error)?.error ?? trailing // stream order puts the root cause first (25P02s follow it)
    if (firstErr) throw firstErr
    if (results.length !== queries.length) throw new Error(`minipg/http: ${queries.length} statements but ${results.length} results — refusing to mis-attribute`)
    return results.map((r, i) => this.decode(r, queries[i]!.sql, queries[i]!.mode, queries[i]!.shape))
  }

  /** Pipelined, NO transaction: each statement autocommits, so statement i can fail while the others
   *  committed — the full per-statement outcome array is returned (never a whole-call rejection for
   *  a statement error). */
  async pipeline(queries: HttpBatchQuery[], opts: { timeout?: number; signal?: AbortSignal } = {}): Promise<HttpPipelineResult[]> {
    const oids = queries.map((q) => { this.guard(q.sql); return this.checkTypes(q.types, (q.params ?? []).length, q.sql) })
    const body = { mode: 'pipeline', queries: queries.map((q, i) => ({ sql: q.sql, params: encodeJsonParams(q.params ?? [], oids[i]), ...(q.types ? { types: q.types } : {}) })) }
    const { results, trailing } = this.split(await this.post(body, opts), queries.map((q) => q.sql))
    if (trailing) throw trailing // impossible in autocommit mode — protocol desync if it happens
    if (results.length !== queries.length) throw new Error(`minipg/http: ${queries.length} statements but ${results.length} results — refusing to mis-attribute`)
    return results.map((r, i) => {
      if (r.error) return { status: 'rejected' as const, reason: r.error }
      try { return { status: 'fulfilled' as const, value: this.decode(r, queries[i]!.sql, queries[i]!.mode, queries[i]!.shape) } }
      catch (e) { return { status: 'rejected' as const, reason: e as PgError } }
    })
  }

  /** No-op — HTTP holds no connection. Present for API symmetry. */
  async end(): Promise<void> { /* nothing to close */ }
}

// 'buffer' mode without the wire driver: split one DataRow body into per-cell Buffers
function parseDataRowCells(b: Buffer): (Buffer | null)[] {
  const n = b.readUInt16BE(0); const out: (Buffer | null)[] = new Array(n)
  let off = 2
  for (let i = 0; i < n; i++) { const len = b.readInt32BE(off); off += 4; if (len === -1) out[i] = null; else { out[i] = Buffer.from(b.subarray(off, off + len)); off += len } }
  return out
}

/** Create a gateway client. HTTP is connectionless — there is no pool to manage, so the factory
 *  is just `client()`. */
export function client(config: HttpConfig): HttpClient { return new HttpClient(config) }
export { PgError }
export type { QueryResult, ResultMode, Decoder }
