// The async and the Effect drizzle-orm/postgres drivers make the same calls on one Drizzle Postgres pool: the same pool
// methods, and on a checked-out connection the same connection methods and SQL, in the same order.
import { createPool, type Pool } from '@drizzle-team/postgres';
import { sql } from 'drizzle-orm';
import * as PostgresDrizzle from 'drizzle-orm/effect-drizzle-postgres';
import { integer, pgTable, text } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres';
import { DrizzlePostgresClient } from 'drizzle-orm/postgres/client/effect';
import * as Effect from 'effect/Effect';
import * as ManagedRuntime from 'effect/ManagedRuntime';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

const connectionString = process.env['PG_CONNECTION_STRING'];

const POOL_METHODS = [
	'query',
	'execute',
	'batch',
	'pipeline',
	'parallel',
	'transaction',
	'begin',
	'bulkInsert',
	'bulkUpdate',
	'copyMany',
	'copyFrom',
	'cursor',
	'connect',
	'acquire',
	'release',
] as const;
const CONNECTION_METHODS = [
	'query',
	'transaction',
	'begin',
	'bulkInsert',
	'bulkUpdate',
	'copyMany',
	'copyFrom',
	'stream',
	'pipelinedTransaction',
] as const;

type Options = { name?: string; signal?: AbortSignal; cancel?: boolean; timeout?: number } | undefined;

const describeCall = (method: string, args: unknown[]) => {
	if (method !== 'query' && method !== 'execute') return method;
	const options = args[2] as Options;
	const extra = [
		options?.name === undefined ? '' : ` name=${options.name}`,
		options?.signal === undefined ? '' : ' signal',
		options?.cancel === undefined ? '' : ` cancel=${options.cancel}`,
		options?.timeout === undefined ? '' : ` timeout=${options.timeout}`,
	].join('');
	return `${method} ${args[0] as string}${extra}`;
};

/** Records the calls on `pool`, and on each connection while it is checked out of it. */
const record = (pool: Pool) => {
	const calls: string[] = [];
	let on = false;
	const out = new Set<object>();
	const wrapped = new WeakSet<object>();
	const wrap = (target: any, methods: readonly string[], prefix: string, active: () => boolean) => {
		for (const method of methods) {
			const original = target[method];
			if (typeof original !== 'function') continue;
			target[method] = function(this: unknown, ...args: unknown[]) {
				if (on && active()) calls.push(`${prefix}.${describeCall(method, args)}`);
				return original.apply(this, args);
			};
		}
	};
	wrap(pool, POOL_METHODS, 'pool', () => true);
	const acquire = pool.acquire;
	pool.acquire = async function(this: Pool) {
		const conn = await acquire.call(this);
		if (!wrapped.has(conn)) {
			wrapped.add(conn);
			wrap(conn, CONNECTION_METHODS, 'conn', () => out.has(conn));
		}
		out.add(conn);
		return conn;
	} as Pool['acquire'];
	const release = pool.release;
	pool.release = function(this: Pool, conn) {
		out.delete(conn);
		return release.call(this, conn);
	};
	return {
		run: async (body: () => Promise<unknown>) => {
			calls.length = 0;
			on = true;
			try {
				await body();
			} finally {
				on = false;
			}
			return [...calls];
		},
	};
};

const users = pgTable(`parity_users_${Math.random().toString(36).slice(2, 8)}`, {
	id: integer().primaryKey(),
	name: text().notNull(),
});

