import { sql } from 'drizzle-orm';
import { int, sqliteTable, sqliteView } from 'drizzle-orm/sqlite-core';
import { expect, test } from 'vitest';
import { diff } from './mocks-sqlite';

test('create view', async () => {
	const users = sqliteTable('users', { id: int('id').default(1) });
	const view = sqliteView('view').as((qb) => qb.select().from(users));
	const to = {
		users: users,
		testView: view,
	};

	const { sqlStatements } = await diff({}, to, []);

	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE \`users\` (\n\t\`id\` integer DEFAULT 1\n);\n`,
		`CREATE VIEW \`view\` AS select "id" from "users";`,
	]);
});

test('drop view', async () => {
	const users = sqliteTable('users', {
		id: int('id').primaryKey({ autoIncrement: true }),
	});

	const from = {
		users: users,
		testView: sqliteView('view', { id: int('id') }).as(sql`SELECT * FROM users`),
	};
	const to = {
		users,
	};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([`DROP VIEW \`view\`;`]);
});

test('alter view', async () => {
	const users = sqliteTable('users', {
		id: int('id').primaryKey({ autoIncrement: true }),
	});

	const from = {
		users: users,
		testView: sqliteView('view', { id: int('id') }).as(sql`SELECT * FROM users`),
	};
	const to = {
		users,
		testView: sqliteView('view', { id: int('id') }).as(sql`SELECT * FROM users WHERE users.id = 1`),
	};
	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual(
		[
			'DROP VIEW `view`;',
			'CREATE VIEW `view` AS SELECT * FROM users WHERE users.id = 1;',
		],
	);
});

test('create view with existing flag', async () => {
	const view = sqliteView('view', {}).existing();
	const to = {
		testView: view,
	};

	const { statements, sqlStatements } = await diff({}, to, []);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('drop view with existing flag', async () => {
	const users = sqliteTable('users', {
		id: int('id').primaryKey({ autoIncrement: true }),
	});

	const from = {
		users: users,
		testView: sqliteView('view', { id: int('id') }).existing(),
	};
	const to = {
		users,
	};

	const { statements, sqlStatements } = await diff(from, to, []);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('rename view with existing flag', async () => {
	const users = sqliteTable('users', {
		id: int('id').primaryKey({ autoIncrement: true }),
	});

	const from = {
		users: users,
		testView: sqliteView('view', { id: int('id') }).existing(),
	};
	const to = {
		users,
		testView: sqliteView('new_view', { id: int('id') }).existing(),
	};
	const { statements, sqlStatements } = await diff(from, to, ['view->new_view']);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('rename view and drop existing flag', async () => {
	const users = sqliteTable('users', {
		id: int('id').primaryKey({ autoIncrement: true }),
	});

	const from = {
		users: users,
		testView: sqliteView('view', { id: int('id') }).existing(),
	};
	const to = {
		users,
		testView: sqliteView('new_view', { id: int('id') }).as(sql`SELECT * FROM users`),
	};
	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual(['CREATE VIEW `new_view` AS SELECT * FROM users;']);
});

test('rename view and alter ".as"', async () => {
	const users = sqliteTable('users', {
		id: int('id').primaryKey({ autoIncrement: true }),
	});

	const from = {
		users: users,
		testView: sqliteView('view', { id: int('id') }).as(sql`SELECT * FROM users`),
	};
	const to = {
		users,
		testView: sqliteView('new_view', { id: int('id') }).as(sql`SELECT * FROM users WHERE 1=1`),
	};
	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		'DROP VIEW `view`;',
		'CREATE VIEW `new_view` AS SELECT * FROM users WHERE 1=1;',
	]);
});
