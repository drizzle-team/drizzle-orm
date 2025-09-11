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
import * as v from 'valibot';
import { test } from 'vitest';
import { jsonSchema } from '~/column.ts';
import { CONSTANTS } from '~/constants.ts';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from '../src';
import { Expect, expectEnumValues, expectSchemaShape } from './utils.ts';

const int4Schema = v.pipe(v.number(), v.minValue(CONSTANTS.INT32_MIN), v.maxValue(CONSTANTS.INT32_MAX), v.integer());
const int4NullableSchema = v.nullable(int4Schema);
const int4OptionalSchema = v.optional(int4Schema);
const int4NullableOptionalSchema = v.optional(v.nullable(int4Schema));

const textSchema = v.string();
const textOptionalSchema = v.optional(textSchema);

const anySchema = v.any();

const extendedSchema = v.pipe(int4Schema, v.maxValue(1000));
const extendedNullableSchema = v.nullable(extendedSchema);
const extendedOptionalSchema = v.optional(extendedSchema);

const customSchema = v.pipe(v.string(), v.transform(Number));

test('table - select', (t) => {
	const table = cockroachTable('test', {
		id: int4().primaryKey(),
		generated: int4().generatedAlwaysAsIdentity(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = v.object({ id: int4Schema, generated: int4Schema, name: textSchema });
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
	const expected = v.object({ id: int4Schema, name: textSchema });
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
	const expected = v.object({ name: textSchema, age: int4NullableOptionalSchema });
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
	const expected = v.object({
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
	const expected = v.object({ id: int4Schema, age: anySchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view columns - select', (t) => {
	const view = cockroachView('test', {
		id: int4().primaryKey(),
		name: text().notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = v.object({ id: int4Schema, name: textSchema });
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
	const expected = v.object({ id: int4Schema, age: anySchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('materialized view columns - select', (t) => {
	const view = cockroachMaterializedView('test', {
		id: int4().primaryKey(),
		name: text().notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = v.object({ id: int4Schema, name: textSchema });
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
	const expected = v.object({
		id: int4Schema,
		nested: v.object({ name: textSchema, age: anySchema }),
		table: v.object({ id: int4Schema, name: textSchema }),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('enum - select', (t) => {
	const enum_ = cockroachEnum('test', ['a', 'b', 'c']);

	const result = createSelectSchema(enum_);
	const expected = v.enum({ a: 'a', b: 'b', c: 'c' });
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
	const expected = v.object({
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
	const expected = v.object({
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
	const expected = v.object({
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
		c2: (schema) => v.pipe(schema, v.maxValue(1000)),
		c3: v.pipe(v.string(), v.transform(Number)),
	});
	const expected = v.object({
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

	const customTextSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(100));
	const result = createSelectSchema(table, {
		c2: (schema) => v.pipe(schema, v.maxValue(1000)),
		c3: v.pipe(v.string(), v.transform(Number)),
		c4: customTextSchema,
	});
	const expected = v.object({
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
		c2: (schema) => v.pipe(schema, v.maxValue(1000)),
		c3: v.pipe(v.string(), v.transform(Number)),
	});
	const expected = v.object({
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
		c2: (schema) => v.pipe(schema, v.maxValue(1000)),
		c3: v.pipe(v.string(), v.transform(Number)),
	});
	const expected = v.object({
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
		c1: int4NullableSchema,
		c2: extendedNullableSchema,
		c3: customSchema,
		nested: v.object({
			c4: int4NullableSchema,
			c5: extendedNullableSchema,
			c6: customSchema,
		}),
		table: v.object({
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
	const expected = v.object({
		bigint1: v.pipe(v.number(), v.minValue(Number.MIN_SAFE_INTEGER), v.maxValue(Number.MAX_SAFE_INTEGER), v.integer()),
		bigint2: v.pipe(v.bigint(), v.minValue(CONSTANTS.INT64_MIN), v.maxValue(CONSTANTS.INT64_MAX)),
		bit: v.pipe(v.string(), v.regex(/^[01]*$/), v.length(5 as number)),
		boolean: v.boolean(),
		char1: v.pipe(v.string(), v.maxLength(10 as number)),
		char2: v.enum({ a: 'a', b: 'b', c: 'c' }),
		date1: v.date(),
		date2: v.string(),
		decimal1: v.pipe(v.number(), v.minValue(Number.MIN_SAFE_INTEGER), v.maxValue(Number.MAX_SAFE_INTEGER)),
		decimal2: v.pipe(v.bigint(), v.minValue(CONSTANTS.INT64_MIN), v.maxValue(CONSTANTS.INT64_MAX)),
		decimal3: v.string(),
		float: v.pipe(v.number(), v.minValue(CONSTANTS.INT48_MIN), v.maxValue(CONSTANTS.INT48_MAX)),
		doublePrecision: v.pipe(v.number(), v.minValue(CONSTANTS.INT48_MIN), v.maxValue(CONSTANTS.INT48_MAX)),
		geometry1: v.tuple([v.number(), v.number()]),
		geometry2: v.object({ x: v.number(), y: v.number() }),
		inet: v.string(),
		int2: v.pipe(v.number(), v.minValue(CONSTANTS.INT16_MIN), v.maxValue(CONSTANTS.INT16_MAX), v.integer()),
		int4: v.pipe(v.number(), v.minValue(CONSTANTS.INT32_MIN), v.maxValue(CONSTANTS.INT32_MAX), v.integer()),
		int8_1: v.pipe(v.number(), v.minValue(Number.MIN_SAFE_INTEGER), v.maxValue(Number.MAX_SAFE_INTEGER), v.integer()),
		int8_2: v.pipe(v.bigint(), v.minValue(CONSTANTS.INT64_MIN), v.maxValue(CONSTANTS.INT64_MAX)),
		interval: v.string(),
		jsonb: jsonSchema,
		numeric1: v.pipe(v.number(), v.minValue(Number.MIN_SAFE_INTEGER), v.maxValue(Number.MAX_SAFE_INTEGER)),
		numeric2: v.pipe(v.bigint(), v.minValue(CONSTANTS.INT64_MIN), v.maxValue(CONSTANTS.INT64_MAX)),
		numeric3: v.string(),
		real: v.pipe(v.number(), v.minValue(CONSTANTS.INT24_MIN), v.maxValue(CONSTANTS.INT24_MAX)),
		smallint: v.pipe(v.number(), v.minValue(CONSTANTS.INT16_MIN), v.maxValue(CONSTANTS.INT16_MAX), v.integer()),
		string1: v.string(),
		string2: v.enum({ a: 'a', b: 'b', c: 'c' }),
		text1: v.string(),
		text2: v.enum({ a: 'a', b: 'b', c: 'c' }),
		time: v.string(),
		timestamp1: v.date(),
		timestamp2: v.string(),
		uuid: v.pipe(v.string(), v.uuid()),
		varchar1: v.pipe(v.string(), v.maxLength(10 as number)),
		varchar2: v.enum({ a: 'a', b: 'b', c: 'c' }),
		vector: v.pipe(v.array(v.number()), v.length(3 as number)),
		array: v.array(int4Schema),
	});

	// @ts-ignore - TODO: Remake type checks for new columns
	expectSchemaShape(t, expected).from(result);
	// @ts-ignore - TODO: Remake type checks for new columns
	Expect<Equal<typeof result, typeof expected>>();
});

/* Infinitely recursive type */ {
	const TopLevelCondition: v.GenericSchema<TopLevelCondition> = v.custom<TopLevelCondition>(() => true);
	const table = cockroachTable('test', {
		jsonb: jsonb().$type<TopLevelCondition>(),
	});
	const result = createSelectSchema(table);
	const expected = v.object({
		jsonb: v.nullable(TopLevelCondition),
	});
	Expect<Equal<v.InferOutput<typeof result>, v.InferOutput<typeof expected>>>();
}

/* Disallow unknown keys in table refinement - select */ {
	const table = cockroachTable('test', { id: int4() });
	// @ts-expect-error
	createSelectSchema(table, { unknown: v.string() });
}

/* Disallow unknown keys in table refinement - insert */ {
	const table = cockroachTable('test', { id: int4() });
	// @ts-expect-error
	createInsertSchema(table, { unknown: v.string() });
}

/* Disallow unknown keys in table refinement - update */ {
	const table = cockroachTable('test', { id: int4() });
	// @ts-expect-error
	createUpdateSchema(table, { unknown: v.string() });
}

/* Disallow unknown keys in view qb - select */ {
	const table = cockroachTable('test', { id: int4() });
	const view = cockroachView('test').as((qb) => qb.select().from(table));
	const mView = cockroachMaterializedView('test').as((qb) => qb.select().from(table));
	const nestedSelect = cockroachView('test').as((qb) => qb.select({ table }).from(table));
	// @ts-expect-error
	createSelectSchema(view, { unknown: v.string() });
	// @ts-expect-error
	createSelectSchema(mView, { unknown: v.string() });
	// @ts-expect-error
	createSelectSchema(nestedSelect, { table: { unknown: v.string() } });
}

/* Disallow unknown keys in view columns - select */ {
	const view = cockroachView('test', { id: int4() }).as(sql``);
	const mView = cockroachView('test', { id: int4() }).as(sql``);
	// @ts-expect-error
	createSelectSchema(view, { unknown: v.string() });
	// @ts-expect-error
	createSelectSchema(mView, { unknown: v.string() });
}
