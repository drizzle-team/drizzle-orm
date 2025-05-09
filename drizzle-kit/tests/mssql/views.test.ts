import { sql } from 'drizzle-orm';
import { int, mssqlSchema, mssqlTable, mssqlView } from 'drizzle-orm/mssql-core';
import { expect, test } from 'vitest';
import { diff } from './mocks';

test('create table and view #1', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view: mssqlView('some_view').as((qb) => qb.select().from(users)),
	};

	const { sqlStatements } = await diff({}, to, []);
	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE [users] (\n\t[id] int PRIMARY KEY\n);\n`,
		`CREATE VIEW [some_view] AS (select [id] from [users]);`,
	]);
});

test('create table and view #2', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view: mssqlView('some_view', { id: int('id') }).as(sql`SELECT * FROM ${users}`),
	};

	const { sqlStatements } = await diff({}, to, []);
	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE [users] (\n\t[id] int PRIMARY KEY\n);\n`,
		`CREATE VIEW [some_view] AS (SELECT * FROM [users]);`,
	]);
});

test('create table and view #3', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view1: mssqlView('some_view1', { id: int('id') }).with({
			checkOption: true,
			encryption: true,
			schemaBinding: true,
			viewMetadata: true,
		}).as(sql`SELECT * FROM ${users}`),
	};

	const { sqlStatements } = await diff({}, to, []);
	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE [users] (\n\t[id] int PRIMARY KEY\n);\n`,
		`CREATE VIEW [some_view1]\nWITH ENCRYPTION, SCHEMABINDING, VIEW_METADATA AS (SELECT * FROM [users])\nWITH CHECK OPTION;`,
	]);
});

test('create table and view #4', async () => {
	const schema = mssqlSchema('new_schema');

	const users = schema.table('users', {
		id: int('id').primaryKey().notNull(),
	});
	const to = {
		schema,
		users: users,
		view1: schema.view('some_view1', { id: int('id') }).with({
			checkOption: true,
			encryption: true,
			schemaBinding: true,
			viewMetadata: true,
		}).as(sql`SELECT * FROM ${users}`),
	};

	const { sqlStatements } = await diff({}, to, []);

	expect(sqlStatements.length).toBe(3);
	expect(sqlStatements[0]).toBe(`CREATE SCHEMA [new_schema];\n`);
	expect(sqlStatements[1]).toBe(`CREATE TABLE [new_schema].[users] (\n\t[id] int PRIMARY KEY\n);\n`);
	expect(sqlStatements[2]).toBe(
		`CREATE VIEW [new_schema].[some_view1]\nWITH ENCRYPTION, SCHEMABINDING, VIEW_METADATA AS (SELECT * FROM [new_schema].[users])\nWITH CHECK OPTION;`,
	);
});

test('create table and view #5', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view1: mssqlView('some_view', { id: int('id') }).as(sql`SELECT * FROM ${users}`),
		view2: mssqlView('some_view', { id: int('id') }).as(sql`SELECT * FROM ${users}`),
	};

	// view_name_duplicate
	await expect(diff({}, to, [])).rejects.toThrow();
});

test('create table and view #6', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view1: mssqlView('some_view', { id: int('id') }).with({ checkOption: true }).as(sql`SELECT * FROM ${users}`),
	};

	const { sqlStatements } = await diff({}, to, []);

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`CREATE TABLE [users] (\n\t[id] int PRIMARY KEY\n);\n`);
	expect(sqlStatements[1]).toBe(`CREATE VIEW [some_view] AS (SELECT * FROM [users])\nWITH CHECK OPTION;`);
});

test('create view with existing flag', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users,
	};

	const to = {
		users: users,
		view1: mssqlView('some_view', { id: int('id') }).with({ checkOption: true }).existing(),
	};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements.length).toBe(0);
});

test('drop view #1', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: mssqlView('some_view', { id: int('id') }).as(sql`SELECT * FROM ${users}`),
	};

	const to = {
		users: users,
	};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`DROP VIEW [some_view];`);
});

test('drop view with existing flag', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: mssqlView('some_view', { id: int('id') }).existing(),
	};

	const to = {
		users: users,
	};

	const { sqlStatements } = await diff(from, to, []);
	expect(sqlStatements.length).toBe(0);
});

test('rename view #1', async () => {
	const from = {
		view: mssqlView('some_view', { id: int('id') }).as(sql`SELECT * FROM [users]`),
	};

	const to = {
		view: mssqlView('new_some_view', { id: int('id') }).as(sql`SELECT * FROM [users]`),
	};

	const { sqlStatements } = await diff(from, to, ['dbo.some_view->dbo.new_some_view']);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`EXEC sp_rename '[some_view]', [new_some_view];`);
});

test('rename view with existing flag', async () => {
	const from = {
		view: mssqlView('some_view', { id: int('id') }).existing(),
	};

	const to = {
		view: mssqlView('new_some_view', { id: int('id') }).existing(),
	};

	const { sqlStatements } = await diff(from, to, ['dbo.some_view->dbo.new_some_view']);

	expect(sqlStatements.length).toBe(0);
});

test('view alter schema', async () => {
	const schema = mssqlSchema('new_schema');

	const from = {
		view: mssqlView('some_view', { id: int('id') }).as(sql`SELECT * FROM [users]`),
	};

	const to = {
		schema,
		view: schema.view('some_view', { id: int('id') }).as(sql`SELECT * FROM [users]`),
	};

	const { sqlStatements } = await diff(from, to, ['dbo.some_view->new_schema.some_view']);

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`CREATE SCHEMA [new_schema];\n`);
	expect(sqlStatements[1]).toBe(`ALTER SCHEMA [new_schema] TRANSFER [some_view];`);
});

test('view alter schema with existing flag', async () => {
	const schema = mssqlSchema('new_schema');

	const from = {
		view: mssqlView('some_view', { id: int('id') }).existing(),
	};

	const to = {
		schema,
		view: schema.view('some_view', { id: int('id') }).existing(),
	};

	const { sqlStatements } = await diff(from, to, ['dbo.some_view->new_schema.some_view']);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`CREATE SCHEMA [new_schema];\n`);
});

test('add with option to view #1', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: mssqlView('some_view').as((qb) => qb.select().from(users)),
	};

	const to = {
		users,
		view: mssqlView('some_view').with({ encryption: true }).as((qb) => qb.select().from(users)),
	};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER VIEW [some_view]\nWITH ENCRYPTION AS (select [id] from [users]);`,
	);
});

