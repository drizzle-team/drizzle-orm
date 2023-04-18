import test from 'ava';
import { integer, pgEnum, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { createInsertSchema, createSelectSchema } from '../src';
import { expectSchemaShape } from './utils';

export const roleEnum = pgEnum('role', ['admin', 'user']);

const users = pgTable('users', {
	a: integer('a').array(),
	id: serial('id').primaryKey(),
	name: text('name'),
	email: text('email').notNull(),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	role: roleEnum('role').notNull(),
	roleText: text('role1', { enum: ['admin', 'user'] }).notNull(),
	roleText2: text('role2', { enum: ['admin', 'user'] }).notNull().default('user'),
});

test('users insert schema', (t) => {
	const actual = createInsertSchema(users, {
		id: ({ id }) => id.positive(),
		email: ({ email }) => email.email(),
		roleText: z.enum(['user', 'manager', 'admin']),
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
		a: z.array(z.number()).nullable().optional(),
		id: z.number().positive().optional(),
		name: z.string().nullable().optional(),
		email: z.string().email(),
		createdAt: z.date().optional(),
		role: z.enum(['admin', 'user']),
		roleText: z.enum(['user', 'manager', 'admin']),
		roleText2: z.enum(['admin', 'user']).optional(),
	});

	expectSchemaShape(t, expected).from(actual);
});

test('users insert schema w/ defaults', (t) => {
	const actual = createInsertSchema(users);

	const expected = z.object({
		a: z.array(z.number()).nullable().optional(),
		id: z.number().optional(),
		name: z.string().nullable().optional(),
		email: z.string(),
		createdAt: z.date().optional(),
		role: z.enum(['admin', 'user']),
		roleText: z.enum(['admin', 'user']),
		roleText2: z.enum(['admin', 'user']).optional(),
	});

	expectSchemaShape(t, expected).from(actual);
});

test('users select schema', (t) => {
	const actual = createSelectSchema(users, {
		id: ({ id }) => id.positive(),
		email: ({ email }) => email.email(),
		roleText: z.enum(['user', 'manager', 'admin']),
	});

	const expected = z.object({
		a: z.array(z.number()).nullable(),
		id: z.number().positive(),
		name: z.string().nullable(),
		email: z.string().email(),
		createdAt: z.date(),
		role: z.enum(['admin', 'user']),
		roleText: z.enum(['user', 'manager', 'admin']),
		roleText2: z.enum(['admin', 'user']),
	});

	expectSchemaShape(t, expected).from(actual);
});

test('users select schema w/ defaults', (t) => {
	const actual = createSelectSchema(users);

	const expected = z.object({
		a: z.array(z.number()).nullable(),
		id: z.number(),
		name: z.string().nullable(),
		email: z.string(),
		createdAt: z.date(),
		role: z.enum(['admin', 'user']),
		roleText: z.enum(['admin', 'user']),
		roleText2: z.enum(['admin', 'user']),
	});

	expectSchemaShape(t, expected).from(actual);
});
