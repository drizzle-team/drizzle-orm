import { sql } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-orm/effect-schema';
import { bigintStringModeSchema, jsonSchema } from 'drizzle-orm/effect-schema';
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
import { CONSTANTS } from 'drizzle-orm/utils';
import { Schema as s } from 'effect';
import * as SchemaGetter from 'effect/SchemaGetter';
import type { TopLevelCondition } from 'json-rules-engine';
import { test } from 'vitest';
import { Equal, Expect } from '~/utils';
import { expectEnumValues, expectSchemaShape } from './utils';

const integerSchema = s.Int.check(
	s.isGreaterThanOrEqualTo(CONSTANTS.INT32_MIN),
	s.isLessThanOrEqualTo(CONSTANTS.INT32_MAX),
);
const integerNullableSchema = s.NullOr(integerSchema);
const integerOptionalSchema = s.optional(s.UndefinedOr(integerSchema));
const integerNullableOptionalSchema = s.optional(s.UndefinedOr(s.NullOr(integerSchema)));

const textSchema = s.String;
const textOptionalSchema = s.optional(s.UndefinedOr(textSchema));

const anySchema = s.Any;

const extendedSchema = integerSchema.check(s.isLessThanOrEqualTo(1000));
const extendedNullableSchema = s.NullOr(extendedSchema);
const extendedOptionalSchema = s.optional(s.UndefinedOr(extendedSchema));

const customSchema = s.String.pipe(s.decodeTo(s.Number, {
	decode: SchemaGetter.transform((v: string) => Number(v)),
	encode: SchemaGetter.transform((v: number) => String(v)),
}));

