import { integer, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { expect } from 'vitest';
import { reset, seed } from '../../../src/index.ts';
import { pgliteTest as test } from '../instrumentation.ts';
import * as schema from './pgSchema.ts';

test('basic seed test', async ({ db, push }) => {
	const currSchema = { composite: schema.composite };
	await push(currSchema);
	await seed(db, currSchema, { count: 16 });

	let composite = await db.select().from(schema.composite);

	expect(composite.length).toBe(16);
	await reset(db, currSchema);

	await seed(db, currSchema, { count: 16 }).refine((funcs) => ({
		composite: {
			columns: {
				id: funcs.valuesFromArray({ values: [0, 1, 2, 3] }),
				name: funcs.valuesFromArray({ values: ['a', 'b', 'c', 'd'] }),
			},
		},
	}));

	composite = await db.select().from(schema.composite);

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

test('unique column in composite of 2 columns', async ({ db, push }) => {
	const currSchema0 = { uniqueColumnInCompositeOfTwo0: schema.uniqueColumnInCompositeOfTwo0 };
	await push(currSchema0);
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
	await push(currSchema1);
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

test('unique column in composite of 3 columns', async ({ db, push }) => {
	const currSchema0 = { uniqueColumnInCompositeOfThree0: schema.uniqueColumnInCompositeOfThree0 };
	await push(currSchema0);
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
	await push(currSchema1);
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

// https://github.com/drizzle-team/drizzle-orm/issues/4354
test('composite unique includes a fk column', async ({ db, push }) => {
	const user = pgTable('user', { id: text().primaryKey() });
	const paints = pgTable('paints', { id: uuid().primaryKey() });

	const inventory = pgTable(
		'inventory',
		{
			id: uuid().primaryKey().defaultRandom(),
			userId: text()
				.notNull()
				.references(() => user.id),
			paintId: uuid()
				.notNull()
				.references(() => paints.id),
			amount: integer().default(1),
		},
		(table) => [unique().on(table.userId, table.paintId)],
	);

	const schema = { user, paints, inventory };
	await push(schema);
	await seed(db, schema).refine((f) => ({
		user: { count: 100 },
		paints: { count: 10 },
		inventory: {
			columns: {
				amount: f.int({ minValue: 1, maxValue: 100 }),
			},
			count: 1000,
		},
	}));

	const composite = await db.select().from(inventory);

	expect(composite.length).toBe(1000);
});
/**
 * @see https://github.com/drizzle-team/drizzle-orm/issues/5919
 */
test('shared column in two composite unique constraints (#5919)', async ({ db, push }) => {
	const currSchema = { sharedColumnInTwoComposites: schema.sharedColumnInTwoComposites };
	await push(currSchema);

	// Default generators — no .refine(). Used to throw "Currently, multiple
	// composite unique keys that share the same column are not supported."
	await seed(db, currSchema, { count: 16 });
	let rows = await db.select().from(schema.sharedColumnInTwoComposites);
	expect(rows.length).toBe(16);

	// Both composite uniques must hold: PostgreSQL would have rejected the
	// INSERTs otherwise. Sanity-check on the seed output too.
	const orgIdAndId = new Set(rows.map((r) => `${r.orgId}|${r.id}`));
	const orgIdAndName = new Set(rows.map((r) => `${r.orgId}|${r.name}`));
	expect(orgIdAndId.size).toBe(16);
	expect(orgIdAndName.size).toBe(16);
	await reset(db, currSchema);

	// Mixed-cardinality refine: small set of org IDs reused across many rows,
	// distinct id / name per row. This is the multi-tenant shape the reporter
	// filed against, and the throw used to fire before .refine() was applied.
	await seed(db, currSchema, { count: 12 }).refine((funcs) => ({
		sharedColumnInTwoComposites: {
			columns: {
				orgId: funcs.valuesFromArray({ values: [1, 2, 3] }),
				id: funcs.valuesFromArray({ values: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21] }),
				name: funcs.valuesFromArray({
					values: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'],
				}),
			},
		},
	}));
	rows = await db.select().from(schema.sharedColumnInTwoComposites);
	expect(rows.length).toBe(12);
	expect(new Set(rows.map((r) => `${r.orgId}|${r.id}`)).size).toBe(12);
	expect(new Set(rows.map((r) => `${r.orgId}|${r.name}`)).size).toBe(12);
	await reset(db, currSchema);
});

// TODO add test with composite foreign key
