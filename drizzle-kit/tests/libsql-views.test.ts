import { sql } from 'drizzle-orm';
import { int, sqliteTable, sqliteView } from 'drizzle-orm/sqlite-core';
import { expect, test } from 'vitest';
import { diffTestSchemasLibSQL } from './schemaDiffer';

test('create view', async () => {
	const users = sqliteTable('users', { id: int('id').default(1) });
	const view = sqliteView('view').as((qb) => qb.select().from(users));
	const to = {
		users: users,
		testView: view,
	};

	const { statements, sqlStatements } = await diffTestSchemasLibSQL({}, to, []);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'sqlite_create_table',
		tableName: 'users',
		columns: [{
			autoincrement: false,
			default: 1,
			name: 'id',
			type: 'integer',
			primaryKey: false,
			notNull: false,
		}],
		compositePKs: [],
		uniqueConstraints: [],
		referenceData: [],
		checkConstraints: [],
	});
	expect(statements[1]).toStrictEqual({
		type: 'sqlite_create_view',
		name: 'view',
		definition: 'select "id" from "users"',
	});

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`CREATE TABLE \`users\` (
\t\`id\` integer DEFAULT 1
);\n`);
	expect(sqlStatements[1]).toBe(`CREATE VIEW \`view\` AS select "id" from "users";`);
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

	const { statements, sqlStatements } = await diffTestSchemasLibSQL(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		name: 'view',
		type: 'drop_view',
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`DROP VIEW \`view\`;`,
	);
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
	const { statements, sqlStatements } = await diffTestSchemasLibSQL(from, to, []);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		name: 'view',
		type: 'drop_view',
	});
	expect(statements[1]).toStrictEqual({
		name: 'view',
		type: 'sqlite_create_view',
		definition: 'SELECT * FROM users WHERE users.id = 1',
	});

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(
		`DROP VIEW \`view\`;`,
	);
	expect(sqlStatements[1]).toBe(
		`CREATE VIEW \`view\` AS SELECT * FROM users WHERE users.id = 1;`,
	);
});

test('create view with existing flag', async () => {
	const view = sqliteView('view', {}).existing();
	const to = {
		testView: view,
	};

	const { statements, sqlStatements } = await diffTestSchemasLibSQL({}, to, []);

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

	const { statements, sqlStatements } = await diffTestSchemasLibSQL(from, to, []);

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
	const { statements, sqlStatements } = await diffTestSchemasLibSQL(from, to, ['view->new_view']);

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
	const { statements, sqlStatements } = await diffTestSchemasLibSQL(from, to, ['view->new_view']);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		name: 'view',
		type: 'drop_view',
	});
	expect(statements[1]).toStrictEqual({
		type: 'sqlite_create_view',
		name: 'new_view',
		definition: 'SELECT * FROM users',
	});

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe('DROP VIEW `view`;');
	expect(sqlStatements[1]).toBe(`CREATE VIEW \`new_view\` AS SELECT * FROM users;`);
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
	const { statements, sqlStatements } = await diffTestSchemasLibSQL(from, to, ['view->new_view']);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		name: 'view',
		type: 'drop_view',
	});
	expect(statements[1]).toStrictEqual({
		type: 'sqlite_create_view',
		name: 'new_view',
		definition: 'SELECT * FROM users WHERE 1=1',
	});

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe('DROP VIEW `view`;');
	expect(sqlStatements[1]).toBe(`CREATE VIEW \`new_view\` AS SELECT * FROM users WHERE 1=1;`);
});
