import { gte, sql } from 'drizzle-orm';
import { check, integer, pgTable, serial, varchar } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diff, prepareTestDatabase, push, TestDatabase } from './mocks';

// @vitest-environment-options {"max-concurrency":1}
let _: TestDatabase;
let db: TestDatabase['db'];

beforeAll(async () => {
	_ = await prepareTestDatabase();
	db = _.db;
});

afterAll(async () => {
	await _.close();
});

beforeEach(async () => {
	await _.clear();
});

test('create table with check #1', async (t) => {
	const to = {
		users: pgTable('users', {
			age: integer('age'),
		}, (table) => [check('some_check_name', sql`${table.age} > 21`)]),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		`CREATE TABLE "users" (\n\t"age" integer,\n\tCONSTRAINT "some_check_name" CHECK ("age" > 21)\n);\n`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4661
test('create table with check #2: sql``', async (t) => {
	const to = {
		users: pgTable('users', {
			age: integer('age'),
		}, (table) => [check('some_check_name', gte(table.age, 21))]),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		`CREATE TABLE "users" (\n\t"age" integer,\n\tCONSTRAINT "some_check_name" CHECK ("age" >= 21)\n);\n`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add check contraint to existing table', async (t) => {
	const from = {
		users: pgTable('users', {
			age: integer('age'),
		}),
	};

	const to = {
		users: pgTable('users', {
			age: integer('age'),
		}, (table) => [
			check('some_check_name', sql`${table.age} > 21`),
		]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [`ALTER TABLE "users" ADD CONSTRAINT "some_check_name" CHECK ("age" > 21);`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop check contraint in existing table', async (t) => {
	const from = {
		users: pgTable('users', {
			age: integer('age'),
		}, (table) => [check('some_check_name', sql`${table.age} > 21`)]),
	};

	const to = {
		users: pgTable('users', {
			age: integer('age'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [`ALTER TABLE "users" DROP CONSTRAINT "some_check_name";`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename check constraint', async (t) => {
	const from = {
		users: pgTable('users', {
			age: integer('age'),
		}, (table) => [check('some_check_name', sql`${table.age} > 21`)]),
	};

	const to = {
		users: pgTable('users', {
			age: integer('age'),
		}, (table) => [check('new_check_name', sql`${table.age} > 21`)]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		`ALTER TABLE "users" DROP CONSTRAINT "some_check_name";`,
		`ALTER TABLE "users" ADD CONSTRAINT "new_check_name" CHECK ("age" > 21);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter check constraint', async (t) => {
	const from = {
		users: pgTable('users', {
			age: integer('age'),
		}, (table) => [check('some_check_name', sql`${table.age} > 21`)]),
	};

	const to = {
		users: pgTable('users', {
			age: integer('age'),
		}, (table) => [check('some_check_name', sql`${table.age} > 10`)]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		'ALTER TABLE "users" DROP CONSTRAINT "some_check_name", ADD CONSTRAINT "some_check_name" CHECK ("age" > 10);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]);
});

test('rename + alter multiple check constraints', async (t) => {
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

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		`ALTER TABLE "users" DROP CONSTRAINT "some_check_name_1";`,
		`ALTER TABLE "users" DROP CONSTRAINT "some_check_name_2";`,
		`ALTER TABLE "users" ADD CONSTRAINT "some_check_name_3" CHECK ("age" > 21);`,
		`ALTER TABLE "users" ADD CONSTRAINT "some_check_name_4" CHECK ("name" != \'Alex\');`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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
	// adding only CONSTRAINT "some_check_name" CHECK ("users"."age" > 21), not throwing error
	await expect(push({ db, to })).rejects.toThrow();
});

test('alter check value', async () => {
	const schema1 = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: integer('values').default(1),
		}, (table) => [check('some_check', sql`${table.values} < 100`)]),
	};
	const schema2 = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: integer('values').default(1),
		}, (table) => [check('some_check', sql`${table.values} > 100`)]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		'ALTER TABLE "test" DROP CONSTRAINT "some_check", ADD CONSTRAINT "some_check" CHECK ("values" > 100);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]);
});
