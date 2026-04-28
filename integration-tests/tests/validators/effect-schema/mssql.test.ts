import { sql } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-orm/effect-schema';
import { bigintStringModeSchema, bufferSchema } from 'drizzle-orm/effect-schema';
import { customType, int, mssqlSchema, mssqlTable, mssqlView, text } from 'drizzle-orm/mssql-core';
import { CONSTANTS } from 'drizzle-orm/utils';
import { Schema as s } from 'effect';
import * as SchemaGetter from 'effect/SchemaGetter';
import type { TopLevelCondition } from 'json-rules-engine';
import { test } from 'vitest';
import { Equal, Expect } from '~/utils';
import { expectSchemaShape } from './utils';

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
	const table = mssqlTable('test', {
		id: int().primaryKey(),
		generated: int().identity(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = s.Struct({ id: integerSchema, generated: integerSchema, name: textSchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table in schema - select', (tc) => {
	const schema = mssqlSchema('test');
	const table = schema.table('test', {
		id: int().primaryKey(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = s.Struct({ id: integerSchema, name: textSchema });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table - insert', (t) => {
	const table = mssqlTable('test', {
		id: int().identity().primaryKey(),
		name: text().notNull(),
		age: int(),
	});

	const result = createInsertSchema(table);
	const expected = s.Struct({ name: textSchema, age: integerNullableOptionalSchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table - update', (t) => {
	const table = mssqlTable('test', {
		id: int().identity().primaryKey(),
		name: text().notNull(),
		age: int(),
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
	const table = mssqlTable('test', {
		id: int().primaryKey(),
		name: text().notNull(),
	});
	const view = mssqlView('test').as((qb) => qb.select({ id: table.id, age: sql``.as('age') }).from(table));

	const result = createSelectSchema(view);
	const expected = s.Struct({ id: integerSchema, age: anySchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view columns - select', (t) => {
	const view = mssqlView('test', {
		id: int().primaryKey(),
		name: text().notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = s.Struct({ id: integerSchema, name: textSchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view with nested fields - select', (t) => {
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
	const expected = s.Struct({
		id: integerSchema,
		nested: s.Struct({ name: textSchema, age: anySchema }),
		table: s.Struct({ id: integerSchema, name: textSchema }),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('nullability - select', (t) => {
	const table = mssqlTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().default(1),
		c4: int().notNull().default(1),
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
	const table = mssqlTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().default(1),
		c4: int().notNull().default(1),
		c5: int().generatedAlwaysAs(sql`1`),
		c6: int().identity(),
	});

	const result = createInsertSchema(table);
	const expected = s.Struct({
		c1: integerNullableOptionalSchema,
		c2: integerSchema,
		c3: integerNullableOptionalSchema,
		c4: integerOptionalSchema,
	});
	expectSchemaShape(t, expected).from(result);
});

test('nullability - update', (t) => {
	const table = mssqlTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().default(1),
		c4: int().notNull().default(1),
		c5: int().generatedAlwaysAs(sql`1`),
		c6: int().identity(),
	});

	const result = createUpdateSchema(table);
	const expected = s.Struct({
		c1: integerNullableOptionalSchema,
		c2: integerOptionalSchema,
		c3: integerNullableOptionalSchema,
		c4: integerOptionalSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - select', (t) => {
	const table = mssqlTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().notNull(),
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
	const customText = customType({ dataType: () => 'text' });
	const table = mssqlTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().notNull(),
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
	const table = mssqlTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().notNull(),
		c4: int().generatedAlwaysAs(sql`1`),
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
	const table = mssqlTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().notNull(),
		c4: int().generatedAlwaysAs(sql`1`),
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
		binary: bufferSchema,
		bit: s.Boolean,
		char1: s.String.check(s.isMaxLength(10)),
		char2: s.Literals(['a', 'b', 'c']),
		date1: s.Date,
		date2: s.String,
		datetime1: s.Date,
		datetime2: s.String,
		datetime2_1: s.Date,
		datetime2_2: s.String,
		datetimeoffset1: s.Date,
		datetimeoffset2: s.String,
		decimal1: s.Number.check(
			s.isGreaterThanOrEqualTo(Number.MIN_SAFE_INTEGER),
			s.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
		),
		decimal2: s.BigInt.check(
			s.isGreaterThanOrEqualToBigInt(CONSTANTS.INT64_MIN),
			s.isLessThanOrEqualToBigInt(CONSTANTS.INT64_MAX),
		),
		decimal3: s.String,
		float: s.Number.check(
			s.isGreaterThanOrEqualTo(CONSTANTS.INT48_MIN),
			s.isLessThanOrEqualTo(CONSTANTS.INT48_MAX),
		),
		int: s.Int.check(
			s.isGreaterThanOrEqualTo(CONSTANTS.INT32_MIN),
			s.isLessThanOrEqualTo(CONSTANTS.INT32_MAX),
		),
		numeric1: s.Number.check(
			s.isGreaterThanOrEqualTo(Number.MIN_SAFE_INTEGER),
			s.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
		),
		numeric2: s.BigInt.check(
			s.isGreaterThanOrEqualToBigInt(CONSTANTS.INT64_MIN),
			s.isLessThanOrEqualToBigInt(CONSTANTS.INT64_MAX),
		),
		numeric3: s.String,
		real: s.Number.check(
			s.isGreaterThanOrEqualTo(CONSTANTS.INT24_MIN),
			s.isLessThanOrEqualTo(CONSTANTS.INT24_MAX),
		),
		smallint: s.Int.check(
			s.isGreaterThanOrEqualTo(CONSTANTS.INT16_MIN),
			s.isLessThanOrEqualTo(CONSTANTS.INT16_MAX),
		),
		text1: s.String,
		text2: s.Literals(['a', 'b', 'c']),
		time1: s.Date,
		time2: s.String,
		tinyint: s.Int.check(
			s.isGreaterThanOrEqualTo(0),
			s.isLessThanOrEqualTo(CONSTANTS.INT8_UNSIGNED_MAX),
		),
		varbinary: bufferSchema,
		varchar1: s.String.check(s.isMaxLength(10)),
		varchar2: s.Literals(['a', 'b', 'c']),
		ntext1: s.String,
		ntext2: s.Literals(['a', 'b', 'c']),
		nvarchar1: s.String.check(s.isMaxLength(10)),
		nvarchar2: s.Literals(['a', 'b', 'c']),
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
		dataType: () => 'object TopLevelCondition',
	});
	const table = mssqlTable('test', {
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
	const table = mssqlTable('test', { id: int() });
	// @ts-expect-error
	createSelectSchema(table, { unknown: s.String });
}

/* Disallow unknown keys in table refinement - insert */ {
	const table = mssqlTable('test', { id: int() });
	// @ts-expect-error
	createInsertSchema(table, { unknown: s.String });
}

/* Disallow unknown keys in table refinement - update */ {
	const table = mssqlTable('test', { id: int() });
	// @ts-expect-error
	createUpdateSchema(table, { unknown: s.String });
}

/* Disallow unknown keys in view qb - select */ {
	const table = mssqlTable('test', { id: int() });
	const view = mssqlView('test').as((qb) => qb.select().from(table));
	const nestedSelect = mssqlView('test').as((qb) => qb.select({ table }).from(table));
	// @ts-expect-error
	createSelectSchema(view, { unknown: s.String });
	// @ts-expect-error
	createSelectSchema(nestedSelect, { table: { unknown: s.String } });
}

/* Disallow unknown keys in view columns - select */ {
	const view = mssqlView('test', { id: int() }).as(sql``);
	const mView = mssqlView('test', { id: int() }).as(sql``);
	// @ts-expect-error
	createSelectSchema(view, { unknown: s.String });
	// @ts-expect-error
	createSelectSchema(mView, { unknown: s.String });
}
