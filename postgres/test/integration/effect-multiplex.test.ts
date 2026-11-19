// DrizzlePostgresClient with `multiplex: true`. Requires `bun run test:setup`.
//
// As in @effect/sql-pg: a statement outside a transaction, `reserve` and `pipeline` shares a pool connection with
// other fibers' statements instead of taking one to itself. Interrupting it sends no CancelRequest, which would stop
// whatever its backend runs, possibly another fiber's statement: one not yet sent never runs, and one already sent
// runs to the end on the server. Transactions, `reserve`, streams and `pipeline` keep a connection to themselves,
// and interrupting them cancels on the server as before.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Effect, Exit, Fiber, Stream } from 'effect';
import { SqlClient } from 'effect/sql/SqlClient';
import type { SqlError } from 'effect/sql/SqlError';
import { DrizzlePostgresClient } from '../../src/effect/index.ts';
import { TEST_TIMEOUT, testPool } from '../helpers/db.ts';
import { runTest } from '../helpers/effect.ts';

const T = `effect_multiplex_${process.pid}`;
const admin = testPool({ max: 1 });

beforeAll(async () => {
	await admin.execute(`drop table if exists ${T}`);
	await admin.execute(`create table ${T}(tag text primary key)`);
});
afterAll(async () => {
	await admin.execute(`drop table if exists ${T}`);
	await admin.end();
});

const tags = async (tag: string): Promise<number> => {
	const r = await admin.query(`select count(*)::int4 from ${T} where tag = $1`, [tag]);
	return (r.rows[0] as unknown as number[])[0]!;
};
const slowInsert = (seconds: number) => `insert into ${T}(tag) select $1 from pg_sleep(${seconds})`;
const multiplexed = { multiplex: true, maxConnections: 1 } as const;

// The pool's checked-in connections while `body` runs a statement that takes 300 ms
const idleWhileRunning = (body: (sql: SqlClient) => Effect.Effect<unknown, unknown>) =>
	Effect.gen(function*() {
		const client = yield* DrizzlePostgresClient.DrizzlePostgresClient;
		const sql = yield* SqlClient;
		yield* sql`select 1`; // open the connection
		const fiber = yield* Effect.forkChild(body(sql));
		yield* Effect.sleep('80 millis');
		const idle = client.pool.idleCount;
		yield* Fiber.join(fiber);
		return idle;
	});

describe('DrizzlePostgresClient multiplex', () => {
	test('a statement shares its connection, and does not without multiplex', async () => {
		const run = (sql: SqlClient) => sql`select pg_sleep(0.3)`;
		expect(await runTest(idleWhileRunning(run), multiplexed)).toBe(1);
		expect(await runTest(idleWhileRunning(run), { maxConnections: 1 })).toBe(0);
	}, TEST_TIMEOUT);

	test('client.query shares its connection too', async () => {
		const idle = await runTest(
			Effect.gen(function*() {
				const client = yield* DrizzlePostgresClient.DrizzlePostgresClient;
				return yield* idleWhileRunning(() => client.query('select pg_sleep(0.3)'));
			}),
			multiplexed,
		);
		expect(idle).toBe(1);
	}, TEST_TIMEOUT);

	test('an interrupted statement that was sent runs to the end, and the statement behind it is untouched', async () => {
		const result = await runTest(
			Effect.gen(function*() {
				const sql = yield* SqlClient;
				yield* sql`select 1`;
				const fiber = yield* Effect.forkChild(sql.unsafe(slowInsert(0.4), ['sent']));
				const behind = yield* Effect.forkChild(sql<{ v: string }>`select 'behind' as v`);
				yield* Effect.sleep('100 millis');
				const t0 = Date.now();
				const exit = yield* Fiber.interrupt(fiber).pipe(Effect.andThen(Fiber.await(fiber)));
				return { exit, ms: Date.now() - t0, behind: yield* Fiber.join(behind) };
			}),
			multiplexed,
		);
		expect(Exit.isFailure(result.exit) && Exit.hasInterrupts(result.exit)).toBe(true);
		expect(result.ms).toBeLessThan(200);
		expect(result.behind).toEqual([{ v: 'behind' }]);
		await Bun.sleep(400);
		expect(await tags('sent')).toBe(1);
	}, TEST_TIMEOUT);

	test('a statement interrupted inside a transaction is canceled on the server', async () => {
		await runTest(
			Effect.gen(function*() {
				const sql = yield* SqlClient;
				const fiber = yield* Effect.forkChild(sql.withTransaction(sql.unsafe(slowInsert(0.4), ['tx'])));
				yield* Effect.sleep('100 millis');
				yield* Fiber.interrupt(fiber);
			}),
			multiplexed,
		);
		await Bun.sleep(400);
		expect(await tags('tx')).toBe(0);
	}, TEST_TIMEOUT);

	test('reserve keeps a connection to itself', async () => {
		const idle = await runTest(
			Effect.scoped(Effect.gen(function*() {
				const client = yield* DrizzlePostgresClient.DrizzlePostgresClient;
				const sql = yield* SqlClient;
				const conn = yield* sql.reserve;
				yield* conn.executeValues('select 1', []);
				return client.pool.idleCount;
			})),
			multiplexed,
		);
		expect(idle).toBe(0);
	}, TEST_TIMEOUT);

	test('pipeline runs its statements on one connection', async () => {
		const pids = await runTest(
			Effect.gen(function*() {
				const client = yield* DrizzlePostgresClient.DrizzlePostgresClient;
				const sql = yield* SqlClient;
				const pid = sql<{ pid: number }>`select pg_backend_pid() as pid`;
				return yield* client.pipeline([pid, pid, pid]);
			}),
			{ multiplex: true, maxConnections: 3 },
		);
		expect(new Set(pids.map((rows) => rows[0]!.pid)).size).toBe(1);
	}, TEST_TIMEOUT);

	test('a stream runs on a connection of its own', async () => {
		const rows = await runTest(
			Effect.gen(function*() {
				const sql = yield* SqlClient;
				return yield* Stream.runCollect(sql<{ n: number }>`select generate_series(1, 3) as n`.stream);
			}),
			multiplexed,
		);
		expect(Array.from(rows)).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
	}, TEST_TIMEOUT);

	test('errors keep their reasons: a constraint violation and a lost connection', async () => {
		const reasons = await runTest(
			Effect.gen(function*() {
				const sql = yield* SqlClient;
				yield* sql.unsafe(`insert into ${T}(tag) values ('dup')`);
				const duplicate = yield* Effect.flip(sql.unsafe(`insert into ${T}(tag) values ('dup')`));
				const lost = yield* Effect.flip(sql`select pg_terminate_backend(pg_backend_pid())`);
				return [duplicate, lost].map((e) => (e as SqlError).reason._tag);
			}),
			multiplexed,
		);
		expect(reasons).toEqual(['UniqueViolation', 'ConnectionError']);
	}, TEST_TIMEOUT);
});
