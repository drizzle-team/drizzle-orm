import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { reset, seed } from '../../../src/index.ts';
import * as schema from './mysqlSchema.ts';

let client: PGlite;
let db: PgliteDatabase;

beforeAll(async () => {
	client = new PGlite();

	db = drizzle(client);

	await db.execute(
		sql`
			CREATE TABLE IF NOT EXISTS "composite_example" (
			    "id" integer not null,
			    "name" text not null,
			    CONSTRAINT "composite_example_id_name_unique" UNIQUE("id","name"),
			    CONSTRAINT "custom_name" UNIQUE("id","name")
			);
		`,
	);

	await db.execute(
		sql`
			CREATE TABLE IF NOT EXISTS "unique_column_in_composite_of_two_0" (
			    "id" integer not null unique,
			    "name" text not null,
			    CONSTRAINT "custom_name0" UNIQUE("id","name")
			);
		`,
	);

	await db.execute(
		sql`
			CREATE TABLE IF NOT EXISTS "unique_column_in_composite_of_two_1" (
			    "id" integer not null,
			    "name" text not null,
			    CONSTRAINT "custom_name1" UNIQUE("id","name"),
				CONSTRAINT "custom_name1_id" UNIQUE("id")
			);
		`,
	);

	await db.execute(
		sql`
			CREATE TABLE IF NOT EXISTS "unique_column_in_composite_of_three_0" (
			    "id" integer not null unique,
			    "name" text not null,
				"slug" text not null,
			    CONSTRAINT "custom_name2" UNIQUE("id","name","slug")
			);
		`,
	);

	await db.execute(
		sql`
			CREATE TABLE IF NOT EXISTS "unique_column_in_composite_of_three_1" (
			    "id" integer not null,
			    "name" text not null,
				"slug" text not null,
			    CONSTRAINT "custom_name3" UNIQUE("id","name","slug"),
				CONSTRAINT "custom_name3_id" UNIQUE("id")
			);
		`,
	);
});

afterEach(async () => {
	await reset(db, schema);
});

afterAll(async () => {
	await client.close();
});

test('basic seed test', async () => {
	const currSchema = { composite: schema.composite };
	await seed(db, currSchema, { count: 16 }).refine((funcs) => ({
		composite: {
			columns: {
				id: funcs.valuesFromArray({ values: [0, 1, 2, 3] }),
				name: funcs.valuesFromArray({ values: ['a', 'b', 'c', 'd'] }),
			},
		},
	}));

	let composite = await db.select().from(schema.composite);

	expect(composite.length).toBe(16);
	await reset(db, currSchema);

	await seed(db, currSchema, { count: 16 }).refine((funcs) => ({
		composite: {
			columns: {
				id: funcs.valuesFromArray({ values: [0, 1] }),
				name: funcs.valuesFromArray({ values: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] }),
			},
		},
	}));

	composite = await db.select().from(schema.composite);

	expect(composite.length).toBe(16);
	await reset(db, currSchema);

	await seed(db, currSchema, { count: 17 }).refine((funcs) => ({
		composite: {
			columns: {
				id: funcs.valuesFromArray({ values: [0, 1] }),
				name: funcs.valuesFromArray({ values: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] }),
			},
		},
	}));

	composite = await db.select().from(schema.composite);

	expect(composite.length).toBe(17);
	await reset(db, currSchema);
});

test('unique column in composite of 2 columns', async () => {
	const currSchema0 = { uniqueColumnInCompositeOfTwo0: schema.uniqueColumnInCompositeOfTwo0 };
	await seed(db, currSchema0, { count: 4 }).refine((funcs) => ({
		uniqueColumnInCompositeOfTwo0: {
			columns: {
				id: funcs.valuesFromArray({ values: [0, 1, 2, 3] }),
				name: funcs.valuesFromArray({ values: ['a', 'b', 'c', 'd'] }),
			},
		},
	}));

	let composite = await db.select().from(schema.uniqueColumnInCompositeOfTwo0);

	expect(composite.length).toBe(4);
	await reset(db, currSchema0);

	const currSchema1 = { uniqueColumnInCompositeOfTwo1: schema.uniqueColumnInCompositeOfTwo1 };
	await seed(db, currSchema1, { count: 4 }).refine((funcs) => ({
		uniqueColumnInCompositeOfTwo1: {
			columns: {
				id: funcs.valuesFromArray({ values: [0, 1, 2, 3] }),
				name: funcs.valuesFromArray({ values: ['a', 'b', 'c', 'd'] }),
			},
		},
	}));

	composite = await db.select().from(schema.uniqueColumnInCompositeOfTwo1);

	expect(composite.length).toBe(4);
	await reset(db, currSchema1);
});

test('unique column in composite of 3 columns', async () => {
	const currSchema0 = { uniqueColumnInCompositeOfThree0: schema.uniqueColumnInCompositeOfThree0 };
	await seed(db, currSchema0, { count: 16 }).refine((funcs) => ({
		uniqueColumnInCompositeOfThree0: {
			columns: {
				id: funcs.valuesFromArray({ values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] }),
				name: funcs.valuesFromArray({ values: ['a', 'b'] }),
				slug: funcs.valuesFromArray({ values: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] }),
			},
		},
	}));

	let composite = await db.select().from(schema.uniqueColumnInCompositeOfThree0);

	expect(composite.length).toBe(16);
	await reset(db, currSchema0);

	const currSchema1 = { uniqueColumnInCompositeOfThree1: schema.uniqueColumnInCompositeOfThree1 };
	await seed(db, currSchema1, { count: 16 }).refine((funcs) => ({
		uniqueColumnInCompositeOfThree1: {
			columns: {
				id: funcs.valuesFromArray({ values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] }),
				name: funcs.valuesFromArray({ values: ['a', 'b'] }),
				slug: funcs.valuesFromArray({ values: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] }),
			},
		},
	}));

	composite = await db.select().from(schema.uniqueColumnInCompositeOfThree1);

	expect(composite.length).toBe(16);
	await reset(db, currSchema1);
});
