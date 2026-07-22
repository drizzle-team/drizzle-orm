import * as Effect from 'effect/Effect';
import * as Fiber from 'effect/Fiber';
import { SqlError } from 'effect/unstable/sql/SqlError';
import type { SQLiteDatabase, SQLiteStatement } from 'expo-sqlite';
import { describe, it } from 'vitest';
import { ExpoSQLiteClient, makeWithDefaults } from '~/effect-expo-sqlite/index.ts';
import { sql } from '~/sql/sql.ts';

const makeDb = (client: SQLiteDatabase) =>
	Effect.runPromise(makeWithDefaults().pipe(Effect.provideService(ExpoSQLiteClient, client)));

describe('effect expo-sqlite', () => {
	it('maps Expo query results to Effect queries and finalizes statements', async ({ expect }) => {
		const queries: string[] = [];
		const finalized: string[] = [];
		const rows = [{ value: 1 }];
		const client = {
			prepareSync: (query: string) => {
				queries.push(query);
				return {
					executeSync: () => ({
						changes: 1,
						lastInsertRowId: 2,
						getAllSync: () => rows,
						getFirstSync: () => rows[0],
					}),
					executeForRawResultSync: () => ({
						getAllSync: () => [[1]],
						getFirstSync: () => [1],
					}),
					finalizeSync: () => finalized.push(query),
				} as unknown as SQLiteStatement;
			},
		} as unknown as SQLiteDatabase;
		const db = await makeDb(client);

		expect(await Effect.runPromise(db.all(sql.raw('objects')))).toEqual(rows);
		expect(await Effect.runPromise(db.get(sql.raw('object')))).toEqual(rows[0]);
		expect(await Effect.runPromise(db.values(sql.raw('values')))).toEqual([[1]]);
		expect(await Effect.runPromise(db.run(sql.raw('run')))).toEqual({ changes: 1, lastInsertRowId: 2 });
		expect(queries).toEqual(['objects', 'object', 'values', 'run']);
		expect(finalized).toEqual(queries);
	});

	it('uses the exclusive transaction client, nested savepoints, and preserves failures', async ({ expect }) => {
		const events: string[] = [];
		const transactionClient = {
			execSync: (query: string) => events.push(query),
			prepareSync: (query: string) => {
				events.push(query);
				return {
					executeSync: () => ({ changes: 0, lastInsertRowId: 0 }),
					finalizeSync: () => {},
				} as unknown as SQLiteStatement;
			},
		} as unknown as SQLiteDatabase;
		const client = {
			withExclusiveTransactionAsync: async (callback: (client: SQLiteDatabase) => Promise<void>) => {
				events.push('begin');
				try {
					await callback(transactionClient);
					events.push('commit');
				} catch (error) {
					events.push('rollback');
					throw error;
				}
			},
		} as unknown as SQLiteDatabase;
		const db = await makeDb(client);

		const result = await Effect.runPromise(
			db.transaction((tx) =>
				Effect.gen(function*() {
					yield* tx.run(sql.raw('outer'));
					yield* tx.transaction((nested) => nested.run(sql.raw('inner')));
					return 42;
				})
			),
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
		const transactionClient = {
			prepareSync: (query: string) => ({
				executeSync: () => {
					events.push(query);
					return { changes: 0, lastInsertRowId: 0 };
				},
				finalizeSync: () => {},
			} as unknown as SQLiteStatement),
		} as unknown as SQLiteDatabase;
		const client = {
			databaseName: 'test.db',
			withExclusiveTransactionAsync: async (callback: (client: SQLiteDatabase) => Promise<void>) => {
				events.push('begin');
				try {
					await callback(transactionClient);
					events.push('commit');
				} catch (error) {
					events.push('rollback');
					throw error;
				} finally {
					transactionDone = true;
				}
			},
		} as unknown as SQLiteDatabase;
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

	it('uses the original connection for memory database transactions', async ({ expect }) => {
		const events: string[] = [];
		const client = {
			databaseName: ':memory:',
			withTransactionAsync: async (callback: () => Promise<void>) => {
				events.push('begin');
				try {
					await callback();
					events.push('commit');
				} catch (error) {
					events.push('rollback');
					throw error;
				}
			},
			withExclusiveTransactionAsync: async () => {
				events.push('exclusive');
			},
			prepareSync: (query: string) => ({
				executeSync: () => {
					events.push(query);
					return { changes: 0, lastInsertRowId: 0 };
				},
				finalizeSync: () => {},
			} as unknown as SQLiteStatement),
		} as unknown as SQLiteDatabase;
		const db = await makeDb(client);

		const result = await Effect.runPromise(
			db.transaction((tx) => tx.run(sql.raw('inside')).pipe(Effect.as(42))),
		);

		expect(result).toBe(42);
		expect(events).toEqual(['begin', 'inside', 'commit']);
	});

	it('rejects transaction behaviors unsupported by the native helper', async ({ expect }) => {
		let transactionCalls = 0;
		const client = {
			databaseName: 'test.db',
			withExclusiveTransactionAsync: async () => {
				transactionCalls++;
			},
		} as unknown as SQLiteDatabase;
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
