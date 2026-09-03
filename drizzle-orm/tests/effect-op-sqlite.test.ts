import type { OPSQLiteConnection, Transaction } from '@op-engineering/op-sqlite';
import * as Effect from 'effect/Effect';
import * as Fiber from 'effect/Fiber';
import { SqlError } from 'effect/unstable/sql/SqlError';
import { describe, it } from 'vitest';
import { makeWithDefaults, OPSQLiteClient } from '~/effect-op-sqlite/index.ts';
import { sql } from '~/sql/sql.ts';

const makeDb = (client: OPSQLiteConnection) =>
	Effect.runPromise(makeWithDefaults().pipe(Effect.provideService(OPSQLiteClient, client)));

describe('effect op-sqlite', () => {
	it('maps OP-SQLite query results to Effect queries', async ({ expect }) => {
		const calls: string[] = [];
		const rows = [{ value: 1 }];
		const client = {
			executeAsync: async (query: string) => {
				calls.push(query);
				return {
					rowsAffected: 1,
					rows: {
						_array: rows,
						length: rows.length,
						item: (index: number) => rows[index],
					},
				};
			},
			executeRawAsync: async (query: string) => {
				calls.push(query);
				return [[1]];
			},
		} as unknown as OPSQLiteConnection;
		const db = await makeDb(client);

		expect(await Effect.runPromise(db.all(sql.raw('objects')))).toEqual(rows);
		expect(await Effect.runPromise(db.get(sql.raw('object')))).toEqual(rows[0]);
		expect(await Effect.runPromise(db.values(sql.raw('values')))).toEqual([[1]]);
		expect(await Effect.runPromise(db.run(sql.raw('run')))).toMatchObject({ rowsAffected: 1 });
		expect(calls).toEqual(['objects', 'object', 'values', 'run']);
	});

	it('uses native transactions, nested savepoints, and preserves failures', async ({ expect }) => {
		const events: string[] = [];
		const client = {
			transaction: async (callback: (tx: Transaction) => Promise<void>) => {
				events.push('begin');
				try {
					await callback({} as Transaction);
					events.push('commit');
				} catch (error) {
					events.push('rollback');
					throw error;
				}
			},
			executeAsync: async (query: string) => {
				events.push(query);
				return { rowsAffected: 0 };
			},
			executeRawAsync: async () => [],
		} as unknown as OPSQLiteConnection;
		const db = await makeDb(client);

		const result = await Effect.runPromise(
			db.transaction((tx) =>
				Effect.gen(function*() {
					yield* tx.run(sql.raw('outer'));
					yield* tx.transaction((nested) => nested.run(sql.raw('inner')));
					return 42;
				}), { behavior: 'deferred' }),
		);

		expect(result).toBe(42);
		expect(events).toEqual([
			'begin',
			'outer',
			'savepoint sp0',
			'inner',
			'release savepoint sp0',
			'commit',
		]);

		events.length = 0;
		await Effect.runPromise(
			db.transaction((tx) =>
				Effect.gen(function*() {
					yield* tx.transaction(() => Effect.interrupt).pipe(Effect.exit);
					yield* tx.run(sql.raw('after nested interrupt'));
				})
			),
		);
		expect(events).toEqual([
			'begin',
			'savepoint sp0',
			'rollback to savepoint sp0',
			'release savepoint sp0',
			'after nested interrupt',
			'commit',
		]);

		events.length = 0;
		const failure = new Error('boom');
		const error = await Effect.runPromise(
			db.transaction(() => Effect.fail(failure)).pipe(Effect.flip),
		);

		expect(error).toBe(failure);
		expect(events).toEqual(['begin', 'rollback']);

		events.length = 0;
		const defect = new Error('defect');
		const caughtDefect = await Effect.runPromise(
			db.transaction((): Effect.Effect<never> => {
				throw defect;
			}).pipe(Effect.catchDefect((cause) => Effect.succeed(cause))),
		);
		expect(caughtDefect).toBe(defect);
		expect(events).toEqual(['begin', 'rollback']);

		events.length = 0;
		let nestedStartedResolve!: () => void;
		const nestedStarted = new Promise<void>((resolve) => {
			nestedStartedResolve = resolve;
		});
		const nestedFiber = Effect.runFork(
			db.transaction((tx) =>
				tx.transaction(() =>
					Effect.gen(function*() {
						yield* Effect.sync(() => nestedStartedResolve());
						return yield* Effect.never;
					})
				)
			),
		);
		await nestedStarted;
		await Effect.runPromise(Fiber.interrupt(nestedFiber));
		expect(events).toEqual([
			'begin',
			'savepoint sp0',
			'rollback to savepoint sp0',
			'release savepoint sp0',
			'rollback',
		]);
	});

	it('interrupts the transaction body and waits for rollback', async ({ expect }) => {
		const events: string[] = [];
		let bodyStartedResolve!: () => void;
		const bodyStarted = new Promise<void>((resolve) => {
			bodyStartedResolve = resolve;
		});
		let continueBodyResolve!: () => void;
		const continueBody = new Promise<void>((resolve) => {
			continueBodyResolve = resolve;
		});
		let transactionDone = false;
		const client = {
			transaction: async (callback: (tx: Transaction) => Promise<void>) => {
				events.push('begin');
				try {
					await callback({} as Transaction);
					events.push('commit');
				} catch (error) {
					events.push('rollback');
					throw error;
				} finally {
					transactionDone = true;
				}
			},
			executeAsync: async (query: string) => {
				events.push(query);
				return { rowsAffected: 0 };
			},
			executeRawAsync: async () => [],
		} as unknown as OPSQLiteConnection;
		const db = await makeDb(client);

		const fiber = Effect.runFork(
			db.transaction((tx) =>
				Effect.gen(function*() {
					yield* Effect.sync(() => bodyStartedResolve());
					yield* Effect.promise(() => continueBody);
					yield* tx.run(sql.raw('write-after-interrupt'));
				})
			),
		);

		await bodyStarted;
		await Effect.runPromise(Fiber.interrupt(fiber));
		try {
			expect(transactionDone).toBe(true);
			expect(events).toEqual(['begin', 'rollback']);
		} finally {
			continueBodyResolve();
		}
	});

	it('rejects transaction behaviors unsupported by the native helper', async ({ expect }) => {
		let transactionCalls = 0;
		const client = {
			transaction: async () => {
				transactionCalls++;
			},
		} as unknown as OPSQLiteConnection;
		const db = await makeDb(client);

		for (const behavior of ['immediate', 'exclusive'] as const) {
			const error = await Effect.runPromise(
				db.transaction(() => Effect.void, { behavior }).pipe(Effect.flip),
			);
			expect(error).toBeInstanceOf(SqlError);
		}
		expect(transactionCalls).toBe(0);
	});
});
