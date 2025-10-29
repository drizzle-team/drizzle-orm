import { type Equal, sql } from 'drizzle-orm';
import {
	customType,
	integer,
	json,
	jsonb,
	pgEnum,
	pgMaterializedView,
	pgSchema,
	pgTable,
	pgView,
	serial,
	text,
} from 'drizzle-orm/pg-core';
import type { TopLevelCondition } from 'json-rules-engine';
import { test } from 'vitest';
import { z } from 'zod/v4';
import { jsonSchema } from '~/column.ts';
import { CONSTANTS } from '~/constants.ts';
import { createInsertSchema, createSchemaFactory, createSelectSchema, createUpdateSchema } from '../src';
import { Expect, expectEnumValues, expectSchemaShape } from './utils.ts';

const integerSchema = z.int().gte(CONSTANTS.INT32_MIN).lte(CONSTANTS.INT32_MAX);
const textSchema = z.string();

test('table - select', (t) => {
	const table = pgTable('test', {
		id: integer().primaryKey(),
		generated: integer().generatedAlwaysAsIdentity(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = z.object({ id: integerSchema, generated: integerSchema, name: textSchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table in schema - select', (tc) => {
	const schema = pgSchema('test');
	const table = schema.table('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = z.object({ id: integerSchema, name: textSchema });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table - insert', (t) => {
	const table = pgTable('test', {
		id: integer().generatedAlwaysAsIdentity().primaryKey(),
		name: text().notNull(),
		age: integer(),
	});

	const result = createInsertSchema(table);
	const expected = z.object({ name: textSchema, age: integerSchema.nullable().optional() });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table - update', (t) => {
	const table = pgTable('test', {
		id: integer().generatedAlwaysAsIdentity().primaryKey(),
		name: text().notNull(),
		age: integer(),
	});

	const result = createUpdateSchema(table);
	const expected = z.object({
		name: textSchema.optional(),
		age: integerSchema.nullable().optional(),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view qb - select', (t) => {
	const table = pgTable('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	});
	const view = pgView('test').as((qb) => qb.select({ id: table.id, age: sql``.as('age') }).from(table));

	const result = createSelectSchema(view);
	const expected = z.object({ id: integerSchema, age: z.any() });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view columns - select', (t) => {
	const view = pgView('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = z.object({ id: integerSchema, name: textSchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('materialized view qb - select', (t) => {
	const table = pgTable('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	});
	const view = pgMaterializedView('test').as((qb) => qb.select({ id: table.id, age: sql``.as('age') }).from(table));

	const result = createSelectSchema(view);
	const expected = z.object({ id: integerSchema, age: z.any() });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('materialized view columns - select', (t) => {
	const view = pgView('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = z.object({ id: integerSchema, name: textSchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view with nested fields - select', (t) => {
	const table = pgTable('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	});
	const view = pgMaterializedView('test').as((qb) =>
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
		id: integerSchema,
		nested: z.object({ name: textSchema, age: z.any() }),
		table: z.object({ id: integerSchema, name: textSchema }),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('enum - select', (t) => {
	const enum_ = pgEnum('test', ['a', 'b', 'c']);

	const result = createSelectSchema(enum_);
	const expected = z.enum(['a', 'b', 'c']);
	expectEnumValues(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
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
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
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
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - select', (t) => {
	const table = pgTable('test', {
		c1: integer(),
		c2: integer().notNull(),
		c3: integer().notNull(),
	});

	const result = createSelectSchema(table, {
		c2: (schema) => schema.lte(1000),
		c3: z.string().transform(Number),
	});
	const expected = z.object({
		c1: integerSchema.nullable(),
		c2: integerSchema.lte(1000),
		c3: z.string().transform(Number),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - select with custom data type', (t) => {
	const customText = customType({ dataType: () => 'text' });
	const table = pgTable('test', {
		c1: integer(),
		c2: integer().notNull(),
		c3: integer().notNull(),
		c4: customText(),
	});

	const customTextSchema = z.string().min(1).max(100);
	const result = createSelectSchema(table, {
		c2: (schema) => schema.lte(1000),
		c3: z.string().transform(Number),
		c4: customTextSchema,
	});
	const expected = z.object({
		c1: integerSchema.nullable(),
		c2: integerSchema.lte(1000),
		c3: z.string().transform(Number),
		c4: customTextSchema,
	});

	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - insert', (t) => {
	const table = pgTable('test', {
		c1: integer(),
		c2: integer().notNull(),
		c3: integer().notNull(),
		c4: integer().generatedAlwaysAs(1),
	});

	const result = createInsertSchema(table, {
		c2: (schema) => schema.lte(1000),
		c3: z.string().transform(Number),
	});
	const expected = z.object({
		c1: integerSchema.nullable().optional(),
		c2: integerSchema.lte(1000),
		c3: z.string().transform(Number),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - update', (t) => {
	const table = pgTable('test', {
		c1: integer(),
		c2: integer().notNull(),
		c3: integer().notNull(),
		c4: integer().generatedAlwaysAs(1),
	});

	const result = createUpdateSchema(table, {
		c2: (schema) => schema.lte(1000),
		c3: z.string().transform(Number),
	});
	const expected = z.object({
		c1: integerSchema.nullable().optional(),
		c2: integerSchema.lte(1000).optional(),
		c3: z.string().transform(Number),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
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
	const view = pgView('test').as((qb) =>
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
		c1: integerSchema.nullable(),
		c2: integerSchema.lte(1000).nullable(),
		c3: z.string().transform(Number),
		nested: z.object({
			c4: integerSchema.nullable(),
			c5: integerSchema.lte(1000).nullable(),
			c6: z.string().transform(Number),
		}),
		table: z.object({
			c1: integerSchema.nullable(),
			c2: integerSchema.lte(1000).nullable(),
			c3: z.string().transform(Number),
			c4: integerSchema.nullable(),
			c5: integerSchema.nullable(),
			c6: integerSchema.nullable(),
		}),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('all data types', (t) => {
	const table = pgTable('test', ({
		bigint,
		bigserial,
		bit,
		boolean,
		date,
		char,
		cidr,
		doublePrecision,
		geometry,
		halfvec,
		inet,
		integer,
		interval,
		json,
		jsonb,
		line,
		macaddr,
		macaddr8,
		numeric,
		point,
		real,
		serial,
		smallint,
		smallserial,
		text,
		sparsevec,
		time,
		timestamp,
		uuid,
		varchar,
		vector,
	}) => ({
		bigint1: bigint({ mode: 'number' }).notNull(),
		bigint2: bigint({ mode: 'bigint' }).notNull(),
		bigserial1: bigserial({ mode: 'number' }).notNull(),
		bigserial2: bigserial({ mode: 'bigint' }).notNull(),
		bit: bit({ dimensions: 5 }).notNull(),
		boolean: boolean().notNull(),
		date1: date({ mode: 'date' }).notNull(),
		date2: date({ mode: 'string' }).notNull(),
		char1: char({ length: 10 }).notNull(),
		char2: char({ length: 1, enum: ['a', 'b', 'c'] }).notNull(),
		cidr: cidr().notNull(),
		doublePrecision: doublePrecision().notNull(),
		geometry1: geometry({ type: 'point', mode: 'tuple' }).notNull(),
		geometry2: geometry({ type: 'point', mode: 'xy' }).notNull(),
		halfvec: halfvec({ dimensions: 3 }).notNull(),
		inet: inet().notNull(),
		integer: integer().notNull(),
		interval: interval().notNull(),
		json: json().notNull(),
		jsonb: jsonb().notNull(),
		line1: line({ mode: 'abc' }).notNull(),
		line2: line({ mode: 'tuple' }).notNull(),
		macaddr: macaddr().notNull(),
		macaddr8: macaddr8().notNull(),
		numeric: numeric().notNull(),
		point1: point({ mode: 'xy' }).notNull(),
		point2: point({ mode: 'tuple' }).notNull(),
		real: real().notNull(),
		serial: serial().notNull(),
		smallint: smallint().notNull(),
		smallserial: smallserial().notNull(),
		text1: text().notNull(),
		text2: text({ enum: ['a', 'b', 'c'] }).notNull(),
		sparsevec: sparsevec({ dimensions: 3 }).notNull(),
		time: time().notNull(),
		timestamp1: timestamp({ mode: 'date' }).notNull(),
		timestamp2: timestamp({ mode: 'string' }).notNull(),
		uuid: uuid().notNull(),
		varchar1: varchar({ length: 10 }).notNull(),
		varchar2: varchar({ length: 1, enum: ['a', 'b', 'c'] }).notNull(),
		vector: vector({ dimensions: 3 }).notNull(),
		array1: integer().array().notNull(),
		array2: integer().array().array(2).notNull(),
		array3: varchar({ length: 10 }).array().array(2).notNull(),
	}));

	const result = createSelectSchema(table);
	const expected = z.object({
		bigint1: z.int().gte(Number.MIN_SAFE_INTEGER).lte(Number.MAX_SAFE_INTEGER),
		bigint2: z.bigint().gte(CONSTANTS.INT64_MIN).lte(CONSTANTS.INT64_MAX),
		bigserial1: z.int().gte(Number.MIN_SAFE_INTEGER).lte(Number.MAX_SAFE_INTEGER),
		bigserial2: z.bigint().gte(CONSTANTS.INT64_MIN).lte(CONSTANTS.INT64_MAX),
		bit: z.string().regex(/^[01]+$/).max(5),
		boolean: z.boolean(),
		date1: z.date(),
		date2: z.string(),
		char1: z.string().length(10),
		char2: z.enum(['a', 'b', 'c']),
		cidr: z.string(),
		doublePrecision: z.number().gte(CONSTANTS.INT48_MIN).lte(CONSTANTS.INT48_MAX),
		geometry1: z.tuple([z.number(), z.number()]),
		geometry2: z.object({ x: z.number(), y: z.number() }),
		halfvec: z.array(z.number()).length(3),
		inet: z.string(),
		integer: z.int().gte(CONSTANTS.INT32_MIN).lte(CONSTANTS.INT32_MAX),
		interval: z.string(),
		json: jsonSchema,
		jsonb: jsonSchema,
		line1: z.object({ a: z.number(), b: z.number(), c: z.number() }),
		line2: z.tuple([z.number(), z.number(), z.number()]),
		macaddr: z.string(),
		macaddr8: z.string(),
		numeric: z.string(),
		point1: z.object({ x: z.number(), y: z.number() }),
		point2: z.tuple([z.number(), z.number()]),
		real: z.number().gte(CONSTANTS.INT24_MIN).lte(CONSTANTS.INT24_MAX),
		serial: z.int().gte(CONSTANTS.INT32_MIN).lte(CONSTANTS.INT32_MAX),
		smallint: z.int().gte(CONSTANTS.INT16_MIN).lte(CONSTANTS.INT16_MAX),
		smallserial: z.int().gte(CONSTANTS.INT16_MIN).lte(CONSTANTS.INT16_MAX),
		text1: z.string(),
		text2: z.enum(['a', 'b', 'c']),
		sparsevec: z.string(),
		time: z.string(),
		timestamp1: z.date(),
		timestamp2: z.string(),
		uuid: z.uuid(),
		varchar1: z.string().max(10),
		varchar2: z.enum(['a', 'b', 'c']),
		vector: z.array(z.number()).length(3),
		array1: z.array(integerSchema),
		array2: z.array(z.array(integerSchema).length(2)),
		array3: z.array(z.array(z.string().max(10)).length(2)),
	});

	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('type coercion - all', (t) => {
	const table = pgTable('test', ({
		bigint,
		boolean,
		timestamp,
		integer,
		text,
	}) => ({
		bigint: bigint({ mode: 'bigint' }).notNull(),
		boolean: boolean().notNull(),
		timestamp: timestamp().notNull(),
		integer: integer().notNull(),
		text: text().notNull(),
	}));

	const { createSelectSchema } = createSchemaFactory({
		coerce: true,
	});
	const result = createSelectSchema(table);
	const expected = z.object({
		bigint: z.coerce.bigint().gte(CONSTANTS.INT64_MIN).lte(CONSTANTS.INT64_MAX),
		boolean: z.coerce.boolean(),
		timestamp: z.coerce.date(),
		integer: z.coerce.number().gte(CONSTANTS.INT32_MIN).lte(CONSTANTS.INT32_MAX).int(),
		text: z.coerce.string(),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('type coercion - mixed', (t) => {
	const table = pgTable('test', ({
		timestamp,
		integer,
	}) => ({
		timestamp: timestamp().notNull(),
		integer: integer().notNull(),
	}));

	const { createSelectSchema } = createSchemaFactory({
		coerce: {
			date: true,
		},
	});
	const result = createSelectSchema(table);
	const expected = z.object({
		timestamp: z.coerce.date(),
		integer: z.int().gte(CONSTANTS.INT32_MIN).lte(CONSTANTS.INT32_MAX),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

/* Infinitely recursive type */ {
	const TopLevelCondition: z.ZodType<TopLevelCondition> = z.custom<TopLevelCondition>().superRefine(() => {});
	const table = pgTable('test', {
		json: json().$type<TopLevelCondition>().notNull(),
		jsonb: jsonb().$type<TopLevelCondition>(),
	});
	const result = createSelectSchema(table);
	const expected = z.object({
		json: TopLevelCondition,
		jsonb: z.nullable(TopLevelCondition),
	});
	Expect<Equal<z.infer<typeof result>, z.infer<typeof expected>>>();
}

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
