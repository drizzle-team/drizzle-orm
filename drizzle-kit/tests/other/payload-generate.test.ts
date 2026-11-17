import { borrowPGlite, returnPGlite } from '@drizzle/test-utils/pglite';
import { int as mssqlInt, mssqlTable } from 'drizzle-orm/mssql-core';
import { index as mysqlIndex, int as mysqlInt, mysqlTable, varchar } from 'drizzle-orm/mysql-core';
import { integer, pgSchema, pgTable, text } from 'drizzle-orm/pg-core';
import {
	index as sqliteIndex,
	integer as sqliteInteger,
	sqliteTable,
	text as sqliteText,
} from 'drizzle-orm/sqlite-core';
import type { Hint, MissingHintsError } from 'src/ext/api-postgres';
import { generateDrizzleJson as pgJson, generateMigration as pgMigration } from 'src/ext/api-postgres';
import { generateDrizzleJson as mssqlJson, generateMigration as mssqlMigration } from 'src/payload/mssql';
import { generateDrizzleJson as mysqlJson, generateMigration as mysqlMigration } from 'src/payload/mysql';
import {
	generateDrizzleJson as sqliteJson,
	generateMigration as sqliteMigration,
	up as sqliteUp,
} from 'src/payload/sqlite';
import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => {
	vi.restoreAllMocks();
});

const pgSnapshots = async () => {
	const prev = await pgJson({ a: pgTable('a', { id: integer('id').primaryKey() }) });
	const cur = await pgJson({ b: pgTable('b', { id: integer('id').primaryKey(), name: text('name') }) });
	return { prev, cur };
};

test('ambiguity in two entity kinds is listed in one error and resolves with create hints built from it', async () => {
	const prev = await pgJson({
		a: pgTable('a', { id: integer('id').primaryKey() }),
		users: pgTable('users', { id: integer('id').primaryKey(), firstName: text('first_name') }),
	});
	const cur = await pgJson({
		b: pgTable('b', { id: integer('id').primaryKey() }),
		users: pgTable('users', { id: integer('id').primaryKey(), lastName: text('last_name') }),
	});

	const err: MissingHintsError = await pgMigration(prev, cur).catch((e) => e);

	expect(err).toMatchObject({
		code: 'missing_hints',
		missingHints: [
			{ type: 'rename_or_create', kind: 'table', entity: ['public', 'b'] },
			{ type: 'rename_or_create', kind: 'column', entity: ['public', 'users', 'last_name'] },
		],
	});

	const hints: Hint[] = err.missingHints.flatMap((it) =>
		it.type === 'rename_or_create' ? [{ ...it, type: 'create' as const }] : []
	);
	const { sqlStatements, hints: resolved } = await pgMigration(prev, cur, { hints });

	expect(resolved).toStrictEqual(hints);
	expect(sqlStatements).toEqual([
		'CREATE TABLE "b" (\n\t"id" integer PRIMARY KEY\n);\n',
		'DROP TABLE "a";',
		'ALTER TABLE "users" ADD COLUMN "last_name" text;',
		'ALTER TABLE "users" DROP COLUMN "first_name";',
	]);
});

test('resolving with hints prints nothing', async () => {
	const { prev, cur } = await pgSnapshots();
	const log = vi.spyOn(console, 'log');

	await pgMigration(prev, cur, {
		hints: [{ type: 'create', kind: 'table', entity: ['public', 'b'] }],
	});

	expect(log).not.toHaveBeenCalled();
});

test('rename hint emits a rename instead of drop and create', async () => {
	const { prev, cur } = await pgSnapshots();

	const rename = { type: 'rename', kind: 'table', from: ['public', 'a'], to: ['public', 'b'] } as const;
	const { sqlStatements, hints } = await pgMigration(prev, cur, { hints: [rename] });

	expect(hints).toStrictEqual([rename]);
	expect(sqlStatements).toEqual([
		'ALTER TABLE "a" RENAME TO "b";',
		'ALTER TABLE "b" ADD COLUMN "name" text;',
	]);
});

