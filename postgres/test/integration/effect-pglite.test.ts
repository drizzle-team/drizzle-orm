// @drizzle-team/postgres/effect/pglite: DrizzlePostgresClient over an in-process PGlite.
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Effect, Exit, Fiber } from 'effect';
import { SqlClient } from 'effect/sql/SqlClient';
import { DrizzlePostgresClient } from '../../src/effect/pglite.ts';

let pg: PGlite;
beforeAll(async () => {
	pg = await PGlite.create();
	await pg.exec('create table effect_pglite (id int primary key, name text)');
});
afterAll(async () => {
	await pg?.close();
});

const run = <A, E>(effect: Effect.Effect<A, E, DrizzlePostgresClient.DrizzlePostgresClient | SqlClient>) =>
	Effect.runPromise(Effect.provide(effect, DrizzlePostgresClient.layer(pg, { applicationName: 'effect-pglite' })));

describe('DrizzlePostgresClient over PGlite', () => {
	test('queries run through the SqlClient and through query', async () => {
		const result = await run(Effect.gen(function*() {
			const sql = yield* SqlClient;
			const client = yield* DrizzlePostgresClient.DrizzlePostgresClient;
			const [row] = yield* sql<{ app: string }>`select current_setting('application_name') as app`;
			const typed = yield* client.query('select $1::int8 as n', [5n], { mode: 'object' });
			return { app: row!.app, rows: typed.rows };
		}));
		expect(result).toEqual({ app: 'effect-pglite', rows: [{ n: 5n }] });
	});

	test('withTransaction commits and rolls back', async () => {
		const rows = await run(Effect.gen(function*() {
			const sql = yield* SqlClient;
			yield* sql.withTransaction(sql`insert into effect_pglite values (1, 'kept')`);
			yield* sql.withTransaction(
				Effect.andThen(sql`insert into effect_pglite values (2, 'dropped')`, Effect.fail('no')),
			)
				.pipe(Effect.ignore);
			return yield* sql`select id, name from effect_pglite order by id`;
		}));
		expect(rows).toEqual([{ id: 1, name: 'kept' }]);
	});

	test('a chunked bulkInsert in a pipeline keeps to its own transaction', async () => {
		await pg.exec('truncate effect_pglite');
		const exit = await run(Effect.exit(Effect.gen(function*() {
			const client = yield* DrizzlePostgresClient.DrizzlePostgresClient;
			return yield* client.pipeline([
				client.bulkInsert(
					'effect_pglite',
					{ id: 'int4', name: 'text' },
					[...Array.from({ length: 30 }, (_, i) => [i, `n${i}`]), [3, 'duplicate']],
					{ chunk: 10 },
				),
				client.query(`insert into effect_pglite values (1000, 'other')`),
			]);
		})));
		expect(Exit.isFailure(exit)).toBe(true);
		expect((await pg.query('select id from effect_pglite')).rows).toEqual([{ id: 1000 }]);
	});

	test('an interrupt closes the connection, and the next statement opens a clean one', async () => {
		const result = await run(Effect.gen(function*() {
			const sql = yield* SqlClient;
			const slow = yield* Effect.forkChild(sql`select pg_sleep(0.2)`);
			yield* Effect.sleep('20 millis');
			yield* Fiber.interrupt(slow);
			return yield* sql`select 1 as one`;
		}));
		expect(result).toEqual([{ one: 1 }]);
	});

	test('closing the layer leaves PGlite open', async () => {
		await run(Effect.void);
		expect((await pg.query('select 2 as two')).rows).toEqual([{ two: 2 }]);
	});
});
