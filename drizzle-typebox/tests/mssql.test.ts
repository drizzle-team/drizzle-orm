import { Type as t } from '@sinclair/typebox';
import { type Equal, sql } from 'drizzle-orm';
import { customType, int, mssqlSchema, mssqlTable, mssqlView, text } from 'drizzle-orm/mssql-core';
import { test } from 'vitest';
import { bigintStringModeSchema, bufferSchema } from '~/column.ts';
import { CONSTANTS } from '~/constants.ts';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from '../src/index.ts';
import { Expect, expectSchemaShape } from './utils.ts';

const integerSchema = t.Integer({
	minimum: CONSTANTS.INT32_MIN,
	maximum: CONSTANTS.INT32_MAX,
});
const integerNullableSchema = t.Union([integerSchema, t.Null()]);
const integerOptionalSchema = t.Optional(integerSchema);
const integerNullableOptionalSchema = t.Optional(t.Union([integerSchema, t.Null()]));

const textSchema = t.String();
const textOptionalSchema = t.Optional(textSchema);

const anySchema = t.Any();

const extendedSchema = t.Integer({
	minimum: CONSTANTS.INT32_MIN,
	maximum: 1000,
});
const extendedNullableSchema = t.Union([extendedSchema, t.Null()]);
const extendedOptionalSchema = t.Optional(extendedSchema);

const customSchema = t.Integer({ minimum: 1, maximum: 10 });

