import { defineRelations, eq, hammingDistance, jaccardDistance, l2Distance, not, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import { bigserial, bit, halfvec, pgTable, sparsevec, vector } from 'drizzle-orm/pg-core';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, expect, expectTypeOf, test } from 'vitest';

const { Client } = pg;

const ENABLE_LOGGING = false;

let client: pg.Client;
let db: NodePgDatabase<never, typeof relations>;

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

	client = new Client(connectionString);
	await client.connect();
	db = drizzle({ client, logger: ENABLE_LOGGING, relations });

	await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector;`);
});

afterAll(async () => {
	await client?.end().catch(console.error);
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
			'select "id", "vector", "bit", "halfvec", "sparsevec" from "items" where not "items"."id" = $1 order by "items"."vector" <-> (select "vector" from "items" where "items"."id" = $2) limit $3',
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
