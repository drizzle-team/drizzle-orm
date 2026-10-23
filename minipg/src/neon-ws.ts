// minipg for Neon over WebSocket — `import { connect, createPool } from 'minipg/neon-ws'`.
//
// Neon's serverless WebSocket proxy tunnels the REAL PostgreSQL wire protocol over a `wss://<host>/v2`
// WebSocket, so minipg speaks unmodified Postgres to it: prepared statements, pipelining, transactions,
// and streaming all work exactly as over a raw TCP socket. This entry only supplies `config.socket` — a
// Node Duplex bridged over a WebSocket — so NOTHING in the core changes.
//
// The WS transport is already TLS-encrypted (`wss://`), and Neon's proxy forces Postgres-level SSL off
// (its `forceDisablePgSSL`), so minipg sends NO SSLRequest — the StartupMessage goes directly. Auth is
// the normal SCRAM-SHA-256 handshake over the tunnel (channel binding is impossible through the proxy,
// and src/auth.ts already does plain SCRAM). Defaults mirror @neondatabase/serverless: proxy address
// `host => `${host}/v2``, `wss://`.
import { Duplex } from 'node:stream'
import { connect as coreConnect, createPool as corePool, Connection, Pool, PgError, defaultDecoders } from './core.ts'
import { relaxChannelBinding, resolveUrl } from './url.ts'
import type { ConnectConfig, PoolConfig } from './types.ts'

// Minimal structural type for a WHATWG WebSocket — the global on Node ≥22, Bun, Deno, Cloudflare Workers
// and browsers; the `ws` package's WebSocket is compatible. Kept structural so this build needs no DOM lib.
interface WSLike {
  binaryType: string
  send(data: ArrayBufferView | ArrayBuffer): void
  close(code?: number, reason?: string): void
  addEventListener(type: 'open', cb: () => void): void
  addEventListener(type: 'close', cb: (ev: { code?: number; reason?: string }) => void): void
  addEventListener(type: 'error', cb: (ev: unknown) => void): void
  addEventListener(type: 'message', cb: (ev: { data: unknown }) => void): void
}
type WebSocketCtor = new (url: string) => WSLike

/** Neon-WebSocket-specific options, layered on top of the usual ConnectConfig / PoolConfig. */
export interface NeonWsExtra {
  /** WebSocket constructor. Defaults to the global `WebSocket` (Node ≥22, Bun, Deno, Cloudflare Workers,
   *  browsers). On older Node, pass the `ws` package's constructor: `{ webSocketConstructor: WebSocket }`. */
  webSocketConstructor?: WebSocketCtor
  /** Build the proxy address (scheme-less) from host+port. Default `host => `${host}/v2`` — Neon's
   *  per-endpoint WS proxy, routed by the TLS SNI of the host (which encodes the endpoint id). */
  wsProxy?: (host: string, port: number) => string
  /** Use `wss://` (default true). Set false only for a local/plaintext proxy in development. */
  secure?: boolean
}

export type NeonConnectConfig = ConnectConfig & NeonWsExtra
export type NeonPoolConfig = PoolConfig & NeonWsExtra

// The actionable text a WebSocket error carries. The `ws` package's ErrorEvent puts the real cause on
// `.error` ("Unexpected server response: 429", "getaddrinfo ENOTFOUND …", TLS failures) with a copy on
// `.message`; browser/undici events may carry neither. Replacing that with a constant string — as this
// module used to — is how a connect failure becomes undiagnosable.
function wsErrorCause(ev: unknown): unknown {
  const e = ev as { error?: unknown; message?: unknown } | null
  return e?.error ?? (typeof e?.message === 'string' ? e.message : undefined)
}
const causeText = (c: unknown): string => (c instanceof Error ? c.message : typeof c === 'string' ? c : '')
const withCause = (msg: string, cause: unknown): Error => {
  const t = causeText(cause)
  return new Error(t ? `${msg}: ${t}` : msg, cause === undefined ? undefined : { cause })
}

// WS frame payload -> Buffer. arraybuffer (what we request) and any typed-array (Bun's 'nodebuffer')
// are handled; a string frame is never expected for the binary PG protocol but is decoded defensively.
function toBuffer(data: unknown): Buffer {
  if (data instanceof ArrayBuffer) return Buffer.from(data)
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  if (typeof data === 'string') return Buffer.from(data, 'utf8')
  return Buffer.from(data as ArrayBuffer)
}

