import type { ExecutionContext } from 'ava';
import test from 'ava';
import { blob, integer, numeric, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { z } from 'zod';
import { createInsertSchema, createSelectSchema, jsonSchema } from '../src';

const blobJsonSchema = z.object({
	foo: z.string(),
});

const users = sqliteTable('users', {
	id: integer('id').primaryKey(),
	blobJson: blob('blob', { mode: 'json' }).$type<z.infer<typeof blobJsonSchema>>().notNull(),
	numeric: numeric('numeric').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
	createdAtMs: integer('created_at_ms', { mode: 'timestamp_ms' }).notNull(),
	real: real('real').notNull(),
	text: text('text'),
	role: text('role', { enum: ['admin', 'user'] }).notNull().default('user'),
});

function assertSchemasEqual<T extends z.SomeZodObject>(t: ExecutionContext, actual: T, expected: T) {
	t.deepEqual(Object.keys(actual.shape), Object.keys(expected.shape));

	Object.keys(actual.shape).forEach((key) => {
		t.deepEqual(actual.shape[key]!._def.typeName, expected.shape[key]?._def.typeName);
		if (actual.shape[key] instanceof z.ZodOptional) {
			t.deepEqual(actual.shape[key]!._def.innerType._def.typeName, expected.shape[key]!._def.innerType._def.typeName);
		}
	});
}

test('users insert schema', (t) => {
	const actual = createInsertSchema(users, {
		id: ({ id }) => id.positive(),
		blobJson: blobJsonSchema,
		role: z.enum(['admin', 'manager', 'user']),
	});

	(() => {
		{
			createInsertSchema(users, {
				// @ts-expect-error
				foobar: z.number(),
			});
		}

		{
			createInsertSchema(users, {
				// @ts-expect-error
				id: 123,
			});
		}
	});

	const expected = z.object({
		id: z.number().positive().optional(),
		blobJson: blobJsonSchema,
		numeric: z.string(),
		createdAt: z.date(),
		createdAtMs: z.date(),
		real: z.number(),
		text: z.string(),
		role: z.enum(['admin', 'manager', 'user']).optional(),
	});

	assertSchemasEqual(t, actual, expected);
});

test('users insert schema w/ defaults', (t) => {
	const actual = createInsertSchema(users);

	const expected = z.object({
		id: z.number().optional(),
		blobJson: jsonSchema,
		numeric: z.string(),
		createdAt: z.date(),
		createdAtMs: z.date(),
		real: z.number(),
		text: z.string(),
		role: z.enum(['admin', 'user']).optional(),
	});

	assertSchemasEqual(t, actual, expected);
});

test('users select schema', (t) => {
	const actual = createSelectSchema(users, {
		blobJson: jsonSchema,
		role: z.enum(['admin', 'manager', 'user']),
	});

	(() => {
		{
			createSelectSchema(users, {
				// @ts-expect-error
				foobar: z.number(),
			});
		}

		{
			createSelectSchema(users, {
				// @ts-expect-error
				id: 123,
			});
		}
	});

	const expected = z.object({
		id: z.number(),
		blobJson: jsonSchema,
		numeric: z.string(),
		createdAt: z.date(),
		createdAtMs: z.date(),
		real: z.number(),
		text: z.string().nullable(),
		role: z.enum(['admin', 'manager', 'user']),
	}).required();

	assertSchemasEqual(t, actual, expected);
});

test('users select schema w/ defaults', (t) => {
	const actual = createSelectSchema(users);

	const expected = z.object({
		id: z.number(),
		blobJson: jsonSchema,
		numeric: z.string(),
		createdAt: z.date(),
		createdAtMs: z.date(),
		real: z.number(),
		text: z.string().nullable(),
		role: z.enum(['admin', 'user']),
	}).required();

	assertSchemasEqual(t, actual, expected);
});
