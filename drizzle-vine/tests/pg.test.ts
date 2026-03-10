import vine from '@vinejs/vine';
import type { Infer } from '@vinejs/vine/types';
import { type Equal, sql } from 'drizzle-orm';
import {
	customType,
	integer,
	jsonb,
	pgEnum,
	pgMaterializedView,
	pgSchema,
	pgTable,
	pgView,
	serial,
	text,
} from 'drizzle-orm/pg-core';
import { test } from 'vitest';
import { CONSTANTS } from '~/constants.ts';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from '../src';
import { Expect, expectEnumValues, expectSchemaShape } from './utils.ts';

const integerSchema = vine.number().min(CONSTANTS.INT32_MIN).max(CONSTANTS.INT32_MAX).withoutDecimals();
const textSchema = vine.string();

test('table - select', (t) => {
	const table = pgTable('test', {
		id: integer().primaryKey(),
		generated: integer().generatedAlwaysAsIdentity(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);

	const expected = vine.object({ id: integerSchema, generated: integerSchema, name: textSchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<Infer<typeof result>, { id: number; generated: number; name: string }>>();
});

test('table in schema - select', (tc) => {
	const schema = pgSchema('test');
	const table = schema.table('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = vine.object({ id: integerSchema, name: textSchema });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<Infer<typeof result>, { id: number; name: string }>>();
});

test('table - insert', (t) => {
	const table = pgTable('test', {
		id: integer().generatedAlwaysAsIdentity().primaryKey(),
		name: text().notNull(),
		age: integer(),
	});

	const result = createInsertSchema(table);
	const expected = vine.object({ name: textSchema, age: integerSchema.clone().nullable().optional() });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<Infer<typeof result>, { name: string; age: number | null | undefined }>>();
});

test('table - update', (t) => {
	const table = pgTable('test', {
		id: integer().generatedAlwaysAsIdentity().primaryKey(),
		name: text().notNull(),
		age: integer(),
	});

	const result = createUpdateSchema(table);
	const expected = vine.object({
		name: textSchema.clone().optional(),
		age: integerSchema.clone().nullable().optional(),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<Infer<typeof result>, { name: string | undefined; age: number | null | undefined }>>();
});

test('view qb - select', (t) => {
	const table = pgTable('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	});
	const view = pgView('test').as((qb) => qb.select({ id: table.id, age: sql``.as('age') }).from(table));

	const result = createSelectSchema(view);
	const expected = vine.object({ id: integerSchema, age: vine.any() });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<Infer<typeof result>, { id: number; age: any }>>();
});

test('view columns - select', (t) => {
	const view = pgView('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = vine.object({ id: integerSchema, name: textSchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<Infer<typeof result>, { id: number; name: string }>>();
});

test('materialized view qb - select', (t) => {
	const table = pgTable('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	});
	const view = pgMaterializedView('test').as((qb) => qb.select({ id: table.id, age: sql``.as('age') }).from(table));

	const result = createSelectSchema(view);
	const expected = vine.object({ id: integerSchema, age: vine.any() });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<Infer<typeof result>, { id: number; age: any }>>();
});

test('materialized view columns - select', (t) => {
	const view = pgView('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = vine.object({ id: integerSchema, name: textSchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<Infer<typeof result>, { id: number; name: string }>>();
});

test('view with nested fields - select', (t) => {
	const table = pgTable('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	});
	const view = pgMaterializedView('test').as((qb) =>
		qb.select({
			id: table.id,
			nested: { name: table.name, age: sql``.as('age') },
			table,
		}).from(table)
	);

	const result = createSelectSchema(view);
	const expected = vine.object({
		id: integerSchema,
		nested: vine.object({ name: textSchema, age: vine.any() }),
		table: vine.object({ id: integerSchema, name: textSchema }),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<
		Equal<Infer<typeof result>, {
			id: number;
			nested: { name: string; age: any };
			table: { id: number; name: string };
		}>
	>();
});

test('enum - select', (t) => {
	const enum_ = pgEnum('test', ['a', 'b', 'c']);

	const result = createSelectSchema(enum_);
	const expected = vine.enum(['a', 'b', 'c'] as const);
	expectEnumValues(t, expected).from(result as any);
	Expect<Equal<Infer<typeof result>, 'a' | 'b' | 'c'>>();
});

test('nullability - select', (t) => {
	const table = pgTable('test', {
		c1: integer(),
		c2: integer().notNull(),
		c3: integer().default(1),
		c4: integer().notNull().default(1),
	});

	const result = createSelectSchema(table);
	const expected = vine.object({
		c1: integerSchema.clone().nullable(),
		c2: integerSchema,
		c3: integerSchema.clone().nullable(),
		c4: integerSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<
		Equal<Infer<typeof result>, {
			c1: number | null;
			c2: number;
			c3: number | null;
			c4: number;
		}>
	>();
});

test('nullability - insert', (t) => {
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
	const expected = vine.object({
		c1: integerSchema.clone().nullable().optional(),
		c2: integerSchema,
		c3: integerSchema.clone().nullable().optional(),
		c4: integerSchema.clone().optional(),
		c7: integerSchema.clone().optional(),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<
		Equal<Infer<typeof result>, {
			c1: number | null | undefined;
			c2: number;
			c3: number | null | undefined;
			c4: number | undefined;
			c7: number | undefined;
		}>
	>();
});

test('nullability - update', (t) => {
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
	const expected = vine.object({
		c1: integerSchema.clone().nullable().optional(),
		c2: integerSchema.clone().optional(),
		c3: integerSchema.clone().nullable().optional(),
		c4: integerSchema.clone().optional(),
		c7: integerSchema.clone().optional(),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<
		Equal<Infer<typeof result>, {
			c1: number | null | undefined;
			c2: number | undefined;
			c3: number | null | undefined;
			c4: number | undefined;
			c7: number | undefined;
		}>
	>();
});

test('refine table - select', (t) => {
	const table = pgTable('test', {
		c1: integer(),
		c2: integer().notNull(),
		c3: integer().notNull(),
	});

	const result = createSelectSchema(table, {
		c2: (schema) => schema.max(1000),
		c3: vine.string(),
	});
	const expected = vine.object({
		c1: integerSchema.clone().nullable(),
		c2: integerSchema.clone().max(1000),
		c3: vine.string(),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<Infer<typeof result>, { c1: number | null; c2: number; c3: string }>>();
});

test('refine table - select with custom data type', (t) => {
	const customText = customType({ dataType: () => 'text' });
	const table = pgTable('test', {
		c1: integer(),
		c2: integer().notNull(),
		c3: integer().notNull(),
		c4: customText(),
	});

	const customTextSchema = vine.string().minLength(1).maxLength(100);
	const result = createSelectSchema(table, {
		c2: (schema) => schema.max(1000),
		c3: vine.string(),
		c4: customTextSchema,
	});
	const expected = vine.object({
		c1: integerSchema.clone().nullable(),
		c2: integerSchema.clone().max(1000),
		c3: vine.string(),
		c4: customTextSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<Infer<typeof result>, { c1: number | null; c2: number; c3: string; c4: string }>>();
});

test('refine table - insert', (t) => {
	const table = pgTable('test', {
		c1: integer(),
		c2: integer().notNull(),
		c3: integer().notNull(),
		c4: integer().generatedAlwaysAs(1),
	});

	const result = createInsertSchema(table, {
		c2: (schema) => schema.max(1000),
		c3: vine.string(),
	});
	const expected = vine.object({
		c1: integerSchema.clone().nullable().optional(),
		c2: integerSchema.clone().max(1000),
		c3: vine.string(),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<Infer<typeof result>, { c1: number | null | undefined; c2: number; c3: string }>>();
});

test('refine table - update', (t) => {
	const table = pgTable('test', {
		c1: integer(),
		c2: integer().notNull(),
		c3: integer().notNull(),
		c4: integer().generatedAlwaysAs(1),
	});

	const result = createUpdateSchema(table, {
		c2: (schema) => schema.max(1000),
		c3: vine.string(),
	});
	const expected = vine.object({
		c1: integerSchema.clone().nullable().optional(),
		c2: integerSchema.clone().max(1000).optional(),
		c3: vine.string(),
	});
	expectSchemaShape(t, expected).from(result);
	// c2 uses a refine function → update wraps result in optional → number | undefined
	// c3 is a literal schema override → returned as-is, no optional wrapping
	Expect<Equal<Infer<typeof result>, { c1: number | null | undefined; c2: number | undefined; c3: string }>>();
});

test('refine view - select', (t) => {
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
			nested: { c4: table.c4, c5: table.c5, c6: table.c6 },
			table,
		}).from(table)
	);

	const result = createSelectSchema(view, {
		c2: (schema) => schema.max(1000),
		c3: vine.string(),
		nested: {
			c5: (schema) => schema.max(1000),
			c6: vine.string(),
		},
		table: {
			c2: (schema) => schema.max(1000),
			c3: vine.string(),
		},
	});
	const expected = vine.object({
		c1: integerSchema.clone().nullable(),
		c2: integerSchema.clone().max(1000).nullable(),
		c3: vine.string(),
		nested: vine.object({
			c4: integerSchema.clone().nullable(),
			c5: integerSchema.clone().max(1000).nullable(),
			c6: vine.string(),
		}),
		table: vine.object({
			c1: integerSchema.clone().nullable(),
			c2: integerSchema.clone().max(1000).nullable(),
			c3: vine.string(),
			c4: integerSchema.clone().nullable(),
			c5: integerSchema.clone().nullable(),
			c6: integerSchema.clone().nullable(),
		}),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<
		Equal<Infer<typeof result>, {
			c1: number | null;
			c2: number | null;
			c3: string;
			nested: { c4: number | null; c5: number | null; c6: string };
			table: {
				c1: number | null;
				c2: number | null;
				c3: string;
				c4: number | null;
				c5: number | null;
				c6: number | null;
			};
		}>
	>();
});

test('all data types', (t) => {
	const table = pgTable('test', ({
		bigint,
		bigserial,
		boolean,
		date,
		char,
		doublePrecision,
		geometry,
		halfvec,
		inet,
		integer,
		json,
		jsonb,
		line,
		numeric,
		point,
		real,
		serial,
		smallint,
		smallserial,
		text,
		time,
		timestamp,
		uuid,
		varchar,
		vector,
	}) => ({
		// bigint mode:number → VineNumber
		bigint1: bigint({ mode: 'number' }).notNull(),
		// bigint mode:bigint → VineAny (no bigint in VineJS)
		bigint2: bigint({ mode: 'bigint' }).notNull(),
		bigserial1: bigserial({ mode: 'number' }).notNull(),
		// bigserial mode:bigint → VineAny
		bigserial2: bigserial({ mode: 'bigint' }).notNull(),
		boolean: boolean().notNull(),
		date1: date({ mode: 'date' }).notNull(),
		date2: date({ mode: 'string' }).notNull(),
		char1: char({ length: 10 }).notNull(),
		char2: char({ length: 1, enum: ['a', 'b', 'c'] }).notNull(),
		doublePrecision: doublePrecision().notNull(),
		geometry1: geometry({ type: 'point', mode: 'tuple' }).notNull(),
		geometry2: geometry({ type: 'point', mode: 'xy' }).notNull(),
		halfvec: halfvec({ dimensions: 3 }).notNull(),
		inet: inet().notNull(),
		integer: integer().notNull(),
		json: json().notNull(),
		jsonb: jsonb().notNull(),
		line1: line({ mode: 'abc' }).notNull(),
		line2: line({ mode: 'tuple' }).notNull(),
		numeric: numeric().notNull(),
		point1: point({ mode: 'xy' }).notNull(),
		point2: point({ mode: 'tuple' }).notNull(),
		real: real().notNull(),
		serial: serial().notNull(),
		smallint: smallint().notNull(),
		smallserial: smallserial().notNull(),
		text1: text().notNull(),
		text2: text({ enum: ['a', 'b', 'c'] }).notNull(),
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
	const expected = vine.object({
		bigint1: vine.number().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).withoutDecimals(),
		bigint2: vine.any(), // bigint not supported in VineJS
		bigserial1: vine.number().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).withoutDecimals(),
		bigserial2: vine.any(), // bigint not supported in VineJS
		boolean: vine.boolean(),
		date1: vine.date(),
		date2: vine.string(),
		char1: vine.string().fixedLength(10),
		char2: vine.enum(['a', 'b', 'c'] as const),
		doublePrecision: vine.number().min(CONSTANTS.INT48_MIN).max(CONSTANTS.INT48_MAX),
		geometry1: vine.array(vine.number()).fixedLength(2), // [x, y] tuple
		geometry2: vine.object({ x: vine.number(), y: vine.number() }),
		halfvec: vine.array(vine.number()).fixedLength(3),
		inet: vine.string(),
		integer: vine.number().min(CONSTANTS.INT32_MIN).max(CONSTANTS.INT32_MAX).withoutDecimals(),
		json: vine.any(),
		jsonb: vine.any(),
		line1: vine.object({ a: vine.number(), b: vine.number(), c: vine.number() }),
		line2: vine.array(vine.number()).fixedLength(3), // [a, b, c] tuple
		numeric: vine.string(),
		point1: vine.object({ x: vine.number(), y: vine.number() }),
		point2: vine.array(vine.number()).fixedLength(2), // [x, y] tuple
		real: vine.number().min(CONSTANTS.INT24_MIN).max(CONSTANTS.INT24_MAX),
		serial: vine.number().min(CONSTANTS.INT32_MIN).max(CONSTANTS.INT32_MAX).withoutDecimals(),
		smallint: vine.number().min(CONSTANTS.INT16_MIN).max(CONSTANTS.INT16_MAX).withoutDecimals(),
		smallserial: vine.number().min(CONSTANTS.INT16_MIN).max(CONSTANTS.INT16_MAX).withoutDecimals(),
		text1: vine.string(),
		text2: vine.enum(['a', 'b', 'c'] as const),
		time: vine.string(),
		timestamp1: vine.date(),
		timestamp2: vine.string(),
		uuid: vine.string().uuid(),
		varchar1: vine.string().maxLength(10),
		varchar2: vine.enum(['a', 'b', 'c'] as const),
		vector: vine.array(vine.number()).fixedLength(3),
		array1: vine.array(integerSchema),
		array2: vine.array(vine.array(integerSchema)).fixedLength(2),
		array3: vine.array(vine.array(vine.string().maxLength(10))).fixedLength(2),
	});

	expectSchemaShape(t, expected).from(result);
	Expect<
		Equal<Infer<typeof result>, {
			bigint1: number;
			bigint2: any;
			bigserial1: number;
			bigserial2: any;
			boolean: boolean;
			date1: Date;
			date2: string;
			char1: string;
			char2: 'a' | 'b' | 'c';
			doublePrecision: number;
			geometry1: number[];
			geometry2: { x: number; y: number };
			halfvec: number[];
			inet: string;
			integer: number;
			json: any;
			jsonb: any;
			line1: { a: number; b: number; c: number };
			line2: number[];
			numeric: string;
			point1: { x: number; y: number };
			point2: number[];
			real: number;
			serial: number;
			smallint: number;
			smallserial: number;
			text1: string;
			text2: 'a' | 'b' | 'c';
			time: string;
			timestamp1: Date;
			timestamp2: string;
			uuid: string;
			varchar1: string;
			varchar2: 'a' | 'b' | 'c';
			vector: number[];
			array1: number[];
			array2: number[][];
			array3: string[][];
		}>
	>();
});

/* $type<T>() — select, notNull */ {
	interface MyJsonData {
		name: string;
		count: number;
	}
	const table = pgTable('test', { data: jsonb().$type<MyJsonData>().notNull() });
	const result = createSelectSchema(table);
	Expect<Equal<Infer<typeof result>, { data: MyJsonData }>>();
}

/* $type<T>() — select, nullable */ {
	interface Tag {
		id: number;
		label: string;
	}
	const table = pgTable('test', { tags: jsonb().$type<Tag[]>() });
	const result = createSelectSchema(table);
	Expect<Equal<Infer<typeof result>, { tags: Tag[] | null }>>();
}

/* $type<T>() — insert */ {
	interface Prefs {
		theme: 'light' | 'dark';
	}
	const table = pgTable('test', {
		prefs: jsonb().$type<Prefs>().notNull(),
		meta: jsonb().$type<Record<string, unknown>>(),
	});
	const result = createInsertSchema(table);
	Expect<
		Equal<Infer<typeof result>, {
			prefs: Prefs;
			meta: Record<string, unknown> | null | undefined;
		}>
	>();
}

/* $type<T>() — update (all optional) */ {
	interface Prefs {
		theme: 'light' | 'dark';
	}
	const table = pgTable('test', {
		prefs: jsonb().$type<Prefs>().notNull(),
		meta: jsonb().$type<Record<string, unknown>>(),
	});
	const result = createUpdateSchema(table);
	Expect<
		Equal<Infer<typeof result>, {
			prefs: Prefs | undefined;
			meta: Record<string, unknown> | null | undefined;
		}>
	>();
}

/* Disallow unknown keys in table refinement - select */ {
	const table = pgTable('test', { id: integer() });
	// @ts-expect-error
	createSelectSchema(table, { unknown: vine.string() });
}

/* Disallow unknown keys in table refinement - insert */ {
	const table = pgTable('test', { id: integer() });
	// @ts-expect-error
	createInsertSchema(table, { unknown: vine.string() });
}

/* Disallow unknown keys in table refinement - update */ {
	const table = pgTable('test', { id: integer() });
	// @ts-expect-error
	createUpdateSchema(table, { unknown: vine.string() });
}

/* Disallow unknown keys in view qb - select */ {
	const table = pgTable('test', { id: integer() });
	const view = pgView('test').as((qb) => qb.select().from(table));
	const mView = pgMaterializedView('test').as((qb) => qb.select().from(table));
	const nestedSelect = pgView('test').as((qb) => qb.select({ table }).from(table));
	// @ts-expect-error
	createSelectSchema(view, { unknown: vine.string() });
	// @ts-expect-error
	createSelectSchema(mView, { unknown: vine.string() });
	// @ts-expect-error
	createSelectSchema(nestedSelect, { table: { unknown: vine.string() } });
}

/* Disallow unknown keys in view columns - select */ {
	const view = pgView('test', { id: integer() }).as(sql``);
	// @ts-expect-error
	createSelectSchema(view, { unknown: vine.string() });
}
