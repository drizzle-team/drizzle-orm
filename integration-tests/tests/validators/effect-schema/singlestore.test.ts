import { sql } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-orm/effect-schema';
import { bigintStringModeSchema, jsonSchema, unsignedBigintStringModeSchema } from 'drizzle-orm/effect-schema';
import { customType, int, json, serial, singlestoreSchema, singlestoreTable, text } from 'drizzle-orm/singlestore-core';
import { CONSTANTS } from 'drizzle-orm/utils';
import { Schema as s } from 'effect';
import * as SchemaGetter from 'effect/SchemaGetter';
import type { TopLevelCondition } from 'json-rules-engine';
import { test } from 'vitest';
import { Equal, Expect } from '~/utils';
import { expectSchemaShape } from './utils';

const intSchema = s.Int.check(
	s.isGreaterThanOrEqualTo(CONSTANTS.INT32_MIN as number),
	s.isLessThanOrEqualTo(CONSTANTS.INT32_MAX as number),
);
const intNullableSchema = s.NullOr(intSchema);
const intOptionalSchema = s.optional(s.UndefinedOr(intSchema));
const intNullableOptionalSchema = s.optional(s.UndefinedOr(s.NullOr(intSchema)));

const serialSchema = s.Int.check(
	s.isGreaterThanOrEqualTo(0 as number),
	s.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER as number),
);
const serialOptionalSchema = s.optional(s.UndefinedOr(serialSchema));

const textSchema = s.String.check(s.isMaxLength(CONSTANTS.INT16_UNSIGNED_MAX as number));
const textOptionalSchema = s.optional(s.UndefinedOr(textSchema));

const extendedSchema = intSchema.check(s.isLessThanOrEqualTo(1000));
const extendedOptionalSchema = s.optional(s.UndefinedOr(extendedSchema));

const customSchema = s.String.pipe(s.decodeTo(s.Number, {
	decode: SchemaGetter.transform((v: string) => Number(v)),
	encode: SchemaGetter.transform((v: number) => String(v)),
}));

