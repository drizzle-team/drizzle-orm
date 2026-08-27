import Database from 'better-sqlite3';
import { SQL, sql } from 'drizzle-orm';
import { check, int, sqliteTable, sqliteView, text } from 'drizzle-orm/sqlite-core';
import * as fs from 'fs';
import { schemaToTypeScript } from 'src/introspect-sqlite';
import { fromDatabase } from 'src/serializer/sqliteSerializer';
import type { SQLiteDB } from 'src/utils';
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

test('introspect boolean column with a literal true/false default', async () => {
	// A hand-written DDL, not a drizzle push - BOOLEAN has no SQLite storage
	// class, so a literal `DEFAULT true/TRUE/false/FALSE` is stored as that
	// keyword text and comes back from PRAGMA table_info as either the bare
	// text ("true", for the lowercase form) or wrapped in parens ("(FALSE)",
	// observed for the all-caps form).
	const sqlite = new Database(':memory:');
	sqlite.exec(`
		CREATE TABLE session_prompt (
			id INTEGER PRIMARY KEY,
			pending BOOLEAN NOT NULL DEFAULT true,
			error BOOLEAN NOT NULL DEFAULT FALSE,
			archived BOOLEAN NOT NULL DEFAULT TRUE,
			seen BOOLEAN NOT NULL DEFAULT false
		);
	`);

	const db: SQLiteDB = {
		query: async <T>(sql: string, params: any[] = []) => {
			return sqlite.prepare(sql).bind(params).all() as T[];
		},
		run: async (query: string) => {
			sqlite.prepare(query).run();
		},
	};

	const introspectedSchema = await fromDatabase(db, () => true);
	const { file } = schemaToTypeScript(
		{ id: '0', prevId: '0', ...introspectedSchema } as any,
		'camel',
	);

	// Scaffolded as integer(..., { mode: 'boolean' }), not numeric() - SQLite
	// has no boolean storage class, and numeric()'s .default() only accepts
	// string | SQL<unknown>, not a raw boolean.
	expect(file).toContain(`mode: 'boolean'`);
	expect(file).not.toContain('numeric(');

	// Every default must come through as a lowercase JS boolean literal,
	// regardless of the case SQLite stored it in or whether PRAGMA returned
	// it bare or parenthesized - never left as a bare "TRUE"/"FALSE" (not a
	// valid, declared JS identifier) and never left attached to a
	// numeric()-typed default.
	expect(file).toMatch(/pending: integer\([^)]*\{ mode: 'boolean' \}\)\.default\(true\)/);
	expect(file).toMatch(/error: integer\([^)]*\{ mode: 'boolean' \}\)\.default\(false\)/);
	expect(file).toMatch(/archived: integer\([^)]*\{ mode: 'boolean' \}\)\.default\(true\)/);
	expect(file).toMatch(/seen: integer\([^)]*\{ mode: 'boolean' \}\)\.default\(false\)/);
	expect(file).not.toMatch(/\.default\((TRUE|FALSE)\)/);
});
