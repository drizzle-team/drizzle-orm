import { sql } from 'drizzle-orm';
import {
	AnySQLiteColumn,
	foreignKey,
	index,
	int,
	primaryKey,
	sqliteTable,
	text,
	unique,
	uniqueIndex,
} from 'drizzle-orm/sqlite-core';
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
		checkConstraints: [],
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
		checkConstraints: [],
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
		checkConstraints: [],
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
		checkConstraints: [],
	});
	expect(statements[1]).toStrictEqual({
		type: 'sqlite_create_table',
		tableName: 'posts',
		columns: [],
		compositePKs: [],
		uniqueConstraints: [],
		referenceData: [],
		checkConstraints: [],
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
		checkConstraints: [],
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
		type: 'rename_table',
		tableNameFrom: 'users1',
		tableNameTo: 'users2',
		fromSchema: undefined,
		toSchema: undefined,
	});
	expect(statements[1]).toStrictEqual({
		type: 'sqlite_create_table',
		tableName: 'users',
		columns: [],
		compositePKs: [],
		uniqueConstraints: [],
		referenceData: [],
		checkConstraints: [],
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
		checkConstraints: [],
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
		checkConstraints: [],
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

test('composite primary key', async () => {
	const from = {};
	const to = {
		table: sqliteTable('works_to_creators', {
			workId: int('work_id').notNull(),
			creatorId: int('creator_id').notNull(),
			classification: text('classification').notNull(),
		}, (t) => ({
			pk: primaryKey({
				columns: [t.workId, t.creatorId, t.classification],
			}),
		})),
	};

	const { sqlStatements } = await diffTestSchemasSqlite(from, to, []);

	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE `works_to_creators` (\n\t`work_id` integer NOT NULL,\n\t`creator_id` integer NOT NULL,\n\t`classification` text NOT NULL,\n\tPRIMARY KEY(`work_id`, `creator_id`, `classification`)\n);\n',
	]);
});

test('add column before creating unique constraint', async () => {
	const from = {
		table: sqliteTable('table', {
			id: int('id').primaryKey(),
		}),
	};
	const to = {
		table: sqliteTable('table', {
			id: int('id').primaryKey(),
			name: text('name').notNull(),
		}, (t) => ({
			uq: unique('uq').on(t.name),
		})),
	};

	const { sqlStatements } = await diffTestSchemasSqlite(from, to, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `table` ADD `name` text NOT NULL;',
		'CREATE UNIQUE INDEX `uq` ON `table` (`name`);',
	]);
});

test('optional db aliases (snake case)', async () => {
	const from = {};

	const t1 = sqliteTable(
		't1',
		{
			t1Id1: int().notNull().primaryKey(),
			t1Col2: int().notNull(),
			t1Col3: int().notNull(),
			t2Ref: int().notNull().references(() => t2.t2Id),
			t1Uni: int().notNull(),
			t1UniIdx: int().notNull(),
			t1Idx: int().notNull(),
		},
		(table) => ({
			uni: unique('t1_uni').on(table.t1Uni),
			uniIdx: uniqueIndex('t1_uni_idx').on(table.t1UniIdx),
			idx: index('t1_idx').on(table.t1Idx),
			fk: foreignKey({
				columns: [table.t1Col2, table.t1Col3],
				foreignColumns: [t3.t3Id1, t3.t3Id2],
			}),
		}),
	);

	const t2 = sqliteTable(
		't2',
		{
			t2Id: int().primaryKey({ autoIncrement: true }),
		},
	);

	const t3 = sqliteTable(
		't3',
		{
			t3Id1: int(),
			t3Id2: int(),
		},
		(table) => ({
			pk: primaryKey({
				columns: [table.t3Id1, table.t3Id2],
			}),
		}),
	);

	const to = {
		t1,
		t2,
		t3,
	};

	const { sqlStatements } = await diffTestSchemasSqlite(from, to, [], false, 'snake_case');

	const st1 = `CREATE TABLE \`t1\` (
	\`t1_id1\` integer PRIMARY KEY NOT NULL,
	\`t1_col2\` integer NOT NULL,
	\`t1_col3\` integer NOT NULL,
	\`t2_ref\` integer NOT NULL,
	\`t1_uni\` integer NOT NULL,
	\`t1_uni_idx\` integer NOT NULL,
	\`t1_idx\` integer NOT NULL,
	FOREIGN KEY (\`t2_ref\`) REFERENCES \`t2\`(\`t2_id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`t1_col2\`,\`t1_col3\`) REFERENCES \`t3\`(\`t3_id1\`,\`t3_id2\`) ON UPDATE no action ON DELETE no action
);
`;

	const st2 = `CREATE UNIQUE INDEX \`t1_uni_idx\` ON \`t1\` (\`t1_uni_idx\`);`;

	const st3 = `CREATE INDEX \`t1_idx\` ON \`t1\` (\`t1_idx\`);`;

	const st4 = `CREATE UNIQUE INDEX \`t1_uni\` ON \`t1\` (\`t1_uni\`);`;

	const st5 = `CREATE TABLE \`t2\` (
	\`t2_id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL
);
`;

	const st6 = `CREATE TABLE \`t3\` (
	\`t3_id1\` integer,
	\`t3_id2\` integer,
	PRIMARY KEY(\`t3_id1\`, \`t3_id2\`)
);
`;

	expect(sqlStatements).toStrictEqual([st1, st2, st3, st4, st5, st6]);
});

