import { sql } from 'drizzle-orm';
import { customType, int, json, serial, singlestoreSchema, singlestoreTable, text } from 'drizzle-orm/singlestore-core';
import { CONSTANTS } from 'drizzle-orm/validations/constants';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-orm/validations/effect';
import {
	bigintStringModeSchema,
	jsonSchema,
	unsignedBigintStringModeSchema,
} from 'drizzle-orm/validations/effect/column';
import { Schema as s } from 'effect';
import type { TopLevelCondition } from 'json-rules-engine';
import { test } from 'vitest';
import { Equal, Expect } from '~/utils';
import { expectSchemaShape } from './utils';

const intSchema = s.Int.pipe(
	s.greaterThanOrEqualTo(CONSTANTS.INT32_MIN as number),
	s.lessThanOrEqualTo(CONSTANTS.INT32_MAX as number),
) as typeof s.Int;
const intNullableSchema = s.NullOr(intSchema);
const intOptionalSchema = s.optional(s.UndefinedOr(intSchema));
const intNullableOptionalSchema = s.optional(s.UndefinedOr(s.NullOr(intSchema)));

const serialSchema = s.Int.pipe(
	s.greaterThanOrEqualTo(0 as number),
	s.lessThanOrEqualTo(Number.MAX_SAFE_INTEGER as number),
) as typeof s.Int;
const serialOptionalSchema = s.optional(s.UndefinedOr(serialSchema));

const textSchema = s.String.pipe(s.maxLength(CONSTANTS.INT16_UNSIGNED_MAX as number)) as typeof s.String;
const textOptionalSchema = s.optional(s.UndefinedOr(textSchema));

const extendedSchema = intSchema.pipe(s.lessThanOrEqualTo(1000));
const extendedOptionalSchema = s.optional(s.UndefinedOr(extendedSchema));

