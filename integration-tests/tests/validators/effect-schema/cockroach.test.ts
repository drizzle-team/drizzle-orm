import { sql } from 'drizzle-orm';
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
import { CONSTANTS } from 'drizzle-orm/validations/constants';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-orm/validations/effect';
import { jsonSchema } from 'drizzle-orm/validations/effect/column';
import { Schema as s } from 'effect';
import type { TopLevelCondition } from 'json-rules-engine';
import { afterAll, test } from 'vitest';
import { Equal, Expect } from '~/utils';
import { expectEnumValues, expectSchemaShape } from './utils';

const int4Schema = s.Int.pipe(
	s.greaterThanOrEqualTo(CONSTANTS.INT32_MIN),
	s.lessThanOrEqualTo(CONSTANTS.INT32_MAX),
) as typeof s.Int;
const int4NullableSchema = s.NullOr(int4Schema);
const int4OptionalSchema = s.optional(s.UndefinedOr(int4Schema));
const int4NullableOptionalSchema = s.optional(s.UndefinedOr(s.NullOr(int4Schema)));

const textSchema = s.String;
const textOptionalSchema = s.optional(s.UndefinedOr(textSchema));

const anySchema = s.Any;

const extendedSchema = int4Schema.pipe(s.lessThanOrEqualTo(1000));
const extendedNullableSchema = s.NullOr(extendedSchema);
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
	const table = cockroachTable('test', {
		id: int4().primaryKey(),
		generated: int4().generatedAlwaysAsIdentity(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = s.Struct({ id: int4Schema, generated: int4Schema, name: textSchema });

	expectSchemaShape(t, expected).from(result);
	Expect<Equal<s.Schema.Type<typeof result>, s.Schema.Type<typeof expected>>>();
});

test('table in schema - select', (tc) => {
	const schema = cockroachSchema('test');
	const table = schema.table('test', {
		id: int4().primaryKey(),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = s.Struct({ id: int4Schema, name: textSchema });
	expectSchemaShape(tc, expected).from(result);
	Expect<Equal<s.Schema.Type<typeof result>, s.Schema.Type<typeof expected>>>();
});

test('table - insert', (t) => {
	const table = cockroachTable('test', {
		id: int4().generatedAlwaysAsIdentity().primaryKey(),
		name: text().notNull(),
		age: int4(),
	});

	const result = createInsertSchema(table);
	const expected = s.Struct({ name: textSchema, age: int4NullableOptionalSchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<s.Schema.Type<typeof result>, s.Schema.Type<typeof expected>>>();
});

test('table - update', (t) => {
	const table = cockroachTable('test', {
		id: int4().generatedAlwaysAsIdentity().primaryKey(),
		name: text().notNull(),
		age: int4(),
	});

	const result = createUpdateSchema(table);
	const expected = s.Struct({
		name: textOptionalSchema,
		age: int4NullableOptionalSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<s.Schema.Type<typeof result>, s.Schema.Type<typeof expected>>>();
});

test('view qb - select', (t) => {
	const table = cockroachTable('test', {
		id: int4().primaryKey(),
		name: text().notNull(),
	});
	const view = cockroachView('test').as((qb) => qb.select({ id: table.id, age: sql``.as('age') }).from(table));

	const result = createSelectSchema(view);
	const expected = s.Struct({ id: int4Schema, age: anySchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<s.Schema.Type<typeof result>, s.Schema.Type<typeof expected>>>();
});

test('view columns - select', (t) => {
	const view = cockroachView('test', {
		id: int4().primaryKey(),
		name: text().notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = s.Struct({ id: int4Schema, name: textSchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<s.Schema.Type<typeof result>, s.Schema.Type<typeof expected>>>();
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
	const expected = s.Struct({ id: int4Schema, age: anySchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<s.Schema.Type<typeof result>, s.Schema.Type<typeof expected>>>();
});

test('materialized view columns - select', (t) => {
	const view = cockroachMaterializedView('test', {
		id: int4().primaryKey(),
		name: text().notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = s.Struct({ id: int4Schema, name: textSchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<s.Schema.Type<typeof result>, s.Schema.Type<typeof expected>>>();
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
	const expected = s.Struct({
		id: int4Schema,
		nested: s.Struct({ name: textSchema, age: anySchema }),
		table: s.Struct({ id: int4Schema, name: textSchema }),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<s.Schema.Type<typeof result>, s.Schema.Type<typeof expected>>>();
});

test('enum - select', (t) => {
	const enum_ = cockroachEnum('test', ['a', 'b', 'c']);

	const result = createSelectSchema(enum_);
	const expected = s.Literal('a', 'b', 'c');
	expectEnumValues(t, expected).from(result);
	Expect<Equal<s.Schema.Type<typeof result>, s.Schema.Type<typeof expected>>>();
});

test('nullability - select', (t) => {
	const table = cockroachTable('test', {
		c1: int4(),
		c2: int4().notNull(),
		c3: int4().default(1),
		c4: int4().notNull().default(1),
	});

	const result = createSelectSchema(table);
	const expected = s.Struct({
		c1: int4NullableSchema,
		c2: int4Schema,
		c3: int4NullableSchema,
		c4: int4Schema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<s.Schema.Type<typeof result>, s.Schema.Type<typeof expected>>>();
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
	const expected = s.Struct({
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
	const expected = s.Struct({
		c1: int4NullableOptionalSchema,
		c2: int4OptionalSchema,
		c3: int4NullableOptionalSchema,
		c4: int4OptionalSchema,
		c7: int4OptionalSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<s.Schema.Type<typeof result>, s.Schema.Type<typeof expected>>>();
});

test('refine table - select', (t) => {
	const table = cockroachTable('test', {
		c1: int4(),
		c2: int4().notNull(),
		c3: int4().notNull(),
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
		})),
	});
	const expected = s.Struct({
		c1: int4NullableSchema,
		c2: extendedSchema,
		c3: customSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<s.Schema.Type<typeof result>, s.Schema.Type<typeof expected>>>();
});

test('refine table - select with custom data type', (t) => {
	const customText = customType({ dataType: () => 'text' });
	const table = cockroachTable('test', {
		c1: int4(),
		c2: int4().notNull(),
		c3: int4().notNull(),
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
		})),
		c4: customTextSchema,
	});
	const expected = s.Struct({
		c1: int4NullableSchema,
		c2: extendedSchema,
		c3: customSchema,
		c4: customTextSchema,
	});

	expectSchemaShape(t, expected).from(result);
	Expect<Equal<s.Schema.Type<typeof result>, s.Schema.Type<typeof expected>>>();
});

test('refine table - insert', (t) => {
	const table = cockroachTable('test', {
		c1: int4(),
		c2: int4().notNull(),
		c3: int4().notNull(),
		c4: int4().generatedAlwaysAs(1),
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
		})),
	});
	const expected = s.Struct({
		c1: int4NullableOptionalSchema,
		c2: extendedSchema,
		c3: customSchema,
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<s.Schema.Type<typeof result>, s.Schema.Type<typeof expected>>>();
});

test('refine table - update', (t) => {
	const table = cockroachTable('test', {
		c1: int4(),
		c2: int4().notNull(),
		c3: int4().notNull(),
		c4: int4().generatedAlwaysAs(1),
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
		})),
	});
	const expected = s.Struct({
		c1: int4NullableOptionalSchema,
		c2: extendedOptionalSchema,
		c3: customSchema,
	});

	expectSchemaShape(t, expected).from(result);
	Expect<Equal<s.Schema.Type<typeof result>, s.Schema.Type<typeof expected>>>();
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
		c2: (schema) => schema.pipe(s.lessThanOrEqualTo(1000)),
		c3: s.String.pipe(s.transform(s.Number, {
			decode(v) {
				return Number(v);
			},
			encode(v) {
				return String(v);
			},
		})),
		nested: {
			c5: (schema) => schema.pipe(s.lessThanOrEqualTo(1000)),
			c6: s.String.pipe(s.transform(s.Number, {
				decode(v) {
					return Number(v);
				},
				encode(v) {
					return String(v);
				},
				strict: true,
			})),
		},
		table: {
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
		},
	});
	const expected = s.Struct({
		c1: int4NullableSchema,
		c2: extendedNullableSchema,
		c3: customSchema,
		nested: s.Struct({
			c4: int4NullableSchema,
			c5: extendedNullableSchema,
			c6: customSchema,
		}),
		table: s.Struct({
			c1: int4NullableSchema,
			c2: extendedNullableSchema,
			c3: customSchema,
			c4: int4NullableSchema,
			c5: int4NullableSchema,
			c6: int4NullableSchema,
		}),
	});
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<s.Schema.Type<typeof result>, s.Schema.Type<typeof expected>>>();
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
	const expected = s.Struct({
		bigint1: s.Int.pipe(
			s.greaterThanOrEqualTo(Number.MIN_SAFE_INTEGER),
			s.lessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
		) as typeof s.Int,
		bigint2: s.BigIntFromSelf.pipe(
			s.greaterThanOrEqualToBigInt(CONSTANTS.INT64_MIN),
			s.lessThanOrEqualToBigInt(CONSTANTS.INT64_MAX),
		) as typeof s.BigIntFromSelf,
		bit: s.String.pipe(s.pattern(/^[01]*$/), s.length(5 as number)) as typeof s.String,
		boolean: s.Boolean,
		char1: s.String.pipe(s.maxLength(10 as number)) as typeof s.String,
		char2: s.Literal('a', 'b', 'c'),
		date1: s.Date,
		date2: s.String,
		decimal1: s.Number.pipe(
			s.greaterThanOrEqualTo(Number.MIN_SAFE_INTEGER),
			s.lessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
		) as typeof s.Number,
		decimal2: s.BigIntFromSelf.pipe(
			s.greaterThanOrEqualToBigInt(CONSTANTS.INT64_MIN),
			s.lessThanOrEqualToBigInt(CONSTANTS.INT64_MAX),
		) as typeof s.BigIntFromSelf,
		decimal3: s.String,
		float: s.Number.pipe(
			s.greaterThanOrEqualTo(CONSTANTS.INT48_MIN),
			s.lessThanOrEqualTo(CONSTANTS.INT48_MAX),
		) as typeof s.Number,
		doublePrecision: s.Number.pipe(
			s.greaterThanOrEqualTo(CONSTANTS.INT48_MIN),
			s.lessThanOrEqualTo(CONSTANTS.INT48_MAX),
		) as typeof s.Number,
		geometry1: s.Tuple(s.Number, s.Number),
		geometry2: s.Struct({ x: s.Number, y: s.Number }),
		inet: s.String,
		int2: s.Int.pipe(
			s.greaterThanOrEqualTo(CONSTANTS.INT16_MIN),
			s.lessThanOrEqualTo(CONSTANTS.INT16_MAX),
		) as typeof s.Int,
		int4: s.Int.pipe(
			s.greaterThanOrEqualTo(CONSTANTS.INT32_MIN),
			s.lessThanOrEqualTo(CONSTANTS.INT32_MAX),
		) as typeof s.Int,
		int8_1: s.Int.pipe(
			s.greaterThanOrEqualTo(Number.MIN_SAFE_INTEGER),
			s.lessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
		) as typeof s.Int,
		int8_2: s.BigIntFromSelf.pipe(
			s.greaterThanOrEqualToBigInt(CONSTANTS.INT64_MIN),
			s.lessThanOrEqualToBigInt(CONSTANTS.INT64_MAX),
		) as typeof s.BigIntFromSelf,
		interval: s.String,
		jsonb: jsonSchema,
		numeric1: s.Number.pipe(
			s.greaterThanOrEqualTo(Number.MIN_SAFE_INTEGER),
			s.lessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
		) as typeof s.Number,
		numeric2: s.BigIntFromSelf.pipe(
			s.greaterThanOrEqualToBigInt(CONSTANTS.INT64_MIN),
			s.lessThanOrEqualToBigInt(CONSTANTS.INT64_MAX),
		) as typeof s.BigIntFromSelf,
		numeric3: s.String,
		real: s.Number.pipe(
			s.greaterThanOrEqualTo(CONSTANTS.INT24_MIN),
			s.lessThanOrEqualTo(CONSTANTS.INT24_MAX),
		) as typeof s.Number,
		smallint: s.Int.pipe(
			s.greaterThanOrEqualTo(CONSTANTS.INT16_MIN),
			s.lessThanOrEqualTo(CONSTANTS.INT16_MAX),
		) as typeof s.Int,
		string1: s.String,
		string2: s.Literal('a', 'b', 'c'),
		text1: s.String,
		text2: s.Literal('a', 'b', 'c'),
		time: s.String,
		timestamp1: s.Date,
		timestamp2: s.String,
		uuid: s.UUID,
		varchar1: s.String.pipe(s.maxLength(10 as number)) as typeof s.String,
		varchar2: s.Literal('a', 'b', 'c'),
		vector: s.Array(s.Number).pipe(s.itemsCount(3)) as unknown as s.Array$<typeof s.Number>, // despite `as unknown` conversion, types are compatible
		array: s.Array(int4Schema),
	});

	expectSchemaShape(t, expected).from(result);
	Expect<Equal<s.Schema.Type<typeof result>, s.Schema.Type<typeof expected>>>;
});

/* 'Infinitely recursive type'*/ {
	const TopLevelCondition: s.Schema<TopLevelCondition> = s.Any.pipe(s.filter(() => true));

	const column = customType<{
		data: TopLevelCondition;
	}>({
		dataType: () => 'object TopLevelCondition',
	});
	const table = cockroachTable('test', {
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
	const table = cockroachTable('test', { id: int4() });
	// @ts-expect-error
	createSelectSchema(table, { unknown: s.String });
}

/* Disallow unknown keys in table refinement - insert */ {
	const table = cockroachTable('test', { id: int4() });
	// @ts-expect-error
	createInsertSchema(table, { unknown: s.String });
}

/* Disallow unknown keys in table refinement - update */ {
	const table = cockroachTable('test', { id: int4() });
	// @ts-expect-error
	createUpdateSchema(table, { unknown: s.String });
}

/* Disallow unknown keys in view qb - select */ {
	const table = cockroachTable('test', { id: int4() });
	const view = cockroachView('test').as((qb) => qb.select().from(table));
	const mView = cockroachMaterializedView('test').as((qb) => qb.select().from(table));
	const nestedSelect = cockroachView('test').as((qb) => qb.select({ table }).from(table));
	// @ts-expect-error
	createSelectSchema(view, { unknown: s.String });
	// @ts-expect-error
	createSelectSchema(mView, { unknown: s.String });
	// @ts-expect-error
	createSelectSchema(nestedSelect, { table: { unknown: s.String } });
}

/* Disallow unknown keys in view columns - select */ {
	const view = cockroachView('test', { id: int4() }).as(sql``);
	const mView = cockroachView('test', { id: int4() }).as(sql``);
	// @ts-expect-error
	createSelectSchema(view, { unknown: s.String });
	// @ts-expect-error
	createSelectSchema(mView, { unknown: s.String });
}
