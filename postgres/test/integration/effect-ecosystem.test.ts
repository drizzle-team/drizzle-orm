// The wider Effect SQL ecosystem on Drizzle Postgres: Migrator, SqlSchema and reactive queries.
import { afterAll, describe, expect, test } from 'bun:test';
import { Effect, Fiber, Layer, Schema, Stream } from 'effect';
import * as Reactivity from 'effect/reactivity/Reactivity';
import * as Migrator from 'effect/sql/Migrator';
import { SqlClient } from 'effect/sql/SqlClient';
import * as SqlSchema from 'effect/sql/SqlSchema';
import { testPool } from '../helpers/db.ts';
import { runTest, testLayer } from '../helpers/effect.ts';

const K = `effect_eco_${process.pid}`;
afterAll(async () => {
	const pool = testPool();
	await pool.query(`drop table if exists ${K}_migrations, ${K}_users, ${K}_events`);
	await pool.end();
});

describe('Migrator', () => {
	test('applies two migrations and records them, and a second run applies nothing', async () => {
		const run = Migrator.make({})({
			table: `${K}_migrations`,
			loader: Migrator.fromRecord({
				'1_create_users': Effect.gen(function*() {
					const sql = yield* SqlClient;
					yield* sql.unsafe(`create table ${K}_users (id int primary key)`);
				}),
				'2_add_name': Effect.gen(function*() {
					const sql = yield* SqlClient;
					yield* sql.unsafe(`alter table ${K}_users add column name text`);
				}),
			}),
		});
		const first = await runTest(run);
		const second = await runTest(run);
		expect(first).toEqual([[1, 'create_users'], [2, 'add_name']]);
		expect(second).toEqual([]);
		const pool = testPool();
		try {
			const recorded = await pool.query(`select migration_id, name from ${K}_migrations order by migration_id`);
			expect(recorded.rows).toEqual([[1, 'create_users'], [2, 'add_name']] as never);
			const columns = await pool.query(
				`select column_name from information_schema.columns where table_name = '${K}_users' order by ordinal_position`,
			);
			expect(columns.rows).toEqual([['id'], ['name']] as never);
		} finally {
			await pool.end();
		}
	});
});

describe('SqlSchema', () => {
	test('a findAll query decodes rows with a Schema', async () => {
		const User = Schema.Struct({ id: Schema.Number, name: Schema.String });
		const rows = await runTest(Effect.gen(function*() {
			const sql = yield* SqlClient;
			const find = SqlSchema.findAll({
				Request: Schema.Number,
				Result: User,
				execute: (maxId) => sql`select id, name from t where id <= ${maxId} and name is not null order by id`,
			});
			return yield* find(2);
		}));
		expect(rows).toEqual([{ id: 1, name: 'alice' }, { id: 2, name: 'bob' }]);
	});
});

describe('reactive', () => {
	test('a reactive query emits again after a write to its key', async () => {
		const pool = testPool();
		await pool.query(`create table ${K}_events (id int)`);
		await pool.end();
		const layer = Layer.merge(testLayer(), Reactivity.layer);
		const counts = await Effect.runPromise(
			Effect.gen(function*() {
				const sql = yield* SqlClient;
				const count = Effect.map(
					sql<{ n: number }>`select count(*)::int as n from ${sql(`${K}_events`)}`,
					(rows) => rows[0]!.n,
				);
				const fiber = yield* Effect.forkChild(Stream.runCollect(Stream.take(sql.reactive([`${K}_events`], count), 2)));
				yield* Effect.sleep('200 millis');
				yield* Reactivity.mutation(sql`insert into ${sql(`${K}_events`)} values (1)`, [`${K}_events`]);
				return yield* Fiber.join(fiber);
			}).pipe(Effect.timeout('5 seconds'), Effect.provide(layer)),
		);
		expect(counts).toEqual([0, 1]);
	});
});
