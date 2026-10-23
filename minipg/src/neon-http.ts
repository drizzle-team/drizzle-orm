// minipg for Neon over HTTP — `import { connect, createPool } from 'minipg/neon-http'`.
//
// Neon's SQL-over-HTTP endpoint runs ONE SQL statement (or an atomic batch) per fetch — no persistent
// connection, ideal for serverless/edge. It is NOT the Postgres wire protocol: the request is JSON
// (`{query,params}`), the response is JSON. But with `Neon-Raw-Text-Output: true` every cell comes back
// as its exact PG TEXT string, so we reuse minipg's real compiled row MAPPER: we byte-scan the raw
// response and rebuild each row as a synthetic wire DataRow (int16 count + int32-len cells) fed to the
// same jit/interpreted mapper the wire driver uses — identical decode (int8→BigInt, numeric→string,
// temporal→Date, json…) with no JSON.parse of the hot data and near-zero transient allocation.
//
// Constraints (stateless HTTP): no interactive `begin(fn)` (use `transaction([...])` for an atomic batch,
// or minipg/neon-ws for interactive tx), no LISTEN/COPY/cursors, no prepared-statement reuse, no binary
// wire format (text decode only). `$1` placeholders — same as the wire driver.
import { buildMapperFactory, type RowMapperFactory } from './mapper.ts'
import { buildDecoders } from './decode.ts'
import { INSTANT_OIDS, tagArrayCol, type CodegenCol } from './decode.ts'
import { shapeCols, mergeUnknownCols, type ShapeSpec } from './spec.ts'
import type { ShapeMapper } from './shape.ts'
import { parseDataRow } from './protocol.ts'
import { PgError } from './errors.ts'
import { defaultDecoders } from './decode.ts'
import { resolveUrl } from './url.ts'
import { encodeJsonParams as encodeParams } from './encode.ts'
import type { Decoder, ResultMode, QueryResult } from './types.ts'

type JsonBigints = 'number' | 'string' | 'bigint'
type Isolation = 'serializable' | 'repeatable read' | 'read committed' | 'read uncommitted'

/** Config for the Neon HTTP driver. Pass a `postgres://…neon.tech/db?sslmode=require` connection string
 *  (as `url` or the first arg) — it carries the credentials Neon's endpoint needs. */
export interface NeonHttpConfig {
  url?: string
  host?: string; port?: number; user?: string; password?: string; database?: string
  /** Per-OID decoder overrides (same as the wire driver). */
  types?: Record<number, Decoder>
  /** Oversized-integer handling inside json/jsonb values. */
  jsonBigints?: JsonBigints
  /** date/timestamp(tz) default decode: 'date' (JS Date) or 'string' (exact PG text). */
  temporal?: 'date' | 'string'
  /** Row-decode strategy: 'auto' (default), 'jit', or 'interpreted'. */
  decode?: 'auto' | 'jit' | 'interpreted'
  /** Override the SQL endpoint URL (string) or builder `(host, port) => url`. Default derives it from the
   *  host: replace the first label with `api.` (or `apiauth.` when `authToken` is set) + `/sql`. */
  fetchEndpoint?: string | ((host: string, port: number) => string)
  /** Bearer token (or async getter) for Neon Authorize / RLS — sent as `Authorization: Bearer …`. */
  authToken?: string | (() => string | Promise<string>)
  /** Custom fetch implementation (defaults to the global `fetch`). */
  fetch?: typeof fetch
}

export interface NeonHttpQueryOptions {
  mode?: ResultMode
  /** Decode with a declared column shape (typed/JSON targets). Binary formats are ignored — HTTP is text. */
  shape?: ShapeSpec | ShapeMapper
  timeout?: number
  signal?: AbortSignal
}

export interface NeonTxOptions {
  isolation?: Isolation
  readOnly?: boolean
  deferrable?: boolean
  timeout?: number
  signal?: AbortSignal
}

/** One query in a `transaction([...])` batch. */
export interface NeonTxQuery {
  sql: string
  params?: unknown[]
  mode?: ResultMode
  shape?: ShapeSpec | ShapeMapper
}



