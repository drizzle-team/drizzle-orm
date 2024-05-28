import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import test from 'ava';
import { char, date, integer, pgEnum, pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema, Nullable } from '../src';
import { expectSchemaShape } from './utils.ts';

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
	role: 'admin',
	roleText: 'admin',
	roleText2: 'admin',
	profession: 'Software Engineer',
	initials: 'JD',
};

test('users insert valid user', (t) => {
	const schema = createInsertSchema(users);

	t.is(Value.Check(schema, testUser), true);
});

test('users insert invalid varchar', (t) => {
	const schema = createInsertSchema(users);

	t.is(
		Value.Check(schema, {
			...testUser,
			profession: 'Chief Executive Officer',
		}),
		false,
	);
});

test('users insert invalid char', (t) => {
	const schema = createInsertSchema(users);

	t.is(Value.Check(schema, { ...testUser, initials: 'JoDo' }), false);
});

test('users insert schema', (t) => {
	const actual = createInsertSchema(users, {
		id: () => Type.Number({ minimum: 0 }),
		email: () => Type.String(),
		roleText: Type.Union([
			Type.Literal('user'),
			Type.Literal('manager'),
			Type.Literal('admin'),
		]),
	});

	(() => {
		{
			createInsertSchema(users, {
				// @ts-expect-error (missing property)
				foobar: Type.Number(),
			});
		}

		{
			createInsertSchema(users, {
				// @ts-expect-error (invalid type)
				id: 123,
			});
		}
	});

	const expected = Type.Object({
		a: Type.Optional(Nullable(Type.Array(Type.Number()))),
		id: Type.Optional(Type.Number({ minimum: 0 })),
		name: Type.Optional(Nullable(Type.String())),
		email: Type.String(),
		birthdayString: Type.String(),
		birthdayDate: Type.Date(),
		createdAt: Type.Optional(Type.Date()),
		role: Type.Union([Type.Literal('admin'), Type.Literal('user')]),
		roleText: Type.Union([
			Type.Literal('user'),
			Type.Literal('manager'),
			Type.Literal('admin'),
		]),
		roleText2: Type.Optional(
			Type.Union([Type.Literal('admin'), Type.Literal('user')]),
		),
		profession: Type.String({ maxLength: 20, minLength: 1 }),
		initials: Type.String({ maxLength: 2, minLength: 1 }),
	});

	expectSchemaShape(t, expected).from(actual);
});

test('users insert schema w/ defaults', (t) => {
	const actual = createInsertSchema(users);

	const expected = Type.Object({
		a: Type.Optional(Nullable(Type.Array(Type.Number()))),
		id: Type.Optional(Type.Number()),
		name: Type.Optional(Nullable(Type.String())),
		email: Type.String(),
		birthdayString: Type.String(),
		birthdayDate: Type.Date(),
		createdAt: Type.Optional(Type.Date()),
		role: Type.Union([Type.Literal('admin'), Type.Literal('user')]),
		roleText: Type.Union([Type.Literal('admin'), Type.Literal('user')]),
		roleText2: Type.Optional(
			Type.Union([Type.Literal('admin'), Type.Literal('user')]),
		),
		profession: Type.String({ maxLength: 20, minLength: 1 }),
		initials: Type.String({ maxLength: 2, minLength: 1 }),
	});

	expectSchemaShape(t, expected).from(actual);
});

test('users select schema', (t) => {
	const actual = createSelectSchema(users, {
		id: () => Type.Number({ minimum: 0 }),
		email: () => Type.String(),
		roleText: Type.Union([
			Type.Literal('admin'),
			Type.Literal('user'),
			Type.Literal('manager'),
		]),
	});

	const expected = Type.Object({
		a: Nullable(Type.Array(Type.Number())),
		id: Type.Number({ minimum: 0 }),
		name: Nullable(Type.String()),
		email: Type.String(),
		birthdayString: Type.String(),
		birthdayDate: Type.Date(),
		createdAt: Type.Date(),
		role: Type.Union([Type.Literal('admin'), Type.Literal('user')]),
		roleText: Type.Union([
			Type.Literal('admin'),
			Type.Literal('user'),
			Type.Literal('manager'),
		]),
		roleText2: Type.Union([Type.Literal('admin'), Type.Literal('user')]),
		profession: Type.String({ maxLength: 20, minLength: 1 }),
		initials: Type.String({ maxLength: 2, minLength: 1 }),
	});

	expectSchemaShape(t, expected).from(actual);
});

test('users select schema w/ defaults', (t) => {
	const actual = createSelectSchema(users);

	const expected = Type.Object({
		a: Nullable(Type.Array(Type.Number())),
		id: Type.Number(),
		name: Nullable(Type.String()),
		email: Type.String(),
		birthdayString: Type.String(),
		birthdayDate: Type.Date(),
		createdAt: Type.Date(),
		role: Type.Union([Type.Literal('admin'), Type.Literal('user')]),
		roleText: Type.Union([Type.Literal('admin'), Type.Literal('user')]),
		roleText2: Type.Union([Type.Literal('admin'), Type.Literal('user')]),
		profession: Type.String({ maxLength: 20, minLength: 1 }),
		initials: Type.String({ maxLength: 2, minLength: 1 }),
	});

	expectSchemaShape(t, expected).from(actual);
});
