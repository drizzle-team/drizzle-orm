// sql.stream in the Effect entry point: one held connection, socket backpressure, and cancel on early close.
import { describe, expect, test } from 'bun:test';
import { Effect, Stream, String as Str } from 'effect';
import { SqlClient } from 'effect/sql/SqlClient';
import { testPool } from '../helpers/db.ts';
import { runTest } from '../helpers/effect.ts';

// PostgreSQL returns rows one by one when generate_series is in the select list.
// In FROM, it stores every row before it returns the first one.
const BIG = "select generate_series(1, 10000000) as g, repeat('x', 100) as pad";

const activity = async (applicationName: string): Promise<{ state: string; wait: string | null }[]> => {
	const pool = testPool();
	try {
		const r = await pool.query('select state, wait_event from pg_stat_activity where application_name = $1', [
			applicationName,
		], { mode: 'object' });
		return (r.rows as unknown as Record<string, unknown>[]).map((row) => ({
			state: row.state as string,
			wait: row.wait_event as string | null,
		}));
	} finally {
		await pool.end();
	}
};

describe('sql.stream', () => {
	test('a consumer that stops pulling makes the server wait to write, so rows are not buffered', async () => {
		const applicationName = `effect_stream_bp_${process.pid}`;
		let seen: { state: string; wait: string | null }[] = [];
		await runTest(
			Effect.gen(function*() {
				const sql = yield* SqlClient;
				let n = 0;
				yield* sql.unsafe(BIG).stream.pipe(
					Stream.tap(() => (++n === 1
						? Effect.sleep('500 millis').pipe(Effect.andThen(Effect.promise(async () => {
							seen = await activity(applicationName);
						})))
						: Effect.void)
					),
					Stream.take(2),
					Stream.runDrain,
				);
			}),
			{ applicationName },
		);
		expect(seen).toContainEqual({ state: 'active', wait: 'ClientWrite' });
	}, 10000);

	test(
		'taking the first 10 rows of a large result ends the query on the server quickly, and the pool serves the next statement',
		async () => {
			const applicationName = `effect_stream_take_${process.pid}`;
			const result = await runTest(
				Effect.gen(function*() {
					const sql = yield* SqlClient;
					const rows = yield* Stream.runCollect(Stream.take(sql.unsafe(BIG).stream, 10));
					let active = 1;
					for (let i = 0; i < 40 && active > 0; i++) {
						yield* Effect.sleep('50 millis');
						const now = yield* Effect.promise(() => activity(applicationName));
						active = now.filter((a) => a.state === 'active').length;
					}
					const [next] = yield* sql<{ n: number }>`select 5 as n`;
					return { count: rows.length, active, next };
				}),
				{ applicationName, maxConnections: 1 },
			);
			expect(result).toEqual({ count: 10, active: 0, next: { n: 5 } });
		},
		10000,
	);

	test('transformResultNames applies to streamed rows', async () => {
		const rows = await runTest(
			Effect.gen(function*() {
				const sql = yield* SqlClient;
				return yield* Stream.runCollect(sql`select g as row_number from generate_series(1, 3) g`.stream);
			}),
			{ transformResultNames: Str.snakeToCamel },
		);
		expect(rows).toEqual([{ rowNumber: 1 }, { rowNumber: 2 }, { rowNumber: 3 }]);
	});

	test('inside a transaction the stream runs on the transaction connection', async () => {
		const rows = await runTest(
			Effect.gen(function*() {
				const sql = yield* SqlClient;
				return yield* sql.withTransaction(Effect.gen(function*() {
					yield* sql`create temp table effect_stream_tx (id int) on commit drop`;
					yield* sql`insert into effect_stream_tx values (1), (2)`;
					return yield* Stream.runCollect(sql`select id from effect_stream_tx order by id`.stream);
				}));
			}),
			{ maxConnections: 1 },
		);
		expect(rows).toEqual([{ id: 1 }, { id: 2 }]);
	});
});
