import { sql } from 'drizzle-orm';
import {
	index,
	json,
	primaryKey,
	serial,
	singlestoreSchema,
	singlestoreTable,
	text,
	uniqueIndex,
} from 'drizzle-orm/singlestore-core';
import { expect, test } from 'vitest';
import { diffTestSchemasSingleStore } from './schemaDiffer';

test('add table #1', async () => {
	const to = {
		users: singlestoreTable('users', {}),
	};

	const { statements } = await diffTestSchemasSingleStore({}, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'create_table',
		tableName: 'users',
		schema: undefined,
		columns: [],
		compositePKs: [],
		internals: {
			tables: {},
			indexes: {},
		},
		uniqueConstraints: [],
		compositePkName: '',
	});
});

test('add table #2', async () => {
	const to = {
		users: singlestoreTable('users', {
			id: serial('id').primaryKey(),
		}),
	};

	const { statements } = await diffTestSchemasSingleStore({}, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'create_table',
		tableName: 'users',
		schema: undefined,
		columns: [
			{
				name: 'id',
				notNull: true,
				primaryKey: false,
				type: 'serial',
				autoincrement: true,
			},
		],
		compositePKs: ['users_id;id'],
		compositePkName: 'users_id',
		uniqueConstraints: [],
		internals: {
			tables: {},
			indexes: {},
		},
	});
});

test('add table #3', async () => {
	const to = {
		users: singlestoreTable(
			'users',
			{
				id: serial('id'),
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

	const { statements } = await diffTestSchemasSingleStore({}, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'create_table',
		tableName: 'users',
		schema: undefined,
		columns: [
			{
				name: 'id',
				notNull: true,
				primaryKey: false,
				type: 'serial',
				autoincrement: true,
			},
		],
		compositePKs: ['users_pk;id'],
		uniqueConstraints: [],
		compositePkName: 'users_pk',
		internals: {
			tables: {},
			indexes: {},
		},
	});
});

test('add table #4', async () => {
	const to = {
		users: singlestoreTable('users', {}),
		posts: singlestoreTable('posts', {}),
	};

	const { statements } = await diffTestSchemasSingleStore({}, to, []);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'create_table',
		tableName: 'users',
		schema: undefined,
		columns: [],
		internals: {
			tables: {},
			indexes: {},
		},
		compositePKs: [],
		uniqueConstraints: [],
		compositePkName: '',
	});
	expect(statements[1]).toStrictEqual({
		type: 'create_table',
		tableName: 'posts',
		schema: undefined,
		columns: [],
		compositePKs: [],
		internals: {
			tables: {},
			indexes: {},
		},
		uniqueConstraints: [],
		compositePkName: '',
	});
});

test('add table #5', async () => {
	const schema = singlestoreSchema('folder');
	const from = {
		schema,
	};

	const to = {
		schema,
		users: schema.table('users', {}),
	};

	const { statements } = await diffTestSchemasSingleStore(from, to, []);

	expect(statements.length).toBe(0);
});

test('add table #6', async () => {
	const from = {
		users1: singlestoreTable('users1', {}),
	};

	const to = {
		users2: singlestoreTable('users2', {}),
	};

	const { statements } = await diffTestSchemasSingleStore(from, to, []);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'create_table',
		tableName: 'users2',
		schema: undefined,
		columns: [],
		internals: {
			tables: {},
			indexes: {},
		},
		compositePKs: [],
		uniqueConstraints: [],
		compositePkName: '',
	});
	expect(statements[1]).toStrictEqual({
		policies: [],
		type: 'drop_table',
		tableName: 'users1',
		schema: undefined,
	});
});

test('add table #7', async () => {
	const from = {
		users1: singlestoreTable('users1', {}),
	};

	const to = {
		users: singlestoreTable('users', {}),
		users2: singlestoreTable('users2', {}),
	};

	const { statements } = await diffTestSchemasSingleStore(from, to, [
		'public.users1->public.users2',
	]);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'create_table',
		tableName: 'users',
		schema: undefined,
		columns: [],
		compositePKs: [],
		uniqueConstraints: [],
		internals: {
			tables: {},
			indexes: {},
		},
		compositePkName: '',
	});
	expect(statements[1]).toStrictEqual({
		type: 'rename_table',
		tableNameFrom: 'users1',
		tableNameTo: 'users2',
		fromSchema: undefined,
		toSchema: undefined,
	});
});

