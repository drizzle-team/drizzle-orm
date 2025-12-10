import { type Equal, sql } from 'drizzle-orm';
import {
	cockroachEnum,
	cockroachMaterializedView,
	cockroachSchema,
	cockroachTable,
	cockroachView,
	customType,
	int4,
	jsonb,
	text,
} from 'drizzle-orm/cockroach-core';
import type { TopLevelCondition } from 'json-rules-engine';
import { test } from 'vitest';
import { z } from 'zod/v4';
import { jsonSchema } from '~/column.ts';
import { CONSTANTS } from '~/constants.ts';
import { createInsertSchema, createSchemaFactory, createSelectSchema, createUpdateSchema } from '../src';
import { Expect, expectEnumValues, expectSchemaShape } from './utils.ts';

const int4Schema = z.int().gte(CONSTANTS.INT32_MIN).lte(CONSTANTS.INT32_MAX);
const int4NullableSchema = int4Schema.nullable();
const int4OptionalSchema = int4Schema.optional();
const int4NullableOptionalSchema = int4Schema.nullable().optional();

const textSchema = z.string();
const textOptionalSchema = textSchema.optional();

const anySchema = z.any();

const extendedSchema = int4Schema.lte(1000);
const extendedNullableSchema = extendedSchema.nullable();
const extendedOptionalSchema = extendedSchema.optional();

const customSchema = z.string().transform(Number);

