import { sql } from 'drizzle-orm';
import { googlesqlTable, googlesqlView, int64 } from 'drizzle-orm/googlesql';
import { expect, test } from 'vitest';
import { diffTestSchemasGooglesql } from './schemaDiffer';

test('create view #1', async () => {
	const users = googlesqlTable('users', {
		id: int64('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
	};
	const to = {
		users: users,
		view: googlesqlView('some_view').as((qb) => qb.select().from(users)),
	};

	const { statements, sqlStatements } = await diffTestSchemasGooglesql(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'googlesql_create_view',
		name: 'some_view',
		replace: false,
		definition: 'select `id` from `users`',
		sqlSecurity: 'definer',
	});

	expect(sqlStatements.length).toBe(1);
	// TODO: SPANNER - warning: this query will not work in strict name resolution mode: "Alias id cannot be used without a qualifier in strict name resolution mode"
	expect(sqlStatements[0]).toBe(`CREATE VIEW \`some_view\`
SQL SECURITY definer
AS (select \`id\` from \`users\`);`);
});

test('create view #2', async () => {
	const users = googlesqlTable('users', {
		id: int64('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
	};
	const to = {
		users: users,
		view: googlesqlView('some_view', {}).sqlSecurity('definer').as(sql`SELECT * FROM ${users}`),
	};

	const { statements, sqlStatements } = await diffTestSchemasGooglesql(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'googlesql_create_view',
		name: 'some_view',
		replace: false,
		definition: 'SELECT * FROM \`users\`',
		sqlSecurity: 'definer',
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`CREATE VIEW \`some_view\`
SQL SECURITY definer
AS (SELECT * FROM \`users\`);`);
});

test('create view with existing flag', async () => {
	const users = googlesqlTable('users', {
		id: int64('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
	};
	const to = {
		users: users,
		view: googlesqlView('some_view', {}).existing(),
	};

	const { statements, sqlStatements } = await diffTestSchemasGooglesql(from, to, []);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('drop view', async () => {
	const users = googlesqlTable('users', {
		id: int64('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
		view: googlesqlView('some_view', {}).sqlSecurity('definer')
			.as(sql`SELECT * FROM ${users}`),
	};
	const to = {
		users: users,
	};

	const { statements, sqlStatements } = await diffTestSchemasGooglesql(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'drop_view',
		name: 'some_view',
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`DROP VIEW \`some_view\`;`);
});

test('drop view with existing flag', async () => {
	const users = googlesqlTable('users', {
		id: int64('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
		view: googlesqlView('some_view', {}).sqlSecurity('definer')
			.existing(),
	};
	const to = {
		users: users,
	};

	const { statements, sqlStatements } = await diffTestSchemasGooglesql(from, to, []);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('rename view - ERROR', async () => {
	const users = googlesqlTable('users', {
		id: int64('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
		view: googlesqlView('some_view', {}).sqlSecurity('definer')
			.as(sql`SELECT * FROM ${users}`),
	};
	const to = {
		users: users,
		view: googlesqlView('new_some_view', {}).sqlSecurity('definer')
			.as(sql`SELECT * FROM ${users}`),
	};

	await expect(diffTestSchemasGooglesql(from, to, [
		'public.some_view->public.new_some_view',
	])).rejects.toThrowError(
		'Google Cloud Spanner does not support renaming views',
	);
});

test('rename view and alter meta options - ERROR', async () => {
	const users = googlesqlTable('users', {
		id: int64('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
		view: googlesqlView('some_view', {}).sqlSecurity('definer')
			.as(sql`SELECT * FROM ${users}`),
	};
	const to = {
		users: users,
		view: googlesqlView('new_some_view', {}).sqlSecurity('definer')
			.as(sql`SELECT * FROM ${users}`),
	};

	await expect(diffTestSchemasGooglesql(from, to, [
		'public.some_view->public.new_some_view',
	])).rejects.toThrowError(
		'Google Cloud Spanner does not support renaming views',
	);
});

test('rename view with existing flag', async () => {
	const users = googlesqlTable('users', {
		id: int64('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
		view: googlesqlView('some_view', {}).sqlSecurity('definer')
			.existing(),
	};
	const to = {
		users: users,
		view: googlesqlView('new_some_view', {}).sqlSecurity('definer')
			.existing(),
	};

	const { statements, sqlStatements } = await diffTestSchemasGooglesql(from, to, [
		'public.some_view->public.new_some_view',
	]);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('add meta to view', async () => {
	const users = googlesqlTable('users', {
		id: int64('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
		view: googlesqlView('some_view', {}).as(sql`SELECT * FROM ${users}`),
	};
	const to = {
		users: users,
		view: googlesqlView('some_view', {}).sqlSecurity('invoker')
			.as(sql`SELECT * FROM ${users}`),
	};

	const { statements, sqlStatements } = await diffTestSchemasGooglesql(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columns: {},
		definition: 'SELECT * FROM `users`',
		isExisting: false,
		name: 'some_view',
		sqlSecurity: 'invoker',
		type: 'alter_googlesql_view',
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`CREATE OR REPLACE VIEW \`some_view\`
SQL SECURITY invoker
AS (SELECT * FROM \`users\`);`);
});

test('add meta to view with existing flag', async () => {
	const users = googlesqlTable('users', {
		id: int64('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
		view: googlesqlView('some_view', {}).existing(),
	};
	const to = {
		users: users,
		view: googlesqlView('some_view', {}).sqlSecurity('definer')
			.existing(),
	};

	const { statements, sqlStatements } = await diffTestSchemasGooglesql(from, to, []);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('alter meta to view', async () => {
	const users = googlesqlTable('users', {
		id: int64('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
		view: googlesqlView('some_view', {}).sqlSecurity('invoker')
			.as(sql`SELECT * FROM ${users}`),
	};
	const to = {
		users: users,
		view: googlesqlView('some_view', {}).sqlSecurity('definer')
			.as(sql`SELECT * FROM ${users}`),
	};

	const { statements, sqlStatements } = await diffTestSchemasGooglesql(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columns: {},
		definition: 'SELECT * FROM `users`',
		isExisting: false,
		name: 'some_view',
		sqlSecurity: 'definer',
		type: 'alter_googlesql_view',
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`CREATE OR REPLACE VIEW \`some_view\`
SQL SECURITY definer
AS (SELECT * FROM \`users\`);`);
});

test('alter meta to view with existing flag', async () => {
	const users = googlesqlTable('users', {
		id: int64('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
		view: googlesqlView('some_view', {}).sqlSecurity('invoker')
			.existing(),
	};
	const to = {
		users: users,
		view: googlesqlView('some_view', {}).sqlSecurity('definer')
			.existing(),
	};

	const { statements, sqlStatements } = await diffTestSchemasGooglesql(from, to, []);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('drop meta from view', async () => {
	const users = googlesqlTable('users', {
		id: int64('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
		view: googlesqlView('some_view', {}).sqlSecurity('invoker')
			.as(sql`SELECT * FROM ${users}`),
	};
	const to = {
		users: users,
		view: googlesqlView('some_view', {}).as(sql`SELECT * FROM ${users}`),
	};

	const { statements, sqlStatements } = await diffTestSchemasGooglesql(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columns: {},
		definition: 'SELECT * FROM `users`',
		isExisting: false,
		name: 'some_view',
		sqlSecurity: 'definer',
		type: 'alter_googlesql_view',
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`CREATE OR REPLACE VIEW \`some_view\`
SQL SECURITY definer
AS (SELECT * FROM \`users\`);`);
});

test('drop meta from view existing flag', async () => {
	const users = googlesqlTable('users', {
		id: int64('id').primaryKey().notNull(),
	});

	const from = {
		users: users,

		view: googlesqlView('some_view', {}).sqlSecurity('definer')
			.existing(),
	};
	const to = {
		users: users,
		view: googlesqlView('some_view', {}).existing(),
	};

	const { statements, sqlStatements } = await diffTestSchemasGooglesql(from, to, []);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('alter view ".as" value', async () => {
	const users = googlesqlTable('users', {
		id: int64('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
		view: googlesqlView('some_view', {}).sqlSecurity('invoker')
			.as(sql`SELECT * FROM ${users}`),
	};
	const to = {
		users: users,
		view: googlesqlView('some_view', {}).sqlSecurity('invoker')
			.as(sql`SELECT * FROM ${users} WHERE ${users.id} = 1`),
	};

	const { statements, sqlStatements } = await diffTestSchemasGooglesql(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		definition: 'SELECT * FROM `users` WHERE `users`.`id` = 1',
		name: 'some_view',
		sqlSecurity: 'invoker',
		type: 'googlesql_create_view',
		replace: true,
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`CREATE OR REPLACE VIEW \`some_view\`
SQL SECURITY invoker
AS (SELECT * FROM \`users\` WHERE \`users\`.\`id\` = 1);`);
});

test('rename and alter view ".as" value', async () => {
	const users = googlesqlTable('users', {
		id: int64('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
		view: googlesqlView('some_view', {}).sqlSecurity('invoker')
			.as(sql`SELECT * FROM ${users}`),
	};
	const to = {
		users: users,
		view: googlesqlView('new_some_view', {}).sqlSecurity('invoker')
			.as(sql`SELECT * FROM ${users} WHERE ${users.id} = 1`),
	};

	await expect(diffTestSchemasGooglesql(from, to, [
		'public.some_view->public.new_some_view',
	])).rejects.toThrowError(
		'Google Cloud Spanner does not support renaming views',
	);
});

test('set existing', async () => {
	const users = googlesqlTable('users', {
		id: int64('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
		view: googlesqlView('some_view', {}).sqlSecurity('invoker')
			.as(sql`SELECT * FROM ${users}`),
	};
	const to = {
		users: users,
		view: googlesqlView('new_some_view', {}).sqlSecurity('invoker')
			.existing(),
	};

	const { statements, sqlStatements } = await diffTestSchemasGooglesql(from, to, [
		'public.some_view->public.new_some_view',
	]);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('drop existing', async () => {
	const users = googlesqlTable('users', {
		id: int64('id').primaryKey().notNull(),
	});

	const from = {
		users: users,
		view: googlesqlView('some_view', {}).sqlSecurity('invoker')
			.existing(),
	};
	const to = {
		users: users,
		view: googlesqlView('new_some_view', {}).sqlSecurity('invoker')
			.as(sql`SELECT * FROM ${users} WHERE ${users.id} = 1`),
	};

	const { statements, sqlStatements } = await diffTestSchemasGooglesql(from, to, [
		'public.some_view->public.new_some_view',
	]);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		name: 'new_some_view',
		type: 'drop_view',
	});
	expect(statements[1]).toStrictEqual({
		definition: 'SELECT * FROM `users` WHERE `users`.`id` = 1',
		name: 'new_some_view',
		sqlSecurity: 'invoker',
		type: 'googlesql_create_view',
		replace: false,
	});

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`DROP VIEW \`new_some_view\`;`); // TODO: SPANNER - isn't  this a bug that also exists in mysql-views.test.ts? shouldnt it be `DROP VIEW \`some_view\`;`?
	expect(sqlStatements[1]).toBe(`CREATE VIEW \`new_some_view\`
SQL SECURITY invoker
AS (SELECT * FROM \`users\` WHERE \`users\`.\`id\` = 1);`);
});
