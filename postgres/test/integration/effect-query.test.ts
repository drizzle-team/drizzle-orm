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

	test('errors are SqlErrors, and an interrupt cancels the query', async () => {
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
});
