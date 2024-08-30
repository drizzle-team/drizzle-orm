import { sql } from 'drizzle-orm';
import { AnySQLiteColumn, index, int, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { expect, test } from 'vitest';
import { diffTestSchemasSqlite } from './schemaDiffer';

test('add table #1', async () => {
	const to = {
		users: sqliteTable('users', {}),
	};

	const { statements } = await diffTestSchemasSqlite({}, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'sqlite_create_table',
		tableName: 'users',
		columns: [],
		compositePKs: [],
		uniqueConstraints: [],
		referenceData: [],
	});
});

test('add table #2', async () => {
	const to = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
		}),
	};

	const { statements } = await diffTestSchemasSqlite({}, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'sqlite_create_table',
		tableName: 'users',
		columns: [
			{
				name: 'id',
				notNull: true,
				primaryKey: true,
				type: 'integer',
				autoincrement: true,
			},
		],
		compositePKs: [],
		referenceData: [],
		uniqueConstraints: [],
	});
});

test('add table #3', async () => {
	const to = {
		users: sqliteTable(
			'users',
			{
				id: int('id'),
			},
			(t) => {
				return {
					pk: primaryKey({
						name: 'users_pk',
						columns: [t.id],
					}),
				};
			},
		),
	};

	const { statements } = await diffTestSchemasSqlite({}, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'sqlite_create_table',
		tableName: 'users',
		columns: [
			{
				name: 'id',
				notNull: false,
				primaryKey: true,
				type: 'integer',
				autoincrement: false,
			},
		],
		compositePKs: [],
		uniqueConstraints: [],
		referenceData: [],
	});
});

test('add table #4', async () => {
	const to = {
		users: sqliteTable('users', {}),
		posts: sqliteTable('posts', {}),
	};

	const { statements } = await diffTestSchemasSqlite({}, to, []);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'sqlite_create_table',
		tableName: 'users',
		columns: [],
		compositePKs: [],
		uniqueConstraints: [],
		referenceData: [],
	});
	expect(statements[1]).toStrictEqual({
		type: 'sqlite_create_table',
		tableName: 'posts',
		columns: [],
		compositePKs: [],
		uniqueConstraints: [],
		referenceData: [],
	});
});

test('add table #5', async () => {
	// no schemas in sqlite
});

test('add table #6', async () => {
	const from = {
		users1: sqliteTable('users1', {}),
	};

	const to = {
		users2: sqliteTable('users2', {}),
	};

	const { statements } = await diffTestSchemasSqlite(from, to, []);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'sqlite_create_table',
		tableName: 'users2',
		columns: [],
		compositePKs: [],
		uniqueConstraints: [],
		referenceData: [],
	});
	expect(statements[1]).toStrictEqual({
		type: 'drop_table',
		tableName: 'users1',
		schema: undefined,
		policies: [],
	});
});

test('add table #7', async () => {
	const from = {
		users1: sqliteTable('users1', {}),
	};

	const to = {
		users: sqliteTable('users', {}),
		users2: sqliteTable('users2', {}),
	};

	const { statements } = await diffTestSchemasSqlite(from, to, [
		'public.users1->public.users2',
	]);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'sqlite_create_table',
		tableName: 'users',
		columns: [],
		compositePKs: [],
		uniqueConstraints: [],
		referenceData: [],
	});
	expect(statements[1]).toStrictEqual({
		type: 'rename_table',
		tableNameFrom: 'users1',
		tableNameTo: 'users2',
		fromSchema: undefined,
		toSchema: undefined,
	});
});

test('add table #8', async () => {
	const users = sqliteTable('users', {
		id: int('id').primaryKey({ autoIncrement: true }),
		reporteeId: int('reportee_id').references((): AnySQLiteColumn => users.id),
	});

	const to = {
		users,
	};

	const { statements } = await diffTestSchemasSqlite({}, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'sqlite_create_table',
		tableName: 'users',
		columns: [
			{
				autoincrement: true,
				name: 'id',
				notNull: true,
				primaryKey: true,
				type: 'integer',
			},
			{
				autoincrement: false,
				name: 'reportee_id',
				notNull: false,
				primaryKey: false,
				type: 'integer',
			},
		],
		compositePKs: [],
		uniqueConstraints: [],
		referenceData: [
			{
				columnsFrom: ['reportee_id'],
				columnsTo: ['id'],
				name: 'users_reportee_id_users_id_fk',
				onDelete: 'no action',
				onUpdate: 'no action',
				tableFrom: 'users',
				tableTo: 'users',
			},
		],
	});
});

