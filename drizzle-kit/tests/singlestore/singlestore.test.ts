import { sql } from 'drizzle-orm';
import {
	index,
	int,
	json,
	primaryKey,
	serial,
	singlestoreSchema,
	singlestoreTable,
	text,
	uniqueIndex,
} from 'drizzle-orm/singlestore-core';
import { expect, test } from 'vitest';
import { diff } from './mocks';

test('add table #1', async () => {
	const to = {
		users: singlestoreTable('users', {}),
	};

	const { sqlStatements } = await diff({}, to, []);

	expect(sqlStatements).toStrictEqual(['']);
});

test('add table #2', async () => {
	const to = {
		users: singlestoreTable('users', {
			id: serial('id').primaryKey(),
		}),
	};

	const { sqlStatements } = await diff({}, to, []);

	expect(sqlStatements).toStrictEqual(['']);
});

test('add table #3', async () => {
	const to = {
		users: singlestoreTable('users', {
			id: serial('id'),
		}, (t) => [primaryKey({
			name: 'users_pk',
			columns: [t.id],
		})]),
	};

	const { sqlStatements } = await diff({}, to, []);
	expect(sqlStatements).toStrictEqual(['']);
});

test('add table #4', async () => {
	const to = {
		users: singlestoreTable('users', {}),
		posts: singlestoreTable('posts', {}),
	};

	const { sqlStatements } = await diff({}, to, []);
	expect(sqlStatements).toStrictEqual(['']);
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

	const { sqlStatements } = await diff(from, to, []);
	expect(sqlStatements).toStrictEqual([]);
});

test('add table #6', async () => {
	const from = {
		users1: singlestoreTable('users1', {}),
	};

	const to = {
		users2: singlestoreTable('users2', {}),
	};

	const { sqlStatements } = await diff(from, to, []);
	expect(sqlStatements).toStrictEqual(['']);
});

test('add table #7', async () => {
	const from = {
		users1: singlestoreTable('users1', {}),
	};

	const to = {
		users: singlestoreTable('users', {}),
		users2: singlestoreTable('users2', {}),
	};

	const { sqlStatements } = await diff(from, to, [
		'users1->users2',
	]);

	expect(sqlStatements).toStrictEqual(['']);
});

test('add schema + table #1', async () => {
	const schema = singlestoreSchema('folder');

	const to = {
		schema,
		users: schema.table('users', {}),
	};

	const { sqlStatements } = await diff({}, to, []);
	expect(sqlStatements).toStrictEqual([]);
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

	const { sqlStatements } = await diff(from, to, [
		'folder->folder2',
	]);
	expect(sqlStatements).toStrictEqual([]);
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

	const { sqlStatements } = await diff(from, to, [
		'users->folder.users',
	]);
	expect(sqlStatements).toStrictEqual(['']);
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

	const { sqlStatements } = await diff(from, to, [
		'folder.users->users',
	]);
	expect(sqlStatements).toStrictEqual(['']);
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

	const { sqlStatements } = await diff(from, to, [
		'folder1.users->folder2.users',
	]);

	expect(sqlStatements).toStrictEqual(['']);
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

	const { sqlStatements } = await diff(from, to, [
		'folder1.users->folder2.users',
	]);

	expect(sqlStatements).toStrictEqual(['']);
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

	const { sqlStatements } = await diff(from, to, [
		'folder1.users->folder2.users',
	]);

	expect(sqlStatements).toStrictEqual(['']);
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

	const { sqlStatements } = await diff(from, to, [
		'folder1.users->folder2.users2',
	]);

	expect(sqlStatements).toStrictEqual(['']);
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

	const { sqlStatements } = await diff(from, to, [
		'folder1->folder2',
		'folder2.users->folder2.users2',
	]);

	expect(sqlStatements).toStrictEqual(['']);
});

