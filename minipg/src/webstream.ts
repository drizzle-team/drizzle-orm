import { W } from './protocol.ts';
type ByteReader = {
	read(): Promise<{ value?: Uint8Array; done: boolean }>;
	releaseLock(): void;
	cancel?(reason?: unknown): Promise<void>;
	closed?: Promise<void>;
};
type ByteWriter = {
	write(b: Uint8Array): Promise<unknown>;
	releaseLock(): void;
	close?(): Promise<void>;
	abort?(reason?: unknown): Promise<void>;
};

/** Postgres' STARTTLS exchange over a plaintext socket: send the 8-byte SSLRequest, read the
 *  one-byte reply, fail closed on anything but a bare 'S'. Postgres has NO implicit TLS — a
 *  `secureTransport: 'on'` socket would send a TLS ClientHello where the server expects a startup
 *  packet. Lives here (not cf.ts) so unit tests can import it without the cloudflare:sockets specifier. */
export async function negotiateSslRequest(readable: unknown, writable: unknown): Promise<void> {
	const reader = (readable as { getReader(): ByteReader }).getReader();
	const writer = (writable as { getWriter(): ByteWriter }).getWriter();
	try {
		await writer.write(W.sslRequest());
		const { value, done } = await reader.read();
		if (done || !value || value.byteLength === 0) {
			throw new Error('minipg/cf: connection closed during the SSLRequest exchange');
		}
		const b = value[0]!;
		if (b === 0x4e) {
			throw Object.assign(
				new Error(
					"minipg/cf: server refused TLS ('N' to SSLRequest) — sslmode=require cannot proceed (is ssl enabled server-side?)",
				),
				{ fatal: true },
			); // 'N'
		}
		if (b !== 0x53) {
			throw Object.assign(
				new Error(`minipg/cf: unexpected SSLRequest reply 0x${b.toString(16)} — not a Postgres server?`),
				{ fatal: true },
			); // not 'S'
		}
		if (value.byteLength > 1) {
			throw new Error('minipg/cf: unexpected data after the SSLRequest reply — refusing to upgrade'); // nothing may be buffered past 'S'
		}
	} finally {
		reader.releaseLock();
		writer.releaseLock(); // BOTH locks must be free before startTls()
	}
}

/** Sends a CancelRequest and waits until the server closes the connection, which it does only after it
 *  has signaled the backend. */
export async function sendCancelRequest(
	readable: unknown,
	writable: unknown,
	key: { pid: number; secret: number },
): Promise<void> {
	const reader = (readable as { getReader(): ByteReader }).getReader();
	const writer = (writable as { getWriter(): ByteWriter }).getWriter();
	try {
		await writer.write(W.cancelRequest(key.pid, key.secret));
		while (!(await reader.read()).done) { /* the server sends nothing back */ }
	} finally {
		reader.releaseLock();
		writer.releaseLock();
	}
}

// Bridge a runtime's WHATWG Web streams (Deno.Conn / Cloudflare Socket expose `.readable`/`.writable`)
// into a Node Duplex the core connection uses as its transport. Chunks arrive as Uint8Array; the
// connection's onData wraps them as Buffer views (no copy). Requires node:stream (present in Node/Bun,
// and in Deno / Cloudflare Workers with nodejs_compat).
import { Duplex } from 'node:stream';

export function duplexFromWeb(readable: unknown, writable: unknown): Duplex {
	// Hand-rolled rather than Duplex.from({ readable, writable }): that overload is Node-only — Deno's
	// node:stream compat rejects it outright (ERR_INVALID_ARG_TYPE, surfacing as the baffling "Cannot read
	// properties of undefined (reading 'endsWith')"), which made minipg/deno fail on EVERY connect. The
	// explicit bridge below uses nothing but the Web Streams API and the Duplex constructor.
	const reader = (readable as { getReader(): ByteReader }).getReader();
	const writer = (writable as { getWriter(): ByteWriter }).getWriter();
	// workerd rejects `closed` when destroy() cancels the reader, and reports that rejection as
	// unhandled unless someone listens. The pump already sees the same error through read().
	reader.closed?.catch(() => {/* handled by the pump */});
	let pumping = false;
	const duplex: Duplex = new Duplex({
		allowHalfOpen: false, // peer EOF finishes both sides and auto-destroys -> the core sees its 'close'
		read() {
			if (pumping) return; // one pump at a time; a backpressure pause resumes through this same call
			pumping = true;
			void (async () => {
				try {
					for (;;) {
						const { value, done } = await reader.read();
						if (done) {
							pumping = false;
							duplex.push(null);
							return;
						}
						if (value === undefined || value.byteLength === 0) continue;
						// Buffer VIEW over the chunk (no copy) — the protocol Parser copies whatever it retains
						if (!duplex.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength))) {
							pumping = false;
							return;
						}
					}
				} catch (e) {
					pumping = false;
					if (!duplex.destroyed) duplex.destroy(e as Error);
				}
			})();
		},
		write(chunk: Buffer, _enc: BufferEncoding, cb: (err?: Error | null) => void) {
			writer.write(chunk).then(() => cb(), (e: unknown) => cb(e as Error));
		},
		final(cb: (err?: Error | null) => void) { // half-close: the peer may already be gone, which is fine
			if (!writer.close) return cb();
			writer.close().then(() => cb(), () => cb());
		},
		destroy(err: Error | null, cb: (err?: Error | null) => void) {
			reader.cancel?.().catch(() => {/* already closed */});
			writer.abort?.().catch(() => {/* already closed/closing */});
			cb(err);
		},
	});
	return duplex;
}
