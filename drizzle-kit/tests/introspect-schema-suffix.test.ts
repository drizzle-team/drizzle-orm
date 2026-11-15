import { PGlite } from '@electric-sql/pglite';
import { schemaToTypeScript, setSchemaSuffix } from 'src/introspect-pg';
import { fromDatabase } from 'src/serializer/pgSerializer';
import { afterEach, expect, test } from 'vitest';

const pull = async () => {
	const client = new PGlite();
	await client.exec(`
		CREATE SCHEMA app;
		CREATE TYPE app.role AS ENUM ('admin', 'staff');
		CREATE DOMAIN app.limited_text AS text NOT NULL CHECK (length(trim(VALUE)) BETWEEN 1 AND 100);
		CREATE TABLE app.users (id integer PRIMARY KEY, name app.limited_text, role app.role);
	`);
	const schema = await fromDatabase(
		{ query: async (q: string, params?: any[]) => (await client.query(q, params)).rows as any[] },
		() => true,
		['app'],
	);
	return schemaToTypeScript(schema as any, 'camel').file;
};

afterEach(() => setSchemaSuffix(true));

test('schema-scoped entities are suffixed by default', async () => {
	const file = await pull();
	expect(file).toContain('export const roleInApp = app.enum("role"');
	expect(file).toContain('export const limitedTextInApp = app.domain("limited_text"');
	expect(file).toContain('name: limitedTextInApp()');
});

test('introspect.schemaSuffix: false keeps the plain names', async () => {
	setSchemaSuffix(false);
	const file = await pull();
	expect(file).toContain('export const role = app.enum("role"');
	expect(file).toContain('export const limitedText = app.domain("limited_text", text().notNull()');
	expect(file).toContain(
		'.checkConstraint("limited_text_check", sql`((length(TRIM(BOTH FROM VALUE)) >= 1) AND (length(TRIM(BOTH FROM VALUE)) <= 100))`)',
	);
	expect(file).toContain('name: limitedText()');
	expect(file).toContain('role: role()');
	expect(file).not.toContain('InApp');
});
