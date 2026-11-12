// Kysely compatibility — `import { createPool, Cursor } from '@drizzle-team/postgres/compat-kysely'`, for Kysely's
// own PostgresDialect:
//
//   new Kysely<DB>({ dialect: new PostgresDialect({ pool: createPool(url), cursor: Cursor }) })
//
// PostgresDialect drives a pg-shaped pool: connect() -> client.query(sql, params) -> { rows, rowCount,
// command }, release(). This entry gives it one without importing kysely or pg — only the shapes match.
//
// Kysely checks out a connection for every query, which would cost the pool its shared pipelining (ADR 0020):
// a connection then carries one query per round trip. So connect() hands out a LEASE that holds no
// connection. Its queries run as shared pool queries until it sees work that needs one session, and from
// then until release() it holds a real connection:
//   - `begin` / `start transaction`: PostgresDialect starts transactions with these, as plain SQL;
//   - `pg_backend_pid()`: Kysely's 'cancel query' / 'kill session' abort strategies read the pid of the
//     lease's backend and signal it, which on a shared connection would hit another caller's query;
//   - a Cursor (`.stream()`) inside a transaction uses the held connection; outside one it takes its own.
// What a lease can't see is `db.connection()`: Kysely runs its callback's queries on one lease, expecting one
// session, and they are shared queries like any other. Session state (SET, temporary tables, session
// advisory locks) belongs in a transaction or in the pool config (`options: '-c search_path=…'`). For the
// same reason PostgresDialect's onCreateConnection / onReserveConnection hooks run per lease, not per
// connection, and are no place to set session state either.
//
// Decoding follows what Kysely's types (and kysely-codegen) expect: object rows, and int8 as a string
// unless the config sets `int8`. Everything else is the driver's default (numeric -> string,
// timestamptz -> Date, json -> parsed).
import { addBrand } from '../brand.ts';
import type { Connection } from '../connection.ts';
import type { Cursor as DriverCursor } from '../cursor.ts';
import { Pool } from '../pool.ts';
import type { PoolConfig } from '../types.ts';

// SQL that needs the lease's queries to stay on one backend from here on.
const NEEDS_SESSION = /^\s*(?:begin|start\s+transaction)\b|\bpg_backend_pid\s*\(/i;

type Held = { conn: Connection<{ pooled: true }>; release: () => void };

/** The result PostgresDialect reads. `command` is whatever Postgres reported ('CREATE TABLE', …); the type
 *  lists the ones Kysely inspects, as Kysely's own PostgresQueryResult does. */
export interface KyselyQueryResult<R> {
	command: 'UPDATE' | 'DELETE' | 'INSERT' | 'SELECT' | 'MERGE' | 'COMMIT' | 'ROLLBACK';
	rowCount: number;
	rows: R[];
}

/** The client a lease hands to Kysely: pg's `PoolClient` surface, as far as PostgresDialect uses it. */
export class KyselyClient {
	/** Read by PostgresDialect for its abort strategies; absent, so it asks the server (and the lease pins). */
	readonly processID = undefined;
	#pool: Pool;
	#held: Held | null = null;
	#pinning: Promise<Held> | null = null;

	constructor(pool: Pool) {
		this.#pool = pool;
	}

	query<R = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<KyselyQueryResult<R>>;
	query<R>(cursor: KyselyCursor<R>): KyselyCursor<R>;
	query(q: string | KyselyCursor<unknown>, params: readonly unknown[] = []): unknown {
		if (q instanceof KyselyCursor) return q._attach(this);
		const held = this.#held;
		if (held) return held.conn.query(q, params as unknown[], { mode: 'object' });
		if (NEEDS_SESSION.test(q)) {
			return this._hold().then((h) => h.conn.query(q, params as unknown[], { mode: 'object' }));
		}
		return this.#pool.query(q, params as unknown[], { mode: 'object' });
	}

	/** Return the lease. `destroy` (Kysely passes it after a failed ROLLBACK) closes a held connection
	 *  instead of returning it to the pool. */
	release(destroy?: boolean): void {
		const held = this.#held;
		this.#held = null;
		this.#pinning = null;
		if (!held) return;
		if (destroy) void held.conn.end().catch(() => {}).finally(held.release);
		else held.release();
	}

	/** @internal The held connection, if the lease has one. */
	get _conn(): Connection<{ pooled: true }> | null {
		return this.#held?.conn ?? null;
	}

	/** @internal Check a connection out for the rest of the lease. */
	_hold(): Promise<Held> {
		return this.#pinning ??= this.#pool.connect().then((h) => {
			this.#held = { conn: h.client, release: h.release };
			return this.#held;
		});
	}

	/** @internal */
	get _pool(): Pool {
		return this.#pool;
	}
}

/** pg-cursor's surface for PostgresDialect's `cursor` option, which `.stream()` needs. Rows arrive in the
 *  chunk size Kysely asks for on the first read. */
export class KyselyCursor<R = Record<string, unknown>> {
	#sql: string;
	#params: unknown[];
	#client: KyselyClient | null = null;
	#cursor: DriverCursor<R> | null = null;

	constructor(sql: string, params: readonly unknown[] = []) {
		this.#sql = sql;
		this.#params = [...params];
	}

	/** @internal Called by KyselyClient.query(cursor). */
	_attach(client: KyselyClient): this {
		this.#client = client;
		return this;
	}

	async read(rowCount: number): Promise<R[]> {
		const client = this.#client;
		if (!client) throw new Error('@drizzle/postgres: pass the Cursor to client.query() before reading it');
		// Inside a transaction the lease holds a connection and the cursor must see that transaction; outside
		// one a pool cursor takes a connection of its own for as long as it is open.
		const opts = { sql: this.#sql, params: this.#params, fetchSize: rowCount, mode: 'object' as const };
		this.#cursor ??= client._conn ? client._conn.cursor<R>(opts) : client._pool.cursor<R>(opts);
		return (await this.#cursor.next()) ?? [];
	}

	async close(): Promise<void> {
		await this.#cursor?.close();
	}
}

/** pg's `Pool` surface, as far as PostgresDialect uses it. */
export class KyselyPool {
	/** The driver pool underneath, for anything Kysely doesn't cover (pool.query, stats, …). */
	readonly pool: Pool;

	constructor(pool: Pool) {
		this.pool = pool;
	}

	/** Read by PostgresDialect only to build a control client, which this pool doesn't offer. */
	get options(): object {
		return this.pool.options;
	}

	/** A lease: no connection is checked out until the lease needs one session (see the file header). */
	async connect(): Promise<KyselyClient> {
		return new KyselyClient(this.pool);
	}

	end(): Promise<void> {
		return this.pool.end();
	}
}

/** Create a pool for Kysely's PostgresDialect. Accepts a config or a `postgres://…` connection string;
 *  `int8` defaults to 'string', as Kysely's types expect. */
export function createPool(config: string | PoolConfig = {}): KyselyPool {
	const c = typeof config === 'string' ? { url: config } : config;
	return new KyselyPool(new Pool({ int8: 'string', ...c }));
}

addBrand(KyselyClient, 'KyselyClient');
addBrand(KyselyCursor, 'KyselyCursor');
addBrand(KyselyPool, 'KyselyPool');

/** PostgresDialect's `cursor` option: `new PostgresDialect({ pool, cursor: Cursor })`. */
export { KyselyCursor as Cursor };
