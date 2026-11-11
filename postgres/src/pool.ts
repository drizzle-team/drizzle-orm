// Connection pool over Connection with single-flight reconnect (circuit breaker).
// When establishing a connection fails (server down/restarting), the pool trips
// "down": ONE background probe retries with backoff+jitter while all acquirers wait,
// and only once the probe reconnects is the herd released — no reconnect storm into a
// recovering database. Dead idle connections are evicted on checkout; open transactions
// are rolled back before reuse. In-flight queries are never silently replayed.
//
// Pipelining: standalone queries (pool.query / pool.execute) do not check a connection out. They
// go to the least-loaded checked-in connection and pipeline with other callers' queries; below max
// a busy pool opens another connection first. Session-bound work still checks one out: transactions,
// connect(), batch/pipeline, cursors, COPY and bulk helpers, and queries with timeout, signal or
// snapshot (a cancel or a transaction must not touch other callers' queries). Off when the
// connections do not pipeline (`pipeline: false`, or behind a transaction-mode pooler).
import { AsyncLocalStorage } from 'node:async_hooks';
import { addBrand } from './brand.ts';
import { replicate, type ReplicateHandle, type ReplicateOptions } from './cdc.ts';
import { installVercelCompat, type VercelPoolSurface } from './compat/vercel.ts';
import {
	type Connection,
	createDecodeState,
	createPooledConnection,
	type DecodeState,
	isUntrustedCertificate,
	pipelineDepthOf,
} from './connection.ts';
import type { TxFn } from './connection.ts';
import { Cursor, type CursorOptions } from './cursor.ts';
import type { QueryMetrics } from './plugin.ts';
import type { PoolConfig, QueryOptions, QueryResult, TxOptions } from './types.ts';
import type { BatchMetrics, BatchResult, BatchRunOptions } from './types.ts';
import { resolveUrl } from './url.ts';

interface Waiter {
	resolve: (c: Connection) => void;
	reject: (e: Error) => void;
}

// A shared query that found no connection to run on: every one is checked out, or none is open yet.
interface SharedWaiter {
	run: (c: Connection) => void;
	reject: (e: Error) => void;
	retry: () => void; // start over, e.g. to wait for recovery once the breaker trips
}

// Statements that open a transaction. A query that matches anywhere in its text gets its own
// connection, because on a shared one the queries pipelined behind it would run inside it.
const OPENS_TX = /\b(?:begin|start\s+transaction)\b/i;

// The txGuard marker. `active` is flipped off when the transaction settles, so work that was merely
// STARTED inside the callback but runs after it (a detached task) is not falsely rejected — the ban is
// scoped to the transaction's LIFETIME, not just to the async context that inherits it.
interface TxMark {
	active: boolean;
}

// The Vercel attachDatabasePool() surface (options.idleTimeoutMillis + on('release')) is grafted onto
// every instance by compat/vercel.ts; this declaration merge puts it on Pool's TYPE.
// oxlint-disable-next-line typescript/no-unsafe-declaration-merging -- compat/vercel.ts adds these members at runtime
export interface Pool extends VercelPoolSurface {}

// Errors that mean "this database will never come back on its own" — don't probe. Everything here needs
// an OPERATOR (or the provider's console) to change something, so retrying only replaces a precise
// message with a generic timeout. Deliberately NOT here: 53300 too_many_connections, 57P03
// cannot_connect_now and the ECONNREFUSED family — those DO clear on their own, and `broken` is
// permanent for the life of the pool, so misclassifying one poisons every later acquire.
const FATAL_CODES = new Set([
	'28P01', // invalid_password
	'28000', // invalid_authorization_specification
	'3D000', // invalid_catalog_name (no such database)
	'08004', // server rejected the connection (pg_hba, or a provider refusing this endpoint)
]);
// Neon/provider control-plane refusals ride in on a generic code with the reason in the message.
const DISABLED_ENDPOINT =
	/endpoint (?:is|has been) disabled|disabled endpoint|quota (?:exceeded|exhausted)|exceeded .*quota/i;
function classify(err: unknown): 'fatal' | 'unavailable' {
	const e = err as { code?: string; message?: string } | null;
	const code = e?.code;
	if (code !== undefined && FATAL_CODES.has(code)) return 'fatal';
	// `fatal` is Drizzle Postgres's own marker for "retrying this cannot help": misconfiguration and unusable
	// transports, which carry no SQLSTATE to key off. Connection already honours it in its reconnect
	// loop (isFatalAuth); without it here a config error looks like an outage, so the breaker trips,
	// every acquire waits out the full acquireTimeout, and the probe just re-runs the same failure.
	if ((err as { fatal?: boolean } | null)?.fatal === true) return 'fatal';
	if (isUntrustedCertificate(err)) return 'fatal';
	if (typeof e?.message === 'string' && DISABLED_ENDPOINT.test(e.message)) return 'fatal';
	return 'unavailable'; // ECONNREFUSED/RESET/timeout, 57P0x shutdown, connection terminated, ...
}

const TX_GUARD_MSG =
	'@drizzle/postgres: this pool was used INSIDE its own transaction() callback. That checks out a second connection, so the '
	+ 'query would run outside the transaction — blind to its uncommitted rows, and untouched by its rollback — and '
	+ 'deadlocks the pool once every connection is held. Use the handle the callback is given: '
	+ 'pool.transaction(async (tx) => { await tx.query(...) }). Naming that parameter `pool` shadows the outer one and '
	+ 'makes the mistake unwriteable. If you really do want a separate connection here, wrap it in '
	+ 'pool.outsideTransaction(() => ...). Disable this check with { txGuard: false }.';

