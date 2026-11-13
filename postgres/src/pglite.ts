// Drizzle Postgres on an in-process PGlite — `import { createPool } from '@drizzle-team/postgres/pglite'`:
//
//   const pg = await PGlite.create();
//   const pool = createPool(pg);
//
// No TCP, no Unix socket, no pglite-socket server: the driver writes the wire protocol into a socket whose far
// end is `pg.execProtocolRawStream()`, and reads PGlite's raw response bytes back. Named statements,
// pipelining, transactions and the JIT row mappers all work as against a server. This entry imports nothing
// from PGlite; the instance is typed by the few methods it uses.
//
// PGlite is ONE Postgres backend with one session, which a server connection is not:
//   - Startup parameters are ignored by PGlite (application_name, `options` such as `-c search_path=…`,
//     statement_timeout). The socket applies them with set_config() right after startup, and forwards the
//     ParameterStatus messages that produces, so the driver sees the session it asked for. `user` and
//     `database` are whatever the PGlite instance runs as.
//   - The session outlives a connection: prepared statements, an open transaction, temporary tables and
//     settings stay. When the driver closes its connection, the socket ends the session the way a
//     disconnect would: ROLLBACK if a transaction is open, then DISCARD ALL. So prepared statements don't
//     collide when the next connection opens, and a broken connection can't leave a transaction behind.
//     DISCARD ALL also resets settings made directly on the PGlite instance.
//   - Only one driver connection can use an instance at a time, so a pool has exactly one connection
//     (`max: 1`); queries share it through pipelining and wait behind a transaction. A second pool or
//     connect() on the same instance fails while the first is open.
//   - PGlite's own pg.query()/pg.exec()/pg.transaction() take its transaction lock, then its query lock.
//     The socket takes the same locks, in the same order, for every batch of writes, and keeps the
//     transaction lock while the session is inside a transaction. So a direct pg.query() never lands inside a
//     driver transaction, and a driver statement never lands inside a pg.transaction(). Calling one from
//     inside the other's transaction waits forever, as it would for any other lock held by the caller.
//   - There is no out-of-band cancel: the engine runs on this thread, so a running statement can't be
//     interrupted. Canceling a query (AbortSignal, a timeout) closes the connection once it is its turn.
import { addBrand } from './brand.ts';
import { connect as coreConnect, Connection, createPool as corePool, defaultDecoders, PgError, Pool } from './core.ts';
import type { ConnectConfig, PoolConfig, PostgresSocket, Transport } from './types.ts';

/** The part of a PGlite instance this entry uses (PGlite 0.3 and later). */
export interface PGliteLike {
	/** Settles once the instance has started (`new PGlite()` starts it in the background). */
	waitReady?: Promise<unknown>;
	execProtocolRawStream(
		message: Uint8Array,
		options: { syncToFs?: boolean; onRawData: (data: Uint8Array) => void },
	): Promise<unknown>;
	/** PGlite's query lock. */
	runExclusive<T>(fn: () => Promise<T>): Promise<T>;
	/** PGlite's transaction lock, which pg.query() and pg.transaction() take before the query lock. */
	_runExclusiveTransaction?<T>(fn: () => Promise<T>): Promise<T>;
}

/** Config for createPool()/connect() on a PGlite: a server's connection settings don't apply. */
type Target = 'url' | 'host' | 'port' | 'path' | 'ssl' | 'socket' | 'transport' | 'channelBinding' | 'password';
export type PGliteConnectConfig = Omit<ConnectConfig, Target>;
export type PGlitePoolConfig = Omit<PoolConfig, Target | 'max'> & {
	/** Always 1: PGlite runs one session (see the file header). */
	max?: 1;
};

const T_READY = 0x5a; // 'Z' ReadyForQuery
const T_ERROR = 0x45; // 'E' ErrorResponse
const T_PARAM = 0x53; // 'S' ParameterStatus
const TERMINATE = 0x58; // 'X'
const PROTOCOL_3 = 196608;
const IDLE = 0x49; // 'I'

const enc = new TextEncoder();
const dec = new TextDecoder();

/** A simple-protocol Query message. */
function queryMessage(sql: string): Uint8Array {
	const body = enc.encode(sql);
	const m = new Uint8Array(6 + body.length);
	const v = new DataView(m.buffer);
	m[0] = 0x51; // 'Q'
	v.setUint32(1, 5 + body.length);
	m.set(body, 5);
	return m;
}

