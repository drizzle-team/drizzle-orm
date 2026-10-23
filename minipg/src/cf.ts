// minipg for Cloudflare Workers — `import { connect, createPool } from 'minipg/cf'`.
// Also what the ROOT entry resolves to under the `workerd` export condition (package.json), so it
// exposes the whole public API: its own connect/createPool plus everything in ./api.ts.
// Uses Cloudflare's raw-TCP `connect()` from 'cloudflare:sockets'. Requires the `nodejs_compat`
// compatibility flag (for Buffer, node:crypto, node:stream). TLS uses Postgres' STARTTLS dance:
// plaintext SSLRequest -> 'S' -> startTls() (Postgres has no implicit TLS; see negotiateSslRequest).
import { connect as cfConnect } from 'cloudflare:sockets'
import { registerDefaultTransport } from './connection.ts'
import { connect as coreConnect, createPool as corePool, type Connection, type Pool } from './core.ts'
import type { ConnectConfig, PoolConfig, Transport, TransportTarget } from './types.ts'
import { refuseChannelBinding } from './url.ts'
import { duplexFromWeb, negotiateSslRequest, sendCancelRequest } from './webstream.ts'
export { negotiateSslRequest }

// A connected socket, plaintext or upgraded to TLS. The query connection and the cancel connection
// both open one, and both do the SSLRequest exchange first.
async function openSocket(c: TransportTarget) {
  const tls = !!c.ssl
  const socket = cfConnect({ hostname: c.host, port: c.port }, { secureTransport: tls ? 'starttls' : 'off', allowHalfOpen: false })
  await socket.opened // TCP established (plaintext either way; TLS is negotiated below on request)
  if (!tls) return socket
  await negotiateSslRequest(socket.readable, socket.writable)
  // NB cloudflare:sockets verifies the server cert whenever TLS is on, so sslmode=require
  // (encrypt-without-verify elsewhere) effectively behaves like verify-full here. No
  // expectedServerHostname: workerd rejects the option; SNI defaults to the connect() hostname.
  const secure = socket.startTls()
  // workerd reports a handshake failure (an untrusted certificate, for example) in one of two ways,
  // depending on its version: `opened` rejects with a generic "internal error", or `closed` settles
  // while `opened` stays pending forever. Race them, and name the TLS step in both cases.
  const handshakeFailed = (e: unknown): never => {
    throw new Error(`minipg/cf: TLS handshake failed during startTls — ${(e as Error)?.message ?? e}`, { cause: e })
  }
  await Promise.race([
    secure.opened.catch(handshakeFailed),
    secure.closed.then(
      () => { throw new Error('minipg/cf: TLS handshake failed — connection closed during startTls (untrusted certificate?)') },
      handshakeFailed,
    ),
  ])
  return secure
}

/** Dials and cancels through cloudflare:sockets. */
export const cfTransport = {
  connect: async (c: TransportTarget) => { const socket = await openSocket(c); return duplexFromWeb(socket.readable, socket.writable) },
  cancel: async (c: TransportTarget, key: { pid: number; secret: number }) => {
    const socket = await openSocket(c)
    try { await sendCancelRequest(socket.readable, socket.writable, key) } finally { socket.close().catch(() => { /* already closed */ }) }
  },
} satisfies Transport
// Replication dials only through the registered transport.
registerDefaultTransport(cfTransport.connect, cfTransport.cancel)

const NO_BINDING = 'the cloudflare:sockets Socket in workerd exposes no certificate API (only close/closed/opened/readable/startTls/writable)'
export async function connect(config: string | ConnectConfig = {}): Promise<Connection> { const c = typeof config === 'string' ? { url: config } : config; return coreConnect({ ...refuseChannelBinding(c, 'cf', NO_BINDING), transport: cfTransport }) }
export function createPool(config: string | PoolConfig = {}): Pool { const c = typeof config === 'string' ? { url: config } : config; return corePool({ ...refuseChannelBinding(c, 'cf', NO_BINDING), transport: cfTransport }) }
export * from './api.ts' // the rest of the public API (everything but connect/createPool)
