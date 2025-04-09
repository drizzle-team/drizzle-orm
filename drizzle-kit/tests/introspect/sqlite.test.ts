import Database from 'better-sqlite3';
import { SQL, sql } from 'drizzle-orm';
import { check, int, sqliteTable, sqliteView, text } from 'drizzle-orm/sqlite-core';
import * as fs from 'fs';
import { introspectSQLiteToFile } from 'tests/schemaDiffer';
import { expect, test } from 'vitest';

if (!fs.existsSync('tests/introspect/sqlite')) {
	fs.mkdirSync('tests/introspect/sqlite');
}

test('generated always column: link to another column', async () => {
	const sqlite = new Database(':memory:');

	const schema = {
		users: sqliteTable('users', {
			id: int('id'),
			email: text('email'),
			generatedEmail: text('generatedEmail').generatedAlwaysAs(
				(): SQL => sql`\`email\``,
			),
		}),
	};

	const { statements, sqlStatements } = await introspectSQLiteToFile(
		sqlite,
		schema,
		'generated-link-column',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('generated always column virtual: link to another column', async () => {
	const sqlite = new Database(':memory:');

	const schema = {
		users: sqliteTable('users', {
			id: int('id'),
			email: text('email'),
			generatedEmail: text('generatedEmail').generatedAlwaysAs(
				(): SQL => sql`\`email\``,
				{ mode: 'virtual' },
			),
		}),
	};

	const { statements, sqlStatements } = await introspectSQLiteToFile(
		sqlite,
		schema,
		'generated-link-column-virtual',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('instrospect strings with single quotes', async () => {
	const sqlite = new Database(':memory:');

	const schema = {
		columns: sqliteTable('columns', {
			text: text('text').default('escape\'s quotes " '),
		}),
	};

	const { statements, sqlStatements } = await introspectSQLiteToFile(
		sqlite,
		schema,
		'introspect-strings-with-single-quotes',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect checks', async () => {
	const sqlite = new Database(':memory:');

	const schema = {
		users: sqliteTable('users', {
			id: int('id'),
			name: text('name'),
			age: int('age'),
		}, (table) => ({
			someCheck: check('some_check', sql`${table.age} > 21`),
		})),
	};

	const { statements, sqlStatements } = await introspectSQLiteToFile(
		sqlite,
		schema,
		'introspect-checks',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('view #1', async () => {
	const sqlite = new Database(':memory:');

	const users = sqliteTable('users', { id: int('id') });
	const testView = sqliteView('some_view', { id: int('id') }).as(
		sql`SELECT * FROM ${users}`,
	);

	const schema = {
		users: users,
		testView,
	};

	const { statements, sqlStatements } = await introspectSQLiteToFile(
		sqlite,
		schema,
		'view-1',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});