test('table - select', (t) => {
	const table = cockroachTable('test', {
		id: int4().primaryKey(),
		generated: int4().generatedAlwaysAsIdentity(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = z.object({ id: int4Schema, generated: int4Schema, name: textSchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table in schema - select', (tc) => {
	const schema = cockroachSchema('test');
	const table = schema.table('test', {
		id: int4().primaryKey(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = z.object({ id: int4Schema, name: textSchema });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table - insert', (t) => {
	const table = cockroachTable('test', {
		id: int4().generatedAlwaysAsIdentity().primaryKey(),
		name: text().notNull(),
		age: int4(),
	});

	const result = createInsertSchema(table);
	const expected = z.object({ name: textSchema, age: int4NullableOptionalSchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table - update', (t) => {
	const table = cockroachTable('test', {
		id: int4().generatedAlwaysAsIdentity().primaryKey(),
		name: text().notNull(),
		age: int4(),
	});

	const result = createUpdateSchema(table);
	const expected = z.object({
		name: textOptionalSchema,
		age: int4NullableOptionalSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view qb - select', (t) => {
	const table = cockroachTable('test', {
		id: int4().primaryKey(),
		name: text().notNull(),
	});
	const view = cockroachView('test').as((qb) => qb.select({ id: table.id, age: sql``.as('age') }).from(table));

	const result = createSelectSchema(view);
	const expected = z.object({ id: int4Schema, age: anySchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view columns - select', (t) => {
	const view = cockroachView('test', {
		id: int4().primaryKey(),
		name: text().notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = z.object({ id: int4Schema, name: textSchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('materialized view qb - select', (t) => {
	const table = cockroachTable('test', {
		id: int4().primaryKey(),
		name: text().notNull(),
	});
	const view = cockroachMaterializedView('test').as((qb) =>
		qb.select({ id: table.id, age: sql``.as('age') }).from(table)
	);

	const result = createSelectSchema(view);
	const expected = z.object({ id: int4Schema, age: anySchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('materialized view columns - select', (t) => {
	const view = cockroachMaterializedView('test', {
		id: int4().primaryKey(),
		name: text().notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = z.object({ id: int4Schema, name: textSchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view with nested fields - select', (t) => {
	const table = cockroachTable('test', {
		id: int4().primaryKey(),
		name: text().notNull(),
	});
	const view = cockroachView('test').as((qb) =>
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
		id: int4Schema,
		nested: z.object({ name: textSchema, age: anySchema }),
		table: z.object({ id: int4Schema, name: textSchema }),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('enum - select', (t) => {
	const enum_ = cockroachEnum('test', ['a', 'b', 'c']);

	const result = createSelectSchema(enum_);
	const expected = z.enum(['a', 'b', 'c']);
	expectEnumValues(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('nullability - select', (t) => {
	const table = cockroachTable('test', {
		c1: int4(),
		c2: int4().notNull(),
		c3: int4().default(1),
		c4: int4().notNull().default(1),
	});

	const result = createSelectSchema(table);
	const expected = z.object({
		c1: int4NullableSchema,
		c2: int4Schema,
		c3: int4NullableSchema,
		c4: int4Schema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('nullability - insert', (t) => {
	const table = cockroachTable('test', {
		c1: int4(),
		c2: int4().notNull(),
		c3: int4().default(1),
		c4: int4().notNull().default(1),
		c5: int4().generatedAlwaysAs(1),
		c6: int4().generatedAlwaysAsIdentity(),
		c7: int4().generatedByDefaultAsIdentity(),
	});

	const result = createInsertSchema(table);
	const expected = z.object({
		c1: int4NullableOptionalSchema,
		c2: int4Schema,
		c3: int4NullableOptionalSchema,
		c4: int4OptionalSchema,
		c7: int4OptionalSchema,
	});
	expectSchemaShape(t, expected).from(result);
});

test('nullability - update', (t) => {
	const table = cockroachTable('test', {
		c1: int4(),
		c2: int4().notNull(),
		c3: int4().default(1),
		c4: int4().notNull().default(1),
		c5: int4().generatedAlwaysAs(1),
		c6: int4().generatedAlwaysAsIdentity(),
		c7: int4().generatedByDefaultAsIdentity(),
	});

	const result = createUpdateSchema(table);
	const expected = z.object({
		c1: int4NullableOptionalSchema,
		c2: int4OptionalSchema,
		c3: int4NullableOptionalSchema,
		c4: int4OptionalSchema,
		c7: int4OptionalSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - select', (t) => {
	const table = cockroachTable('test', {
		c1: int4(),
		c2: int4().notNull(),
		c3: int4().notNull(),
	});

	const result = createSelectSchema(table, {
		c2: (schema) => schema.lte(1000),
		c3: z.string().transform(Number),
	});
	const expected = z.object({
		c1: int4NullableSchema,
		c2: extendedSchema,
		c3: customSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - select with custom data type', (t) => {
	const customText = customType({ dataType: () => 'text' });
	const table = cockroachTable('test', {
		c1: int4(),
		c2: int4().notNull(),
		c3: int4().notNull(),
		c4: customText(),
	});

	const customTextSchema = z.string().min(1).max(100);
	const result = createSelectSchema(table, {
		c2: (schema) => schema.lte(1000),
		c3: z.string().transform(Number),
		c4: customTextSchema,
	});
	const expected = z.object({
		c1: int4NullableSchema,
		c2: extendedSchema,
		c3: customSchema,
		c4: customTextSchema,
	});

	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - insert', (t) => {
	const table = cockroachTable('test', {
		c1: int4(),
		c2: int4().notNull(),
		c3: int4().notNull(),
		c4: int4().generatedAlwaysAs(1),
	});

	const result = createInsertSchema(table, {
		c2: (schema) => schema.lte(1000),
		c3: z.string().transform(Number),
	});
	const expected = z.object({
		c1: int4NullableOptionalSchema,
		c2: extendedSchema,
		c3: customSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - update', (t) => {
	const table = cockroachTable('test', {
		c1: int4(),
		c2: int4().notNull(),
		c3: int4().notNull(),
		c4: int4().generatedAlwaysAs(1),
	});

	const result = createUpdateSchema(table, {
		c2: (schema) => schema.lte(1000),
		c3: z.string().transform(Number),
	});
	const expected = z.object({
		c1: int4NullableOptionalSchema,
		c2: extendedOptionalSchema,
		c3: customSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine view - select', (t) => {
	const table = cockroachTable('test', {
		c1: int4(),
		c2: int4(),
		c3: int4(),
		c4: int4(),
		c5: int4(),
		c6: int4(),
	});
	const view = cockroachView('test').as((qb) =>
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
		c1: int4NullableSchema,
		c2: extendedNullableSchema,
		c3: customSchema,
		nested: z.object({
			c4: int4NullableSchema,
			c5: extendedNullableSchema,
			c6: customSchema,
		}),
		table: z.object({
			c1: int4NullableSchema,
			c2: extendedNullableSchema,
			c3: customSchema,
			c4: int4NullableSchema,
			c5: int4NullableSchema,
			c6: int4NullableSchema,
		}),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('all data types', (t) => {
	const table = cockroachTable('test', ({
		bigint,
		bit,
		bool,
		char,
		date,
		decimal,
		float,
		doublePrecision,
		geometry,
		inet,
		int2,
		int4,
		int8,
		interval,
		jsonb,
		numeric,
		real,
		smallint,
		string,
		text,
		time,
		timestamp,
		uuid,
		varchar,
		vector,
	}) => ({
		bigint1: bigint({ mode: 'number' }).notNull(),
		bigint2: bigint({ mode: 'bigint' }).notNull(),
		bit: bit({ length: 5 }).notNull(),
		bool: bool().notNull(),
		char1: char({ length: 10 }).notNull(),
		char2: char({ length: 1, enum: ['a', 'b', 'c'] }).notNull(),
		date1: date({ mode: 'date' }).notNull(),
		date2: date({ mode: 'string' }).notNull(),
		decimal1: decimal({ mode: 'number' }).notNull(),
		decimal2: decimal({ mode: 'bigint' }).notNull(),
		decimal3: decimal({ mode: 'string' }).notNull(),
		float: float().notNull(),
		doublePrecision: doublePrecision().notNull(),
		geometry1: geometry({ type: 'point', mode: 'tuple' }).notNull(),
		geometry2: geometry({ type: 'point', mode: 'xy' }).notNull(),
		inet: inet().notNull(),
		int2: int2().notNull(),
		int4: int4().notNull(),
		int8_1: int8({ mode: 'number' }).notNull(),
		int8_2: int8({ mode: 'bigint' }).notNull(),
		interval: interval().notNull(),
		jsonb: jsonb().notNull(),
		numeric1: numeric({ mode: 'number' }).notNull(),
		numeric2: numeric({ mode: 'bigint' }).notNull(),
		numeric3: numeric({ mode: 'string' }).notNull(),
		real: real().notNull(),
		smallint: smallint().notNull(),
		string1: string().notNull(),
		string2: string({ enum: ['a', 'b', 'c'] }).notNull(),
		text1: text().notNull(),
		text2: text({ enum: ['a', 'b', 'c'] }).notNull(),
		time: time().notNull(),
		timestamp1: timestamp({ mode: 'date' }).notNull(),
		timestamp2: timestamp({ mode: 'string' }).notNull(),
		uuid: uuid().notNull(),
		varchar1: varchar({ length: 10 }).notNull(),
		varchar2: varchar({ length: 1, enum: ['a', 'b', 'c'] }).notNull(),
		vector: vector({ dimensions: 3 }).notNull(),
		array: int4().array().notNull(),
	}));

	const result = createSelectSchema(table);
	const expected = z.object({
		bigint1: z.int().gte(Number.MIN_SAFE_INTEGER).lte(Number.MAX_SAFE_INTEGER),
		bigint2: z.bigint().gte(CONSTANTS.INT64_MIN).lte(CONSTANTS.INT64_MAX),
		bit: z.string().regex(/^[01]*$/).length(5),
		bool: z.boolean(),
		char1: z.string().max(10),
		char2: z.enum(['a', 'b', 'c']),
		date1: z.date(),
		date2: z.string(),
		decimal1: z.number().gte(Number.MIN_SAFE_INTEGER).lte(Number.MAX_SAFE_INTEGER),
		decimal2: z.bigint().gte(CONSTANTS.INT64_MIN).lte(CONSTANTS.INT64_MAX),
		decimal3: z.string(),
		float: z.number().gte(CONSTANTS.INT48_MIN).lte(CONSTANTS.INT48_MAX),
		doublePrecision: z.number().gte(CONSTANTS.INT48_MIN).lte(CONSTANTS.INT48_MAX),
		geometry1: z.tuple([z.number(), z.number()]),
		geometry2: z.object({ x: z.number(), y: z.number() }),
		inet: z.string(),
		int2: z.int().gte(CONSTANTS.INT16_MIN).lte(CONSTANTS.INT16_MAX),
		int4: z.int().gte(CONSTANTS.INT32_MIN).lte(CONSTANTS.INT32_MAX),
		int8_1: z.int().gte(Number.MIN_SAFE_INTEGER).lte(Number.MAX_SAFE_INTEGER),
		int8_2: z.bigint().gte(CONSTANTS.INT64_MIN).lte(CONSTANTS.INT64_MAX),
		interval: z.string(),
		jsonb: jsonSchema,
		numeric1: z.number().gte(Number.MIN_SAFE_INTEGER).lte(Number.MAX_SAFE_INTEGER),
		numeric2: z.bigint().gte(CONSTANTS.INT64_MIN).lte(CONSTANTS.INT64_MAX),
		numeric3: z.string(),
		real: z.number().gte(CONSTANTS.INT24_MIN).lte(CONSTANTS.INT24_MAX),
		smallint: z.int().gte(CONSTANTS.INT16_MIN).lte(CONSTANTS.INT16_MAX),
		string1: z.string(),
		string2: z.enum(['a', 'b', 'c']),
		text1: z.string(),
		text2: z.enum(['a', 'b', 'c']),
		time: z.string(),
		timestamp1: z.date(),
		timestamp2: z.string(),
		uuid: z.uuid(),
		varchar1: z.string().max(10),
		varchar2: z.enum(['a', 'b', 'c']),
		vector: z.array(z.number()).length(3),
		array: z.array(int4Schema),
	});

	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('type coercion - all', (t) => {
	const table = cockroachTable('test', ({
		bigint,
		bool,
		timestamp,
		int4,
		text,
	}) => ({
		bigint: bigint({ mode: 'bigint' }).notNull(),
		bool: bool().notNull(),
		timestamp: timestamp().notNull(),
		int4: int4().notNull(),
		text: text().notNull(),
	}));

	const { createSelectSchema } = createSchemaFactory({
		coerce: true,
	});
	const result = createSelectSchema(table);
	const expected = z.object({
		bigint: z.coerce.bigint().gte(CONSTANTS.INT64_MIN).lte(CONSTANTS.INT64_MAX),
		bool: z.coerce.boolean(),
		timestamp: z.coerce.date(),
		int4: z.coerce.number().int().gte(CONSTANTS.INT32_MIN).lte(CONSTANTS.INT32_MAX),
		text: z.coerce.string(),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('type coercion - mixed', (t) => {
	const table = cockroachTable('test', ({
		timestamp,
		int4,
	}) => ({
		timestamp: timestamp().notNull(),
		int4: int4().notNull(),
	}));

	const { createSelectSchema } = createSchemaFactory({
		coerce: {
			date: true,
		},
	});
	const result = createSelectSchema(table);
	const expected = z.object({
		timestamp: z.coerce.date(),
		int4: z.int().gte(CONSTANTS.INT32_MIN).lte(CONSTANTS.INT32_MAX),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

/* Infinitely recursive type */ {
	const TopLevelCondition: z.ZodType<TopLevelCondition> = z.custom<TopLevelCondition>().superRefine(() => {});
	const table = cockroachTable('test', {
		jsonb: jsonb().$type<TopLevelCondition>(),
	});
	const result = createSelectSchema(table);
	const expected = z.object({
		jsonb: z.nullable(TopLevelCondition),
	});
	Expect<Equal<z.infer<typeof result>, z.infer<typeof expected>>>();
}

/* Disallow unknown keys in table refinement - select */ {
	const table = cockroachTable('test', { id: int4() });
	// @ts-expect-error
	createSelectSchema(table, { unknown: z.string() });
}

/* Disallow unknown keys in table refinement - insert */ {
	const table = cockroachTable('test', { id: int4() });
	// @ts-expect-error
	createInsertSchema(table, { unknown: z.string() });
}

/* Disallow unknown keys in table refinement - update */ {
	const table = cockroachTable('test', { id: int4() });
	// @ts-expect-error
	createUpdateSchema(table, { unknown: z.string() });
}

/* Disallow unknown keys in view qb - select */ {
	const table = cockroachTable('test', { id: int4() });
	const view = cockroachView('test').as((qb) => qb.select().from(table));
	const mView = cockroachMaterializedView('test').as((qb) => qb.select().from(table));
	const nestedSelect = cockroachView('test').as((qb) => qb.select({ table }).from(table));
	// @ts-expect-error
	createSelectSchema(view, { unknown: z.string() });
	// @ts-expect-error
	createSelectSchema(mView, { unknown: z.string() });
	// @ts-expect-error
	createSelectSchema(nestedSelect, { table: { unknown: z.string() } });
}

/* Disallow unknown keys in view columns - select */ {
	const view = cockroachView('test', { id: int4() }).as(sql``);
	const mView = cockroachView('test', { id: int4() }).as(sql``);
	// @ts-expect-error
	createSelectSchema(view, { unknown: z.string() });
	// @ts-expect-error
	createSelectSchema(mView, { unknown: z.string() });
}
