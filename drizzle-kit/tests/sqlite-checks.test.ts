import { sql } from 'drizzle-orm';
import { check, int, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { expect, test } from 'vitest';
import { diffTestSchemasSqlite } from './mocks-sqlite';

test('create table with check', async (t) => {
	const to = {
		users: sqliteTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}, (table) => ({
			checkConstraint: check('some_check_name', sql`${table.age} > 21`),
		})),
	};

	const { sqlStatements } = await diffTestSchemasSqlite({}, to, []);

	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE `users` (\n'
		+ '\t`id` integer PRIMARY KEY,\n'
		+ '\t`age` integer,\n'
		+ '\tCONSTRAINT "some_check_name" CHECK("users"."age" > 21)\n'
		+ ');\n',
	]);
});

test('add check contraint to existing table', async (t) => {
	const from = {
		users: sqliteTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}),
	};

	const to = {
		users: sqliteTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}, (table) => ({
			checkConstraint: check('some_check_name', sql`${table.age} > 21`),
		})),
	};

	const { sqlStatements } = await diffTestSchemasSqlite(from, to, []);

	expect(sqlStatements).toStrictEqual([
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_users` (\n'
		+ '\t`id` integer PRIMARY KEY,\n'
		+ '\t`age` integer,\n'
		+ '\tCONSTRAINT "some_check_name" CHECK("users"."age" > 21)\n'
		+ ');\n',
		'INSERT INTO `__new_users`(`id`, `age`) SELECT `id`, `age` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	]);
});

test('drop check contraint to existing table', async (t) => {
	const from = {
		users: sqliteTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}, (table) => ({
			checkConstraint: check('some_check_name', sql`${table.age} > 21`),
		})),
	};

	const to = {
		users: sqliteTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}),
	};

	const { sqlStatements } = await diffTestSchemasSqlite(from, to, []);

	expect(sqlStatements).toStrictEqual([
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_users` (\n\t`id` integer PRIMARY KEY,\n\t`age` integer\n);\n',
		'INSERT INTO `__new_users`(`id`, `age`) SELECT `id`, `age` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	]);
});

test('rename check constraint', async (t) => {
	const from = {
		users: sqliteTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}, (table) => ({
			checkConstraint: check('some_check_name', sql`${table.age} > 21`),
		})),
	};

	const to = {
		users: sqliteTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}, (table) => ({
			checkConstraint: check('new_some_check_name', sql`${table.age} > 21`),
		})),
	};

	const { sqlStatements } = await diffTestSchemasSqlite(from, to, []);

	expect(sqlStatements).toStrictEqual(
		[
			'PRAGMA foreign_keys=OFF;',
			'CREATE TABLE `__new_users` (\n'
			+ '\t`id` integer PRIMARY KEY,\n'
			+ '\t`age` integer,\n'
			+ '\tCONSTRAINT "new_some_check_name" CHECK("users"."age" > 21)\n'
			+ ');\n',
			'INSERT INTO `__new_users`(`id`, `age`) SELECT `id`, `age` FROM `users`;',
			'DROP TABLE `users`;',
			'ALTER TABLE `__new_users` RENAME TO `users`;',
			'PRAGMA foreign_keys=ON;',
		],
	);
});

test('change check constraint value', async (t) => {
	const from = {
		users: sqliteTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}, (table) => ({
			checkConstraint: check('some_check_name', sql`${table.age} > 21`),
		})),
	};

	const to = {
		users: sqliteTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}, (table) => ({
			checkConstraint: check('some_check_name', sql`${table.age} > 10`),
		})),
	};

	const { sqlStatements } = await diffTestSchemasSqlite(from, to, []);

	expect(sqlStatements).toStrictEqual([
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_users` (\n'
		+ '\t`id` integer PRIMARY KEY,\n'
		+ '\t`age` integer,\n'
		+ '\tCONSTRAINT "some_check_name" CHECK("users"."age" > 10)\n'
		+ ');\n',
		'INSERT INTO `__new_users`(`id`, `age`) SELECT `id`, `age` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	]);
});

test('create checks with same names', async (t) => {
	const to = {
		users: sqliteTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
			name: text('name'),
		}, (table) => ({
			checkConstraint1: check('some_check_name', sql`${table.age} > 21`),
			checkConstraint2: check('some_check_name', sql`${table.name} != 'Alex'`),
		})),
	};

	const { err2 } = await diffTestSchemasSqlite({}, to, []);
	expect(err2).toStrictEqual([{ name: 'some_check_name', type: 'conflict_check' }]);
});
