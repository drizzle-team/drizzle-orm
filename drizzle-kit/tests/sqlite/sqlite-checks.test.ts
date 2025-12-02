import { sql } from 'drizzle-orm';
import { check, int, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diff, prepareTestDatabase, push, TestDatabase } from './mocks';

// @vitest-environment-options {"max-concurrency":1}
let _: TestDatabase;
let db: TestDatabase['db'];

beforeAll(() => {
	_ = prepareTestDatabase();
	db = _.db;
});

afterAll(async () => {
	await _.close();
});

beforeEach(async () => {
	await _.clear();
});

test('create table with check', async (t) => {
	const to = {
		users: sqliteTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}, (table) => [check('some_check_name', sql`${table.age} > 21`)]),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `users` (\n'
		+ '\t`id` integer PRIMARY KEY,\n'
		+ '\t`age` integer,\n'
		+ '\tCONSTRAINT "some_check_name" CHECK("age" > 21)\n'
		+ ');\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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
		}, (table) => [check('some_check_name', sql`${table.age} > 21`)]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_users` (\n'
		+ '\t`id` integer PRIMARY KEY,\n'
		+ '\t`age` integer,\n'
		+ '\tCONSTRAINT "some_check_name" CHECK("age" > 21)\n'
		+ ');\n',
		'INSERT INTO `__new_users`(`id`, `age`) SELECT `id`, `age` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop check constraint to existing table', async (t) => {
	const from = {
		users: sqliteTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}, (table) => [check('some_check_name', sql`${table.age} > 21`)]),
	};

	const to = {
		users: sqliteTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_users` (\n\t`id` integer PRIMARY KEY,\n\t`age` integer\n);\n',
		'INSERT INTO `__new_users`(`id`, `age`) SELECT `id`, `age` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename check constraint', async (t) => {
	const from = {
		users: sqliteTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}, (table) => [check('some_check_name', sql`${table.age} > 21`)]),
	};

	const to = {
		users: sqliteTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}, (table) => [check('new_some_check_name', sql`${table.age} > 21`)]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_users` (\n'
		+ '\t`id` integer PRIMARY KEY,\n'
		+ '\t`age` integer,\n'
		+ '\tCONSTRAINT "new_some_check_name" CHECK("age" > 21)\n'
		+ ');\n',
		'INSERT INTO `__new_users`(`id`, `age`) SELECT `id`, `age` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('change check constraint value', async (t) => {
	const from = {
		users: sqliteTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}, (table) => [check('some_check_name', sql`${table.age} > 21`)]),
	};

	const to = {
		users: sqliteTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}, (table) => [check('some_check_name', sql`${table.age} > 10`)]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_users` (\n'
		+ '\t`id` integer PRIMARY KEY,\n'
		+ '\t`age` integer,\n'
		+ '\tCONSTRAINT "some_check_name" CHECK("age" > 10)\n'
		+ ');\n',
		'INSERT INTO `__new_users`(`id`, `age`) SELECT `id`, `age` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create checks with same names', async (t) => {
	const to = {
		users: sqliteTable(
			'users',
			{
				id: int('id').primaryKey(),
				age: int('age'),
				name: text('name'),
			},
			(
				table,
			) => [check('some_check_name', sql`${table.age} > 21`), check('some_check_name', sql`${table.name} != 'Alex'`)],
		),
	};

	const { err2 } = await diff({}, to, []);

	// TODO revise: push does not return any errors. should I use push here?
	// const {} = await push({ db, to });

	expect(err2).toStrictEqual([{ name: 'some_check_name', type: 'conflict_check' }]);
});

test('db has checks. Push with same names', async () => {
	// TODO: revise: it seems to me that this test is the same as one above, but they expect different results
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: false }),
			name: text('name'),
			age: integer('age'),
		}, (table) => [check('some_check', sql`${table.age} > 21`)]),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: false }),
			name: text('name'),
			age: integer('age'),
		}, (table) => [check('some_check', sql`${table.age} > 22`)]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst, hints: phints } = await push({ db, to: schema2 });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_users` (\n'
		+ '\t`id` integer PRIMARY KEY,\n'
		+ '\t`name` text,\n'
		+ '\t`age` integer,\n'
		+ '\tCONSTRAINT "some_check" CHECK("age" > 22)\n'
		+ ');\n',
		'INSERT INTO `__new_users`(`id`, `name`, `age`) SELECT `id`, `name`, `age` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);

	const hints0: string[] = [];
	expect(phints).toStrictEqual(hints0);
});