test('add with option to view with existing flag', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: mssqlView('some_view', {}).existing(),
	};

	const to = {
		users,
		view: mssqlView('some_view', {}).with({ schemaBinding: true }).existing(),
	};

	const { sqlStatements } = await diff(from, to, []);
	expect(sqlStatements.length).toBe(0);
});

test('drop with option from view #1', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: mssqlView('some_view').with({ checkOption: true, schemaBinding: true }).as((
			qb,
		) => qb.select().from(users)),
	};

	const to = {
		users,
		view: mssqlView('some_view').as((qb) => qb.select().from(users)),
	};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER VIEW [some_view] AS (select [id] from [users]);`,
	);
});

test('drop with option from view with existing flag', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: mssqlView('some_view', {}).with({ encryption: true })
			.existing(),
	};

	const to = {
		users,
		view: mssqlView('some_view', {}).existing(),
	};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements.length).toBe(0);
});

test('alter with option in view #1', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: mssqlView('some_view').with({ checkOption: true, viewMetadata: true }).as((qb) => qb.select().from(users)),
	};

	const to = {
		users,
		view: mssqlView('some_view').with({ checkOption: true }).as((qb) => qb.select().from(users)),
	};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER VIEW [some_view] AS (select [id] from [users])\nWITH CHECK OPTION;`,
	);
});