export class Pool {
	private cfg: PoolConfig;
	private decode?: DecodeState; // decoders + row mapper cache, shared by this pool's connections only
	private max: number;
	private idle: Connection[] = [];
	private all = new Set<Connection>();
	private out = new Set<Connection>(); // checked-out (double-release guard)
	private waiters: Waiter[] = []; // waiting because the pool is at max
	// Pipelined pool: independent queries share the checked-in connections instead of checking one out.
	private shareQueries: boolean;
	private opening = 0; // connections grow() is still opening
	private sharedWaiters: SharedWaiter[] = [];
	private closed = false;

	// Idle-connection eviction (a connection sitting in `idle` past idleMs is closed and dropped).
	private idleMs: number;
	private idleTimers = new Map<Connection, ReturnType<typeof setTimeout>>();
	// compat/vercel.ts grafts the attachDatabasePool() surface (options + on) onto the instance;
	// release() fires this notifier so Vercel can extend the instance's lifetime.
	private notifyRelease: () => void;

	// reconnect / circuit breaker
	private rcEnabled: boolean;
	private base: number;
	private maxBackoff: number;
	private acquireTimeout: number;
	private down = false;
	private broken: Error | null = null; // fatal, unrecoverable (e.g. auth)
	private recovered: (() => void)[] = []; // wake-ups for acquirers waiting on recovery
	// Why the breaker tripped, and why the latest probe attempt failed. Kept so a recovery timeout can
	// name a CAUSE — without these the pool reports "timed out waiting for the database to recover" and
	// the actual ECONNREFUSED / 429 / SCRAM failure is lost.
	private probeTimer?: ReturnType<typeof setTimeout>; // the probe loop's backoff sleep, cleared by end()
	private probeWake?: () => void;
	private lastDownError: Error | null = null;
	private lastProbeError: Error | null = null;
	private probeConnectMs: number; // per-attempt connect timeout for the probe (see startProbe)

	// How long an acquire may sit at max before failing (0 = forever, the old behaviour).
	private acquireMs: number;
	// txGuard: PER-POOL AsyncLocalStorage, created lazily on the first transaction() — a pool that never
	// opens one pays literally nothing, and per-pool (not global) means poolA's tx never bans poolB.
	private guardTx: boolean;
	private als?: AsyncLocalStorage<TxMark>;

	constructor(config: string | PoolConfig = {}) {
		const cfg = resolveUrl(typeof config === 'string' ? { url: config } : config); // string / url -> config
		this.cfg = cfg;
		this.max = cfg.max ?? 10;
		const rc = cfg.reconnect;
		this.rcEnabled = rc !== false;
		const o = rc && typeof rc === 'object' ? rc : {};
		this.base = o.baseMs ?? 50;
		this.maxBackoff = o.maxMs ?? 2000;
		this.acquireTimeout = o.acquireTimeoutMs ?? 30000;
		// The probe loop must ITERATE inside a waiter's window. With connectTimeout === acquireTimeout
		// (both 30s by default) a single STALLED attempt — a proxy that accepts the socket then never
		// finishes startup — outlives every waiter, so the breaker never re-evaluates and the pool never
		// self-heals. Bound each attempt well under the acquire window instead.
		const halfWindow = this.acquireTimeout > 0 ? Math.floor(this.acquireTimeout / 2) : 5000;
		this.probeConnectMs = Math.max(
			1,
			Math.min(cfg.connectTimeout ?? 30000, o.probeConnectTimeoutMs ?? Math.min(5000, halfWindow)),
		);
		this.acquireMs = cfg.acquireTimeoutMillis ?? 30000;
		this.guardTx = cfg.txGuard !== false;
		this.idleMs = cfg.idleTimeoutMillis ?? 0;
		this.notifyRelease = installVercelCompat(this, this.idleMs);
		this.shareQueries = pipelineDepthOf(cfg) > 1;
	}

	get size(): number {
		return this.all.size;
	}
	get idleCount(): number {
		return this.idle.length;
	}
	get waiting(): number {
		return this.waiters.length + this.sharedWaiters.length;
	}
	get isDown(): boolean {
		return this.down;
	}
	/** Why the pool is currently `down` (or last was): the newest probe failure, else the error that
	 *  tripped the breaker. `null` when healthy. The same error rides as `cause` on a recovery timeout. */
	get lastError(): Error | null {
		return this.broken ?? this.lastProbeError ?? this.lastDownError;
	}

	// idle eviction: a connection sitting in `idle` past idleMs is closed and dropped
	private armIdleTimer(conn: Connection): void {
		if (this.idleMs <= 0) return;
		this.clearIdleTimer(conn);
		this.idleTimers.set(
			conn,
			setTimeout(() => {
				this.idleTimers.delete(conn);
				const i = this.idle.indexOf(conn);
				if (i < 0) return; // checked out again meanwhile
				this.idle.splice(i, 1);
				this.all.delete(conn);
				void conn.end();
			}, this.idleMs),
		);
	}
	private clearIdleTimer(conn: Connection): void {
		const t = this.idleTimers.get(conn);
		if (t) {
			clearTimeout(t);
			this.idleTimers.delete(conn);
		}
	}

