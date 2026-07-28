import { defineRelations, eq, hammingDistance, jaccardDistance, l2Distance, not, sql } from 'drizzle-orm';
import { bigserial, bit, customType, halfvec, integer, pgTable, sparsevec, vector } from 'drizzle-orm/pg-core';
import type { PostgresDatabase } from 'drizzle-orm/postgres';
import { drizzle } from 'drizzle-orm/postgres';
import type { Pool } from 'minipg';
import { afterAll, beforeAll, beforeEach, expect, expectTypeOf, test } from 'vitest';

const ENABLE_LOGGING = false;

let db: PostgresDatabase<typeof relations> & { $client: Pool };

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

beforeAll(async () => {
	const connectionString = process.env['PG_VECTOR_CONNECTION_STRING'];
	if (!connectionString) throw new Error('PG_VECTOR_CONNECTION_STRING is not set in env variables');

	db = drizzle(connectionString, { logger: ENABLE_LOGGING, relations });

	await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector;`);
});

afterAll(async () => {
	await db?.$client.end().catch(console.error);
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
	const insertedValues = await db.insert(items).values([{
		vector: [3, 1, 2],
		bit: '000',
		halfvec: [1, 2, 3],
		sparsevec: '{1:1,3:2,5:3}/5',
	}]).returning();

	const query = db.select({ distance: l2Distance(items.vector, [3, 1, 2]) }).from(items);

	expect(query.toSQL()).toStrictEqual({ sql: 'select "vector" <-> $1 from "items"', params: ['[3,1,2]'] });

	const response = await query;

	expect(insertedValues).toStrictEqual([{
		id: 1,
		vector: [3, 1, 2],
		bit: '000',
		halfvec: [1, 2, 3],
		sparsevec: '{1:1,3:2,5:3}/5',
	}]);

	expect(response).toStrictEqual([{ distance: 0 }]);
});

// SELECT * FROM items WHERE embedding <-> '[3,1,2]' < 5;
test('insert + complex where', async () => {
	const insertedValues = await db.insert(items).values([{
		vector: [3, 1, 2],
		bit: '000',
		halfvec: [1, 2, 3],
		sparsevec: '{1:1,3:2,5:3}/5',
	}]).returning();

	const query = db.select().from(items)
		.where(sql`${l2Distance(items.vector, [3, 1, 2])} < ${5}`)
		.limit(5);

	expect(query.toSQL()).toStrictEqual({
		sql:
			'select "id", "vector", "bit", "halfvec", "sparsevec" from "items" where "items"."vector" <-> $1 < $2 limit $3',
		params: ['[3,1,2]', 5, 5],
	});
	const res = await query;

	expect(insertedValues).toStrictEqual([{
		id: 1,
		vector: [3, 1, 2],
		bit: '000',
		halfvec: [1, 2, 3],
		sparsevec: '{1:1,3:2,5:3}/5',
	}]);

	expect(res).toStrictEqual([
		{
			id: 1,
			vector: [3, 1, 2],
			bit: '000',
			halfvec: [1, 2, 3],
			sparsevec: '{1:1,3:2,5:3}/5',
		},
	]);
});

// SELECT * FROM items WHERE id != 1 ORDER BY embedding <-> (SELECT embedding FROM items WHERE id = 1) LIMIT 5;
test('insert + order by subquery', async () => {
	const insertedValues = await db.insert(items).values([{
		vector: [3, 1, 2],
		bit: '000',
		halfvec: [1, 2, 3],
		sparsevec: '{1:1,3:2,5:3}/5',
	}, {
		vector: [3, 1, 2],
		bit: '000',
		halfvec: [1, 2, 3],
		sparsevec: '{1:1,3:2,5:3}/5',
	}]).returning();

	const subquery = db.select({ vector: items.vector }).from(items).where(eq(items.id, 1));

	const query = db.select().from(items)
		.where(not(eq(items.id, 1)))
		.orderBy(l2Distance(items.vector, subquery))
		.limit(5);

	expect(query.toSQL()).toStrictEqual({
		sql:
			'select "id", "vector", "bit", "halfvec", "sparsevec" from "items" where not ("items"."id" = $1) order by "items"."vector" <-> (select "vector" from "items" where "items"."id" = $2) limit $3',
		params: [1, 1, 5],
	});
	const res = await query;

	expect(insertedValues).toStrictEqual([{
		id: 1,
		vector: [3, 1, 2],
		bit: '000',
		halfvec: [1, 2, 3],
		sparsevec: '{1:1,3:2,5:3}/5',
	}, {
		id: 2,
		vector: [3, 1, 2],
		bit: '000',
		halfvec: [1, 2, 3],
		sparsevec: '{1:1,3:2,5:3}/5',
	}]);

	expect(res).toStrictEqual([
		{
			id: 2,
			vector: [3, 1, 2],
			bit: '000',
			halfvec: [1, 2, 3],
			sparsevec: '{1:1,3:2,5:3}/5',
		},
	]);
});

test('insert + select order by jaccard distance', async () => {
	const insertedValues = await db.insert(items).values({
		vector: [1, 2, 3],
		bit: '000',
		halfvec: [1, 2, 3],
		sparsevec: '{1:1,3:2,5:3}/5',
	}).returning();

	const bitQuery = db.select().from(items).orderBy(jaccardDistance(items.bit, '101')).limit(5);

	expect(bitQuery.toSQL()).toStrictEqual({
		params: [
			'101',
			5,
		],
		sql: 'select "id", "vector", "bit", "halfvec", "sparsevec" from "items" order by "items"."bit" <%> $1 limit $2',
	});

	expect(insertedValues).toStrictEqual([{
		id: 1,
		vector: [1, 2, 3],
		bit: '000',
		halfvec: [1, 2, 3],
		sparsevec: '{1:1,3:2,5:3}/5',
	}]);

	const response = await bitQuery;

	expect(response).toStrictEqual([{
		id: 1,
		vector: [1, 2, 3],
		bit: '000',
		halfvec: [1, 2, 3],
		sparsevec: '{1:1,3:2,5:3}/5',
	}]);
});

test('insert + select order by hamming distance', async () => {
	const insertedValues = await db.insert(items).values({
		vector: [1, 2, 3],
		bit: '000',
		halfvec: [1, 2, 3],
		sparsevec: '{1:1,3:2,5:3}/5',
	}).returning();

	const bitQuery = db.select().from(items).orderBy(hammingDistance(items.bit, '101')).limit(5);

	expect(bitQuery.toSQL()).toStrictEqual({
		params: [
			'101',
			5,
		],
		sql: 'select "id", "vector", "bit", "halfvec", "sparsevec" from "items" order by "items"."bit" <~> $1 limit $2',
	});

	expect(insertedValues).toStrictEqual([{
		id: 1,
		vector: [1, 2, 3],
		bit: '000',
		halfvec: [1, 2, 3],
		sparsevec: '{1:1,3:2,5:3}/5',
	}]);

	const response = await bitQuery;

	expect(response).toStrictEqual([{
		id: 1,
		vector: [1, 2, 3],
		bit: '000',
		halfvec: [1, 2, 3],
		sparsevec: '{1:1,3:2,5:3}/5',
	}]);
});

test('insert + select order by l2 distance', async () => {
	const insertedValues = await db.insert(items).values({
		vector: [1, 2, 3],
		bit: '000',
		halfvec: [1, 2, 3],
		sparsevec: '{1:1,3:2,5:3}/5',
	}).returning();

	const queryVector = db.select().from(items).orderBy(l2Distance(items.vector, [3, 1, 2])).limit(5);
	const queryHalfvec = db.select().from(items).orderBy(l2Distance(items.halfvec, [3, 1, 2])).limit(5);
	const querySparsevec = db.select().from(items).orderBy(l2Distance(items.sparsevec, '{1:3,3:1,5:2}/5')).limit(5);

	expect(queryVector.toSQL()).toStrictEqual({
		params: [
			'[3,1,2]',
			5,
		],
		sql: 'select "id", "vector", "bit", "halfvec", "sparsevec" from "items" order by "items"."vector" <-> $1 limit $2',
	});

	expect(queryHalfvec.toSQL()).toStrictEqual({
		params: [
			'[3,1,2]',
			5,
		],
		sql: 'select "id", "vector", "bit", "halfvec", "sparsevec" from "items" order by "items"."halfvec" <-> $1 limit $2',
	});

	expect(querySparsevec.toSQL()).toStrictEqual({
		params: [
			'{1:3,3:1,5:2}/5',
			5,
		],
		sql:
			'select "id", "vector", "bit", "halfvec", "sparsevec" from "items" order by "items"."sparsevec" <-> $1 limit $2',
	});

	const vectorRes = await queryVector;
	const halfvecRes = await queryHalfvec;
	const sparsevecRes = await querySparsevec;

	expect(insertedValues).toStrictEqual([{
		id: 1,
		vector: [1, 2, 3],
		bit: '000',
		halfvec: [1, 2, 3],
		sparsevec: '{1:1,3:2,5:3}/5',
	}]);

	const expectedResponse = [{
		id: 1,
		vector: [1, 2, 3],
		bit: '000',
		halfvec: [1, 2, 3],
		sparsevec: '{1:1,3:2,5:3}/5',
	}];

	expect(vectorRes).toStrictEqual(expectedResponse);
	expect(halfvecRes).toStrictEqual(expectedResponse);
	expect(sparsevecRes).toStrictEqual(expectedResponse);
});

test('select + insert all vectors', async () => {
	const insertedValues = await db.insert(items).values({
		vector: [1, 2, 3],
		bit: '000',
		halfvec: [1, 2, 3],
		sparsevec: '{1:1,3:2,5:3}/5',
	}).returning();

	const response = await db.select().from(items);

	expect(insertedValues).toStrictEqual([{
		id: 1,
		vector: [1, 2, 3],
		bit: '000',
		halfvec: [1, 2, 3],
		sparsevec: '{1:1,3:2,5:3}/5',
	}]);

	expect(response).toStrictEqual([{
		id: 1,
		vector: [1, 2, 3],
		bit: '000',
		halfvec: [1, 2, 3],
		sparsevec: '{1:1,3:2,5:3}/5',
	}]);
});

test('null vectors survive driver-side parsing', async () => {
	await db.insert(items).values([{}]);

	const response = await db.select().from(items);

	expect(response).toStrictEqual([{
		id: 1,
		vector: null,
		bit: null,
		halfvec: null,
		sparsevec: null,
	}]);
});

test('vector arrays are parsed item by item', async () => {
	await db.execute(sql`drop table if exists vector_arrays cascade`);
	await db.execute(sql`
		CREATE TABLE vector_arrays (
			id integer PRIMARY KEY,
			"vectors" vector(3)[]
		);
	`);

	const vectorArrays = pgTable('vector_arrays', {
		id: integer('id').primaryKey(),
		vectors: vector('vectors', { dimensions: 3 }).array(),
	});

	await db.insert(vectorArrays).values({ id: 1, vectors: [[1, 2, 3], [4, 5, 6]] });

	const response = await db.select().from(vectorArrays);

	expect(response).toStrictEqual([{ id: 1, vectors: [[1, 2, 3], [4, 5, 6]] }]);

	await db.execute(sql`drop table vector_arrays cascade`);
});

test('halfvec and sparsevec arrays are parsed item by item', async () => {
	await db.execute(sql`drop table if exists vec_arrays cascade`);
	await db.execute(sql`
		CREATE TABLE vec_arrays (
			id integer PRIMARY KEY,
			"halfvecs" halfvec(3)[],
			"sparsevecs" sparsevec(5)[]
		);
	`);

	const vecArrays = pgTable('vec_arrays', {
		id: integer('id').primaryKey(),
		halfvecs: halfvec('halfvecs', { dimensions: 3 }).array(),
		sparsevecs: sparsevec('sparsevecs', { dimensions: 5 }).array(),
	});

	await db.insert(vecArrays).values({
		id: 1,
		halfvecs: [[1, 2, 3], [4, 5, 6]],
		sparsevecs: ['{1:1,3:2,5:3}/5', '{2:9}/5'],
	});

	const response = await db.select().from(vecArrays);

	expect(response).toStrictEqual([{
		id: 1,
		halfvecs: [[1, 2, 3], [4, 5, 6]],
		sparsevecs: ['{1:1,3:2,5:3}/5', '{2:9}/5'],
	}]);

	await db.execute(sql`drop table vec_arrays cascade`);
});

test('a custom column over a vector type decodes on top of the parsed vector', async () => {
	await db.execute(sql`drop table if exists custom_vectors cascade`);
	await db.execute(sql`
		CREATE TABLE custom_vectors (
			id integer PRIMARY KEY,
			"summed" vector(3)
		);
	`);

	const summedVector = customType<{ data: number; driverData: number[]; config: { dimensions: number } }>({
		dataType: (config) => `vector(${config!.dimensions})`,
		codec: 'vector',
		toDriver: () => sql`'[1,2,3]'`,
		fromDriver: (value) => value.reduce((acc, v) => acc + v, 0),
	});

	const customVectors = pgTable('custom_vectors', {
		id: integer('id').primaryKey(),
		summed: summedVector('summed', { dimensions: 3 }),
	});

	await db.insert(customVectors).values({ id: 1, summed: 0 });

	const response = await db.select().from(customVectors);
	expect(response).toStrictEqual([{ id: 1, summed: 6 }]);

	await db.execute(sql`drop table custom_vectors cascade`);
});

test('RQBv2', async () => {
	await db.insert(items).values([{
		vector: [3, 1, 2],
		bit: '000',
		halfvec: [1, 2, 3],
		sparsevec: '{1:1,3:2,5:3}/5',
	}]).returning();

	const rawResponse = await db.select().from(items);
	const rootRqbResponse = await db.query.items.findMany();
	const { self: nestedRqbResponse } = (await db.query.items.findFirst({
		with: {
			self: true,
		},
	}))!;

	expectTypeOf(rootRqbResponse).toEqualTypeOf(rawResponse);
	expectTypeOf(nestedRqbResponse).toEqualTypeOf(rawResponse);

	expect(rootRqbResponse).toStrictEqual(rawResponse);
	expect(nestedRqbResponse).toStrictEqual(rawResponse);
});