test('table - select', (tc) => {
	const table = mssqlTable('test', {
		id: int().primaryKey(),
		generated: int().identity(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = t.Object({ id: integerSchema, generated: integerSchema, name: textSchema });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table in schema - select', (tc) => {
	const schema = mssqlSchema('test');
	const table = schema.table('test', {
		id: int().primaryKey(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = t.Object({ id: integerSchema, name: textSchema });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table - insert', (tc) => {
	const table = mssqlTable('test', {
		id: int().identity().primaryKey(),
		name: text().notNull(),
		age: int(),
	});

	const result = createInsertSchema(table);
	const expected = t.Object({ name: textSchema, age: integerNullableOptionalSchema });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table - update', (tc) => {
	const table = mssqlTable('test', {
		id: int().identity().primaryKey(),
		name: text().notNull(),
		age: int(),
	});

	const result = createUpdateSchema(table);
	const expected = t.Object({
		name: textOptionalSchema,
		age: integerNullableOptionalSchema,
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view qb - select', (tc) => {
	const table = mssqlTable('test', {
		id: int().primaryKey(),
		name: text().notNull(),
	});
	const view = mssqlView('test').as((qb) => qb.select({ id: table.id, age: sql``.as('age') }).from(table));

	const result = createSelectSchema(view);
	const expected = t.Object({ id: integerSchema, age: anySchema });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view columns - select', (tc) => {
	const view = mssqlView('test', {
		id: int().primaryKey(),
		name: text().notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = t.Object({ id: integerSchema, name: textSchema });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view with nested fields - select', (tc) => {
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
	const expected = t.Object({
		id: integerSchema,
		nested: t.Object({ name: textSchema, age: anySchema }),
		table: t.Object({ id: integerSchema, name: textSchema }),
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('nullability - select', (tc) => {
	const table = mssqlTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().default(1),
		c4: int().notNull().default(1),
	});

	const result = createSelectSchema(table);
	const expected = t.Object({
		c1: integerNullableSchema,
		c2: integerSchema,
		c3: integerNullableSchema,
		c4: integerSchema,
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('nullability - insert', (tc) => {
	const table = mssqlTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().default(1),
		c4: int().notNull().default(1),
		c5: int().generatedAlwaysAs(1),
		c6: int().identity(),
	});

	const result = createInsertSchema(table);
	const expected = t.Object({
		c1: integerNullableOptionalSchema,
		c2: integerSchema,
		c3: integerNullableOptionalSchema,
		c4: integerOptionalSchema,
	});
	expectSchemaShape(tc, expected).from(result);
});

test('nullability - update', (tc) => {
	const table = mssqlTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().default(1),
		c4: int().notNull().default(1),
		c5: int().generatedAlwaysAs(1),
		c6: int().identity(),
	});

	const result = createUpdateSchema(table);
	const expected = t.Object({
		c1: integerNullableOptionalSchema,
		c2: integerOptionalSchema,
		c3: integerNullableOptionalSchema,
		c4: integerOptionalSchema,
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - select', (tc) => {
	const table = mssqlTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().notNull(),
	});

	const result = createSelectSchema(table, {
		c2: (schema) => t.Integer({ minimum: schema.minimum, maximum: 1000 }),
		c3: t.Integer({ minimum: 1, maximum: 10 }),
	});
	const expected = t.Object({
		c1: integerNullableSchema,
		c2: extendedSchema,
		c3: customSchema,
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - select with custom data type', (tc) => {
	const customText = customType({ dataType: () => 'text' });
	const table = mssqlTable('test', {
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
		c1: integerNullableSchema,
		c2: extendedSchema,
		c3: customSchema,
		c4: customTextSchema,
	});

	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - insert', (tc) => {
	const table = mssqlTable('test', {
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
		c1: integerNullableOptionalSchema,
		c2: extendedSchema,
		c3: customSchema,
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - update', (tc) => {
	const table = mssqlTable('test', {
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
		c1: integerNullableOptionalSchema,
		c2: extendedOptionalSchema,
		c3: customSchema,
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine view - select', (tc) => {
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
		c1: integerNullableSchema,
		c2: extendedNullableSchema,
		c3: customSchema,
		nested: t.Object({
			c4: integerNullableSchema,
			c5: extendedNullableSchema,
			c6: customSchema,
		}),
		table: t.Object({
			c1: integerNullableSchema,
			c2: extendedNullableSchema,
			c3: customSchema,
			c4: integerNullableSchema,
			c5: integerNullableSchema,
			c6: integerNullableSchema,
		}),
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('all data types', (tc) => {
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
	const expected = t.Object({
		bigint1: t.Integer({ minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER }),
		bigint2: t.BigInt({ minimum: CONSTANTS.INT64_MIN, maximum: CONSTANTS.INT64_MAX }),
		bigint3: bigintStringModeSchema,
		binary: bufferSchema,
		bit: t.Boolean(),
		char1: t.String({ maxLength: 10 }),
		char2: t.Enum({ a: 'a', b: 'b', c: 'c' }),
		date1: t.Date(),
		date2: t.String(),
		datetime1: t.Date(),
		datetime2: t.String(),
		datetime2_1: t.Date(),
		datetime2_2: t.String(),
		datetimeoffset1: t.Date(),
		datetimeoffset2: t.String(),
		decimal1: t.Number({ minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER }),
		decimal2: t.BigInt({ minimum: CONSTANTS.INT64_MIN, maximum: CONSTANTS.INT64_MAX }),
		decimal3: t.String(),
		float: t.Number({ minimum: CONSTANTS.INT48_MIN, maximum: CONSTANTS.INT48_MAX }),
		int: t.Integer({ minimum: CONSTANTS.INT32_MIN, maximum: CONSTANTS.INT32_MAX }),
		numeric1: t.Number({ minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER }),
		numeric2: t.BigInt({ minimum: CONSTANTS.INT64_MIN, maximum: CONSTANTS.INT64_MAX }),
		numeric3: t.String(),
		real: t.Number({ minimum: CONSTANTS.INT24_MIN, maximum: CONSTANTS.INT24_MAX }),
		smallint: t.Integer({ minimum: CONSTANTS.INT16_MIN, maximum: CONSTANTS.INT16_MAX }),
		text1: t.String(),
		text2: t.Enum({ a: 'a', b: 'b', c: 'c' }),
		time1: t.Date(),
		time2: t.String(),
		tinyint: t.Integer({ minimum: 0, maximum: CONSTANTS.INT8_UNSIGNED_MAX }),
		varbinary: bufferSchema,
		varchar1: t.String({ maxLength: 10 }),
		varchar2: t.Enum({ a: 'a', b: 'b', c: 'c' }),
		ntext1: t.String(),
		ntext2: t.Enum({ a: 'a', b: 'b', c: 'c' }),
		nvarchar1: t.String({ maxLength: 10 }),
		nvarchar2: t.Enum({ a: 'a', b: 'b', c: 'c' }),
	});

	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

// MSSQL doesn't support JSON data type
// /* Infinitely recursive type */ {
// 	const TopLevelCondition: GenericSchema<TopLevelCondition> = t.Any() as any;
// 	const table = mssqlTable('test', {
// 		json: json().$type<TopLevelCondition>(),
// 	});
// 	const result = createSelectSchema(table);
// 	const expected = t.Object({
// 		json: t.Union([TopLevelCondition, t.Null()]),
// 	});
// 	Expect<Equal<Static<typeof result>, Static<typeof expected>>>();
// }

/* Disallow unknown keys in table refinement - select */ {
	const table = mssqlTable('test', { id: int() });
	// @ts-expect-error
	createSelectSchema(table, { unknown: t.String() });
}

/* Disallow unknown keys in table refinement - insert */ {
	const table = mssqlTable('test', { id: int() });
	// @ts-expect-error
	createInsertSchema(table, { unknown: t.String() });
}

/* Disallow unknown keys in table refinement - update */ {
	const table = mssqlTable('test', { id: int() });
	// @ts-expect-error
	createUpdateSchema(table, { unknown: t.String() });
}

/* Disallow unknown keys in view qb - select */ {
	const table = mssqlTable('test', { id: int() });
	const view = mssqlView('test').as((qb) => qb.select().from(table));
	const nestedSelect = mssqlView('test').as((qb) => qb.select({ table }).from(table));
	// @ts-expect-error
	createSelectSchema(view, { unknown: t.String() });
	// @ts-expect-error
	createSelectSchema(nestedSelect, { table: { unknown: t.String() } });
}

/* Disallow unknown keys in view columns - select */ {
	const view = mssqlView('test', { id: int() }).as(sql``);
	const mView = mssqlView('test', { id: int() }).as(sql``);
	// @ts-expect-error
	createSelectSchema(view, { unknown: t.String() });
	// @ts-expect-error
	createSelectSchema(mView, { unknown: t.String() });
}
