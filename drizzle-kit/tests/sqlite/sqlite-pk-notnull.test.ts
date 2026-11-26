import { is } from 'drizzle-orm';
import { integer, SQLiteTable, SQLiteView, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { expect, test } from 'vitest';
import { fromJson } from 'src/dialects/sqlite/convertor';
import { ddlDiffDry } from 'src/dialects/sqlite/diff';
import { interimToDDL } from 'src/dialects/sqlite/ddl';
import { fromDrizzleSchema } from 'src/dialects/sqlite/drizzle';
import type { SQLiteDDL } from 'src/dialects/sqlite/ddl';

// https://github.com/drizzle-team/drizzle-orm/issues/6165
// SQLite allows NULLs in PRIMARY KEY columns unless the column is an
// INTEGER PRIMARY KEY (rowid alias), so `NOT NULL` on non-integer PKs
// is load-bearing and must survive snapshot serialization.

const toDDL = (schema: Record<string, unknown>): SQLiteDDL => {
	const tables = Object.values(schema).filter((it) => is(it, SQLiteTable)) as SQLiteTable[];
	const views = Object.values(schema).filter((it) => is(it, SQLiteView)) as SQLiteView[];
	return interimToDDL(fromDrizzleSchema(tables, views)).ddl;
};

const textPkSchema = {
	users: sqliteTable('users', {
		id: text('id').primaryKey(),
	}),
};

const intPkSchema = {
	items: sqliteTable('items', {
		id: integer('id').primaryKey(),
	}),
};

test('text primary key keeps NOT NULL in the serialized schema', () => {
	const ddl = toDDL(textPkSchema);
	const column = ddl.columns.list().find((it) => it.name === 'id');

	expect(column).toBeDefined();
	expect(column!.notNull).toBe(true);
});

test('generated SQL emits NOT NULL for text primary keys', async () => {
	const from = toDDL({});
	const to = toDDL(textPkSchema);

	const { statements } = await ddlDiffDry(from, to, 'default');
	const { sqlStatements } = fromJson(statements);
	const createTable = sqlStatements.find((it) => it.startsWith('CREATE TABLE'));

	expect(createTable).toBeDefined();
	expect(createTable).toContain('`id` text PRIMARY KEY NOT NULL');
});

test('generated SQL still omits NOT NULL for single-column integer primary keys', async () => {
	const from = toDDL({});
	const to = toDDL(intPkSchema);

	const { statements } = await ddlDiffDry(from, to, 'default');
	const { sqlStatements } = fromJson(statements);
	const createTable = sqlStatements.find((it) => it.startsWith('CREATE TABLE'));

	expect(createTable).toBeDefined();
	expect(createTable).toContain('`id` integer PRIMARY KEY');
	expect(createTable).not.toContain('`id` integer PRIMARY KEY NOT NULL');
});

test('diffing a nullable text primary key against non-null emits table recreation with NOT NULL', async () => {
	const to = toDDL(textPkSchema);
	const from = toDDL(textPkSchema);
	const fromCol = from.columns.one({ table: 'users', name: 'id' });
	expect(fromCol).toBeDefined();
	fromCol!.notNull = false;

	const { statements } = await ddlDiffDry(from, to, 'default');
	const { sqlStatements } = fromJson(statements);
	const recreateSql = sqlStatements.find((it) => it.includes('`__new_users`'));

	expect(recreateSql).toBeDefined();
	expect(recreateSql).toContain('`id` text PRIMARY KEY NOT NULL');
});

test('diffing a nullable integer primary key against non-null does not recreate the table', async () => {
	const to = toDDL(intPkSchema);
	const from = toDDL(intPkSchema);
	const fromCol = from.columns.one({ table: 'items', name: 'id' });
	expect(fromCol).toBeDefined();
	fromCol!.notNull = false;

	const { statements } = await ddlDiffDry(from, to, 'default');
	expect(statements).toHaveLength(0);
});