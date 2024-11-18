import { integer, pgEnum, pgMaterializedView, pgTable, pgView, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { test } from 'vitest';
import { z } from 'zod';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from '../src';
import { expectEnumValues, expectSchemaShape } from './utils.ts';
import { sql } from 'drizzle-orm';
import { CONSTANTS } from '~/column.ts';

const integerSchema = z.number().min(CONSTANTS.INT32_MIN).max(CONSTANTS.INT32_MAX).int();

test('table - select', (t) => {
	const table = pgTable('test', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	});

	const result = createSelectSchema(table);
	const expected = z.object({ id: integerSchema, name: z.string() });
	expectSchemaShape(t, expected).from(result);
});

test('table - insert', (t) => {
	const table = pgTable('test', {
		id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
		name: text('name').notNull(),
		age: integer('age')
	});

	const result = createInsertSchema(table);
	const expected = z.object({ name: z.string(), age: integerSchema.nullable().optional() });
	expectSchemaShape(t, expected).from(result);
});

test('table - update', (t) => {
	const table = pgTable('test', {
		id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
		name: text('name').notNull(),
		age: integer('age')
	});

	const result = createUpdateSchema(table);
	const expected = z.object({
		name: z.string().optional(),
		age: integerSchema.nullable().optional()
	});
	expectSchemaShape(t, expected).from(result);
});

test('view qb - select', (t) => {
	const table = pgTable('test', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	});
	const view = pgView('test').as((qb) => qb.select({ id: table.id, age: sql``.as('age') }).from(table));

	const result = createSelectSchema(view);
	const expected = z.object({ id: integerSchema, age: z.any() });
	expectSchemaShape(t, expected).from(result);
});

test('view columns - select', (t) => {
	const view = pgView('test', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = z.object({ id: integerSchema, name: z.string() });
	expectSchemaShape(t, expected).from(result);
});

test('materialized view qb - select', (t) => {
	const table = pgTable('test', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	});
	const view = pgMaterializedView('test').as((qb) => qb.select({ id: table.id, age: sql``.as('age') }).from(table));

	const result = createSelectSchema(view);
	const expected = z.object({ id: integerSchema, age: z.any() });
	expectSchemaShape(t, expected).from(result);
});

test('materialized view columns - select', (t) => {
	const view = pgView('test', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = z.object({ id: integerSchema, name: z.string() });
	expectSchemaShape(t, expected).from(result);
});

test('view with nested fields - select', (t) => {
	const table = pgTable('test', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	});
	const view = pgMaterializedView('test').as((qb) => qb.select({
		id: table.id,
		nested: {
			name: table.name,
			age: sql``.as('age')
		},
		table
	}).from(table));

	const result = createSelectSchema(view);
	const expected = z.object({
		id: integerSchema,
		nested: z.object({ name: z.string(), age: z.any() }),
		table: z.object({ id: integerSchema, name: z.string() })
	});
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
		c1: integerSchema.nullable(),
		c2: integerSchema,
		c3: integerSchema.nullable(),
		c4: integerSchema,
	})
	expectSchemaShape(t, expected).from(result);
});

test('nullability - insert', (t) => {
	const table = pgTable('test', {
		c1: integer(),
		c2: integer().notNull(),
		c3: integer().default(1),
		c4: integer().notNull().default(1),
		c5: integer().generatedAlwaysAs(1),
		c6: integer().generatedAlwaysAsIdentity(),
		c7: integer().generatedByDefaultAsIdentity(),
	});

	const result = createInsertSchema(table);
	const expected = z.object({
		c1: integerSchema.nullable().optional(),
		c2: integerSchema,
		c3: integerSchema.nullable().optional(),
		c4: integerSchema.optional(),
		c7: integerSchema.optional(),
	});
	expectSchemaShape(t, expected).from(result);
});

test('nullability - update', (t) => {
	const table = pgTable('test', {
		c1: integer(),
		c2: integer().notNull(),
		c3: integer().default(1),
		c4: integer().notNull().default(1),
		c5: integer().generatedAlwaysAs(1),
		c6: integer().generatedAlwaysAsIdentity(),
		c7: integer().generatedByDefaultAsIdentity(),
	});

	const result = createUpdateSchema(table);
	const expected = z.object({
		c1: integerSchema.nullable().optional(),
		c2: integerSchema.optional(),
		c3: integerSchema.nullable().optional(),
		c4: integerSchema.optional(),
		c7: integerSchema.optional(),
	});
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
		c1: integerSchema.nullable(),
		c2: integerSchema.max(1000),
		c3: z.string().transform((v) => Number(v))
	});
	expectSchemaShape(t, expected).from(result);
});

