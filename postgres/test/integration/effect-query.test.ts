// DrizzlePostgresClient.query: Drizzle Postgres query options from the Effect entry point.
import { describe, expect, test } from 'bun:test';
import { Cause, Effect, Exit } from 'effect';
import { DrizzlePostgresClient } from '../../src/effect/index.ts';
import { testPool } from '../helpers/db.ts';
import { runTest } from '../helpers/effect.ts';

const SQL = 'select id, name, n8, data from t where id <= $1 order by id';

describe('DrizzlePostgresClient.query', () => {
	test('each mode returns the same value as the async entry point', async () => {
		const pool = testPool();
		try {
			const modes = ['array', 'object', 'buffer', 'raw', 'wire'] as const;
			const expected = await Promise.all(modes.map((mode) => pool.query(SQL, [2], { mode })));
			const got = await runTest(Effect.gen(function*() {
				const client = yield* DrizzlePostgresClient.DrizzlePostgresClient;
				return yield* Effect.all(modes.map((mode) => client.query(SQL, [2], { mode: mode as 'array' })));
			}));
			for (let i = 0; i < modes.length; i++) {
				const e = expected[i] as unknown as { rows?: unknown };
				if (modes[i] === 'wire') {
					expect(Buffer.concat(got[i] as unknown as Uint8Array[])).toEqual(Buffer.concat(e as unknown as Uint8Array[]));
				} else expect(got[i]).toEqual(e as never);
			}
		} finally {
			await pool.end();
		}
	});

	test('a shape decodes typed values, and a reused name skips the parse step on its second run', async () => {
		const [first, second] = await runTest(
			Effect.gen(function*() {
				const client = yield* DrizzlePostgresClient.DrizzlePostgresClient;
				const run = client.query('select id, n8 from t where id = $1', [1], {
					shape: { id: 'int4', n8: 'int8' },
					name: 'effect_query_shape',
					debug: true,
				});
				return [yield* run, yield* run];
			}),
			{ maxConnections: 1 },
		);
		expect(first.rows).toEqual([{ id: 1, n8: 9007199254740993n }]);
		expect(first.debug?.reusedPreparedStatement).toBe(false);
		expect(second.debug?.reusedPreparedStatement).toBe(true);
	});

	test("inside withTransaction the query sees the transaction's uncommitted rows", async () => {
		const rows = await runTest(Effect.gen(function*() {
			const client = yield* DrizzlePostgresClient.DrizzlePostgresClient;
			return yield* client.withTransaction(Effect.gen(function*() {
				yield* client`create temp table effect_query_tx (id int) on commit drop`;
				yield* client`insert into effect_query_tx values (1)`;
				return (yield* client.query('select id from effect_query_tx', [], { mode: 'object' })).rows;
			}));
		}));
		expect(rows).toEqual([{ id: 1 }]);
	});

	// The timed-out pg_sleep isn't canceled: it runs to the end, and `select 9` waits behind it on the one connection
	test('errors are SqlErrors, and Effect.timeout returns at once', async () => {
		const result = await runTest(
			Effect.gen(function*() {
				const client = yield* DrizzlePostgresClient.DrizzlePostgresClient;
				const failed = yield* Effect.exit(client.query('select 1 / 0'));
				const t0 = Date.now();
				const timedOut = yield* Effect.exit(client.query('select pg_sleep(5)').pipe(Effect.timeout('100 millis')));
				const elapsed = Date.now() - t0;
				const next = (yield* client.query('select 9')).rows;
				return { failed, timedOut, elapsed, next };
			}),
			{ maxConnections: 1 },
		);
		const reason = Exit.isFailure(result.failed)
			? (result.failed.cause.reasons.find(Cause.isFailReason)?.error as { reason: { _tag: string } } | undefined)
				?.reason._tag
			: undefined;
		expect(reason).toBe('UnknownError');
		expect(Exit.isFailure(result.timedOut)).toBe(true);
		expect(result.elapsed).toBeLessThan(2000);
		expect(result.next).toEqual([[9]]);
	}, 10000);

	// As in query/query-shape-compat.test.ts: a shape that disagrees with the column (drizzle's schema in code vs the
	// database) reads the real type, and fails when the declared JS type can't hold the value.
	test('a shape that disagrees with the column reads the real type', async () => {
		const [res1, res2] = await runTest(Effect.gen(function*() {
			const client = yield* DrizzlePostgresClient.DrizzlePostgresClient;
			const res1 = yield* client.query('select 5000000000::int8 as v', [], { shape: { v: 'int4' } });
			const res2 = yield* Effect.exit(client.query('select 9007199254740993::int8 as v', [], { shape: { v: 'int4' } }));
			return [res1, res2] as const;
		}));

		expect(res1.rows).toEqual([{ v: 5000000000 }]);
		expect(Exit.isFailure(res2)).toBe(true);
	});

	// One connection, so the named statement is the one cached before the DDL
	test('a named statement with a shape still works after DDL changes its result type', async () => {
		const T = `effect_shape_ddl_${process.pid}`;
		const got = await runTest(
			Effect.gen(function*() {
				const client = yield* DrizzlePostgresClient.DrizzlePostgresClient;
				yield* client.query(`drop table if exists ${T}`);
				yield* client.query(`create table ${T} (v varchar(10))`);
				yield* client.query(`insert into ${T} values ('a')`);
				const run = Effect.exit(
					client.query(`select v from ${T}`, [], { name: `${T}_q`, mode: 'object', shape: { v: 'varchar' } }),
				);
				const before = yield* run;
				yield* client.query(`alter table ${T} alter column v type varchar(20)`);
				const after = yield* run;
				yield* client.query(`drop table ${T}`);
				const value = (exit: typeof before) => Exit.isSuccess(exit) ? exit.value.rows[0]!['v'] : 'error';
				return { before: value(before), after: value(after) };
			}),
			{ maxConnections: 1 },
		);
		expect(got).toEqual({ before: 'a', after: 'a' });
	});

	// The byte type of Deno, Workers and browsers: a Uint8Array that is not a Buffer must reach a bytea as those bytes.
	// @effect/sql-pg sends it as bytea; it must not be the JSON text of an object.
	test('a Uint8Array param is bytea, through client.query and an effect/sql statement', async () => {
		const bytes = new Uint8Array([0xab, 0xcd, 0x00, 0x01]);
		const got = await runTest(Effect.gen(function*() {
			const client = yield* DrizzlePostgresClient.DrizzlePostgresClient;
			const viaQuery = yield* client.query('select $1::bytea as a', [bytes], { mode: 'object' });
			const [viaStatement] = yield* client<{ a: Uint8Array }>`select ${bytes}::bytea as a`;
			return { viaQuery: [...(viaQuery.rows[0]!.a as Uint8Array)], viaStatement: [...viaStatement!.a] };
		}));
		expect(got).toEqual({ viaQuery: [0xab, 0xcd, 0x00, 0x01], viaStatement: [0xab, 0xcd, 0x00, 0x01] });
	});
});