test('alter with option in view with existing flag', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: mssqlView('some_view', {}).with({ checkOption: true, schemaBinding: true }).existing(),
	};

	const to = {
		users,
		view: mssqlView('some_view', {}).with({ checkOption: true }).existing(),
	};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements.length).toBe(0);
});

test('alter with option in view #2', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: mssqlView('some_view').with({ checkOption: true }).as((qb) => qb.selectDistinct().from(users)),
	};

	const to = {
		users,
		view: mssqlView('some_view').with({ checkOption: false }).as((
			qb,
		) => qb.selectDistinct().from(users)),
	};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER VIEW [some_view] AS (select distinct [id] from [users]);`,
	);
});

test('alter view ".as" value', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: mssqlView('some_view', { id: int('id') }).with().as(sql`SELECT '123'`),
	};

	const to = {
		users,
		view: mssqlView('some_view', { id: int('id') }).with().as(sql`SELECT '1234'`),
	};

	const { sqlStatements, statements } = await diff(from, to, []);

	console.log('statements: ', statements);

	expect(sqlStatements).toStrictEqual([
		'DROP VIEW [some_view];',
		`CREATE VIEW [some_view] AS (SELECT '1234');`,
	]);
});

test('alter view ".as" value with existing flag', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: mssqlView('some_view', { id: int('id') }).with().existing(),
	};

	const to = {
		users,
		view: mssqlView('some_view', { id: int('id') }).with().existing(),
	};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements.length).toBe(0);
});

// TODO should this only be create?
test.todo('drop existing flag', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: mssqlView('some_view', { id: int('id') }).existing(),
	};

	const to = {
		users,
		view: mssqlView('some_view', { id: int('id') }).as(sql`SELECT 'asd'`),
	};

	const { sqlStatements, statements } = await diff(from, to, []);

	console.log('statements: ', statements);
	expect(sqlStatements).toStrictEqual([
		'DROP VIEW [some_view];',
		`CREATE VIEW [some_view] AS (SELECT 'asd');`,
	]);
});

// TODO this is dropped? Why?
test.todo('set existing', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: mssqlView('some_view', { id: int('id') }).with().as(sql`SELECT 'asd'`),
	};

	const to = {
		users,
		view: mssqlView('new_some_view', { id: int('id') }).with().existing(),
	};

	const { sqlStatements } = await diff(from, to, ['dbo.some_view->dbo.new_some_view']);

	console.log('sqlStatements: ', sqlStatements);

	expect(sqlStatements.length).toBe(0);
});

test('rename view and alter view', async () => {
	const from = {
		view: mssqlView('some_view', { id: int('id') }).as(sql`SELECT * FROM [users]`),
	};

	const to = {
		view: mssqlView('new_some_view', { id: int('id') }).with({ checkOption: true }).as(
			sql`SELECT * FROM [users]`,
		),
	};

	const { sqlStatements } = await diff(from, to, ['dbo.some_view->dbo.new_some_view']);

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`EXEC sp_rename '[some_view]', [new_some_view];`);
	expect(sqlStatements[1]).toBe(`ALTER VIEW [new_some_view] AS (SELECT * FROM [users])\nWITH CHECK OPTION;`);
});

test('moved schema and alter view', async () => {
	const schema = mssqlSchema('my_schema');
	const from = {
		schema,
		view: mssqlView('some_view', { id: int('id') }).as(sql`SELECT * FROM [users]`),
	};

	const to = {
		schema,
		view: schema.view('some_view', { id: int('id') }).with({ checkOption: true }).as(
			sql`SELECT * FROM [users]`,
		),
	};

	const { sqlStatements } = await diff(from, to, ['dbo.some_view->my_schema.some_view']);

	expect(sqlStatements).toStrictEqual([
		`ALTER SCHEMA [my_schema] TRANSFER [some_view];`,
		`ALTER VIEW [some_view] AS (SELECT * FROM [users])\nWITH CHECK OPTION;`,
	]);
});