	/** Run `fn` with the txGuard lifted — for the rare deliberate "I want a SEPARATE connection here, one
	 *  that outlives this transaction's rollback" (an audit row that must survive). Uses run(), never
	 *  enterWith()/disable(), which Workers' AsyncLocalStorage omits. */
	outsideTransaction<T>(fn: () => T | Promise<T>): Promise<T> {
		if (!this.als) return Promise.resolve(fn());
		// `await` INSIDE the scope: pool.query() is LAZY, so returning its PoolQuery unawaited would run the
		// acquire in the CALLER's context (guard still armed) and defeat the hatch.
		return this.als.run({ active: false }, async () => await fn());
	}

	/** Start a managed CDC session, the same as {@link replicate}. The replication connection uses the
	 *  connection settings of this pool, so `options` has no `url`. The session does not use a pool
	 *  connection, and `end()` does not stop it. */
	replicate(options: Omit<ReplicateOptions, 'url'>): ReplicateHandle {
		return replicate({ ...options, url: this.cfg });
	}

	async acquire(): Promise<Connection<{ pooled: true }>> {
		if (this.closed) throw new Error('pool is closed');
		// Every pool op funnels through acquire(), so ONE check covers query/execute/batch/pipeline/
		// cursor/connect/bulk*/copy* and nested transaction().
		if (this.als?.getStore()?.active) throw new Error(TX_GUARD_MSG);
		if (this.broken) throw this.broken;
		if (this.down && this.rcEnabled) await this.waitForRecovery();
		// reuse a live idle connection (evict dead ones that died while idle)
		while (this.idle.length) {
			const i = this.shareQueries ? this.checkoutIndex() : this.idle.length - 1;
			if (i < 0) break; // every checked-in connection is busy with shared queries: open another
			const c = this.idle[i]!;
			this.idle.splice(i, 1);
			this.clearIdleTimer(c); // no longer idle
			if (c.state === 'closed') {
				this.all.delete(c);
				continue;
			}
			this.out.add(c);
			return c;
		}
		if (this.all.size < this.max) {
			try {
				const c = await this.open();
				this.out.add(c);
				return c;
			} catch (e) {
				if (!this.rcEnabled) throw e;
				this.trip(e as Error);
				if (this.broken) throw this.broken;
				return this.acquire(); // breaker is now down -> wait for the single probe
			}
		}
		return this.waitForFree();
	}

	// Which checked-in connection an exclusive checkout takes: the newest with no shared queries on it.
	// When all of them are busy, -1 while the pool can still open one (so the checkout does not wait
	// behind other callers' queries), else the least-loaded.
	private checkoutIndex(): number {
		let best = -1, load = Infinity;
		for (let i = this.idle.length - 1; i >= 0; i--) {
			const c = this.idle[i]!;
			if (c.state === 'closed') return i; // acquire evicts it
			const l = c._load;
			if (l === 0) return i;
			if (l < load) {
				best = i;
				load = l;
			}
		}
		return this.all.size < this.max ? -1 : best;
	}

	// At max: park until someone releases. Bounded by acquireTimeoutMillis so exhaustion surfaces as a
	// loud, self-describing error instead of an unbounded hang.
	private waitForFree(): Promise<Connection<{ pooled: true }>> {
		return new Promise<Connection<{ pooled: true }>>((resolve, reject) => {
			if (this.acquireMs <= 0) {
				this.waiters.push({ resolve, reject });
				return;
			}
			const w: Waiter = {
				resolve: (c) => {
					clearTimeout(to);
					resolve(c);
				},
				reject: (e) => {
					clearTimeout(to);
					reject(e);
				},
			};
			const to = setTimeout(() => {
				const i = this.waiters.indexOf(w);
				if (i >= 0) this.waiters.splice(i, 1);
				reject(
					new Error(
						`@drizzle/postgres: pool acquire timed out after ${this.acquireMs}ms — all ${this.max} connection(s) are checked out.${this.stuckHint()}`,
					),
				);
			}, this.acquireMs); // never let a pending acquire keep the process alive (pg-pool does the same); workerd's
			// setTimeout returns a number with no unref
			(to as { unref?: () => void }).unref?.();
			this.waiters.push(w);
		});
	}

	// Diagnostic ONLY, evaluated after the timeout already fired — never a trigger. A snapshot cannot tell
	// a deadlock from a tx awaiting slow non-DB work, but once the wait has expired, "every holder is idle
	// inside a transaction" is a strong enough signal to name the usual culprit (as knex's message does).
	private stuckHint(): string {
		if (!this.out.size) return '';
		for (const c of this.out) {
			if (!c.inTransaction) return '';
			const s = c.stats;
			if (s.inflight || s.queued) return '';
		}
		return ' Every one of them is sitting IDLE inside an open transaction, so none will be released:'
			+ ' a common cause is using the pool inside a transaction() callback (which needs a second connection'
			+ ' while the first is still held) — use the `tx` handle passed to the callback instead.';
	}

