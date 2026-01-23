import { sql } from 'drizzle-orm';
import { blob, customType, int, sqliteTable, sqliteView, text } from 'drizzle-orm/sqlite-core';
import { CONSTANTS } from 'drizzle-orm/validations/constants';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-orm/validations/effect';
import { bufferSchema, jsonSchema } from 'drizzle-orm/validations/effect/column';
import { Schema as s } from 'effect';
import type { TopLevelCondition } from 'json-rules-engine';
import { test } from 'vitest';
import { Equal, Expect } from '~/utils';
import { expectEnumValues, expectSchemaShape } from './utils';

const intSchema = s.Int.pipe(
	s.greaterThanOrEqualTo(Number.MIN_SAFE_INTEGER),
	s.lessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
) as typeof s.Int;
const intNullableSchema = s.NullOr(intSchema);
const intOptionalSchema = s.optional(s.UndefinedOr(intSchema));
const intNullableOptionalSchema = s.optional(s.UndefinedOr(s.NullOr(intSchema)));

const textSchema = s.String;
const textOptionalSchema = s.optional(s.UndefinedOr(textSchema));

const anySchema = s.Any;

const extendedSchema = intSchema.pipe(s.lessThanOrEqualTo(1000));
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
	const table = sqliteTable('test', {
		id: int().primaryKey({ autoIncrement: true }),
		name: text().notNull(),
	});

	const result = createSelectSchema(table);
	const expected = s.Struct({ id: intSchema, name: textSchema });
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
	const expected = s.Struct({ id: intOptionalSchema, name: textSchema, age: intNullableOptionalSchema });
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
	const expected = s.Struct({
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
	const expected = s.Struct({ id: intSchema, age: anySchema });
	expectSchemaShape(t, expected).from(result);
	Expect<Equal<typeof result, typeof expected>>();
});

test('view columns - select', (t) => {
	const view = sqliteView('test', {
		id: int().primaryKey({ autoIncrement: true }),
		name: text().notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = s.Struct({ id: intSchema, name: textSchema });
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
	const expected = s.Struct({
		id: intSchema,
		nested: s.Struct({ name: textSchema, age: anySchema }),
		table: s.Struct({ id: intSchema, name: textSchema }),
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
	const table = sqliteTable('test', {
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
	const table = sqliteTable('test', {
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
	const table = sqliteTable('test', {
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
	const table = sqliteTable('test', {
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
	const table = sqliteTable('test', {
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
	const table = sqliteTable('test', {
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
		c1: intNullableSchema,
		c2: extendedNullableSchema,
		c3: customSchema,
		nested: s.Struct({
			c4: intNullableSchema,
			c5: extendedNullableSchema,
			c6: customSchema,
		}),
		table: s.Struct({
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
	const expected = s.Struct({
		blob1: bufferSchema,
		blob2: s.BigIntFromSelf.pipe(
			s.greaterThanOrEqualToBigInt(CONSTANTS.INT64_MIN),
			s.lessThanOrEqualToBigInt(CONSTANTS.INT64_MAX),
		) as typeof s.BigIntFromSelf,
		blob3: jsonSchema,
		integer1: s.Int.pipe(
			s.greaterThanOrEqualTo(Number.MIN_SAFE_INTEGER),
			s.lessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
		) as typeof s.Int,
		integer2: s.Boolean,
		integer3: s.Date,
		integer4: s.Date,
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
			s.greaterThanOrEqualTo(CONSTANTS.INT48_MIN),
			s.lessThanOrEqualTo(CONSTANTS.INT48_MAX),
		) as typeof s.Number,
		text1: s.String,
		text2: s.String.pipe(s.maxLength(10)) as typeof s.String,
		text3: s.Literal('a', 'b', 'c'),
		text4: jsonSchema,
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
	const table = sqliteTable('test', {
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
	const table = sqliteTable('test', { id: int() });
	// @ts-expect-error
	createSelectSchema(table, { unknown: s.String });
}

/* Disallow unknown keys in table refinement - insert */ {
	const table = sqliteTable('test', { id: int() });
	// @ts-expect-error
	createInsertSchema(table, { unknown: s.String });
}

/* Disallow unknown keys in table refinement - update */ {
	const table = sqliteTable('test', { id: int() });
	// @ts-expect-error
	createUpdateSchema(table, { unknown: s.String });
}

/* Disallow unknown keys in view qb - select */ {
	const table = sqliteTable('test', { id: int() });
	const view = sqliteView('test').as((qb) => qb.select().from(table));
	const nestedSelect = sqliteView('test').as((qb) => qb.select({ table }).from(table));
	// @ts-expect-error
	createSelectSchema(view, { unknown: s.String });
	// @ts-expect-error
	createSelectSchema(nestedSelect, { table: { unknown: s.String } });
}

/* Disallow unknown keys in view columns - select */ {
	const view = sqliteView('test', { id: int() }).as(sql``);
	// @ts-expect-error
	createSelectSchema(view, { unknown: s.String });
}
