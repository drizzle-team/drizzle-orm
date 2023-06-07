import test from 'ava';
import { blob, integer, numeric, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { z } from 'zod';
import { createInsertSchema, createSelectSchema, jsonSchema } from '../src';
import { expectSchemaShape } from './utils';

const blobJsonSchema = z.object({
	foo: z.string(),
});

const users = sqliteTable('users', {
	id: integer('id').primaryKey(),
	blobJson: blob('blob', { mode: 'json' }).$type<z.infer<typeof blobJsonSchema>>().notNull(),
	blobBigInt: blob('blob', { mode: 'bigint' }).notNull(),
	numeric: numeric('numeric').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
	createdAtMs: integer('created_at_ms', { mode: 'timestamp_ms' }).notNull(),
	real: real('real').notNull(),
	text: text('text', { length: 255 }),
	role: text('role', { enum: ['admin', 'user'] }).notNull().default('user'),
});

const testUser = {
	id: 1,
	blobJson: { foo: 'bar' },
	blobBigInt: BigInt(123),
	numeric: '123.45',
	createdAt: new Date(),
	createdAtMs: new Date(),
	real: 123.45,
	text: 'foobar',
	role: 'admin',
};

test('users insert valid user', (t) => {
	const schema = createInsertSchema(users);

	t.is(schema.safeParse(testUser).success, true);
});

test('users insert invalid text length', (t) => {
	const schema = createInsertSchema(users);

	t.is(schema.safeParse({ ...testUser, text: 'a'.repeat(256) }).success, false);
});

test('users insert schema', (t) => {
	const actual = createInsertSchema(users, {
		id: ({ id }) => id.positive(),
		blobJson: blobJsonSchema,
		role: z.enum(['admin', 'manager', 'user']),
	});

	(() => {
		{
			createInsertSchema(users, {
				// @ts-expect-error (missing property)
				foobar: z.number(),
			});
		}

		{
			createInsertSchema(users, {
				// @ts-expect-error (invalid type)
				id: 123,
			});
		}
	});

	const expected = z.object({
		id: z.number().positive().optional(),
		blobJson: blobJsonSchema,
		blobBigInt: z.bigint(),
		numeric: z.string(),
		createdAt: z.date(),
		createdAtMs: z.date(),
		real: z.number(),
		text: z.string().nullable().optional(),
		role: z.enum(['admin', 'manager', 'user']).optional(),
	});

	expectSchemaShape(t, expected).from(actual);
});

test('users insert schema w/ defaults', (t) => {
	const actual = createInsertSchema(users);

	const expected = z.object({
		id: z.number().optional(),
		blobJson: jsonSchema,
		blobBigInt: z.bigint(),
		numeric: z.string(),
		createdAt: z.date(),
		createdAtMs: z.date(),
		real: z.number(),
		text: z.string().nullable().optional(),
		role: z.enum(['admin', 'user']).optional(),
	});

	expectSchemaShape(t, expected).from(actual);
});

test('users select schema', (t) => {
	const actual = createSelectSchema(users, {
		blobJson: jsonSchema,
		role: z.enum(['admin', 'manager', 'user']),
	});

	(() => {
		{
			createSelectSchema(users, {
				// @ts-expect-error (missing property)
				foobar: z.number(),
			});
		}

		{
			createSelectSchema(users, {
				// @ts-expect-error (invalid type)
				id: 123,
			});
		}
	});

	const expected = z.object({
		id: z.number(),
		blobJson: jsonSchema,
		blobBigInt: z.bigint(),
		numeric: z.string(),
		createdAt: z.date(),
		createdAtMs: z.date(),
		real: z.number(),
		text: z.string().nullable(),
		role: z.enum(['admin', 'manager', 'user']),
	}).required();

	expectSchemaShape(t, expected).from(actual);
});

test('users select schema w/ defaults', (t) => {
	const actual = createSelectSchema(users);

	const expected = z.object({
		id: z.number(),
		blobJson: jsonSchema,
		blobBigInt: z.bigint(),
		numeric: z.string(),
		createdAt: z.date(),
		createdAtMs: z.date(),
		real: z.number(),
		text: z.string().nullable(),
		role: z.enum(['admin', 'user']),
	}).required();

	expectSchemaShape(t, expected).from(actual);
});