const ISO_HEADER: Record<Isolation, string> = {
  serializable: 'Serializable', 'repeatable read': 'RepeatableRead', 'read committed': 'ReadCommitted', 'read uncommitted': 'ReadUncommitted',
}

// endpoint: replace the host's first label with api./apiauth., add /sql. Matches @neondatabase/serverless.
function defaultEndpoint(host: string, jwt: boolean): string {
  return `https://${host.replace(/^[^.]+\./, jwt ? 'apiauth.' : 'api.')}/sql`
}

function buildConnString(r: { user?: string; password?: string; host?: string; port?: number; database?: string }): string {
  const u = encodeURIComponent(r.user ?? 'postgres')
  const p = r.password != null && r.password !== '' ? ':' + encodeURIComponent(r.password) : ''
  const port = r.port ? ':' + r.port : ''
  return `postgresql://${u}${p}@${r.host}${port}/${encodeURIComponent(r.database ?? r.user ?? 'postgres')}`
}

// ---- JSON byte-scanning helpers (over the raw response Buffer) ----
let scanEscaped = false
function scanString(buf: Buffer, i: number): number { // buf[i]==='"'; sets scanEscaped; returns index AFTER closing quote
  scanEscaped = false; i++
  for (; i < buf.length; i++) { const c = buf[i]!; if (c === 0x5c) { scanEscaped = true; i += buf[i + 1] === 0x75 ? 5 : 1; continue } if (c === 0x22) return i + 1 }
  return i
}
function endOfValue(buf: Buffer, i: number): number {
  const c = buf[i]!
  if (c === 0x22) return scanString(buf, i)
  if (c === 0x7b || c === 0x5b) { const open = c, close = c === 0x7b ? 0x7d : 0x5d; let depth = 0; for (; i < buf.length; i++) { const d = buf[i]!; if (d === 0x22) { i = scanString(buf, i) - 1; continue } else if (d === open) depth++; else if (d === close) { if (--depth === 0) return i + 1 } } return i }
  for (; i < buf.length; i++) { const d = buf[i]!; if (d === 0x2c || d === 0x7d || d === 0x5d || d <= 0x20) return i }
  return i
}
function skipWs(buf: Buffer, i: number): number { while (i < buf.length) { const c = buf[i]!; if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) i++; else break } return i }

const TX_SQL = /^\s*(begin|start\s+transaction|commit|end|rollback(?!\s+to\b)|abort|prepare\s+transaction)\b/i

// A reused scratch that assembles a synthetic wire DataRow body (int16 count + per-cell int32 len + bytes).
class RowBuf {
  buf = Buffer.allocUnsafe(4096)
  pos = 2
  reset(): void { this.pos = 2 }
  private ensure(n: number): void { if (this.buf.length < this.pos + n) { const nb = Buffer.allocUnsafe(Math.max(this.pos + n, this.buf.length * 2)); this.buf.copy(nb); this.buf = nb } }
  pushNull(): void { this.ensure(4); this.buf.writeInt32BE(-1, this.pos); this.pos += 4 }
  pushSlice(src: Buffer, start: number, end: number): void { const len = end - start; this.ensure(4 + len); this.buf.writeInt32BE(len, this.pos); this.pos += 4; src.copy(this.buf, this.pos, start, end); this.pos += len }
  pushText(s: string | null): void { if (s == null) { this.pushNull(); return } const b = Buffer.from(s, 'utf8'); this.pushSlice(b, 0, b.length) }
  finish(ncols: number): Buffer { this.buf.writeInt16BE(ncols, 0); return this.buf.subarray(0, this.pos) }
}

interface NeonField { name: string; dataTypeID: number }

const FKEY = Buffer.from('"fields":'), RKEY = Buffer.from('"rows":')

function strField(buf: Buffer, key: string, from: number): string | null {
  const i = buf.indexOf(key, from); if (i < 0) return null
  const j = skipWs(buf, i + key.length); if (buf[j] !== 0x22) return null
  return JSON.parse(buf.toString('utf8', j, scanString(buf, j))) as string
}
function numField(buf: Buffer, key: string, from: number): number | null {
  const i = buf.indexOf(key, from); if (i < 0) return null
  let j = skipWs(buf, i + key.length), e = j; while (e < buf.length) { const c = buf[e]!; if (c === 0x2c || c === 0x7d || c <= 0x20) break; e++ }
  const s = buf.toString('latin1', j, e); return s === 'null' ? null : Number(s)
}

