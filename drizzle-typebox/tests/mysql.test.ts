import { type Static, Type as t } from '@sinclair/typebox';
import { type Equal, sql } from 'drizzle-orm';
import { customType, int, json, mysqlSchema, mysqlTable, mysqlView, serial, text } from 'drizzle-orm/mysql-core';
import type { TopLevelCondition } from 'json-rules-engine';
import { test } from 'vitest';
import { jsonSchema } from '~/column.ts';
import { CONSTANTS } from '~/constants.ts';
import { createInsertSchema, createSelectSchema, createUpdateSchema, type GenericSchema } from '../src';
import { Expect, expectSchemaShape } from './utils.ts';

const intSchema = t.Integer({
	minimum: CONSTANTS.INT32_MIN,
	maximum: CONSTANTS.INT32_MAX,
});
const serialNumberModeSchema = t.Integer({
	minimum: 0,
	maximum: Number.MAX_SAFE_INTEGER,
});
const textSchema = t.String({ maxLength: CONSTANTS.INT16_UNSIGNED_MAX });

test('table - select', (tc) => {
	const table = mysqlTable('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = t.Object({ id: serialNumberModeSchema, name: textSchema });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table in schema - select', (tc) => {
	const schema = mysqlSchema('test');
	const table = schema.table('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = t.Object({ id: serialNumberModeSchema, name: textSchema });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table - insert', (tc) => {
	const table = mysqlTable('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
		age: int(),
	});

	const result = createInsertSchema(table);
	const expected = t.Object({
		id: t.Optional(serialNumberModeSchema),
		name: textSchema,
		age: t.Optional(t.Union([intSchema, t.Null()])),
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table - update', (tc) => {
	const table = mysqlTable('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
		age: int(),
	});

	const result = createUpdateSchema(table);
	const expected = t.Object({
		id: t.Optional(serialNumberModeSchema),
		name: t.Optional(textSchema),
		age: t.Optional(t.Union([intSchema, t.Null()])),
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view qb - select', (tc) => {
	const table = mysqlTable('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	});
	const view = mysqlView('test').as((qb) => qb.select({ id: table.id, age: sql``.as('age') }).from(table));

	const result = createSelectSchema(view);
	const expected = t.Object({ id: serialNumberModeSchema, age: t.Any() });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view columns - select', (tc) => {
	const view = mysqlView('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = t.Object({ id: serialNumberModeSchema, name: textSchema });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view with nested fields - select', (tc) => {
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
	const expected = t.Object({
		id: serialNumberModeSchema,
		nested: t.Object({ name: textSchema, age: t.Any() }),
		table: t.Object({ id: serialNumberModeSchema, name: textSchema }),
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('nullability - select', (tc) => {
	const table = mysqlTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().default(1),
		c4: int().notNull().default(1),
	});

	const result = createSelectSchema(table);
	const expected = t.Object({
		c1: t.Union([intSchema, t.Null()]),
		c2: intSchema,
		c3: t.Union([intSchema, t.Null()]),
		c4: intSchema,
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('nullability - insert', (tc) => {
	const table = mysqlTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().default(1),
		c4: int().notNull().default(1),
		c5: int().generatedAlwaysAs(1),
	});

	const result = createInsertSchema(table);
	const expected = t.Object({
		c1: t.Optional(t.Union([intSchema, t.Null()])),
		c2: intSchema,
		c3: t.Optional(t.Union([intSchema, t.Null()])),
		c4: t.Optional(intSchema),
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('nullability - update', (tc) => {
	const table = mysqlTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().default(1),
		c4: int().notNull().default(1),
		c5: int().generatedAlwaysAs(1),
	});

	const result = createUpdateSchema(table);
	const expected = t.Object({
		c1: t.Optional(t.Union([intSchema, t.Null()])),
		c2: t.Optional(intSchema),
		c3: t.Optional(t.Union([intSchema, t.Null()])),
		c4: t.Optional(intSchema),
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - select', (tc) => {
	const table = mysqlTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().notNull(),
	});

	const result = createSelectSchema(table, {
		c2: (schema) => t.Integer({ minimum: schema.minimum, maximum: 1000 }),
		c3: t.Integer({ minimum: 1, maximum: 10 }),
	});
	const expected = t.Object({
		c1: t.Union([intSchema, t.Null()]),
		c2: t.Integer({ minimum: CONSTANTS.INT32_MIN, maximum: 1000 }),
		c3: t.Integer({ minimum: 1, maximum: 10 }),
	});

	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - select with custom data type', (tc) => {
	const customText = customType({ dataType: () => 'text' });
	const table = mysqlTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().notNull(),
		c4: customText(),
	});

	const customTextSchema = t.String({ minLength: 1, maxLength: 100 });
	const result = createSelectSchema(table, {
		c2: (schema) => t.Integer({ minimum: schema.minimum, maximum: 1000 }),
		c3: t.Integer({ minimum: 1, maximum: 10 }),
		c4: customTextSchema,
	});
	const expected = t.Object({
		c1: t.Union([intSchema, t.Null()]),
		c2: t.Integer({ minimum: CONSTANTS.INT32_MIN, maximum: 1000 }),
		c3: t.Integer({ minimum: 1, maximum: 10 }),
		c4: customTextSchema,
	});

	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - insert', (tc) => {
	const table = mysqlTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().notNull(),
		c4: int().generatedAlwaysAs(1),
	});

	const result = createInsertSchema(table, {
		c2: (schema) => t.Integer({ minimum: schema.minimum, maximum: 1000 }),
		c3: t.Integer({ minimum: 1, maximum: 10 }),
	});
	const expected = t.Object({
		c1: t.Optional(t.Union([intSchema, t.Null()])),
		c2: t.Integer({ minimum: CONSTANTS.INT32_MIN, maximum: 1000 }),
		c3: t.Integer({ minimum: 1, maximum: 10 }),
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - update', (tc) => {
	const table = mysqlTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().notNull(),
		c4: int().generatedAlwaysAs(1),
	});

	const result = createUpdateSchema(table, {
		c2: (schema) => t.Integer({ minimum: schema.minimum, maximum: 1000 }),
		c3: t.Integer({ minimum: 1, maximum: 10 }),
	});
	const expected = t.Object({
		c1: t.Optional(t.Union([intSchema, t.Null()])),
		c2: t.Optional(t.Integer({ minimum: CONSTANTS.INT32_MIN, maximum: 1000 })),
		c3: t.Integer({ minimum: 1, maximum: 10 }),
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine view - select', (tc) => {
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
		c2: (schema) => t.Integer({ minimum: schema.minimum, maximum: 1000 }),
		c3: t.Integer({ minimum: 1, maximum: 10 }),
		nested: {
			c5: (schema) => t.Integer({ minimum: schema.minimum, maximum: 1000 }),
			c6: t.Integer({ minimum: 1, maximum: 10 }),
		},
		table: {
			c2: (schema) => t.Integer({ minimum: schema.minimum, maximum: 1000 }),
			c3: t.Integer({ minimum: 1, maximum: 10 }),
		},
	});
	const expected = t.Object({
		c1: t.Union([intSchema, t.Null()]),
		c2: t.Union([t.Integer({ minimum: CONSTANTS.INT32_MIN, maximum: 1000 }), t.Null()]),
		c3: t.Integer({ minimum: 1, maximum: 10 }),
		nested: t.Object({
			c4: t.Union([intSchema, t.Null()]),
			c5: t.Union([t.Integer({ minimum: CONSTANTS.INT32_MIN, maximum: 1000 }), t.Null()]),
			c6: t.Integer({ minimum: 1, maximum: 10 }),
		}),
		table: t.Object({
			c1: t.Union([intSchema, t.Null()]),
			c2: t.Union([t.Integer({ minimum: CONSTANTS.INT32_MIN, maximum: 1000 }), t.Null()]),
			c3: t.Integer({ minimum: 1, maximum: 10 }),
			c4: t.Union([intSchema, t.Null()]),
			c5: t.Union([intSchema, t.Null()]),
			c6: t.Union([intSchema, t.Null()]),
		}),
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('all data types', (tc) => {
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
	const expected = t.Object({
		bigint1: t.Integer({ minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER }),
		bigint2: t.BigInt({ minimum: CONSTANTS.INT64_MIN, maximum: CONSTANTS.INT64_MAX }),
		bigint3: t.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
		bigint4: t.BigInt({ minimum: 0n, maximum: CONSTANTS.INT64_UNSIGNED_MAX }),
		binary: t.String(),
		boolean: t.Boolean(),
		char1: t.String({ minLength: 10, maxLength: 10 }),
		char2: t.Enum({ a: 'a', b: 'b', c: 'c' }),
		date1: t.Date(),
		date2: t.String(),
		datetime1: t.Date(),
		datetime2: t.String(),
		decimal1: t.String(),
		decimal2: t.String(),
		double1: t.Number({ minimum: CONSTANTS.INT48_MIN, maximum: CONSTANTS.INT48_MAX }),
		double2: t.Number({ minimum: 0, maximum: CONSTANTS.INT48_UNSIGNED_MAX }),
		float1: t.Number({ minimum: CONSTANTS.INT24_MIN, maximum: CONSTANTS.INT24_MAX }),
		float2: t.Number({ minimum: 0, maximum: CONSTANTS.INT24_UNSIGNED_MAX }),
		int1: t.Integer({ minimum: CONSTANTS.INT32_MIN, maximum: CONSTANTS.INT32_MAX }),
		int2: t.Integer({ minimum: 0, maximum: CONSTANTS.INT32_UNSIGNED_MAX }),
		json: jsonSchema,
		mediumint1: t.Integer({ minimum: CONSTANTS.INT24_MIN, maximum: CONSTANTS.INT24_MAX }),
		mediumint2: t.Integer({ minimum: 0, maximum: CONSTANTS.INT24_UNSIGNED_MAX }),
		enum: t.Enum({ a: 'a', b: 'b', c: 'c' }),
		real: t.Number({ minimum: CONSTANTS.INT48_MIN, maximum: CONSTANTS.INT48_MAX }),
		serial: t.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
		smallint1: t.Integer({ minimum: CONSTANTS.INT16_MIN, maximum: CONSTANTS.INT16_MAX }),
		smallint2: t.Integer({ minimum: 0, maximum: CONSTANTS.INT16_UNSIGNED_MAX }),
		text1: t.String({ maxLength: CONSTANTS.INT16_UNSIGNED_MAX }),
		text2: t.Enum({ a: 'a', b: 'b', c: 'c' }),
		time: t.String(),
		timestamp1: t.Date(),
		timestamp2: t.String(),
		tinyint1: t.Integer({ minimum: CONSTANTS.INT8_MIN, maximum: CONSTANTS.INT8_MAX }),
		tinyint2: t.Integer({ minimum: 0, maximum: CONSTANTS.INT8_UNSIGNED_MAX }),
		varchar1: t.String({ maxLength: 10 }),
		varchar2: t.Enum({ a: 'a', b: 'b', c: 'c' }),
		varbinary: t.String(),
		year: t.Integer({ minimum: 1901, maximum: 2155 }),
		longtext1: t.String({ maxLength: CONSTANTS.INT32_UNSIGNED_MAX }),
		longtext2: t.Enum({ a: 'a', b: 'b', c: 'c' }),
		mediumtext1: t.String({ maxLength: CONSTANTS.INT24_UNSIGNED_MAX }),
		mediumtext2: t.Enum({ a: 'a', b: 'b', c: 'c' }),
		tinytext1: t.String({ maxLength: CONSTANTS.INT8_UNSIGNED_MAX }),
		tinytext2: t.Enum({ a: 'a', b: 'b', c: 'c' }),
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

/* Infinitely recursive type */ {
	const TopLevelCondition: GenericSchema<TopLevelCondition> = t.Any() as any;
	const table = mysqlTable('test', {
		json: json().$type<TopLevelCondition>(),
	});
	const result = createSelectSchema(table);
	const expected = t.Object({
		json: t.Union([TopLevelCondition, t.Null()]),
	});
	Expect<Equal<Static<typeof result>, Static<typeof expected>>>();
}

/* Disallow unknown keys in table refinement - select */ {
	const table = mysqlTable('test', { id: int() });
	// @ts-expect-error
	createSelectSchema(table, { unknown: t.String() });
}

/* Disallow unknown keys in table refinement - insert */ {
	const table = mysqlTable('test', { id: int() });
	// @ts-expect-error
	createInsertSchema(table, { unknown: t.String() });
}

/* Disallow unknown keys in table refinement - update */ {
	const table = mysqlTable('test', { id: int() });
	// @ts-expect-error
	createUpdateSchema(table, { unknown: t.String() });
}

/* Disallow unknown keys in view qb - select */ {
	const table = mysqlTable('test', { id: int() });
	const view = mysqlView('test').as((qb) => qb.select().from(table));
	const nestedSelect = mysqlView('test').as((qb) => qb.select({ table }).from(table));
	// @ts-expect-error
	createSelectSchema(view, { unknown: t.String() });
	// @ts-expect-error
	createSelectSchema(nestedSelect, { table: { unknown: t.String() } });
}

/* Disallow unknown keys in view columns - select */ {
	const view = mysqlView('test', { id: int() }).as(sql``);
	// @ts-expect-error
	createSelectSchema(view, { unknown: t.String() });
}
