import test from 'ava';
import { blob, integer, numeric, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import * as v from "valibot";
import { createInsertSchema, createSelectSchema, jsonSchema } from '../src';
import { expectSchemaShape } from './utils';

const blobJsonSchema = v.object({
	foo: v.string(),
});

const users = sqliteTable('users', {
	id: integer('id').primaryKey(),
	blobJson: blob('blob', { mode: 'json' })
		.$type<v.InferOutput<typeof blobJsonSchema>>()
		.notNull(),
	blobBigInt: blob('blob', { mode: 'bigint' }).notNull(),
	numeric: numeric('numeric').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
	createdAtMs: integer('created_at_ms', { mode: 'timestamp_ms' }).notNull(),
	boolean: integer('boolean', { mode: 'boolean' }).notNull(),
	real: real('real').notNull(),
	text: text('text', { length: 255 }),
	role: text('role', { enum: ['admin', 'user'] })
		.notNull()
		.default('user'),
});

const testUser = {
	id: 1,
	blobJson: { foo: 'bar' },
	blobBigInt: BigInt(123),
	numeric: '123.45',
	createdAt: new Date(),
	createdAtMs: new Date(),
	boolean: true,
	real: 123.45,
	text: 'foobar',
	role: 'admin' as const,
};

test('users insert valid user', (t) => {
	const schema = createInsertSchema(users);
	//
	t.deepEqual(v.parse(schema, testUser), testUser);
});

test('users insert invalid text length', (t) => {
	const schema = createInsertSchema(users);
	t.throws(
		() => v.parse(schema, { ...testUser, text: 'a'.repeat(256) }),
		undefined,
	);
});

test('users insert schema', (t) => {
	const actual = createInsertSchema(users, {
		id: () => v.pipe(v.number(), v.minValue(0)),
		blobJson: blobJsonSchema,
		role: v.picklist(['admin', 'user', 'manager']),
	});

	(() => {
		{
			createInsertSchema(users, {
				// @ts-expect-error (missing property)
				foobar: number(),
			});
		}

		{
			createInsertSchema(users, {
				// @ts-expect-error (invalid type)
				id: 123,
			});
		}
	});

	const expected = v.object({
		id: v.optional(v.pipe(v.number(), v.minValue(0))),
		blobJson: blobJsonSchema,
		blobBigInt: v.bigint(),
		numeric: v.string(),
		createdAt: v.date(),
		createdAtMs: v.date(),
		boolean: v.boolean(),
		real: v.number(),
		text: v.optional(v.nullable(v.string())),
		role: v.optional(v.picklist(['admin', 'user', 'manager'])),
	});

	expectSchemaShape(t, expected).from(actual);
});

test('users insert schema w/ defaults', (t) => {
	const actual = createInsertSchema(users);

	const expected = v.object({
		id: v.optional(v.number()),
		blobJson: jsonSchema,
		blobBigInt: v.bigint(),
		numeric: v.string(),
		createdAt: v.date(),
		createdAtMs: v.date(),
		boolean: v.boolean(),
		real: v.number(),
		text: v.optional(v.nullable(v.string())),
		role: v.optional(v.picklist(['admin', 'user'])),
	});

	expectSchemaShape(t, expected).from(actual);
});

test('users select schema', (t) => {
	const actual = createSelectSchema(users, {
		blobJson: jsonSchema,
		role: v.picklist(['admin', 'user', 'manager']),
	});

	(() => {
		{
			createSelectSchema(users, {
				// @ts-expect-error (missing property)
				foobar: number(),
			});
		}

		{
			createSelectSchema(users, {
				// @ts-expect-error (invalid type)
				id: 123,
			});
		}
	});

	const expected = v.object({
		id: v.number(),
		blobJson: jsonSchema,
		blobBigInt: v.bigint(),
		numeric: v.string(),
		createdAt: v.date(),
		createdAtMs: v.date(),
		boolean: v.boolean(),
		real: v.number(),
		text: v.nullable(v.string()),
		role: v.picklist(['admin', 'user', 'manager']),
	});

	expectSchemaShape(t, expected).from(actual);
});

test('users select schema w/ defaults', (t) => {
	const actual = createSelectSchema(users);

	const expected = v.object({
		id: v.number(),
		blobJson: jsonSchema,
		blobBigInt: v.bigint(),
		numeric: v.string(),
		createdAt: v.date(),
		createdAtMs: v.date(),
		boolean: v.boolean(),
		real: v.number(),
		text: v.nullable(v.string()),
		role: v.picklist(['admin', 'user']),
	});

	expectSchemaShape(t, expected).from(actual);
});
