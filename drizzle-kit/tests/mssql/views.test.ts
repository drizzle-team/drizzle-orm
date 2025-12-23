import { eq, sql } from 'drizzle-orm';
import { bit, int, mssqlSchema, mssqlTable, mssqlView, varchar } from 'drizzle-orm/mssql-core';
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
		`CREATE VIEW [some_view] AS select [id] from [users];`,
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
		`CREATE VIEW [some_view] AS SELECT * FROM [users];`,
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
	const { sqlStatements: pst } = await push({ db, to: to, ignoreSubsequent: true }); // because of encryption

	const st0 = [
		`CREATE TABLE [users] (\n\t[id] int,\n\tCONSTRAINT [users_pkey] PRIMARY KEY([id])\n);\n`,
		`CREATE VIEW [some_view1]\nWITH ENCRYPTION, SCHEMABINDING, VIEW_METADATA AS SELECT [users].[id] FROM [dbo].[users]\nWITH CHECK OPTION;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create table and view #3_1', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view1: mssqlView('some_view1', { id: int('id') }).with({
			checkOption: true,
			schemaBinding: true,
			viewMetadata: true,
		}).as(sql`SELECT ${users.id} FROM ${users}`),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to: to, ignoreSubsequent: true }); // because of encryption

	const st0 = [
		`CREATE TABLE [users] (\n\t[id] int,\n\tCONSTRAINT [users_pkey] PRIMARY KEY([id])\n);\n`,
		`CREATE VIEW [some_view1]\nWITH SCHEMABINDING, VIEW_METADATA AS SELECT [users].[id] FROM [dbo].[users]\nWITH CHECK OPTION;`,
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
	const { sqlStatements: pst } = await push({ db, to: to, ignoreSubsequent: true }); // because of encryption

	const st0 = [
		`CREATE SCHEMA [new_schema];\n`,
		`CREATE TABLE [new_schema].[users] (\n\t[id] int,\n\tCONSTRAINT [users_pkey] PRIMARY KEY([id])\n);\n`,
		`CREATE VIEW [new_schema].[some_view1]\nWITH ENCRYPTION, SCHEMABINDING, VIEW_METADATA AS SELECT [new_schema].[users].[id] FROM [new_schema].[users]\nWITH CHECK OPTION;`,
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create table and view #4_1', async () => {
	const schema = mssqlSchema('new_schema');

	const users = schema.table('users', {
		id: int('id').primaryKey().notNull(),
	});
	const to = {
		schema,
		users: users,
		view1: schema.view('some_view1', { id: int('id') }).with({
			checkOption: true,
			schemaBinding: true,
			viewMetadata: true,
		}).as(sql`SELECT ${users.id} FROM ${users}`),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to: to, ignoreSubsequent: true }); // because of encryption

	const st0 = [
		`CREATE SCHEMA [new_schema];\n`,
		`CREATE TABLE [new_schema].[users] (\n\t[id] int,\n\tCONSTRAINT [users_pkey] PRIMARY KEY([id])\n);\n`,
		`CREATE VIEW [new_schema].[some_view1]\nWITH SCHEMABINDING, VIEW_METADATA AS SELECT [new_schema].[users].[id] FROM [new_schema].[users]\nWITH CHECK OPTION;`,
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
	const { sqlStatements: pst } = await push({ db, to: to, ignoreSubsequent: true });

	const st0 = [
		`CREATE SCHEMA [new_schema];\n`,
		`CREATE TABLE [new_schema].[users] (\n\t[id] int,\n\tCONSTRAINT [users_pkey] PRIMARY KEY([id])\n);\n`,
		`CREATE VIEW [new_schema].[some_view1]\nWITH ENCRYPTION, SCHEMABINDING, VIEW_METADATA AS SELECT [new_schema].[users].[id] FROM [new_schema].[users]\nWITH CHECK OPTION;`,
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create table and view #4_1', async () => {
	const schema = mssqlSchema('new_schema');

	const users = schema.table('users', {
		id: int('id').primaryKey().notNull(),
	});
	const to = {
		schema,
		users: users,
		view1: schema.view('some_view1', { id: int('id') }).with({
			checkOption: true,
			schemaBinding: true,
			viewMetadata: true,
		}).as(sql`SELECT ${users.id} FROM ${users}`),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to: to, ignoreSubsequent: true });

	const st0 = [
		`CREATE SCHEMA [new_schema];\n`,
		`CREATE TABLE [new_schema].[users] (\n\t[id] int,\n\tCONSTRAINT [users_pkey] PRIMARY KEY([id])\n);\n`,
		`CREATE VIEW [new_schema].[some_view1]\nWITH SCHEMABINDING, VIEW_METADATA AS SELECT [new_schema].[users].[id] FROM [new_schema].[users]\nWITH CHECK OPTION;`,
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
		`CREATE VIEW [some_view] AS SELECT * FROM [users]\nWITH CHECK OPTION;`,
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

	const st0 = [`ALTER VIEW [some_view]\nWITH ENCRYPTION AS select [id] from [users];`];
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

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to });

	const st0 = [`ALTER VIEW [some_view] AS select [id] from [users];`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter definition', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: mssqlView('some_view').with().as((
			qb,
		) => qb.select().from(users)),
	};

	const to = {
		users,
		view: mssqlView('some_view').as((qb) => qb.select().from(users).where(sql`1=1`)),
	};

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to });

	const st0 = [`ALTER VIEW [some_view] AS select [id] from [users] where 1=1;`];
	expect(st).toStrictEqual(st0);
	// no changes on definition alter for push
	expect(pst).toStrictEqual([]);
});

test('alter options multistep', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: mssqlView('some_view').with({ checkOption: true, schemaBinding: true, viewMetadata: true })
			.as((
				qb,
			) => qb.select().from(users)),
	};

	const to = {
		users,
		view: mssqlView('some_view').as((qb) => qb.select().from(users)),
	};

	const { sqlStatements: st, next: n1 } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to });

	const st0 = [`ALTER VIEW [some_view] AS select [id] from [users];`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);

	const to2 = {
		users,
		view: mssqlView('some_view').with({ checkOption: true, schemaBinding: true, viewMetadata: true })
			.as((
				qb,
			) => qb.select().from(users)),
	};
	const { sqlStatements: st_2, next: n2 } = await diff(n1, to2, []);
	const { sqlStatements: pst_2 } = await push({ db, to: to2 });

	const st2 = [
		`ALTER VIEW [some_view]\nWITH SCHEMABINDING, VIEW_METADATA AS select [id] from [dbo].[users]\nWITH CHECK OPTION;`,
	];
	expect(st_2).toStrictEqual(st2);
	expect(pst_2).toStrictEqual(st2);

	// Alter definition
	const to3 = {
		users,
		view: mssqlView('some_view').with({ checkOption: true, schemaBinding: true, viewMetadata: true })
			.as((
				qb,
			) => qb.select().from(users).where(sql`1=1`)),
	};
	const { sqlStatements: st_3 } = await diff(n2, to3, []);
	const { sqlStatements: pst_3 } = await push({ db, to: to3 });

	const st3 = [
		`ALTER VIEW [some_view]\nWITH SCHEMABINDING, VIEW_METADATA AS select [id] from [dbo].[users] where 1=1\nWITH CHECK OPTION;`,
	];
	expect(st_3).toStrictEqual(st3);
	expect(pst_3).toStrictEqual([]);
});

test('alter view_metadata', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: mssqlView('some_view').with({ viewMetadata: true })
			.as((
				qb,
			) => qb.select().from(users)),
	};

	const to = {
		users,
		view: mssqlView('some_view').as((qb) => qb.select().from(users)),
	};

	const { sqlStatements: st, next: n1 } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to });

	const st0 = [`ALTER VIEW [some_view] AS select [id] from [users];`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
	expect(n1.views.list()).toStrictEqual([
		{
			checkOption: false,
			definition: 'select [id] from [users]',
			encryption: false,
			entityType: 'views',
			name: 'some_view',
			schema: 'dbo',
			schemaBinding: false,
			viewMetadata: false,
		},
	]);

	const to2 = {
		users,
		view: mssqlView('some_view').with({ viewMetadata: true })
			.as((
				qb,
			) => qb.select().from(users)),
	};
	const { sqlStatements: st_2, next: n2 } = await diff(n1, to2, []);
	const { sqlStatements: pst_2 } = await push({ db, to: to2 });

	const st2 = [
		`ALTER VIEW [some_view]\nWITH VIEW_METADATA AS select [id] from [users];`,
	];
	expect(st_2).toStrictEqual(st2);
	expect(pst_2).toStrictEqual(st2);
	expect(n2.views.list()).toStrictEqual([{
		checkOption: false,
		definition: 'select [id] from [users]',
		encryption: false,
		entityType: 'views',
		name: 'some_view',
		schema: 'dbo',
		schemaBinding: false,
		viewMetadata: true,
	}]);
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

	expect(st).toStrictEqual([]);
	expect(pst).toStrictEqual([]);
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

	const st0 = [`ALTER VIEW [some_view] AS select [id] from [users]\nWITH CHECK OPTION;`];
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

	const st0 = [`ALTER VIEW [some_view] AS select distinct [id] from [users];`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter view ".as" value', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: mssqlView('some_view', { id: int('id') }).with().as(sql`SELECT * from ${users}`),
	};

	const to = {
		users,
		view: mssqlView('some_view', { id: int('id') }).with().as(sql`SELECT [id] from ${users}`),
	};

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to });

	const st0 = ['ALTER VIEW [some_view] AS SELECT [id] from [users];'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]); // do not trigger on push
});

test('existing flag', async () => {
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
		view: mssqlView('some_view', { id: int('id') }).as(sql`SELECT * from [users]`),
	};

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to });

	const st0 = [`CREATE VIEW [some_view] AS SELECT * from [users];`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('set existing', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: mssqlView('some_view', { id: int('id') }).as(sql`SELECT * from [users]`),
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
	const users = mssqlTable('users', {
		id: int(),
	});

	const from = {
		users,
		view: mssqlView('some_view', { id: int('id') }).as(sql`SELECT * FROM [users]`),
	};

	const to = {
		users,
		view: mssqlView('new_some_view', { id: int('id') }).with({ checkOption: true }).as(
			sql`SELECT * FROM [users]`,
		),
	};

	const { sqlStatements: st } = await diff(from, to, ['dbo.some_view->dbo.new_some_view']);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to, renames: ['dbo.some_view->dbo.new_some_view'] });

	const st0 = [
		`EXEC sp_rename 'some_view', [new_some_view];`,
		`ALTER VIEW [new_some_view] AS SELECT * FROM [users]\nWITH CHECK OPTION;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('moved schema and alter view', async () => {
	const schema = mssqlSchema('my_schema');
	const users = mssqlTable('users', {
		id: int(),
	});

	const from = {
		users,
		schema,
		view: mssqlView('some_view', { id: int('id') }).as(sql`SELECT * FROM [users]`),
	};

	const to = {
		users,
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
		`ALTER VIEW [my_schema].[some_view] AS SELECT * FROM [users]\nWITH CHECK OPTION;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/5113
test('view with "with"', async () => {
	const ebayStatus = mssqlTable('ebay_status', {
		id: varchar()
			.primaryKey()
			.notNull()
			.default(sql`newid()`),
		text: varchar({ length: 50 }).notNull(),
		disabled: bit().notNull().default(false),
	});

	const ebayStatusLog = mssqlTable('ebay_status_log', {
		id: varchar()
			.primaryKey()
			.notNull()
			.default(sql`newid()`),
		ebayCaseID: varchar('ebay_case_id')
			.notNull(),
		statusID: varchar('status_id')
			.notNull(),
		created: varchar('created'),
		createdBy: varchar('created_by'),
	});

	const test = mssqlView('ebay_status_latest').as((qb) => {
		const latestStatus = qb.$with('statuslog_latest').as(
			qb
				.select({
					ebayCaseID: ebayStatusLog.ebayCaseID,
					statusID: ebayStatusLog.statusID,
					created: ebayStatusLog.created,
					createdBy: ebayStatusLog.createdBy,
					row:
						sql`(ROW_NUMBER() OVER (PARTITION BY ${ebayStatusLog.ebayCaseID} ORDER BY ${ebayStatusLog.created} DESC))`
							.as(
								'row',
							),
				})
				.from(ebayStatusLog),
		);

		return qb
			.with(latestStatus)
			.select()
			.from(latestStatus)
			.where(eq(latestStatus.row, 1));
	});

	const from = { test, ebayStatus, ebayStatusLog };

	const { sqlStatements: st } = await diff({}, from, []);
	const { sqlStatements: pst } = await push({ db, to: from });

	const st0 = [
		`CREATE TABLE [ebay_status] (
\t[id] varchar CONSTRAINT [ebay_status_id_default] DEFAULT (newid()),
\t[text] varchar(50) NOT NULL,
\t[disabled] bit NOT NULL CONSTRAINT [ebay_status_disabled_default] DEFAULT ((0)),
\tCONSTRAINT [ebay_status_pkey] PRIMARY KEY([id])
);\n`,
		`CREATE TABLE [ebay_status_log] (
\t[id] varchar CONSTRAINT [ebay_status_log_id_default] DEFAULT (newid()),
\t[ebay_case_id] varchar NOT NULL,
\t[status_id] varchar NOT NULL,
\t[created] varchar,
\t[created_by] varchar,
\tCONSTRAINT [ebay_status_log_pkey] PRIMARY KEY([id])
);\n`,
		'CREATE VIEW [ebay_status_latest] AS with [statuslog_latest] as '
		+ '(select [ebay_case_id], [status_id], [created], [created_by], (ROW_NUMBER() OVER (PARTITION BY [ebay_case_id] ORDER BY [created] DESC)) as [row] '
		+ 'from [ebay_status_log]) select [ebay_case_id], [status_id], [created], [created_by], [row] from [statuslog_latest] where [row] = 1;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
