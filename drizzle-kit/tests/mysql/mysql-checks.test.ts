import { sql } from 'drizzle-orm';
import { check, int, mysqlTable, serial, varchar } from 'drizzle-orm/mysql-core';
import { expect, test } from 'vitest';
import { diff } from './mocks';

test('create table with check', async (t) => {
	const to = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			age: int('age'),
		}, (table) => ({
			checkConstraint: check('some_check_name', sql`${table.age} > 21`),
		})),
	};

	const { sqlStatements } = await diff({}, to, []);

	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE \`users\` (
\t\`id\` serial PRIMARY KEY,
\t\`age\` int,
\tCONSTRAINT \`some_check_name\` CHECK(\`users\`.\`age\` > 21)
);\n`,
	]);
});

test('add check contraint to existing table', async (t) => {
	const from = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			age: int('age'),
		}),
	};

	const to = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			age: int('age'),
		}, (table) => ({
			checkConstraint: check('some_check_name', sql`${table.age} > 21`),
		})),
	};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE \`users\` ADD CONSTRAINT \`some_check_name\` CHECK (\`users\`.\`age\` > 21);`,
	]);
});

test('drop check contraint in existing table', async (t) => {
	const to = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			age: int('age'),
		}),
	};

	const from = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			age: int('age'),
		}, (table) => ({
			checkConstraint: check('some_check_name', sql`${table.age} > 21`),
		})),
	};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE \`users\` DROP CONSTRAINT \`some_check_name\`;`,
	]);
});

test('rename check constraint', async (t) => {
	const from = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			age: int('age'),
		}, (table) => ({
			checkConstraint: check('some_check_name', sql`${table.age} > 21`),
		})),
	};

	const to = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			age: int('age'),
		}, (table) => ({
			checkConstraint: check('new_check_name', sql`${table.age} > 21`),
		})),
	};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE \`users\` DROP CONSTRAINT \`some_check_name\`;`,
		`ALTER TABLE \`users\` ADD CONSTRAINT \`new_check_name\` CHECK (\`users\`.\`age\` > 21);`,
	]);
});

test('alter check constraint', async (t) => {
	const from = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			age: int('age'),
		}, (table) => ({
			checkConstraint: check('some_check_name', sql`${table.age} > 21`),
		})),
	};

	const to = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			age: int('age'),
		}, (table) => ({
			checkConstraint: check('new_check_name', sql`${table.age} > 10`),
		})),
	};

	const { sqlStatements, statements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE \`users\` DROP CONSTRAINT \`some_check_name\`;`,
		`ALTER TABLE \`users\` ADD CONSTRAINT \`new_check_name\` CHECK (\`users\`.\`age\` > 10);`,
	]);
});

test('alter multiple check constraints', async (t) => {
	const from = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			age: int('age'),
			name: varchar('name', { length: 255 }),
		}, (table) => ({
			checkConstraint1: check('some_check_name_1', sql`${table.age} > 21`),
			checkConstraint2: check('some_check_name_2', sql`${table.name} != 'Alex'`),
		})),
	};

	const to = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			age: int('age'),
			name: varchar('name', { length: 255 }),
		}, (table) => ({
			checkConstraint1: check('some_check_name_3', sql`${table.age} > 21`),
			checkConstraint2: check('some_check_name_4', sql`${table.name} != 'Alex'`),
		})),
	};

	const { sqlStatements } = await diff(from, to, []);
	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE \`users\` DROP CONSTRAINT \`some_check_name_1\`;`,
		`ALTER TABLE \`users\` DROP CONSTRAINT \`some_check_name_2\`;`,
		`ALTER TABLE \`users\` ADD CONSTRAINT \`some_check_name_3\` CHECK (\`users\`.\`age\` > 21);`,
		`ALTER TABLE \`users\` ADD CONSTRAINT \`some_check_name_4\` CHECK (\`users\`.\`name\` != \'Alex\');`,
	]);
});

test('create checks with same names', async (t) => {
	const to = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
			age: int('age'),
			name: varchar('name', { length: 255 }),
		}, (table) => ({
			checkConstraint1: check('some_check_name', sql`${table.age} > 21`),
			checkConstraint2: check('some_check_name', sql`${table.name} != 'Alex'`),
		})),
	};

	await expect(diff({}, to, [])).rejects.toThrowError();
});
