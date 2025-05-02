import { sql } from 'drizzle-orm';
import {
	foreignKey,
	index,
	int,
	json,
	mysqlEnum,
	mysqlSchema,
	mysqlTable,
	primaryKey,
	serial,
	text,
	unique,
	uniqueIndex,
	varchar,
} from 'drizzle-orm/mysql-core';
import { expect, test } from 'vitest';
import { diff } from './mocks';

test('add table #1', async () => {
	const to = {
		users: mysqlTable('users', { id: int() }),
	};

	const { sqlStatements } = await diff({}, to, []);

	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE `users` (\n\t`id` int\n);\n',
	]);
});

test('add table #2', async () => {
	const to = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
		}),
	};

	const { sqlStatements } = await diff({}, to, []);

	expect(sqlStatements).toStrictEqual(['CREATE TABLE `users` (\n\t`id` serial PRIMARY KEY\n);\n']);
});

test('add table #3', async () => {
	const to = {
		users: mysqlTable('users', {
			id: serial('id'),
		}, (t) => {
			return {
				pk: primaryKey({
					name: 'users_pk',
					columns: [t.id],
				}),
			};
		}),
	};

	const { sqlStatements } = await diff({}, to, []);
	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE `users` (\n\t`id` serial,\n\tCONSTRAINT `users_pk` PRIMARY KEY(`id`)\n);\n',
	]);
});

test('add table #4', async () => {
	const to = {
		users: mysqlTable('users', { id: int() }),
		posts: mysqlTable('posts', { id: int() }),
	};

	const { sqlStatements } = await diff({}, to, []);

	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE `users` (\n\t`id` int\n);\n',
		'CREATE TABLE `posts` (\n\t`id` int\n);\n',
	]);
});

test('add table #5', async () => {
	const schema = mysqlSchema('folder');
	const from = {
		schema,
	};

	const to = {
		schema,
		users: schema.table('users', { id: int() }),
	};

	const { sqlStatements } = await diff(from, to, []);
	expect(sqlStatements).toStrictEqual([]);
});

test('add table #6', async () => {
	const from = {
		users1: mysqlTable('users1', { id: int() }),
	};

	const to = {
		users2: mysqlTable('users2', { id: int() }),
	};

	const { sqlStatements } = await diff(from, to, []);
	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE `users2` (\n\t`id` int\n);\n',
		'DROP TABLE `users1`;',
	]);
});

test('add table #7', async () => {
	const from = {
		users1: mysqlTable('users1', { id: int() }),
	};

	const to = {
		users: mysqlTable('users', { id: int() }),
		users2: mysqlTable('users2', { id: int() }),
	};

	const { sqlStatements } = await diff(from, to, [
		'users1->users2',
	]);
	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE `users` (\n\t`id` int\n);\n',
		'RENAME TABLE `users1` TO `users2`;',
	]);
});

test('add schema + table #1', async () => {
	const schema = mysqlSchema('folder');

	const to = {
		schema,
		users: schema.table('users', {}),
	};

	const { sqlStatements } = await diff({}, to, []);
	expect(sqlStatements).toStrictEqual([]);
});

test('change schema with tables #1', async () => {
	const schema = mysqlSchema('folder');
	const schema2 = mysqlSchema('folder2');
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
	const schema = mysqlSchema('folder');
	const from = {
		schema,
		users: mysqlTable('users', {}),
	};
	const to = {
		schema,
		users: schema.table('users', {}),
	};

	const { sqlStatements } = await diff(from, to, [
		'users->folder.users',
	]);

	expect(sqlStatements).toStrictEqual(['DROP TABLE `users`;']);
});

test('change table schema #2', async () => {
	const schema = mysqlSchema('folder');
	const from = {
		schema,
		users: schema.table('users', {}),
	};
	const to = {
		schema,
		users: mysqlTable('users', { id: int() }),
	};

	const { sqlStatements } = await diff(from, to, [
		'folder.users->users',
	]);
	expect(sqlStatements).toStrictEqual(['CREATE TABLE `users` (\n\t`id` int\n);\n']);
});

test('change table schema #3', async () => {
	const schema1 = mysqlSchema('folder1');
	const schema2 = mysqlSchema('folder2');
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
	expect(sqlStatements).toStrictEqual([]);
});

test('change table schema #4', async () => {
	const schema1 = mysqlSchema('folder1');
	const schema2 = mysqlSchema('folder2');
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
	expect(sqlStatements).toStrictEqual([]);
});

test('change table schema #5', async () => {
	const schema1 = mysqlSchema('folder1');
	const schema2 = mysqlSchema('folder2');
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
	expect(sqlStatements).toStrictEqual([]);
});

