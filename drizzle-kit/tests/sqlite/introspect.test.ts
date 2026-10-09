import Database from 'better-sqlite3';
import { fromDatabaseForDrizzle } from 'src/dialects/sqlite/introspect';
import { expect, test } from 'vitest';

// This file must not import `./mocks`. That module loads `zx/globals`, which defines globals such as `chalk`,
// and the introspection must work in a process that does not have them.

test('introspect reports a readable error for an implicit fk to a table without a primary key', async () => {
	expect('chalk' in globalThis).toBe(false);

	const sqlite = new Database(':memory:');
	sqlite.exec('CREATE TABLE `users`(`name` text);');
	sqlite.exec('CREATE TABLE `posts`(`user_name` text references `users`);');

	const db = {
		query: async <T>(sql: string, params: any[] = []) => sqlite.prepare(sql).bind(params).all() as T[],
	};

	await expect(
		fromDatabaseForDrizzle(db, () => true, () => {}, { table: '__drizzle_migrations', schema: 'drizzle' }),
	).rejects.toThrow(
		'Table users has no primary key, so the foreign key from posts.user_name to users cannot be resolved',
	);
});