test('add table #10', async () => {
	const to = {
		users: singlestoreTable('table', {
			json: json('json').default({}),
		}),
	};

	const { sqlStatements } = await diff({}, to, []);
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

	const { sqlStatements } = await diff({}, to, []);
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

	const { sqlStatements } = await diff({}, to, []);
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

	const { sqlStatements } = await diff({}, to, []);
	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE `table` (\n\t`json` json DEFAULT \'{"key":"value"}\'\n);\n',
	]);
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

	const { sqlStatements } = await diff({}, to, []);
	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE `table` (\n\t`json` json DEFAULT \'{"key":"value","arr":[1,2,3]}\'\n);\n',
	]);
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
			(t) => [index('name_idx').on(t.name)],
		),
	};

	const to = {
		users: singlestoreTable('table', {
			name: text('name'),
		}),
	};

	const { sqlStatements } = await diff(from, to, []);
	expect(sqlStatements).toStrictEqual([
		'DROP INDEX `name_idx` ON `table`;',
	]);
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
			(t) => [
				uniqueIndex('uniqueExpr').on(sql`(lower(${t.email}))`),
				index('indexExpr').on(sql`(lower(${t.email}))`),
				index('indexExprMultiple').on(
					sql`(lower(${t.email}))`,
					sql`(lower(${t.email}))`,
				),

				uniqueIndex('uniqueCol').on(t.email),
				index('indexCol').on(t.email),
				index('indexColMultiple').on(t.email, t.email),

				index('indexColExpr').on(
					sql`(lower(${t.email}))`,
					t.email,
				),
			],
		),
	};

	const { sqlStatements } = await diff(from, to, []);
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

test('rename table', async () => {
	const from = {
		table: singlestoreTable('table', {
			json: json('json').default([]),
		}),
	};

	const to = {
		table1: singlestoreTable('table1', {
			json1: json('json').default([]),
		}),
	};

	const { sqlStatements } = await diff(from, to, [`table->table1`]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `table` RENAME TO `table1`;',
	]);
});

test('rename column', async () => {
	const from = {
		users: singlestoreTable('table', {
			json: json('json').default([]),
		}),
	};

	const to = {
		users: singlestoreTable('table', {
			json1: json('json1').default([]),
		}),
	};

	const { sqlStatements } = await diff(from, to, [`table.json->table.json1`]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `table` CHANGE `json` `json1`;',
	]);
});

test('change data type', async () => {
	const from = {
		table: singlestoreTable('table', {
			id: int(),
			age: text(),
		}),
	};

	const to = {
		table: singlestoreTable('table', {
			id: int(),
			age: int(),
		}),
	};

	const { sqlStatements } = await diff(from, to, []);
	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE \`__new_table\` (
\t\`id\` int,
\t\`age\` int
);\n`,
		'INSERT INTO `__new_table`(`id`, `age`) SELECT `id`, `age` FROM `table`;',
		'DROP TABLE `table`;',
		'ALTER TABLE `__new_table` RENAME TO `table`;',
	]);
});

test('drop not null', async () => {
	const from = {
		table: singlestoreTable('table', {
			id: int().notNull(),
			age: int(),
		}),
	};

	const to = {
		table: singlestoreTable('table', {
			id: int(),
			age: int(),
		}),
	};

	const { sqlStatements } = await diff(from, to, []);
	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE \`__new_table\` (
\t\`id\` int,
\t\`age\` int
);\n`,
		'INSERT INTO `__new_table`(`id`, `age`) SELECT `id`, `age` FROM `table`;',
		'DROP TABLE `table`;',
		'ALTER TABLE `__new_table` RENAME TO `table`;',
	]);
});

test('set not null', async () => {
	const from = {
		table: singlestoreTable('table', {
			id: int(),
			age: int(),
		}),
	};

	const to = {
		table: singlestoreTable('table', {
			id: int().notNull(),
			age: int(),
		}),
	};

	const { sqlStatements } = await diff(from, to, []);
	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE \`__new_table\` (
\t\`id\` int NOT NULL,
\t\`age\` int
);\n`,
		'INSERT INTO `__new_table`(`id`, `age`) SELECT `id`, `age` FROM `table`;',
		'DROP TABLE `table`;',
		'ALTER TABLE `__new_table` RENAME TO `table`;',
	]);
});

test('set default with not null column', async () => {
	const from = {
		table: singlestoreTable('table', {
			id: int().notNull(),
			age: int(),
		}),
	};

	const to = {
		table: singlestoreTable('table', {
			id: int().notNull().default(1),
			age: int(),
		}),
	};

	const { sqlStatements } = await diff(from, to, []);
	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE \`__new_table\` (
\t\`id\` int NOT NULL DEFAULT 1,
\t\`age\` int
);\n`,
		'INSERT INTO `__new_table`(`id`, `age`) SELECT `id`, `age` FROM `table`;',
		'DROP TABLE `table`;',
		'ALTER TABLE `__new_table` RENAME TO `table`;',
	]);
});

