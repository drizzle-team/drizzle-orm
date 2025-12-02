import { type Equal, sql } from 'drizzle-orm';
import { customType, int, json, mysqlSchema, mysqlTable, mysqlView, serial, text } from 'drizzle-orm/mysql-core';
import type { TopLevelCondition } from 'json-rules-engine';
import { test } from 'vitest';
import { z } from 'zod/v4';
import { bigintStringModeSchema, jsonSchema, unsignedBigintStringModeSchema } from '~/column.ts';
import { CONSTANTS } from '~/constants.ts';
import { createInsertSchema, createSchemaFactory, createSelectSchema, createUpdateSchema } from '../src';
import { Expect, expectSchemaShape } from './utils.ts';

const intSchema = z.int().gte(CONSTANTS.INT32_MIN).lte(CONSTANTS.INT32_MAX);
const intNullableSchema = intSchema.nullable();
const intOptionalSchema = intSchema.optional();
const intNullableOptionalSchema = intSchema.nullable().optional();

const serialSchema = z.int().gte(0).lte(Number.MAX_SAFE_INTEGER);
const serialOptionalSchema = serialSchema.optional();

const textSchema = z.string().max(CONSTANTS.INT16_UNSIGNED_MAX);
const textOptionalSchema = textSchema.optional();

const anySchema = z.any();

const extendedSchema = intSchema.lte(1000);
const extendedNullableSchema = extendedSchema.nullable();
const extendedOptionalSchema = extendedSchema.optional();

const customSchema = z.string().transform(Number);

