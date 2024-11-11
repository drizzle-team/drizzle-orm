import { char, date, getViewConfig, integer, pgEnum, pgMaterializedView, pgTable, pgView, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { test } from 'vitest';
import { z } from 'zod';
import { createSelectSchema } from '../src';
import { expectSchemaShape } from './utils.ts';
import { sql } from 'drizzle-orm';

test('table - select', (t) => {
	const table = pgTable('test', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	});

	const result = createSelectSchema(table);
	const expected = z.object({ id: z.number().int(), name: z.string() });
	expectSchemaShape(t, expected).from(result);
});

test('view qb - select', (t) => {
	const table = pgTable('test', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	});
	const view = pgView('test').as((qb) => qb.select({ id: table.id, age: sql``.as('age') }).from(table));

	const result = createSelectSchema(view);
	const expected = z.object({ id: z.number().int(), age: z.any() });
	expectSchemaShape(t, expected).from(result);
});

test('view columns - select', (t) => {
	const view = pgView('test', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = z.object({ id: z.number().int(), name: z.string() });
	expectSchemaShape(t, expected).from(result);
});

test('materialized view qb - select', (t) => {
	const table = pgTable('test', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	});
	const view = pgMaterializedView('test').as((qb) => qb.select({ id: table.id, age: sql``.as('age') }).from(table));

	const result = createSelectSchema(view);
	const expected = z.object({ id: z.number().int(), age: z.any() });
	expectSchemaShape(t, expected).from(result);
});

test('materialized view columns - select', (t) => {
	const view = pgView('test', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	}).as(sql``);

	const result = createSelectSchema(view);
	const expected = z.object({ id: z.number().int(), name: z.string() });
	expectSchemaShape(t, expected).from(result);
});

test('view with nested fields - select', (t) => {
	const table = pgTable('test', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	});
	const view = pgMaterializedView('test').as((qb) => qb.select({
		id: table.id,
		profile: {
			name: table.name,
			age: sql``.as('age')
		}
	}).from(table));

	const result = createSelectSchema(view);
	const expected = z.object({ id: z.number().int(), profile: z.object({ name: z.string(), age: z.any() }) });
	expectSchemaShape(t, expected).from(result);
});

test('nullability - select', (t) => {
	const table = pgTable('test', {
		c1: integer(),
		c2: integer().notNull(),
		c3: integer().default(1),
		c4: integer().notNull().default(1),
	});

	const result = createSelectSchema(table);
	const expected = z.object({
		c1: z.number().int().nullable(),
		c2: z.number().int(),
		c3: z.number().int().nullable(),
		c4: z.number().int(),
	})
	expectSchemaShape(t, expected).from(result);
});

// export const roleEnum = pgEnum('role', ['admin', 'user']);

// const users = pgTable('users', {
// 	a: integer('a').array(),
// 	id: serial('id').primaryKey(),
// 	name: text('name'),
// 	email: text('email').notNull(),
// 	birthdayString: date('birthday_string').notNull(),
// 	birthdayDate: date('birthday_date', { mode: 'date' }).notNull(),
// 	createdAt: timestamp('created_at').notNull().defaultNow(),
// 	role: roleEnum('role').notNull(),
// 	roleText: text('role1', { enum: ['admin', 'user'] }).notNull(),
// 	roleText2: text('role2', { enum: ['admin', 'user'] }).notNull().default('user'),
// 	profession: varchar('profession', { length: 20 }).notNull(),
// 	initials: char('initials', { length: 2 }).notNull(),
// });

// const testUser = {
// 	a: [1, 2, 3],
// 	id: 1,
// 	name: 'John Doe',
// 	email: 'john.doe@example.com',
// 	birthdayString: '1990-01-01',
// 	birthdayDate: new Date('1990-01-01'),
// 	createdAt: new Date(),
// 	role: 'admin',
// 	roleText: 'admin',
// 	roleText2: 'admin',
// 	profession: 'Software Engineer',
// 	initials: 'JD',
// };

// test('users insert valid user', () => {
// 	const schema = createInsertSchema(users);

// 	expected(schema.safeParse(testUser).success).toBeTruthy();
// });

