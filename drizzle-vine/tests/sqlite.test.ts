import vine from '@vinejs/vine';
import { sql } from 'drizzle-orm';
import { blob, customType, int, sqliteTable, sqliteView, text } from 'drizzle-orm/sqlite-core';
import { test } from 'vitest';
import { CONSTANTS } from '~/constants.ts';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from '../src';
import { expectSchemaShape } from './utils.ts';

const intSchema = vine.number().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).withoutDecimals();
const textSchema = vine.string();

test('table - select', (t) => {
	const table = sqliteTable('test', {
		id: int().primaryKey({ autoIncrement: true }),
		generated: int().generatedAlwaysAs(1).notNull(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = vine.object({ id: intSchema, generated: intSchema, name: textSchema });
	expectSchemaShape(t, expected).from(result);
});

test('table - insert', (t) => {
	const table = sqliteTable('test', {
		id: int().primaryKey({ autoIncrement: true }),
		name: text().notNull(),
		age: int(),
	});

	const result = createInsertSchema(table);
	const expected = vine.object({
		id: intSchema.clone().optional(),
		name: textSchema,
		age: intSchema.clone().nullable().optional(),
	});
	expectSchemaShape(t, expected).from(result);
});

test('table - update', (t) => {
	const table = sqliteTable('test', {
		id: int().primaryKey({ autoIncrement: true }),
		name: text().notNull(),
		age: int(),
	});

	const result = createUpdateSchema(table);
	const expected = vine.object({
		id: intSchema.clone().optional(),
		name: textSchema.clone().optional(),
		age: intSchema.clone().nullable().optional(),
	});
	expectSchemaShape(t, expected).from(result);
});

test('view qb - select', (t) => {
	const table = sqliteTable('test', {
		id: int().primaryKey({ autoIncrement: true }),
		name: text().notNull(),
	});
	const view = sqliteView('test').as((qb) => qb.select({ id: table.id, age: sql``.as('age') }).from(table));

	const result = createSelectSchema(view);
	const expected = vine.object({ id: intSchema, age: vine.any() });
	expectSchemaShape(t, expected).from(result);
});

test('view columns - select', (t) => {
	const view = sqliteView('test', {
		id: int().primaryKey({ autoIncrement: true }),
		name: text().notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = vine.object({ id: intSchema, name: textSchema });
	expectSchemaShape(t, expected).from(result);
});

test('view with nested fields - select', (t) => {
	const table = sqliteTable('test', {
		id: int().primaryKey({ autoIncrement: true }),
		name: text().notNull(),
	});
	const view = sqliteView('test').as((qb) =>
		qb.select({
			id: table.id,
			nested: { name: table.name, age: sql``.as('age') },
			table,
		}).from(table)
	);

	const result = createSelectSchema(view);
	const expected = vine.object({
		id: intSchema,
		nested: vine.object({ name: textSchema, age: vine.any() }),
		table: vine.object({ id: intSchema, name: textSchema }),
	});
	expectSchemaShape(t, expected).from(result);
});

test('nullability - select', (t) => {
	const table = sqliteTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().default(1),
		c4: int().notNull().default(1),
	});

	const result = createSelectSchema(table);
	const expected = vine.object({
		c1: intSchema.clone().nullable(),
		c2: intSchema,
		c3: intSchema.clone().nullable(),
		c4: intSchema,
	});
	expectSchemaShape(t, expected).from(result);
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
	const expected = vine.object({
		c1: intSchema.clone().nullable().optional(),
		c2: intSchema,
		c3: intSchema.clone().nullable().optional(),
		c4: intSchema.clone().optional(),
	});
	expectSchemaShape(t, expected).from(result);
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
	const expected = vine.object({
		c1: intSchema.clone().nullable().optional(),
		c2: intSchema.clone().optional(),
		c3: intSchema.clone().nullable().optional(),
		c4: intSchema.clone().optional(),
	});
	expectSchemaShape(t, expected).from(result);
});

test('refine table - select', (t) => {
	const table = sqliteTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().notNull(),
	});

	const result = createSelectSchema(table, {
		c2: (schema) => schema.max(1000),
		c3: vine.string(),
	});
	const expected = vine.object({
		c1: intSchema.clone().nullable(),
		c2: intSchema.clone().max(1000),
		c3: vine.string(),
	});
	expectSchemaShape(t, expected).from(result);
});

test('refine table - select with custom data type', (t) => {
	const customText = customType({ dataType: () => 'text' });
	const table = sqliteTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().notNull(),
		c4: customText(),
	});

	const customTextSchema = vine.string().minLength(1).maxLength(100);
	const result = createSelectSchema(table, {
		c2: (schema) => schema.max(1000),
		c3: vine.string(),
		c4: customTextSchema,
	});
	const expected = vine.object({
		c1: intSchema.clone().nullable(),
		c2: intSchema.clone().max(1000),
		c3: vine.string(),
		c4: customTextSchema,
	});
	expectSchemaShape(t, expected).from(result);
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
		c3: vine.string(),
	});
	const expected = vine.object({
		c1: intSchema.clone().nullable().optional(),
		c2: intSchema.clone().max(1000),
		c3: vine.string(),
	});
	expectSchemaShape(t, expected).from(result);
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
		c3: vine.string(),
	});
	const expected = vine.object({
		c1: intSchema.clone().nullable().optional(),
		c2: intSchema.clone().max(1000).optional(),
		c3: vine.string(),
	});
	expectSchemaShape(t, expected).from(result);
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
	const expected = vine.object({
		blob1: vine.any(), // Buffer not supported in VineJS
		blob2: vine.any(), // bigint not supported in VineJS
		blob3: vine.any(), // JSON → any
		integer1: vine.number().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).withoutDecimals(),
		integer2: vine.boolean(),
		integer3: vine.date(),
		integer4: vine.date(),
		numeric: vine.string(),
		real: vine.number().min(CONSTANTS.INT48_MIN).max(CONSTANTS.INT48_MAX),
		text1: vine.string(),
		text2: vine.string().maxLength(10),
		text3: vine.enum(['a', 'b', 'c'] as const),
		text4: vine.any(), // JSON → any
	});
	expectSchemaShape(t, expected).from(result);
});

/* Disallow unknown keys in table refinement - select */ {
	const table = sqliteTable('test', { id: int() });
	// @ts-expect-error
	createSelectSchema(table, { unknown: vine.string() });
}

/* Disallow unknown keys in table refinement - insert */ {
	const table = sqliteTable('test', { id: int() });
	// @ts-expect-error
	createInsertSchema(table, { unknown: vine.string() });
}

/* Disallow unknown keys in table refinement - update */ {
	const table = sqliteTable('test', { id: int() });
	// @ts-expect-error
	createUpdateSchema(table, { unknown: vine.string() });
}

/* Disallow unknown keys in view qb - select */ {
	const table = sqliteTable('test', { id: int() });
	const view = sqliteView('test').as((qb) => qb.select().from(table));
	const nestedSelect = sqliteView('test').as((qb) => qb.select({ table }).from(table));
	// @ts-expect-error
	createSelectSchema(view, { unknown: vine.string() });
	// @ts-expect-error
	createSelectSchema(nestedSelect, { table: { unknown: vine.string() } });
}

/* Disallow unknown keys in view columns - select */ {
	const view = sqliteView('test', { id: int() }).as(sql``);
	// @ts-expect-error
	createSelectSchema(view, { unknown: vine.string() });
}
