// Prisma 8 compatibility — `import { createPool } from '@drizzle-team/postgres/compat-prisma8'`, for Prisma 8's
// Postgres client, which takes a node-postgres pool:
//
//   const db = postgres({ contract, binding: { kind: 'pgPool', pool: createPool(process.env.DATABASE_URL) } })
//
// Prisma 8 recognises a pool by its totalCount/idleCount/waitingCount and uses a small slice of it:
// pool.connect() -> client.query({ text, values, name }) -> client.release(). Its codecs decode every value
// from server text, so the pool decodes nothing (textValues): each row is an object of the exact text Postgres
// sent. This entry imports nothing from Prisma or pg; only the shapes match.
//
// Prisma checks a connection out for every statement, which would cost the pool its shared pipelining
// (ADR 0020). So connect() hands out a LEASE that holds no connection: its statements are shared pool queries
// until it sends BEGIN (Prisma's transactions, and its cursors, which this pool doesn't support: Prisma then
// reads the rows in one piece), and from then until release() it holds a real connection. What a lease can't
// see is a session Prisma pins without a transaction: its statements are shared like any other, so session
// state (SET, temporary tables) belongs in a transaction or in the pool config.
//
// Prisma's session settings (DateStyle=ISO, lc_monetary=C) are the startup settings of every connection here.
// Prisma can't know that of a pool it didn't create, so it confirms them with `SELECT set_config(…)` on each
// client object it hasn't seen, and again on one returned from a transaction. Leases are therefore reused: a
// released lease goes back on a free list, and Prisma confirms its settings once per lease object rather than
// once per statement. A lease released with `destroy` is never reused.
import { addBrand } from '../brand.ts';
import type { Connection } from '../connection.ts';
import { Pool } from '../pool.ts';
import type { PoolConfig } from '../types.ts';
import { resolveUrl } from '../url.ts';

const BEGINS = /^\s*(?:begin|start\s+transaction)\b/i;
const MAX_FREE_LEASES = 1024;

/** The query config Prisma passes, as pg's `QueryConfig` (`types` is ignored: every value is text here). */
export interface PrismaPgQueryConfig {
	text: string;
	values?: readonly unknown[];
	name?: string;
	types?: unknown;
}
/** The part of pg's `Result` Prisma reads: rows (objects of server text) and rowCount. */
export interface PrismaPgResult {
	rows: Array<Record<string, string | null>>;
	rowCount: number | null;
	command: string | null;
	columns: string[];
}

type Held = { conn: Connection<{ pooled: true }>; release: () => void };

/** A lease, the client Prisma gets from pool.connect(): pg's `PoolClient` surface, as far as Prisma uses it. */
export class PrismaPgClient {
	#pool: Pool;
	#free: PrismaPgClient[] | null;
	#held: Held | null = null;
	#holding: Promise<Held> | null = null;
	#leased = true;
	#reusable = true;

	constructor(pool: Pool, free: PrismaPgClient[] | null = null) {
		this.#pool = pool;
		this.#free = free;
	}

	query(config: string | PrismaPgQueryConfig, values?: readonly unknown[]): Promise<PrismaPgResult> {
		if (typeof config === 'object' && typeof (config as { submit?: unknown }).submit === 'function') {
			return Promise.reject(
				new Error(
					'@drizzle/postgres: compat-prisma8 does not support cursors; Prisma reads the rows in one piece instead',
				),
			);
		}
		const text = typeof config === 'string' ? config : config.text;
		const params = [...((typeof config === 'string' ? values : config.values) ?? [])];
		const opts: { mode: 'object'; name?: string } = { mode: 'object' };
		const name = typeof config === 'string' ? undefined : config.name;
		if (name) opts.name = name;
		const held = this.#held;
		if (held) return held.conn.query(text, params, opts) as Promise<never>;
		if (BEGINS.test(text)) return this.#hold().then((h) => h.conn.query(text, params, opts) as Promise<never>);
		return this.#pool.query(text, params, opts) as unknown as Promise<PrismaPgResult>; // a PoolQuery: then/catch/finally
	}

	/** Return the lease. `destroy` (Prisma passes it for a connection it gave up on) closes a held connection
	 *  instead of returning it to the pool, and the lease is not reused. */
	release(destroy?: unknown): void {
		if (!this.#leased) return; // a second release() must not put the lease on the free list twice
		this.#leased = false;
		const held = this.#held;
		this.#held = null;
		this.#holding = null;
		if (held) {
			if (destroy) void held.conn.end().catch(() => {}).finally(held.release);
			else held.release();
		}
		if (destroy) this.#reusable = false;
		if (this.#reusable && this.#free && this.#free.length < MAX_FREE_LEASES) this.#free.push(this);
	}

	/** pg clients are EventEmitters; Prisma subscribes to 'error' and 'end', which a lease never emits (its
	 *  failures arrive as rejected queries). */
	on(): this {
		return this;
	}

	off(): this {
		return this;
	}

	removeListener(): this {
		return this;
	}

	/** @internal Hand a reused lease out again. */
	_lease(): this {
		this.#leased = true;
		return this;
	}

	#hold(): Promise<Held> {
		return this.#holding ??= this.#pool.connect().then((h) => (this.#held = { conn: h.client, release: h.release }));
	}
}

/** pg's `Pool` surface, as far as Prisma 8 uses it. */
export class PrismaPgPool {
	/** The driver pool underneath, for anything Prisma doesn't cover (stats, …). */
	readonly pool: Pool;
	#free: PrismaPgClient[] = [];

	constructor(pool: Pool) {
		this.pool = pool;
	}

	get totalCount(): number {
		return this.pool.size;
	}

	get idleCount(): number {
		return this.pool.idleCount;
	}

	get waitingCount(): number {
		return this.pool.waiting;
	}

	get options(): object {
		return this.pool.options;
	}

	/** A lease: no connection is checked out until the lease sends BEGIN (see the file header). */
	async connect(): Promise<PrismaPgClient> {
		return this.#free.pop()?._lease() ?? new PrismaPgClient(this.pool, this.#free);
	}

	end(): Promise<void> {
		return this.pool.end();
	}

	on(): this {
		return this;
	}
}

/** Create a pool for Prisma 8's `postgres({ binding: { kind: 'pgPool', pool } })`. Accepts a config or a
 *  `postgres://…` connection string. Every value decodes to server text, and every session starts with
 *  Prisma's settings (DateStyle=ISO is the driver's default; lc_monetary=C is added to `options`). */
export function createPool(config: string | PoolConfig = {}): PrismaPgPool {
	const c = resolveUrl(typeof config === 'string' ? { url: config } : config); // a url's own options count too
	const options = c.options && /lc_monetary/i.test(c.options)
		? c.options
		: [c.options, '-c lc_monetary=C'].filter(Boolean).join(' ');
	return new PrismaPgPool(new Pool({ ...c, textValues: true, options }));
}

addBrand(PrismaPgClient, 'PrismaPgClient');
addBrand(PrismaPgPool, 'PrismaPgPool');