test('drop default with not null column', async () => {
	const from = {
		table: singlestoreTable('table', {
			id: int().notNull().default(1),
			age: int(),
		}),
	};

	const to = {
		table: singlestoreTable('table', {
			id: int().notNull(),
			age: int(),
		}),
	};

	const { sqlStatements } = await diff(from, to, []);
	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE \`__new_table\` (
\t\`id\` int NOT NULL,
\t\`age\` int
);\n`,
		'INSERT INTO `__new_table`(`id`, `age`) SELECT `id`, `age` FROM `table`;',
		'DROP TABLE `table`;',
		'ALTER TABLE `__new_table` RENAME TO `table`;',
	]);
});

test('set default', async () => {
	const from = {
		table: singlestoreTable('table', {
			id: int(),
			age: int(),
		}),
	};

	const to = {
		table: singlestoreTable('table', {
			id: int().default(1),
			age: int(),
		}),
	};

	const { sqlStatements } = await diff(from, to, []);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `table` MODIFY COLUMN `id` int DEFAULT 1;',
	]);
});

test('drop default', async () => {
	const from = {
		table: singlestoreTable('table', {
			id: int().default(1),
			age: int(),
		}),
	};

	const to = {
		table: singlestoreTable('table', {
			id: int(),
			age: int(),
		}),
	};

	const { sqlStatements } = await diff(from, to, []);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `table` MODIFY COLUMN `id` int;',
	]);
});

test('set pk', async () => {
	const from = {
		table: singlestoreTable('table', {
			id: int(),
			age: int(),
		}),
	};

	const to = {
		table: singlestoreTable('table', {
			id: int().primaryKey(),
			age: int(),
		}),
	};

	const { sqlStatements } = await diff(from, to, []);
	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE \`__new_table\` (
\t\`id\` int NOT NULL,
\t\`age\` int,
\tCONSTRAINT \`table_id\` PRIMARY KEY(\`id\`)
);\n`,
		'INSERT INTO `__new_table`(`id`, `age`) SELECT `id`, `age` FROM `table`;',
		'DROP TABLE `table`;',
		'ALTER TABLE `__new_table` RENAME TO `table`;',
	]);
});

test('drop pk', async () => {
	const from = {
		table: singlestoreTable('table', {
			id: int().primaryKey(),
			age: int(),
		}),
	};

	const to = {
		table: singlestoreTable('table', {
			id: int(),
			age: int(),
		}),
	};

	const { sqlStatements } = await diff(from, to, []);
	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE \`__new_table\` (
\t\`id\` int,
\t\`age\` int
);\n`,
		'INSERT INTO `__new_table`(`id`, `age`) SELECT `id`, `age` FROM `table`;',
		'DROP TABLE `table`;',
		'ALTER TABLE `__new_table` RENAME TO `table`;',
	]);
});

test('set not null + rename column on table with indexes', async () => {
	const from = {
		table: singlestoreTable('table', {
			id: int('id').default(1),
			age: int(),
		}),
	};

	const to = {
		table: singlestoreTable('table', {
			id3: int('id3').notNull().default(1),
			age: int(),
		}),
	};

	const { sqlStatements } = await diff(from, to, [`table.id->table.id3`]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE \`table\` CHANGE `id` `id3`;',
		`CREATE TABLE \`__new_table\` (
			\t\`id3\` int NOT NULL DEFAULT 1,
			\t\`age\` int
			);\n`,
		'INSERT INTO `__new_table`(`id3`, `age`) SELECT `id3`, `age` FROM `table`;',
		'DROP TABLE `table`;',
		'ALTER TABLE `__new_table` RENAME TO `table`;',
	]);
});

test('set not null + rename table on table with indexes', async () => {
	const from = {
		table: singlestoreTable('table', {
			id: int('id').default(1),
			age: int(),
		}),
	};

	const to = {
		table1: singlestoreTable('table1', {
			id: int('id').notNull().default(1),
			age: int(),
		}),
	};

	const { sqlStatements } = await diff(from, to, [`table->table1`]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `table` RENAME TO `table1`;',
		`CREATE TABLE \`__new_table1\` (
\t\`id\` int NOT NULL DEFAULT 1,
\t\`age\` int
);\n`,
		'INSERT INTO `__new_table1`(\`id\`, \`age\`) SELECT \`id\`, \`age\` FROM `table1`;',
		'DROP TABLE `table1`;',
		'ALTER TABLE `__new_table1` RENAME TO `table1`;',
	]);
});