/** The messages in a block of backend bytes, as [type, whole message] pairs. */
function* messages(b: Uint8Array): Generator<[number, Uint8Array]> {
	const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
	for (let i = 0; i + 5 <= b.length;) {
		const end = i + 1 + v.getUint32(i + 1);
		yield [b[i]!, b.subarray(i, end)];
		i = end;
	}
}

const isStartup = (m: Uint8Array): boolean =>
	m.length >= 8 && new DataView(m.buffer, m.byteOffset, m.byteLength).getUint32(4) === PROTOCOL_3;

/** The key/value pairs of a StartupMessage. */
function startupParams(m: Uint8Array): Map<string, string> {
	const out = new Map<string, string>();
	const parts = dec.decode(m.subarray(8)).split('\0');
	for (let i = 0; i + 1 < parts.length && parts[i]; i += 2) out.set(parts[i]!, parts[i + 1]!);
	return out;
}

/** The `-c name=value` / `--name=value` settings of an `options` startup parameter (backslash escapes a
 *  space or a backslash, as the server parses it). */
function optionSettings(options: string): Array<[string, string]> {
	const words: string[] = [];
	let cur = '';
	let has = false;
	for (let i = 0; i < options.length; i++) {
		const ch = options[i]!;
		if (ch === '\\' && i + 1 < options.length) {
			cur += options[++i];
			has = true;
		} else if (ch === ' ' || ch === '\t' || ch === '\n') {
			if (has) words.push(cur);
			cur = '';
			has = false;
		} else {
			cur += ch;
			has = true;
		}
	}
	if (has) words.push(cur);
	const out: Array<[string, string]> = [];
	for (let i = 0; i < words.length; i++) {
		let w = words[i]!;
		if (w === '-c' && i + 1 < words.length) w = words[++i]!;
		else if (w.startsWith('-c')) w = w.slice(2);
		else if (w.startsWith('--')) w = w.slice(2);
		else continue;
		const eq = w.indexOf('=');
		if (eq > 0) out.push([w.slice(0, eq).replaceAll('-', '_'), w.slice(eq + 1)]);
	}
	return out;
}

// Startup parameters a server applies to the session, other than `options`. client_encoding is UTF8 on both
// ends, and user/database are the instance's own.
const SESSION_PARAMS = [
	'application_name',
	'DateStyle',
	'IntervalStyle',
	'statement_timeout',
	'idle_in_transaction_session_timeout',
];

const literal = (s: string): string => `'${s.replaceAll("'", "''")}'`;

/** One PGlite instance's session, shared by the sockets opened on it one after another. */
interface Session {
	live: PGliteSocket | null; // the socket whose connection is open
	ended: Promise<void>; // settles when the previous socket has ended its session
}
const sessions = new WeakMap<object, Session>();

type Listener = (...args: never[]) => void;

/** A Postgres socket whose far end is an in-process PGlite. Use it through createPool()/connect(), or
 *  pgliteSocket() for a `socket` factory of your own. */
export class PGliteSocket implements PostgresSocket {
	readonly #pg: PGliteLike;
	readonly #session: Session;
	readonly #listeners = new Map<string, Listener[]>();
	readonly #queue: Uint8Array[] = [];
	readonly #previous: Promise<void>;
	#draining = false;
	#started = false;
	#closing = false;
	#closed = false;
	#status = IDLE; // the session's transaction status, from the last ReadyForQuery
	#tail = new Uint8Array(6); // the last bytes of the current response, for its ReadyForQuery
	#tailLen = 0;
	#releaseTx: (() => void) | null = null;
	#endSession!: () => void;

