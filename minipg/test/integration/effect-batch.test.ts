// MinipgClient.batch and MinipgClient.pipeline with ordinary sql statements inside.
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { Effect, Exit } from 'effect';
import { SqlClient } from 'effect/sql/SqlClient';
import { MinipgClient } from '../../src/effect/index.ts';
import { testPool } from '../helpers/db.ts';
import { runTest } from '../helpers/effect.ts';

const T = `effect_batch_${process.pid}`;
const ids = async (): Promise<number[]> => {
	const pool = testPool();
	try {
		return (await pool.query(`select id from ${T} order by id`)).rows.map((r) => (r as unknown as number[])[0]!);
	} finally {
		await pool.end();
	}
};
beforeEach(async () => {
	const pool = testPool();
	await pool.query(`drop table if exists ${T}`);
	await pool.query(`create table ${T} (id int primary key)`);
	await pool.end();
});
afterAll(async () => {
	const pool = testPool();
	await pool.query(`drop table if exists ${T}`);
	await pool.end();
});

const insert = (id: number) =>
	Effect.gen(function*() {
		const sql = yield* SqlClient;
		yield* sql`insert into ${sql(T)} values (${id})`;
	});
const backendPid = Effect.gen(function*() {
	const sql = yield* SqlClient;
	const [row] = yield* sql<{ pid: number }>`select pg_backend_pid() as pid`;
	return row!.pid;
});

describe('batch', () => {
	test('a failing statement leaves no rows from the others', async () => {
		const exit = await runTest(Effect.exit(Effect.gen(function*() {
			const client = yield* MinipgClient.MinipgClient;
			return yield* client.batch([insert(1), insert(2), insert(1), insert(3)]);
		})));
		expect(Exit.isFailure(exit)).toBe(true);
		expect(await ids()).toEqual([]);
	});

	test('all statements commit together', async () => {
		await runTest(Effect.gen(function*() {
			const client = yield* MinipgClient.MinipgClient;
			return yield* client.batch([insert(1), insert(2)]);
		}));
		expect(await ids()).toEqual([1, 2]);
	});
});

describe('pipeline', () => {
	test('all statements run on one backend', async () => {
		const pids = await runTest(Effect.gen(function*() {
			const client = yield* MinipgClient.MinipgClient;
			return yield* client.pipeline(Array.from({ length: 8 }, () => backendPid));
		}));
		expect(new Set(pids).size).toBe(1);
	});

	test('a failed statement does not undo the others', async () => {
		const exit = await runTest(Effect.exit(Effect.gen(function*() {
			const client = yield* MinipgClient.MinipgClient;
			return yield* client.pipeline([insert(1), insert(2), insert(1), insert(3)]);
		})));
		expect(Exit.isFailure(exit)).toBe(true);
		expect(await ids()).toEqual([1, 2, 3]);
	});

	test('nested inside withTransaction it uses the transaction connection', async () => {
		const result = await runTest(Effect.gen(function*() {
			const client = yield* MinipgClient.MinipgClient;
			return yield* client.withTransaction(Effect.gen(function*() {
				const txPid = yield* backendPid;
				const pids = yield* client.pipeline([backendPid, Effect.andThen(insert(1), backendPid)]);
				return { txPid, pids };
			}));
		}));
		expect(result.pids).toEqual([result.txPid, result.txPid]);
		expect(await ids()).toEqual([1]);
	});

	test('a transaction that fails inside a pipeline does not roll back the other statements', async () => {
		const exit = await runTest(Effect.exit(Effect.gen(function*() {
			const client = yield* MinipgClient.MinipgClient;
			const failingTransaction = client.withTransaction(Effect.gen(function*() {
				yield* insert(2);
				yield* Effect.sleep('100 millis');
				return yield* Effect.fail('rollback');
			}));
			return yield* client.pipeline([failingTransaction, Effect.andThen(Effect.sleep('20 millis'), insert(1))]);
		})));
		expect(Exit.isFailure(exit)).toBe(true);
		expect(await ids()).toEqual([1]);
	});
});
