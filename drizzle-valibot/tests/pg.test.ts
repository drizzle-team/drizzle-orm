import test from 'ava';
import { char, date, integer, pgEnum, pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import * as v from 'valibot';
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

	t.deepEqual(v.parse(schema, testUser), testUser);
});

test('users insert invalid varchar', (t) => {
	const schema = createInsertSchema(users);

	t.throws(
		() =>
			v.parse(schema, {
				...testUser,
				profession: 'Chief Executive Officer',
			}),
		undefined,
	);
});

test('users insert invalid char', (t) => {
	const schema = createInsertSchema(users);

	t.throws(() => v.parse(schema, { ...testUser, initials: 'JoDo' }), undefined);
});

test('users insert schema', (t) => {
	const actual = createInsertSchema(users, {
		id: () => v.pipe(v.number(), v.minValue(0)),
		email: () => v.pipe(v.string(), v.email()),
		roleText: v.picklist(['user', 'manager', 'admin']),
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
		a: v.optional(v.nullable(v.array(v.number()))),
		id: v.optional(v.pipe(v.number(), v.minValue(0))),
		name: v.optional(v.nullable(v.string())),
		email: v.string(),
		birthdayString: v.string(),
		birthdayDate: v.date(),
		createdAt: v.optional(v.date()),
		role: v.picklist(['admin', 'user']),
		roleText: v.picklist(['user', 'manager', 'admin']),
		roleText2: v.optional(v.picklist(['admin', 'user'])),
		profession: v.pipe(v.string(), v.maxLength(20)),
		initials: v.pipe(v.string(), v.maxLength(2)),
	});

	expectSchemaShape(t, expected).from(actual);
});

test('users insert schema w/ defaults', (t) => {
	const actual = createInsertSchema(users);

	const expected = v.object({
		a: v.optional(v.nullable(v.array(v.number()))),
		id: v.optional(v.number()),
		name: v.optional(v.nullable(v.string())),
		email: v.string(),
		birthdayString: v.string(),
		birthdayDate: v.date(),
		createdAt: v.optional(v.date()),
		role: v.picklist(['admin', 'user']),
		roleText: v.picklist(['admin', 'user']),
		roleText2: v.optional(v.picklist(['admin', 'user'])),
		profession: v.pipe(v.string(), v.maxLength(20)),
		initials: v.pipe(v.string(), v.maxLength(2)),
	});

	expectSchemaShape(t, expected).from(actual);
});

test('users select schema', (t) => {
	const actual = createSelectSchema(users, {
		id: () => v.pipe(v.number(), v.minValue(0)),
		email: () => v.string(),
		roleText: v.picklist(['user', 'manager', 'admin']),
	});

	const expected = v.object({
		a: v.nullable(v.array(v.number())),
		id: v.pipe(v.number(), v.minValue(0)),
		name: v.nullable(v.string()),
		email: v.string(),
		birthdayString: v.string(),
		birthdayDate: v.date(),
		createdAt: v.date(),
		role: v.picklist(['admin', 'user']),
		roleText: v.picklist(['user', 'manager', 'admin']),
		roleText2: v.picklist(['admin', 'user']),
		profession: v.pipe(v.string(), v.maxLength(20)),
		initials: v.pipe(v.string(), v.maxLength(2)),
	});

	expectSchemaShape(t, expected).from(actual);
});

test('users select schema w/ defaults', (t) => {
	const actual = createSelectSchema(users);

	const expected = v.object({
		a: v.nullable(v.array(v.number())),
		id: v.number(),
		name: v.nullable(v.string()),
		email: v.string(),
		birthdayString: v.string(),
		birthdayDate: v.date(),
		createdAt: v.date(),
		role: v.picklist(['admin', 'user']),
		roleText: v.picklist(['admin', 'user']),
		roleText2: v.picklist(['admin', 'user']),
		profession: v.pipe(v.string(), v.maxLength(20)),
		initials: v.pipe(v.string(), v.maxLength(2)),
	});

	expectSchemaShape(t, expected).from(actual);
});
