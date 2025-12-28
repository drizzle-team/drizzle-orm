import { Type, type } from 'arktype';
import { type Equal } from 'drizzle-orm';
import { customType, int, json, serial, singlestoreSchema, singlestoreTable, text } from 'drizzle-orm/singlestore-core';
import type { TopLevelCondition } from 'json-rules-engine';
import { test } from 'vitest';
import { bigintNarrow, jsonSchema, unsignedBigintNarrow } from '~/column.ts';
import { CONSTANTS } from '~/constants.ts';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from '../src';
import { Expect, expectSchemaShape } from './utils.ts';

const intSchema = type.keywords.number.integer.atLeast(CONSTANTS.INT32_MIN).atMost(CONSTANTS.INT32_MAX);
const serialNumberModeSchema = type.keywords.number.integer.atLeast(0).atMost(Number.MAX_SAFE_INTEGER);
const textSchema = type.string.atMostLength(CONSTANTS.INT16_UNSIGNED_MAX);

test('table - select', (t) => {
	const table = singlestoreTable('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = type({ id: serialNumberModeSchema, name: textSchema });
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
	const expected = type({ id: serialNumberModeSchema, name: textSchema });
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
	const expected = type({
		id: serialNumberModeSchema.optional(),
		name: textSchema,
		age: intSchema.or(type.null).optional(),
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
	const expected = type({
		id: serialNumberModeSchema.optional(),
		name: textSchema.optional(),
		age: intSchema.or(type.null).optional(),
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
// 	const expected = v.object({ id: serialNumberModeSchema, age: v.any() });
// 	expectSchemaShape(t, expected).from(result);
// 	Expect<Equal<typeof result, typeof expected>>();
// });

// test('view columns - select', (t) => {
// 	const view = mysqlView('test', {
// 		id: serial().primaryKey(),
// 		name: text().notNull(),
// 	}).as(sql``);

// 	const result = createSelectSchema(view);
// 	const expected = v.object({ id: serialNumberModeSchema, name: textSchema });
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
// 	const expected = v.object({
// 		id: serialNumberModeSchema,
// 		nested: v.object({ name: textSchema, age: v.any() }),
// 		table: v.object({ id: serialNumberModeSchema, name: textSchema }),
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
	const expected = type({
		c1: intSchema.or(type.null),
		c2: intSchema,
		c3: intSchema.or(type.null),
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
	const expected = type({
		c1: intSchema.or(type.null).optional(),
		c2: intSchema,
		c3: intSchema.or(type.null).optional(),
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
	const expected = type({
		c1: intSchema.or(type.null).optional(),
		c2: intSchema.optional(),
		c3: intSchema.or(type.null).optional(),
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
		c2: (schema) => schema.atMost(1000),
		c3: type.string.pipe(Number),
	});
	const expected = type({
		c1: intSchema.or(type.null),
		c2: intSchema.atMost(1000),
		c3: type.string.pipe(Number),
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

	const customTextSchema = type.string.atLeastLength(1).atMostLength(100);
	const result = createSelectSchema(table, {
		c2: (schema) => schema.atMost(1000),
		c3: type.string.pipe(Number),
		c4: customTextSchema,
	});
	const expected = type({
		c1: intSchema.or(type.null),
		c2: intSchema.atMost(1000),
		c3: type.string.pipe(Number),
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
		c2: (schema) => schema.atMost(1000),
		c3: type.string.pipe(Number),
	});
	const expected = type({
		c1: intSchema.or(type.null).optional(),
		c2: intSchema.atMost(1000),
		c3: type.string.pipe(Number),
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
		c2: (schema) => schema.atMost(1000),
		c3: type.string.pipe(Number),
	});
	const expected = type({
		c1: intSchema.or(type.null).optional(),
		c2: intSchema.atMost(1000).optional(),
		c3: type.string.pipe(Number),
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
// 		c2: (schema) => v.pipe(schema, v.maxValue(1000)),
// 		c3: v.pipe(type.string, v.transform(Number)),
// 		nested: {
// 			c5: (schema) => v.pipe(schema, v.maxValue(1000)),
// 			c6: v.pipe(type.string, v.transform(Number)),
// 		},
// 		table: {
// 			c2: (schema) => v.pipe(schema, v.maxValue(1000)),
// 			c3: v.pipe(type.string, v.transform(Number)),
// 		},
// 	});
// 	const expected = v.object({
// 		c1: v.nullable(intSchema),
// 		c2: v.nullable(v.pipe(intSchema, v.maxValue(1000))),
// 		c3: v.pipe(type.string, v.transform(Number)),
// 		nested: v.object({
// 			c4: v.nullable(intSchema),
// 			c5: v.nullable(v.pipe(intSchema, v.maxValue(1000))),
// 			c6: v.pipe(type.string, v.transform(Number)),
// 		}),
// 		table: v.object({
// 			c1: v.nullable(intSchema),
// 			c2: v.nullable(v.pipe(intSchema, v.maxValue(1000))),
// 			c3: v.pipe(type.string, v.transform(Number)),
// 			c4: v.nullable(intSchema),
// 			c5: v.nullable(intSchema),
// 			c6: v.nullable(intSchema),
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
	const expected = type({
		bigint1: type.keywords.number.integer.atLeast(Number.MIN_SAFE_INTEGER).atMost(Number.MAX_SAFE_INTEGER),
		bigint2: type.bigint.narrow(bigintNarrow),
		bigint3: type.keywords.number.integer.atLeast(0).atMost(Number.MAX_SAFE_INTEGER),
		bigint4: type.bigint.narrow(unsignedBigintNarrow),
		binary: type.string,
		boolean: type.boolean,
		char1: type.string.exactlyLength(10),
		char2: type.enumerated('a', 'b', 'c'),
		date1: type.Date,
		date2: type.string,
		datetime1: type.Date,
		datetime2: type.string,
		decimal1: type.string,
		decimal2: type.string,
		double1: type.number.atLeast(CONSTANTS.INT48_MIN).atMost(CONSTANTS.INT48_MAX),
		double2: type.number.atLeast(0).atMost(CONSTANTS.INT48_UNSIGNED_MAX),
		float1: type.number.atLeast(CONSTANTS.INT24_MIN).atMost(CONSTANTS.INT24_MAX),
		float2: type.number.atLeast(0).atMost(CONSTANTS.INT24_UNSIGNED_MAX),
		int1: type.keywords.number.integer.atLeast(CONSTANTS.INT32_MIN).atMost(CONSTANTS.INT32_MAX),
		int2: type.keywords.number.integer.atLeast(0).atMost(CONSTANTS.INT32_UNSIGNED_MAX),
		json: jsonSchema,
		mediumint1: type.keywords.number.integer.atLeast(CONSTANTS.INT24_MIN).atMost(CONSTANTS.INT24_MAX),
		mediumint2: type.keywords.number.integer.atLeast(0).atMost(CONSTANTS.INT24_UNSIGNED_MAX),
		enum: type.enumerated('a', 'b', 'c'),
		real: type.number.atLeast(CONSTANTS.INT48_MIN).atMost(CONSTANTS.INT48_MAX),
		serial: type.keywords.number.integer.atLeast(0).atMost(Number.MAX_SAFE_INTEGER),
		smallint1: type.keywords.number.integer.atLeast(CONSTANTS.INT16_MIN).atMost(CONSTANTS.INT16_MAX),
		smallint2: type.keywords.number.integer.atLeast(0).atMost(CONSTANTS.INT16_UNSIGNED_MAX),
		text1: type.string.atMostLength(CONSTANTS.INT16_UNSIGNED_MAX),
		text2: type.enumerated('a', 'b', 'c'),
		time: type.string,
		timestamp1: type.Date,
		timestamp2: type.string,
		tinyint1: type.keywords.number.integer.atLeast(CONSTANTS.INT8_MIN).atMost(CONSTANTS.INT8_MAX),
		tinyint2: type.keywords.number.integer.atLeast(0).atMost(CONSTANTS.INT8_UNSIGNED_MAX),
		varchar1: type.string.atMostLength(10),
		varchar2: type.enumerated('a', 'b', 'c'),
		varbinary: type.string,
		year: type.keywords.number.integer.atLeast(1901).atMost(2155),
		longtext1: type.string.atMostLength(CONSTANTS.INT32_UNSIGNED_MAX),
		longtext2: type.enumerated('a', 'b', 'c'),
		mediumtext1: type.string.atMostLength(CONSTANTS.INT24_UNSIGNED_MAX),
		mediumtext2: type.enumerated('a', 'b', 'c'),
		tinytext1: type.string.atMostLength(CONSTANTS.INT8_UNSIGNED_MAX),
		tinytext2: type.enumerated('a', 'b', 'c'),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

/* Infinitely recursive type */ {
	const TopLevelCondition: Type<TopLevelCondition, {}> = type('unknown.any') as any;
	const table = singlestoreTable('test', {
		json: json().$type<TopLevelCondition>(),
	});
	const result = createSelectSchema(table);
	const expected = type({
		json: TopLevelCondition.or(type.null),
	});
	Expect<Equal<type.infer<typeof result>, type.infer<typeof expected>>>();
}

/* Disallow unknown keys in table refinement - select */ {
	const table = singlestoreTable('test', { id: int() });
	// @ts-expect-error
	createSelectSchema(table, { unknown: type.string });
}

/* Disallow unknown keys in table refinement - insert */ {
	const table = singlestoreTable('test', { id: int() });
	// @ts-expect-error
	createInsertSchema(table, { unknown: type.string });
}

/* Disallow unknown keys in table refinement - update */ {
	const table = singlestoreTable('test', { id: int() });
	// @ts-expect-error
	createUpdateSchema(table, { unknown: type.string });
}

// /* Disallow unknown keys in view qb - select */ {
// 	const table = singlestoreTable('test', { id: int() });
// 	const view = mysqlView('test').as((qb) => qb.select().from(table));
// 	const nestedSelect = mysqlView('test').as((qb) => qb.select({ table }).from(table));
// 	// @ts-expect-error
// 	createSelectSchema(view, { unknown: type.string });
// 	// @ts-expect-error
// 	createSelectSchema(nestedSelect, { table: { unknown: type.string } });
// }

// /* Disallow unknown keys in view columns - select */ {
// 	const view = mysqlView('test', { id: int() }).as(sql``);
// 	// @ts-expect-error
// 	createSelectSchema(view, { unknown: type.string });
// }