test('add table #9', async () => {
	const to = {
		users: sqliteTable(
			'users',
			{
				id: int('id').primaryKey({ autoIncrement: true }),
				reporteeId: int('reportee_id'),
			},
			(t) => {
				return {
					reporteeIdx: index('reportee_idx').on(t.reporteeId),
				};
			},
		),
	};

	const { statements } = await diffTestSchemasSqlite({}, to, []);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'sqlite_create_table',
		tableName: 'users',
		columns: [
			{
				autoincrement: true,
				name: 'id',
				notNull: true,
				primaryKey: true,
				type: 'integer',
			},
			{
				autoincrement: false,
				name: 'reportee_id',
				notNull: false,
				primaryKey: false,
				type: 'integer',
			},
		],
		compositePKs: [],
		uniqueConstraints: [],
		referenceData: [],
	});

	expect(statements[1]).toStrictEqual({
		type: 'create_index',
		tableName: 'users',
		internal: {
			indexes: {},
		},
		schema: undefined,
		data: 'reportee_idx;reportee_id;false;',
	});
});

test('add table #10', async () => {
	const to = {
		users: sqliteTable('table', {
			json: text('json', { mode: 'json' }).default({}),
		}),
	};

	const { sqlStatements } = await diffTestSchemasSqlite({}, to, []);
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		"CREATE TABLE `table` (\n\t`json` text DEFAULT '{}'\n);\n",
	);
});

test('add table #11', async () => {
	const to = {
		users: sqliteTable('table', {
			json: text('json', { mode: 'json' }).default([]),
		}),
	};

	const { sqlStatements } = await diffTestSchemasSqlite({}, to, []);
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		"CREATE TABLE `table` (\n\t`json` text DEFAULT '[]'\n);\n",
	);
});

test('add table #12', async () => {
	const to = {
		users: sqliteTable('table', {
			json: text('json', { mode: 'json' }).default([1, 2, 3]),
		}),
	};

	const { sqlStatements } = await diffTestSchemasSqlite({}, to, []);
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		"CREATE TABLE `table` (\n\t`json` text DEFAULT '[1,2,3]'\n);\n",
	);
});

test('add table #13', async () => {
	const to = {
		users: sqliteTable('table', {
			json: text('json', { mode: 'json' }).default({ key: 'value' }),
		}),
	};

	const { sqlStatements } = await diffTestSchemasSqlite({}, to, []);
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		'CREATE TABLE `table` (\n\t`json` text DEFAULT \'{"key":"value"}\'\n);\n',
	);
});

test('add table #14', async () => {
	const to = {
		users: sqliteTable('table', {
			json: text('json', { mode: 'json' }).default({
				key: 'value',
				arr: [1, 2, 3],
			}),
		}),
	};

	const { sqlStatements } = await diffTestSchemasSqlite({}, to, []);
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		'CREATE TABLE `table` (\n\t`json` text DEFAULT \'{"key":"value","arr":[1,2,3]}\'\n);\n',
	);
});

test('add table with indexes', async () => {
	const from = {};

	const to = {
		users: sqliteTable(
			'users',
			{
				id: int('id').primaryKey(),
				name: text('name'),
				email: text('email'),
			},
			(t) => ({
				uniqueExpr: uniqueIndex('uniqueExpr').on(sql`(lower(${t.email}))`),
				indexExpr: index('indexExpr').on(sql`(lower(${t.email}))`),
				indexExprMultiple: index('indexExprMultiple').on(
					sql`(lower(${t.email}))`,
					sql`(lower(${t.email}))`,
				),

				uniqueCol: uniqueIndex('uniqueCol').on(t.email),
				indexCol: index('indexCol').on(t.email),
				indexColMultiple: index('indexColMultiple').on(t.email, t.email),

				indexColExpr: index('indexColExpr').on(
					sql`(lower(${t.email}))`,
					t.email,
				),
			}),
		),
	};

	const { sqlStatements } = await diffTestSchemasSqlite(from, to, []);
	expect(sqlStatements.length).toBe(8);
	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE `users` (\n\t`id` integer PRIMARY KEY NOT NULL,\n\t`name` text,\n\t`email` text\n);\n',
		'CREATE UNIQUE INDEX `uniqueExpr` ON `users` ((lower("email")));',
		'CREATE INDEX `indexExpr` ON `users` ((lower("email")));',
		'CREATE INDEX `indexExprMultiple` ON `users` ((lower("email")),(lower("email")));',
		'CREATE UNIQUE INDEX `uniqueCol` ON `users` (`email`);',
		'CREATE INDEX `indexCol` ON `users` (`email`);',
		'CREATE INDEX `indexColMultiple` ON `users` (`email`,`email`);',
		'CREATE INDEX `indexColExpr` ON `users` ((lower("email")),`email`);',
	]);
});
