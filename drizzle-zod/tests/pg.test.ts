import test from 'ava';
import { char, date, integer, pgEnum, pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { createInsertSchema, createSelectSchema } from '../src';
import { expectSchemaShape } from './utils';

export const roleEnum = pgEnum('role', ['admin', 'user']);

const users = pgTable('users', {
	a: integer('a').array(),
	id: serial('id').primaryKey(),
	name: text('name'),
	email: text('email').notNull(),
	birthdayString: date('birthday_string').notNull(),
	birthdayDate: date('birthday_date', { mode: 'date' }).notNull(),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	role: roleEnum('role').notNull(),
	roleText: text('role1', { enum: ['admin', 'user'] }).notNull(),
	roleText2: text('role2', { enum: ['admin', 'user'] }).notNull().default('user'),
	profession: varchar('profession', { length: 20 }).notNull(),
	initials: char('initials', { length: 2 }).notNull(),
});

const testUser = {
	a: [1, 2, 3],
	id: 1,
	name: 'John Doe',
	email: 'john.doe@example.com',
	birthdayString: '1990-01-01',
	birthdayDate: new Date('1990-01-01'),
	createdAt: new Date(),
	role: 'admin',
	roleText: 'admin',
	roleText2: 'admin',
	profession: 'Software Engineer',
	initials: 'JD',
};

test('users insert valid user', (t) => {
	const schema = createInsertSchema(users);

	t.is(schema.safeParse(testUser).success, true);
});

test('users insert invalid varchar', (t) => {
	const schema = createInsertSchema(users);

	t.is(schema.safeParse({ ...testUser, profession: 'Chief Executive Officer' }).success, false);
});

test('users insert invalid char', (t) => {
	const schema = createInsertSchema(users);

	t.is(schema.safeParse({ ...testUser, initials: 'JoDo' }).success, false);
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
		birthdayString: z.string(),
		birthdayDate: z.date(),
		createdAt: z.date().optional(),
		role: z.enum(['admin', 'user']),
		roleText: z.enum(['user', 'manager', 'admin']),
		roleText2: z.enum(['admin', 'user']).optional(),
		profession: z.string().max(20).min(1),
		initials: z.string().max(2).min(1),
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
		birthdayString: z.string(),
		birthdayDate: z.date(),
		createdAt: z.date().optional(),
		role: z.enum(['admin', 'user']),
		roleText: z.enum(['admin', 'user']),
		roleText2: z.enum(['admin', 'user']).optional(),
		profession: z.string().max(20).min(1),
		initials: z.string().max(2).min(1),
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
		birthdayString: z.string(),
		birthdayDate: z.date(),
		createdAt: z.date(),
		role: z.enum(['admin', 'user']),
		roleText: z.enum(['user', 'manager', 'admin']),
		roleText2: z.enum(['admin', 'user']),
		profession: z.string().max(20).min(1),
		initials: z.string().max(2).min(1),
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
		birthdayString: z.string(),
		birthdayDate: z.date(),
		createdAt: z.date(),
		role: z.enum(['admin', 'user']),
		roleText: z.enum(['admin', 'user']),
		roleText2: z.enum(['admin', 'user']),
		profession: z.string().max(20).min(1),
		initials: z.string().max(2).min(1),
	});

	expectSchemaShape(t, expected).from(actual);
});