test('refine table - insert', (t) => {
	const table = pgTable('test', {
		c1: integer(),
		c2: integer().notNull(),
		c3: integer().notNull(),
		c4: integer().generatedAlwaysAs(1)
	});

	const result = createInsertSchema(table, {
		c2: (schema) => schema.max(1000),
		c3: z.string().transform((v) => Number(v))
	});
	const expected = z.object({
		c1: integerSchema.nullable().optional(),
		c2: integerSchema.max(1000),
		c3: z.string().transform((v) => Number(v))
	});
	expectSchemaShape(t, expected).from(result);
});

test('refine table - update', (t) => {
	const table = pgTable('test', {
		c1: integer(),
		c2: integer().notNull(),
		c3: integer().notNull(),
		c4: integer().generatedAlwaysAs(1)
	});

	const result = createUpdateSchema(table, {
		c2: (schema) => schema.max(1000),
		c3: z.string().transform((v) => Number(v)),
	});
	const expected = z.object({
		c1: integerSchema.nullable().optional(),
		c2: integerSchema.max(1000).optional(),
		c3: z.string().transform((v) => Number(v)),
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
		},
		table
	}).from(table));

	const result = createSelectSchema(view, {
		c2: (schema) => schema.max(1000),
		c3: z.string().transform((v) => Number(v)),
		nested: {
			c5: (schema) => schema.max(1000),
			c6: z.string().transform((v) => Number(v)),
		},
		table: {
			c2: (schema) => schema.max(1000),
			c3: z.string().transform((v) => Number(v)),
		}
	});
	const expected = z.object({
		c1: integerSchema.nullable(),
		c2: integerSchema.max(1000).nullable(),
		c3: z.string().transform((v) => Number(v)),
		nested: z.object({
			c4: integerSchema.nullable(),
			c5: integerSchema.max(1000).nullable(),
			c6: z.string().transform((v) => Number(v)),
		}),
		table: z.object({
			c1: integerSchema.nullable(),
			c2: integerSchema.max(1000).nullable(),
			c3: z.string().transform((v) => Number(v)),
			c4: integerSchema.nullable(),
			c5: integerSchema.nullable(),
			c6: integerSchema.nullable(),
		})
	});
	expectSchemaShape(t, expected).from(result);
});

// test('all data types', (t) => {
// 	const table = pgTable('test', ({
// 		bigint,
// 		bigserial,
// 		bit,
// 		boolean,
// 		date,
// 		char,
// 		cidr,
// 		customType,
// 		doublePrecision,
// 		geometry,
// 		halfvec,
// 		inet,
// 		integer,
// 		interval,
// 		json,
// 		jsonb,
// 		line,
// 		macaddr,
// 		macaddr8,
// 		numeric,
// 		point,
// 		real,
// 		serial,
// 		smallint,
// 		smallserial,
// 		text,
// 		sparsevec,
// 		time,
// 		timestamp,
// 		uuid,
// 		varchar,
// 		vector
// 	}) => ({
// 		bigint1: bigint({ mode: 'number' }),
// 		bigint2: bigint({ mode: 'bigint' }),
// 	}));

// 	const result = createSelectSchema(table);
// 	const expected = z.object({
// 		bigint1: z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).nullable(),
// 		bigint2: z.bigint().min(INT64_MIN).max(INT64_MAX).nullable(),
// 	});
// 	expectSchemaShape(t, expected).from(result);
// })

/* Disallow unknown keys in table refinement - select */ {
	const table = pgTable('test', { id: integer() });
	// @ts-expect-error
	createSelectSchema(table, { unknown: z.string() });
}

/* Disallow unknown keys in table refinement - insert */ {
	const table = pgTable('test', { id: integer() });
	// @ts-expect-error
	createInsertSchema(table, { unknown: z.string() });
}

/* Disallow unknown keys in table refinement - update */ {
	const table = pgTable('test', { id: integer() });
	// @ts-expect-error
	createUpdateSchema(table, { unknown: z.string() });
}

/* Disallow unknown keys in view qb - select */ {
	const table = pgTable('test', { id: integer() });
	const view = pgView('test').as((qb) => qb.select().from(table));
	const mView = pgMaterializedView('test').as((qb) => qb.select().from(table));
	const nestedSelect = pgView('test').as((qb) => qb.select({ table }).from(table));
	// @ts-expect-error
	createSelectSchema(view, { unknown: z.string() });
	// @ts-expect-error
	createSelectSchema(mView, { unknown: z.string() });
	// @ts-expect-error
	createSelectSchema(nestedSelect, { table: { unknown: z.string() } });
}

/* Disallow unknown keys in view columns - select */ {
	const view = pgView('test', { id: integer() }).as(sql``);
	const mView = pgView('test', { id: integer() }).as(sql``);
	// @ts-expect-error
	createSelectSchema(view, { unknown: z.string() });
	// @ts-expect-error
	createSelectSchema(mView, { unknown: z.string() });
}