// Bridge a WebSocket to the Node Duplex the core uses as its byte transport. Outbound Buffers become WS
// binary frames; inbound frames are pushed as Buffer chunks (the PG Parser reassembles messages across
// arbitrary chunk boundaries, so no frame-coalescing is needed — WS already guarantees ordered delivery).
// allowHalfOpen:false makes it behave like a real socket: when the WS closes, the readable ends, both
// sides finish, and the stream auto-destroys — giving the core the 'close' it uses to detect a drop.
function duplexFromWebSocket(ws: WSLike): Duplex {
  ws.binaryType = 'arraybuffer'
  const duplex = new Duplex({
    allowHalfOpen: false,
    read() { /* push-driven: frames are pushed from the 'message' handler */ },
    write(chunk: Buffer, _enc: BufferEncoding, cb: (err?: Error | null) => void) {
      try { ws.send(chunk); cb() } catch (e) { cb(e as Error) }
    },
    final(cb: (err?: Error | null) => void) { try { ws.close() } catch { /* already closing */ } cb() },
    destroy(err: Error | null, cb: (err?: Error | null) => void) { try { ws.close() } catch { /* */ } cb(err) },
  })
  ws.addEventListener('message', (ev) => { duplex.push(toBuffer(ev.data)) })
  ws.addEventListener('close', () => { duplex.push(null) }) // end readable -> (allowHalfOpen:false) auto-destroy -> 'close'
  ws.addEventListener('error', (ev) => {
    if (duplex.destroyed) return
    // Destroying with an error emits 'error' on the stream — which THROWS (crashing the process) when
    // nobody is listening yet. Pre-open the duplex has no owner: the connect promise has not resolved
    // with it, so the core has attached nothing. There the rejection carries the cause instead.
    if (duplex.listenerCount('error') === 0) duplex.destroy()
    else duplex.destroy(withCause('minipg/neon-ws: websocket error', wsErrorCause(ev)))
  })
  return duplex
}

// Resolve the wss URL + WebSocket constructor once, and return a factory that opens a FRESH socket per
// call (the pool invokes it for every connection). Resolves on 'open'; rejects on a pre-open error.
function neonSocket(config: NeonConnectConfig): () => Promise<Duplex> {
  const c = resolveUrl(config) // fold the url in so host/port are resolved even when passed as a string
  const host = c.host ?? process.env.PGHOST ?? 'localhost'
  const port = c.port ?? (Number(process.env.PGPORT) || 5432)
  const WS = config.webSocketConstructor ?? (globalThis as { WebSocket?: WebSocketCtor }).WebSocket
  if (!WS) throw new Error("minipg/neon-ws: no WebSocket constructor available — on Node < 22 pass { webSocketConstructor } (e.g. the 'ws' package)")
  const secure = config.secure ?? true
  const addr = (config.wsProxy ?? ((h: string) => `${h}/v2`))(host, port)
  const url = `${secure ? 'wss' : 'ws'}://${addr}`
  return () => new Promise<Duplex>((resolve, reject) => {
    let settled = false
    let ws: WSLike
    try { ws = new WS(url) } catch (e) { return reject(e as Error) }
    const duplex = duplexFromWebSocket(ws)
    ws.addEventListener('open', () => { if (!settled) { settled = true; resolve(duplex) } })
    // a socket error before 'open' fails the connect attempt; after 'open' it surfaces via the duplex 'close'
    ws.addEventListener('error', (ev) => {
      if (settled) return
      settled = true
      reject(withCause(`minipg/neon-ws: failed to open WebSocket to ${url}`, wsErrorCause(ev)))
    })
    // A socket that closes WITHOUT ever emitting 'error' (some proxies just hang up) would otherwise
    // leave this promise pending until connectTimeout — settle it here with the close code instead.
    ws.addEventListener('close', (ev) => {
      if (settled) return
      settled = true
      reject(new Error(`minipg/neon-ws: WebSocket to ${url} closed before opening (code ${ev?.code ?? 'unknown'}${ev?.reason ? `: ${ev.reason}` : ''})`))
    })
  })
}

// ssl is forced off on this path: the wss tunnel already encrypts and Neon's proxy skips PG-level SSL,
// so no SSLRequest is sent. (Passing config.socket bypasses the net/tls transport entirely regardless.)
// relaxChannelBinding for the same reason: SCRAM binding needs the server certificate, and this transport
// has none to expose — the TLS lives in the wss tunnel. Neon prints `channel_binding=require` on every URL
// it issues, so rejecting it would reject the provider's own default connection string.

/** Open and authenticate a single connection to Neon over its WebSocket proxy. Accepts a config or a
 *  `postgres://…neon.tech/db?sslmode=require` connection string. */
export function connect(config: string | NeonConnectConfig = {}): Promise<Connection> {
  const c: NeonConnectConfig = typeof config === 'string' ? { url: config } : config
  return coreConnect({ ...relaxChannelBinding(c), ssl: false, socket: neonSocket(c) })
}

/** Create a lazy connection pool over Neon's WebSocket proxy. Accepts a config or a connection string. */
export function createPool(config: string | NeonPoolConfig = {}): Pool {
  const c: NeonPoolConfig = typeof config === 'string' ? { url: config } : config
  return corePool({ ...relaxChannelBinding(c), ssl: false, socket: neonSocket(c) })
}

export { Connection, Pool, PgError, defaultDecoders }
export type { ConnectConfig, PoolConfig }