describe.skipIf(!connectionString)('async and Effect drivers call the pool the same way', () => {
	// Each side runs on a fresh pool: a connection's state, such as it's savepoint counter and the names it gives
	// repeated VALUES statements, then starts the same for both.
	let pools: Pool[] = [];
	let runtimes: ManagedRuntime.ManagedRuntime<any, any>[] = [];
	let adb: ReturnType<typeof drizzle>;
	let edb: PostgresDrizzle.EffectPostgresDatabase;
	let asyncRecorder: ReturnType<typeof record>;
	let effectRecorder: ReturnType<typeof record>;
	let effectRuntime: ManagedRuntime.ManagedRuntime<any, any>;

	const newPool = () => {
		const pool = createPool({ url: connectionString!, max: 2 });
		pools.push(pool);
		return pool;
	};

	beforeAll(async () => {
		const setup = drizzle({ client: newPool() });
		await setup.execute(sql`drop table if exists ${users}`);
		await setup.execute(sql`create table ${users} (id integer primary key, name text not null)`);
	});

	beforeEach(async () => {
		const asyncPool = newPool();
		adb = drizzle({ client: asyncPool });
		await adb.execute(sql`truncate ${users}`);
		const effectPool = newPool();
		effectRuntime = ManagedRuntime.make(DrizzlePostgresClient.layerFromPool(effectPool));
		runtimes.push(effectRuntime);
		edb = await effectRuntime.runPromise(PostgresDrizzle.makeWithDefaults());
		asyncRecorder = record(asyncPool);
		effectRecorder = record(effectPool);
	});

	afterAll(async () => {
		await drizzle({ client: pools[0]! }).execute(sql`drop table if exists ${users}`);
		for (const runtime of runtimes) await runtime.dispose();
		for (const pool of pools) await pool.end();
		pools = [];
		runtimes = [];
	});

	const both = async (
		asyncBody: () => Promise<unknown>,
		effectBody: () => Effect.Effect<unknown, unknown, never>,
	) => {
		const asyncCalls = await asyncRecorder.run(asyncBody);
		await adb.execute(sql`truncate ${users}`);
		const effectCalls = await effectRecorder.run(() => effectRuntime.runPromise(effectBody()));
		return { asyncCalls, effectCalls };
	};

	test('select, insert and db.execute', async () => {
		const { asyncCalls, effectCalls } = await both(
			async () => {
				await adb.insert(users).values({ id: 1, name: 'John' }).returning();
				await adb.select().from(users);
				await adb.execute(sql`select count(*) from ${users}`);
			},
			() =>
				Effect.gen(function*() {
					yield* edb.insert(users).values({ id: 1, name: 'John' }).returning();
					yield* edb.select().from(users);
					yield* edb.execute(sql`select count(*) from ${users}`);
				}),
		);
		expect(asyncCalls.length).toBe(3);
		expect(effectCalls).toStrictEqual(asyncCalls);
	});

	test('a named prepared statement', async () => {
		const { asyncCalls, effectCalls } = await both(
			async () => {
				const byId = adb.select().from(users).where(sql`${users.id} = ${sql.placeholder('id')}`).prepare(
					'parity_by_id',
				);
				await byId.execute({ id: 1 });
			},
			() =>
				Effect.gen(function*() {
					const byId = edb.select().from(users).where(sql`${users.id} = ${sql.placeholder('id')}`).prepare(
						'parity_by_id',
					);
					yield* byId.execute({ id: 1 });
				}),
		);
		expect(asyncCalls).toStrictEqual([expect.stringContaining('name=parity_by_id')]);
		expect(effectCalls).toStrictEqual(asyncCalls);
	});

	test('a transaction with settings and a nested transaction', async () => {
		const { asyncCalls, effectCalls } = await both(
			() =>
				adb.transaction(async (tx) => {
					await tx.insert(users).values({ id: 1, name: 'John' });
					await tx.transaction(async (inner) => {
						await inner.insert(users).values({ id: 2, name: 'Jane' });
					});
					await tx.select().from(users);
				}, { isolationLevel: 'serializable', accessMode: 'read write' }),
			() =>
				edb.transaction((tx) =>
					Effect.gen(function*() {
						yield* tx.insert(users).values({ id: 1, name: 'John' });
						yield* tx.transaction((inner) => inner.insert(users).values({ id: 2, name: 'Jane' }));
						yield* tx.select().from(users);
					}), { isolationLevel: 'serializable', accessMode: 'read write' }),
		);
		expect(asyncCalls).toContain('pool.transaction');
		expect(effectCalls).toStrictEqual(asyncCalls);
	});

	test('a transaction that fails rolls back the same way', async () => {
		const { asyncCalls, effectCalls } = await both(
			() =>
				adb.transaction(async (tx) => {
					await tx.insert(users).values({ id: 1, name: 'John' });
					await tx.insert(users).values({ id: 1, name: 'Duplicate' });
				}).catch(() => undefined),
			() =>
				edb.transaction((tx) =>
					Effect.gen(function*() {
						yield* tx.insert(users).values({ id: 1, name: 'John' });
						yield* tx.insert(users).values({ id: 1, name: 'Duplicate' });
					})
				).pipe(Effect.ignore),
		);
		expect(asyncCalls).toContain('conn.query rollback');
		expect(effectCalls).toStrictEqual(asyncCalls);
	});

	test('batch and pipeline', async () => {
		const { asyncCalls, effectCalls } = await both(
			async () => {
				const byId = adb.select().from(users).where(sql`${users.id} = ${sql.placeholder('id')}`).prepare(
					'parity_batch_by_id',
				);
				await adb.batch([adb.insert(users).values({ id: 1, name: 'John' }), byId.bind({ id: 1 })]);
				await adb.pipeline([adb.insert(users).values({ id: 2, name: 'Jane' }), adb.select().from(users)]);
			},
			() =>
				Effect.gen(function*() {
					const byId = edb.select().from(users).where(sql`${users.id} = ${sql.placeholder('id')}`).prepare(
						'parity_batch_by_id',
					);
					yield* edb.batch([edb.insert(users).values({ id: 1, name: 'John' }), byId.bind({ id: 1 })]);
					yield* edb.pipeline([edb.insert(users).values({ id: 2, name: 'Jane' }), edb.select().from(users)]);
				}),
		);
		expect(asyncCalls).toContain('pool.batch');
		expect(asyncCalls).toContain('pool.pipeline');
		expect(effectCalls).toStrictEqual(asyncCalls);
	});

	test('bulkInsert and bulkUpdate, also inside a transaction', async () => {
		const { asyncCalls, effectCalls } = await both(
			async () => {
				await adb.bulkInsert(users, [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]);
				await adb.bulkUpdate(users, [{ id: 1, name: 'Johnny' }], { by: users.id });
				await adb.transaction((tx) => tx.bulkInsert(users, [{ id: 3, name: 'Jim' }]));
			},
			() =>
				Effect.gen(function*() {
					yield* edb.bulkInsert(users, [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]);
					yield* edb.bulkUpdate(users, [{ id: 1, name: 'Johnny' }], { by: users.id });
					yield* edb.transaction((tx) => tx.bulkInsert(users, [{ id: 3, name: 'Jim' }]));
				}),
		);
		expect(asyncCalls).toContain('pool.bulkInsert');
		expect(effectCalls).toStrictEqual(asyncCalls);
	});
});
