import type { ExecutionContext } from 'ava';
import test from 'ava';
import { pgEnum, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { createInsertSchema } from '../src';

export const roleEnum = pgEnum('role', ['admin', 'user']);

const users = pgTable('users', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	role: roleEnum('role').notNull(),
	roleText: text('role1', { enum: ['admin', 'user'] }).notNull(),
	roleText2: text('role2', { enum: ['admin', 'user'] }).notNull().default('user'),
});

const users1 = pgTable('users', {
	id: serial('id').primaryKey(),
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

test('users insert schema w/ enum', (t) => {
	const actual = createInsertSchema(users, (schema) => ({
		id: schema.id.positive(),
		email: schema.email.email(),
		roleText: z.enum(['user', 'manager', 'admin']),
	}));

	{
		createInsertSchema(users);
	}

	const expected = z.object({
		id: z.number().positive().optional(),
		name: z.string(),
		email: z.string().email(),
		createdAt: z.date().optional(),
		role: z.enum(['admin', 'user']),
		roleText: z.enum(['user', 'manager', 'admin']),
		roleText2: z.enum(['admin', 'user']).optional(),
	});

	assertSchemasEqual(t, actual, expected);
});

test('users insert schema w/ defaults', (t) => {
	const actual = createInsertSchema(users);

	const expected = z.object({
		id: z.number().optional(),
		name: z.string(),
		email: z.string(),
		createdAt: z.date().optional(),
		role: z.enum(['admin', 'user']),
		roleText: z.enum(['admin', 'user']),
		roleText2: z.enum(['admin', 'user']).optional(),
	});

	assertSchemasEqual(t, actual, expected);
});

test('users1 insert schema w/ defaults', (t) => {
	const actual = createInsertSchema(users1);

	const expected = z.object({
		id: z.number().optional(),
	});

	assertSchemasEqual(t, actual, expected);
});