// Leading transaction-control keyword (BEGIN/COMMIT/…). Session state doesn't survive a stateless
// HTTP request, so these must throw LOUDLY instead of silently giving zero atomicity. SAVEPOINT /
// RELEASE / ROLLBACK TO are not listed: inside transaction([...]) they're legit (the batch IS one
// tx), and standalone the server already errors loudly ("can only be used in transaction blocks").
// Best-effort lexical check (a leading comment evades it), same spirit as the fn-guard below.

export class NeonHttpClient {
  private endpoint: string
  private connString: string
  private authToken?: string | (() => string | Promise<string>)
  private fetchImpl: typeof fetch
  private temporal: 'date' | 'string'
  private decoders: Map<number, Decoder>
  private mapperFactory: RowMapperFactory

  /** For API symmetry with the wire driver — an HTTP client is always "ready" (no socket). */
  get state(): 'ready' { return 'ready' }

  constructor(config: string | NeonHttpConfig = {}) {
    const c: NeonHttpConfig = typeof config === 'string' ? { url: config } : config
    const r = resolveUrl(c as { url?: string }) as NeonHttpConfig
    const host = r.host ?? process.env.PGHOST
    if (!host) throw new Error('minipg/neon-http: no host — pass a Neon connection string (url) or { host }')
    this.connString = c.url ?? buildConnString(r)
    this.endpoint = typeof c.fetchEndpoint === 'function' ? c.fetchEndpoint(host, r.port ?? 5432) : (c.fetchEndpoint ?? defaultEndpoint(host, !!c.authToken))
    this.authToken = c.authToken
    const f = c.fetch ?? globalThis.fetch
    if (!f) throw new Error('minipg/neon-http: no fetch available — pass { fetch } (global fetch exists on Node ≥18, Bun, Deno, CF, browsers)')
    this.fetchImpl = f
    this.temporal = c.temporal ?? 'date'
    this.decoders = buildDecoders(c.types, c.jsonBigints)
    this.mapperFactory = buildMapperFactory(c.decode)
  }

