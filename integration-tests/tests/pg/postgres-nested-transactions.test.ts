// Nested transactions started at the same time, in the async and the Effect drizzle-orm/postgres drivers. Each nested
// transaction is a SAVEPOINT, and Postgres nests savepoints in the order they are created, not by caller: releasing or
// rolling back to the first one also ends every savepoint made after it. So the result must not depend on how the
// siblings interleave: each commits or rolls back only its own work.
import { createPool, type Pool } from '@drizzle-team/postgres';
import { sql } from 'drizzle-orm';
import * as PostgresDrizzle from 'drizzle-orm/effect-drizzle-postgres';
import { integer, pgTable } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres';
import { DrizzlePostgresClient } from 'drizzle-orm/postgres/client/effect';
import * as Effect from 'effect/Effect';
import * as Fiber from 'effect/Fiber';
import * as ManagedRuntime from 'effect/ManagedRuntime';
import * as Result from 'effect/Result';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

const connectionString = process.env['PG_CONNECTION_STRING'];

const rows = pgTable(`nested_tx_${Math.random().toString(36).slice(2, 8)}`, {
	id: integer().primaryKey(),
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!connectionString)('concurrent nested transactions', () => {
	let pool: Pool;
	let adb: ReturnType<typeof drizzle>;
	let runtime: ManagedRuntime.ManagedRuntime<any, any>;
	let edb: PostgresDrizzle.EffectPostgresDatabase;

	const ids = async () => (await adb.select().from(rows).orderBy(rows.id)).map((row) => row.id);

	beforeAll(async () => {
		pool = createPool({ url: connectionString! });
		adb = drizzle({ client: pool });
		await adb.execute(sql`drop table if exists ${rows}`);
		await adb.execute(sql`create table ${rows} (id integer primary key)`);
		runtime = ManagedRuntime.make(DrizzlePostgresClient.layerFromPool(pool));
		edb = await runtime.runPromise(PostgresDrizzle.makeWithDefaults());
	});

	afterAll(async () => {
		await adb?.execute(sql`drop table if exists ${rows}`);
		await runtime?.dispose();
		await pool?.end();
	});

	beforeEach(async () => {
		await adb.execute(sql`truncate ${rows}`);
	});

	describe('async', () => {
		test('both commit their work', async () => {
			await adb.transaction(async (tx) => {
				await Promise.all([
					tx.transaction(async (a) => {
						await a.insert(rows).values({ id: 1 });
					}),
					tx.transaction(async (b) => {
						await b.insert(rows).values({ id: 2 });
					}),
				]);
			});
			expect(await ids()).toStrictEqual([1, 2]);
		});

		test("a failing one rolls back only its own work, not a sibling's that already committed", async () => {
			const outcome: { a?: string; b?: string } = {};
			await adb.transaction(async (tx) => {
				await Promise.all([
					tx.transaction(async (a) => {
						await a.insert(rows).values({ id: 1 });
						await sleep(50);
						throw new Error('a fails');
					}).then(() => (outcome.a = 'committed'), () => (outcome.a = 'rolled back')),
					tx.transaction(async (b) => {
						await sleep(10);
						await b.insert(rows).values({ id: 2 });
					}).then(() => (outcome.b = 'committed'), () => (outcome.b = 'rolled back')),
				]);
			});
			expect(outcome).toStrictEqual({ a: 'rolled back', b: 'committed' });
			expect(await ids()).toStrictEqual([2]);
		});
	});

	describe('Effect', () => {
		test('both commit their work', async () => {
			await runtime.runPromise(
				edb.transaction((tx) =>
					Effect.all([
						tx.transaction((a) => a.insert(rows).values({ id: 1 })),
						tx.transaction((b) => b.insert(rows).values({ id: 2 })),
					], { concurrency: 'unbounded' })
				),
			);
			expect(await ids()).toStrictEqual([1, 2]);
		});

		test("a failing one rolls back only its own work, not a sibling's that already committed", async () => {
			const outcome = await runtime.runPromise(
				edb.transaction((tx) =>
					Effect.all([
						tx.transaction((a) =>
							a.insert(rows).values({ id: 1 }).pipe(
								Effect.andThen(Effect.sleep('50 millis')),
								Effect.andThen(Effect.fail('a fails')),
							)
						).pipe(Effect.result),
						tx.transaction((b) => Effect.sleep('10 millis').pipe(Effect.andThen(b.insert(rows).values({ id: 2 }))))
							.pipe(Effect.result),
					], { concurrency: 'unbounded' })
				),
			);
			expect(outcome.map(Result.isSuccess)).toStrictEqual([false, true]);
			expect(await ids()).toStrictEqual([2]);
		});

		// Fiber.interrupt returns when the fiber has ended, finalizers included, so the transaction has rolled back
		// by then. The finalizer delays the end: a rollback that runs after the fiber is gone shows as a row still there.
		test('an interrupted transaction has rolled back when Fiber.interrupt returns', async () => {
			const result = await runtime.runPromise(Effect.gen(function*() {
				let finalized = false;
				const fiber = yield* Effect.forkChild(edb.transaction((tx) =>
					tx.insert(rows).values({ id: 1 }).pipe(
						Effect.andThen(Effect.never),
						Effect.ensuring(Effect.andThen(Effect.sleep('200 millis'), Effect.sync(() => (finalized = true)))),
					)
				));
				yield* Effect.sleep('100 millis');
				yield* Fiber.interrupt(fiber);
				return { finalized };
			}));
			expect(result).toStrictEqual({ finalized: true });
			expect(await ids()).toStrictEqual([]);
		});
	});
});
