import test, { ExecutionContext } from 'ava';
import { pgEnum, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { createInsertSchema } from '../src/pg';

export const roleEnum = pgEnum('role', ['admin', 'user']);

const users = pgTable('users', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	role: roleEnum('role').notNull(),
	roleText: text<'admin' | 'user' | 'manager'>('role1').notNull(),
	roleText2: text<'admin' | 'user'>('role1').notNull().default('user'),
});

const users1 = pgTable('users', {
	id: serial('id').primaryKey(),
});

{
	const test = createInsertSchema(users, {
		// @ts-expect-error
		roleText: z.enum(['admin', 'user']),
	});
}

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
	const actual = createInsertSchema(users, {
		id: (id) => id.positive(),
		email: (email) => email.email(),
		roleText: z.enum(['user', 'manager', 'admin']),
	});

	{
		const test = createInsertSchema(users);
	}
	{
		const test = createInsertSchema(users, {
			roleText: z.enum(['admin', 'user', 'manager']),
		});
	}

	const expected = z.object({
		id: z.number().positive().optional(),
		name: z.string(),
		email: z.string().email(),
		createdAt: z.date().optional(),
		role: z.enum(['admin', 'user']),
		roleText: z.enum(['user', 'manager', 'admin']),
		roleText2: z.string().optional(),
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
		roleText: z.string(),
		roleText2: z.string().optional(),
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
