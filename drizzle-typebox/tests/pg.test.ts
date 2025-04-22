import { type Static, Type as t } from '@sinclair/typebox';
import { type Equal, sql } from 'drizzle-orm';
import {
	customType,
	integer,
	json,
	jsonb,
	pgEnum,
	pgMaterializedView,
	pgSchema,
	pgTable,
	pgView,
	serial,
	text,
} from 'drizzle-orm/pg-core';
import type { TopLevelCondition } from 'json-rules-engine';
import { test } from 'vitest';
import { jsonSchema } from '~/column.ts';
import { CONSTANTS } from '~/constants.ts';
import { createInsertSchema, createSelectSchema, createUpdateSchema, type GenericSchema } from '../src';
import { Expect, expectEnumValues, expectSchemaShape } from './utils.ts';

const integerSchema = t.Integer({ minimum: CONSTANTS.INT32_MIN, maximum: CONSTANTS.INT32_MAX });
const textSchema = t.String();

test('table - select', (tc) => {
	const table = pgTable('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = t.Object({ id: integerSchema, name: textSchema });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table in schema - select', (tc) => {
	const schema = pgSchema('test');
	const table = schema.table('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = t.Object({ id: integerSchema, name: textSchema });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table - insert', (tc) => {
	const table = pgTable('test', {
		id: integer().generatedAlwaysAsIdentity().primaryKey(),
		name: text().notNull(),
		age: integer(),
	});

	const result = createInsertSchema(table);
	const expected = t.Object({ name: textSchema, age: t.Optional(t.Union([integerSchema, t.Null()])) });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table - update', (tc) => {
	const table = pgTable('test', {
		id: integer().generatedAlwaysAsIdentity().primaryKey(),
		name: text().notNull(),
		age: integer(),
	});

	const result = createUpdateSchema(table);
	const expected = t.Object({
		name: t.Optional(textSchema),
		age: t.Optional(t.Union([integerSchema, t.Null()])),
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view qb - select', (tc) => {
	const table = pgTable('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	});
	const view = pgView('test').as((qb) => qb.select({ id: table.id, age: sql``.as('age') }).from(table));

	const result = createSelectSchema(view);
	const expected = t.Object({ id: integerSchema, age: t.Any() });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view columns - select', (tc) => {
	const view = pgView('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = t.Object({ id: integerSchema, name: textSchema });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('materialized view qb - select', (tc) => {
	const table = pgTable('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	});
	const view = pgMaterializedView('test').as((qb) => qb.select({ id: table.id, age: sql``.as('age') }).from(table));

	const result = createSelectSchema(view);
	const expected = t.Object({ id: integerSchema, age: t.Any() });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('materialized view columns - select', (tc) => {
	const view = pgView('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = t.Object({ id: integerSchema, name: textSchema });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view with nested fields - select', (tc) => {
	const table = pgTable('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	});
	const view = pgMaterializedView('test').as((qb) =>
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
		nested: t.Object({ name: textSchema, age: t.Any() }),
		table: t.Object({ id: integerSchema, name: textSchema }),
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('enum - select', (tc) => {
	const enum_ = pgEnum('test', ['a', 'b', 'c']);

	const result = createSelectSchema(enum_);
	const expected = t.Enum({ a: 'a', b: 'b', c: 'c' });
	expectEnumValues(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('nullability - select', (tc) => {
	const table = pgTable('test', {
		c1: integer(),
		c2: integer().notNull(),
		c3: integer().default(1),
		c4: integer().notNull().default(1),
	});

	const result = createSelectSchema(table);
	const expected = t.Object({
		c1: t.Union([integerSchema, t.Null()]),
		c2: integerSchema,
		c3: t.Union([integerSchema, t.Null()]),
		c4: integerSchema,
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('nullability - insert', (tc) => {
	const table = pgTable('test', {
		c1: integer(),
		c2: integer().notNull(),
		c3: integer().default(1),
		c4: integer().notNull().default(1),
		c5: integer().generatedAlwaysAs(1),
		c6: integer().generatedAlwaysAsIdentity(),
		c7: integer().generatedByDefaultAsIdentity(),
	});

	const result = createInsertSchema(table);
	const expected = t.Object({
		c1: t.Optional(t.Union([integerSchema, t.Null()])),
		c2: integerSchema,
		c3: t.Optional(t.Union([integerSchema, t.Null()])),
		c4: t.Optional(integerSchema),
		c7: t.Optional(integerSchema),
	});
	expectSchemaShape(tc, expected).from(result);
});

test('nullability - update', (tc) => {
	const table = pgTable('test', {
		c1: integer(),
		c2: integer().notNull(),
		c3: integer().default(1),
		c4: integer().notNull().default(1),
		c5: integer().generatedAlwaysAs(1),
		c6: integer().generatedAlwaysAsIdentity(),
		c7: integer().generatedByDefaultAsIdentity(),
	});

	const result = createUpdateSchema(table);
	const expected = t.Object({
		c1: t.Optional(t.Union([integerSchema, t.Null()])),
		c2: t.Optional(integerSchema),
		c3: t.Optional(t.Union([integerSchema, t.Null()])),
		c4: t.Optional(integerSchema),
		c7: t.Optional(integerSchema),
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - select', (tc) => {
	const table = pgTable('test', {
		c1: integer(),
		c2: integer().notNull(),
		c3: integer().notNull(),
	});

	const result = createSelectSchema(table, {
		c2: (schema) => t.Integer({ minimum: schema.minimum, maximum: 1000 }),
		c3: t.Integer({ minimum: 1, maximum: 10 }),
	});
	const expected = t.Object({
		c1: t.Union([integerSchema, t.Null()]),
		c2: t.Integer({ minimum: CONSTANTS.INT32_MIN, maximum: 1000 }),
		c3: t.Integer({ minimum: 1, maximum: 10 }),
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - select with custom data type', (tc) => {
	const customText = customType({ dataType: () => 'text' });
	const table = pgTable('test', {
		c1: integer(),
		c2: integer().notNull(),
		c3: integer().notNull(),
		c4: customText(),
	});

	const customTextSchema = t.String({ minLength: 1, maxLength: 100 });
	const result = createSelectSchema(table, {
		c2: (schema) => t.Integer({ minimum: schema.minimum, maximum: 1000 }),
		c3: t.Integer({ minimum: 1, maximum: 10 }),
		c4: customTextSchema,
	});
	const expected = t.Object({
		c1: t.Union([integerSchema, t.Null()]),
		c2: t.Integer({ minimum: CONSTANTS.INT32_MIN, maximum: 1000 }),
		c3: t.Integer({ minimum: 1, maximum: 10 }),
		c4: customTextSchema,
	});

	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - insert', (tc) => {
	const table = pgTable('test', {
		c1: integer(),
		c2: integer().notNull(),
		c3: integer().notNull(),
		c4: integer().generatedAlwaysAs(1),
	});

	const result = createInsertSchema(table, {
		c2: (schema) => t.Integer({ minimum: schema.minimum, maximum: 1000 }),
		c3: t.Integer({ minimum: 1, maximum: 10 }),
	});
	const expected = t.Object({
		c1: t.Optional(t.Union([integerSchema, t.Null()])),
		c2: t.Integer({ minimum: CONSTANTS.INT32_MIN, maximum: 1000 }),
		c3: t.Integer({ minimum: 1, maximum: 10 }),
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - update', (tc) => {
	const table = pgTable('test', {
		c1: integer(),
		c2: integer().notNull(),
		c3: integer().notNull(),
		c4: integer().generatedAlwaysAs(1),
	});

	const result = createUpdateSchema(table, {
		c2: (schema) => t.Integer({ minimum: schema.minimum, maximum: 1000 }),
		c3: t.Integer({ minimum: 1, maximum: 10 }),
	});
	const expected = t.Object({
		c1: t.Optional(t.Union([integerSchema, t.Null()])),
		c2: t.Optional(t.Integer({ minimum: CONSTANTS.INT32_MIN, maximum: 1000 })),
		c3: t.Integer({ minimum: 1, maximum: 10 }),
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine view - select', (tc) => {
	const table = pgTable('test', {
		c1: integer(),
		c2: integer(),
		c3: integer(),
		c4: integer(),
		c5: integer(),
		c6: integer(),
	});
	const view = pgView('test').as((qb) =>
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
		c1: t.Union([integerSchema, t.Null()]),
		c2: t.Union([t.Integer({ minimum: CONSTANTS.INT32_MIN, maximum: 1000 }), t.Null()]),
		c3: t.Integer({ minimum: 1, maximum: 10 }),
		nested: t.Object({
			c4: t.Union([integerSchema, t.Null()]),
			c5: t.Union([t.Integer({ minimum: CONSTANTS.INT32_MIN, maximum: 1000 }), t.Null()]),
			c6: t.Integer({ minimum: 1, maximum: 10 }),
		}),
		table: t.Object({
			c1: t.Union([integerSchema, t.Null()]),
			c2: t.Union([t.Integer({ minimum: CONSTANTS.INT32_MIN, maximum: 1000 }), t.Null()]),
			c3: t.Integer({ minimum: 1, maximum: 10 }),
			c4: t.Union([integerSchema, t.Null()]),
			c5: t.Union([integerSchema, t.Null()]),
			c6: t.Union([integerSchema, t.Null()]),
		}),
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('all data types', (tc) => {
	const table = pgTable('test', ({
		bigint,
		bigserial,
		bit,
		boolean,
		date,
		char,
		cidr,
		doublePrecision,
		geometry,
		halfvec,
		inet,
		integer,
		interval,
		json,
		jsonb,
		line,
		macaddr,
		macaddr8,
		numeric,
		point,
		real,
		serial,
		smallint,
		smallserial,
		text,
		sparsevec,
		time,
		timestamp,
		uuid,
		varchar,
		vector,
	}) => ({
		bigint1: bigint({ mode: 'number' }).notNull(),
		bigint2: bigint({ mode: 'bigint' }).notNull(),
		bigserial1: bigserial({ mode: 'number' }).notNull(),
		bigserial2: bigserial({ mode: 'bigint' }).notNull(),
		bit: bit({ dimensions: 5 }).notNull(),
		boolean: boolean().notNull(),
		date1: date({ mode: 'date' }).notNull(),
		date2: date({ mode: 'string' }).notNull(),
		char1: char({ length: 10 }).notNull(),
		char2: char({ length: 1, enum: ['a', 'b', 'c'] }).notNull(),
		cidr: cidr().notNull(),
		doublePrecision: doublePrecision().notNull(),
		geometry1: geometry({ type: 'point', mode: 'tuple' }).notNull(),
		geometry2: geometry({ type: 'point', mode: 'xy' }).notNull(),
		halfvec: halfvec({ dimensions: 3 }).notNull(),
		inet: inet().notNull(),
		integer: integer().notNull(),
		interval: interval().notNull(),
		json: json().notNull(),
		jsonb: jsonb().notNull(),
		line1: line({ mode: 'abc' }).notNull(),
		line2: line({ mode: 'tuple' }).notNull(),
		macaddr: macaddr().notNull(),
		macaddr8: macaddr8().notNull(),
		numeric: numeric().notNull(),
		point1: point({ mode: 'xy' }).notNull(),
		point2: point({ mode: 'tuple' }).notNull(),
		real: real().notNull(),
		serial: serial().notNull(),
		smallint: smallint().notNull(),
		smallserial: smallserial().notNull(),
		text1: text().notNull(),
		text2: text({ enum: ['a', 'b', 'c'] }).notNull(),
		sparsevec: sparsevec({ dimensions: 3 }).notNull(),
		time: time().notNull(),
		timestamp1: timestamp({ mode: 'date' }).notNull(),
		timestamp2: timestamp({ mode: 'string' }).notNull(),
		uuid: uuid().notNull(),
		varchar1: varchar({ length: 10 }).notNull(),
		varchar2: varchar({ length: 1, enum: ['a', 'b', 'c'] }).notNull(),
		vector: vector({ dimensions: 3 }).notNull(),
		array1: integer().array().notNull(),
		array2: integer().array().array(2).notNull(),
		array3: varchar({ length: 10 }).array().array(2).notNull(),
	}));

	const result = createSelectSchema(table);
	const expected = t.Object({
		bigint1: t.Integer({ minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER }),
		bigint2: t.BigInt({ minimum: CONSTANTS.INT64_MIN, maximum: CONSTANTS.INT64_MAX }),
		bigserial1: t.Integer({ minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER }),
		bigserial2: t.BigInt({ minimum: CONSTANTS.INT64_MIN, maximum: CONSTANTS.INT64_MAX }),
		bit: t.RegExp(/^[01]+$/, { maxLength: 5 }),
		boolean: t.Boolean(),
		date1: t.Date(),
		date2: t.String(),
		char1: t.String({ minLength: 10, maxLength: 10 }),
		char2: t.Enum({ a: 'a', b: 'b', c: 'c' }),
		cidr: t.String(),
		doublePrecision: t.Number({ minimum: CONSTANTS.INT48_MIN, maximum: CONSTANTS.INT48_MAX }),
		geometry1: t.Tuple([t.Number(), t.Number()]),
		geometry2: t.Object({ x: t.Number(), y: t.Number() }),
		halfvec: t.Array(t.Number(), { minItems: 3, maxItems: 3 }),
		inet: t.String(),
		integer: t.Integer({ minimum: CONSTANTS.INT32_MIN, maximum: CONSTANTS.INT32_MAX }),
		interval: t.String(),
		json: jsonSchema,
		jsonb: jsonSchema,
		line1: t.Object({ a: t.Number(), b: t.Number(), c: t.Number() }),
		line2: t.Tuple([t.Number(), t.Number(), t.Number()]),
		macaddr: t.String(),
		macaddr8: t.String(),
		numeric: t.String(),
		point1: t.Object({ x: t.Number(), y: t.Number() }),
		point2: t.Tuple([t.Number(), t.Number()]),
		real: t.Number({ minimum: CONSTANTS.INT24_MIN, maximum: CONSTANTS.INT24_MAX }),
		serial: t.Integer({ minimum: CONSTANTS.INT32_MIN, maximum: CONSTANTS.INT32_MAX }),
		smallint: t.Integer({ minimum: CONSTANTS.INT16_MIN, maximum: CONSTANTS.INT16_MAX }),
		smallserial: t.Integer({ minimum: CONSTANTS.INT16_MIN, maximum: CONSTANTS.INT16_MAX }),
		text1: t.String(),
		text2: t.Enum({ a: 'a', b: 'b', c: 'c' }),
		sparsevec: t.String(),
		time: t.String(),
		timestamp1: t.Date(),
		timestamp2: t.String(),
		uuid: t.String({ format: 'uuid' }),
		varchar1: t.String({ maxLength: 10 }),
		varchar2: t.Enum({ a: 'a', b: 'b', c: 'c' }),
		vector: t.Array(t.Number(), { minItems: 3, maxItems: 3 }),
		array1: t.Array(integerSchema),
		array2: t.Array(t.Array(integerSchema), { minItems: 2, maxItems: 2 }),
		array3: t.Array(t.Array(t.String({ maxLength: 10 })), { minItems: 2, maxItems: 2 }),
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

/* Infinitely recursive type */ {
	const TopLevelCondition: GenericSchema<TopLevelCondition> = t.Any() as any;
	const table = pgTable('test', {
		json: json().$type<TopLevelCondition>().notNull(),
		jsonb: jsonb().$type<TopLevelCondition>(),
	});
	const result = createSelectSchema(table);
	const expected = t.Object({
		json: TopLevelCondition,
		jsonb: t.Union([TopLevelCondition, t.Null()]),
	});
	Expect<Equal<Static<typeof result>, Static<typeof expected>>>();
}

/* Disallow unknown keys in table refinement - select */ {
	const table = pgTable('test', { id: integer() });
	// @ts-expect-error
	createSelectSchema(table, { unknown: t.String() });
}

/* Disallow unknown keys in table refinement - insert */ {
	const table = pgTable('test', { id: integer() });
	// @ts-expect-error
	createInsertSchema(table, { unknown: t.String() });
}

/* Disallow unknown keys in table refinement - update */ {
	const table = pgTable('test', { id: integer() });
	// @ts-expect-error
	createUpdateSchema(table, { unknown: t.String() });
}

/* Disallow unknown keys in view qb - select */ {
	const table = pgTable('test', { id: integer() });
	const view = pgView('test').as((qb) => qb.select().from(table));
	const mView = pgMaterializedView('test').as((qb) => qb.select().from(table));
	const nestedSelect = pgView('test').as((qb) => qb.select({ table }).from(table));
	// @ts-expect-error
	createSelectSchema(view, { unknown: t.String() });
	// @ts-expect-error
	createSelectSchema(mView, { unknown: t.String() });
	// @ts-expect-error
	createSelectSchema(nestedSelect, { table: { unknown: t.String() } });
}

/* Disallow unknown keys in view columns - select */ {
	const view = pgView('test', { id: integer() }).as(sql``);
	const mView = pgView('test', { id: integer() }).as(sql``);
	// @ts-expect-error
	createSelectSchema(view, { unknown: t.String() });
	// @ts-expect-error
	createSelectSchema(mView, { unknown: t.String() });
}