test('optional db aliases (camel case)', async () => {
	const from = {};

	const t1 = sqliteTable(
		't1',
		{
			t1_id1: int().notNull().primaryKey(),
			t1_col2: int().notNull(),
			t1_col3: int().notNull(),
			t2_ref: int().notNull().references(() => t2.t2_id),
			t1_uni: int().notNull(),
			t1_uni_idx: int().notNull(),
			t1_idx: int().notNull(),
		},
		(table) => ({
			uni: unique('t1Uni').on(table.t1_uni),
			uni_idx: uniqueIndex('t1UniIdx').on(table.t1_uni_idx),
			idx: index('t1Idx').on(table.t1_idx),
			fk: foreignKey({
				columns: [table.t1_col2, table.t1_col3],
				foreignColumns: [t3.t3_id1, t3.t3_id2],
			}),
		}),
	);

	const t2 = sqliteTable(
		't2',
		{
			t2_id: int().primaryKey({ autoIncrement: true }),
		},
	);

	const t3 = sqliteTable(
		't3',
		{
			t3_id1: int(),
			t3_id2: int(),
		},
		(table) => ({
			pk: primaryKey({
				columns: [table.t3_id1, table.t3_id2],
			}),
		}),
	);

	const to = {
		t1,
		t2,
		t3,
	};

	const { sqlStatements } = await diffTestSchemasSqlite(from, to, [], false, 'camelCase');

	const st1 = `CREATE TABLE \`t1\` (
	\`t1Id1\` integer PRIMARY KEY NOT NULL,
	\`t1Col2\` integer NOT NULL,
	\`t1Col3\` integer NOT NULL,
	\`t2Ref\` integer NOT NULL,
	\`t1Uni\` integer NOT NULL,
	\`t1UniIdx\` integer NOT NULL,
	\`t1Idx\` integer NOT NULL,
	FOREIGN KEY (\`t2Ref\`) REFERENCES \`t2\`(\`t2Id\`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (\`t1Col2\`,\`t1Col3\`) REFERENCES \`t3\`(\`t3Id1\`,\`t3Id2\`) ON UPDATE no action ON DELETE no action
);
`;

	const st2 = `CREATE UNIQUE INDEX \`t1UniIdx\` ON \`t1\` (\`t1UniIdx\`);`;

	const st3 = `CREATE INDEX \`t1Idx\` ON \`t1\` (\`t1Idx\`);`;

	const st4 = `CREATE UNIQUE INDEX \`t1Uni\` ON \`t1\` (\`t1Uni\`);`;

	const st5 = `CREATE TABLE \`t2\` (
	\`t2Id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL
);
`;

	const st6 = `CREATE TABLE \`t3\` (
	\`t3Id1\` integer,
	\`t3Id2\` integer,
	PRIMARY KEY(\`t3Id1\`, \`t3Id2\`)
);
`;

	expect(sqlStatements).toStrictEqual([st1, st2, st3, st4, st5, st6]);
});