test('change table schema #5', async () => {
	const schema1 = mysqlSchema('folder1');
	const schema2 = mysqlSchema('folder2');
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
	expect(sqlStatements).toStrictEqual([]);
});

test('change table schema #6', async () => {
	const schema1 = mysqlSchema('folder1');
	const schema2 = mysqlSchema('folder2');
	const from = {
		schema1,
		users: schema1.table('users', { id: int() }),
	};
	const to = {
		schema2, // rename schema
		users: schema2.table('users2', { id: int() }), // rename table
	};

	const { sqlStatements } = await diff(from, to, [
		'folder1->folder2',
		'folder2.users->folder2.users2',
	]);
	expect(sqlStatements).toStrictEqual([]);
});

test('add table #10', async () => {
	const to = {
		users: mysqlTable('table', {
			json: json('json').default({}),
		}),
	};

	const { sqlStatements } = await diff({}, to, []);
	expect(sqlStatements).toStrictEqual(["CREATE TABLE `table` (\n\t`json` json DEFAULT ('{}')\n);\n"]);
});

test('add table #11', async () => {
	const to = {
		users: mysqlTable('table', {
			json: json('json').default([]),
		}),
	};

	const { sqlStatements } = await diff({}, to, []);
	expect(sqlStatements).toStrictEqual(["CREATE TABLE `table` (\n\t`json` json DEFAULT ('[]')\n);\n"]);
});

test('add table #12', async () => {
	const to = {
		users: mysqlTable('table', {
			json: json('json').default([1, 2, 3]),
		}),
	};

	const { sqlStatements } = await diff({}, to, []);
	expect(sqlStatements).toStrictEqual(["CREATE TABLE `table` (\n\t`json` json DEFAULT ('[1,2,3]')\n);\n"]);
});

test('add table #13', async () => {
	const to = {
		users: mysqlTable('table', {
			json: json('json').default({ key: 'value' }),
		}),
	};

	const { sqlStatements } = await diff({}, to, []);
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		'CREATE TABLE `table` (\n\t`json` json DEFAULT (\'{"key":"value"}\')\n);\n',
	);
});

test('add table #14', async () => {
	const to = {
		users: mysqlTable('table', {
			json: json('json').default({
				key: 'value',
				arr: [1, 2, 3],
			}),
		}),
	};

	const { sqlStatements } = await diff({}, to, []);
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		'CREATE TABLE `table` (\n\t`json` json DEFAULT (\'{"key":"value","arr":[1,2,3]}\')\n);\n',
	);
});

test('drop index', async () => {
	const from = {
		users: mysqlTable(
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
		users: mysqlTable('table', {
			name: text('name'),
		}),
	};

	const { sqlStatements } = await diff(from, to, []);
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe('DROP INDEX `name_idx` ON `table`;');
});

test('drop unique constraint', async () => {
	const from = {
		users: mysqlTable('table', {
			name: text('name'),
		}, (t) => {
			return {
				uq: unique('name_uq').on(t.name),
			};
		}),
	};

	const to = {
		users: mysqlTable('table', {
			name: text('name'),
		}),
	};

	const { sqlStatements } = await diff(from, to, []);
	expect(sqlStatements).toStrictEqual([
		'DROP INDEX `name_uq` ON `table`;',
	]);
});

test('add table with indexes', async () => {
	const from = {};

	const to = {
		users: mysqlTable(
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

	const { sqlStatements } = await diff(from, to, []);
	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE \`users\` (\n\t\`id\` serial PRIMARY KEY,\n\t\`name\` text,\n\t\`email\` text,\n\tCONSTRAINT \`uniqueExpr\` UNIQUE((lower(\`email\`))),\n\tCONSTRAINT \`uniqueCol\` UNIQUE(\`email\`)\n);\n`,
		'CREATE INDEX `indexExpr` ON `users` ((lower(`email`)));',
		'CREATE INDEX `indexExprMultiple` ON `users` ((lower(`email`)),(lower(`email`)));',
		'CREATE INDEX `indexCol` ON `users` (`email`);',
		'CREATE INDEX `indexColMultiple` ON `users` (`email`,`email`);',
		'CREATE INDEX `indexColExpr` ON `users` ((lower(`email`)),`email`);',
	]);
});

test('varchar and text default values escape single quotes', async (t) => {
	const schema1 = {
		table: mysqlTable('table', {
			id: serial('id').primaryKey(),
		}),
	};

	const schem2 = {
		table: mysqlTable('table', {
			id: serial('id').primaryKey(),
			enum: mysqlEnum('enum', ["escape's quotes", "escape's quotes 2"]).default("escape's quotes"),
			text: text('text').default("escape's quotes"),
			varchar: varchar('varchar', { length: 255 }).default("escape's quotes"),
		}),
	};

	const { sqlStatements } = await diff(schema1, schem2, []);

	expect(sqlStatements.length).toBe(3);
	expect(sqlStatements[0]).toStrictEqual(
		"ALTER TABLE `table` ADD `enum` enum('escape''s quotes','escape''s quotes 2') DEFAULT 'escape''s quotes';",
	);
	expect(sqlStatements[1]).toStrictEqual(
		"ALTER TABLE `table` ADD `text` text DEFAULT ('escape''s quotes');",
	);
	expect(sqlStatements[2]).toStrictEqual(
		"ALTER TABLE `table` ADD `varchar` varchar(255) DEFAULT 'escape''s quotes';",
	);
});

test('composite primary key', async () => {
	const from = {};
	const to = {
		table: mysqlTable('works_to_creators', {
			workId: int('work_id').notNull(),
			creatorId: int('creator_id').notNull(),
			classification: text('classification').notNull(),
		}, (t) => ({
			pk: primaryKey({
				columns: [t.workId, t.creatorId, t.classification],
			}),
		})),
	};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE `works_to_creators` (\n\t`work_id` int NOT NULL,\n\t`creator_id` int NOT NULL,\n\t`classification` text NOT NULL,\n\tCONSTRAINT `works_to_creators_work_id_creator_id_classification_pk` PRIMARY KEY(`work_id`,`creator_id`,`classification`)\n);\n',
	]);
});