  private async headers(): Promise<Record<string, string>> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      'Neon-Connection-String': this.connString,
      'Neon-Raw-Text-Output': 'true',
      'Neon-Array-Mode': 'true',
    }
    if (this.authToken) { const t = typeof this.authToken === 'function' ? await this.authToken() : this.authToken; if (t) h['Authorization'] = 'Bearer ' + t }
    return h
  }

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

  private async post(body: unknown, headers: Record<string, string>, signal?: AbortSignal): Promise<Response> {
    const res = await this.fetchImpl(this.endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal })
    if (!res.ok) {
      let parsed: unknown
      try { parsed = await res.json() } catch { /* not JSON */ }
      const e = parsed as { message?: string; code?: string } | undefined
      if (e && (e.message || e.code)) throw new PgError(e as never)
      throw new Error(`minipg/neon-http: HTTP ${res.status} ${res.statusText}${parsed ? ' — ' + JSON.stringify(parsed) : ''}`)
    }
    return res
  }

  // Resolve the column plan: shape cols (binary→text, HTTP is text-only) or plain field OIDs, then apply
  // temporal:'string' the same way the wire driver's resolveCols does.
  private planCols(fields: NeonField[], shape: ShapeSpec | ShapeMapper | undefined): CodegenCol[] {
    let cols: CodegenCol[]
    // 'unknown' (oid 0) columns defer their type to the result's field list — resolve them BEFORE
    // tagArrayCol/temporal below, which key off the real OID. (Neon's fields carry `dataTypeID`.)
    if (shape) cols = mergeUnknownCols((typeof shape === 'function' ? (shape.$cols as CodegenCol[]) : shapeCols(shape)).map((c) => (c.format === 'binary' ? { ...c, format: 'text' as const } : c)), fields, (f) => f.dataTypeID)
    else cols = fields.map((f) => ({ name: f.name, oid: f.dataTypeID }))
    cols = cols.map(tagArrayCol)
    if (this.temporal !== 'string') return cols
    return cols.map((c) => (!c.js && !c.json && INSTANT_OIDS.has(c.oid) ? { ...c, js: 'string' as const, format: 'text' as const }
      : c.array && !c.array.js && INSTANT_OIDS.has(c.array.elem) ? { ...c, array: { ...c.array, js: 'string' as const } } : c))
  }

  private rowFrom(mode: ResultMode, mapper: ((b: Buffer) => unknown) | null, body: Buffer): unknown {
    if (mapper) return mapper(body)
    if (mode === 'buffer') return parseDataRow(body).map((c) => (c == null ? null : Buffer.from(c)))
    return Buffer.from(body) // 'raw': the reconstructed wire DataRow
  }

  // Fast path — decode a single-statement response straight from the raw bytes (no JSON.parse of rows).
  private decodeSingleRaw(raw: Buffer, mode: ResultMode, shape: ShapeSpec | ShapeMapper | undefined): QueryResult<never> {
    const fi = raw.indexOf(FKEY); const fvs = skipWs(raw, fi + FKEY.length); const fve = endOfValue(raw, fvs)
    const fields = JSON.parse(raw.toString('utf8', fvs, fve)) as NeonField[]
    const ri = raw.indexOf(RKEY, fve); let i = skipWs(raw, ri + RKEY.length) + 1 // past '['
    const cols = this.planCols(fields, shape)
    const ncols = cols.length
    const mapper = mode === 'array' || mode === 'object' ? this.mapperFactory(cols, mode, this.decoders) : null
    const rb = new RowBuf()
    const rows: unknown[] = []
    for (;;) {
      i = skipWs(raw, i); let c = raw[i]!
      while (c === 0x2c) { i = skipWs(raw, i + 1); c = raw[i]! }
      if (c === 0x5d) { i++; break } // end of rows array
      i++ // past the row's '['
      rb.reset()
      for (let col = 0; col < ncols; col++) {
        i = skipWs(raw, i); c = raw[i]!
        while (c === 0x2c) { i = skipWs(raw, i + 1); c = raw[i]! }
        if (c === 0x6e) { rb.pushNull(); i += 4 } // null
        else {
          const qs = i, se = scanString(raw, i)
          if (scanEscaped) { const b = Buffer.from(JSON.parse(raw.toString('utf8', qs, se)) as string, 'utf8'); rb.pushSlice(b, 0, b.length) }
          else rb.pushSlice(raw, qs + 1, se - 1)
          i = se
        }
      }
      i = skipWs(raw, i); if (raw[i] === 0x5d) i++ // past the row's ']'
      rows.push(this.rowFrom(mode, mapper, rb.finish(ncols)))
    }
    return { rows: rows as never[], columns: cols.map((c) => c.name), rowCount: numField(raw, '"rowCount":', i), command: strField(raw, '"command":', i) }
  }

  // Batch path — decode an already-parsed result object (transaction responses are small, so JSON.parse is fine).
  private decodeParsed(result: { fields: NeonField[]; rows: (string | null)[][]; command?: string | null; rowCount?: number | null }, mode: ResultMode, shape: ShapeSpec | ShapeMapper | undefined): QueryResult<never> {
    const cols = this.planCols(result.fields, shape)
    const ncols = cols.length
    const mapper = mode === 'array' || mode === 'object' ? this.mapperFactory(cols, mode, this.decoders) : null
    const rb = new RowBuf()
    const rows = result.rows.map((row) => {
      rb.reset()
      for (let c = 0; c < ncols; c++) rb.pushText(row[c] ?? null)
      return this.rowFrom(mode, mapper, rb.finish(ncols))
    })
    return { rows: rows as never[], columns: cols.map((c) => c.name), rowCount: result.rowCount ?? rows.length, command: result.command ?? null }
  }

  /** Run one SQL statement over HTTP and return a QueryResult. `sql` may be a string or builder chunks. */
  query(sql: string, params: unknown[], opts: { shape: ShapeSpec | ShapeMapper; mode?: 'object'; timeout?: number; signal?: AbortSignal }): Promise<QueryResult<Record<string, unknown>>>
  query(sql: string, params?: unknown[], opts?: { mode?: 'array'; shape?: ShapeSpec | ShapeMapper; timeout?: number; signal?: AbortSignal }): Promise<QueryResult<unknown[]>>
  query(sql: string, params: unknown[], opts: { mode: 'object'; shape?: ShapeSpec | ShapeMapper; timeout?: number; signal?: AbortSignal }): Promise<QueryResult<Record<string, unknown>>>
  query(sql: string, params: unknown[], opts: { mode: 'buffer'; timeout?: number; signal?: AbortSignal }): Promise<QueryResult<(Buffer | null)[]>>
  query(sql: string, params: unknown[], opts: { mode: 'raw'; timeout?: number; signal?: AbortSignal }): Promise<QueryResult<Buffer>>
  async query(sql: string, params: unknown[] = [], opts: NeonHttpQueryOptions = {}): Promise<QueryResult<never>> {
    const mode: ResultMode = opts.mode ?? (opts.shape ? 'object' : 'array')
    const query = sql
    const tx = TX_SQL.exec(query)
    if (tx) throw new Error(`minipg/neon-http: "${tx[1]!.toUpperCase()}" does NOTHING over stateless HTTP — every query() runs in its OWN session, so hand-rolled BEGIN…COMMIT gives zero atomicity with no error; use transaction([...]) for an atomic batch, or minipg/neon-ws for interactive transactions`)
    const res = await this.post({ query, params: encodeParams(params) }, await this.headers(), this.signalFor(opts))
    return this.decodeSingleRaw(Buffer.from(await res.arrayBuffer()), mode, opts.shape)
  }

  /** Run a set of queries as ONE ATOMIC transaction in a single request (BEGIN…COMMIT server-side, or
   *  ROLLBACK on any error). Results in input order. This is the transaction primitive for stateless HTTP;
   *  the interactive `begin(fn)` form is not available (use minipg/neon-ws for that). */
  async transaction(queries: NeonTxQuery[], opts: NeonTxOptions = {}): Promise<QueryResult[]> {
    if (typeof queries === 'function') throw new Error('minipg/neon-http: interactive transaction(fn) is not available over stateless HTTP — pass an ARRAY of queries for an atomic batch, or use minipg/neon-ws for interactive transactions')
    for (const q of queries) { const tx = TX_SQL.exec(q.sql); if (tx) throw new Error(`minipg/neon-http: "${tx[1]!.toUpperCase()}" inside transaction([...]) — the batch is ALREADY wrapped in BEGIN…COMMIT server-side; a nested one would silently break its atomicity`) }
    const headers = await this.headers()
    if (opts.isolation) headers['Neon-Batch-Isolation-Level'] = ISO_HEADER[opts.isolation]
    if (opts.readOnly != null) headers['Neon-Batch-Read-Only'] = String(opts.readOnly)
    if (opts.deferrable != null) headers['Neon-Batch-Deferrable'] = String(opts.deferrable)
    const body = { queries: queries.map((q) => ({ query: q.sql, params: encodeParams(q.params ?? []) })) }
    const res = await this.post(body, headers, this.signalFor(opts))
    const j = (await res.json()) as { results: Array<{ fields: NeonField[]; rows: (string | null)[][]; command?: string | null; rowCount?: number | null }> }
    return j.results.map((r, i) => { const q = queries[i]!; return this.decodeParsed(r, q.mode ?? (q.shape ? 'object' : 'array'), q.shape) })
  }

  /** No-op — HTTP holds no connection. Present for API symmetry. */
  async end(): Promise<void> { /* nothing to close */ }
}

/** Create a Neon HTTP client. Accepts a connection string or a config object. */
export async function connect(config: string | NeonHttpConfig = {}): Promise<NeonHttpClient> {
  return new NeonHttpClient(config)
}

/** Alias of `connect` — HTTP is connectionless, so there is no pool to manage (returns the same client). */
export function createPool(config: string | NeonHttpConfig = {}): NeonHttpClient {
  return new NeonHttpClient(config)
}

export { PgError, defaultDecoders }
