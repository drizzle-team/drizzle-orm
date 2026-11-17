import { borrowPGlite, returnPGlite } from '@drizzle/test-utils/pglite';
import { createClient } from '@libsql/client';
import type { Database } from 'better-sqlite3';
import BetterSqlite3 from 'better-sqlite3';
import { drizzle as sqliteDrizzle } from 'drizzle-orm/better-sqlite3';
import { drizzle as libsqlDrizzle } from 'drizzle-orm/libsql';
import { integer, pgTable } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/pglite';
import { integer as sqliteInteger, sqliteTable, text as sqliteText } from 'drizzle-orm/sqlite-core';
import { pushSchema as pgPush } from 'src/ext/api-postgres';
import { pushSchema as sqlitePush } from 'src/payload/sqlite';
import { expect, test } from 'vitest';

// This file must not import `tests/sqlite/mocks`. That module loads `zx/globals`, and `pushSchema` must work in a
// process that does not have those globals.
const sqliteDb = (client: Database) => sqliteDrizzle({ client });

test('sqlite push of a renamed table asks for a hint and keeps the rows with a rename hint', async () => {
	const client = new BetterSqlite3(':memory:');
	client.exec('CREATE TABLE `a` (`id` integer PRIMARY KEY); INSERT INTO `a` VALUES (1);');
	const schema = { b: sqliteTable('b', { id: sqliteInteger('id').primaryKey() }) };

	await expect(sqlitePush(schema, sqliteDb(client))).rejects.toMatchObject({
		code: 'missing_hints',
		missingHints: [{ type: 'rename_or_create', kind: 'table', entity: ['public', 'b'] }],
	});

	const { apply } = await sqlitePush(schema, sqliteDb(client), undefined, undefined, {
		hints: [{ type: 'rename', kind: 'table', from: ['public', 'a'], to: ['public', 'b'] }],
	});
	await apply();

	expect(client.prepare('SELECT `id` FROM `b`').all()).toEqual([{ id: 1 }]);
});

test('sqlite push that drops a non-empty table asks for a data loss confirmation', async () => {
	const client = new BetterSqlite3(':memory:');
	client.exec('CREATE TABLE `a` (`id` integer PRIMARY KEY); INSERT INTO `a` VALUES (1);');

	await expect(sqlitePush({}, sqliteDb(client))).rejects.toMatchObject({
		code: 'missing_hints',
		missingHints: [{ type: 'confirm_data_loss', kind: 'table', entity: ['public', 'a'], reason: 'non_empty' }],
	});

	const { apply } = await sqlitePush({}, sqliteDb(client), undefined, undefined, {
		hints: [{ type: 'confirm_data_loss', kind: 'table', entity: ['public', 'a'] }],
	});
	await apply();

	expect(client.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all()).toEqual([]);
});

test('sqlite push of a confirmed not-null column deletes the rows before it adds the column', async () => {
	const client = new BetterSqlite3(':memory:');
	client.exec('CREATE TABLE `a` (`id` integer PRIMARY KEY); INSERT INTO `a` VALUES (1);');
	const schema = {
		a: sqliteTable('a', { id: sqliteInteger('id').primaryKey(), name: sqliteText('name').notNull() }),
	};

	await expect(sqlitePush(schema, sqliteDb(client))).rejects.toMatchObject({
		code: 'missing_hints',
		missingHints: [{ type: 'confirm_data_loss', kind: 'add_not_null', entity: ['public', 'a', 'name'] }],
	});

	const { apply, warnings } = await sqlitePush(schema, sqliteDb(client), undefined, undefined, {
		hints: [{ type: 'confirm_data_loss', kind: 'add_not_null', entity: ['public', 'a', 'name'] }],
	});
	await apply();

	expect(warnings).toEqual([{
		hint: `You're about to add not-null "name" column without default value to non-empty "a" table`,
		statement: 'DELETE FROM "a" where true;',
	}]);
	expect(client.prepare('SELECT `id`, `name` FROM `a`').all()).toEqual([]);
});

