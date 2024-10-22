import { sql } from 'drizzle-orm';
import { check, int, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { expect, test } from 'vitest';
import { diffTestSchemasSqlite } from './schemaDiffer';

test('create table with check', async (t) => {
	const to = {
		users: sqliteTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}, (table) => ({
			checkConstraint: check('some_check_name', sql`${table.age} > 21`),
		})),
	};

	const { sqlStatements, statements } = await diffTestSchemasSqlite({}, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'sqlite_create_table',
		tableName: 'users',
		columns: [
			{
				name: 'id',
				type: 'integer',
				notNull: true,
				primaryKey: true,
				autoincrement: false,
			},
			{
				name: 'age',
				type: 'integer',
				notNull: false,
				primaryKey: false,
				autoincrement: false,
			},
		],
		compositePKs: [],
		checkConstraints: ['some_check_name;"users"."age" > 21'],
		referenceData: [],
		uniqueConstraints: [],
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`CREATE TABLE \`users\` (
\t\`id\` integer PRIMARY KEY NOT NULL,
\t\`age\` integer,
\tCONSTRAINT "some_check_name" CHECK("users"."age" > 21)
);\n`);
});

test('add check contraint to existing table', async (t) => {
	const to = {
		users: sqliteTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}, (table) => ({
			checkConstraint: check('some_check_name', sql`${table.age} > 21`),
		})),
	};

	const from = {
		users: sqliteTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}),
	};

	const { sqlStatements, statements } = await diffTestSchemasSqlite(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columns: [
			{
				autoincrement: false,
				generated: undefined,
				name: 'id',
				notNull: true,
				primaryKey: true,
				type: 'integer',
			},
			{
				autoincrement: false,
				generated: undefined,
				name: 'age',
				notNull: false,
				primaryKey: false,
				type: 'integer',
			},
		],
		compositePKs: [],
		referenceData: [],
		tableName: 'users',
		type: 'recreate_table',
		uniqueConstraints: [],
		checkConstraints: ['some_check_name;"users"."age" > 21'],
	});

	expect(sqlStatements.length).toBe(6);
	expect(sqlStatements[0]).toBe('PRAGMA foreign_keys=OFF;');
	expect(sqlStatements[1]).toBe(`CREATE TABLE \`__new_users\` (
\t\`id\` integer PRIMARY KEY NOT NULL,
\t\`age\` integer,
\tCONSTRAINT "some_check_name" CHECK("__new_users"."age" > 21)
);\n`);
	expect(sqlStatements[2]).toBe(`INSERT INTO \`__new_users\`("id", "age") SELECT "id", "age" FROM \`users\`;`);
	expect(sqlStatements[3]).toBe(`DROP TABLE \`users\`;`);
	expect(sqlStatements[4]).toBe(`ALTER TABLE \`__new_users\` RENAME TO \`users\`;`);
	expect(sqlStatements[5]).toBe(`PRAGMA foreign_keys=ON;`);
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

	const { sqlStatements, statements } = await diffTestSchemasSqlite(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columns: [
			{
				autoincrement: false,
				generated: undefined,
				name: 'id',
				notNull: true,
				primaryKey: true,
				type: 'integer',
			},
			{
				autoincrement: false,
				generated: undefined,
				name: 'age',
				notNull: false,
				primaryKey: false,
				type: 'integer',
			},
		],
		compositePKs: [],
		referenceData: [],
		tableName: 'users',
		type: 'recreate_table',
		uniqueConstraints: [],
		checkConstraints: [],
	});

	expect(sqlStatements.length).toBe(6);
	expect(sqlStatements[0]).toBe('PRAGMA foreign_keys=OFF;');
	expect(sqlStatements[1]).toBe(`CREATE TABLE \`__new_users\` (
\t\`id\` integer PRIMARY KEY NOT NULL,
\t\`age\` integer
);\n`);
	expect(sqlStatements[2]).toBe(`INSERT INTO \`__new_users\`("id", "age") SELECT "id", "age" FROM \`users\`;`);
	expect(sqlStatements[3]).toBe(`DROP TABLE \`users\`;`);
	expect(sqlStatements[4]).toBe(`ALTER TABLE \`__new_users\` RENAME TO \`users\`;`);
	expect(sqlStatements[5]).toBe(`PRAGMA foreign_keys=ON;`);
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

	const { sqlStatements, statements } = await diffTestSchemasSqlite(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columns: [
			{
				autoincrement: false,
				generated: undefined,
				name: 'id',
				notNull: true,
				primaryKey: true,
				type: 'integer',
			},
			{
				autoincrement: false,
				generated: undefined,
				name: 'age',
				notNull: false,
				primaryKey: false,
				type: 'integer',
			},
		],
		compositePKs: [],
		referenceData: [],
		tableName: 'users',
		type: 'recreate_table',
		uniqueConstraints: [],
		checkConstraints: [`new_some_check_name;"users"."age" > 21`],
	});

	expect(sqlStatements.length).toBe(6);
	expect(sqlStatements[0]).toBe('PRAGMA foreign_keys=OFF;');
	expect(sqlStatements[1]).toBe(`CREATE TABLE \`__new_users\` (
\t\`id\` integer PRIMARY KEY NOT NULL,
\t\`age\` integer,
\tCONSTRAINT "new_some_check_name" CHECK("__new_users"."age" > 21)
);\n`);
	expect(sqlStatements[2]).toBe(`INSERT INTO \`__new_users\`("id", "age") SELECT "id", "age" FROM \`users\`;`);
	expect(sqlStatements[3]).toBe(`DROP TABLE \`users\`;`);
	expect(sqlStatements[4]).toBe(`ALTER TABLE \`__new_users\` RENAME TO \`users\`;`);
	expect(sqlStatements[5]).toBe(`PRAGMA foreign_keys=ON;`);
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
			checkConstraint: check('some_check_name', sql`${table.age} > 10`),
		})),
	};

	const { sqlStatements, statements } = await diffTestSchemasSqlite(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columns: [
			{
				autoincrement: false,
				generated: undefined,
				name: 'id',
				notNull: true,
				primaryKey: true,
				type: 'integer',
			},
			{
				autoincrement: false,
				generated: undefined,
				name: 'age',
				notNull: false,
				primaryKey: false,
				type: 'integer',
			},
		],
		compositePKs: [],
		referenceData: [],
		tableName: 'users',
		type: 'recreate_table',
		uniqueConstraints: [],
		checkConstraints: [`some_check_name;"users"."age" > 10`],
	});

	expect(sqlStatements.length).toBe(6);
	expect(sqlStatements[0]).toBe('PRAGMA foreign_keys=OFF;');
	expect(sqlStatements[1]).toBe(`CREATE TABLE \`__new_users\` (
\t\`id\` integer PRIMARY KEY NOT NULL,
\t\`age\` integer,
\tCONSTRAINT "some_check_name" CHECK("__new_users"."age" > 10)
);\n`);
	expect(sqlStatements[2]).toBe(`INSERT INTO \`__new_users\`("id", "age") SELECT "id", "age" FROM \`users\`;`);
	expect(sqlStatements[3]).toBe(`DROP TABLE \`users\`;`);
	expect(sqlStatements[4]).toBe(`ALTER TABLE \`__new_users\` RENAME TO \`users\`;`);
	expect(sqlStatements[5]).toBe(`PRAGMA foreign_keys=ON;`);
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

	await expect(diffTestSchemasSqlite({}, to, [])).rejects.toThrowError();
});