test('table - select', (t) => {
	const table = pgTable('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = s.Struct({ id: integerSchema, name: textSchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table in schema - select', (tc) => {
	const schema = pgSchema('test');
	const table = schema.table('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = s.Struct({ id: integerSchema, name: textSchema });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table - insert', (t) => {
	const table = pgTable('test', {
		id: integer().generatedAlwaysAsIdentity().primaryKey(),
		name: text().notNull(),
		age: integer(),
	});

	const result = createInsertSchema(table);
	const expected = s.Struct({ name: textSchema, age: integerNullableOptionalSchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table - update', (t) => {
	const table = pgTable('test', {
		id: integer().generatedAlwaysAsIdentity().primaryKey(),
		name: text().notNull(),
		age: integer(),
	});

	const result = createUpdateSchema(table);
	const expected = s.Struct({
		name: textOptionalSchema,
		age: integerNullableOptionalSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view qb - select', (t) => {
	const table = pgTable('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	});
	const view = pgView('test').as((qb) => qb.select({ id: table.id, age: sql``.as('age') }).from(table));

	const result = createSelectSchema(view);
	const expected = s.Struct({ id: integerSchema, age: anySchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view columns - select', (t) => {
	const view = pgView('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = s.Struct({ id: integerSchema, name: textSchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('materialized view qb - select', (t) => {
	const table = pgTable('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	});
	const view = pgMaterializedView('test').as((qb) => qb.select({ id: table.id, age: sql``.as('age') }).from(table));

	const result = createSelectSchema(view);
	const expected = s.Struct({ id: integerSchema, age: anySchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('materialized view columns - select', (t) => {
	const view = pgMaterializedView('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = s.Struct({ id: integerSchema, name: textSchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view with nested fields - select', (t) => {
	const table = pgTable('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	});
	const view = pgView('test').as((qb) =>
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
	const expected = s.Struct({
		id: integerSchema,
		nested: s.Struct({ name: textSchema, age: anySchema }),
		table: s.Struct({ id: integerSchema, name: textSchema }),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('enum - select', (t) => {
	const enum_ = pgEnum('test', ['a', 'b', 'c']);

	const result = createSelectSchema(enum_);
	const expected = s.Literals(['a', 'b', 'c']);
	expectEnumValues(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('nullability - select', (t) => {
	const table = pgTable('test', {
		c1: integer(),
		c2: integer().notNull(),
		c3: integer().default(1),
		c4: integer().notNull().default(1),
	});

	const result = createSelectSchema(table);
	const expected = s.Struct({
		c1: integerNullableSchema,
		c2: integerSchema,
		c3: integerNullableSchema,
		c4: integerSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('nullability - insert', (t) => {
	const table = pgTable('test', {
		c1: integer(),
		c2: integer().notNull(),
		c3: integer().default(1),
		c4: integer().notNull().default(1),
		c5: integer().generatedAlwaysAs(sql`1`),
		c6: integer().generatedAlwaysAsIdentity(),
		c7: integer().generatedByDefaultAsIdentity(),
	});

	const result = createInsertSchema(table);
	const expected = s.Struct({
		c1: integerNullableOptionalSchema,
		c2: integerSchema,
		c3: integerNullableOptionalSchema,
		c4: integerOptionalSchema,
		c7: integerOptionalSchema,
	});
	expectSchemaShape(t, expected).from(result);
});

test('nullability - update', (t) => {
	const table = pgTable('test', {
		c1: integer(),
		c2: integer().notNull(),
		c3: integer().default(1),
		c4: integer().notNull().default(1),
		c5: integer().generatedAlwaysAs(sql`1`),
		c6: integer().generatedAlwaysAsIdentity(),
		c7: integer().generatedByDefaultAsIdentity(),
	});

	const result = createUpdateSchema(table);
	const expected = s.Struct({
		c1: integerNullableOptionalSchema,
		c2: integerOptionalSchema,
		c3: integerNullableOptionalSchema,
		c4: integerOptionalSchema,
		c7: integerOptionalSchema,
	});

	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - select', (t) => {
	const table = pgTable('test', {
		c1: integer(),
		c2: integer().notNull(),
		c3: integer().notNull(),
	});

	const result = createSelectSchema(table, {
		c2: (schema) => schema.check(s.isLessThanOrEqualTo(1000)),
		c3: s.String.pipe(s.decodeTo(s.Number, {
			decode: SchemaGetter.transform((v: string) => Number(v)),
			encode: SchemaGetter.transform((v: number) => String(v)),
		})),
	});
	const expected = s.Struct({
		c1: integerNullableSchema,
		c2: extendedSchema,
		c3: customSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - select with custom data type', (t) => {
	const customText = customType({ codec: 'text', dataType: () => 'text' });
	const table = pgTable('test', {
		c1: integer(),
		c2: integer().notNull(),
		c3: integer().notNull(),
		c4: customText(),
	});

	const customTextSchema = s.String.check(s.isMinLength(1), s.isMaxLength(100));
	const result = createSelectSchema(table, {
		c2: (schema) => schema.check(s.isLessThanOrEqualTo(1000)),
		c3: s.String.pipe(s.decodeTo(s.Number, {
			decode: SchemaGetter.transform((v: string) => Number(v)),
			encode: SchemaGetter.transform((v: number) => String(v)),
		})),
		c4: customTextSchema,
	});
	const expected = s.Struct({
		c1: integerNullableSchema,
		c2: extendedSchema,
		c3: customSchema,
		c4: customTextSchema,
	});

	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - insert', (t) => {
	const table = pgTable('test', {
		c1: integer(),
		c2: integer().notNull(),
		c3: integer().notNull(),
		c4: integer().generatedAlwaysAs(sql`1`),
	});

	const result = createInsertSchema(table, {
		c2: (schema) => schema.check(s.isLessThanOrEqualTo(1000)),
		c3: s.String.pipe(s.decodeTo(s.Number, {
			decode: SchemaGetter.transform((v: string) => Number(v)),
			encode: SchemaGetter.transform((v: number) => String(v)),
		})),
	});
	const expected = s.Struct({
		c1: integerNullableOptionalSchema,
		c2: extendedSchema,
		c3: customSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - update', (t) => {
	const table = pgTable('test', {
		c1: integer(),
		c2: integer().notNull(),
		c3: integer().notNull(),
		c4: integer().generatedAlwaysAs(sql`1`),
	});

	const result = createUpdateSchema(table, {
		c2: (schema) => schema.check(s.isLessThanOrEqualTo(1000)),
		c3: s.String.pipe(s.decodeTo(s.Number, {
			decode: SchemaGetter.transform((v: string) => Number(v)),
			encode: SchemaGetter.transform((v: number) => String(v)),
		})),
	});
	const expected = s.Struct({
		c1: integerNullableOptionalSchema,
		c2: extendedOptionalSchema,
		c3: customSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
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
			nested: {
				c4: table.c4,
				c5: table.c5,
				c6: table.c6,
			},
			table,
		}).from(table)
	);

	const result = createSelectSchema(view, {
		c2: (schema) => schema.check(s.isLessThanOrEqualTo(1000)),
		c3: s.String.pipe(s.decodeTo(s.Number, {
			decode: SchemaGetter.transform((v: string) => Number(v)),
			encode: SchemaGetter.transform((v: number) => String(v)),
		})),
		nested: {
			c5: (schema) => schema.check(s.isLessThanOrEqualTo(1000)),
			c6: s.String.pipe(s.decodeTo(s.Number, {
				decode: SchemaGetter.transform((v: string) => Number(v)),
				encode: SchemaGetter.transform((v: number) => String(v)),
			})),
		},
		table: {
			c2: (schema) => schema.check(s.isLessThanOrEqualTo(1000)),
			c3: s.String.pipe(s.decodeTo(s.Number, {
				decode: SchemaGetter.transform((v: string) => Number(v)),
				encode: SchemaGetter.transform((v: number) => String(v)),
			})),
		},
	});
	const expected = s.Struct({
		c1: integerNullableSchema,
		c2: extendedNullableSchema,
		c3: customSchema,
		nested: s.Struct({
			c4: integerNullableSchema,
			c5: extendedNullableSchema,
			c6: customSchema,
		}),
		table: s.Struct({
			c1: integerNullableSchema,
			c2: extendedNullableSchema,
			c3: customSchema,
			c4: integerNullableSchema,
			c5: integerNullableSchema,
			c6: integerNullableSchema,
		}),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('all data types', (t) => {
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
		bigint3: bigint({ mode: 'string' }).notNull(),
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
		numeric1: numeric({ mode: 'number' }).notNull(),
		numeric2: numeric({ mode: 'bigint' }).notNull(),
		numeric3: numeric({ mode: 'string' }).notNull(),
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
		array2: integer().array('[][]').notNull(),
		array3: varchar({ length: 10 }).array('[][]').notNull(),
	}));

	const result = createSelectSchema(table);
	const expected = s.Struct({
		bigint1: s.Int.check(
			s.isGreaterThanOrEqualTo(Number.MIN_SAFE_INTEGER),
			s.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
		),
		bigint2: s.BigInt.check(
			s.isGreaterThanOrEqualToBigInt(CONSTANTS.INT64_MIN),
			s.isLessThanOrEqualToBigInt(CONSTANTS.INT64_MAX),
		),
		bigint3: bigintStringModeSchema,
		bigserial1: s.Int.check(
			s.isGreaterThanOrEqualTo(Number.MIN_SAFE_INTEGER),
			s.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
		),
		bigserial2: s.BigInt.check(
			s.isGreaterThanOrEqualToBigInt(CONSTANTS.INT64_MIN),
			s.isLessThanOrEqualToBigInt(CONSTANTS.INT64_MAX),
		),
		bit: s.String.check(s.isPattern(/^[01]*$/), s.isLengthBetween(5, 5)),
		boolean: s.Boolean,
		date1: s.Date,
		date2: s.String,
		char1: s.String.check(s.isMaxLength(10)),
		char2: s.Literals(['a', 'b', 'c']),
		cidr: s.String,
		doublePrecision: s.Number.check(
			s.isGreaterThanOrEqualTo(CONSTANTS.INT48_MIN),
			s.isLessThanOrEqualTo(CONSTANTS.INT48_MAX),
		),
		geometry1: s.Tuple([s.Number, s.Number]),
		geometry2: s.Struct({ x: s.Number, y: s.Number }),
		halfvec: s.Array(s.Number).check(s.isLengthBetween(3, 3)),
		inet: s.String,
		integer: s.Int.check(
			s.isGreaterThanOrEqualTo(CONSTANTS.INT32_MIN),
			s.isLessThanOrEqualTo(CONSTANTS.INT32_MAX),
		),
		interval: s.String,
		json: jsonSchema,
		jsonb: jsonSchema,
		line1: s.Struct({ a: s.Number, b: s.Number, c: s.Number }),
		line2: s.Tuple([s.Number, s.Number, s.Number]),
		macaddr: s.String,
		macaddr8: s.String,
		numeric1: s.Number.check(
			s.isGreaterThanOrEqualTo(Number.MIN_SAFE_INTEGER),
			s.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
		),
		numeric2: s.BigInt.check(
			s.isGreaterThanOrEqualToBigInt(CONSTANTS.INT64_MIN),
			s.isLessThanOrEqualToBigInt(CONSTANTS.INT64_MAX),
		),
		numeric3: s.String,
		point1: s.Struct({ x: s.Number, y: s.Number }),
		point2: s.Tuple([s.Number, s.Number]),
		real: s.Number.check(
			s.isGreaterThanOrEqualTo(CONSTANTS.INT24_MIN),
			s.isLessThanOrEqualTo(CONSTANTS.INT24_MAX),
		),
		serial: s.Int.check(
			s.isGreaterThanOrEqualTo(CONSTANTS.INT32_MIN),
			s.isLessThanOrEqualTo(CONSTANTS.INT32_MAX),
		),
		smallint: s.Int.check(
			s.isGreaterThanOrEqualTo(CONSTANTS.INT16_MIN),
			s.isLessThanOrEqualTo(CONSTANTS.INT16_MAX),
		),
		smallserial: s.Int.check(
			s.isGreaterThanOrEqualTo(CONSTANTS.INT16_MIN),
			s.isLessThanOrEqualTo(CONSTANTS.INT16_MAX),
		),
		text1: s.String,
		text2: s.Literals(['a', 'b', 'c']),
		sparsevec: s.String,
		time: s.String,
		timestamp1: s.Date,
		timestamp2: s.String,
		uuid: s.String.check(s.isUUID()),
		varchar1: s.String.check(s.isMaxLength(10)),
		varchar2: s.Literals(['a', 'b', 'c']),
		vector: s.Array(s.Number).check(s.isLengthBetween(3, 3)),
		array1: s.Array(integerSchema),
		array2: s.Array(s.Array(integerSchema)),
		array3: s.Array(s.Array(s.String.check(s.isMaxLength(10)))),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

/* 'Infinitely recursive type'*/ {
	const TopLevelCondition: s.Schema<TopLevelCondition> = s.Any.check(
		s.makeFilter(() => undefined), // oxlint-disable-line no-useless-undefined
	) as unknown as s.Schema<TopLevelCondition>;

	const column = customType<{
		data: TopLevelCondition;
	}>({
		codec: undefined,
		dataType: () => 'object TopLevelCondition',
	});
	const table = pgTable('test', {
		tlc: column('tlc'),
	});
	const result = createSelectSchema(table, {
		tlc: TopLevelCondition,
	});
	const expected = s.Struct({
		tlc: TopLevelCondition,
	});
	Expect<Equal<typeof result, typeof expected>>();
}

/* Disallow unknown keys in table refinement - select */ {
	const table = pgTable('test', { id: integer() });
	// @ts-expect-error
	createSelectSchema(table, { unknown: s.String });
}

/* Disallow unknown keys in table refinement - insert */ {
	const table = pgTable('test', { id: integer() });
	// @ts-expect-error
	createInsertSchema(table, { unknown: s.String });
}

/* Disallow unknown keys in table refinement - update */ {
	const table = pgTable('test', { id: integer() });
	// @ts-expect-error
	createUpdateSchema(table, { unknown: s.String });
}

/* Disallow unknown keys in view qb - select */ {
	const table = pgTable('test', { id: integer() });
	const view = pgView('test').as((qb) => qb.select().from(table));
	const mView = pgMaterializedView('test').as((qb) => qb.select().from(table));
	const nestedSelect = pgView('test').as((qb) => qb.select({ table }).from(table));
	// @ts-expect-error
	createSelectSchema(view, { unknown: s.String });
	// @ts-expect-error
	createSelectSchema(mView, { unknown: s.String });
	// @ts-expect-error
	createSelectSchema(nestedSelect, { table: { unknown: s.String } });
}

/* Disallow unknown keys in view columns - select */ {
	const view = pgView('test', { id: integer() }).as(sql``);
	const mView = pgView('test', { id: integer() }).as(sql``);
	// @ts-expect-error
	createSelectSchema(view, { unknown: s.String });
	// @ts-expect-error
	createSelectSchema(mView, { unknown: s.String });
}
