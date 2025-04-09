import { createClient } from '@libsql/client';
import { sql } from 'drizzle-orm';
import { int, sqliteTable, sqliteView } from 'drizzle-orm/sqlite-core';
import fs from 'fs';
import { introspectLibSQLToFile, introspectMySQLToFile, introspectSQLiteToFile } from 'tests/schemaDiffer';
import { expect, test } from 'vitest';

if (!fs.existsSync('tests/introspect/libsql')) {
	fs.mkdirSync('tests/introspect/libsql');
}

test('view #1', async () => {
	const turso = createClient({
		url: ':memory:',
	});

	const users = sqliteTable('users', { id: int('id') });
	const testView = sqliteView('some_view', { id: int('id') }).as(
		sql`SELECT * FROM ${users}`,
	);

	const schema = {
		users: users,
		testView,
	};

	const { statements, sqlStatements } = await introspectLibSQLToFile(
		turso,
		schema,
		'view-1',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});
