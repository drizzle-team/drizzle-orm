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
	tuple,
} from 'valibot';
import { expect, test } from 'vitest';
import { createInsertSchema, createSelectSchema } from '../src';
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
	role: 'admin' as const,
	roleText: 'admin' as const,
	roleText2: 'admin' as const,
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

	expect(parse(schema, testUser)).toStrictEqual(testUser);
});

test('users insert invalid varchar', () => {
	const schema = createInsertSchema(users);

	expect(() =>
		parse(schema, {
			...testUser,
			profession: 'Chief Executive Officer',
		})
	).toThrow(undefined);
});

test('users insert invalid char', () => {
	const schema = createInsertSchema(users);

	expect(() => parse(schema, { ...testUser, initials: 'JoDo' })).toThrow(undefined);
});

test('users insert schema', (t) => {
	const actual = createInsertSchema(users, {
		id: () => number([minValue(0)]),
		email: () => string([email()]),
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
		strArr: optional(nullable(array(string()))),
		id: optional(number([minValue(0)])),
		name: optional(nullable(string())),
		email: string(),
		birthdayString: string(),
		birthdayDate: valiDate(),
		createdAt: optional(valiDate()),
		role: picklist(['admin', 'user']),
		roleText: picklist(['user', 'manager', 'admin']),
		roleText2: optional(picklist(['admin', 'user'])),
		profession: string([maxLength(20), minLength(1)]),
		initials: string([maxLength(2), minLength(1)]),
		vector: optional(nullable(array(number()))),
		geoXy: optional(nullable(object({
			x: number(),
			y: number(),
		}))),
		geoTuple: optional(nullable(tuple([number(), number()]))),
	});

	expectSchemaShape(t, expected).from(actual);
});

test('users insert schema w/ defaults', (t) => {
	const actual = createInsertSchema(users);

	const expected = object({
		a: optional(nullable(array(number()))),
		strArr: optional(nullable(array(string()))),
		id: optional(number()),
		name: optional(nullable(string())),
		email: string(),
		birthdayString: string(),
		birthdayDate: valiDate(),
		createdAt: optional(valiDate()),
		role: picklist(['admin', 'user']),
		roleText: picklist(['admin', 'user']),
		roleText2: optional(picklist(['admin', 'user'])),
		profession: string([maxLength(20), minLength(1)]),
		initials: string([maxLength(2), minLength(1)]),
		vector: optional(nullable(array(number()))),
		geoXy: optional(nullable(object({
			x: number(),
			y: number(),
		}))),
		geoTuple: optional(nullable(tuple([number(), number()]))),
	});

	expectSchemaShape(t, expected).from(actual);
});

test('users select schema', (t) => {
	const actual = createSelectSchema(users, {
		id: () => number([minValue(0)]),
		email: () => string(),
		roleText: picklist(['user', 'manager', 'admin']),
	});

	const expected = object({
		a: nullable(array(number())),
		strArr: nullable(array(string())),
		id: number([minValue(0)]),
		name: nullable(string()),
		email: string(),
		birthdayString: string(),
		birthdayDate: valiDate(),
		createdAt: valiDate(),
		role: picklist(['admin', 'user']),
		roleText: picklist(['user', 'manager', 'admin']),
		roleText2: picklist(['admin', 'user']),
		profession: string([maxLength(20), minLength(1)]),
		initials: string([maxLength(2), minLength(1)]),
		vector: nullable(array(number())),
		geoXy: nullable(object({
			x: number(),
			y: number(),
		})),
		geoTuple: nullable(tuple([number(), number()])),
	});

	expectSchemaShape(t, expected).from(actual);
});

test('users select schema w/ defaults', (t) => {
	const actual = createSelectSchema(users);

	const expected = object({
		a: nullable(array(number())),
		strArr: nullable(array(string())),
		id: number(),
		name: nullable(string()),
		email: string(),
		birthdayString: string(),
		birthdayDate: valiDate(),
		createdAt: valiDate(),
		role: picklist(['admin', 'user']),
		roleText: picklist(['admin', 'user']),
		roleText2: picklist(['admin', 'user']),
		profession: string([maxLength(20), minLength(1)]),
		initials: string([maxLength(2), minLength(1)]),
		vector: nullable(array(number())),
		geoXy: nullable(object({
			x: number(),
			y: number(),
		})),
		geoTuple: nullable(tuple([number(), number()])),
	});

	expectSchemaShape(t, expected).from(actual);
});
