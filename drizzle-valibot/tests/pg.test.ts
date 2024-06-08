import test from 'ava';
import { char, date, integer, pgEnum, pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import {
	array,
	date as valiDate,
	email,
	maxLength,
	minLength,
	minValue,
	nullable,
	number,
	object,
	optional,
	parse,
	picklist,
	string,
    pipe,
} from 'valibot';
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
	roleText2: text('role2', { enum: ['admin', 'user'] })
		.notNull()
		.default('user'),
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
	role: 'admin' as const,
	roleText: 'admin' as const,
	roleText2: 'admin' as const,
	profession: 'Software Engineer',
	initials: 'JD',
};

test('users insert valid user', (t) => {
	const schema = createInsertSchema(users);

	t.deepEqual(parse(schema, testUser), testUser);
});

test('users insert invalid varchar', (t) => {
	const schema = createInsertSchema(users);

	t.throws(
		() =>
			parse(schema, {
				...testUser,
				profession: 'Chief Executive Officer',
			}),
		undefined,
	);
});

test('users insert invalid char', (t) => {
	const schema = createInsertSchema(users);

	t.throws(() => parse(schema, { ...testUser, initials: 'JoDo' }), undefined);
});

test('users insert schema', (t) => {
	const actual = createInsertSchema(users, {
		id: () => pipe(number(), minValue(0)),
		email: () => pipe(string(), email()),
		roleText: picklist(['user', 'manager', 'admin']),
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

	const expected = object({
		a: optional(nullable(array(number()))),
		id: optional(pipe(number(), minValue(0))),
		name: optional(nullable(string())),
		email: string(),
		birthdayString: string(),
		birthdayDate: valiDate(),
		createdAt: optional(valiDate()),
		role: picklist(['admin', 'user']),
		roleText: picklist(['user', 'manager', 'admin']),
		roleText2: optional(picklist(['admin', 'user'])),
		profession: pipe(string(), maxLength(20), minLength(1)),
		initials: pipe(string(), maxLength(2), minLength(1)),
	});

	expectSchemaShape(t, expected).from(actual);
});

test('users insert schema w/ defaults', (t) => {
	const actual = createInsertSchema(users);

	const expected = object({
		a: optional(nullable(array(number()))),
		id: optional(number()),
		name: optional(nullable(string())),
		email: string(),
		birthdayString: string(),
		birthdayDate: valiDate(),
		createdAt: optional(valiDate()),
		role: picklist(['admin', 'user']),
		roleText: picklist(['admin', 'user']),
		roleText2: optional(picklist(['admin', 'user'])),
		profession: pipe(string(), maxLength(20), minLength(1)),
		initials: pipe(string(), maxLength(2), minLength(1)),
	});

	expectSchemaShape(t, expected).from(actual);
});

test('users select schema', (t) => {
	const actual = createSelectSchema(users, {
		id: () => pipe(number(), minValue(0)),
		email: () => string(),
		roleText: picklist(['user', 'manager', 'admin']),
	});

	const expected = object({
		a: nullable(array(number())),
		id: pipe(number(), minValue(0)),
		name: nullable(string()),
		email: string(),
		birthdayString: string(),
		birthdayDate: valiDate(),
		createdAt: valiDate(),
		role: picklist(['admin', 'user']),
		roleText: picklist(['user', 'manager', 'admin']),
		roleText2: picklist(['admin', 'user']),
		profession: pipe(string(), maxLength(20), minLength(1)),
		initials: pipe(string(), maxLength(2), minLength(1)),
	});

	expectSchemaShape(t, expected).from(actual);
});

test('users select schema w/ defaults', (t) => {
	const actual = createSelectSchema(users);

	const expected = object({
		a: nullable(array(number())),
		id: number(),
		name: nullable(string()),
		email: string(),
		birthdayString: string(),
		birthdayDate: valiDate(),
		createdAt: valiDate(),
		role: picklist(['admin', 'user']),
		roleText: picklist(['admin', 'user']),
		roleText2: picklist(['admin', 'user']),
		profession: pipe(string(), maxLength(20), minLength(1)),
		initials: pipe(string(), maxLength(2), minLength(1)),
	});

	expectSchemaShape(t, expected).from(actual);
});