test('sqlite push with a table rename hint asks to confirm a dropped column of that table', async () => {
	const client = new BetterSqlite3(':memory:');
	client.exec("CREATE TABLE `a` (`id` integer PRIMARY KEY, `name` text); INSERT INTO `a` VALUES (1, 'drizzle');");
	const schema = { b: sqliteTable('b', { id: sqliteInteger('id').primaryKey() }) };
	const rename = { type: 'rename', kind: 'table', from: ['public', 'a'], to: ['public', 'b'] } as const;

	await expect(sqlitePush(schema, sqliteDb(client), undefined, undefined, { hints: [rename] })).rejects.toMatchObject({
		code: 'missing_hints',
		missingHints: [{ type: 'confirm_data_loss', kind: 'column', entity: ['public', 'b', 'name'] }],
	});

	const confirm = { type: 'confirm_data_loss', kind: 'column', entity: ['public', 'b', 'name'] } as const;
	const { apply, hints } = await sqlitePush(schema, sqliteDb(client), undefined, undefined, {
		hints: [rename, confirm],
	});
	await apply();

	expect(hints).toStrictEqual([rename, confirm]);
	expect(client.prepare('SELECT * FROM `b`').all()).toEqual([{ id: 1 }]);
});

// libsql runs the statements of `apply` as one batch. A table recreate needs that batch, because it copies the rows
// into a new table and drops the old one.
test('sqlite push through a libsql instance recreates a table and keeps its rows', async () => {
	const client = createClient({ url: ':memory:' });
	await client.executeMultiple(
		'CREATE TABLE `a` (`id` integer PRIMARY KEY, `name` text); INSERT INTO `a` VALUES (1, NULL);',
	);
	const db = libsqlDrizzle({ client });
	const schema = {
		a: sqliteTable('a', { id: sqliteInteger('id').primaryKey(), name: sqliteText('name').default('x') }),
	};

	const { sqlStatements, apply } = await sqlitePush(schema, db);
	await apply();

	expect(sqlStatements.some((it) => it.includes('__new_a'))).toBe(true);
	expect((await client.execute('SELECT `id` FROM `a`')).rows.map((it) => it.id)).toEqual([1]);
	client.close();
});

// Payload CMS passes its `tablesFilter` setting here, so that push leaves the tables that it does not manage alone.
test('sqlite push with a tables filter keeps a table that the schema does not list', async () => {
	const client = new BetterSqlite3(':memory:');
	client.exec('CREATE TABLE `a` (`id` integer PRIMARY KEY); CREATE TABLE `other` (`id` integer PRIMARY KEY);');
	client.exec('INSERT INTO `other` VALUES (1);');
	const schema = { a: sqliteTable('a', { id: sqliteInteger('id').primaryKey() }) };
	const filter = { tables: ['a'], schemas: [], extensions: [], entities: undefined };

	const { sqlStatements, apply } = await sqlitePush(schema, sqliteDb(client), filter);
	await apply();

	expect(sqlStatements).toStrictEqual([]);
	expect(client.prepare('SELECT `id` FROM `other`').all()).toEqual([{ id: 1 }]);
});

test('postgres push of a renamed table asks for a hint and keeps the rows with a rename hint', async () => {
	const client = await borrowPGlite();
	await client.exec('CREATE TABLE "a" ("id" integer PRIMARY KEY); INSERT INTO "a" VALUES (1);');
	const db = drizzle({ client });
	const schema = { b: pgTable('b', { id: integer('id').primaryKey() }) };

	await expect(pgPush(schema, db)).rejects.toMatchObject({
		code: 'missing_hints',
		missingHints: [{ type: 'rename_or_create', kind: 'table', entity: ['public', 'b'] }],
	});

	const rename = { type: 'rename', kind: 'table', from: ['public', 'a'], to: ['public', 'b'] } as const;
	const { apply, hints } = await pgPush(schema, db, undefined, undefined, { hints: [rename] });
	await apply();

	expect(hints).toStrictEqual([rename]);
	expect((await client.query('SELECT "id" FROM "b"')).rows).toEqual([{ id: 1 }]);
	await returnPGlite(client);
});

test('postgres push that drops a non-empty table asks for a data loss confirmation', async () => {
	const client = await borrowPGlite();
	await client.exec('CREATE TABLE "a" ("id" integer PRIMARY KEY); INSERT INTO "a" VALUES (1);');
	const db = drizzle({ client });

	await expect(pgPush({}, db)).rejects.toMatchObject({
		code: 'missing_hints',
		missingHints: [{ type: 'confirm_data_loss', kind: 'table', entity: ['public', 'a'], reason: 'non_empty' }],
	});

	const { apply } = await pgPush({}, db, undefined, undefined, {
		hints: [{ type: 'confirm_data_loss', kind: 'table', entity: ['public', 'a'] }],
	});
	await apply();

	expect((await client.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`)).rows).toEqual([]);
	await returnPGlite(client);
});
