import { type Equal, sql } from 'drizzle-orm';
import { blob, customType, int, sqliteTable, sqliteView, text } from 'drizzle-orm/sqlite-core';
import type { TopLevelCondition } from 'json-rules-engine';
import * as v from 'valibot';
import { test } from 'vitest';
import { bufferSchema, jsonSchema } from '~/column.ts';
import { CONSTANTS } from '~/constants.ts';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from '../src';
import { Expect, expectSchemaShape } from './utils.ts';

const intSchema = v.pipe(
	v.number(),
	v.minValue(Number.MIN_SAFE_INTEGER),
	v.maxValue(Number.MAX_SAFE_INTEGER),
	v.integer(),
);
const intNullableSchema = v.nullable(intSchema);
const intOptionalSchema = v.optional(intSchema);
const intNullableOptionalSchema = v.optional(v.nullable(intSchema));

const textSchema = v.string();
const textOptionalSchema = v.optional(textSchema);

const anySchema = v.any();

const extendedSchema = v.pipe(intSchema, v.maxValue(1000));
const extendedNullableSchema = v.nullable(extendedSchema);
const extendedOptionalSchema = v.optional(extendedSchema);

const customSchema = v.pipe(v.string(), v.transform(Number));

test('table - select', (t) => {
	const table = sqliteTable('test', {
		id: int().primaryKey({ autoIncrement: true }),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = v.object({ id: intSchema, name: textSchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table - insert', (t) => {
	const table = sqliteTable('test', {
		id: int().primaryKey({ autoIncrement: true }),
		name: text().notNull(),
		age: int(),
	});

	const result = createInsertSchema(table);
	const expected = v.object({ id: intOptionalSchema, name: textSchema, age: intNullableOptionalSchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table - update', (t) => {
	const table = sqliteTable('test', {
		id: int().primaryKey({ autoIncrement: true }),
		name: text().notNull(),
		age: int(),
	});

	const result = createUpdateSchema(table);
	const expected = v.object({
		id: intOptionalSchema,
		name: textOptionalSchema,
		age: intNullableOptionalSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view qb - select', (t) => {
	const table = sqliteTable('test', {
		id: int().primaryKey({ autoIncrement: true }),
		name: text().notNull(),
	});
	const view = sqliteView('test').as((qb) => qb.select({ id: table.id, age: sql``.as('age') }).from(table));

	const result = createSelectSchema(view);
	const expected = v.object({ id: intSchema, age: anySchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view columns - select', (t) => {
	const view = sqliteView('test', {
		id: int().primaryKey({ autoIncrement: true }),
		name: text().notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = v.object({ id: intSchema, name: textSchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view with nested fields - select', (t) => {
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
	const expected = v.object({
		id: intSchema,
		nested: v.object({ name: textSchema, age: anySchema }),
		table: v.object({ id: intSchema, name: textSchema }),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('nullability - select', (t) => {
	const table = sqliteTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().default(1),
		c4: int().notNull().default(1),
	});

	const result = createSelectSchema(table);
	const expected = v.object({
		c1: intNullableSchema,
		c2: intSchema,
		c3: intNullableSchema,
		c4: intSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('nullability - insert', (t) => {
	const table = sqliteTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().default(1),
		c4: int().notNull().default(1),
		c5: int().generatedAlwaysAs(1),
	});

	const result = createInsertSchema(table);
	const expected = v.object({
		c1: intNullableOptionalSchema,
		c2: intSchema,
		c3: intNullableOptionalSchema,
		c4: intOptionalSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('nullability - update', (t) => {
	const table = sqliteTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().default(1),
		c4: int().notNull().default(1),
		c5: int().generatedAlwaysAs(1),
	});

	const result = createUpdateSchema(table);
	const expected = v.object({
		c1: intNullableOptionalSchema,
		c2: intOptionalSchema,
		c3: intNullableOptionalSchema,
		c4: intOptionalSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - select', (t) => {
	const table = sqliteTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().notNull(),
	});

	const result = createSelectSchema(table, {
		c2: (schema) => v.pipe(schema, v.maxValue(1000)),
		c3: v.pipe(v.string(), v.transform(Number)),
	});
	const expected = v.object({
		c1: intNullableSchema,
		c2: extendedSchema,
		c3: customSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - select with custom data type', (t) => {
	const customText = customType({ dataType: () => 'text' });
	const table = sqliteTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().notNull(),
		c4: customText(),
	});

	const customTextSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(100));
	const result = createSelectSchema(table, {
		c2: (schema) => v.pipe(schema, v.maxValue(1000)),
		c3: v.pipe(v.string(), v.transform(Number)),
		c4: customTextSchema,
	});
	const expected = v.object({
		c1: intNullableSchema,
		c2: extendedSchema,
		c3: customSchema,
		c4: customTextSchema,
	});

	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - insert', (t) => {
	const table = sqliteTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().notNull(),
		c4: int().generatedAlwaysAs(1),
	});

	const result = createInsertSchema(table, {
		c2: (schema) => v.pipe(schema, v.maxValue(1000)),
		c3: v.pipe(v.string(), v.transform(Number)),
	});
	const expected = v.object({
		c1: intNullableOptionalSchema,
		c2: extendedSchema,
		c3: customSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - update', (t) => {
	const table = sqliteTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().notNull(),
		c4: int().generatedAlwaysAs(1),
	});

	const result = createUpdateSchema(table, {
		c2: (schema) => v.pipe(schema, v.maxValue(1000)),
		c3: v.pipe(v.string(), v.transform(Number)),
	});
	const expected = v.object({
		c1: intNullableOptionalSchema,
		c2: extendedOptionalSchema,
		c3: customSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine view - select', (t) => {
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
		c1: intNullableSchema,
		c2: extendedNullableSchema,
		c3: customSchema,
		nested: v.object({
			c4: intNullableSchema,
			c5: extendedNullableSchema,
			c6: customSchema,
		}),
		table: v.object({
			c1: intNullableSchema,
			c2: extendedNullableSchema,
			c3: customSchema,
			c4: intNullableSchema,
			c5: intNullableSchema,
			c6: intNullableSchema,
		}),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('all data types', (t) => {
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
		numeric1: numeric({ mode: 'number' }).notNull(),
		numeric2: numeric({ mode: 'bigint' }).notNull(),
		numeric3: numeric({ mode: 'string' }).notNull(),
		real: real().notNull(),
		text1: text({ mode: 'text' }).notNull(),
		text2: text({ mode: 'text', length: 10 }).notNull(),
		text3: text({ mode: 'text', enum: ['a', 'b', 'c'] }).notNull(),
		text4: text({ mode: 'json' }).notNull(),
	}));

	const result = createSelectSchema(table);
	const expected = v.object({
		blob1: bufferSchema,
		blob2: v.pipe(v.bigint(), v.minValue(CONSTANTS.INT64_MIN), v.maxValue(CONSTANTS.INT64_MAX)),
		blob3: jsonSchema,
		integer1: v.pipe(v.number(), v.minValue(Number.MIN_SAFE_INTEGER), v.maxValue(Number.MAX_SAFE_INTEGER), v.integer()),
		integer2: v.boolean(),
		integer3: v.date(),
		integer4: v.date(),
		numeric1: v.pipe(v.number(), v.minValue(Number.MIN_SAFE_INTEGER), v.maxValue(Number.MAX_SAFE_INTEGER)),
		numeric2: v.pipe(v.bigint(), v.minValue(CONSTANTS.INT64_MIN), v.maxValue(CONSTANTS.INT64_MAX)),
		numeric3: v.string(),
		real: v.pipe(v.number(), v.minValue(CONSTANTS.INT48_MIN), v.maxValue(CONSTANTS.INT48_MAX)),
		text1: v.string(),
		text2: v.pipe(v.string(), v.maxLength(10 as number)),
		text3: v.enum({ a: 'a', b: 'b', c: 'c' }),
		text4: jsonSchema,
	});
	// @ts-ignore - TODO: Remake type checks for new columns
	expectSchemaShape(t, expected).from(result);
	// @ts-ignore - TODO: Remake type checks for new columns
	Expect<Equal<typeof result, typeof expected>>();
});

/* Infinitely recursive type */ {
	const TopLevelCondition: v.GenericSchema<TopLevelCondition> = v.custom<TopLevelCondition>(() => true);
	const table = sqliteTable('test', {
		json1: text({ mode: 'json' }).$type<TopLevelCondition>().notNull(),
		json2: blob({ mode: 'json' }).$type<TopLevelCondition>(),
	});
	const result = createSelectSchema(table);
	const expected = v.object({
		json1: TopLevelCondition,
		json2: v.nullable(TopLevelCondition),
	});
	Expect<Equal<v.InferOutput<typeof result>, v.InferOutput<typeof expected>>>();
}

/* Disallow unknown keys in table refinement - select */ {
	const table = sqliteTable('test', { id: int() });
	// @ts-expect-error
	createSelectSchema(table, { unknown: v.string() });
}

/* Disallow unknown keys in table refinement - insert */ {
	const table = sqliteTable('test', { id: int() });
	// @ts-expect-error
	createInsertSchema(table, { unknown: v.string() });
}

/* Disallow unknown keys in table refinement - update */ {
	const table = sqliteTable('test', { id: int() });
	// @ts-expect-error
	createUpdateSchema(table, { unknown: v.string() });
}

/* Disallow unknown keys in view qb - select */ {
	const table = sqliteTable('test', { id: int() });
	const view = sqliteView('test').as((qb) => qb.select().from(table));
	const nestedSelect = sqliteView('test').as((qb) => qb.select({ table }).from(table));
	// @ts-expect-error
	createSelectSchema(view, { unknown: v.string() });
	// @ts-expect-error
	createSelectSchema(nestedSelect, { table: { unknown: v.string() } });
}

/* Disallow unknown keys in view columns - select */ {
	const view = sqliteView('test', { id: int() }).as(sql``);
	// @ts-expect-error
	createSelectSchema(view, { unknown: v.string() });
}