test('add schema + table #1', async () => {
	const schema = singlestoreSchema('folder');

	const to = {
		schema,
		users: schema.table('users', {}),
	};

	const { statements } = await diffTestSchemasSingleStore({}, to, []);

	expect(statements.length).toBe(0);
});

test('change schema with tables #1', async () => {
	const schema = singlestoreSchema('folder');
	const schema2 = singlestoreSchema('folder2');
	const from = {
		schema,
		users: schema.table('users', {}),
	};
	const to = {
		schema2,
		users: schema2.table('users', {}),
	};

	const { statements } = await diffTestSchemasSingleStore(from, to, [
		'folder->folder2',
	]);

	expect(statements.length).toBe(0);
});

test('change table schema #1', async () => {
	const schema = singlestoreSchema('folder');
	const from = {
		schema,
		users: singlestoreTable('users', {}),
	};
	const to = {
		schema,
		users: schema.table('users', {}),
	};

	const { statements } = await diffTestSchemasSingleStore(from, to, [
		'public.users->folder.users',
	]);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		policies: [],
		type: 'drop_table',
		tableName: 'users',
		schema: undefined,
	});
});

test('change table schema #2', async () => {
	const schema = singlestoreSchema('folder');
	const from = {
		schema,
		users: schema.table('users', {}),
	};
	const to = {
		schema,
		users: singlestoreTable('users', {}),
	};

	const { statements } = await diffTestSchemasSingleStore(from, to, [
		'folder.users->public.users',
	]);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'create_table',
		tableName: 'users',
		schema: undefined,
		columns: [],
		uniqueConstraints: [],
		compositePkName: '',
		compositePKs: [],
		internals: {
			tables: {},
			indexes: {},
		},
	});
});

test('change table schema #3', async () => {
	const schema1 = singlestoreSchema('folder1');
	const schema2 = singlestoreSchema('folder2');
	const from = {
		schema1,
		schema2,
		users: schema1.table('users', {}),
	};
	const to = {
		schema1,
		schema2,
		users: schema2.table('users', {}),
	};

	const { statements } = await diffTestSchemasSingleStore(from, to, [
		'folder1.users->folder2.users',
	]);

	expect(statements.length).toBe(0);
});

test('change table schema #4', async () => {
	const schema1 = singlestoreSchema('folder1');
	const schema2 = singlestoreSchema('folder2');
	const from = {
		schema1,
		users: schema1.table('users', {}),
	};
	const to = {
		schema1,
		schema2, // add schema
		users: schema2.table('users', {}), // move table
	};

	const { statements } = await diffTestSchemasSingleStore(from, to, [
		'folder1.users->folder2.users',
	]);

	expect(statements.length).toBe(0);
});

test('change table schema #5', async () => {
	const schema1 = singlestoreSchema('folder1');
	const schema2 = singlestoreSchema('folder2');
	const from = {
		schema1, // remove schema
		users: schema1.table('users', {}),
	};
	const to = {
		schema2, // add schema
		users: schema2.table('users', {}), // move table
	};

	const { statements } = await diffTestSchemasSingleStore(from, to, [
		'folder1.users->folder2.users',
	]);

	expect(statements.length).toBe(0);
});

test('change table schema #5', async () => {
	const schema1 = singlestoreSchema('folder1');
	const schema2 = singlestoreSchema('folder2');
	const from = {
		schema1,
		schema2,
		users: schema1.table('users', {}),
	};
	const to = {
		schema1,
		schema2,
		users: schema2.table('users2', {}), // rename and move table
	};

	const { statements } = await diffTestSchemasSingleStore(from, to, [
		'folder1.users->folder2.users2',
	]);

	expect(statements.length).toBe(0);
});