	private async open(connectTimeout?: number): Promise<Connection<{ pooled: true }>> {
		// Pooled connections are fragile: the POOL owns reconnection (its breaker), so a
		// dead member is evicted, not self-reconnecting. Disable Connection-level reconnect.
		// The constructor validates config BEFORE any I/O (bad connection string, an impossible
		// channel_binding combo, a NUL in `options`), so whatever it throws will throw identically on
		// every retry — mark it fatal so the breaker fails fast with the real message instead of
		// reporting a database that is "not recovering".
		let conn: Connection<{ pooled: true }>;
		try {
			this.decode ??= createDecodeState(this.cfg);
			conn = createPooledConnection({
				...this.cfg,
				reconnect: false,
				...(connectTimeout === undefined ? {} : { connectTimeout }),
			}, this.decode);
		} catch (e) {
			throw Object.assign(e as Error, { fatal: true });
		}
		this.all.add(conn);
		try {
			await conn.connect();
		} catch (e) {
			this.all.delete(conn);
			throw e;
		}
		return conn;
	}

	// ---- circuit breaker ----
	private trip(err: Error): void {
		if (classify(err) === 'fatal') {
			this.broken = err;
			this.settleBreaker();
			return;
		}
		if (this.down || this.closed) return;
		this.lastDownError = err; // the cause a recovery timeout will report
		this.lastProbeError = null;
		this.down = true;
		this.startProbe();
		for (const w of this.sharedWaiters.splice(0)) w.retry(); // they now wait for recovery instead
	}

	// single-flight: exactly one connection probes the server while everyone waits.
	private startProbe(): void {
		void (async () => {
			for (let attempt = 0; this.down && !this.closed; attempt++) {
				const backoff = Math.min(this.maxBackoff, this.base * 2 ** attempt);
				await this.probeNap(backoff * (0.5 + Math.random() * 0.5)); // jitter; cancelled by end()/recovery
				if (!this.down || this.closed) return;
				try {
					const c = await this.open(this.probeConnectMs); // bounded so the loop iterates inside a waiter's window
					this.idle.push(c);
					this.armIdleTimer(c); // the probe connection becomes the first reusable one
					this.lastProbeError = null;
					this.settleBreaker(); // recovered -> release the herd
					return;
				} catch (e) {
					this.lastProbeError = e as Error; // keep the newest cause for waitForRecovery's rejection
					if (classify(e as Error) === 'fatal') {
						this.broken = e as Error;
						this.settleBreaker();
						return;
					}
					// otherwise keep probing with growing backoff
				}
			}
		})();
	}

	// The probe's backoff sleep, cancellable. A bare setTimeout here outlives the pool: end() during a
	// backoff round leaves the timer armed (up to maxBackoff of delayed process exit, and a hard failure
	// under a leak sanitizer). Cancelling RESOLVES it so the loop wakes and re-checks down/closed.
	private probeNap(ms: number): Promise<void> {
		return new Promise<void>((r) => {
			const wake = () => {
				this.probeTimer = undefined;
				this.probeWake = undefined;
				r();
			};
			this.probeWake = wake;
			this.probeTimer = setTimeout(wake, ms);
		});
	}

	private cancelProbeNap(): void {
		if (this.probeTimer !== undefined) clearTimeout(this.probeTimer);
		this.probeWake?.(); // resolves the pending nap; the loop's next `down/closed` check ends it
	}

	// Clear the down flag and wake everyone waiting on recovery (they re-check broken/closed).
	private settleBreaker(): void {
		this.down = false;
		this.cancelProbeNap();
		for (const w of this.recovered.splice(0)) w();
		if (this.sharedWaiters.length) this.flushShared();
	}

	private waitForRecovery(): Promise<void> {
		// Built HERE, not in the setTimeout callback: a timer-built Error's stack is just Timeout._onTimeout
		// with no application frame, which is useless for finding the query that was waiting.
		const timedOut = new Error(
			`pool acquire timed out after ${this.acquireTimeout}ms waiting for the database to recover`,
		);
		return new Promise<void>((resolve, reject) => {
			let done = false;
			const to = setTimeout(() => {
				if (done) return;
				done = true;
				const i = this.recovered.indexOf(onRecover);
				if (i >= 0) this.recovered.splice(i, 1);
				const cause = this.lastProbeError ?? this.lastDownError; // the outage's real error, else nothing to add
				if (cause) {
					(timedOut as { cause?: unknown }).cause = cause;
					timedOut.message += ` (last error: ${cause.message})`;
				}
				reject(timedOut);
			}, this.acquireTimeout);
			const onRecover = () => {
				if (done) return;
				done = true;
				clearTimeout(to);
				if (this.closed) reject(new Error('pool is closed'));
				else if (this.broken) reject(this.broken);
				else resolve();
			};
			this.recovered.push(onRecover);
		});
	}

	// ---- checkout/checkin ----
	release(conn: Connection): void {
		if (!this.out.has(conn)) return; // double-release / foreign connection
		this.out.delete(conn);
		this.notifyRelease(); // attachDatabasePool() listens for 'release' (extends instance life)
		// A canceled query is still draining: reuse the connection only once it is known to survive the cancel.
		const settled = conn.cancelSettled;
		if (settled) {
			void settled.then(() => this.reclaim(conn));
			return;
		}
		this.reclaim(conn);
	}

	private reclaim(conn: Connection): void {
		if (conn.state === 'closed') {
			this.all.delete(conn);
			this.refill();
			return;
		}
		if (this.closed) {
			this.all.delete(conn);
			void conn.end();
			return;
		}
		if (conn.inTransaction) { // never leak tx state across checkouts
			conn.query('ROLLBACK').then(() => this.checkin(conn)).catch(() => {
				this.all.delete(conn);
				void conn.end();
				this.refill();
			});
			return;
		}
		this.checkin(conn);
	}