	constructor(pg: PGliteLike) {
		this.#pg = pg;
		let session = sessions.get(pg);
		if (!session) sessions.set(pg, session = { live: null, ended: Promise.resolve() });
		if (session.live && !session.live.#closing) {
			throw new Error(
				'@drizzle-team/postgres/pglite: this PGlite already has a driver connection open. PGlite runs one session, '
					+ 'so use one pool (or connection) per instance, and end it before opening another',
			);
		}
		this.#session = session;
		session.live = this;
		this.#previous = session.ended;
		session.ended = new Promise((r) => (this.#endSession = r));
	}

	on(event: string, listener: Listener): this {
		const list = this.#listeners.get(event);
		if (list) list.push(listener);
		else this.#listeners.set(event, [listener]);
		return this;
	}

	once(event: string, listener: Listener): this {
		const wrapped = ((...args: never[]) => {
			this.off(event, wrapped);
			listener(...args);
		}) as Listener;
		return this.on(event, wrapped);
	}

	off(event: string, listener: Listener): this {
		const list = this.#listeners.get(event);
		const i = list ? list.indexOf(listener) : -1;
		if (i >= 0) list!.splice(i, 1);
		return this;
	}

	removeListener(event: string, listener: Listener): this {
		return this.off(event, listener);
	}

	listenerCount(event: string): number {
		return this.#listeners.get(event)?.length ?? 0;
	}

	#emit(event: 'data', data: Uint8Array): void;
	#emit(event: 'error', err: Error): void;
	#emit(event: 'close'): void;
	#emit(event: string, arg?: unknown): void {
		const list = this.#listeners.get(event);
		if (!list) return;
		for (const l of list.slice()) (l as (a?: unknown) => void)(arg); // a snapshot: once() listeners remove themselves
	}

	write(data: Uint8Array): boolean {
		if (this.#closing) return false;
		if (data.length === 5 && data[0] === TERMINATE) {
			this.#close(); // never sent: PGlite's backend would exit
			return true;
		}
		this.#queue.push(data.slice()); // the driver reuses its write buffer
		if (!this.#draining) void this.#drain();
		return true;
	}

	end(cb?: () => void): this {
		this.#close();
		if (cb) this.once('close', cb);
		return this;
	}

	destroy(err?: Error): this {
		if (err && !this.#closing) queueMicrotask(() => this.#emit('error', err));
		this.#close();
		return this;
	}

	pause(): void {}

	resume(): void {}

	#close(): void {
		if (this.#closing) return;
		this.#closing = true;
		this.#queue.length = 0; // writes not yet run belong to the closed connection
		if (!this.#draining) void this.#drain();
	}

	// Runs queued writes under PGlite's locks, one batch per lock hold, and ends the session once closing.
	async #drain(): Promise<void> {
		this.#draining = true;
		try {
			const previous = this.#previous; // the previous connection's session reset
			await previous;
			if (!this.#started) await this.#pg.waitReady; // the raw protocol calls don't wait for it, unlike pg.query()
			while (this.#queue.length > 0 || (this.#closing && !this.#closed)) {
				if (!this.#releaseTx) await this.#holdTx();
				await this.#pg.runExclusive(async () => {
					while (this.#queue.length > 0) await this.#run(this.#queue.shift()!);
					if (this.#closing) await this.#endSessionState();
				});
				if (this.#status === IDLE || this.#closing) this.#dropTx();
				if (this.#closing) return this.#finish();
			}
		} catch (e) {
			this.#dropTx();
			if (!this.#closing) this.#emit('error', e as Error);
			this.#closing = true;
			this.#finish();
		} finally {
			this.#draining = false;
		}
	}

	#holdTx(): Promise<void> {
		const lock = this.#pg._runExclusiveTransaction;
		if (!lock) return Promise.resolve();
		return new Promise<void>((held) => {
			void lock.call(this.#pg, () =>
				new Promise<void>((release) => {
					this.#releaseTx = release;
					held();
				}));
		});
	}

	#dropTx(): void {
		const release = this.#releaseTx;
		this.#releaseTx = null;
		release?.();
	}

	async #run(m: Uint8Array): Promise<void> {
		if (!this.#started && isStartup(m)) {
			this.#started = true;
			return this.#startup(m);
		}
		this.#started = true;
		this.#tailLen = 0;
		await this.#pg.execProtocolRawStream(m, {
			onRawData: (d) => {
				this.#track(d);
				if (!this.#closing) this.#emit('data', d.slice()); // PGlite's buffer is a view of its heap
			},
		});
		if (this.#tailLen === 6 && this.#tail[0] === T_READY && this.#tail[4] === 5) this.#status = this.#tail[5]!;
	}

	// A whole response, copied out of PGlite's buffer. Only the streaming call is used: PGlite keeps the last
	// stream's onRawData installed, and execProtocolRaw() then returns nothing (its output goes there).
	async #collect(m: Uint8Array): Promise<Uint8Array> {
		const chunks: Uint8Array[] = [];
		let size = 0;
		await this.#pg.execProtocolRawStream(m, {
			onRawData: (d) => {
				chunks.push(d.slice());
				size += d.length;
			},
		});
		if (chunks.length === 1) return chunks[0]!;
		const out = new Uint8Array(size);
		let at = 0;
		for (const c of chunks) {
			out.set(c, at);
			at += c.length;
		}
		return out;
	}

	// Keeps the last 6 bytes of a response: a response to a Sync ends with ReadyForQuery ('Z', length 5, status).
	#track(d: Uint8Array): void {
		if (d.length >= 6) {
			this.#tail.set(d.subarray(d.length - 6));
			this.#tailLen = 6;
			return;
		}
		const keep = Math.min(this.#tailLen, 6 - d.length);
		this.#tail.copyWithin(0, this.#tailLen - keep, this.#tailLen);
		this.#tail.set(d, keep);
		this.#tailLen = keep + d.length;
	}

	// Startup: PGlite answers the StartupMessage itself (AuthenticationOk … ReadyForQuery) but ignores its
	// parameters. Apply them with set_config(), and put the ParameterStatus messages that reports between
	// PGlite's own and its ReadyForQuery. A setting PGlite rejects fails the startup with that error, as a
	// server would.
	async #startup(m: Uint8Array): Promise<void> {
		const params = startupParams(m);
		const settings: Array<[string, string]> = [];
		for (const k of SESSION_PARAMS) {
			const v = params.get(k);
			if (v !== undefined && v !== '') settings.push([k, v]);
		}
		const options = params.get('options');
		if (options) settings.push(...optionSettings(options));
		const reply = await this.#collect(m);
		let applied: Uint8Array[] = [];
		if (settings.length > 0) {
			const sql = `select ${settings.map(([k, v]) => `set_config(${literal(k)}, ${literal(v)}, false)`).join(', ')}`;
			const res = await this.#collect(queryMessage(sql));
			for (const [type, msg] of messages(res)) {
				if (type === T_ERROR) {
					this.#emit('data', msg.slice());
					this.#closing = true;
					this.#queue.length = 0;
					return;
				}
				if (type === T_PARAM) applied.push(msg.slice());
			}
		}
		const out: Uint8Array[] = [];
		for (const [type, msg] of messages(reply)) {
			if (type === T_READY) out.push(...applied);
			out.push(msg);
			if (type === T_READY) applied = [];
		}
		for (const msg of out) this.#emit('data', msg.slice());
	}

	// Ends the session as a disconnect would, so the next connection on this instance starts clean.
	async #endSessionState(): Promise<void> {
		if (!this.#started) return;
		if (this.#status !== IDLE) await this.#collect(queryMessage('ROLLBACK'));
		await this.#collect(queryMessage('DISCARD ALL'));
		this.#status = IDLE;
	}

	#finish(): void {
		if (this.#closed) return;
		this.#closed = true;
		if (this.#session.live === this) this.#session.live = null;
		this.#endSession();
		queueMicrotask(() => this.#emit('close'));
	}
}

/** A `socket` factory for a PGlite instance, for configs that create connections themselves. */
export function pgliteSocket(pg: PGliteLike): () => Promise<PostgresSocket> {
	return () => {
		try {
			return Promise.resolve(new PGliteSocket(pg));
		} catch (e) {
			return Promise.reject(e);
		}
	};
}

// No cancel: without one the driver falls back to closing the socket. Without this transport it would use the
// process-wide one and dial a real server on localhost with PGlite's backend key.
const NO_TRANSPORT: Transport = {
	connect: () => Promise.reject(new Error('@drizzle-team/postgres/pglite: connections go through the PGlite socket')),
};

function pgliteConfig<C extends PGliteConnectConfig>(pg: PGliteLike, config: C): ConnectConfig {
	return {
		user: 'postgres',
		database: 'postgres',
		...config,
		socket: pgliteSocket(pg),
		transport: NO_TRANSPORT,
		reconnect: false,
	} as ConnectConfig;
}

/** Open a single connection to an in-process PGlite. */
export function connect(pg: PGliteLike, config: PGliteConnectConfig = {}): Promise<Connection<{ pooled: false }>> {
	return coreConnect(pgliteConfig(pg, config));
}

/** Create a pool on an in-process PGlite: one connection, which queries share (see the file header). */
export function createPool(pg: PGliteLike, config: PGlitePoolConfig = {}): Pool {
	if (config.max !== undefined && config.max !== 1) {
		throw new TypeError(
			`@drizzle-team/postgres/pglite: max must be 1 (got ${String(config.max)}): PGlite runs one session`,
		);
	}
	const { reconnect: poolReconnect, ...rest } = config as PoolConfig;
	return corePool({ ...pgliteConfig(pg, rest), max: 1, reconnect: poolReconnect } as PoolConfig);
}

addBrand(PGliteSocket, 'PGliteSocket');

export { Connection, defaultDecoders, PgError, Pool };
export type { ConnectConfig, PoolConfig };
