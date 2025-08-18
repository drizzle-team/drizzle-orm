import { type Equal, sql } from 'drizzle-orm';
import { customType, int, json, mysqlSchema, mysqlTable, mysqlView, serial, text } from 'drizzle-orm/mysql-core';
import type { TopLevelCondition } from 'json-rules-engine';
import * as v from 'valibot';
import { test } from 'vitest';
import { jsonSchema } from '~/column.ts';
import { CONSTANTS } from '~/constants.ts';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from '../src';
import { Expect, expectSchemaShape } from './utils.ts';

const intSchema = v.pipe(
	v.number(),
	v.minValue(CONSTANTS.INT32_MIN as number),
	v.maxValue(CONSTANTS.INT32_MAX as number),
	v.integer(),
);
const serialNumberModeSchema = v.pipe(
	v.number(),
	v.minValue(0 as number),
	v.maxValue(Number.MAX_SAFE_INTEGER as number),
	v.integer(),
);
const textSchema = v.pipe(v.string(), v.maxLength(CONSTANTS.INT16_UNSIGNED_MAX as number));

test('table - select', (t) => {
	const table = mysqlTable('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = v.object({ id: serialNumberModeSchema, name: textSchema });
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
	const expected = v.object({ id: serialNumberModeSchema, name: textSchema });
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
	const expected = v.object({
		id: v.optional(serialNumberModeSchema),
		name: textSchema,
		age: v.optional(v.nullable(intSchema)),
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
	const expected = v.object({
		id: v.optional(serialNumberModeSchema),
		name: v.optional(textSchema),
		age: v.optional(v.nullable(intSchema)),
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
	const expected = v.object({ id: serialNumberModeSchema, age: v.any() });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view columns - select', (t) => {
	const view = mysqlView('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = v.object({ id: serialNumberModeSchema, name: textSchema });
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
	const expected = v.object({
		id: serialNumberModeSchema,
		nested: v.object({ name: textSchema, age: v.any() }),
		table: v.object({ id: serialNumberModeSchema, name: textSchema }),
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
	const expected = v.object({
		c1: v.nullable(intSchema),
		c2: intSchema,
		c3: v.nullable(intSchema),
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
	const expected = v.object({
		c1: v.optional(v.nullable(intSchema)),
		c2: intSchema,
		c3: v.optional(v.nullable(intSchema)),
		c4: v.optional(intSchema),
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
	const expected = v.object({
		c1: v.optional(v.nullable(intSchema)),
		c2: v.optional(intSchema),
		c3: v.optional(v.nullable(intSchema)),
		c4: v.optional(intSchema),
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
		c2: (schema) => v.pipe(schema, v.maxValue(1000)),
		c3: v.pipe(v.string(), v.transform(Number)),
	});
	const expected = v.object({
		c1: v.nullable(intSchema),
		c2: v.pipe(intSchema, v.maxValue(1000)),
		c3: v.pipe(v.string(), v.transform(Number)),
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

	const customTextSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(100));
	const result = createSelectSchema(table, {
		c2: (schema) => v.pipe(schema, v.maxValue(1000)),
		c3: v.pipe(v.string(), v.transform(Number)),
		c4: customTextSchema,
	});
	const expected = v.object({
		c1: v.nullable(intSchema),
		c2: v.pipe(intSchema, v.maxValue(1000)),
		c3: v.pipe(v.string(), v.transform(Number)),
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
		c2: (schema) => v.pipe(schema, v.maxValue(1000)),
		c3: v.pipe(v.string(), v.transform(Number)),
	});
	const expected = v.object({
		c1: v.optional(v.nullable(intSchema)),
		c2: v.pipe(intSchema, v.maxValue(1000)),
		c3: v.pipe(v.string(), v.transform(Number)),
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
		c2: (schema) => v.pipe(schema, v.maxValue(1000)),
		c3: v.pipe(v.string(), v.transform(Number)),
	});
	const expected = v.object({
		c1: v.optional(v.nullable(intSchema)),
		c2: v.optional(v.pipe(intSchema, v.maxValue(1000))),
		c3: v.pipe(v.string(), v.transform(Number)),
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
		c2: (schema) => v.pipe(schema, v.maxValue(1000)),
		c3: v.pipe(v.string(), v.transform(Number)),
		nested: {
			c5: (schema) => v.pipe(schema, v.maxValue(1000)),
			c6: v.pipe(v.string(), v.transform(Number)),
		},
		table: {
			c2: (schema) => v.pipe(schema, v.maxValue(1000)),
			c3: v.pipe(v.string(), v.transform(Number)),
		},
	});
	const expected = v.object({
		c1: v.nullable(intSchema),
		c2: v.nullable(v.pipe(intSchema, v.maxValue(1000))),
		c3: v.pipe(v.string(), v.transform(Number)),
		nested: v.object({
			c4: v.nullable(intSchema),
			c5: v.nullable(v.pipe(intSchema, v.maxValue(1000))),
			c6: v.pipe(v.string(), v.transform(Number)),
		}),
		table: v.object({
			c1: v.nullable(intSchema),
			c2: v.nullable(v.pipe(intSchema, v.maxValue(1000))),
			c3: v.pipe(v.string(), v.transform(Number)),
			c4: v.nullable(intSchema),
			c5: v.nullable(intSchema),
			c6: v.nullable(intSchema),
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
		binary: binary({ length: 10 }).notNull(),
		boolean: boolean().notNull(),
		char1: char({ length: 10 }).notNull(),
		char2: char({ length: 1, enum: ['a', 'b', 'c'] }).notNull(),
		date1: date({ mode: 'date' }).notNull(),
		date2: date({ mode: 'string' }).notNull(),
		datetime1: datetime({ mode: 'date' }).notNull(),
		datetime2: datetime({ mode: 'string' }).notNull(),
		decimal1: decimal().notNull(),
		decimal2: decimal({ unsigned: true }).notNull(),
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
	const expected = v.object({
		bigint1: v.pipe(v.number(), v.minValue(Number.MIN_SAFE_INTEGER), v.maxValue(Number.MAX_SAFE_INTEGER), v.integer()),
		bigint2: v.pipe(v.bigint(), v.minValue(CONSTANTS.INT64_MIN), v.maxValue(CONSTANTS.INT64_MAX)),
		bigint3: v.pipe(v.number(), v.minValue(0 as number), v.maxValue(Number.MAX_SAFE_INTEGER), v.integer()),
		bigint4: v.pipe(v.bigint(), v.minValue(0n as bigint), v.maxValue(CONSTANTS.INT64_UNSIGNED_MAX)),
		binary: v.string(),
		boolean: v.boolean(),
		char1: v.pipe(v.string(), v.length(10 as number)),
		char2: v.enum({ a: 'a', b: 'b', c: 'c' }),
		date1: v.date(),
		date2: v.string(),
		datetime1: v.date(),
		datetime2: v.string(),
		decimal1: v.string(),
		decimal2: v.string(),
		double1: v.pipe(v.number(), v.minValue(CONSTANTS.INT48_MIN), v.maxValue(CONSTANTS.INT48_MAX)),
		double2: v.pipe(v.number(), v.minValue(0 as number), v.maxValue(CONSTANTS.INT48_UNSIGNED_MAX)),
		float1: v.pipe(v.number(), v.minValue(CONSTANTS.INT24_MIN), v.maxValue(CONSTANTS.INT24_MAX)),
		float2: v.pipe(v.number(), v.minValue(0 as number), v.maxValue(CONSTANTS.INT24_UNSIGNED_MAX)),
		int1: v.pipe(v.number(), v.minValue(CONSTANTS.INT32_MIN), v.maxValue(CONSTANTS.INT32_MAX), v.integer()),
		int2: v.pipe(v.number(), v.minValue(0 as number), v.maxValue(CONSTANTS.INT32_UNSIGNED_MAX), v.integer()),
		json: jsonSchema,
		mediumint1: v.pipe(v.number(), v.minValue(CONSTANTS.INT24_MIN), v.maxValue(CONSTANTS.INT24_MAX), v.integer()),
		mediumint2: v.pipe(v.number(), v.minValue(0 as number), v.maxValue(CONSTANTS.INT24_UNSIGNED_MAX), v.integer()),
		enum: v.enum({ a: 'a', b: 'b', c: 'c' }),
		real: v.pipe(v.number(), v.minValue(CONSTANTS.INT48_MIN), v.maxValue(CONSTANTS.INT48_MAX)),
		serial: v.pipe(v.number(), v.minValue(0 as number), v.maxValue(Number.MAX_SAFE_INTEGER), v.integer()),
		smallint1: v.pipe(v.number(), v.minValue(CONSTANTS.INT16_MIN), v.maxValue(CONSTANTS.INT16_MAX), v.integer()),
		smallint2: v.pipe(v.number(), v.minValue(0 as number), v.maxValue(CONSTANTS.INT16_UNSIGNED_MAX), v.integer()),
		text1: v.pipe(v.string(), v.maxLength(CONSTANTS.INT16_UNSIGNED_MAX)),
		text2: v.enum({ a: 'a', b: 'b', c: 'c' }),
		time: v.string(),
		timestamp1: v.date(),
		timestamp2: v.string(),
		tinyint1: v.pipe(v.number(), v.minValue(CONSTANTS.INT8_MIN), v.maxValue(CONSTANTS.INT8_MAX), v.integer()),
		tinyint2: v.pipe(v.number(), v.minValue(0 as number), v.maxValue(CONSTANTS.INT8_UNSIGNED_MAX), v.integer()),
		varchar1: v.pipe(v.string(), v.maxLength(10 as number)),
		varchar2: v.enum({ a: 'a', b: 'b', c: 'c' }),
		varbinary: v.string(),
		year: v.pipe(v.number(), v.minValue(1901 as number), v.maxValue(2155 as number), v.integer()),
		longtext1: v.pipe(v.string(), v.maxLength(CONSTANTS.INT32_UNSIGNED_MAX)),
		longtext2: v.enum({ a: 'a', b: 'b', c: 'c' }),
		mediumtext1: v.pipe(v.string(), v.maxLength(CONSTANTS.INT24_UNSIGNED_MAX)),
		mediumtext2: v.enum({ a: 'a', b: 'b', c: 'c' }),
		tinytext1: v.pipe(v.string(), v.maxLength(CONSTANTS.INT8_UNSIGNED_MAX)),
		tinytext2: v.enum({ a: 'a', b: 'b', c: 'c' }),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

/* Infinitely recursive type */ {
	const TopLevelCondition: v.GenericSchema<TopLevelCondition> = v.custom<TopLevelCondition>(() => true);
	const table = mysqlTable('test', {
		json: json().$type<TopLevelCondition>(),
	});
	const result = createSelectSchema(table);
	const expected = v.object({
		json: v.nullable(TopLevelCondition),
	});
	Expect<Equal<v.InferOutput<typeof result>, v.InferOutput<typeof expected>>>();
}

/* Disallow unknown keys in table refinement - select */ {
	const table = mysqlTable('test', { id: int() });
	// @ts-expect-error
	createSelectSchema(table, { unknown: v.string() });
}

/* Disallow unknown keys in table refinement - insert */ {
	const table = mysqlTable('test', { id: int() });
	// @ts-expect-error
	createInsertSchema(table, { unknown: v.string() });
}

/* Disallow unknown keys in table refinement - update */ {
	const table = mysqlTable('test', { id: int() });
	// @ts-expect-error
	createUpdateSchema(table, { unknown: v.string() });
}

/* Disallow unknown keys in view qb - select */ {
	const table = mysqlTable('test', { id: int() });
	const view = mysqlView('test').as((qb) => qb.select().from(table));
	const nestedSelect = mysqlView('test').as((qb) => qb.select({ table }).from(table));
	// @ts-expect-error
	createSelectSchema(view, { unknown: v.string() });
	// @ts-expect-error
	createSelectSchema(nestedSelect, { table: { unknown: v.string() } });
}

/* Disallow unknown keys in view columns - select */ {
	const view = mysqlView('test', { id: int() }).as(sql``);
	// @ts-expect-error
	createSelectSchema(view, { unknown: v.string() });
}
