import { integer, pgTable, text } from 'drizzle-orm/pg-core';
import { integer as sqliteInteger, sqliteTable } from 'drizzle-orm/sqlite-core';
import { MissingHintsError } from 'src/cli/errors';
import { generateDrizzleJson as pgJson, generateMigration as pgMigration } from 'src/ext/api-postgres';
import { generateDrizzleJson as sqliteJson, generateMigration as sqliteMigration } from 'src/payload/sqlite';
import { expect, test, vi } from 'vitest';

const pgSnapshots = async () => {
	const prev = await pgJson({ a: pgTable('a', { id: integer('id').primaryKey() }) });
	const cur = await pgJson({ b: pgTable('b', { id: integer('id').primaryKey(), name: text('name') }) });
	return { prev, cur };
};

test('unresolved table create/delete ambiguity throws with the entities listed', async () => {
	const { prev, cur } = await pgSnapshots();

	const err = await pgMigration(prev, cur).catch((e) => e);

	expect(err).toBeInstanceOf(MissingHintsError);
	expect((err as MissingHintsError).missingHints).toEqual([
		{ type: 'rename_or_create', kind: 'table', entity: ['public', 'b'] },
	]);
});

test('create hint resolves ambiguity as create plus drop without logging', async () => {
	const { prev, cur } = await pgSnapshots();
	const log = vi.spyOn(console, 'log');

	const sql = await pgMigration(prev, cur, {
		hints: [{ type: 'create', kind: 'table', entity: ['public', 'b'] }],
	});

	const joined = sql.join('\n');
	expect(joined).toContain('CREATE TABLE "b"');
	expect(joined).toContain('DROP TABLE "a"');
	expect(log).not.toHaveBeenCalled();
	log.mockRestore();
});

test('rename hint emits a rename instead of drop and create', async () => {
	const { prev, cur } = await pgSnapshots();

	const sql = await pgMigration(prev, cur, {
		hints: [{ type: 'rename', kind: 'table', from: ['public', 'a'], to: ['public', 'b'] }],
	});

	const joined = sql.join('\n');
	expect(joined).toContain('RENAME TO "b"');
	expect(joined).not.toContain('DROP TABLE');
});

test('column create/delete ambiguity within a table reports column hints', async () => {
	const prev = await pgJson({
		users: pgTable('users', { id: integer('id').primaryKey(), firstName: text('first_name') }),
	});
	const cur = await pgJson({
		users: pgTable('users', { id: integer('id').primaryKey(), lastName: text('last_name') }),
	});

	const err = await pgMigration(prev, cur).catch((e) => e);

	expect(err).toBeInstanceOf(MissingHintsError);
	expect((err as MissingHintsError).missingHints).toEqual([
		{ type: 'rename_or_create', kind: 'column', entity: ['public', 'users', 'last_name'] },
	]);
});

test('unambiguous diff needs no hints', async () => {
	const prev = await pgJson({});
	const cur = await pgJson({ a: pgTable('a', { id: integer('id').primaryKey() }) });

	const sql = await pgMigration(prev, cur);

	expect(sql.join('\n')).toContain('CREATE TABLE "a"');
});

test('sqlite ambiguity follows the same hints contract', async () => {
	const prev = await sqliteJson({ a: sqliteTable('a', { id: sqliteInteger('id').primaryKey() }) });
	const cur = await sqliteJson({ b: sqliteTable('b', { id: sqliteInteger('id').primaryKey() }) });

	const err = await sqliteMigration(prev, cur).catch((e) => e);
	expect(err).toBeInstanceOf(MissingHintsError);

	const sql = await sqliteMigration(prev, cur, {
		hints: [{ type: 'create', kind: 'table', entity: ['public', 'b'] }],
	});
	const joined = sql.join('\n');
	expect(joined).toContain('CREATE TABLE `b`');
	expect(joined).toContain('DROP TABLE `a`');
});
