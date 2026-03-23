import {
	defineRelations,
	desc,
	eq,
	getColumns,
	hammingDistance,
	jaccardDistance,
	l2Distance,
	not,
	SQL,
	sql,
} from 'drizzle-orm';
import { bigserial, bit, customType, halfvec, pgTable, sparsevec, text, vector } from 'drizzle-orm/pg-core';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { afterAll, beforeAll, beforeEach, expect, expectTypeOf, test } from 'vitest';

const ENABLE_LOGGING = false;

let client: Sql;
let db: PostgresJsDatabase<never, typeof relations>;

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

const _push = async (
	query: (sql: string, params: any[]) => Promise<any[]>,
	schema: any,
	log?: 'statements',
) => {
	const { diff } = await import('../../../../drizzle-kit/tests/postgres/mocks' as string);

	const res = await diff({}, schema, []);

	for (const s of res.sqlStatements) {
		if (log === 'statements') console.log(s);
		await query(s, []).catch((e) => {
			console.error(s);
			console.error(e);
			throw e;
		});
	}
};

let push: (schema: any, options?: { log: 'statements' }) => Promise<void>;

beforeAll(async () => {
	const connectionString = process.env['PG_VECTOR_CONNECTION_STRING'];
	if (!connectionString) throw new Error('PG_VECTOR_CONNECTION_STRING is not set in env variables');

	client = postgres(connectionString, {
		max: 1,
		onnotice: () => {
			// disable notices
		},
	});
	await client`select 1`;
	db = drizzle({ client, logger: ENABLE_LOGGING, relations });

	await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector;`);

	push = async (
		schema: any,
		options?: { log: 'statements' },
	) => await _push(client.unsafe, schema, options?.log);
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

// https://github.com/drizzle-team/drizzle-orm/issues/5358
test('select with getColumns spread containing custom type', async () => {
	const vector = customType<{
		data: number[];
		driverData: string;
		config: { dimensions: number };
	}>({
		dataType(config) {
			return `vector(${config?.dimensions ?? 3})`;
		},
		toDriver(value: number[]): string {
			return `[${value.join(',')}]`;
		},
		fromDriver(value: string): number[] {
			return value
				.replace(/^\[|\]$/g, '')
				.split(',')
				.map(Number);
		},
	});

	const tsvector = customType<{ data: string }>({
		dataType() {
			return 'tsvector';
		},
	});

	const items = pgTable('items1', {
		name: text('name').notNull(),
		embedding: vector('embedding', { dimensions: 3 }),
		searchVector: tsvector('search_vector').generatedAlwaysAs(
			(): SQL => sql`to_tsvector('english', coalesce(${items.name}, ''))`,
		),
	});

	const schema = { items };
	await db.execute(sql`drop table if exists items1`);
	await push(schema);

	await db
		.insert(schema.items)
		.values({ name: 'hello world', embedding: [0.3, 0.2, 0.1] });

	const queryVec = '[0.1, 0.2, 0.3]';

	const distanceExpr = sql<number>`(${schema.items.embedding} <=> ${queryVec}::vector)`.as(
		'distance',
	);

	const result1 = await db
		.select({
			...getColumns(schema.items),
			distance: distanceExpr,
		})
		.from(schema.items)
		.orderBy(sql`${schema.items.embedding} <=> ${queryVec}::vector`)
		.limit(5);

	expect(result1[0]?.distance).toBeCloseTo(0.2857, 4);

	const queryText = 'hello';
	const rankExpr = sql<
		number
	>`ts_rank_cd(${schema.items.searchVector}, websearch_to_tsquery('english', ${queryText}))`.as(
		'rank',
	);

	const result2 = await db
		.select({
			...getColumns(schema.items),
			rank: rankExpr,
		})
		.from(schema.items)
		.where(
			sql`${schema.items.searchVector} @@ websearch_to_tsquery('english', ${queryText})`,
		)
		.orderBy(desc(rankExpr))
		.limit(5);

	expect(result2[0]?.rank).toBeCloseTo(0.1);
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
