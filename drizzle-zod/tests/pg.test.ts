import { char, date, getViewConfig, integer, pgEnum, pgMaterializedView, pgTable, pgView, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { test } from 'vitest';
import { z } from 'zod';
import { createInsertSchema, createSelectSchema } from '../src';
import { expectEnumValues, expectSchemaShape } from './utils.ts';
import { sql } from 'drizzle-orm';

test('table - select', (t) => {
	const table = pgTable('test', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	});

	const result = createSelectSchema(table);
	const expected = z.object({ id: z.number().int(), name: z.string() });
	expectSchemaShape(t, expected).from(result);
});

test('table - insert', (t) => {
	const table = pgTable('test', {
		id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
		name: text('name').notNull(),
		age: integer('age')
	});

	const result = createInsertSchema(table);
	const expected = z.object({ name: z.string(), age: z.number().nullable().optional() });
	expectSchemaShape(t, expected).from(result);
});

test('view qb - select', (t) => {
	const table = pgTable('test', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	});
	const view = pgView('test').as((qb) => qb.select({ id: table.id, age: sql``.as('age') }).from(table));

	const result = createSelectSchema(view);
	const expected = z.object({ id: z.number().int(), age: z.any() });
	expectSchemaShape(t, expected).from(result);
});

test('view columns - select', (t) => {
	const view = pgView('test', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = z.object({ id: z.number().int(), name: z.string() });
	expectSchemaShape(t, expected).from(result);
});

test('materialized view qb - select', (t) => {
	const table = pgTable('test', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	});
	const view = pgMaterializedView('test').as((qb) => qb.select({ id: table.id, age: sql``.as('age') }).from(table));

	const result = createSelectSchema(view);
	const expected = z.object({ id: z.number().int(), age: z.any() });
	expectSchemaShape(t, expected).from(result);
});

test('materialized view columns - select', (t) => {
	const view = pgView('test', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = z.object({ id: z.number().int(), name: z.string() });
	expectSchemaShape(t, expected).from(result);
});

test('view with nested fields - select', (t) => {
	const table = pgTable('test', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	});
	const view = pgMaterializedView('test').as((qb) => qb.select({
		id: table.id,
		profile: {
			name: table.name,
			age: sql``.as('age')
		}
	}).from(table));

	const result = createSelectSchema(view);
	const expected = z.object({ id: z.number().int(), profile: z.object({ name: z.string(), age: z.any() }) });
	expectSchemaShape(t, expected).from(result);
});

test('enum - select', (t) => {
	const enum_ = pgEnum('test', ['a', 'b', 'c']);

	const result = createSelectSchema(enum_);
	const expected = z.enum(['a', 'b', 'c']);
	expectEnumValues(t, expected).from(result);
});

test('nullability - select', (t) => {
	const table = pgTable('test', {
		c1: integer(),
		c2: integer().notNull(),
		c3: integer().default(1),
		c4: integer().notNull().default(1),
	});

	const result = createSelectSchema(table);
	const expected = z.object({
		c1: z.number().int().nullable(),
		c2: z.number().int(),
		c3: z.number().int().nullable(),
		c4: z.number().int(),
	})
	expectSchemaShape(t, expected).from(result);
});

test('refine table - select', (t) => {
	const table = pgTable('test', {
		c1: integer(),
		c2: integer().notNull(),
		c3: integer().notNull(),
	});

	const result = createSelectSchema(table, {
		c2: (schema) => schema.max(1000),
		c3: z.string().transform((v) => Number(v))
	});
	const expected = z.object({
		c1: z.number().int().nullable(),
		c2: z.number().int().max(1000),
		c3: z.string().transform((v) => Number(v))
	});
	expectSchemaShape(t, expected).from(result);
});

test('refine view - select', (t) => {
	const table = pgTable('test', {
		c1: integer(),
		c2: integer(),
		c3: integer(),
		c4: integer(),
		c5: integer(),
		c6: integer(),
	});
	const view = pgView('test').as((qb) => qb.select({
		c1: table.c1,
		c2: table.c2,
		c3: table.c3,
		nested: {
			c4: table.c4,
			c5: table.c5,
			c6: table.c6
		}
	}).from(table));

	const result = createSelectSchema(view, {
		c2: (schema) => schema.max(1000),
		c3: z.string().transform((v) => Number(v)),
		nested: {
			c5: (schema) => schema.max(1000),
			c6: z.string().transform((v) => Number(v)),
		}
	});
	const expected = z.object({
		c1: z.number().int().nullable(),
		c2: z.number().int().max(1000).nullable(),
		c3: z.string().transform((v) => Number(v)),
		nested: z.object({
			c4: z.number().int().nullable(),
			c5: z.number().int().max(1000).nullable(),
			c6: z.string().transform((v) => Number(v)),
		})
	});
	expectSchemaShape(t, expected).from(result);
});
