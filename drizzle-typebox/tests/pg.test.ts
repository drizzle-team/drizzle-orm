import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import {
	char,
	date,
	geometry,
	integer,
	pgEnum,
	pgTable,
	serial,
	text,
	timestamp,
	varchar,
	vector,
} from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import { createInsertSchema, createSelectSchema, Nullable } from '../src';
import { expectSchemaShape } from './utils.ts';

export const roleEnum = pgEnum('role', ['admin', 'user']);

const users = pgTable('users', {
	a: integer('a').array(),
	strArr: text('str_arr').array(),
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
	vector: vector('vector', { dimensions: 2 }),
	geoXy: geometry('geometry_xy', {
		mode: 'xy',
	}),
	geoTuple: geometry('geometry_tuple', {
		mode: 'tuple',
	}),
});

const testUser = {
	a: [1, 2, 3],
	strArr: ['one', 'two', 'three'],
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
	vector: [1, 2],
	geoXy: {
		x: 10,
		y: 20.3,
	},
	geoTuple: [10, 20.3],
};

test('users insert valid user', () => {
	const schema = createInsertSchema(users);

	expect(Value.Check(schema, testUser)).toBeTruthy();
});

test('users insert invalid varchar', () => {
	const schema = createInsertSchema(users);

	expect(Value.Check(schema, {
		...testUser,
		profession: 'Chief Executive Officer',
	})).toBeFalsy();
});

test('users insert invalid char', () => {
	const schema = createInsertSchema(users);

	expect(Value.Check(schema, { ...testUser, initials: 'JoDo' })).toBeFalsy();
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
		strArr: Type.Optional(Nullable(Type.Array(Type.String()))),
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
		vector: Type.Optional(Nullable(Type.Array(Type.Number()))),
		geoXy: Type.Optional(Nullable(Type.Object({
			x: Type.Number(),
			y: Type.Number(),
		}))),
		geoTuple: Type.Optional(Nullable(Type.Tuple([Type.Number(), Type.Number()]))),
	});

	expectSchemaShape(t, expected).from(actual);
});

test('users insert schema w/ defaults', (t) => {
	const actual = createInsertSchema(users);

	const expected = Type.Object({
		a: Type.Optional(Nullable(Type.Array(Type.Number()))),
		strArr: Type.Optional(Nullable(Type.Array(Type.String()))),
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
		vector: Type.Optional(Nullable(Type.Array(Type.Number()))),
		geoXy: Type.Optional(Nullable(Type.Object({
			x: Type.Number(),
			y: Type.Number(),
		}))),
		geoTuple: Type.Optional(Nullable(Type.Tuple([Type.Number(), Type.Number()]))),
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
		strArr: Nullable(Type.Array(Type.String())),
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
		vector: Nullable(Type.Array(Type.Number())),
		geoXy: Nullable(Type.Object({
			x: Type.Number(),
			y: Type.Number(),
		})),
		geoTuple: Nullable(Type.Tuple([Type.Number(), Type.Number()])),
	});

	expectSchemaShape(t, expected).from(actual);
});

test('users select schema w/ defaults', (t) => {
	const actual = createSelectSchema(users);

	const expected = Type.Object({
		a: Nullable(Type.Array(Type.Number())),
		strArr: Nullable(Type.Array(Type.String())),
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
		vector: Nullable(Type.Array(Type.Number())),
		geoXy: Nullable(Type.Object({
			x: Type.Number(),
			y: Type.Number(),
		})),
		geoTuple: Nullable(Type.Tuple([Type.Number(), Type.Number()])),
	});

	expectSchemaShape(t, expected).from(actual);
});
