// copyFrom, copyTo and cursor as Effect Streams, including early close and interrupt.
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { Cause, Effect, Exit, Fiber, Stream } from 'effect';
import { DrizzlePostgresClient } from '../../src/effect/index.ts';
import { testPool } from '../helpers/db.ts';
import { runTest } from '../helpers/effect.ts';

const SRC = `effect_copy_src_${process.pid}`;
const DST = `effect_copy_dst_${process.pid}`;
const query = async (sql: string): Promise<unknown[]> => {
	const pool = testPool();
	try {
		return (await pool.query(sql)).rows;
	} finally {
		await pool.end();
	}
};
beforeEach(async () => {
	const pool = testPool();
	await pool.query(`drop table if exists ${SRC}, ${DST}`);
	await pool.query(`create table ${SRC} (id int, name text)`);
	await pool.query(`create table ${DST} (id int, name text)`);
	await pool.query(`insert into ${SRC} select g, 'n' || g from generate_series(1, 1000) g`);
	await pool.end();
});
afterAll(async () => {
	const pool = testPool();
	await pool.query(`drop table if exists ${SRC}, ${DST}`);
	await pool.end();
});

const activeOrInTransaction = (applicationName: string) =>
	Effect.promise(() =>
		query(
			`select count(*)::int from pg_stat_activity where application_name = '${applicationName}' and state in ('active', 'idle in transaction')`,
		)
	)
		.pipe(Effect.map((rows) => (rows[0] as number[])[0]!));

describe('copyFrom and copyTo', () => {
	test('copyTo into copyFrom copies a table', async () => {
		const result = await runTest(Effect.gen(function*() {
			const client = yield* DrizzlePostgresClient.DrizzlePostgresClient;
			return yield* client.copyFrom(
				`copy ${DST} from stdin (format binary)`,
				client.copyTo(`copy ${SRC} to stdout (format binary)`),
			);
		}));
		expect(result.rowCount).toBe(1000);
		expect(await query(`select * from ${DST} except select * from ${SRC}`)).toEqual([]);
		expect(await query(`select count(*)::int from ${DST}`)).toEqual([[1000]]);
	});

	test('interrupting a copyFrom leaves no partial rows, and the pool serves the next statement', async () => {
		const next = await runTest(
			Effect.gen(function*() {
				const client = yield* DrizzlePostgresClient.DrizzlePostgresClient;
				const source = Stream.concat(Stream.make('1\ta\n', '2\tb\n'), Stream.never);
				const fiber = yield* Effect.forkChild(client.copyFrom(`copy ${DST} from stdin`, source));
				yield* Effect.sleep('200 millis');
				yield* Fiber.interrupt(fiber);
				return (yield* client.query('select 1')).rows;
			}).pipe(Effect.timeout('5 seconds')),
			{ maxConnections: 1 },
		);
		expect(next).toEqual([[1]]);
		expect(await query(`select count(*)::int from ${DST}`)).toEqual([[0]]);
	}, 10000);

	test('a failing source fails copyFrom with the source error and leaves no rows', async () => {
		const exit = await runTest(Effect.exit(Effect.gen(function*() {
			const client = yield* DrizzlePostgresClient.DrizzlePostgresClient;
			return yield* client.copyFrom(
				`copy ${DST} from stdin`,
				Stream.concat(Stream.make('1\ta\n'), Stream.fail('source broke')),
			);
		})));
		expect(Exit.isFailure(exit) ? exit.cause.reasons.find(Cause.isFailReason)?.error : undefined).toBe('source broke');
		expect(await query(`select count(*)::int from ${DST}`)).toEqual([[0]]);
	});

	test('closing copyTo early ends the COPY on the server', async () => {
		const applicationName = `effect_copyto_${process.pid}`;
		const result = await runTest(
			Effect.gen(function*() {
				const client = yield* DrizzlePostgresClient.DrizzlePostgresClient;
				const chunks = yield* Stream.runCollect(
					Stream.take(
						client.copyTo("copy (select g, repeat('x', 100) from generate_series(1, 10000000) g) to stdout"),
						1,
					),
				);
				let busy = 1;
				for (let i = 0; i < 40 && busy > 0; i++) {
					yield* Effect.sleep('50 millis');
					busy = yield* activeOrInTransaction(applicationName);
				}
				return { chunks: chunks.length, busy, next: (yield* client.query('select 1')).rows };
			}),
			{ applicationName, maxConnections: 1 },
		);
		expect(result).toEqual({ chunks: 1, busy: 0, next: [[1]] });
	}, 10000);
});

describe('cursor', () => {
	test('streams every row in batches of fetchSize', async () => {
		const batches = await runTest(Effect.gen(function*() {
			const client = yield* DrizzlePostgresClient.DrizzlePostgresClient;
			return yield* Stream.runCollect(
				client.cursor<{ id: number }>({ sql: `select id from ${SRC} order by id`, fetchSize: 300 }),
			);
		}));
		expect(batches.map((b) => b.length)).toEqual([300, 300, 300, 100]);
		expect(batches.flat().map((r) => r.id)).toEqual(Array.from({ length: 1000 }, (_, i) => i + 1));
	});

	test('taking a few batches and closing frees the connection and ends the cursor transaction', async () => {
		const applicationName = `effect_cursor_${process.pid}`;
		const result = await runTest(
			Effect.gen(function*() {
				const client = yield* DrizzlePostgresClient.DrizzlePostgresClient;
				const taken = yield* Stream.runCollect(
					Stream.take(client.cursor({ sql: `select id from ${SRC}`, fetchSize: 10 }), 2),
				);
				const busy = yield* activeOrInTransaction(applicationName);
				return { taken: taken.length, busy, next: (yield* client.query('select 1')).rows };
			}).pipe(Effect.timeout('5 seconds')),
			{ applicationName, maxConnections: 1 },
		);
		expect(result).toEqual({ taken: 2, busy: 0, next: [[1]] });
	});
});