test('table - select', (t) => {
	const table = mysqlTable('test', {
		id: serial().primaryKey(),
		generated: int().generatedAlwaysAs(1).notNull(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = z.object({ id: serialSchema, generated: intSchema, name: textSchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table in schema - select', (tc) => {
	const schema = mysqlSchema('test');
	const table = schema.table('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = z.object({ id: serialSchema, name: textSchema });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table - insert', (t) => {
	const table = mysqlTable('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
		age: int(),
	});

	const result = createInsertSchema(table);
	const expected = z.object({
		id: serialOptionalSchema,
		name: textSchema,
		age: intNullableOptionalSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table - update', (t) => {
	const table = mysqlTable('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
		age: int(),
	});

	const result = createUpdateSchema(table);
	const expected = z.object({
		id: serialOptionalSchema,
		name: textOptionalSchema,
		age: intNullableOptionalSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view qb - select', (t) => {
	const table = mysqlTable('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	});
	const view = mysqlView('test').as((qb) => qb.select({ id: table.id, age: sql``.as('age') }).from(table));

	const result = createSelectSchema(view);
	const expected = z.object({ id: serialSchema, age: anySchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view columns - select', (t) => {
	const view = mysqlView('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = z.object({ id: serialSchema, name: textSchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view with nested fields - select', (t) => {
	const table = mysqlTable('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	});
	const view = mysqlView('test').as((qb) =>
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
		id: serialSchema,
		nested: z.object({ name: textSchema, age: anySchema }),
		table: z.object({ id: serialSchema, name: textSchema }),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('nullability - select', (t) => {
	const table = mysqlTable('test', {
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
	const table = mysqlTable('test', {
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
	const table = mysqlTable('test', {
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
	const table = mysqlTable('test', {
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
	const table = mysqlTable('test', {
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
	const table = mysqlTable('test', {
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
	const table = mysqlTable('test', {
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
	const table = mysqlTable('test', {
		c1: int(),
		c2: int(),
		c3: int(),
		c4: int(),
		c5: int(),
		c6: int(),
	});
	const view = mysqlView('test').as((qb) =>
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
	const table = mysqlTable('test', ({
		bigint,
		binary,
		boolean,
		char,
		date,
		datetime,
		decimal,
		double,
		float,
		int,
		json,
		mediumint,
		mysqlEnum,
		real,
		serial,
		smallint,
		text,
		time,
		timestamp,
		tinyint,
		varchar,
		varbinary,
		year,
		longtext,
		mediumtext,
		tinytext,
	}) => ({
		bigint1: bigint({ mode: 'number' }).notNull(),
		bigint2: bigint({ mode: 'bigint' }).notNull(),
		bigint3: bigint({ unsigned: true, mode: 'number' }).notNull(),
		bigint4: bigint({ unsigned: true, mode: 'bigint' }).notNull(),
		bigint5: bigint({ mode: 'string' }).notNull(),
		bigint6: bigint({ unsigned: true, mode: 'string' }).notNull(),
		binary: binary({ length: 10 }).notNull(),
		boolean: boolean().notNull(),
		char1: char({ length: 10 }).notNull(),
		char2: char({ length: 1, enum: ['a', 'b', 'c'] }).notNull(),
		date1: date({ mode: 'date' }).notNull(),
		date2: date({ mode: 'string' }).notNull(),
		datetime1: datetime({ mode: 'date' }).notNull(),
		datetime2: datetime({ mode: 'string' }).notNull(),
		decimal1: decimal({ mode: 'number' }).notNull(),
		decimal2: decimal({ mode: 'number', unsigned: true }).notNull(),
		decimal3: decimal({ mode: 'bigint' }).notNull(),
		decimal4: decimal({ mode: 'bigint', unsigned: true }).notNull(),
		decimal5: decimal({ mode: 'string' }).notNull(),
		decimal6: decimal({ mode: 'string', unsigned: true }).notNull(),
		double1: double().notNull(),
		double2: double({ unsigned: true }).notNull(),
		float1: float().notNull(),
		float2: float({ unsigned: true }).notNull(),
		int1: int().notNull(),
		int2: int({ unsigned: true }).notNull(),
		json: json().notNull(),
		mediumint1: mediumint().notNull(),
		mediumint2: mediumint({ unsigned: true }).notNull(),
		enum: mysqlEnum('enum', ['a', 'b', 'c']).notNull(),
		real: real().notNull(),
		serial: serial().notNull(),
		smallint1: smallint().notNull(),
		smallint2: smallint({ unsigned: true }).notNull(),
		text1: text().notNull(),
		text2: text({ enum: ['a', 'b', 'c'] }).notNull(),
		time: time().notNull(),
		timestamp1: timestamp({ mode: 'date' }).notNull(),
		timestamp2: timestamp({ mode: 'string' }).notNull(),
		tinyint1: tinyint().notNull(),
		tinyint2: tinyint({ unsigned: true }).notNull(),
		varchar1: varchar({ length: 10 }).notNull(),
		varchar2: varchar({ length: 1, enum: ['a', 'b', 'c'] }).notNull(),
		varbinary: varbinary({ length: 10 }).notNull(),
		year: year().notNull(),
		longtext1: longtext().notNull(),
		longtext2: longtext({ enum: ['a', 'b', 'c'] }).notNull(),
		mediumtext1: mediumtext().notNull(),
		mediumtext2: mediumtext({ enum: ['a', 'b', 'c'] }).notNull(),
		tinytext1: tinytext().notNull(),
		tinytext2: tinytext({ enum: ['a', 'b', 'c'] }).notNull(),
	}));

	const result = createSelectSchema(table);
	const expected = z.object({
		bigint1: z.int().gte(Number.MIN_SAFE_INTEGER).lte(Number.MAX_SAFE_INTEGER),
		bigint2: z.bigint().gte(CONSTANTS.INT64_MIN).lte(CONSTANTS.INT64_MAX),
		bigint3: z.int().gte(0).lte(Number.MAX_SAFE_INTEGER),
		bigint4: z.bigint().gte(0n).lte(CONSTANTS.INT64_UNSIGNED_MAX),
		bigint5: bigintStringModeSchema,
		bigint6: unsignedBigintStringModeSchema,
		binary: z.string().regex(/^[01]*$/).max(10),
		boolean: z.boolean(),
		char1: z.string().max(10),
		char2: z.enum(['a', 'b', 'c']),
		date1: z.date(),
		date2: z.string(),
		datetime1: z.date(),
		datetime2: z.string(),
		decimal1: z.number().gte(Number.MIN_SAFE_INTEGER).lte(Number.MAX_SAFE_INTEGER),
		decimal2: z.number().gte(0).lte(Number.MAX_SAFE_INTEGER),
		decimal3: z.bigint().gte(CONSTANTS.INT64_MIN).lte(CONSTANTS.INT64_MAX),
		decimal4: z.bigint().gte(0n).lte(CONSTANTS.INT64_UNSIGNED_MAX),
		decimal5: z.string(),
		decimal6: z.string(),
		double1: z.number().gte(CONSTANTS.INT48_MIN).lte(CONSTANTS.INT48_MAX),
		double2: z.number().gte(0).lte(CONSTANTS.INT48_UNSIGNED_MAX),
		float1: z.number().gte(CONSTANTS.INT24_MIN).lte(CONSTANTS.INT24_MAX),
		float2: z.number().gte(0).lte(CONSTANTS.INT24_UNSIGNED_MAX),
		int1: z.int().gte(CONSTANTS.INT32_MIN).lte(CONSTANTS.INT32_MAX),
		int2: z.int().gte(0).lte(CONSTANTS.INT32_UNSIGNED_MAX),
		json: jsonSchema,
		mediumint1: z.int().gte(CONSTANTS.INT24_MIN).lte(CONSTANTS.INT24_MAX),
		mediumint2: z.int().gte(0).lte(CONSTANTS.INT24_UNSIGNED_MAX),
		enum: z.enum(['a', 'b', 'c']),
		real: z.number().gte(CONSTANTS.INT48_MIN).lte(CONSTANTS.INT48_MAX),
		serial: z.int().gte(0).lte(Number.MAX_SAFE_INTEGER),
		smallint1: z.int().gte(CONSTANTS.INT16_MIN).lte(CONSTANTS.INT16_MAX),
		smallint2: z.int().gte(0).lte(CONSTANTS.INT16_UNSIGNED_MAX),
		text1: z.string().max(CONSTANTS.INT16_UNSIGNED_MAX),
		text2: z.enum(['a', 'b', 'c']),
		time: z.string(),
		timestamp1: z.date(),
		timestamp2: z.string(),
		tinyint1: z.int().gte(CONSTANTS.INT8_MIN).lte(CONSTANTS.INT8_MAX),
		tinyint2: z.int().gte(0).lte(CONSTANTS.INT8_UNSIGNED_MAX),
		varchar1: z.string().max(10),
		varchar2: z.enum(['a', 'b', 'c']),
		varbinary: z.string().regex(/^[01]*$/).max(10),
		year: z.int().gte(1901).lte(2155),
		longtext1: z.string().max(CONSTANTS.INT32_UNSIGNED_MAX),
		longtext2: z.enum(['a', 'b', 'c']),
		mediumtext1: z.string().max(CONSTANTS.INT24_UNSIGNED_MAX),
		mediumtext2: z.enum(['a', 'b', 'c']),
		tinytext1: z.string().max(CONSTANTS.INT8_UNSIGNED_MAX),
		tinytext2: z.enum(['a', 'b', 'c']),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('type coercion - all', (t) => {
	const table = mysqlTable('test', ({
		bigint,
		boolean,
		timestamp,
		int,
		text,
	}) => ({
		bigint: bigint({ mode: 'bigint' }).notNull(),
		boolean: boolean().notNull(),
		timestamp: timestamp().notNull(),
		int: int().notNull(),
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
		int: z.coerce.number().int().gte(CONSTANTS.INT32_MIN).lte(CONSTANTS.INT32_MAX),
		text: z.coerce.string().max(CONSTANTS.INT16_UNSIGNED_MAX),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('type coercion - mixed', (t) => {
	const table = mysqlTable('test', ({
		timestamp,
		int,
	}) => ({
		timestamp: timestamp().notNull(),
		int: int().notNull(),
	}));

	const { createSelectSchema } = createSchemaFactory({
		coerce: {
			date: true,
		},
	});
	const result = createSelectSchema(table);
	const expected = z.object({
		timestamp: z.coerce.date(),
		int: z.int().gte(CONSTANTS.INT32_MIN).lte(CONSTANTS.INT32_MAX),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

/* Infinitely recursive type */ {
	const TopLevelCondition: z.ZodType<TopLevelCondition> = z.custom<TopLevelCondition>().superRefine(() => {});
	const table = mysqlTable('test', {
		json: json().$type<TopLevelCondition>(),
	});
	const result = createSelectSchema(table);
	const expected = z.object({
		json: z.nullable(TopLevelCondition),
	});
	Expect<Equal<z.infer<typeof result>, z.infer<typeof expected>>>();
}

/* Disallow unknown keys in table refinement - select */ {
	const table = mysqlTable('test', { id: int() });
	// @ts-expect-error
	createSelectSchema(table, { unknown: z.string() });
}

/* Disallow unknown keys in table refinement - insert */ {
	const table = mysqlTable('test', { id: int() });
	// @ts-expect-error
	createInsertSchema(table, { unknown: z.string() });
}

/* Disallow unknown keys in table refinement - update */ {
	const table = mysqlTable('test', { id: int() });
	// @ts-expect-error
	createUpdateSchema(table, { unknown: z.string() });
}

/* Disallow unknown keys in view qb - select */ {
	const table = mysqlTable('test', { id: int() });
	const view = mysqlView('test').as((qb) => qb.select().from(table));
	const nestedSelect = mysqlView('test').as((qb) => qb.select({ table }).from(table));
	// @ts-expect-error
	createSelectSchema(view, { unknown: z.string() });
	// @ts-expect-error
	createSelectSchema(nestedSelect, { table: { unknown: z.string() } });
}

/* Disallow unknown keys in view columns - select */ {
	const view = mysqlView('test', { id: int() }).as(sql``);
	// @ts-expect-error
	createSelectSchema(view, { unknown: z.string() });
}
