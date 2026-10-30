// Drizzle Postgres for Deno — `import { connect, createPool } from '@drizzle-team/postgres/deno'`.
// Also what the ROOT entry resolves to under the `deno` export condition (package.json), so it
// exposes the whole public API: its own connect/createPool plus everything in ./api.ts.
// Same driver, Deno's TCP transport: Deno.connect (plus Deno.startTls for the SSLRequest upgrade —
// never connectTls, see below) gives WHATWG streams, bridged to the Node Duplex the core uses.
// (node:stream + node:crypto come from Deno's Node-compat layer.)
import { registerDefaultTransport } from './connection.ts';
import { connect as coreConnect, type Connection, createPool as corePool, type Pool } from './core.ts';
import type { ConnectConfig, PoolConfig, Transport, TransportTarget } from './types.ts';
import { refuseChannelBinding } from './url.ts';
import { duplexFromWeb, negotiateSslRequest, sendCancelRequest } from './webstream.ts';

// A connected Deno.Conn, plaintext or upgraded to TLS. The query connection and the cancel connection
// both open one, and both do the SSLRequest exchange first.
async function openConnection(c: TransportTarget) {
	if (typeof Deno === 'undefined' || !Deno) {
		throw new Error(
			'@drizzle-team/postgres/deno: the Deno global is not available (run under Deno, or use @drizzle-team/postgres/node)',
		);
	}
	// unix socket (?host=/var/run/postgresql) — never TLS, same as the node transport
	if (c.path) return Deno.connect({ transport: 'unix', path: c.path });
	const conn = await Deno.connect({ hostname: c.host, port: c.port });
	if (!c.ssl) return conn;
	const sslObj = typeof c.ssl === 'object' ? (c.ssl as { ca?: unknown; servername?: string }) : undefined;
	const caCerts = certList(sslObj?.ca);
	// Deno verifies the certificate against this name; honor an explicit ssl.servername exactly as the
	// node transport does (needed when dialing by IP a cert issued for a hostname).
	const tlsHost = sslObj?.servername ?? c.host;
	// Postgres has NO implicit TLS: Deno.connectTls would send a ClientHello where the server expects a
	// startup packet. Do the SSLRequest dance first, then upgrade the SAME socket (as @drizzle-team/postgres/cf does).
	await negotiateSslRequest(conn.readable, conn.writable);
	return Deno.startTls(conn, caCerts ? { hostname: tlsHost, caCerts } : { hostname: tlsHost });
}

/** Dials and cancels through Deno.connect. */
export const denoTransport = {
	connect: async (c: TransportTarget) => {
		const conn = await openConnection(c);
		return duplexFromWeb(conn.readable, conn.writable);
	},
	cancel: async (c: TransportTarget, key: { pid: number; secret: number }) => {
		const conn = await openConnection(c);
		try {
			await sendCancelRequest(conn.readable, conn.writable, key);
		} finally {
			try {
				conn.close();
			} catch { /* already closed */ }
		}
	},
} satisfies Transport;
// Replication dials only through the registered transport.
registerDefaultTransport(denoTransport.connect, denoTransport.cancel);

// ssl.ca as Deno's caCerts (PEM strings). Accepts the node shapes: one PEM, a Buffer, or an array.
function certList(ca: unknown): string[] | undefined {
	if (ca == null) return undefined;
	const one = (v: unknown): string => (typeof v === 'string' ? v : new TextDecoder().decode(v as Uint8Array));
	return (Array.isArray(ca) ? ca : [ca]).map(one);
}

const NO_BINDING =
	'Deno.TlsConn exposes only handshake(), and node:tls under Deno returns a certificate with no raw DER';
export async function connect(config: string | ConnectConfig = {}): Promise<Connection> {
	const c = typeof config === 'string' ? { url: config } : config;
	return coreConnect({ ...refuseChannelBinding(c, 'deno', NO_BINDING), transport: denoTransport });
}
export function createPool(config: string | PoolConfig = {}): Pool {
	const c = typeof config === 'string' ? { url: config } : config;
	return corePool({ ...refuseChannelBinding(c, 'deno', NO_BINDING), transport: denoTransport });
}
export * from './api.ts'; // the rest of the public API (everything but connect/createPool)
