import { PGlite } from '@electric-sql/pglite';
import BetterSqlite3 from 'better-sqlite3';
import { afterEach, expect, test, vi } from 'vitest';
import { HintsHandler } from '../../src/cli/hints';
import { fromExports as pgFromExports, SchemaSource as PgSchemaSource } from '../../src/dialects/postgres/drizzle';
import {
	fromExports as sqliteFromExports,
	SchemaSource as SqliteSchemaSource,
} from '../../src/dialects/sqlite/drizzle';

const runWithCliContext = async <T>(
	context: { output: 'text' | 'json'; interactive: boolean },
	callback: () => Promise<T> | T,
): Promise<T> => {
	const ctx = await import('../../src/cli/context');
	return ctx.runWithCliContext(context, callback);
};

const sqliteDbFrom = (client: BetterSqlite3.Database) => {
	return {
		query: async <T>(query: string, params: unknown[] = []) => {
			return client.prepare(query).bind(...params).all() as T[];
		},
		run: async (query: string) => {
			client.prepare(query).run();
		},
		batch: async (sqlStatements: string[]) => {
			for (const stmt of sqlStatements) {
				client.prepare(stmt).run();
			}
		},
	};
};

afterEach(() => {
	vi.restoreAllMocks();
	vi.resetModules();
});

test('push postgres under text + non-TTY resolves a non-empty drop to missing_hints instead of reaching the prompt', async () => {
	const client = new PGlite();
	await client.query('CREATE TABLE orders (id integer);');
	await client.query('INSERT INTO orders (id) VALUES (1);');

	const pushPostgres = await import('../../src/cli/commands/push-postgres');
	const env = await runWithCliContext({ output: 'text', interactive: false }, () =>
		pushPostgres.handle(
			PgSchemaSource.fromSchema(pgFromExports({})),
			false,
			{ driver: 'pglite', client } as never,
			[] as never,
			false,
			false,
			{ table: '__drizzle_migrations', schema: 'public' },
			new HintsHandler(),
		));

	expect(env).toMatchObject({
		status: 'missing_hints',
		unresolved: [
			{ type: 'confirm_data_loss', kind: 'table', entity: ['public', 'orders'], reason: 'non_empty' },
		],
	});

	await client.close();
});

test('push sqlite under text + non-TTY resolves a non-empty drop to missing_hints instead of reaching the prompt', async () => {
	const sqlite = new BetterSqlite3(':memory:');
	sqlite.exec('CREATE TABLE orders (id INTEGER PRIMARY KEY);');
	sqlite.prepare('INSERT INTO orders (id) VALUES (1)').run();
	const db = sqliteDbFrom(sqlite);

	const pushSqlite = await import('../../src/cli/commands/push-sqlite');
	const env = await runWithCliContext({ output: 'text', interactive: false }, () =>
		pushSqlite.handle(
			db as never,
			SqliteSchemaSource.fromSchema(sqliteFromExports({})),
			false,
			{} as never,
			{} as never,
			false,
			false,
			{ table: '__drizzle_migrations', schema: '' },
			'sqlite',
			new HintsHandler(),
		));

	expect(env).toMatchObject({
		status: 'missing_hints',
		unresolved: [
			{ type: 'confirm_data_loss', kind: 'table', entity: ['public', 'orders'], reason: 'non_empty' },
		],
	});

	sqlite.close();
});