const customSchema = s.String.pipe(s.transform(s.Number, {
	decode(v) {
		return Number(v);
	},
	encode(v) {
		return String(v);
	},
	strict: true,
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
		c2: (schema) => schema.pipe(s.lessThanOrEqualTo(1000)),
		c3: s.String.pipe(s.transform(s.Number, {
			decode(v) {
				return Number(v);
			},
			encode(v) {
				return String(v);
			},
			strict: true,
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

	const customTextSchema = s.String.pipe(s.minLength(1), s.maxLength(100));
	const result = createSelectSchema(table, {
		c2: (schema) => schema.pipe(s.lessThanOrEqualTo(1000)),
		c3: s.String.pipe(s.transform(s.Number, {
			decode(v) {
				return Number(v);
			},
			encode(v) {
				return String(v);
			},
			strict: true,
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
		c2: (schema) => schema.pipe(s.lessThanOrEqualTo(1000)),
		c3: s.String.pipe(s.transform(s.Number, {
			decode(v) {
				return Number(v);
			},
			encode(v) {
				return String(v);
			},
			strict: true,
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
		c2: (schema) => schema.pipe(s.lessThanOrEqualTo(1000)),
		c3: s.String.pipe(s.transform(s.Number, {
			decode(v) {
				return Number(v);
			},
			encode(v) {
				return String(v);
			},
			strict: true,
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
		bigint1: s.Int.pipe(
			s.greaterThanOrEqualTo(Number.MIN_SAFE_INTEGER),
			s.lessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
		) as typeof s.Int,
		bigint2: s.BigIntFromSelf.pipe(
			s.greaterThanOrEqualToBigInt(CONSTANTS.INT64_MIN),
			s.lessThanOrEqualToBigInt(CONSTANTS.INT64_MAX),
		) as typeof s.BigIntFromSelf,
		bigint3: s.Int.pipe(
			s.greaterThanOrEqualTo(0),
			s.lessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
		) as typeof s.Int,
		bigint4: s.BigIntFromSelf.pipe(
			s.greaterThanOrEqualToBigInt(0n),
			s.lessThanOrEqualToBigInt(CONSTANTS.INT64_UNSIGNED_MAX),
		) as typeof s.BigIntFromSelf,
		bigint5: bigintStringModeSchema,
		bigint6: unsignedBigintStringModeSchema,
		binary: s.String.pipe(s.pattern(/^[01]*$/), s.maxLength(10)) as typeof s.String,
		boolean: s.Boolean,
		char1: s.String.pipe(s.maxLength(10)) as typeof s.String,
		char2: s.Literal('a', 'b', 'c'),
		date1: s.Date,
		date2: s.String,
		datetime1: s.Date,
		datetime2: s.String,
		decimal1: s.Number.pipe(
			s.greaterThanOrEqualTo(Number.MIN_SAFE_INTEGER),
			s.lessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
		) as typeof s.Number,
		decimal2: s.Number.pipe(s.greaterThanOrEqualTo(0), s.lessThanOrEqualTo(Number.MAX_SAFE_INTEGER)) as typeof s.Number,
		decimal3: s.BigIntFromSelf.pipe(
			s.greaterThanOrEqualToBigInt(CONSTANTS.INT64_MIN),
			s.lessThanOrEqualToBigInt(CONSTANTS.INT64_MAX),
		) as typeof s.BigIntFromSelf,
		decimal4: s.BigIntFromSelf.pipe(
			s.greaterThanOrEqualToBigInt(0n),
			s.lessThanOrEqualToBigInt(CONSTANTS.INT64_UNSIGNED_MAX),
		) as typeof s.BigIntFromSelf,
		decimal5: s.String,
		decimal6: s.String,
		double1: s.Number.pipe(
			s.greaterThanOrEqualTo(CONSTANTS.INT48_MIN),
			s.lessThanOrEqualTo(CONSTANTS.INT48_MAX),
		) as typeof s.Number,
		double2: s.Number.pipe(
			s.greaterThanOrEqualTo(0),
			s.lessThanOrEqualTo(CONSTANTS.INT48_UNSIGNED_MAX),
		) as typeof s.Number,
		float1: s.Number.pipe(
			s.greaterThanOrEqualTo(CONSTANTS.INT24_MIN),
			s.lessThanOrEqualTo(CONSTANTS.INT24_MAX),
		) as typeof s.Number,
		float2: s.Number.pipe(
			s.greaterThanOrEqualTo(0),
			s.lessThanOrEqualTo(CONSTANTS.INT24_UNSIGNED_MAX),
		) as typeof s.Number,
		int1: s.Int.pipe(
			s.greaterThanOrEqualTo(CONSTANTS.INT32_MIN),
			s.lessThanOrEqualTo(CONSTANTS.INT32_MAX),
		) as typeof s.Int,
		int2: s.Int.pipe(
			s.greaterThanOrEqualTo(0),
			s.lessThanOrEqualTo(CONSTANTS.INT32_UNSIGNED_MAX),
		) as typeof s.Int,
		json: jsonSchema,
		mediumint1: s.Int.pipe(
			s.greaterThanOrEqualTo(CONSTANTS.INT24_MIN),
			s.lessThanOrEqualTo(CONSTANTS.INT24_MAX),
		) as typeof s.Int,
		mediumint2: s.Int.pipe(
			s.greaterThanOrEqualTo(0),
			s.lessThanOrEqualTo(CONSTANTS.INT24_UNSIGNED_MAX),
		) as typeof s.Int,
		enum: s.Literal('a', 'b', 'c'),
		real: s.Number.pipe(
			s.greaterThanOrEqualTo(CONSTANTS.INT48_MIN),
			s.lessThanOrEqualTo(CONSTANTS.INT48_MAX),
		) as typeof s.Number,
		serial: s.Int.pipe(
			s.greaterThanOrEqualTo(0),
			s.lessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
		) as typeof s.Int,
		smallint1: s.Int.pipe(
			s.greaterThanOrEqualTo(CONSTANTS.INT16_MIN),
			s.lessThanOrEqualTo(CONSTANTS.INT16_MAX),
		) as typeof s.Int,
		smallint2: s.Int.pipe(
			s.greaterThanOrEqualTo(0),
			s.lessThanOrEqualTo(CONSTANTS.INT16_UNSIGNED_MAX),
		) as typeof s.Int,
		text1: s.String.pipe(s.maxLength(CONSTANTS.INT16_UNSIGNED_MAX)) as typeof s.String,
		text2: s.Literal('a', 'b', 'c'),
		time: s.String,
		timestamp1: s.Date,
		timestamp2: s.String,
		tinyint1: s.Int.pipe(
			s.greaterThanOrEqualTo(CONSTANTS.INT8_MIN),
			s.lessThanOrEqualTo(CONSTANTS.INT8_MAX),
		) as typeof s.Int,
		tinyint2: s.Int.pipe(
			s.greaterThanOrEqualTo(0),
			s.lessThanOrEqualTo(CONSTANTS.INT8_UNSIGNED_MAX),
		) as typeof s.Int,
		varchar1: s.String.pipe(s.maxLength(10)) as typeof s.String,
		varchar2: s.Literal('a', 'b', 'c'),
		varbinary: s.String.pipe(s.pattern(/^[01]*$/), s.maxLength(10)) as typeof s.String,
		year: s.Int.pipe(s.greaterThanOrEqualTo(1901), s.lessThanOrEqualTo(2155)) as typeof s.Int,
		longtext1: s.String.pipe(s.maxLength(CONSTANTS.INT32_UNSIGNED_MAX)) as typeof s.String,
		longtext2: s.Literal('a', 'b', 'c'),
		mediumtext1: s.String.pipe(s.maxLength(CONSTANTS.INT24_UNSIGNED_MAX)) as typeof s.String,
		mediumtext2: s.Literal('a', 'b', 'c'),
		tinytext1: s.String.pipe(s.maxLength(CONSTANTS.INT8_UNSIGNED_MAX)) as typeof s.String,
		tinytext2: s.Literal('a', 'b', 'c'),
		vector: s.Array(s.Number).pipe(s.itemsCount(3)) as unknown as s.Array$<typeof s.Number>, // despite `as unknown` conversion, types are compatible
		vector2: s.Array(
			s.BigIntFromSelf.pipe(
				s.greaterThanOrEqualToBigInt(CONSTANTS.INT64_MIN),
				s.lessThanOrEqualToBigInt(CONSTANTS.INT64_MAX),
			) as typeof s.BigIntFromSelf,
		).pipe(s.itemsCount(2)) as unknown as s.Array$<typeof s.BigIntFromSelf>, // despite `as unknown` conversion, types are compatible
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

/* 'Infinitely recursive type'*/ {
	const TopLevelCondition: s.Schema<TopLevelCondition> = s.Any.pipe(s.filter(() => true));

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
	Expect<Equal<s.Schema.Type<typeof result>, s.Schema.Type<typeof expected>>>();
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
