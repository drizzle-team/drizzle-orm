import { type Static, Type as t } from '@sinclair/typebox';
import { type Equal, sql } from 'drizzle-orm';
import { blob, customType, int, sqliteTable, sqliteView, text } from 'drizzle-orm/sqlite-core';
import type { TopLevelCondition } from 'json-rules-engine';
import { test } from 'vitest';
import { bufferSchema, jsonSchema } from '~/column.ts';
import { CONSTANTS } from '~/constants.ts';
import { createInsertSchema, createSelectSchema, createUpdateSchema, type GenericSchema } from '../src';
import { Expect, expectSchemaShape } from './utils.ts';

const intSchema = t.Integer({ minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER });
const textSchema = t.String();

test('table - select', (tc) => {
	const table = sqliteTable('test', {
		id: int().primaryKey({ autoIncrement: true }),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = t.Object({ id: intSchema, name: textSchema });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table - insert', (tc) => {
	const table = sqliteTable('test', {
		id: int().primaryKey({ autoIncrement: true }),
		name: text().notNull(),
		age: int(),
	});

	const result = createInsertSchema(table);
	const expected = t.Object({
		id: t.Optional(intSchema),
		name: textSchema,
		age: t.Optional(t.Union([intSchema, t.Null()])),
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table - update', (tc) => {
	const table = sqliteTable('test', {
		id: int().primaryKey({ autoIncrement: true }),
		name: text().notNull(),
		age: int(),
	});

	const result = createUpdateSchema(table);
	const expected = t.Object({
		id: t.Optional(intSchema),
		name: t.Optional(textSchema),
		age: t.Optional(t.Union([intSchema, t.Null()])),
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view qb - select', (tc) => {
	const table = sqliteTable('test', {
		id: int().primaryKey({ autoIncrement: true }),
		name: text().notNull(),
	});
	const view = sqliteView('test').as((qb) => qb.select({ id: table.id, age: sql``.as('age') }).from(table));

	const result = createSelectSchema(view);
	const expected = t.Object({ id: intSchema, age: t.Any() });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view columns - select', (tc) => {
	const view = sqliteView('test', {
		id: int().primaryKey({ autoIncrement: true }),
		name: text().notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = t.Object({ id: intSchema, name: textSchema });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view with nested fields - select', (tc) => {
	const table = sqliteTable('test', {
		id: int().primaryKey({ autoIncrement: true }),
		name: text().notNull(),
	});
	const view = sqliteView('test').as((qb) =>
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
		id: intSchema,
		nested: t.Object({ name: textSchema, age: t.Any() }),
		table: t.Object({ id: intSchema, name: textSchema }),
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('nullability - select', (tc) => {
	const table = sqliteTable('test', {
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
	const table = sqliteTable('test', {
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
	const table = sqliteTable('test', {
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
	const table = sqliteTable('test', {
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
		c2: t.Integer({ minimum: Number.MIN_SAFE_INTEGER, maximum: 1000 }),
		c3: t.Integer({ minimum: 1, maximum: 10 }),
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - select with custom data type', (tc) => {
	const customText = customType({ dataType: () => 'text' });
	const table = sqliteTable('test', {
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
		c2: t.Integer({ minimum: Number.MIN_SAFE_INTEGER, maximum: 1000 }),
		c3: t.Integer({ minimum: 1, maximum: 10 }),
		c4: customTextSchema,
	});

	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - insert', (tc) => {
	const table = sqliteTable('test', {
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
		c2: t.Integer({ minimum: Number.MIN_SAFE_INTEGER, maximum: 1000 }),
		c3: t.Integer({ minimum: 1, maximum: 10 }),
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - update', (tc) => {
	const table = sqliteTable('test', {
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
		c2: t.Optional(t.Integer({ minimum: Number.MIN_SAFE_INTEGER, maximum: 1000 })),
		c3: t.Integer({ minimum: 1, maximum: 10 }),
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine view - select', (tc) => {
	const table = sqliteTable('test', {
		c1: int(),
		c2: int(),
		c3: int(),
		c4: int(),
		c5: int(),
		c6: int(),
	});
	const view = sqliteView('test').as((qb) =>
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
		c2: t.Union([t.Integer({ minimum: Number.MIN_SAFE_INTEGER, maximum: 1000 }), t.Null()]),
		c3: t.Integer({ minimum: 1, maximum: 10 }),
		nested: t.Object({
			c4: t.Union([intSchema, t.Null()]),
			c5: t.Union([t.Integer({ minimum: Number.MIN_SAFE_INTEGER, maximum: 1000 }), t.Null()]),
			c6: t.Integer({ minimum: 1, maximum: 10 }),
		}),
		table: t.Object({
			c1: t.Union([intSchema, t.Null()]),
			c2: t.Union([t.Integer({ minimum: Number.MIN_SAFE_INTEGER, maximum: 1000 }), t.Null()]),
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
	const table = sqliteTable('test', ({
		blob,
		integer,
		numeric,
		real,
		text,
	}) => ({
		blob1: blob({ mode: 'buffer' }).notNull(),
		blob2: blob({ mode: 'bigint' }).notNull(),
		blob3: blob({ mode: 'json' }).notNull(),
		integer1: integer({ mode: 'number' }).notNull(),
		integer2: integer({ mode: 'boolean' }).notNull(),
		integer3: integer({ mode: 'timestamp' }).notNull(),
		integer4: integer({ mode: 'timestamp_ms' }).notNull(),
		numeric: numeric().notNull(),
		real: real().notNull(),
		text1: text({ mode: 'text' }).notNull(),
		text2: text({ mode: 'text', length: 10 }).notNull(),
		text3: text({ mode: 'text', enum: ['a', 'b', 'c'] }).notNull(),
		text4: text({ mode: 'json' }).notNull(),
	}));

	const result = createSelectSchema(table);
	const expected = t.Object({
		blob1: bufferSchema,
		blob2: t.BigInt({ minimum: CONSTANTS.INT64_MIN, maximum: CONSTANTS.INT64_MAX }),
		blob3: jsonSchema,
		integer1: t.Integer({ minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER }),
		integer2: t.Boolean(),
		integer3: t.Date(),
		integer4: t.Date(),
		numeric: t.String(),
		real: t.Number({ minimum: CONSTANTS.INT48_MIN, maximum: CONSTANTS.INT48_MAX }),
		text1: t.String(),
		text2: t.String({ maxLength: 10 }),
		text3: t.Enum({ a: 'a', b: 'b', c: 'c' }),
		text4: jsonSchema,
	});
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

/* Infinitely recursive type */ {
	const TopLevelCondition: GenericSchema<TopLevelCondition> = t.Any() as any;
	const table = sqliteTable('test', {
		json1: text({ mode: 'json' }).$type<TopLevelCondition>().notNull(),
		json2: blob({ mode: 'json' }).$type<TopLevelCondition>(),
	});
	const result = createSelectSchema(table);
	const expected = t.Object({
		json1: TopLevelCondition,
		json2: t.Union([TopLevelCondition, t.Null()]),
	});
	Expect<Equal<Static<typeof result>, Static<typeof expected>>>();
}

/* Disallow unknown keys in table refinement - select */ {
	const table = sqliteTable('test', { id: int() });
	// @ts-expect-error
	createSelectSchema(table, { unknown: t.String() });
}

/* Disallow unknown keys in table refinement - insert */ {
	const table = sqliteTable('test', { id: int() });
	// @ts-expect-error
	createInsertSchema(table, { unknown: t.String() });
}

/* Disallow unknown keys in table refinement - update */ {
	const table = sqliteTable('test', { id: int() });
	// @ts-expect-error
	createUpdateSchema(table, { unknown: t.String() });
}

/* Disallow unknown keys in view qb - select */ {
	const table = sqliteTable('test', { id: int() });
	const view = sqliteView('test').as((qb) => qb.select().from(table));
	const nestedSelect = sqliteView('test').as((qb) => qb.select({ table }).from(table));
	// @ts-expect-error
	createSelectSchema(view, { unknown: t.String() });
	// @ts-expect-error
	createSelectSchema(nestedSelect, { table: { unknown: t.String() } });
}

/* Disallow unknown keys in view columns - select */ {
	const view = sqliteView('test', { id: int() }).as(sql``);
	// @ts-expect-error
	createSelectSchema(view, { unknown: t.String() });
}
