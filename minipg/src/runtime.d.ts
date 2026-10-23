// Ambient declarations for runtime-specific transports used by the multi-runtime entry points
// (src/deno.ts, src/cf.ts). Typed loosely so the repo typechecks under Node/tsc; the real
// implementations are provided by Deno / Cloudflare Workers at runtime.

/** A connected byte stream exposing WHATWG Web streams (Deno.Conn, Cloudflare Socket). */
interface WebByteStream {
  readable: unknown // ReadableStream<Uint8Array>
  writable: unknown // WritableStream<Uint8Array>
}

/** Minimal slice of the Deno global we use (TCP + unix connect, and the STARTTLS upgrade). */
declare const Deno: {
  connect(opts: { hostname: string; port: number; transport?: 'tcp' }): Promise<DenoConn>
  connect(opts: { transport: 'unix'; path: string }): Promise<DenoConn>
  connectTls(opts: { hostname: string; port: number }): Promise<DenoConn>
  /** Upgrade an established plaintext conn to TLS — Postgres' SSLRequest dance needs this, not
   *  connectTls (the server speaks plaintext until it answers 'S'). */
  startTls(conn: DenoConn, opts?: { hostname?: string; caCerts?: string[] }): Promise<DenoConn>
} | undefined

interface DenoConn extends WebByteStream { close(): void }

/** Cloudflare Workers raw-TCP module (requires the `nodejs_compat` flag for Buffer/node:crypto/node:stream). */
declare module 'cloudflare:sockets' {
  interface CfSocket {
    readable: unknown // ReadableStream<Uint8Array>
    writable: unknown // WritableStream<Uint8Array>
    opened: Promise<unknown>
    /** Settles when the socket closes; REJECTS with the failure (workerd reports TLS handshake
     *  errors here — `opened` can stay pending forever on a failed startTls). */
    closed: Promise<unknown>
    close(): Promise<void>
    /** Upgrade a `secureTransport: 'starttls'` socket to TLS. Both stream locks must be released
     *  first; workerd rejects the `expectedServerHostname` option (SNI = the connect() hostname). */
    startTls(): CfSocket
  }
  export function connect(
    address: { hostname: string; port: number } | string,
    options?: { secureTransport?: 'off' | 'on' | 'starttls'; allowHalfOpen?: boolean },
  ): CfSocket
}