test('unambiguous diff needs no hints', async () => {
	const prev = await pgJson({});
	const cur = await pgJson({ a: pgTable('a', { id: integer('id').primaryKey() }) });

	const { sqlStatements } = await pgMigration(prev, cur);

	expect(sqlStatements.join('\n')).toContain('CREATE TABLE "a"');
});

// The test process has no terminal on stdin, so `interactive` cannot prompt.
test('interactive generateMigration without a terminal asks for hints', async () => {
	const { prev, cur } = await pgSnapshots();

	await expect(pgMigration(prev, cur, { interactive: true })).rejects.toMatchObject({ code: 'missing_hints' });
});

// Payload CMS can connect to a schema that already exists, so its first migration must not fail on CREATE SCHEMA.
test('createSchemaIfNotExists gives a migration that runs on a database that already has the schema', async () => {
	const payload = pgSchema('payload');
	const cur = await pgJson({ payload, users: payload.table('users', { id: integer('id').primaryKey() }) });
	const client = await borrowPGlite();
	await client.exec('CREATE SCHEMA "payload";');

	const { sqlStatements } = await pgMigration(undefined, cur, { createSchemaIfNotExists: true });
	for (const statement of sqlStatements) await client.exec(statement);

	expect(sqlStatements[0]).toBe('CREATE SCHEMA IF NOT EXISTS "payload";\n');
	expect((await client.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'payload'`)).rows).toEqual([
		{ tablename: 'users' },
	]);
	await returnPGlite(client);
});

test('invalid hints are rejected with one error type', async () => {
	const { prev, cur } = await pgSnapshots();

	await expect(pgMigration(prev, cur, {
		hints: { type: 'create', kind: 'table', entity: ['public', 'b'] } as unknown as Hint[],
	})).rejects.toMatchObject({ name: 'InvalidHintsCliError', code: 'invalid_hints' });

	await expect(pgMigration(prev, cur, {
		hints: [{ type: 'create', kind: 'table', entity: ['b'] }] as unknown as Hint[],
	})).rejects.toMatchObject({ name: 'InvalidHintsCliError', code: 'invalid_hints' });

	await expect(pgMigration(prev, cur, {
		hints: [{ type: 'rename', kind: 'table', from: ['public', 'missing'], to: ['public', 'b'] }],
	})).rejects.toMatchObject({ name: 'InvalidHintsCliError', code: 'invalid_hints' });
});

test('sqlite hint ids use the public schema', async () => {
	const prev = await sqliteJson({ a: sqliteTable('a', { id: sqliteInteger('id').primaryKey() }) });
	const cur = await sqliteJson({ b: sqliteTable('b', { id: sqliteInteger('id').primaryKey() }) });

	await expect(sqliteMigration(prev, cur)).rejects.toMatchObject({
		code: 'missing_hints',
		missingHints: [{ type: 'rename_or_create', kind: 'table', entity: ['public', 'b'] }],
	});

	const { sqlStatements } = await sqliteMigration(prev, cur, {
		hints: [{ type: 'create', kind: 'table', entity: ['public', 'b'] }],
	});

	expect(sqlStatements).toEqual(['CREATE TABLE `b` (\n\t`id` integer PRIMARY KEY\n);\n', 'DROP TABLE `a`;']);
});

// drizzle-kit 0.x wrote SQLite snapshots of format 6, and Payload CMS stores one for each old migration.
test('sqlite up converts a format 6 snapshot that gives no SQL against the same schema', async () => {
	const v6 = {
		version: '6',
		dialect: 'sqlite',
		id: 's1',
		prevId: '00000000-0000-0000-0000-000000000000',
		tables: {
			users: {
				name: 'users',
				columns: { id: { name: 'id', type: 'integer', primaryKey: true, notNull: true, autoincrement: false } },
				indexes: {},
				foreignKeys: {},
				compositePrimaryKeys: {},
				uniqueConstraints: {},
				checkConstraints: {},
			},
		},
		views: {},
		enums: {},
		_meta: { tables: {}, columns: {} },
	};
	const cur = await sqliteJson({ users: sqliteTable('users', { id: sqliteInteger('id').primaryKey() }) });

	const { snapshots, hints } = await sqliteUp({ '20250101000000_init': v6 });

	expect(hints).toStrictEqual([]);
	expect(snapshots['20250101000000_init'].version).toBe('7');
	expect((await sqliteMigration(snapshots['20250101000000_init'], cur)).sqlStatements).toStrictEqual([]);
});

test('mysql hint ids use the public schema', async () => {
	const prev = await mysqlJson({ a: mysqlTable('a', { id: mysqlInt('id').primaryKey() }) });
	const cur = await mysqlJson({ b: mysqlTable('b', { id: mysqlInt('id').primaryKey() }) });

	await expect(mysqlMigration(prev, cur)).rejects.toMatchObject({
		code: 'missing_hints',
		missingHints: [{ type: 'rename_or_create', kind: 'table', entity: ['public', 'b'] }],
	});

	const sql = await mysqlMigration(prev, cur, {
		hints: [{ type: 'rename', kind: 'table', from: ['public', 'a'], to: ['public', 'b'] }],
	});

	expect(sql).toEqual(['RENAME TABLE `a` TO `b`;']);
});

test('mssql hint ids use the dbo schema', async () => {
	const prev = await mssqlJson({ a: mssqlTable('a', { id: mssqlInt('id').primaryKey() }) });
	const cur = await mssqlJson({ b: mssqlTable('b', { id: mssqlInt('id').primaryKey() }) });

	await expect(mssqlMigration(prev, cur)).rejects.toMatchObject({
		code: 'missing_hints',
		missingHints: [{ type: 'rename_or_create', kind: 'table', entity: ['dbo', 'b'] }],
	});

	const sql = await mssqlMigration(prev, cur, {
		hints: [{ type: 'rename', kind: 'table', from: ['dbo', 'a'], to: ['dbo', 'b'] }],
	});

	expect(sql).toEqual([`EXEC sp_rename 'a', [b];`]);
});

test('sqlite column rename hint leaves the snapshots of the caller unchanged', async () => {
	const prev = await sqliteJson({
		users: sqliteTable('users', {
			id: sqliteInteger('id').primaryKey(),
			firstName: sqliteText('first_name'),
		}, (t) => [sqliteIndex('users_name_idx').on(t.firstName)]),
	});
	const cur = await sqliteJson({
		users: sqliteTable('users', {
			id: sqliteInteger('id').primaryKey(),
			lastName: sqliteText('last_name'),
		}, (t) => [sqliteIndex('users_name_idx').on(t.lastName)]),
	});
	const prevBefore = structuredClone(prev);
	const curBefore = structuredClone(cur);

	await sqliteMigration(prev, cur, {
		hints: [{
			type: 'rename',
			kind: 'column',
			from: ['public', 'users', 'first_name'],
			to: ['public', 'users', 'last_name'],
		}],
	});

	expect(prev).toEqual(prevBefore);
	expect(cur).toEqual(curBefore);
});

test('mysql column rename hint leaves the snapshots of the caller unchanged', async () => {
	const prev = await mysqlJson({
		users: mysqlTable('users', {
			id: mysqlInt('id').primaryKey(),
			firstName: varchar('first_name', { length: 255 }),
		}, (t) => [mysqlIndex('users_name_idx').on(t.firstName)]),
	});
	const cur = await mysqlJson({
		users: mysqlTable('users', {
			id: mysqlInt('id').primaryKey(),
			lastName: varchar('last_name', { length: 255 }),
		}, (t) => [mysqlIndex('users_name_idx').on(t.lastName)]),
	});
	const prevBefore = structuredClone(prev);
	const curBefore = structuredClone(cur);

	await mysqlMigration(prev, cur, {
		hints: [{
			type: 'rename',
			kind: 'column',
			from: ['public', 'users', 'first_name'],
			to: ['public', 'users', 'last_name'],
		}],
	});

	expect(prev).toEqual(prevBefore);
	expect(cur).toEqual(curBefore);
});
