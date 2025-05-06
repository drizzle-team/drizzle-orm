import { sql } from 'drizzle-orm';
import { check, integer, pgTable, serial, varchar } from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import { diff } from './mocks';

test('create table with check', async (t) => {
	const to = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			age: integer('age'),
		}, (table) => [check('some_check_name', sql`${table.age} > 21`)]),
	};

	const { sqlStatements } = await diff({}, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`CREATE TABLE "users" (
\t"id" serial PRIMARY KEY,
\t"age" integer,
\tCONSTRAINT "some_check_name" CHECK ("users"."age" > 21)
);\n`);
});

test('add check contraint to existing table', async (t) => {
	const from = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			age: integer('age'),
		}),
	};

	const to = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			age: integer('age'),
		}, (table) => [
			check('some_check_name', sql`${table.age} > 21`),
		]),
	};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "users" ADD CONSTRAINT "some_check_name" CHECK ("users"."age" > 21);`,
	);
});

test('drop check contraint in existing table', async (t) => {
	const from = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			age: integer('age'),
		}, (table) => [check('some_check_name', sql`${table.age} > 21`)]),
	};

	const to = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			age: integer('age'),
		}),
	};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "users" DROP CONSTRAINT "some_check_name";`,
	);
});

test('rename check constraint', async (t) => {
	const from = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			age: integer('age'),
		}, (table) => [check('some_check_name', sql`${table.age} > 21`)]),
	};

	const to = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			age: integer('age'),
		}, (table) => [check('new_check_name', sql`${table.age} > 21`)]),
	};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "users" DROP CONSTRAINT "some_check_name";`,
	);
	expect(sqlStatements[1]).toBe(
		`ALTER TABLE "users" ADD CONSTRAINT "new_check_name" CHECK ("users"."age" > 21);`,
	);
});

test('alter check constraint', async (t) => {
	const from = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			age: integer('age'),
		}, (table) => [check('some_check_name', sql`${table.age} > 21`)]),
	};

	const to = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			age: integer('age'),
		}, (table) => [check('new_check_name', sql`${table.age} > 10`)]),
	};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "users" DROP CONSTRAINT "some_check_name";`,
	);
	expect(sqlStatements[1]).toBe(
		`ALTER TABLE "users" ADD CONSTRAINT "new_check_name" CHECK ("users"."age" > 10);`,
	);
});

test('alter multiple check constraints', async (t) => {
	const from = {
		users: pgTable(
			'users',
			{
				id: serial('id').primaryKey(),
				age: integer('age'),
				name: varchar('name'),
			},
			(
				table,
			) => [
				check('some_check_name_1', sql`${table.age} > 21`),
				check('some_check_name_2', sql`${table.name} != 'Alex'`),
			],
		),
	};

	const to = {
		users: pgTable(
			'users',
			{
				id: serial('id').primaryKey(),
				age: integer('age'),
				name: varchar('name'),
			},
			(
				table,
			) => [
				check('some_check_name_3', sql`${table.age} > 21`),
				check('some_check_name_4', sql`${table.name} != 'Alex'`),
			],
		),
	};

	const { sqlStatements } = await diff(from, to, []);
	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "users" DROP CONSTRAINT "some_check_name_1";`,
		`ALTER TABLE "users" DROP CONSTRAINT "some_check_name_2";`,
		`ALTER TABLE "users" ADD CONSTRAINT "some_check_name_3" CHECK ("users"."age" > 21);`,
		`ALTER TABLE "users" ADD CONSTRAINT "some_check_name_4" CHECK ("users"."name" != \'Alex\');`,
	]);
});

test('create checks with same names', async (t) => {
	const to = {
		users: pgTable(
			'users',
			{
				id: serial('id').primaryKey(),
				age: integer('age'),
				name: varchar('name'),
			},
			(
				table,
			) => [check('some_check_name', sql`${table.age} > 21`), check('some_check_name', sql`${table.name} != 'Alex'`)],
		),
	};

	// 'constraint_name_duplicate'
	await expect(diff({}, to, [])).rejects.toThrow();
});