test('table - select', (t) => {
	const table = singlestoreTable('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = s.Struct({ id: serialSchema, name: textSchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table in schema - select', (tc) => {
	const schema = singlestoreSchema('test');
	const table = schema.table('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = s.Struct({ id: serialSchema, name: textSchema });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table - insert', (t) => {
	const table = singlestoreTable('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
		age: int(),
	});

	const result = createInsertSchema(table);
	const expected = s.Struct({
		id: serialOptionalSchema,
		name: textSchema,
		age: intNullableOptionalSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('table - update', (t) => {
	const table = singlestoreTable('test', {
		id: serial().primaryKey(),
		name: text().notNull(),
		age: int(),
	});

	const result = createUpdateSchema(table);
	const expected = s.Struct({
		id: serialOptionalSchema,
		name: textOptionalSchema,
		age: intNullableOptionalSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

// TODO: SingleStore doesn't support views yet. Add these tests when they're added

// test('view qb - select', (t) => {
// 	const table = singlestoreTable('test', {
// 		id: serial().primaryKey(),
// 		name: text().notNull(),
// 	});
// 	const view = mysqlView('test').as((qb) => qb.select({ id: table.id, age: sql``.as('age') }).from(table));

// 	const result = createSelectSchema(view);
// 	const expected = v.object({ id: serialSchema, age: anySchema });
// 	expectSchemaShape(t, expected).from(result);
// 	Expect<Equal<typeof result, typeof expected>>();
// });

// test('view columns - select', (t) => {
// 	const view = mysqlView('test', {
// 		id: serial().primaryKey(),
// 		name: text().notNull(),
// 	}).as(sql``);

// 	const result = createSelectSchema(view);
// 	const expected = v.object({ id: serialSchema, name: textSchema });
// 	expectSchemaShape(t, expected).from(result);
// 	Expect<Equal<typeof result, typeof expected>>();
// });

// test('view with nested fields - select', (t) => {
// 	const table = singlestoreTable('test', {
// 		id: serial().primaryKey(),
// 		name: text().notNull(),
// 	});
// 	const view = mysqlView('test').as((qb) =>
// 		qb.select({
// 			id: table.id,
// 			nested: {
// 				name: table.name,
// 				age: sql``.as('age'),
// 			},
// 			table,
// 		}).from(table)
// 	);

// 	const result = createSelectSchema(view);
// 	const expected = v.object({
// 		id: serialSchema,
// 		nested: v.object({ name: textSchema, age: anySchema }),
// 		table: v.object({ id: serialSchema, name: textSchema }),
// 	});
// 	expectSchemaShape(t, expected).from(result);
// 	Expect<Equal<typeof result, typeof expected>>();
// });

test('nullability - select', (t) => {
	const table = singlestoreTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().default(1),
		c4: int().notNull().default(1),
	});

	const result = createSelectSchema(table);
	const expected = s.Struct({
		c1: intNullableSchema,
		c2: intSchema,
		c3: intNullableSchema,
		c4: intSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('nullability - insert', (t) => {
	const table = singlestoreTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().default(1),
		c4: int().notNull().default(1),
		c5: int().generatedAlwaysAs(sql`1`),
	});

	const result = createInsertSchema(table);
	const expected = s.Struct({
		c1: intNullableOptionalSchema,
		c2: intSchema,
		c3: intNullableOptionalSchema,
		c4: intOptionalSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('nullability - update', (t) => {
	const table = singlestoreTable('test', {
		c1: int(),
		c2: int().notNull(),
		c3: int().default(1),
		c4: int().notNull().default(1),
		c5: int().generatedAlwaysAs(sql`1`),
	});

	const result = createUpdateSchema(table);
	const expected = s.Struct({
		c1: intNullableOptionalSchema,
		c2: intOptionalSchema,
		c3: intNullableOptionalSchema,
		c4: intOptionalSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - select', (t) => {
	const table = singlestoreTable('test', {
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
		c1: intNullableSchema,
		c2: extendedSchema,
		c3: customSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - select with custom data type', (t) => {
	const customText = customType({ dataType: () => 'text' });
	const table = singlestoreTable('test', {
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
		c1: intNullableSchema,
		c2: extendedSchema,
		c3: customSchema,
		c4: customTextSchema,
	});

	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - insert', (t) => {
	const table = singlestoreTable('test', {
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
		c1: intNullableOptionalSchema,
		c2: extendedSchema,
		c3: customSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('refine table - update', (t) => {
	const table = singlestoreTable('test', {
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
		c1: intNullableOptionalSchema,
		c2: extendedOptionalSchema,
		c3: customSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

// test('refine view - select', (t) => {
// 	const table = singlestoreTable('test', {
// 		c1: int(),
// 		c2: int(),
// 		c3: int(),
// 		c4: int(),
// 		c5: int(),
// 		c6: int(),
// 	});
// 	const view = mysqlView('test').as((qb) =>
// 		qb.select({
// 			c1: table.c1,
// 			c2: table.c2,
// 			c3: table.c3,
// 			nested: {
// 				c4: table.c4,
// 				c5: table.c5,
// 				c6: table.c6,
// 			},
// 			table,
// 		}).from(table)
// 	);

// 	const result = createSelectSchema(view, {
// 		c2: (schema) => v.pipe(schema, v.lessThanOrEqualTo(1000)),
// 		c3: v.pipe(v.string(), v.transform(Number)),
// 		nested: {
// 			c5: (schema) => v.pipe(schema, v.lessThanOrEqualTo(1000)),
// 			c6: v.pipe(v.string(), v.transform(Number)),
// 		},
// 		table: {
// 			c2: (schema) => v.pipe(schema, v.lessThanOrEqualTo(1000)),
// 			c3: v.pipe(v.string(), v.transform(Number)),
// 		},
// 	});
// 	const expected = v.object({
// 		c1: intNullableSchema,
// 		c2: extendedNullableSchema,
// 		c3: customSchema,
// 		nested: v.object({
// 			c4: intNullableSchema,
// 			c5: extendedNullableSchema,
// 			c6: customSchema,
// 		}),
// 		table: v.object({
// 			c1: intNullableSchema,
// 			c2: extendedNullableSchema,
// 			c3: customSchema,
// 			c4: intNullableSchema,
// 			c5: intNullableSchema,
// 			c6: intNullableSchema,
// 		}),
// 	});
// 	expectSchemaShape(t, expected).from(result);
// 	Expect<Equal<typeof result, typeof expected>>();
// });

test('all data types', (t) => {
	const table = singlestoreTable('test', ({
		bigint,
		binary,
		boolean,
		char,
		date,
		datetime,
		decimal,
		double,
		float,
		int,
		json,
		mediumint,
		singlestoreEnum,
		real,
		serial,
		smallint,
		text,
		time,
		timestamp,
		tinyint,
		varchar,
		varbinary,
		year,
		longtext,
		mediumtext,
		tinytext,
		vector,
	}) => ({
		bigint1: bigint({ mode: 'number' }).notNull(),
		bigint2: bigint({ mode: 'bigint' }).notNull(),
		bigint3: bigint({ unsigned: true, mode: 'number' }).notNull(),
		bigint4: bigint({ unsigned: true, mode: 'bigint' }).notNull(),
		bigint5: bigint({ mode: 'string' }).notNull(),
		bigint6: bigint({ unsigned: true, mode: 'string' }).notNull(),
		binary: binary({ length: 10 }).notNull(),
		boolean: boolean().notNull(),
		char1: char({ length: 10 }).notNull(),
		char2: char({ length: 1, enum: ['a', 'b', 'c'] }).notNull(),
		date1: date({ mode: 'date' }).notNull(),
		date2: date({ mode: 'string' }).notNull(),
		datetime1: datetime({ mode: 'date' }).notNull(),
		datetime2: datetime({ mode: 'string' }).notNull(),
		decimal1: decimal({ mode: 'number' }).notNull(),
		decimal2: decimal({ mode: 'number', unsigned: true }).notNull(),
		decimal3: decimal({ mode: 'bigint' }).notNull(),
		decimal4: decimal({ mode: 'bigint', unsigned: true }).notNull(),
		decimal5: decimal({ mode: 'string' }).notNull(),
		decimal6: decimal({ mode: 'string', unsigned: true }).notNull(),
		double1: double().notNull(),
		double2: double({ unsigned: true }).notNull(),
		float1: float().notNull(),
		float2: float({ unsigned: true }).notNull(),
		int1: int().notNull(),
		int2: int({ unsigned: true }).notNull(),
		json: json().notNull(),
		mediumint1: mediumint().notNull(),
		mediumint2: mediumint({ unsigned: true }).notNull(),
		enum: singlestoreEnum('enum', ['a', 'b', 'c']).notNull(),
		real: real().notNull(),
		serial: serial().notNull(),
		smallint1: smallint().notNull(),
		smallint2: smallint({ unsigned: true }).notNull(),
		text1: text().notNull(),
		text2: text({ enum: ['a', 'b', 'c'] }).notNull(),
		time: time().notNull(),
		timestamp1: timestamp({ mode: 'date' }).notNull(),
		timestamp2: timestamp({ mode: 'string' }).notNull(),
		tinyint1: tinyint().notNull(),
		tinyint2: tinyint({ unsigned: true }).notNull(),
		varchar1: varchar({ length: 10 }).notNull(),
		varchar2: varchar({ length: 1, enum: ['a', 'b', 'c'] }).notNull(),
		varbinary: varbinary({ length: 10 }).notNull(),
		year: year().notNull(),
		longtext1: longtext().notNull(),
		longtext2: longtext({ enum: ['a', 'b', 'c'] }).notNull(),
		mediumtext1: mediumtext().notNull(),
		mediumtext2: mediumtext({ enum: ['a', 'b', 'c'] }).notNull(),
		tinytext1: tinytext().notNull(),
		tinytext2: tinytext({ enum: ['a', 'b', 'c'] }).notNull(),
		vector: vector({
			dimensions: 3,
			elementType: 'F32',
		}).notNull(),
		vector2: vector({
			dimensions: 2,
			elementType: 'I64',
		}).notNull(),
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
		bigint3: s.Int.check(
			s.isGreaterThanOrEqualTo(0),
			s.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
		),
		bigint4: s.BigInt.check(
			s.isGreaterThanOrEqualToBigInt(0n),
			s.isLessThanOrEqualToBigInt(CONSTANTS.INT64_UNSIGNED_MAX),
		),
		bigint5: bigintStringModeSchema,
		bigint6: unsignedBigintStringModeSchema,
		binary: s.String.check(s.isPattern(/^[01]*$/), s.isMaxLength(10)),
		boolean: s.Boolean,
		char1: s.String.check(s.isMaxLength(10)),
		char2: s.Literals(['a', 'b', 'c']),
		date1: s.Date,
		date2: s.String,
		datetime1: s.Date,
		datetime2: s.String,
		decimal1: s.Number.check(
			s.isGreaterThanOrEqualTo(Number.MIN_SAFE_INTEGER),
			s.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
		),
		decimal2: s.Number.check(
			s.isGreaterThanOrEqualTo(0),
			s.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
		),
		decimal3: s.BigInt.check(
			s.isGreaterThanOrEqualToBigInt(CONSTANTS.INT64_MIN),
			s.isLessThanOrEqualToBigInt(CONSTANTS.INT64_MAX),
		),
		decimal4: s.BigInt.check(
			s.isGreaterThanOrEqualToBigInt(0n),
			s.isLessThanOrEqualToBigInt(CONSTANTS.INT64_UNSIGNED_MAX),
		),
		decimal5: s.String,
		decimal6: s.String,
		double1: s.Number.check(
			s.isGreaterThanOrEqualTo(CONSTANTS.INT48_MIN),
			s.isLessThanOrEqualTo(CONSTANTS.INT48_MAX),
		),
		double2: s.Number.check(
			s.isGreaterThanOrEqualTo(0),
			s.isLessThanOrEqualTo(CONSTANTS.INT48_UNSIGNED_MAX),
		),
		float1: s.Number.check(
			s.isGreaterThanOrEqualTo(CONSTANTS.INT24_MIN),
			s.isLessThanOrEqualTo(CONSTANTS.INT24_MAX),
		),
		float2: s.Number.check(
			s.isGreaterThanOrEqualTo(0),
			s.isLessThanOrEqualTo(CONSTANTS.INT24_UNSIGNED_MAX),
		),
		int1: s.Int.check(
			s.isGreaterThanOrEqualTo(CONSTANTS.INT32_MIN),
			s.isLessThanOrEqualTo(CONSTANTS.INT32_MAX),
		),
		int2: s.Int.check(
			s.isGreaterThanOrEqualTo(0),
			s.isLessThanOrEqualTo(CONSTANTS.INT32_UNSIGNED_MAX),
		),
		json: jsonSchema,
		mediumint1: s.Int.check(
			s.isGreaterThanOrEqualTo(CONSTANTS.INT24_MIN),
			s.isLessThanOrEqualTo(CONSTANTS.INT24_MAX),
		),
		mediumint2: s.Int.check(
			s.isGreaterThanOrEqualTo(0),
			s.isLessThanOrEqualTo(CONSTANTS.INT24_UNSIGNED_MAX),
		),
		enum: s.Literals(['a', 'b', 'c']),
		real: s.Number.check(
			s.isGreaterThanOrEqualTo(CONSTANTS.INT48_MIN),
			s.isLessThanOrEqualTo(CONSTANTS.INT48_MAX),
		),
		serial: s.Int.check(
			s.isGreaterThanOrEqualTo(0),
			s.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
		),
		smallint1: s.Int.check(
			s.isGreaterThanOrEqualTo(CONSTANTS.INT16_MIN),
			s.isLessThanOrEqualTo(CONSTANTS.INT16_MAX),
		),
		smallint2: s.Int.check(
			s.isGreaterThanOrEqualTo(0),
			s.isLessThanOrEqualTo(CONSTANTS.INT16_UNSIGNED_MAX),
		),
		text1: s.String.check(s.isMaxLength(CONSTANTS.INT16_UNSIGNED_MAX)),
		text2: s.Literals(['a', 'b', 'c']),
		time: s.String,
		timestamp1: s.Date,
		timestamp2: s.String,
		tinyint1: s.Int.check(
			s.isGreaterThanOrEqualTo(CONSTANTS.INT8_MIN),
			s.isLessThanOrEqualTo(CONSTANTS.INT8_MAX),
		),
		tinyint2: s.Int.check(
			s.isGreaterThanOrEqualTo(0),
			s.isLessThanOrEqualTo(CONSTANTS.INT8_UNSIGNED_MAX),
		),
		varchar1: s.String.check(s.isMaxLength(10)),
		varchar2: s.Literals(['a', 'b', 'c']),
		varbinary: s.String.check(s.isPattern(/^[01]*$/), s.isMaxLength(10)),
		year: s.Int.check(s.isGreaterThanOrEqualTo(1901), s.isLessThanOrEqualTo(2155)),
		longtext1: s.String.check(s.isMaxLength(CONSTANTS.INT32_UNSIGNED_MAX)),
		longtext2: s.Literals(['a', 'b', 'c']),
		mediumtext1: s.String.check(s.isMaxLength(CONSTANTS.INT24_UNSIGNED_MAX)),
		mediumtext2: s.Literals(['a', 'b', 'c']),
		tinytext1: s.String.check(s.isMaxLength(CONSTANTS.INT8_UNSIGNED_MAX)),
		tinytext2: s.Literals(['a', 'b', 'c']),
		vector: s.Array(s.Number).check(s.isLengthBetween(3, 3)),
		vector2: s.Array(
			s.BigInt.check(
				s.isGreaterThanOrEqualToBigInt(CONSTANTS.INT64_MIN),
				s.isLessThanOrEqualToBigInt(CONSTANTS.INT64_MAX),
			),
		).check(s.isLengthBetween(2, 2)),
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
	const table = singlestoreTable('test', {
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
	const table = singlestoreTable('test', { id: int() });
	// @ts-expect-error
	createSelectSchema(table, { unknown: s.String });
}

/* Disallow unknown keys in table refinement - insert */ {
	const table = singlestoreTable('test', { id: int() });
	// @ts-expect-error
	createInsertSchema(table, { unknown: s.String });
}

/* Disallow unknown keys in table refinement - update */ {
	const table = singlestoreTable('test', { id: int() });
	// @ts-expect-error
	createUpdateSchema(table, { unknown: s.String });
}

// /* Disallow unknown keys in view qb - select */ {
// 	const table = singlestoreTable('test', { id: int() });
// 	const view = mysqlView('test').as((qb) => qb.select().from(table));
// 	const nestedSelect = mysqlView('test').as((qb) => qb.select({ table }).from(table));
// 	// @ts-expect-error
// 	createSelectSchema(view, { unknown: v.string() });
// 	// @ts-expect-error
// 	createSelectSchema(nestedSelect, { table: { unknown: v.string() } });
// }

// /* Disallow unknown keys in view columns - select */ {
// 	const view = mysqlView('test', { id: int() }).as(sql``);
// 	// @ts-expect-error
// 	createSelectSchema(view, { unknown: v.string() });
// }
