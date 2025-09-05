import { type Type, type } from 'arktype';
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
import { bigintNarrow, jsonSchema } from '~/column.ts';
import { CONSTANTS } from '~/constants.ts';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from '../src';
import { Expect, expectEnumValues, expectSchemaShape } from './utils.ts';

const int4Schema = type.keywords.number.integer.atLeast(CONSTANTS.INT32_MIN).atMost(CONSTANTS.INT32_MAX);
const int4NullableSchema = int4Schema.or(type.null);
const int4OptionalSchema = int4Schema.optional();
const int4NullableOptionalSchema = int4Schema.or(type.null).optional();

const textSchema = type.string;
const textOptionalSchema = textSchema.optional();

const anySchema = type('unknown.any');

const extendedSchema = int4Schema.atMost(1000);
const extendedNullableSchema = extendedSchema.or(type.null);
const extendedOptionalSchema = extendedSchema.optional();

const customSchema = type.string.pipe(Number);

test('table - select', (t) => {
	const table = cockroachTable('test', {
		id: int4().primaryKey(),
		generated: int4().generatedAlwaysAsIdentity(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = type({ id: int4Schema, generated: int4Schema, name: textSchema });
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
	const expected = type({ id: int4Schema, name: textSchema });
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
	const expected = type({ name: textSchema, age: int4NullableOptionalSchema });
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
	const expected = type({
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
	const expected = type({ id: int4Schema, age: anySchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view columns - select', (t) => {
	const view = cockroachView('test', {
		id: int4().primaryKey(),
		name: text().notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = type({ id: int4Schema, name: textSchema });
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
	const expected = type({ id: int4Schema, age: anySchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('materialized view columns - select', (t) => {
	const view = cockroachMaterializedView('test', {
		id: int4().primaryKey(),
		name: text().notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = type({ id: int4Schema, name: textSchema });
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
	const expected = type({
		id: int4Schema,
		nested: type({ name: textSchema, age: anySchema }),
		table: type({ id: int4Schema, name: textSchema }),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('enum - select', (t) => {
	const enum_ = cockroachEnum('test', ['a', 'b', 'c']);

	const result = createSelectSchema(enum_);
	const expected = type.enumerated('a', 'b', 'c');
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
	const expected = type({
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
	const expected = type({
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
	const expected = type({
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
		c2: (schema) => schema.atMost(1000),
		c3: type.string.pipe(Number),
	});
	const expected = type({
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

	const customTextSchema = type.string.atLeastLength(1).atMostLength(100);
	const result = createSelectSchema(table, {
		c2: (schema) => schema.atMost(1000),
		c3: type.string.pipe(Number),
		c4: customTextSchema,
	});
	const expected = type({
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
		c2: (schema) => schema.atMost(1000),
		c3: type.string.pipe(Number),
	});
	const expected = type({
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
		c2: (schema) => schema.atMost(1000),
		c3: type.string.pipe(Number),
	});
	const expected = type({
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
		c2: (schema) => schema.atMost(1000),
		c3: type.string.pipe(Number),
		nested: {
			c5: (schema) => schema.atMost(1000),
			c6: type.string.pipe(Number),
		},
		table: {
			c2: (schema) => schema.atMost(1000),
			c3: type.string.pipe(Number),
		},
	});
	const expected = type({
		c1: int4NullableSchema,
		c2: extendedNullableSchema,
		c3: customSchema,
		nested: type({
			c4: int4NullableSchema,
			c5: extendedNullableSchema,
			c6: customSchema,
		}),
		table: type({
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
		boolean: bool().notNull(),
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
	const expected = type({
		bigint1: type.keywords.number.integer.atLeast(Number.MIN_SAFE_INTEGER).atMost(Number.MAX_SAFE_INTEGER),
		bigint2: type.bigint.narrow(bigintNarrow),
		bit: type(/^[01]{5}$/).describe('a string containing ones or zeros while being 5 characters long'),
		boolean: type.boolean,
		char1: type.string.atMostLength(10),
		char2: type.enumerated('a', 'b', 'c'),
		date1: type.Date,
		date2: type.string,
		decimal1: type.number.atLeast(Number.MIN_SAFE_INTEGER).atMost(Number.MAX_SAFE_INTEGER),
		decimal2: type.bigint.narrow(bigintNarrow),
		decimal3: type.string,
		float: type.number.atLeast(CONSTANTS.INT48_MIN).atMost(CONSTANTS.INT48_MAX),
		doublePrecision: type.number.atLeast(CONSTANTS.INT48_MIN).atMost(CONSTANTS.INT48_MAX),
		geometry1: type([type.number, type.number]),
		geometry2: type({ x: type.number, y: type.number }),
		inet: type.string,
		int2: type.keywords.number.integer.atLeast(CONSTANTS.INT16_MIN).atMost(CONSTANTS.INT16_MAX),
		int4: type.keywords.number.integer.atLeast(CONSTANTS.INT32_MIN).atMost(CONSTANTS.INT32_MAX),
		int8_1: type.keywords.number.integer.atLeast(Number.MIN_SAFE_INTEGER).atMost(Number.MAX_SAFE_INTEGER),
		int8_2: type.bigint.narrow(bigintNarrow),
		interval: type.string,
		jsonb: jsonSchema,
		numeric1: type.number.atLeast(Number.MIN_SAFE_INTEGER).atMost(Number.MAX_SAFE_INTEGER),
		numeric2: type.bigint.narrow(bigintNarrow),
		numeric3: type.string,
		real: type.number.atLeast(CONSTANTS.INT24_MIN).atMost(CONSTANTS.INT24_MAX),
		smallint: type.keywords.number.integer.atLeast(CONSTANTS.INT16_MIN).atMost(CONSTANTS.INT16_MAX),
		string1: type.string,
		string2: type.enumerated('a', 'b', 'c'),
		text1: type.string,
		text2: type.enumerated('a', 'b', 'c'),
		time: type.string,
		timestamp1: type.Date,
		timestamp2: type.string,
		uuid: type(/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/iu).describe('a RFC-4122-compliant UUID'),
		varchar1: type.string.atMostLength(10),
		varchar2: type.enumerated('a', 'b', 'c'),
		vector: type.number.array().exactlyLength(3),
		array: int4Schema.array(),
	});

	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

/* Infinitely recursive type */ {
	const TopLevelCondition: Type<TopLevelCondition, {}> = type('unknown.any') as any;
	const table = cockroachTable('test', {
		jsonb: jsonb().$type<TopLevelCondition>(),
	});
	const result = createSelectSchema(table);
	const expected = type({
		jsonb: TopLevelCondition.or(type.null),
	});
	Expect<Equal<type.infer<typeof result>, type.infer<typeof expected>>>();
}

/* Disallow unknown keys in table refinement - select */ {
	const table = cockroachTable('test', { id: int4() });
	// @ts-expect-error
	createSelectSchema(table, { unknown: type.string });
}

/* Disallow unknown keys in table refinement - insert */ {
	const table = cockroachTable('test', { id: int4() });
	// @ts-expect-error
	createInsertSchema(table, { unknown: type.string });
}

/* Disallow unknown keys in table refinement - update */ {
	const table = cockroachTable('test', { id: int4() });
	// @ts-expect-error
	createUpdateSchema(table, { unknown: type.string });
}

/* Disallow unknown keys in view qb - select */ {
	const table = cockroachTable('test', { id: int4() });
	const view = cockroachView('test').as((qb) => qb.select().from(table));
	const mView = cockroachMaterializedView('test').as((qb) => qb.select().from(table));
	const nestedSelect = cockroachView('test').as((qb) => qb.select({ table }).from(table));
	// @ts-expect-error
	createSelectSchema(view, { unknown: type.string });
	// @ts-expect-error
	createSelectSchema(mView, { unknown: type.string });
	// @ts-expect-error
	createSelectSchema(nestedSelect, { table: { unknown: type.string } });
}

/* Disallow unknown keys in view columns - select */ {
	const view = cockroachView('test', { id: int4() }).as(sql``);
	const mView = cockroachView('test', { id: int4() }).as(sql``);
	// @ts-expect-error
	createSelectSchema(view, { unknown: type.string });
	// @ts-expect-error
	createSelectSchema(mView, { unknown: type.string });
}
