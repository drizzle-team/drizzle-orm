import { sql } from 'drizzle-orm';
import { int, mssqlSchema, mssqlTable, mssqlView } from 'drizzle-orm/mssql-core';
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

test('create table and view #1', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view: mssqlView('some_view').as((qb) => qb.select().from(users)),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to: to });

	const st0 = [
		`CREATE TABLE [users] (\n\t[id] int,\n\tCONSTRAINT [users_pkey] PRIMARY KEY([id])\n);\n`,
		`CREATE VIEW [some_view] AS (select [id] from [users]);`,
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create table and view #2', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view: mssqlView('some_view', { id: int('id') }).as(sql`SELECT * FROM ${users}`),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to: to });

	const st0 = [
		`CREATE TABLE [users] (\n\t[id] int,\n\tCONSTRAINT [users_pkey] PRIMARY KEY([id])\n);\n`,
		`CREATE VIEW [some_view] AS (SELECT * FROM [users]);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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
		}).as(sql`SELECT ${users.id} FROM ${users}`),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to: to });

	const st0 = [
		`CREATE TABLE [users] (\n\t[id] int,\n\tCONSTRAINT [users_pkey] PRIMARY KEY([id])\n);\n`,
		`CREATE VIEW [some_view1]\nWITH ENCRYPTION, SCHEMABINDING, VIEW_METADATA AS (SELECT * FROM [users])\nWITH CHECK OPTION;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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
		}).as(sql`SELECT ${users.id} FROM ${users}`),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to: to });

	const st0 = [
		`CREATE SCHEMA [new_schema];\n`,
		`CREATE TABLE [new_schema].[users] (\n\t[id] int,\n\tCONSTRAINT [users_pkey] PRIMARY KEY([id])\n);\n`,
		`CREATE VIEW [new_schema].[some_view1]\nWITH ENCRYPTION, SCHEMABINDING, VIEW_METADATA AS (SELECT * FROM [new_schema].[users])\nWITH CHECK OPTION;`,
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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
	await expect(push({ db, to: to })).rejects.toThrow();
});

test('create table and view #6', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view1: mssqlView('some_view', { id: int('id') }).with({ checkOption: true }).as(sql`SELECT * FROM ${users}`),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to: to });

	const st0 = [
		`CREATE TABLE [users] (\n\t[id] int,\n\tCONSTRAINT [users_pkey] PRIMARY KEY([id])\n);\n`,
		`CREATE VIEW [some_view] AS (SELECT * FROM [users])\nWITH CHECK OPTION;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to });

	expect(st).toStrictEqual([]);
	expect(pst).toStrictEqual([]);
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

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to });

	const st0 = [`DROP VIEW [some_view];`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to });

	expect(st).toStrictEqual([]);
	expect(pst).toStrictEqual([]);
});

test('rename view #1', async () => {
	const users = mssqlTable('users', { id: int() });
	const from = {
		users,
		view: mssqlView('some_view', { id: int('id') }).as(sql`SELECT * FROM [users]`),
	};

	const to = {
		users,
		view: mssqlView('new_some_view', { id: int('id') }).as(sql`SELECT * FROM [users]`),
	};

	const { sqlStatements: st } = await diff(from, to, ['dbo.some_view->dbo.new_some_view']);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to, renames: ['dbo.some_view->dbo.new_some_view'] });

	const st0 = [`EXEC sp_rename 'some_view', [new_some_view];`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename view with existing flag', async () => {
	const from = {
		view: mssqlView('some_view', { id: int('id') }).existing(),
	};

	const to = {
		view: mssqlView('new_some_view', { id: int('id') }).existing(),
	};

	const { sqlStatements: st } = await diff(from, to, ['dbo.some_view->dbo.new_some_view']);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to, renames: ['dbo.some_view->dbo.new_some_view'] });

	expect(st).toStrictEqual([]);
	expect(pst).toStrictEqual([]);
});

test('view alter schema', async () => {
	const schema = mssqlSchema('new_schema');
	const users = mssqlTable('users', { id: int() });

	const from = {
		users,
		view: mssqlView('some_view', { id: int('id') }).as(sql`SELECT * FROM [users]`),
	};

	const to = {
		users,
		schema,
		view: schema.view('some_view', { id: int('id') }).as(sql`SELECT * FROM [users]`),
	};

	const { sqlStatements: st } = await diff(from, to, ['dbo.some_view->new_schema.some_view']);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to, renames: ['dbo.some_view->new_schema.some_view'] });

	const st0 = [`CREATE SCHEMA [new_schema];\n`, `ALTER SCHEMA [new_schema] TRANSFER [some_view];`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(from, to, ['dbo.some_view->new_schema.some_view']);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to, renames: ['dbo.some_view->new_schema.some_view'] });

	const st0 = [`CREATE SCHEMA [new_schema];\n`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to });

	const st0 = [`ALTER VIEW [some_view]\nWITH ENCRYPTION AS (select [id] from [users]);`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to });

	expect(st).toStrictEqual([]);
	expect(pst).toStrictEqual([]);
});

test.only('drop with option from view #1', async () => {
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

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from, log: 'statements' });
	const { sqlStatements: pst } = await push({ db, to: to });

	const st0 = [`ALTER VIEW [some_view] AS (select [id] from [users]);`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to });

	expect(st).toStrictEqual(0);
	expect(pst).toStrictEqual(0);
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

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to });

	const st0 = [`ALTER VIEW [some_view] AS (select [id] from [users])\nWITH CHECK OPTION;`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to });

	expect(st).toStrictEqual([]);
	expect(pst).toStrictEqual([]);
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

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to });

	const st0 = [`ALTER VIEW [some_view] AS (select distinct [id] from [users]);`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to });

	const st0 = ['DROP VIEW [some_view];', `CREATE VIEW [some_view] AS (SELECT '1234');`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to });

	expect(st).toStrictEqual([]);
	expect(pst).toStrictEqual([]);
});

test('drop existing flag', async () => {
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

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to });

	const st0 = [`CREATE VIEW [some_view] AS (SELECT 'asd');`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('set existing', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: mssqlView('some_view', { id: int('id') }).as(sql`SELECT 'asd'`),
	};

	const to = {
		users,
		view: mssqlView('some_view', { id: int('id') }).existing(),
	};

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to });

	const st0 = [`DROP VIEW [some_view];`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(from, to, ['dbo.some_view->dbo.new_some_view']);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to, renames: ['dbo.some_view->dbo.new_some_view'] });

	const st0 = [
		`EXEC sp_rename 'some_view', [new_some_view];`,
		`ALTER VIEW [new_some_view] AS (SELECT * FROM [users])\nWITH CHECK OPTION;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(from, to, ['dbo.some_view->my_schema.some_view']);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to, renames: ['dbo.some_view->my_schema.some_view'] });

	const st0 = [
		`ALTER SCHEMA [my_schema] TRANSFER [some_view];`,
		`ALTER VIEW [my_schema].[some_view] AS (SELECT * FROM [users])\nWITH CHECK OPTION;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
