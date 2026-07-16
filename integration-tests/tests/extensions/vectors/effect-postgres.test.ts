import { PgClient } from '@effect/sql-pg';
import { expect, it } from '@effect/vitest';
import { defineRelations, eq, l2Distance, not, sql } from 'drizzle-orm';
import * as PgDrizzle from 'drizzle-orm/effect-postgres';
import { bigserial, bit, halfvec, integer, pgTable, sparsevec, vector } from 'drizzle-orm/pg-core';
import * as Effect from 'effect/Effect';
import * as Redacted from 'effect/Redacted';
import { beforeEach } from 'vitest';

const items = pgTable('items', {
	id: bigserial('id', { mode: 'number' }).primaryKey(),
	vector: vector('vector', { dimensions: 3 }),
	bit: bit('bit', { dimensions: 3 }),
	halfvec: halfvec('halfvec', { dimensions: 3 }),
	sparsevec: sparsevec('sparsevec', { dimensions: 5 }),
});

const relations = defineRelations({ items }, (r) => ({
	items: {
		self: r.many.items({
			from: r.items.id,
			to: r.items.id,
		}),
	},
}));

const connectionStr = Redacted.make(
	process.env['PG_VECTOR_CONNECTION_STRING'] ?? 'postgres://postgres:postgres@localhost:54321/drizzle',
);
const TestLive = PgClient.layer({ url: connectionStr });

const withDb = <A, E, R>(f: (db: PgDrizzle.EffectPgDatabase<typeof relations>) => Effect.Effect<A, E, R>) =>
	Effect.gen(function*() {
		const db = yield* PgDrizzle.make({ relations }).pipe(Effect.provide(PgDrizzle.DefaultServices));
		return yield* f(db as any);
	}).pipe(Effect.provide(TestLive));

beforeEach(async () => {
	await Effect.runPromise(
		withDb((db) =>
			Effect.gen(function*() {
				yield* db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector;`);
				yield* db.execute(sql`drop table if exists items cascade`);
				yield* db.execute(sql`
					CREATE TABLE items (
						id bigserial PRIMARY KEY,
						"vector" vector(3),
						"bit" bit(3),
						"halfvec" halfvec(3),
						"sparsevec" sparsevec(5)
					);
				`);
			})
		) as Effect.Effect<void, any, never>,
	);
});

const seed = {
	vector: [3, 1, 2],
	bit: '000',
	halfvec: [1, 2, 3],
	sparsevec: '{1:1,3:2,5:3}/5',
};
const expected = { id: 1, ...seed };

it.effect('insert + partial select', () =>
	withDb((db) =>
		Effect.gen(function*() {
			const insertedValues = yield* db.insert(items).values([seed]).returning();

			const query = db.select({ distance: l2Distance(items.vector, [3, 1, 2]) }).from(items);
			expect(query.toSQL()).toStrictEqual({ sql: 'select "vector" <-> $1 from "items"', params: ['[3,1,2]'] });

			const response = yield* query;

			expect(insertedValues).toStrictEqual([expected]);
			expect(response).toStrictEqual([{ distance: 0 }]);
		})
	));

it.effect('insert + complex where', () =>
	withDb((db) =>
		Effect.gen(function*() {
			const insertedValues = yield* db.insert(items).values([seed]).returning();

			const res = yield* db.select().from(items)
				.where(sql`${l2Distance(items.vector, [3, 1, 2])} < ${5}`)
				.limit(5);

			expect(insertedValues).toStrictEqual([expected]);
			expect(res).toStrictEqual([expected]);
		})
	));

it.effect('insert + order by subquery', () =>
	withDb((db) =>
		Effect.gen(function*() {
			yield* db.insert(items).values([seed, seed]).returning();

			const subquery = db.select({ vector: items.vector }).from(items).where(eq(items.id, 1));
			const res = yield* db.select().from(items)
				.where(not(eq(items.id, 1)))
				.orderBy(l2Distance(items.vector, subquery))
				.limit(5);

			expect(res).toStrictEqual([{ ...expected, id: 2 }]);
		})
	));

it.effect('select + insert all vectors', () =>
	withDb((db) =>
		Effect.gen(function*() {
			const insertedValues = yield* db.insert(items).values(seed).returning();
			const response = yield* db.select().from(items);

			expect(insertedValues).toStrictEqual([expected]);
			expect(response).toStrictEqual([expected]);
		})
	));

it.effect('null vectors survive driver-side parsing', () =>
	withDb((db) =>
		Effect.gen(function*() {
			yield* db.insert(items).values([{}]);
			const response = yield* db.select().from(items);

			expect(response).toStrictEqual([{ id: 1, vector: null, bit: null, halfvec: null, sparsevec: null }]);
		})
	));

it.effect('vector arrays are parsed item by item', () =>
	withDb((db) =>
		Effect.gen(function*() {
			const vecArrays = pgTable('vec_arrays', {
				id: integer('id').primaryKey(),
				vectors: vector('vectors', { dimensions: 3 }).array(),
				halfvecs: halfvec('halfvecs', { dimensions: 3 }).array(),
				sparsevecs: sparsevec('sparsevecs', { dimensions: 5 }).array(),
			});

			yield* db.execute(sql`drop table if exists vec_arrays cascade`);
			yield* db.execute(sql`
				CREATE TABLE vec_arrays (
					id integer PRIMARY KEY,
					"vectors" vector(3)[],
					"halfvecs" halfvec(3)[],
					"sparsevecs" sparsevec(5)[]
				);
			`);

			yield* db.insert(vecArrays).values({
				id: 1,
				vectors: [[1, 2, 3], [4, 5, 6]],
				halfvecs: [[1, 2, 3], [4, 5, 6]],
				sparsevecs: ['{1:1,3:2,5:3}/5', '{2:9}/5'],
			});

			const response = yield* db.select().from(vecArrays);
			expect(response).toStrictEqual([{
				id: 1,
				vectors: [[1, 2, 3], [4, 5, 6]],
				halfvecs: [[1, 2, 3], [4, 5, 6]],
				sparsevecs: ['{1:1,3:2,5:3}/5', '{2:9}/5'],
			}]);

			yield* db.execute(sql`drop table vec_arrays cascade`);
		})
	));

it.effect('RQBv2', () =>
	withDb((db) =>
		Effect.gen(function*() {
			yield* db.insert(items).values([seed]).returning();

			const rawResponse = yield* db.select().from(items);
			const rootRqbResponse = yield* db.query.items.findMany();
			const nested = yield* db.query.items.findFirst({ with: { self: true } });

			expect(rootRqbResponse).toStrictEqual(rawResponse);
			expect(nested!.self).toStrictEqual(rawResponse);
		})
	));