	private checkin(conn: Connection): void {
		// A live connection returning during an outage proves the server is back.
		if (this.down) {
			this.idle.push(conn);
			this.armIdleTimer(conn);
			this.settleBreaker();
			return;
		}
		const w = this.waiters.shift();
		if (w) {
			this.out.add(conn);
			w.resolve(conn);
		} else {
			this.idle.push(conn);
			this.armIdleTimer(conn);
			if (this.sharedWaiters.length) this.flushShared();
		}
	}

	private refill(): void {
		if (this.down || this.closed) return; // the probe handles recovery; don't herd
		if (this.sharedWaiters.length) this.flushShared(); // opens a connection for them when one is free
		while (this.waiters.length && this.all.size < this.max) {
			const w = this.waiters.shift()!;
			this.open().then((c) => {
				this.out.add(c);
				w.resolve(c);
			}).catch((e) => {
				if (!this.rcEnabled) return w.reject(e as Error);
				this.waiters.unshift(w);
				this.trip(e as Error);
				if (this.broken) this.failWaiters(this.broken);
			});
		}
	}

	private failWaiters(err: Error): void {
		for (const w of this.waiters.splice(0)) w.reject(err);
		for (const w of this.sharedWaiters.splice(0)) w.reject(err);
	}

	// ---- shared (pipelined) queries ----

	/** @internal Run one standalone query: shared with other queries when the pool pipelines, else on
	 *  a connection checked out for it alone. */
	_run(sql: string, params: unknown[], opts: QueryOptions): Promise<QueryResult<never>> {
		// A cancel stops whatever the backend runs at that moment, which on a shared connection can be
		// someone else's query; a snapshot query is a transaction of its own.
		if (
			!this.shareQueries || opts.timeout != null || opts.signal !== undefined || opts.snapshot !== undefined
			|| OPENS_TX.test(sql)
		) {
			return this.runExclusive(sql, params, opts);
		}
		if (this.closed) return Promise.reject(new Error('pool is closed'));
		if (this.als?.getStore()?.active) return Promise.reject(new Error(TX_GUARD_MSG));
		if (this.broken) return Promise.reject(this.broken);
		if (this.down && this.rcEnabled) return this.waitForRecovery().then(() => this._run(sql, params, opts));
		const c = this.pickShared();
		if (c) return this.runShared(c, sql, params, opts);
		return new Promise<QueryResult<never>>((resolve, reject) => {
			this.waitShared(
				(conn) => this.runShared(conn, sql, params, opts).then(resolve, reject),
				reject,
				() => this._run(sql, params, opts).then(resolve, reject),
			);
		});
	}

	private async runExclusive(sql: string, params: unknown[], opts: QueryOptions): Promise<QueryResult<never>> {
		const conn = await this.acquire();
		try {
			return await (conn.query as unknown as Runner)(sql, params, opts);
		} finally {
			this.release(conn);
		}
	}

	// The least-loaded checked-in connection, evicting dead ones on the way. When every one is busy and
	// the pool is below max, opens another and returns null: the query waits for the new connection (its
	// own backend) instead of pipelining behind other queries. Pipelining starts once the pool is full.
	private pickShared(): Connection | null {
		let best: Connection | null = null, load = Infinity;
		for (let i = this.idle.length - 1; i >= 0; i--) {
			const c = this.idle[i]!;
			if (c.state === 'closed') {
				this.idle.splice(i, 1);
				this.clearIdleTimer(c);
				this.all.delete(c);
				continue;
			}
			const l = c._load;
			if (l < load) {
				best = c;
				load = l;
				if (l === 0) break;
			}
		}
		if (load > 0 && this.all.size < this.max && !this.down) this.grow();
		return load > 0 && this.opening > 0 ? null : best;
	}

	// Open one more connection for shared queries. It is checked in like a released one: it serves an
	// exclusive waiter first, then the shared waiters.
	private grow(): void {
		this.opening++;
		this.open().then((c) => {
			this.opening--;
			if (this.closed) {
				this.all.delete(c);
				void c.end();
				return;
			}
			this.checkin(c);
		}, (e: unknown) => {
			this.opening--;
			if (this.closed) return;
			if (this.rcEnabled) {
				this.trip(e as Error); // the breaker's probe reopens; recovery flushes the waiters
				if (this.broken) this.failWaiters(this.broken);
			} else if (this.idle.length === 0 && this.opening === 0) {
				for (const w of this.sharedWaiters.splice(0)) w.reject(e as Error);
			} else if (this.sharedWaiters.length) this.flushShared();
		});
	}

	private runShared(c: Connection, sql: string, params: unknown[], opts: QueryOptions): Promise<QueryResult<never>> {
		if (this.idleMs > 0) this.clearIdleTimer(c);
		const p = (c.query as unknown as Runner)(sql, params, opts);
		const after = () => this.afterShared(c);
		p.then(after, after);
		return p;
	}

