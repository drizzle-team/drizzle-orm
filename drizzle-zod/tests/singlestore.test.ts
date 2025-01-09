import { type Equal } from 'drizzle-orm';
import { customType, int, serial, singlestoreSchema, singlestoreTable, text } from 'drizzle-orm/singlestore-core';
import { test } from 'vitest';
import { z } from 'zod';
import { jsonSchema } from '~/column.ts';
import { CONSTANTS } from '~/constants.ts';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from '../src';
import { Expect, expectSchemaShape } from './utils.ts';

const intSchema = z.number().min(CONSTANTS.INT32_MIN).max(CONSTANTS.INT32_MAX).int();
const serialNumberModeSchema = z.number().min(0).max(Number.MAX_SAFE_INTEGER).int();
const textSchema = z.string().max(CONSTANTS.INT16_UNSIGNED_MAX);

test('table - select', (t) => {
	const table = singlestoreTable('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = z.object({ id: serialNumberModeSchema, name: textSchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table in schema - select', (tc) => {
	const schema = singlestoreSchema('test');
	const table = schema.table('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = z.object({ id: serialNumberModeSchema, name: textSchema });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table - insert', (t) => {
	const table = singlestoreTable('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
		age: int(),
	});

	const result = createInsertSchema(table);
	const expected = z.object({
		id: serialNumberModeSchema.optional(),
		name: textSchema,
		age: intSchema.nullable().optional(),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table - update', (t) => {
	const table = singlestoreTable('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
		age: int(),
	});

	const result = createUpdateSchema(table);
	const expected = z.object({
		id: serialNumberModeSchema.optional(),
		name: textSchema.optional(),
		age: intSchema.nullable().optional(),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

// TODO: SingleStore doesn't support views yet. Add these tests when they're added

// test('view qb - select', (t) => {
// 	const table = singlestoreTable('test', {
// 		id: serial().primaryKey(),
// 		name: text().notNull(),
// 	});
// 	const view = mysqlView('test').as((qb) => qb.select({ id: table.id, age: sql``.as('age') }).from(table));

// 	const result = createSelectSchema(view);
// 	const expected = z.object({ id: serialNumberModeSchema, age: z.any() });
// 	expectSchemaShape(t, expected).from(result);
// 	Expect<Equal<typeof result, typeof expected>>();
// });

// test('view columns - select', (t) => {
// 	const view = mysqlView('test', {
// 		id: serial().primaryKey(),
// 		name: text().notNull(),
// 	}).as(sql``);

// 	const result = createSelectSchema(view);
// 	const expected = z.object({ id: serialNumberModeSchema, name: textSchema });
// 	expectSchemaShape(t, expected).from(result);
// 	Expect<Equal<typeof result, typeof expected>>();
// });

// test('view with nested fields - select', (t) => {
// 	const table = singlestoreTable('test', {
// 		id: serial().primaryKey(),
// 		name: text().notNull(),
// 	});
// 	const view = mysqlView('test').as((qb) =>
// 		qb.select({
// 			id: table.id,
// 			nested: {
// 				name: table.name,
// 				age: sql``.as('age'),
// 			},
// 			table,
// 		}).from(table)
// 	);

// 	const result = createSelectSchema(view);
// 	const expected = z.object({
// 		id: serialNumberModeSchema,
// 		nested: z.object({ name: textSchema, age: z.any() }),
// 		table: z.object({ id: serialNumberModeSchema, name: textSchema }),
// 	});
// 	expectSchemaShape(t, expected).from(result);
// 	Expect<Equal<typeof result, typeof expected>>();
// });

test('nullability - select', (t) => {
	const table = singlestoreTable('test', {
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
	const table = singlestoreTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().default(1),
		c4: int().notNull().default(1),
		c5: int().generatedAlwaysAs(1),
	});

	const result = createInsertSchema(table);
	const expected = z.object({
		c1: intSchema.nullable().optional(),
		c2: intSchema,
		c3: intSchema.nullable().optional(),
		c4: intSchema.optional(),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('nullability - update', (t) => {
	const table = singlestoreTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().default(1),
		c4: int().notNull().default(1),
		c5: int().generatedAlwaysAs(1),
	});

	const result = createUpdateSchema(table);
	const expected = z.object({
		c1: intSchema.nullable().optional(),
		c2: intSchema.optional(),
		c3: intSchema.nullable().optional(),
		c4: intSchema.optional(),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - select', (t) => {
	const table = singlestoreTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().notNull(),
	});

	const result = createSelectSchema(table, {
		c2: (schema) => schema.max(1000),
		c3: z.string().transform(Number),
	});
	const expected = z.object({
		c1: intSchema.nullable(),
		c2: intSchema.max(1000),
		c3: z.string().transform(Number),
	});

	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - select with custom data type', (t) => {
	const customText = customType({ dataType: () => 'text' });
	const table = singlestoreTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().notNull(),
		c4: customText(),
	});

	const customTextSchema = z.string().min(1).max(100);
	const result = createSelectSchema(table, {
		c2: (schema) => schema.max(1000),
		c3: z.string().transform(Number),
		c4: customTextSchema,
	});
	const expected = z.object({
		c1: intSchema.nullable(),
		c2: intSchema.max(1000),
		c3: z.string().transform(Number),
		c4: customTextSchema,
	});

	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - insert', (t) => {
	const table = singlestoreTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().notNull(),
		c4: int().generatedAlwaysAs(1),
	});

	const result = createInsertSchema(table, {
		c2: (schema) => schema.max(1000),
		c3: z.string().transform(Number),
	});
	const expected = z.object({
		c1: intSchema.nullable().optional(),
		c2: intSchema.max(1000),
		c3: z.string().transform(Number),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - update', (t) => {
	const table = singlestoreTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().notNull(),
		c4: int().generatedAlwaysAs(1),
	});

	const result = createUpdateSchema(table, {
		c2: (schema) => schema.max(1000),
		c3: z.string().transform(Number),
	});
	const expected = z.object({
		c1: intSchema.nullable().optional(),
		c2: intSchema.max(1000).optional(),
		c3: z.string().transform(Number),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

// test('refine view - select', (t) => {
// 	const table = singlestoreTable('test', {
// 		c1: int(),
// 		c2: int(),
// 		c3: int(),
// 		c4: int(),
// 		c5: int(),
// 		c6: int(),
// 	});
// 	const view = mysqlView('test').as((qb) =>
// 		qb.select({
// 			c1: table.c1,
// 			c2: table.c2,
// 			c3: table.c3,
// 			nested: {
// 				c4: table.c4,
// 				c5: table.c5,
// 				c6: table.c6,
// 			},
// 			table,
// 		}).from(table)
// 	);

// 	const result = createSelectSchema(view, {
// 		c2: (schema) => schema.max(1000),
// 		c3: z.string().transform(Number),
// 		nested: {
// 			c5: (schema) => schema.max(1000),
// 			c6: z.string().transform(Number),
// 		},
// 		table: {
// 			c2: (schema) => schema.max(1000),
// 			c3: z.string().transform(Number),
// 		},
// 	});
// 	const expected = z.object({
// 		c1: intSchema.nullable(),
// 		c2: intSchema.max(1000).nullable(),
// 		c3: z.string().transform(Number),
// 		nested: z.object({
// 			c4: intSchema.nullable(),
// 			c5: intSchema.max(1000).nullable(),
// 			c6: z.string().transform(Number),
// 		}),
// 		table: z.object({
// 			c1: intSchema.nullable(),
// 			c2: intSchema.max(1000).nullable(),
// 			c3: z.string().transform(Number),
// 			c4: intSchema.nullable(),
// 			c5: intSchema.nullable(),
// 			c6: intSchema.nullable(),
// 		}),
// 	});
// 	expectSchemaShape(t, expected).from(result);
// 	Expect<Equal<typeof result, typeof expected>>();
// });

test('all data types', (t) => {
	const table = singlestoreTable('test', ({
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
		singlestoreEnum,
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
		enum: singlestoreEnum('enum', ['a', 'b', 'c']).notNull(),
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
		bigint1: z.number().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).int(),
		bigint2: z.bigint().min(CONSTANTS.INT64_MIN).max(CONSTANTS.INT64_MAX),
		bigint3: z.number().min(0).max(Number.MAX_SAFE_INTEGER).int(),
		bigint4: z.bigint().min(0n).max(CONSTANTS.INT64_UNSIGNED_MAX),
		binary: z.string(),
		boolean: z.boolean(),
		char1: z.string().length(10),
		char2: z.enum(['a', 'b', 'c']),
		date1: z.date(),
		date2: z.string(),
		datetime1: z.date(),
		datetime2: z.string(),
		decimal1: z.string(),
		decimal2: z.string(),
		double1: z.number().min(CONSTANTS.INT48_MIN).max(CONSTANTS.INT48_MAX),
		double2: z.number().min(0).max(CONSTANTS.INT48_UNSIGNED_MAX),
		float1: z.number().min(CONSTANTS.INT24_MIN).max(CONSTANTS.INT24_MAX),
		float2: z.number().min(0).max(CONSTANTS.INT24_UNSIGNED_MAX),
		int1: z.number().min(CONSTANTS.INT32_MIN).max(CONSTANTS.INT32_MAX).int(),
		int2: z.number().min(0).max(CONSTANTS.INT32_UNSIGNED_MAX).int(),
		json: jsonSchema,
		mediumint1: z.number().min(CONSTANTS.INT24_MIN).max(CONSTANTS.INT24_MAX).int(),
		mediumint2: z.number().min(0).max(CONSTANTS.INT24_UNSIGNED_MAX).int(),
		enum: z.enum(['a', 'b', 'c']),
		real: z.number().min(CONSTANTS.INT48_MIN).max(CONSTANTS.INT48_MAX),
		serial: z.number().min(0).max(Number.MAX_SAFE_INTEGER).int(),
		smallint1: z.number().min(CONSTANTS.INT16_MIN).max(CONSTANTS.INT16_MAX).int(),
		smallint2: z.number().min(0).max(CONSTANTS.INT16_UNSIGNED_MAX).int(),
		text1: z.string().max(CONSTANTS.INT16_UNSIGNED_MAX),
		text2: z.enum(['a', 'b', 'c']),
		time: z.string(),
		timestamp1: z.date(),
		timestamp2: z.string(),
		tinyint1: z.number().min(CONSTANTS.INT8_MIN).max(CONSTANTS.INT8_MAX).int(),
		tinyint2: z.number().min(0).max(CONSTANTS.INT8_UNSIGNED_MAX).int(),
		varchar1: z.string().max(10),
		varchar2: z.enum(['a', 'b', 'c']),
		varbinary: z.string(),
		year: z.number().min(1901).max(2155).int(),
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

/* Disallow unknown keys in table refinement - select */ {
	const table = singlestoreTable('test', { id: int() });
	// @ts-expect-error
	createSelectSchema(table, { unknown: z.string() });
}

/* Disallow unknown keys in table refinement - insert */ {
	const table = singlestoreTable('test', { id: int() });
	// @ts-expect-error
	createInsertSchema(table, { unknown: z.string() });
}

/* Disallow unknown keys in table refinement - update */ {
	const table = singlestoreTable('test', { id: int() });
	// @ts-expect-error
	createUpdateSchema(table, { unknown: z.string() });
}

// /* Disallow unknown keys in view qb - select */ {
// 	const table = singlestoreTable('test', { id: int() });
// 	const view = mysqlView('test').as((qb) => qb.select().from(table));
// 	const nestedSelect = mysqlView('test').as((qb) => qb.select({ table }).from(table));
// 	// @ts-expect-error
// 	createSelectSchema(view, { unknown: z.string() });
// 	// @ts-expect-error
// 	createSelectSchema(nestedSelect, { table: { unknown: z.string() } });
// }

// /* Disallow unknown keys in view columns - select */ {
// 	const view = mysqlView('test', { id: int() }).as(sql``);
// 	// @ts-expect-error
// 	createSelectSchema(view, { unknown: z.string() });
// }
