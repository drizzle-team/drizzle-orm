import vine from '@vinejs/vine';
import { sql } from 'drizzle-orm';
import { customType, int, mysqlSchema, mysqlTable, mysqlView, serial, text } from 'drizzle-orm/mysql-core';
import { test } from 'vitest';
import { CONSTANTS } from '~/constants.ts';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from '../src';
import { expectSchemaShape } from './utils.ts';

const intSchema = vine.number().min(CONSTANTS.INT32_MIN).max(CONSTANTS.INT32_MAX).withoutDecimals();
const serialNumberModeSchema = vine.number().min(0).max(Number.MAX_SAFE_INTEGER).withoutDecimals();
const textSchema = vine.string().maxLength(CONSTANTS.INT16_UNSIGNED_MAX);

test('table - select', (t) => {
	const table = mysqlTable('test', {
		id: serial().primaryKey(),
		generated: int().generatedAlwaysAs(1).notNull(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = vine.object({ id: serialNumberModeSchema, generated: intSchema, name: textSchema });
	expectSchemaShape(t, expected).from(result);
});

test('table in schema - select', (t) => {
	const schema = mysqlSchema('test');
	const table = schema.table('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = vine.object({ id: serialNumberModeSchema, name: textSchema });
	expectSchemaShape(t, expected).from(result);
});

test('table - insert', (t) => {
	const table = mysqlTable('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
		age: int(),
	});

	const result = createInsertSchema(table);
	const expected = vine.object({
		id: serialNumberModeSchema.clone().optional(),
		name: textSchema,
		age: intSchema.clone().nullable().optional(),
	});
	expectSchemaShape(t, expected).from(result);
});

test('table - update', (t) => {
	const table = mysqlTable('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
		age: int(),
	});

	const result = createUpdateSchema(table);
	const expected = vine.object({
		id: serialNumberModeSchema.clone().optional(),
		name: textSchema.clone().optional(),
		age: intSchema.clone().nullable().optional(),
	});
	expectSchemaShape(t, expected).from(result);
});

test('view qb - select', (t) => {
	const table = mysqlTable('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	});
	const view = mysqlView('test').as((qb) => qb.select({ id: table.id, age: sql``.as('age') }).from(table));

	const result = createSelectSchema(view);
	const expected = vine.object({ id: serialNumberModeSchema, age: vine.any() });
	expectSchemaShape(t, expected).from(result);
});

test('view columns - select', (t) => {
	const view = mysqlView('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = vine.object({ id: serialNumberModeSchema, name: textSchema });
	expectSchemaShape(t, expected).from(result);
});

test('view with nested fields - select', (t) => {
	const table = mysqlTable('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	});
	const view = mysqlView('test').as((qb) =>
		qb.select({
			id: table.id,
			nested: { name: table.name, age: sql``.as('age') },
			table,
		}).from(table)
	);

	const result = createSelectSchema(view);
	const expected = vine.object({
		id: serialNumberModeSchema,
		nested: vine.object({ name: textSchema, age: vine.any() }),
		table: vine.object({ id: serialNumberModeSchema, name: textSchema }),
	});
	expectSchemaShape(t, expected).from(result);
});

test('nullability - select', (t) => {
	const table = mysqlTable('test', {
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
	const table = mysqlTable('test', {
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
	const table = mysqlTable('test', {
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
	const table = mysqlTable('test', {
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
	const table = mysqlTable('test', {
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
	const table = mysqlTable('test', {
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
	const table = mysqlTable('test', {
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
	const table = mysqlTable('test', ({
		bigint,
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
		year,
		longtext,
		mediumtext,
		tinytext,
	}) => ({
		bigint1: bigint({ mode: 'number' }).notNull(),
		bigint2: bigint({ mode: 'bigint' }).notNull(),
		bigint3: bigint({ unsigned: true, mode: 'number' }).notNull(),
		bigint4: bigint({ unsigned: true, mode: 'bigint' }).notNull(),
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
		year: year().notNull(),
		longtext1: longtext().notNull(),
		longtext2: longtext({ enum: ['a', 'b', 'c'] }).notNull(),
		mediumtext1: mediumtext().notNull(),
		mediumtext2: mediumtext({ enum: ['a', 'b', 'c'] }).notNull(),
		tinytext1: tinytext().notNull(),
		tinytext2: tinytext({ enum: ['a', 'b', 'c'] }).notNull(),
	}));

	const result = createSelectSchema(table);
	const expected = vine.object({
		bigint1: vine.number().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).withoutDecimals(),
		bigint2: vine.any(), // bigint not supported
		bigint3: vine.number().min(0).max(Number.MAX_SAFE_INTEGER).withoutDecimals(),
		bigint4: vine.any(), // bigint not supported
		boolean: vine.boolean(),
		char1: vine.string().fixedLength(10),
		char2: vine.enum(['a', 'b', 'c'] as const),
		date1: vine.date(),
		date2: vine.string(),
		datetime1: vine.date(),
		datetime2: vine.string(),
		decimal1: vine.string(),
		decimal2: vine.string(),
		double1: vine.number().min(CONSTANTS.INT48_MIN).max(CONSTANTS.INT48_MAX),
		double2: vine.number().min(0).max(CONSTANTS.INT48_UNSIGNED_MAX),
		float1: vine.number().min(CONSTANTS.INT24_MIN).max(CONSTANTS.INT24_MAX),
		float2: vine.number().min(0).max(CONSTANTS.INT24_UNSIGNED_MAX),
		int1: vine.number().min(CONSTANTS.INT32_MIN).max(CONSTANTS.INT32_MAX).withoutDecimals(),
		int2: vine.number().min(0).max(CONSTANTS.INT32_UNSIGNED_MAX).withoutDecimals(),
		json: vine.any(),
		mediumint1: vine.number().min(CONSTANTS.INT24_MIN).max(CONSTANTS.INT24_MAX).withoutDecimals(),
		mediumint2: vine.number().min(0).max(CONSTANTS.INT24_UNSIGNED_MAX).withoutDecimals(),
		enum: vine.enum(['a', 'b', 'c'] as const),
		real: vine.number().min(CONSTANTS.INT48_MIN).max(CONSTANTS.INT48_MAX),
		serial: vine.number().min(0).max(Number.MAX_SAFE_INTEGER).withoutDecimals(),
		smallint1: vine.number().min(CONSTANTS.INT16_MIN).max(CONSTANTS.INT16_MAX).withoutDecimals(),
		smallint2: vine.number().min(0).max(CONSTANTS.INT16_UNSIGNED_MAX).withoutDecimals(),
		text1: vine.string().maxLength(CONSTANTS.INT16_UNSIGNED_MAX),
		text2: vine.enum(['a', 'b', 'c'] as const),
		time: vine.string(),
		timestamp1: vine.date(),
		timestamp2: vine.string(),
		tinyint1: vine.number().min(CONSTANTS.INT8_MIN).max(CONSTANTS.INT8_MAX).withoutDecimals(),
		tinyint2: vine.number().min(0).max(CONSTANTS.INT8_UNSIGNED_MAX).withoutDecimals(),
		varchar1: vine.string().maxLength(10),
		varchar2: vine.enum(['a', 'b', 'c'] as const),
		year: vine.number().min(1901).max(2155).withoutDecimals(),
		longtext1: vine.string().maxLength(CONSTANTS.INT32_UNSIGNED_MAX),
		longtext2: vine.enum(['a', 'b', 'c'] as const),
		mediumtext1: vine.string().maxLength(CONSTANTS.INT24_UNSIGNED_MAX),
		mediumtext2: vine.enum(['a', 'b', 'c'] as const),
		tinytext1: vine.string().maxLength(CONSTANTS.INT8_UNSIGNED_MAX),
		tinytext2: vine.enum(['a', 'b', 'c'] as const),
	});
	expectSchemaShape(t, expected).from(result);
});

/* Disallow unknown keys in table refinement - select */ {
	const table = mysqlTable('test', { id: int() });
	// @ts-expect-error
	createSelectSchema(table, { unknown: vine.string() });
}

/* Disallow unknown keys in table refinement - insert */ {
	const table = mysqlTable('test', { id: int() });
	// @ts-expect-error
	createInsertSchema(table, { unknown: vine.string() });
}

/* Disallow unknown keys in table refinement - update */ {
	const table = mysqlTable('test', { id: int() });
	// @ts-expect-error
	createUpdateSchema(table, { unknown: vine.string() });
}

/* Disallow unknown keys in view qb - select */ {
	const table = mysqlTable('test', { id: int() });
	const view = mysqlView('test').as((qb) => qb.select().from(table));
	const nestedSelect = mysqlView('test').as((qb) => qb.select({ table }).from(table));
	// @ts-expect-error
	createSelectSchema(view, { unknown: vine.string() });
	// @ts-expect-error
	createSelectSchema(nestedSelect, { table: { unknown: vine.string() } });
}

/* Disallow unknown keys in view columns - select */ {
	const view = mysqlView('test', { id: int() }).as(sql``);
	// @ts-expect-error
	createSelectSchema(view, { unknown: vine.string() });
}