test('add column before creating unique constraint', async () => {
	const from = {
		table: mysqlTable('table', {
			id: serial('id').primaryKey(),
		}),
	};
	const to = {
		table: mysqlTable('table', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
		}, (t) => ({
			uq: unique('uq').on(t.name),
		})),
	};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `table` ADD `name` text NOT NULL;',
		'CREATE UNIQUE INDEX `uq` ON `table` (`name`);',
	]);
});

test('optional db aliases (snake case)', async () => {
	const from = {};

	const t1 = mysqlTable('t1', {
		t1Id1: int().notNull().primaryKey(),
		t1Col2: int().notNull(),
		t1Col3: int().notNull(),
		t2Ref: int().notNull().references(() => t2.t2Id),
		t1Uni: int().notNull(),
		t1UniIdx: int().notNull(),
		t1Idx: int().notNull(),
	}, (table) => ({
		uni: unique('t1_uni').on(table.t1Uni),
		uniIdx: uniqueIndex('t1_uni_idx').on(table.t1UniIdx),
		idx: index('t1_idx').on(table.t1Idx),
		fk: foreignKey({
			columns: [table.t1Col2, table.t1Col3],
			foreignColumns: [t3.t3Id1, t3.t3Id2],
		}),
	}));

	const t2 = mysqlTable('t2', {
		t2Id: serial().primaryKey(),
	});

	const t3 = mysqlTable('t3', {
		t3Id1: int(),
		t3Id2: int(),
	}, (table) => ({
		pk: primaryKey({
			columns: [table.t3Id1, table.t3Id2],
		}),
	}));

	const to = { t1, t2, t3 };

	const { sqlStatements } = await diff(from, to, [], 'snake_case');

	const st1 = `CREATE TABLE \`t1\` (
	\`t1_id1\` int PRIMARY KEY,
	\`t1_col2\` int NOT NULL,
	\`t1_col3\` int NOT NULL,
	\`t2_ref\` int NOT NULL,
	\`t1_uni\` int NOT NULL,
	\`t1_uni_idx\` int NOT NULL,
	\`t1_idx\` int NOT NULL,
	CONSTRAINT \`t1_uni\` UNIQUE(\`t1_uni\`),
	CONSTRAINT \`t1_uni_idx\` UNIQUE(\`t1_uni_idx\`),
	CONSTRAINT \`t1_t2_ref_t2_t2_id_fk\` FOREIGN KEY (\`t2_ref\`) REFERENCES \`t2\`(\`t2_id\`),
	CONSTRAINT \`t1_t1_col2_t1_col3_t3_t3_id1_t3_id2_fk\` FOREIGN KEY (\`t1_col2\`,\`t1_col3\`) REFERENCES \`t3\`(\`t3_id1\`,\`t3_id2\`)
);\n`;

	const st2 = `CREATE TABLE \`t2\` (\n\t\`t2_id\` serial PRIMARY KEY\n);\n`;

	const st3 = `CREATE TABLE \`t3\` (
	\`t3_id1\` int,
	\`t3_id2\` int,
	CONSTRAINT \`t3_t3_id1_t3_id2_pk\` PRIMARY KEY(\`t3_id1\`,\`t3_id2\`)
);
`;

	const st6 = `CREATE INDEX \`t1_idx\` ON \`t1\` (\`t1_idx\`);`;

	expect(sqlStatements).toStrictEqual([
		st1,
		st2,
		st3,
		st6,
	]);
});