	private afterShared(c: Connection): void {
		const i = this.idle.indexOf(c);
		if (i < 0) return; // checked out or evicted meanwhile; its owner handles it
		if (c.state === 'closed') {
			this.idle.splice(i, 1);
			this.clearIdleTimer(c);
			this.all.delete(c);
			this.refill();
			return;
		}
		if (c.inTransaction) {
			// A shared query opened a transaction that OPENS_TX did not catch. Stop dispatching here; the
			// release queues a ROLLBACK behind the queries already sent, then checks the connection back in.
			this.idle.splice(i, 1);
			this.clearIdleTimer(c);
			this.out.add(c);
			this.release(c);
			return;
		}
		if (this.sharedWaiters.length) this.flushShared();
		else if (c._load === 0) {
			this.notifyRelease();
			this.armIdleTimer(c);
		}
	}

	// No connection is checked in. Wait for one, bounded by acquireTimeoutMillis like an exclusive acquire.
	private waitShared(run: (c: Connection) => void, reject: (e: Error) => void, retry: () => void): void {
		if (this.acquireMs <= 0) {
			this.sharedWaiters.push({ run, reject, retry });
			return;
		}
		const w: SharedWaiter = {
			run: (c) => {
				clearTimeout(to);
				run(c);
			},
			reject: (e) => {
				clearTimeout(to);
				reject(e);
			},
			retry: () => {
				clearTimeout(to);
				retry();
			},
		};
		const to = setTimeout(() => {
			const i = this.sharedWaiters.indexOf(w);
			if (i >= 0) this.sharedWaiters.splice(i, 1);
			reject(
				new Error(
					`@drizzle/postgres: pool acquire timed out after ${this.acquireMs}ms — all ${this.max} connection(s) are checked out.${this.stuckHint()}`,
				),
			);
		}, this.acquireMs);
		(to as { unref?: () => void }).unref?.();
		this.sharedWaiters.push(w);
	}

	// Hand waiting shared queries to the checked-in connections, least-loaded first.
	private flushShared(): void {
		if (this.closed) return this.failWaiters(new Error('pool is closed'));
		if (this.broken) return this.failWaiters(this.broken);
		if (this.down) return;
		while (this.sharedWaiters.length) {
			const c = this.pickShared();
			if (!c) return;
			this.sharedWaiters.shift()!.run(c);
		}
	}

	/** Build a LAZY query. It does NOT run until awaited, `.execute()`d, or passed to `pool.batch(...)`.
	 *  Awaiting it (or `.execute()`) runs it as a one-shot autocommit query, pipelined with other callers'
	 *  queries on the least-loaded connection (see the pipelining note at the top of this file). Its value
	 *  is composition: hand un-run queries to `pool.batch`. */
	query(sql: string, params: unknown[] = [], opts: QueryOptions = {}): PoolQuery {
		return new PoolQuery(this, sql, params, opts);
	}

	/** Run a query NOW and return a Promise. The eager sibling of `query()` —
	 *  use it for fire-and-forget or when you don't want lazy semantics. `pool.execute(x)` ≡ `pool.query(x).execute()`. */
	execute(sql: string, params: unknown[] = [], opts: QueryOptions = {}): Promise<QueryResult<never>> {
		return new PoolQuery(this, sql, params, opts).execute();
	}

	/** Run a set of `query()` objects as ONE ATOMIC transaction on a single connection, in ONE round trip:
	 *  BEGIN, the queries and COMMIT are pipelined back-to-back in a single socket write — or the transaction
	 *  rolls back and the call rejects if ANY fails (all-or-nothing). Results in input order. Reach for
	 *  pipeline() when the queries are independent (no atomicity), or parallel() to fan out.
	 *  Pipelines even with `pipeline: false` and behind a transaction pooler.
	 *  `options` configure the transaction, as for `begin(options, fn)` (isolation, readOnly, deferrable,
	 *  snapshot).
	 *  A query's own error carries `failedQueryIndex` (its position in `queries`); an error from the snapshot
	 *  import or COMMIT (e.g. a deferred constraint) belongs to no query and has none.
	 *  With `metrics` on, the results carry the batch's telemetry as `results.metrics` (see BatchMetrics):
	 *  each query's metrics plus what the batch did as a whole, such as its round trips and how many
	 *  statements the server parsed or reused. */
	batch(
		queries: PoolQuery[],
		options: BatchRunOptions & { metrics: true | 'ms' | 'us' },
	): Promise<BatchResult & { metrics: BatchMetrics }>;
	batch(queries: PoolQuery[], options?: BatchRunOptions): Promise<BatchResult>;
	async batch(queries: PoolQuery[], options?: BatchRunOptions): Promise<BatchResult> {
		const metrics = options?.metrics;
		const t0 = metrics ? performance.now() : 0;
		const conn = await this.acquire(); // the txGuard check lives in acquire(), as for every pool op
		try {
			if (!metrics) {
				return await conn.pipelinedTransaction(options, (c) => queries.map((q, i) => runIndexed(q, c, i)));
			}
			const acquired = performance.now();
			const before = conn._wireCounters; // the batch holds this connection, so the difference is its own
			const results: BatchResult = await conn.pipelinedTransaction(
				options,
				(c) => queries.map((q, i) => runIndexed(q, c, i, metrics)),
			);
			const after = conn._wireCounters;
			results.metrics = batchMetrics(metrics, t0, acquired, performance.now(), results, {
				statements: queries.length + (options.snapshot == null ? 2 : 3),
				writes: after.writes - before.writes,
				roundTrips: after.roundTrips - before.roundTrips,
				backendPid: conn.backendKey?.pid,
			});
			return results;
		} finally {
			this.release(conn); // rolls back defensively if the connection somehow stayed in a transaction
		}
	}

