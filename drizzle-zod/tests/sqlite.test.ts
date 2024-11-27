import { type Equal, sql } from 'drizzle-orm';
import { int, sqliteTable, sqliteView, text } from 'drizzle-orm/sqlite-core';
import { test } from 'vitest';
import { z } from 'zod';
import { bufferSchema, jsonSchema } from '~/column.ts';
import { CONSTANTS } from '~/constants.ts';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from '../src';
import { Expect, expectSchemaShape } from './utils.ts';

const intSchema = z.number().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).int();
const textSchema = z.string();

test('table - select', (t) => {
	const table = sqliteTable('test', {
		id: int().primaryKey({ autoIncrement: true }),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = z.object({ id: intSchema, name: textSchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table - insert', (t) => {
	const table = sqliteTable('test', {
		id: int().primaryKey({ autoIncrement: true }),
		name: text().notNull(),
		age: int(),
	});

	const result = createInsertSchema(table);
	const expected = z.object({ id: intSchema.optional(), name: textSchema, age: intSchema.nullable().optional() });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table - update', (t) => {
	const table = sqliteTable('test', {
		id: int().primaryKey({ autoIncrement: true }),
		name: text().notNull(),
		age: int(),
	});

	const result = createUpdateSchema(table);
	const expected = z.object({
		id: intSchema.optional(),
		name: textSchema.optional(),
		age: intSchema.nullable().optional(),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view qb - select', (t) => {
	const table = sqliteTable('test', {
		id: int().primaryKey({ autoIncrement: true }),
		name: text().notNull(),
	});
	const view = sqliteView('test').as((qb) => qb.select({ id: table.id, age: sql``.as('age') }).from(table));

	const result = createSelectSchema(view);
	const expected = z.object({ id: intSchema, age: z.any() });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view columns - select', (t) => {
	const view = sqliteView('test', {
		id: int().primaryKey({ autoIncrement: true }),
		name: text().notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = z.object({ id: intSchema, name: textSchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view with nested fields - select', (t) => {
	const table = sqliteTable('test', {
		id: int().primaryKey({ autoIncrement: true }),
		name: text().notNull(),
	});
	const view = sqliteView('test').as((qb) =>
		qb.select({
			id: table.id,
			nested: {
				name: table.name,
				age: sql``.as('age'),
			},
			table,
		}).from(table)
	);

	const result = createSelectSchema(view);
	const expected = z.object({
		id: intSchema,
		nested: z.object({ name: textSchema, age: z.any() }),
		table: z.object({ id: intSchema, name: textSchema }),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('nullability - select', (t) => {
	const table = sqliteTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().default(1),
		c4: int().notNull().default(1),
	});

	const result = createSelectSchema(table);
	const expected = z.object({
		c1: intSchema.nullable(),
		c2: intSchema,
		c3: intSchema.nullable(),
		c4: intSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('nullability - insert', (t) => {
	const table = sqliteTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().default(1),
		c4: int().notNull().default(1),
		c5: int().generatedAlwaysAs(1),
	});

	const result = createInsertSchema(table);
	const expected = z.object({
		c1: intSchema.nullable().optional(),
		c2: intSchema,
		c3: intSchema.nullable().optional(),
		c4: intSchema.optional(),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('nullability - update', (t) => {
	const table = sqliteTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().default(1),
		c4: int().notNull().default(1),
		c5: int().generatedAlwaysAs(1),
	});

	const result = createUpdateSchema(table);
	const expected = z.object({
		c1: intSchema.nullable().optional(),
		c2: intSchema.optional(),
		c3: intSchema.nullable().optional(),
		c4: intSchema.optional(),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - select', (t) => {
	const table = sqliteTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().notNull(),
	});

	const result = createSelectSchema(table, {
		c2: (schema) => schema.max(1000),
		c3: z.string().transform(Number),
	});
	const expected = z.object({
		c1: intSchema.nullable(),
		c2: intSchema.max(1000),
		c3: z.string().transform(Number),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - insert', (t) => {
	const table = sqliteTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().notNull(),
		c4: int().generatedAlwaysAs(1),
	});

	const result = createInsertSchema(table, {
		c2: (schema) => schema.max(1000),
		c3: z.string().transform(Number),
	});
	const expected = z.object({
		c1: intSchema.nullable().optional(),
		c2: intSchema.max(1000),
		c3: z.string().transform(Number),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - update', (t) => {
	const table = sqliteTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().notNull(),
		c4: int().generatedAlwaysAs(1),
	});

	const result = createUpdateSchema(table, {
		c2: (schema) => schema.max(1000),
		c3: z.string().transform(Number),
	});
	const expected = z.object({
		c1: intSchema.nullable().optional(),
		c2: intSchema.max(1000).optional(),
		c3: z.string().transform(Number),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine view - select', (t) => {
	const table = sqliteTable('test', {
		c1: int(),
		c2: int(),
		c3: int(),
		c4: int(),
		c5: int(),
		c6: int(),
	});
	const view = sqliteView('test').as((qb) =>
		qb.select({
			c1: table.c1,
			c2: table.c2,
			c3: table.c3,
			nested: {
				c4: table.c4,
				c5: table.c5,
				c6: table.c6,
			},
			table,
		}).from(table)
	);

	const result = createSelectSchema(view, {
		c2: (schema) => schema.max(1000),
		c3: z.string().transform(Number),
		nested: {
			c5: (schema) => schema.max(1000),
			c6: z.string().transform(Number),
		},
		table: {
			c2: (schema) => schema.max(1000),
			c3: z.string().transform(Number),
		},
	});
	const expected = z.object({
		c1: intSchema.nullable(),
		c2: intSchema.max(1000).nullable(),
		c3: z.string().transform(Number),
		nested: z.object({
			c4: intSchema.nullable(),
			c5: intSchema.max(1000).nullable(),
			c6: z.string().transform(Number),
		}),
		table: z.object({
			c1: intSchema.nullable(),
			c2: intSchema.max(1000).nullable(),
			c3: z.string().transform(Number),
			c4: intSchema.nullable(),
			c5: intSchema.nullable(),
			c6: intSchema.nullable(),
		}),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('all data types', (t) => {
	const table = sqliteTable('test', ({
		blob,
		integer,
		numeric,
		real,
		text,
	}) => ({
		blob1: blob({ mode: 'buffer' }).notNull(),
		blob2: blob({ mode: 'bigint' }).notNull(),
		blob3: blob({ mode: 'json' }).notNull(),
		integer1: integer({ mode: 'number' }).notNull(),
		integer2: integer({ mode: 'boolean' }).notNull(),
		integer3: integer({ mode: 'timestamp' }).notNull(),
		integer4: integer({ mode: 'timestamp_ms' }).notNull(),
		numeric: numeric().notNull(),
		real: real().notNull(),
		text1: text({ mode: 'text' }).notNull(),
		text2: text({ mode: 'text', length: 10 }).notNull(),
		text3: text({ mode: 'text', enum: ['a', 'b', 'c'] }).notNull(),
		text4: text({ mode: 'json' }).notNull(),
	}));

	const result = createSelectSchema(table);
	const expected = z.object({
		blob1: bufferSchema,
		blob2: z.bigint().min(CONSTANTS.INT64_MIN).max(CONSTANTS.INT64_MAX),
		blob3: jsonSchema,
		integer1: z.number().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).int(),
		integer2: z.boolean(),
		integer3: z.date(),
		integer4: z.date(),
		numeric: z.string(),
		real: z.number().min(CONSTANTS.INT48_MIN).max(CONSTANTS.INT48_MAX),
		text1: z.string(),
		text2: z.string().max(10),
		text3: z.enum(['a', 'b', 'c']),
		text4: jsonSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

/* Disallow unknown keys in table refinement - select */ {
	const table = sqliteTable('test', { id: int() });
	// @ts-expect-error
	createSelectSchema(table, { unknown: z.string() });
}

/* Disallow unknown keys in table refinement - insert */ {
	const table = sqliteTable('test', { id: int() });
	// @ts-expect-error
	createInsertSchema(table, { unknown: z.string() });
}

/* Disallow unknown keys in table refinement - update */ {
	const table = sqliteTable('test', { id: int() });
	// @ts-expect-error
	createUpdateSchema(table, { unknown: z.string() });
}

/* Disallow unknown keys in view qb - select */ {
	const table = sqliteTable('test', { id: int() });
	const view = sqliteView('test').as((qb) => qb.select().from(table));
	const nestedSelect = sqliteView('test').as((qb) => qb.select({ table }).from(table));
	// @ts-expect-error
	createSelectSchema(view, { unknown: z.string() });
	// @ts-expect-error
	createSelectSchema(nestedSelect, { table: { unknown: z.string() } });
}

/* Disallow unknown keys in view columns - select */ {
	const view = sqliteView('test', { id: int() }).as(sql``);
	// @ts-expect-error
	createSelectSchema(view, { unknown: z.string() });
}