test('change table schema #6', async () => {
	const schema1 = singlestoreSchema('folder1');
	const schema2 = singlestoreSchema('folder2');
	const from = {
		schema1,
		users: schema1.table('users', {}),
	};
	const to = {
		schema2, // rename schema
		users: schema2.table('users2', {}), // rename table
	};

	const { statements } = await diffTestSchemasSingleStore(from, to, [
		'folder1->folder2',
		'folder2.users->folder2.users2',
	]);

	expect(statements.length).toBe(0);
});

test('add table #10', async () => {
	const to = {
		users: singlestoreTable('table', {
			json: json('json').default({}),
		}),
	};

	const { sqlStatements } = await diffTestSchemasSingleStore({}, to, []);
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		"CREATE TABLE `table` (\n\t`json` json DEFAULT '{}'\n);\n",
	);
});

test('add table #11', async () => {
	const to = {
		users: singlestoreTable('table', {
			json: json('json').default([]),
		}),
	};

	const { sqlStatements } = await diffTestSchemasSingleStore({}, to, []);
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		"CREATE TABLE `table` (\n\t`json` json DEFAULT '[]'\n);\n",
	);
});

test('add table #12', async () => {
	const to = {
		users: singlestoreTable('table', {
			json: json('json').default([1, 2, 3]),
		}),
	};

	const { sqlStatements } = await diffTestSchemasSingleStore({}, to, []);
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		"CREATE TABLE `table` (\n\t`json` json DEFAULT '[1,2,3]'\n);\n",
	);
});

test('add table #13', async () => {
	const to = {
		users: singlestoreTable('table', {
			json: json('json').default({ key: 'value' }),
		}),
	};

	const { sqlStatements } = await diffTestSchemasSingleStore({}, to, []);
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		'CREATE TABLE `table` (\n\t`json` json DEFAULT \'{"key":"value"}\'\n);\n',
	);
});

test('add table #14', async () => {
	const to = {
		users: singlestoreTable('table', {
			json: json('json').default({
				key: 'value',
				arr: [1, 2, 3],
			}),
		}),
	};

	const { sqlStatements } = await diffTestSchemasSingleStore({}, to, []);
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		'CREATE TABLE `table` (\n\t`json` json DEFAULT \'{"key":"value","arr":[1,2,3]}\'\n);\n',
	);
});

// TODO: add bson type tests

// TODO: add blob type tests

// TODO: add uuid type tests

// TODO: add guid type tests

// TODO: add vector type tests

// TODO: add geopoint type tests

test('drop index', async () => {
	const from = {
		users: singlestoreTable(
			'table',
			{
				name: text('name'),
			},
			(t) => {
				return {
					idx: index('name_idx').on(t.name),
				};
			},
		),
	};

	const to = {
		users: singlestoreTable('table', {
			name: text('name'),
		}),
	};

	const { sqlStatements } = await diffTestSchemasSingleStore(from, to, []);
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe('DROP INDEX `name_idx` ON `table`;');
});

test('add table with indexes', async () => {
	const from = {};

	const to = {
		users: singlestoreTable(
			'users',
			{
				id: serial('id').primaryKey(),
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

	const { sqlStatements } = await diffTestSchemasSingleStore(from, to, []);
	expect(sqlStatements.length).toBe(6);
	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE \`users\` (\n\t\`id\` serial AUTO_INCREMENT NOT NULL,\n\t\`name\` text,\n\t\`email\` text,\n\tCONSTRAINT \`users_id\` PRIMARY KEY(\`id\`),\n\tCONSTRAINT \`uniqueExpr\` UNIQUE((lower(\`email\`))),\n\tCONSTRAINT \`uniqueCol\` UNIQUE(\`email\`)
);
`,
		'CREATE INDEX `indexExpr` ON `users` ((lower(`email`)));',
		'CREATE INDEX `indexExprMultiple` ON `users` ((lower(`email`)),(lower(`email`)));',
		'CREATE INDEX `indexCol` ON `users` (`email`);',
		'CREATE INDEX `indexColMultiple` ON `users` (`email`,`email`);',
		'CREATE INDEX `indexColExpr` ON `users` ((lower(`email`)),`email`);',
	]);
});