	/** Pipeline a set of queries on ONE connection with NO transaction: sent back-to-back (~1 round trip),
	 *  each its OWN autocommit — a failure does NOT roll back the others. Use batch() when you need
	 *  all-or-nothing atomicity. Never rejects for a query error: waits for every query and resolves with one
	 *  `Promise.allSettled`-style entry per query, in input order — the same shape as `parallel()`.
	 *  Pipelines even with `pipeline: false`, which only covers independent queries. Behind a transaction
	 *  pooler it sends one query per round trip, since each is its own transaction. */
	async pipeline(queries: PoolQuery[]): Promise<PromiseSettledResult<QueryResult<never>>[]> {
		const conn = await this.acquire();
		try {
			return await Promise.allSettled(conn._pipelined(() => queries.map((q) => q.runOn(conn))));
		} finally {
			this.release(conn);
		}
	}

	/** Run a set of queries concurrently, FANNED OUT across connections (parallel backends): each takes a
	 *  free connection, or opens one while the pool is below max; once every connection is busy they
	 *  pipeline on the least-loaded ones. No atomicity, and it NEVER rejects: it waits for every query to settle and
	 *  resolves with one `Promise.allSettled`-style entry per query, in input order — `{ status: 'fulfilled',
	 *  value }` for a result or `{ status: 'rejected', reason }` for that query's error. */
	parallel(queries: PoolQuery[]): Promise<PromiseSettledResult<QueryResult<never>>[]> {
		return Promise.allSettled(queries); // each PoolQuery self-acquires its own connection
	}

	/** Batch-insert via unnest on one checked-out connection — see Connection.bulkInsert. */
	async bulkInsert(...args: Parameters<Connection['bulkInsert']>): Promise<QueryResult<never>> {
		const { client, release } = await this.connect();
		try {
			return await client.bulkInsert(...args);
		} finally {
			release();
		}
	}

	/** Bulk-UPDATE by key on one checked-out connection — see Connection.bulkUpdate. */
	async bulkUpdate(...args: Parameters<Connection['bulkUpdate']>): Promise<QueryResult<never>> {
		const { client, release } = await this.connect();
		try {
			return await client.bulkUpdate(...args);
		} finally {
			release();
		}
	}

	/** COPY FROM STDIN on one checked-out connection — see Connection.copyFrom. */
	async copyFrom(...args: Parameters<Connection['copyFrom']>): Promise<QueryResult<never>> {
		const { client, release } = await this.connect();
		try {
			return await client.copyFrom(...args);
		} finally {
			release();
		}
	}

	/** Bulk-load rows with COPY on one checked-out connection — see Connection.copyMany. */
	async copyMany(...args: Parameters<Connection['copyMany']>): Promise<QueryResult<never>> {
		const { client, release } = await this.connect();
		try {
			return await client.copyMany(...args);
		} finally {
			release();
		}
	}

	/** Server-side cursor on a DEDICATED pooled connection — created synchronously; the
	 *  connection is checked out on the first next() and released when the cursor is drained,
	 *  closed, or aborted by its guards. */
	cursor<Row = Record<string, unknown>>(opts: CursorOptions): Cursor<Row> {
		return new Cursor<Row>(async () => {
			const { client, release } = await this.connect();
			return { conn: client, release };
		}, opts);
	}

	/** Check out a dedicated connection (e.g. for a transaction). `release()` is idempotent. */
	async connect(): Promise<{ client: Connection<{ pooled: true }>; release: () => void }> {
		const client = await this.acquire();
		return { client, release: () => this.release(client) };
	}

	/** Run `fn` inside a transaction on a reserved pool connection: checks out a connection, sends BEGIN
	 *  (with optional isolation/mode options), runs the callback, then COMMITs (returning its value) or
	 *  ROLLBACKs and rethrows — and always releases the connection. A nested `tx.begin(...)` uses a SAVEPOINT.
	 *  `transaction()` is an alias. Queries issued concurrently inside pipeline on the one reserved connection. */
	begin<T>(fn: TxFn<T>): Promise<T>;
	begin<T>(options: TxOptions, fn: TxFn<T>): Promise<T>;
	begin<T>(a: TxOptions | TxFn<T>, b?: TxFn<T>): Promise<T> {
		return this.withTx(a, b);
	}
	transaction<T>(fn: TxFn<T>): Promise<T>;
	transaction<T>(options: TxOptions, fn: TxFn<T>): Promise<T>;
	transaction<T>(a: TxOptions | TxFn<T>, b?: TxFn<T>): Promise<T> {
		return this.withTx(a, b);
	}

	private async withTx<T>(a: TxOptions | TxFn<T>, b?: TxFn<T>): Promise<T> {
		const conn = await this.acquire(); // BEFORE the guard scope is entered — a tx's own checkout is legal
		const run = () => (typeof a === 'function' ? conn.begin(a) : conn.begin(a, b!));
		if (!this.guardTx) {
			try {
				return await run();
			} finally {
				this.release(conn);
			}
		}
		this.als ??= new AsyncLocalStorage<TxMark>(); // first transaction on this pool arms the guard
		const mark: TxMark = { active: true };
		try {
			return await this.als.run(mark, run);
		} finally {
			// mark BEFORE release: a waiter woken by release() must not still see this tx as active
			mark.active = false;
			this.release(conn);
		} // release() rolls back if fn left the conn in a tx (defensive) and checks it back in
	}