test('optional db aliases (camel case)', async () => {
	const from = {};

	const t1 = mysqlTable('t1', {
		t1_id1: int().notNull().primaryKey(),
		t1_col2: int().notNull(),
		t1_col3: int().notNull(),
		t2_ref: int().notNull().references(() => t2.t2_id),
		t1_uni: int().notNull(),
		t1_uni_idx: int().notNull(),
		t1_idx: int().notNull(),
	}, (table) => ({
		uni: unique('t1Uni').on(table.t1_uni),
		uni_idx: uniqueIndex('t1UniIdx').on(table.t1_uni_idx),
		idx: index('t1Idx').on(table.t1_idx),
		fk: foreignKey({
			columns: [table.t1_col2, table.t1_col3],
			foreignColumns: [t3.t3_id1, t3.t3_id2],
		}),
	}));

	const t2 = mysqlTable('t2', {
		t2_id: serial().primaryKey(),
	});

	const t3 = mysqlTable('t3', {
		t3_id1: int(),
		t3_id2: int(),
	}, (table) => ({
		pk: primaryKey({
			columns: [table.t3_id1, table.t3_id2],
		}),
	}));

	const to = {
		t1,
		t2,
		t3,
	};

	const { sqlStatements } = await diff(from, to, [], 'camelCase');

	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE \`t1\` (\n\t\`t1Id1\` int PRIMARY KEY,\n\t\`t1Col2\` int NOT NULL,\n\t\`t1Col3\` int NOT NULL,\n`
		+ `\t\`t2Ref\` int NOT NULL,\n\t\`t1Uni\` int NOT NULL,\n\t\`t1UniIdx\` int NOT NULL,\n\t\`t1Idx\` int NOT NULL,\n`
		+ `\tCONSTRAINT \`t1Uni\` UNIQUE(\`t1Uni\`),\n`
		+ `\tCONSTRAINT \`t1UniIdx\` UNIQUE(\`t1UniIdx\`),\n`
		+ `\tCONSTRAINT \`t1_t2Ref_t2_t2Id_fk\` FOREIGN KEY (\`t2Ref\`) REFERENCES \`t2\`(\`t2Id\`),\n`
		+ `\tCONSTRAINT \`t1_t1Col2_t1Col3_t3_t3Id1_t3Id2_fk\` FOREIGN KEY (\`t1Col2\`,\`t1Col3\`) REFERENCES \`t3\`(\`t3Id1\`,\`t3Id2\`)\n`
		+ `);\n`,
		`CREATE TABLE \`t2\` (\n\t\`t2Id\` serial PRIMARY KEY\n);\n`,
		`CREATE TABLE \`t3\` (\n\t\`t3Id1\` int,\n\t\`t3Id2\` int,\n\tCONSTRAINT \`t3_t3Id1_t3Id2_pk\` PRIMARY KEY(\`t3Id1\`,\`t3Id2\`)\n);\n`,
		'CREATE INDEX `t1Idx` ON `t1` (`t1Idx`);',
	]);
});

test('add+drop unique', async () => {
	const state0 = {};
	const state1 = {
		users: mysqlTable('users', {
			id: int().unique(),
		}),
	};
	const state2 = {
		users: mysqlTable('users', {
			id: int(),
		}),
	};

	const { sqlStatements: st1 } = await diff(state0, state1, []);
	const { sqlStatements: st2 } = await diff(state1, state2, []);

	expect([...st1, ...st2]).toStrictEqual([
		'CREATE TABLE `users` (\n\t`id` int,\n\tCONSTRAINT `id_unique` UNIQUE(`id`)\n);\n',
		'DROP INDEX `id_unique` ON `users`;',
	]);
});

test('fk #1', async () => {
	const users = mysqlTable('users', {
		id: int(),
	});
	const to = {
		users,
		places: mysqlTable('places', {
			id: int(),
			ref: int().references(() => users.id),
		}),
	};

	const { sqlStatements } = await diff({}, to, []);
	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE `users` (\n\t`id` int\n);\n',
		'CREATE TABLE `places` (\n\t`id` int,\n\t`ref` int,\n\tCONSTRAINT `places_ref_users_id_fk` FOREIGN KEY (`ref`) REFERENCES `users`(`id`)\n);\n',
	]);
});
