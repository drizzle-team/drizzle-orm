import { type Equal, sql } from 'drizzle-orm';
import { blob, customType, int, sqliteTable, sqliteView, text } from 'drizzle-orm/sqlite-core';
import type { TopLevelCondition } from 'json-rules-engine';
import { test } from 'vitest';
import { z } from 'zod/v4';
import { bufferSchema, jsonSchema } from '~/column.ts';
import { CONSTANTS } from '~/constants.ts';
import { createInsertSchema, createSchemaFactory, createSelectSchema, createUpdateSchema } from '../src';
import { Expect, expectSchemaShape } from './utils.ts';

const intSchema = z.int().gte(Number.MIN_SAFE_INTEGER).lte(Number.MAX_SAFE_INTEGER);
const intNullableSchema = intSchema.nullable();
const intOptionalSchema = intSchema.optional();
const intNullableOptionalSchema = intSchema.nullable().optional();

const textSchema = z.string();
const textOptionalSchema = textSchema.optional();

const anySchema = z.any();

const extendedSchema = intSchema.lte(1000);
const extendedNullableSchema = extendedSchema.nullable();
const extendedOptionalSchema = extendedSchema.optional();

const customSchema = z.string().transform(Number);

test('table - select', (t) => {
	const table = sqliteTable('test', {
		id: int().primaryKey({ autoIncrement: true }),
		generated: int().generatedAlwaysAs(1).notNull(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = z.object({ id: intSchema, generated: intSchema, name: textSchema });
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
	const expected = z.object({ id: intOptionalSchema, name: textSchema, age: intNullableOptionalSchema });
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
		id: intOptionalSchema,
		name: textOptionalSchema,
		age: intNullableOptionalSchema,
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
	const expected = z.object({ id: intSchema, age: anySchema });
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
		nested: z.object({ name: textSchema, age: anySchema }),
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
		c1: intNullableSchema,
		c2: intSchema,
		c3: intNullableSchema,
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
		c1: intNullableOptionalSchema,
		c2: intSchema,
		c3: intNullableOptionalSchema,
		c4: intOptionalSchema,
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
		c1: intNullableOptionalSchema,
		c2: intOptionalSchema,
		c3: intNullableOptionalSchema,
		c4: intOptionalSchema,
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
		c2: (schema) => schema.lte(1000),
		c3: z.string().transform(Number),
	});
	const expected = z.object({
		c1: intNullableSchema,
		c2: extendedSchema,
		c3: customSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - select with custom data type', (t) => {
	const customText = customType({ dataType: () => 'text' });
	const table = sqliteTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().notNull(),
		c4: customText(),
	});

	const customTextSchema = z.string().min(1).max(100);
	const result = createSelectSchema(table, {
		c2: (schema) => schema.lte(1000),
		c3: z.string().transform(Number),
		c4: customTextSchema,
	});
	const expected = z.object({
		c1: intNullableSchema,
		c2: extendedSchema,
		c3: customSchema,
		c4: customTextSchema,
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
		c2: (schema) => schema.lte(1000),
		c3: z.string().transform(Number),
	});
	const expected = z.object({
		c1: intNullableOptionalSchema,
		c2: extendedSchema,
		c3: customSchema,
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
		c2: (schema) => schema.lte(1000),
		c3: z.string().transform(Number),
	});
	const expected = z.object({
		c1: intNullableOptionalSchema,
		c2: extendedOptionalSchema,
		c3: customSchema,
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
		c2: (schema) => schema.lte(1000),
		c3: z.string().transform(Number),
		nested: {
			c5: (schema) => schema.lte(1000),
			c6: z.string().transform(Number),
		},
		table: {
			c2: (schema) => schema.lte(1000),
			c3: z.string().transform(Number),
		},
	});
	const expected = z.object({
		c1: intNullableSchema,
		c2: extendedNullableSchema,
		c3: customSchema,
		nested: z.object({
			c4: intNullableSchema,
			c5: extendedNullableSchema,
			c6: customSchema,
		}),
		table: z.object({
			c1: intNullableSchema,
			c2: extendedNullableSchema,
			c3: customSchema,
			c4: intNullableSchema,
			c5: intNullableSchema,
			c6: intNullableSchema,
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
		numeric1: numeric({ mode: 'number' }).notNull(),
		numeric2: numeric({ mode: 'bigint' }).notNull(),
		numeric3: numeric({ mode: 'string' }).notNull(),
		real: real().notNull(),
		text1: text({ mode: 'text' }).notNull(),
		text2: text({ mode: 'text', length: 10 }).notNull(),
		text3: text({ mode: 'text', enum: ['a', 'b', 'c'] }).notNull(),
		text4: text({ mode: 'json' }).notNull(),
	}));

	const result = createSelectSchema(table);
	const expected = z.object({
		blob1: bufferSchema,
		blob2: z.bigint().gte(CONSTANTS.INT64_MIN).lte(CONSTANTS.INT64_MAX),
		blob3: jsonSchema,
		integer1: z.int().gte(Number.MIN_SAFE_INTEGER).lte(Number.MAX_SAFE_INTEGER),
		integer2: z.boolean(),
		integer3: z.date(),
		integer4: z.date(),
		numeric1: z.number().gte(Number.MIN_SAFE_INTEGER).lte(Number.MAX_SAFE_INTEGER),
		numeric2: z.bigint().gte(CONSTANTS.INT64_MIN).lte(CONSTANTS.INT64_MAX),
		numeric3: z.string(),
		real: z.number().gte(CONSTANTS.INT48_MIN).lte(CONSTANTS.INT48_MAX),
		text1: z.string(),
		text2: z.string().max(10),
		text3: z.enum(['a', 'b', 'c']),
		text4: jsonSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('type coercion - all', (t) => {
	const table = sqliteTable('test', ({
		blob,
		integer,
		text,
	}) => ({
		blob: blob({ mode: 'bigint' }).notNull(),
		integer1: integer({ mode: 'boolean' }).notNull(),
		integer2: integer({ mode: 'timestamp' }).notNull(),
		integer3: integer().notNull(),
		text: text().notNull(),
	}));

	const { createSelectSchema } = createSchemaFactory({
		coerce: true,
	});
	const result = createSelectSchema(table);
	const expected = z.object({
		blob: z.coerce.bigint().gte(CONSTANTS.INT64_MIN).lte(CONSTANTS.INT64_MAX),
		integer1: z.coerce.boolean(),
		integer2: z.coerce.date(),
		integer3: z.coerce.number().int().gte(Number.MIN_SAFE_INTEGER).lte(Number.MAX_SAFE_INTEGER),
		text: z.coerce.string(),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('type coercion - mixed', (t) => {
	const table = sqliteTable('test', ({
		integer,
	}) => ({
		integer1: integer({ mode: 'timestamp' }).notNull(),
		integer2: integer().notNull(),
	}));

	const { createSelectSchema } = createSchemaFactory({
		coerce: {
			date: true,
		},
	});
	const result = createSelectSchema(table);
	const expected = z.object({
		integer1: z.coerce.date(),
		integer2: z.int().gte(Number.MIN_SAFE_INTEGER).lte(Number.MAX_SAFE_INTEGER),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

/* Infinitely recursive type */ {
	const TopLevelCondition: z.ZodType<TopLevelCondition> = z.custom<TopLevelCondition>().superRefine(() => {});
	const table = sqliteTable('test', {
		json1: text({ mode: 'json' }).$type<TopLevelCondition>().notNull(),
		json2: blob({ mode: 'json' }).$type<TopLevelCondition>(),
	});
	const result = createSelectSchema(table);
	const expected = z.object({
		json1: TopLevelCondition,
		json2: z.nullable(TopLevelCondition),
	});
	Expect<Equal<z.infer<typeof result>, z.infer<typeof expected>>>();
}

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