	async end(): Promise<void> {
		this.closed = true;
		this.cancelProbeNap(); // a probe mid-backoff would otherwise keep its timer armed past end()
		const err = new Error('pool ended');
		this.failWaiters(err);
		for (const w of this.recovered.splice(0)) w(); // wake recovery-waiters -> they reject (closed)
		for (const t of this.idleTimers.values()) clearTimeout(t);
		this.idleTimers.clear();
		const conns = [...this.all];
		this.all.clear();
		this.idle = [];
		this.out.clear();
		await Promise.all(conns.map((c) => c.end()));
	}
}

addBrand(Pool, 'Pool');

// Assemble a batch's telemetry from its timings, its connection's counters and its queries' own metrics.
function batchMetrics(
	unit: true | 'ms' | 'us',
	t0: number,
	acquired: number,
	end: number,
	results: QueryResult<never>[],
	wire: { statements: number; writes: number; roundTrips: number; backendPid: number | undefined },
): BatchMetrics {
	// The same conversion as a query's metrics: 'us' multiplies float ms by 1000, 'ms' rounds, true keeps floats.
	const c = unit === 'us' ? (x: number) => Math.round(x * 1000) : unit === 'ms' ? Math.round : (x: number) => x;
	const queries: QueryMetrics[] = new Array(results.length);
	let parsed = 0, reused = 0, unnamed = 0;
	for (let i = 0; i < results.length; i++) {
		const m = results[i]!.metrics!;
		queries[i] = m;
		if (m.statementName === undefined) unnamed++;
		else if (m.prepared) reused++;
		else parsed++;
	}
	return {
		unit: unit === 'us' ? 'us' : 'ms',
		acquire: c(acquired - t0),
		total: c(end - t0),
		...wire,
		parsed,
		reused,
		unnamed,
		queries,
	};
}

function runIndexed(
	query: PoolQuery,
	conn: Connection,
	index: number,
	metrics?: true | 'ms' | 'us',
): Promise<QueryResult<never>> {
	return query.runOn(conn, metrics).catch((e: unknown) => {
		if (typeof e === 'object' && e !== null && (e as { failedQueryIndex?: number }).failedQueryIndex === undefined) {
			(e as { failedQueryIndex?: number }).failedQueryIndex = index;
		}
		throw e;
	});
}

/** A lazy, awaitable query returned by `pool.query(...)`. Nothing runs until you `await` it, call
 *  `.execute()`, or pass it to `pool.batch(...)`. Execution is memoized — awaiting more than once runs
 *  it once. Standalone (`await` / `.execute()`) it runs on a shared, pipelined connection; `pool.batch(...)` runs
 *  it on a shared connection via `runOn` so a set pipelines on one connection, BEGIN and COMMIT included. */
export class PoolQuery implements PromiseLike<QueryResult<never>> {
	private promise?: Promise<QueryResult<never>>;
	constructor(private pool: Pool, private sql: string, private params: unknown[], private opts: QueryOptions) {}

	/** Inspect WITHOUT executing: the statement exactly as it will be sent (side-effect-free — the
	 *  query stays lazy). Preview a set with `queries.map(q => q.toSQL())`; note pool.batch()
	 *  additionally wraps the set in BEGIN … COMMIT on one connection. */
	toSQL(): { sql: string; params: unknown[]; options: QueryOptions } {
		return { sql: this.sql, params: this.params, options: this.opts };
	}

	/** Run now, returning the Promise. Idempotent — the same Promise every call. */
	execute(): Promise<QueryResult<never>> {
		return (this.promise ??= this.pool._run(this.sql, this.params, this.opts));
	}

	/** Run on an ALREADY checked-out connection (pool.batch uses this to pipeline a set on one connection).
	 *  Enqueues synchronously — pool.batch relies on that to keep the set contiguous between BEGIN and COMMIT. */
	runOn(conn: Connection, metrics?: true | 'ms' | 'us'): Promise<QueryResult<never>> {
		// pool.batch's `metrics` turns on this query's own metrics, unless the query already chose a unit
		const opts = metrics && !this.opts.metrics ? { ...this.opts, metrics } : this.opts;
		return (this.promise ??= (conn.query as unknown as Runner)(this.sql, this.params, opts));
	}

	// PromiseLike surface: awaiting (or .then/.catch/.finally) forces execution via the standalone path.
	// oxlint-disable-next-line unicorn/no-thenable -- pg-compatible queries must be awaitable
	then<R1 = QueryResult<never>, R2 = never>(
		onF?: ((v: QueryResult<never>) => R1 | PromiseLike<R1>) | null,
		onR?: ((e: unknown) => R2 | PromiseLike<R2>) | null,
	): Promise<R1 | R2> {
		return this.execute().then(onF, onR);
	}
	catch<R = never>(onR?: ((e: unknown) => R | PromiseLike<R>) | null): Promise<QueryResult<never> | R> {
		return this.execute().catch(onR);
	}
	finally(fn?: (() => void) | null): Promise<QueryResult<never>> {
		return this.execute().finally(fn);
	}
}

addBrand(PoolQuery, 'PoolQuery');

type Runner = (s: string, p: unknown[], o: QueryOptions) => Promise<QueryResult<never>>;
