import { sql } from 'drizzle-orm';
import { check, int, mssqlTable, varchar } from 'drizzle-orm/mssql-core';
import { expect, test } from 'vitest';
import { diff } from './mocks';

test('add check', async () => {
	const schema1 = {
		table: mssqlTable('table', {
			id: int(),
		}),
	};

	const schema2 = {
		table: mssqlTable('table', {
			id: int(),
		}, (t) => [check('new_check', sql`${t.id} != 10`), check('new_check2', sql`${t.id} != 10`)]),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE [table] ADD CONSTRAINT [new_check] CHECK ([table].[id] != 10);',
		'ALTER TABLE [table] ADD CONSTRAINT [new_check2] CHECK ([table].[id] != 10);',
	]);
});

test('drop check', async () => {
	const schema1 = {
		table: mssqlTable('table', {
			id: int(),
		}, (t) => [check('new_check', sql`${t.id} != 10`)]),
	};

	const schema2 = {
		table: mssqlTable('table', {
			id: int(),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE [table] DROP CONSTRAINT [new_check];',
	]);
});

test('create table with check', async (t) => {
	const to = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}, (table) => [check('some_check_name', sql`${table.age} > 21`)]),
	};

	const { sqlStatements } = await diff({}, to, []);

	expect(sqlStatements).toStrictEqual([`CREATE TABLE [users] (
\t[id] int,
\t[age] int,
\tCONSTRAINT [users_pkey] PRIMARY KEY([id]),
\tCONSTRAINT [some_check_name] CHECK ([users].[age] > 21)
);\n`]);
});

test('add check contraint to existing table', async (t) => {
	const from = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}),
	};

	const to = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}, (table) => [
			check('some_check_name', sql`${table.age} > 21`),
		]),
	};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE [users] ADD CONSTRAINT [some_check_name] CHECK ([users].[age] > 21);`,
	]);
});

test('drop check contraint in existing table', async (t) => {
	const from = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}, (table) => [check('some_check_name', sql`${table.age} > 21`)]),
	};

	const to = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}),
	};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE [users] DROP CONSTRAINT [some_check_name];`,
	]);
});

test('recreate check constraint', async (t) => {
	const from = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}, (table) => [check('some_check_name', sql`${table.age} > 21`)]),
	};

	const to = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}, (table) => [check('new_check_name', sql`${table.age} > 21`)]),
	};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE [users] DROP CONSTRAINT [some_check_name];`,
		`ALTER TABLE [users] ADD CONSTRAINT [new_check_name] CHECK ([users].[age] > 21);`,
	]);
});

test('rename check constraint', async (t) => {
	const from = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}, (table) => [check('some_check_name', sql`${table.age} > 21`)]),
	};

	const to = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}, (table) => [check('new_check_name', sql`${table.age} > 21`)]),
	};

	const { sqlStatements } = await diff(from, to, ['dbo.users.some_check_name->dbo.users.new_check_name']);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'some_check_name', [new_check_name], 'OBJECT';`,
	]);
});

test('alter check constraint', async (t) => {
	const from = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}, (table) => [check('some_check_name', sql`${table.age} > 21`)]),
	};

	const to = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}, (table) => [check('some_check_name', sql`${table.age} > 10`)]),
	};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE [users] DROP CONSTRAINT [some_check_name];`,
		`ALTER TABLE [users] ADD CONSTRAINT [some_check_name] CHECK ([users].[age] > 10);`,
	]);
});

test('alter multiple check constraints', async (t) => {
	const from = {
		users: mssqlTable(
			'users',
			{
				id: int('id').primaryKey(),
				age: int('age'),
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
		users: mssqlTable(
			'users',
			{
				id: int('id').primaryKey(),
				age: int('age'),
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
		`ALTER TABLE [users] DROP CONSTRAINT [some_check_name_1];`,
		`ALTER TABLE [users] DROP CONSTRAINT [some_check_name_2];`,
		`ALTER TABLE [users] ADD CONSTRAINT [some_check_name_3] CHECK ([users].[age] > 21);`,
		`ALTER TABLE [users] ADD CONSTRAINT [some_check_name_4] CHECK ([users].[name] != 'Alex');`,
	]);
});

test('create checks with same names', async (t) => {
	const to = {
		users: mssqlTable(
			'users',
			{
				id: int('id').primaryKey(),
				age: int('age'),
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
