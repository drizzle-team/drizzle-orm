import { type Equal, sql } from 'drizzle-orm';
import { customType, int, mssqlSchema, mssqlTable, mssqlView, text } from 'drizzle-orm/mssql-core';
import { test } from 'vitest';
import { z } from 'zod/v4';
import { bigintStringModeSchema, bufferSchema } from '~/column.ts';
import { CONSTANTS } from '~/constants.ts';
import { createInsertSchema, createSchemaFactory, createSelectSchema, createUpdateSchema } from '../src/index.ts';
import { Expect, expectSchemaShape } from './utils.ts';

const integerSchema = z.int().gte(CONSTANTS.INT32_MIN).lte(CONSTANTS.INT32_MAX);
const integerNullableSchema = integerSchema.nullable();
const integerOptionalSchema = integerSchema.optional();
const integerNullableOptionalSchema = integerSchema.nullable().optional();

const textSchema = z.string();
const textOptionalSchema = textSchema.optional();

const anySchema = z.any();

const extendedSchema = integerSchema.lte(1000);
const extendedNullableSchema = extendedSchema.nullable();
const extendedOptionalSchema = extendedSchema.optional();

const customSchema = z.string().transform(Number);

test('table - select', (t) => {
	const table = mssqlTable('test', {
		id: int().primaryKey(),
		generated: int().identity(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = z.object({ id: integerSchema, generated: integerSchema, name: textSchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table in schema - select', (tc) => {
	const schema = mssqlSchema('test');
	const table = schema.table('test', {
		id: int().primaryKey(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = z.object({ id: integerSchema, name: textSchema });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table - insert', (t) => {
	const table = mssqlTable('test', {
		id: int().identity().primaryKey(),
		name: text().notNull(),
		age: int(),
	});

	const result = createInsertSchema(table);
	const expected = z.object({ name: textSchema, age: integerNullableOptionalSchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table - update', (t) => {
	const table = mssqlTable('test', {
		id: int().identity().primaryKey(),
		name: text().notNull(),
		age: int(),
	});

	const result = createUpdateSchema(table);
	const expected = z.object({
		name: textOptionalSchema,
		age: integerNullableOptionalSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view qb - select', (t) => {
	const table = mssqlTable('test', {
		id: int().primaryKey(),
		name: text().notNull(),
	});
	const view = mssqlView('test').as((qb) => qb.select({ id: table.id, age: sql``.as('age') }).from(table));

	const result = createSelectSchema(view);
	const expected = z.object({ id: integerSchema, age: anySchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view columns - select', (t) => {
	const view = mssqlView('test', {
		id: int().primaryKey(),
		name: text().notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = z.object({ id: integerSchema, name: textSchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view with nested fields - select', (t) => {
	const table = mssqlTable('test', {
		id: int().primaryKey(),
		name: text().notNull(),
	});
	const view = mssqlView('test').as((qb) =>
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
		nested: z.object({ name: textSchema, age: anySchema }),
		table: z.object({ id: integerSchema, name: textSchema }),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('nullability - select', (t) => {
	const table = mssqlTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().default(1),
		c4: int().notNull().default(1),
	});

	const result = createSelectSchema(table);
	const expected = z.object({
		c1: integerNullableSchema,
		c2: integerSchema,
		c3: integerNullableSchema,
		c4: integerSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('nullability - insert', (t) => {
	const table = mssqlTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().default(1),
		c4: int().notNull().default(1),
		c5: int().generatedAlwaysAs(1),
		c6: int().identity(),
	});

	const result = createInsertSchema(table);
	const expected = z.object({
		c1: integerNullableOptionalSchema,
		c2: integerSchema,
		c3: integerNullableOptionalSchema,
		c4: integerOptionalSchema,
	});
	expectSchemaShape(t, expected).from(result);
});

test('nullability - update', (t) => {
	const table = mssqlTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().default(1),
		c4: int().notNull().default(1),
		c5: int().generatedAlwaysAs(1),
		c6: int().identity(),
	});

	const result = createUpdateSchema(table);
	const expected = z.object({
		c1: integerNullableOptionalSchema,
		c2: integerOptionalSchema,
		c3: integerNullableOptionalSchema,
		c4: integerOptionalSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - select', (t) => {
	const table = mssqlTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().notNull(),
	});

	const result = createSelectSchema(table, {
		c2: (schema) => schema.lte(1000),
		c3: z.string().transform(Number),
	});
	const expected = z.object({
		c1: integerNullableSchema,
		c2: extendedSchema,
		c3: customSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - select with custom data type', (t) => {
	const customText = customType({ dataType: () => 'text' });
	const table = mssqlTable('test', {
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
		c1: integerNullableSchema,
		c2: extendedSchema,
		c3: customSchema,
		c4: customTextSchema,
	});

	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - insert', (t) => {
	const table = mssqlTable('test', {
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
		c1: integerNullableOptionalSchema,
		c2: extendedSchema,
		c3: customSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - update', (t) => {
	const table = mssqlTable('test', {
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
		c1: integerNullableOptionalSchema,
		c2: extendedOptionalSchema,
		c3: customSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine view - select', (t) => {
	const table = mssqlTable('test', {
		c1: int(),
		c2: int(),
		c3: int(),
		c4: int(),
		c5: int(),
		c6: int(),
	});
	const view = mssqlView('test').as((qb) =>
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
		c1: integerNullableSchema,
		c2: extendedNullableSchema,
		c3: customSchema,
		nested: z.object({
			c4: integerNullableSchema,
			c5: extendedNullableSchema,
			c6: customSchema,
		}),
		table: z.object({
			c1: integerNullableSchema,
			c2: extendedNullableSchema,
			c3: customSchema,
			c4: integerNullableSchema,
			c5: integerNullableSchema,
			c6: integerNullableSchema,
		}),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('all data types', (t) => {
	const table = mssqlTable('test', ({
		bigint,
		binary,
		bit,
		char,
		date,
		datetime,
		datetime2,
		datetimeoffset,
		decimal,
		float,
		int,
		numeric,
		real,
		smallint,
		text,
		time,
		tinyint,
		varbinary,
		varchar,
		ntext,
		nvarchar,
	}) => ({
		bigint1: bigint({ mode: 'number' }).notNull(),
		bigint2: bigint({ mode: 'bigint' }).notNull(),
		bigint3: bigint({ mode: 'string' }).notNull(),
		binary: binary({ length: 10 }).notNull(),
		bit: bit().notNull(),
		char1: char({ length: 10 }).notNull(),
		char2: char({ length: 1, enum: ['a', 'b', 'c'] }).notNull(),
		date1: date({ mode: 'date' }).notNull(),
		date2: date({ mode: 'string' }).notNull(),
		datetime1: datetime({ mode: 'date' }).notNull(),
		datetime2: datetime({ mode: 'string' }).notNull(),
		datetime2_1: datetime2({ mode: 'date' }).notNull(),
		datetime2_2: datetime2({ mode: 'string' }).notNull(),
		datetimeoffset1: datetimeoffset({ mode: 'date' }).notNull(),
		datetimeoffset2: datetimeoffset({ mode: 'string' }).notNull(),
		decimal1: decimal({ mode: 'number' }).notNull(),
		decimal2: decimal({ mode: 'bigint' }).notNull(),
		decimal3: decimal({ mode: 'string' }).notNull(),
		float: float().notNull(),
		int: int().notNull(),
		numeric1: numeric({ mode: 'number' }).notNull(),
		numeric2: numeric({ mode: 'bigint' }).notNull(),
		numeric3: numeric({ mode: 'string' }).notNull(),
		real: real().notNull(),
		smallint: smallint().notNull(),
		text1: text().notNull(),
		text2: text({ enum: ['a', 'b', 'c'] }).notNull(),
		time1: time({ mode: 'date' }).notNull(),
		time2: time({ mode: 'string' }).notNull(),
		tinyint: tinyint().notNull(),
		varbinary: varbinary({ length: 10 }).notNull(),
		varchar1: varchar({ length: 10 }).notNull(),
		varchar2: varchar({ length: 1, enum: ['a', 'b', 'c'] }).notNull(),
		ntext1: ntext().notNull(),
		ntext2: ntext({ enum: ['a', 'b', 'c'] }).notNull(),
		nvarchar1: nvarchar({ length: 10 }).notNull(),
		nvarchar2: nvarchar({ length: 1, enum: ['a', 'b', 'c'] }).notNull(),
	}));

	const result = createSelectSchema(table);
	const expected = z.object({
		bigint1: z.int().gte(Number.MIN_SAFE_INTEGER).lte(Number.MAX_SAFE_INTEGER),
		bigint2: z.bigint().gte(CONSTANTS.INT64_MIN).lte(CONSTANTS.INT64_MAX),
		bigint3: bigintStringModeSchema,
		binary: bufferSchema,
		bit: z.boolean(),
		char1: z.string().max(10),
		char2: z.enum(['a', 'b', 'c']),
		date1: z.date(),
		date2: z.string(),
		datetime1: z.date(),
		datetime2: z.string(),
		datetime2_1: z.date(),
		datetime2_2: z.string(),
		datetimeoffset1: z.date(),
		datetimeoffset2: z.string(),
		decimal1: z.number().gte(Number.MIN_SAFE_INTEGER).lte(Number.MAX_SAFE_INTEGER),
		decimal2: z.bigint().gte(CONSTANTS.INT64_MIN).lte(CONSTANTS.INT64_MAX),
		decimal3: z.string(),
		float: z.number().gte(CONSTANTS.INT48_MIN).lte(CONSTANTS.INT48_MAX),
		int: z.int().gte(CONSTANTS.INT32_MIN).lte(CONSTANTS.INT32_MAX),
		numeric1: z.number().gte(Number.MIN_SAFE_INTEGER).lte(Number.MAX_SAFE_INTEGER),
		numeric2: z.bigint().gte(CONSTANTS.INT64_MIN).lte(CONSTANTS.INT64_MAX),
		numeric3: z.string(),
		real: z.number().gte(CONSTANTS.INT24_MIN).lte(CONSTANTS.INT24_MAX),
		smallint: z.int().gte(CONSTANTS.INT16_MIN).lte(CONSTANTS.INT16_MAX),
		text1: z.string(),
		text2: z.enum(['a', 'b', 'c']),
		time1: z.date(),
		time2: z.string(),
		tinyint: z.int().gte(0).lte(CONSTANTS.INT8_UNSIGNED_MAX),
		varbinary: bufferSchema,
		varchar1: z.string().max(10),
		varchar2: z.enum(['a', 'b', 'c']),
		ntext1: z.string(),
		ntext2: z.enum(['a', 'b', 'c']),
		nvarchar1: z.string().max(10),
		nvarchar2: z.enum(['a', 'b', 'c']),
	});

	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('type coercion - all', (t) => {
	const table = mssqlTable('test', ({
		bigint,
		bit,
		datetime,
		int,
		text,
	}) => ({
		bigint: bigint({ mode: 'bigint' }).notNull(),
		bit: bit().notNull(),
		datetime: datetime().notNull(),
		int: int().notNull(),
		text: text().notNull(),
	}));

	const { createSelectSchema } = createSchemaFactory({
		coerce: true,
	});
	const result = createSelectSchema(table);
	const expected = z.object({
		bigint: z.coerce.bigint().gte(CONSTANTS.INT64_MIN).lte(CONSTANTS.INT64_MAX),
		bit: z.coerce.boolean(),
		datetime: z.coerce.date(),
		int: z.coerce.number().int().gte(CONSTANTS.INT32_MIN).lte(CONSTANTS.INT32_MAX),
		text: z.coerce.string(),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('type coercion - mixed', (t) => {
	const table = mssqlTable('test', ({
		datetime,
		int,
	}) => ({
		datetime: datetime().notNull(),
		int: int().notNull(),
	}));

	const { createSelectSchema } = createSchemaFactory({
		coerce: {
			date: true,
		},
	});
	const result = createSelectSchema(table);
	const expected = z.object({
		datetime: z.coerce.date(),
		int: z.int().gte(CONSTANTS.INT32_MIN).lte(CONSTANTS.INT32_MAX),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

// MSSQL doesn't support JSON data type
// /* Infinitely recursive type */ {
// 	const TopLevelCondition: z.ZodType<TopLevelCondition> = z.custom<TopLevelCondition>().superRefine(() => {});
// 	const table = mssqlTable('test', {
// 		json: json().$type<TopLevelCondition>(),
// 	});
// 	const result = createSelectSchema(table);
// 	const expected = z.object({
// 		json: z.nullable(TopLevelCondition),
// 	});
// 	Expect<Equal<z.infer<typeof result>, z.infer<typeof expected>>>();
// }

/* Disallow unknown keys in table refinement - select */ {
	const table = mssqlTable('test', { id: int() });
	// @ts-expect-error
	createSelectSchema(table, { unknown: z.string() });
}

/* Disallow unknown keys in table refinement - insert */ {
	const table = mssqlTable('test', { id: int() });
	// @ts-expect-error
	createInsertSchema(table, { unknown: z.string() });
}

/* Disallow unknown keys in table refinement - update */ {
	const table = mssqlTable('test', { id: int() });
	// @ts-expect-error
	createUpdateSchema(table, { unknown: z.string() });
}

/* Disallow unknown keys in view qb - select */ {
	const table = mssqlTable('test', { id: int() });
	const view = mssqlView('test').as((qb) => qb.select().from(table));
	const nestedSelect = mssqlView('test').as((qb) => qb.select({ table }).from(table));
	// @ts-expect-error
	createSelectSchema(view, { unknown: z.string() });
	// @ts-expect-error
	createSelectSchema(nestedSelect, { table: { unknown: z.string() } });
}

/* Disallow unknown keys in view columns - select */ {
	const view = mssqlView('test', { id: int() }).as(sql``);
	const mView = mssqlView('test', { id: int() }).as(sql``);
	// @ts-expect-error
	createSelectSchema(view, { unknown: z.string() });
	// @ts-expect-error
	createSelectSchema(mView, { unknown: z.string() });
}
