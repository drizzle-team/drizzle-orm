import { SQL as BunSQL } from 'bun';
import { beforeAll, beforeEach, expect, test } from 'bun:test';
import { defineRelations, eq, hammingDistance, jaccardDistance, l2Distance, not, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';
import type { BunSQLDatabase } from 'drizzle-orm/bun-sql/postgres';
import { bigserial, bit, halfvec, integer, pgTable, sparsevec, vector } from 'drizzle-orm/pg-core';

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

let db: BunSQLDatabase<typeof relations>;

const seed = {
	vector: [3, 1, 2],
	bit: '000',
	halfvec: [1, 2, 3],
	sparsevec: '{1:1,3:2,5:3}/5',
};
const expected = { id: 1, ...seed };

beforeAll(async () => {
	const connectionString = process.env['PG_VECTOR_CONNECTION_STRING'];
	if (!connectionString) {
		throw new Error(
			'PG_VECTOR_CONNECTION_STRING is not set. Bring DBs up with `bash compose/dockers.sh up postgres-vector` and export the connection string before running tests.',
		);
	}
	const connClient = new BunSQL(connectionString, { max: 1 });
	await connClient.unsafe(`select 1`);

	db = drizzle({ client: connClient, logger: false, relations });

	await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector;`);
});

beforeEach(async () => {
	await db.execute(sql`drop table if exists items cascade`);
	await db.execute(sql`
		CREATE TABLE items (
			id bigserial PRIMARY KEY,
			"vector" vector(3),
			"bit" bit(3),
			"halfvec" halfvec(3),
			"sparsevec" sparsevec(5)
		);
	`);
});

test('insert + partial select', async () => {
	const insertedValues = await db.insert(items).values([seed]).returning();

	const query = db.select({ distance: l2Distance(items.vector, [3, 1, 2]) }).from(items);
	expect(query.toSQL()).toStrictEqual({ sql: 'select "vector" <-> $1 from "items"', params: ['[3,1,2]'] });

	const response = await query;

	expect(insertedValues).toStrictEqual([expected]);
	expect(response).toStrictEqual([{ distance: 0 }]);
});

test('insert + complex where', async () => {
	const insertedValues = await db.insert(items).values([seed]).returning();

	const res = await db.select().from(items)
		.where(sql`${l2Distance(items.vector, [3, 1, 2])} < ${5}`)
		.limit(5);

	expect(insertedValues).toStrictEqual([expected]);
	expect(res).toStrictEqual([expected]);
});

test('insert + order by subquery', async () => {
	await db.insert(items).values([seed, seed]).returning();

	const subquery = db.select({ vector: items.vector }).from(items).where(eq(items.id, 1));
	const res = await db.select().from(items)
		.where(not(eq(items.id, 1)))
		.orderBy(l2Distance(items.vector, subquery))
		.limit(5);

	expect(res).toStrictEqual([{ ...expected, id: 2 }]);
});

test('insert + select order by jaccard / hamming distance', async () => {
	await db.insert(items).values(seed).returning();

	const jaccard = await db.select().from(items).orderBy(jaccardDistance(items.bit, '101')).limit(5);
	const hamming = await db.select().from(items).orderBy(hammingDistance(items.bit, '101')).limit(5);

	expect(jaccard).toStrictEqual([expected]);
	expect(hamming).toStrictEqual([expected]);
});

test('select + insert all vectors', async () => {
	const insertedValues = await db.insert(items).values(seed).returning();
	const response = await db.select().from(items);

	expect(insertedValues).toStrictEqual([expected]);
	expect(response).toStrictEqual([expected]);
});

test('null vectors survive driver-side parsing', async () => {
	await db.insert(items).values([{}]);

	const response = await db.select().from(items);

	expect(response).toStrictEqual([{ id: 1, vector: null, bit: null, halfvec: null, sparsevec: null }]);
});

test('vector arrays are parsed item by item', async () => {
	await db.execute(sql`drop table if exists vec_arrays cascade`);
	await db.execute(sql`
		CREATE TABLE vec_arrays (
			id integer PRIMARY KEY,
			"vectors" vector(3)[],
			"halfvecs" halfvec(3)[],
			"sparsevecs" sparsevec(5)[]
		);
	`);

	const vecArrays = pgTable('vec_arrays', {
		id: integer('id').primaryKey(),
		vectors: vector('vectors', { dimensions: 3 }).array(),
		halfvecs: halfvec('halfvecs', { dimensions: 3 }).array(),
		sparsevecs: sparsevec('sparsevecs', { dimensions: 5 }).array(),
	});

	await db.insert(vecArrays).values({
		id: 1,
		vectors: [[1, 2, 3], [4, 5, 6]],
		halfvecs: [[1, 2, 3], [4, 5, 6]],
		sparsevecs: ['{1:1,3:2,5:3}/5', '{2:9}/5'],
	});

	const response = await db.select().from(vecArrays);

	expect(response).toStrictEqual([{
		id: 1,
		vectors: [[1, 2, 3], [4, 5, 6]],
		halfvecs: [[1, 2, 3], [4, 5, 6]],
		sparsevecs: ['{1:1,3:2,5:3}/5', '{2:9}/5'],
	}]);

	await db.execute(sql`drop table vec_arrays cascade`);
});

test('RQBv2', async () => {
	await db.insert(items).values([seed]).returning();

	const rawResponse = await db.select().from(items);
	const rootRqbResponse = await db.query.items.findMany();
	const { self: nestedRqbResponse } = (await db.query.items.findFirst({
		with: {
			self: true,
		},
	}))!;

	expect(rootRqbResponse).toStrictEqual(rawResponse);
	expect(nestedRqbResponse).toStrictEqual(rawResponse);
});
