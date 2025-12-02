import { type Static, Type as t } from '@sinclair/typebox';
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
import { jsonSchema } from '~/column.ts';
import { CONSTANTS } from '~/constants.ts';
import { createInsertSchema, createSelectSchema, createUpdateSchema, type GenericSchema } from '../src';
import { Expect, expectEnumValues, expectSchemaShape } from './utils.ts';

const int4Schema = t.Integer({
	minimum: CONSTANTS.INT32_MIN,
	maximum: CONSTANTS.INT32_MAX,
});
const int4NullableSchema = t.Union([int4Schema, t.Null()]);
const int4OptionalSchema = t.Optional(int4Schema);
const int4NullableOptionalSchema = t.Optional(t.Union([int4Schema, t.Null()]));

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
	const table = cockroachTable('test', {
		id: int4().primaryKey(),
		generated: int4().generatedAlwaysAsIdentity(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = t.Object({ id: int4Schema, generated: int4Schema, name: textSchema });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table in schema - select', (tc) => {
	const schema = cockroachSchema('test');
	const table = schema.table('test', {
		id: int4().primaryKey(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = t.Object({ id: int4Schema, name: textSchema });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table - insert', (tc) => {
	const table = cockroachTable('test', {
		id: int4().generatedAlwaysAsIdentity().primaryKey(),
		name: text().notNull(),
		age: int4(),
	});

	const result = createInsertSchema(table);
	const expected = t.Object({ name: textSchema, age: int4NullableOptionalSchema });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table - update', (tc) => {
	const table = cockroachTable('test', {
		id: int4().generatedAlwaysAsIdentity().primaryKey(),
		name: text().notNull(),
		age: int4(),
	});

	const result = createUpdateSchema(table);
	const expected = t.Object({
		name: textOptionalSchema,
		age: int4NullableOptionalSchema,
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view qb - select', (tc) => {
	const table = cockroachTable('test', {
		id: int4().primaryKey(),
		name: text().notNull(),
	});
	const view = cockroachView('test').as((qb) => qb.select({ id: table.id, age: sql``.as('age') }).from(table));

	const result = createSelectSchema(view);
	const expected = t.Object({ id: int4Schema, age: anySchema });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view columns - select', (tc) => {
	const view = cockroachView('test', {
		id: int4().primaryKey(),
		name: text().notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = t.Object({ id: int4Schema, name: textSchema });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('materialized view qb - select', (tc) => {
	const table = cockroachTable('test', {
		id: int4().primaryKey(),
		name: text().notNull(),
	});
	const view = cockroachMaterializedView('test').as((qb) =>
		qb.select({ id: table.id, age: sql``.as('age') }).from(table)
	);

	const result = createSelectSchema(view);
	const expected = t.Object({ id: int4Schema, age: anySchema });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('materialized view columns - select', (tc) => {
	const view = cockroachMaterializedView('test', {
		id: int4().primaryKey(),
		name: text().notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = t.Object({ id: int4Schema, name: textSchema });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view with nested fields - select', (tc) => {
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
	const expected = t.Object({
		id: int4Schema,
		nested: t.Object({ name: textSchema, age: anySchema }),
		table: t.Object({ id: int4Schema, name: textSchema }),
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('enum - select', (tc) => {
	const enum_ = cockroachEnum('test', ['a', 'b', 'c']);

	const result = createSelectSchema(enum_);
	const expected = t.Enum({ a: 'a', b: 'b', c: 'c' });
	expectEnumValues(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('nullability - select', (tc) => {
	const table = cockroachTable('test', {
		c1: int4(),
		c2: int4().notNull(),
		c3: int4().default(1),
		c4: int4().notNull().default(1),
	});

	const result = createSelectSchema(table);
	const expected = t.Object({
		c1: int4NullableSchema,
		c2: int4Schema,
		c3: int4NullableSchema,
		c4: int4Schema,
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('nullability - insert', (tc) => {
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
	const expected = t.Object({
		c1: int4NullableOptionalSchema,
		c2: int4Schema,
		c3: int4NullableOptionalSchema,
		c4: int4OptionalSchema,
		c7: int4OptionalSchema,
	});
	expectSchemaShape(tc, expected).from(result);
});

test('nullability - update', (tc) => {
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
	const expected = t.Object({
		c1: int4NullableOptionalSchema,
		c2: int4OptionalSchema,
		c3: int4NullableOptionalSchema,
		c4: int4OptionalSchema,
		c7: int4OptionalSchema,
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - select', (tc) => {
	const table = cockroachTable('test', {
		c1: int4(),
		c2: int4().notNull(),
		c3: int4().notNull(),
	});

	const result = createSelectSchema(table, {
		c2: (schema) => t.Integer({ minimum: schema.minimum, maximum: 1000 }),
		c3: t.Integer({ minimum: 1, maximum: 10 }),
	});
	const expected = t.Object({
		c1: int4NullableSchema,
		c2: extendedSchema,
		c3: customSchema,
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - select with custom data type', (tc) => {
	const customText = customType({ dataType: () => 'text' });
	const table = cockroachTable('test', {
		c1: int4(),
		c2: int4().notNull(),
		c3: int4().notNull(),
		c4: customText(),
	});

	const customTextSchema = t.String({ minLength: 1, maxLength: 100 });
	const result = createSelectSchema(table, {
		c2: (schema) => t.Integer({ minimum: schema.minimum, maximum: 1000 }),
		c3: t.Integer({ minimum: 1, maximum: 10 }),
		c4: customTextSchema,
	});
	const expected = t.Object({
		c1: int4NullableSchema,
		c2: extendedSchema,
		c3: customSchema,
		c4: customTextSchema,
	});

	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - insert', (tc) => {
	const table = cockroachTable('test', {
		c1: int4(),
		c2: int4().notNull(),
		c3: int4().notNull(),
		c4: int4().generatedAlwaysAs(1),
	});

	const result = createInsertSchema(table, {
		c2: (schema) => t.Integer({ minimum: schema.minimum, maximum: 1000 }),
		c3: t.Integer({ minimum: 1, maximum: 10 }),
	});
	const expected = t.Object({
		c1: int4NullableOptionalSchema,
		c2: extendedSchema,
		c3: customSchema,
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - update', (tc) => {
	const table = cockroachTable('test', {
		c1: int4(),
		c2: int4().notNull(),
		c3: int4().notNull(),
		c4: int4().generatedAlwaysAs(1),
	});

	const result = createUpdateSchema(table, {
		c2: (schema) => t.Integer({ minimum: schema.minimum, maximum: 1000 }),
		c3: t.Integer({ minimum: 1, maximum: 10 }),
	});
	const expected = t.Object({
		c1: int4NullableOptionalSchema,
		c2: extendedOptionalSchema,
		c3: customSchema,
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine view - select', (tc) => {
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
		c1: int4NullableSchema,
		c2: extendedNullableSchema,
		c3: customSchema,
		nested: t.Object({
			c4: int4NullableSchema,
			c5: extendedNullableSchema,
			c6: customSchema,
		}),
		table: t.Object({
			c1: int4NullableSchema,
			c2: extendedNullableSchema,
			c3: customSchema,
			c4: int4NullableSchema,
			c5: int4NullableSchema,
			c6: int4NullableSchema,
		}),
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('all data types', (tc) => {
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
	const expected = t.Object({
		bigint1: t.Integer({ minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER }),
		bigint2: t.BigInt({ minimum: CONSTANTS.INT64_MIN, maximum: CONSTANTS.INT64_MAX }),
		bit: t.RegExp(/^[01]*$/, { minLength: 5, maxLength: 5 }),
		boolean: t.Boolean(),
		char1: t.String({ maxLength: 10 }),
		char2: t.Enum({ a: 'a', b: 'b', c: 'c' }),
		date1: t.Date(),
		date2: t.String(),
		decimal1: t.Number({ minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER }),
		decimal2: t.BigInt({ minimum: CONSTANTS.INT64_MIN, maximum: CONSTANTS.INT64_MAX }),
		decimal3: t.String(),
		float: t.Number({ minimum: CONSTANTS.INT48_MIN, maximum: CONSTANTS.INT48_MAX }),
		doublePrecision: t.Number({ minimum: CONSTANTS.INT48_MIN, maximum: CONSTANTS.INT48_MAX }),
		geometry1: t.Tuple([t.Number(), t.Number()]),
		geometry2: t.Object({ x: t.Number(), y: t.Number() }),
		inet: t.String(),
		int2: t.Integer({ minimum: CONSTANTS.INT16_MIN, maximum: CONSTANTS.INT16_MAX }),
		int4: t.Integer({ minimum: CONSTANTS.INT32_MIN, maximum: CONSTANTS.INT32_MAX }),
		int8_1: t.Integer({ minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER }),
		int8_2: t.BigInt({ minimum: CONSTANTS.INT64_MIN, maximum: CONSTANTS.INT64_MAX }),
		interval: t.String(),
		jsonb: jsonSchema,
		numeric1: t.Number({ minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER }),
		numeric2: t.BigInt({ minimum: CONSTANTS.INT64_MIN, maximum: CONSTANTS.INT64_MAX }),
		numeric3: t.String(),
		real: t.Number({ minimum: CONSTANTS.INT24_MIN, maximum: CONSTANTS.INT24_MAX }),
		smallint: t.Integer({ minimum: CONSTANTS.INT16_MIN, maximum: CONSTANTS.INT16_MAX }),
		string1: t.String(),
		string2: t.Enum({ a: 'a', b: 'b', c: 'c' }),
		text1: t.String(),
		text2: t.Enum({ a: 'a', b: 'b', c: 'c' }),
		time: t.String(),
		timestamp1: t.Date(),
		timestamp2: t.String(),
		uuid: t.String({ format: 'uuid' }),
		varchar1: t.String({ maxLength: 10 }),
		varchar2: t.Enum({ a: 'a', b: 'b', c: 'c' }),
		vector: t.Array(t.Number(), { minItems: 3, maxItems: 3 }),
		array: t.Array(int4Schema),
	});

	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

/* Infinitely recursive type */ {
	const TopLevelCondition: GenericSchema<TopLevelCondition> = t.Any() as any;
	const table = cockroachTable('test', {
		jsonb: jsonb().$type<TopLevelCondition>(),
	});
	const result = createSelectSchema(table);
	const expected = t.Object({
		jsonb: t.Union([TopLevelCondition, t.Null()]),
	});
	Expect<Equal<Static<typeof result>, Static<typeof expected>>>();
}

/* Disallow unknown keys in table refinement - select */ {
	const table = cockroachTable('test', { id: int4() });
	// @ts-expect-error
	createSelectSchema(table, { unknown: t.String() });
}

/* Disallow unknown keys in table refinement - insert */ {
	const table = cockroachTable('test', { id: int4() });
	// @ts-expect-error
	createInsertSchema(table, { unknown: t.String() });
}

/* Disallow unknown keys in table refinement - update */ {
	const table = cockroachTable('test', { id: int4() });
	// @ts-expect-error
	createUpdateSchema(table, { unknown: t.String() });
}

/* Disallow unknown keys in view qb - select */ {
	const table = cockroachTable('test', { id: int4() });
	const view = cockroachView('test').as((qb) => qb.select().from(table));
	const mView = cockroachMaterializedView('test').as((qb) => qb.select().from(table));
	const nestedSelect = cockroachView('test').as((qb) => qb.select({ table }).from(table));
	// @ts-expect-error
	createSelectSchema(view, { unknown: t.String() });
	// @ts-expect-error
	createSelectSchema(mView, { unknown: t.String() });
	// @ts-expect-error
	createSelectSchema(nestedSelect, { table: { unknown: t.String() } });
}

/* Disallow unknown keys in view columns - select */ {
	const view = cockroachView('test', { id: int4() }).as(sql``);
	const mView = cockroachView('test', { id: int4() }).as(sql``);
	// @ts-expect-error
	createSelectSchema(view, { unknown: t.String() });
	// @ts-expect-error
	createSelectSchema(mView, { unknown: t.String() });
}