// test('users insert invalid varchar', () => {
// 	const schema = createInsertSchema(users);

// 	expected(schema.safeParse({ ...testUser, profession: 'Chief Executive Officer' }).success).toBeFalsy();
// });

// test('users insert invalid char', () => {
// 	const schema = createInsertSchema(users);

// 	expected(schema.safeParse({ ...testUser, initials: 'JoDo' }).success).toBeFalsy();
// });

// test('users insert schema', (t) => {
// 	const actual = createInsertSchema(users, {
// 		id: ({ id }) => id.positive(),
// 		email: ({ email }) => email.email(),
// 		roleText: z.enum(['user', 'manager', 'admin']),
// 	});

// 	(() => {
// 		{
// 			createInsertSchema(users, {
// 				// @ts-expected-error (missing property)
// 				foobar: z.number(),
// 			});
// 		}

// 		{
// 			createInsertSchema(users, {
// 				// @ts-expected-error (invalid type)
// 				id: 123,
// 			});
// 		}
// 	});

// 	const expecteded = z.object({
// 		a: z.array(z.number()).nullable().optional(),
// 		id: z.number().positive().optional(),
// 		name: z.string().nullable().optional(),
// 		email: z.string().email(),
// 		birthdayString: z.string(),
// 		birthdayDate: z.date(),
// 		createdAt: z.date().optional(),
// 		role: z.enum(['admin', 'user']),
// 		roleText: z.enum(['user', 'manager', 'admin']),
// 		roleText2: z.enum(['admin', 'user']).optional(),
// 		profession: z.string().max(20).min(1),
// 		initials: z.string().max(2).min(1),
// 	});

// 	expectedSchemaShape(t, expecteded).from(actual);
// });

// test('users insert schema w/ defaults', (t) => {
// 	const actual = createInsertSchema(users);

// 	const expecteded = z.object({
// 		a: z.array(z.number()).nullable().optional(),
// 		id: z.number().optional(),
// 		name: z.string().nullable().optional(),
// 		email: z.string(),
// 		birthdayString: z.string(),
// 		birthdayDate: z.date(),
// 		createdAt: z.date().optional(),
// 		role: z.enum(['admin', 'user']),
// 		roleText: z.enum(['admin', 'user']),
// 		roleText2: z.enum(['admin', 'user']).optional(),
// 		profession: z.string().max(20).min(1),
// 		initials: z.string().max(2).min(1),
// 	});

// 	expectedSchemaShape(t, expecteded).from(actual);
// });

// test('users select schema', (t) => {
// 	const actual = createSelectSchema(users, {
// 		id: ({ id }) => id.positive(),
// 		email: ({ email }) => email.email(),
// 		roleText: z.enum(['user', 'manager', 'admin']),
// 	});

// 	const expecteded = z.object({
// 		a: z.array(z.number()).nullable(),
// 		id: z.number().positive(),
// 		name: z.string().nullable(),
// 		email: z.string().email(),
// 		birthdayString: z.string(),
// 		birthdayDate: z.date(),
// 		createdAt: z.date(),
// 		role: z.enum(['admin', 'user']),
// 		roleText: z.enum(['user', 'manager', 'admin']),
// 		roleText2: z.enum(['admin', 'user']),
// 		profession: z.string().max(20).min(1),
// 		initials: z.string().max(2).min(1),
// 	});

// 	expectedSchemaShape(t, expecteded).from(actual);
// });

// test('users select schema w/ defaults', (t) => {
// 	const actual = createSelectSchema(users);

// 	const expecteded = z.object({
// 		a: z.array(z.number()).nullable(),
// 		id: z.number(),
// 		name: z.string().nullable(),
// 		email: z.string(),
// 		birthdayString: z.string(),
// 		birthdayDate: z.date(),
// 		createdAt: z.date(),
// 		role: z.enum(['admin', 'user']),
// 		roleText: z.enum(['admin', 'user']),
// 		roleText2: z.enum(['admin', 'user']),
// 		profession: z.string().max(20).min(1),
// 		initials: z.string().max(2).min(1),
// 	});

// 	expectedSchemaShape(t, expecteded).from(actual);
// });
