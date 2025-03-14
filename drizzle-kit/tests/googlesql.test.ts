import { sql } from 'drizzle-orm';
import {
	foreignKey,
	googlesqlSchema,
	googlesqlTable,
	index,
	int64,
	json,
	primaryKey,
	string,
	uniqueIndex,
} from 'drizzle-orm/googlesql';
import { expect, test } from 'vitest';
import { diffTestSchemasGooglesql } from './schemaDiffer';

test('add table #1', async () => {
	const to = {
		users: googlesqlTable('users', {}),
	};

	const { statements } = await diffTestSchemasGooglesql({}, to, []);

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
		compositePkName: '',
		checkConstraints: [],
	});
});

test('add table #2', async () => {
	const to = {
		users: googlesqlTable('users', {
			id: int64('id').primaryKey(),
		}),
	};

	const { statements } = await diffTestSchemasGooglesql({}, to, []);

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
				type: 'int64',
			},
		],
		compositePKs: ['users_id;id'],
		compositePkName: 'users_id',
		checkConstraints: [],
		internals: {
			tables: {},
			indexes: {},
		},
	});
});

test('add table #3', async () => {
	const to = {
		users: googlesqlTable(
			'users',
			{
				id: int64('id'),
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

	const { statements } = await diffTestSchemasGooglesql({}, to, []);

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
				type: 'int64',
			},
		],
		compositePKs: ['users_pk;id'],
		compositePkName: 'users_pk',
		checkConstraints: [],
		internals: {
			tables: {},
			indexes: {},
		},
	});
});

test('add table #4', async () => {
	const to = {
		users: googlesqlTable('users', {}),
		posts: googlesqlTable('posts', {}),
	};

	const { statements } = await diffTestSchemasGooglesql({}, to, []);

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
		compositePkName: '',
		checkConstraints: [],
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
		compositePkName: '',
		checkConstraints: [],
	});
});

test('add table #5', async () => {
	const schema = googlesqlSchema('folder');
	const from = {
		schema,
	};

	const to = {
		schema,
		users: schema.table('users', {}),
	};

	const { statements } = await diffTestSchemasGooglesql(from, to, []);

	expect(statements.length).toBe(0);
});

test('add table #6', async () => {
	const from = {
		users1: googlesqlTable('users1', {}),
	};

	const to = {
		users2: googlesqlTable('users2', {}),
	};

	const { statements } = await diffTestSchemasGooglesql(from, to, []);

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
		compositePkName: '',
		checkConstraints: [],
	});
	expect(statements[1]).toStrictEqual({
		type: 'drop_table',
		policies: [],
		tableName: 'users1',
		schema: undefined,
	});
});

test('add table #7', async () => {
	const from = {
		users1: googlesqlTable('users1', {}),
	};

	const to = {
		users: googlesqlTable('users', {}),
		users2: googlesqlTable('users2', {}),
	};

	const { statements } = await diffTestSchemasGooglesql(from, to, [
		'public.users1->public.users2',
	]);

	expect(statements.length).toBe(2);
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
		compositePkName: '',
		checkConstraints: [],
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
	const schema = googlesqlSchema('folder');

	const to = {
		schema,
		users: schema.table('users', {}),
	};

	const { statements } = await diffTestSchemasGooglesql({}, to, []);

	expect(statements.length).toBe(0);
});

test('change schema with tables #1', async () => {
	const schema = googlesqlSchema('folder');
	const schema2 = googlesqlSchema('folder2');
	const from = {
		schema,
		users: schema.table('users', {}),
	};
	const to = {
		schema2,
		users: schema2.table('users', {}),
	};

	const { statements } = await diffTestSchemasGooglesql(from, to, [
		'folder->folder2',
	]);

	expect(statements.length).toBe(0);
});

test('change table schema #1', async () => {
	const schema = googlesqlSchema('folder');
	const from = {
		schema,
		users: googlesqlTable('users', {}),
	};
	const to = {
		schema,
		users: schema.table('users', {}),
	};

	const { statements } = await diffTestSchemasGooglesql(from, to, [
		'public.users->folder.users',
	]);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'drop_table',
		policies: [],
		tableName: 'users',
		schema: undefined,
	});
});

test('change table schema #2', async () => {
	const schema = googlesqlSchema('folder');
	const from = {
		schema,
		users: schema.table('users', {}),
	};
	const to = {
		schema,
		users: googlesqlTable('users', {}),
	};

	const { statements } = await diffTestSchemasGooglesql(from, to, [
		'folder.users->public.users',
	]);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'create_table',
		tableName: 'users',
		schema: undefined,
		columns: [],
		compositePkName: '',
		compositePKs: [],
		checkConstraints: [],
		internals: {
			tables: {},
			indexes: {},
		},
	});
});

test('change table schema #3', async () => {
	const schema1 = googlesqlSchema('folder1');
	const schema2 = googlesqlSchema('folder2');
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

	const { statements } = await diffTestSchemasGooglesql(from, to, [
		'folder1.users->folder2.users',
	]);

	expect(statements.length).toBe(0);
});

test('change table schema #4', async () => {
	const schema1 = googlesqlSchema('folder1');
	const schema2 = googlesqlSchema('folder2');
	const from = {
		schema1,
		users: schema1.table('users', {}),
	};
	const to = {
		schema1,
		schema2, // add schema
		users: schema2.table('users', {}), // move table
	};

	const { statements } = await diffTestSchemasGooglesql(from, to, [
		'folder1.users->folder2.users',
	]);

	expect(statements.length).toBe(0);
});

test('change table schema #5', async () => {
	const schema1 = googlesqlSchema('folder1');
	const schema2 = googlesqlSchema('folder2');
	const from = {
		schema1, // remove schema
		users: schema1.table('users', {}),
	};
	const to = {
		schema2, // add schema
		users: schema2.table('users', {}), // move table
	};

	const { statements } = await diffTestSchemasGooglesql(from, to, [
		'folder1.users->folder2.users',
	]);

	expect(statements.length).toBe(0);
});

test('change table schema #5', async () => {
	const schema1 = googlesqlSchema('folder1');
	const schema2 = googlesqlSchema('folder2');
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

	const { statements } = await diffTestSchemasGooglesql(from, to, [
		'folder1.users->folder2.users2',
	]);

	expect(statements.length).toBe(0);
});

test('change table schema #6', async () => {
	const schema1 = googlesqlSchema('folder1');
	const schema2 = googlesqlSchema('folder2');
	const from = {
		schema1,
		users: schema1.table('users', {}),
	};
	const to = {
		schema2, // rename schema
		users: schema2.table('users2', {}), // rename table
	};

	const { statements } = await diffTestSchemasGooglesql(from, to, [
		'folder1->folder2',
		'folder2.users->folder2.users2',
	]);

	expect(statements.length).toBe(0);
});

test('add table #10', async () => {
	const to = {
		users: googlesqlTable('table', {
			json: json('json').default({}),
		}),
	};

	const { sqlStatements } = await diffTestSchemasGooglesql({}, to, []);
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		"CREATE TABLE `table` (\n\t`json` json DEFAULT (JSON '{}')\n);",
	);
});

test('add table #11', async () => {
	const to = {
		users: googlesqlTable('table', {
			json: json('json').default([]),
		}),
	};

	const { sqlStatements } = await diffTestSchemasGooglesql({}, to, []);
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		"CREATE TABLE `table` (\n\t`json` json DEFAULT (JSON '[]')\n);",
	);
});

test('add table #12', async () => {
	const to = {
		users: googlesqlTable('table', {
			json: json('json').default([1, 2, 3]),
		}),
	};

	const { sqlStatements } = await diffTestSchemasGooglesql({}, to, []);
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		"CREATE TABLE `table` (\n\t`json` json DEFAULT (JSON '[1,2,3]')\n);",
	);
});

test('add table #13', async () => {
	const to = {
		users: googlesqlTable('table', {
			json: json('json').default({ key: 'value' }),
		}),
	};

	const { sqlStatements } = await diffTestSchemasGooglesql({}, to, []);
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		'CREATE TABLE `table` (\n\t`json` json DEFAULT (JSON \'{"key":"value"}\')\n);',
	);
});

test('add table #14', async () => {
	const to = {
		users: googlesqlTable('table', {
			json: json('json').default({
				key: 'value',
				arr: [1, 2, 3],
			}),
		}),
	};

	const { sqlStatements } = await diffTestSchemasGooglesql({}, to, []);
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		'CREATE TABLE `table` (\n\t`json` json DEFAULT (JSON \'{"key":"value","arr":[1,2,3]}\')\n);',
	);
});

test('drop index', async () => {
	const from = {
		users: googlesqlTable(
			'table',
			{
				name: string('name'),
			},
			(t) => {
				return {
					idx: index('name_idx').on(t.name),
				};
			},
		),
	};

	const to = {
		users: googlesqlTable('table', {
			name: string('name'),
		}),
	};

	const { sqlStatements } = await diffTestSchemasGooglesql(from, to, []);
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe('DROP INDEX `name_idx`;');
});

test('add table with indexes', async () => {
	const from = {};

	const to = {
		users: googlesqlTable(
			'users',
			{
				id: int64('id').primaryKey(),
				name: string('name'),
				email: string('email'),
			},
			(t) => ({
				uniqueExpr: uniqueIndex('uniqueExpr').on(sql`${t.email}`),
				indexExpr: index('indexExpr').on(sql`${t.email}`),
				indexExprMultiple: index('indexExprMultiple').on(
					sql`${t.email}`,
					sql`${t.name}`,
				),

				uniqueCol: uniqueIndex('uniqueCol').on(t.email),
				indexCol: index('indexCol').on(t.email),
				indexColMultiple: index('indexColMultiple').on(t.email, t.name),

				indexColExpr: index('indexColExpr').on(
					sql`${t.email}`,
					t.name,
				),
			}),
		),
	};

	const { sqlStatements } = await diffTestSchemasGooglesql(from, to, []);
	expect(sqlStatements.length).toBe(8);
	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE \`users\` (\n\t\`id\` int64 NOT NULL,\n\t\`name\` string(MAX),\n\t\`email\` string(MAX)\n) PRIMARY KEY(\`id\`);`,
		'CREATE UNIQUE INDEX `uniqueExpr` ON `users` (`email`);',
		'CREATE INDEX `indexExpr` ON `users` (`email`);',
		'CREATE INDEX `indexExprMultiple` ON `users` (`email`,`name`);',
		'CREATE UNIQUE INDEX `uniqueCol` ON `users` (`email`);',
		'CREATE INDEX `indexCol` ON `users` (`email`);',
		'CREATE INDEX `indexColMultiple` ON `users` (`email`,`name`);',
		'CREATE INDEX `indexColExpr` ON `users` (`email`,`name`);',
	]);
});

test('string(size) and string default values escape single quotes', async (t) => {
	const schema1 = {
		table: googlesqlTable('table', {
			id: int64('id').primaryKey(),
		}),
	};

	const schem2 = {
		table: googlesqlTable('table', {
			id: int64('id').primaryKey(),
			text: string('text').default("escape's quotes"),
			textWithLen: string('textWithLen', { length: 255 }).default("escape's quotes"),
		}),
	};

	const { sqlStatements } = await diffTestSchemasGooglesql(schema1, schem2, []);

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toStrictEqual(
		"ALTER TABLE `table` ADD COLUMN `text` string(MAX) DEFAULT ('escape\\'s quotes');",
	);
	expect(sqlStatements[1]).toStrictEqual(
		"ALTER TABLE `table` ADD COLUMN `textWithLen` string(255) DEFAULT ('escape\\'s quotes');",
	);
});

test('composite primary key', async () => {
	const from = {};
	const to = {
		table: googlesqlTable('works_to_creators', {
			workId: int64('work_id').notNull(),
			creatorId: int64('creator_id').notNull(),
			classification: string('classification').notNull(),
		}, (t) => ({
			pk: primaryKey({
				columns: [t.workId, t.creatorId, t.classification],
			}),
		})),
	};

	const { sqlStatements } = await diffTestSchemasGooglesql(from, to, []);

	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE \`works_to_creators\` (
\t\`work_id\` int64 NOT NULL,
\t\`creator_id\` int64 NOT NULL,
\t\`classification\` string(MAX) NOT NULL
) PRIMARY KEY(\`work_id\`,\`creator_id\`,\`classification\`);`,
	]);
});

test('optional db aliases (snake case)', async () => {
	const from = {};

	const t1 = googlesqlTable(
		't1',
		{
			t1Id1: int64().notNull().primaryKey(),
			t1Col2: int64().notNull(),
			t1Col3: int64().notNull(),
			t2Ref: int64().notNull().references(() => t2.t2Id),
			t1Uni: int64().notNull(),
			t1UniIdx: int64().notNull(),
			t1Idx: int64().notNull(),
		},
		(table) => ({
			uni: uniqueIndex('t1_uni').on(table.t1Uni),
			uniIdx: uniqueIndex('t1_uni_idx').on(table.t1UniIdx),
			idx: index('t1_idx').on(table.t1Idx),
			fk: foreignKey({
				columns: [table.t1Col2, table.t1Col3],
				foreignColumns: [t3.t3Id1, t3.t3Id2],
			}),
		}),
	);

	const t2 = googlesqlTable(
		't2',
		{
			t2Id: int64().primaryKey(),
		},
	);

	const t3 = googlesqlTable(
		't3',
		{
			t3Id1: int64(),
			t3Id2: int64(),
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

	const { sqlStatements } = await diffTestSchemasGooglesql(from, to, [], false, 'snake_case');

	const st1 = `CREATE TABLE \`t1\` (
	\`t1_id1\` int64 NOT NULL,
	\`t1_col2\` int64 NOT NULL,
	\`t1_col3\` int64 NOT NULL,
	\`t2_ref\` int64 NOT NULL,
	\`t1_uni\` int64 NOT NULL,
	\`t1_uni_idx\` int64 NOT NULL,
	\`t1_idx\` int64 NOT NULL
) PRIMARY KEY(\`t1_id1\`);`;

	const st2 = `CREATE TABLE \`t2\` (
	\`t2_id\` int64 NOT NULL
) PRIMARY KEY(\`t2_id\`);`;

	const st3 = `CREATE TABLE \`t3\` (
	\`t3_id1\` int64 NOT NULL,
	\`t3_id2\` int64 NOT NULL
) PRIMARY KEY(\`t3_id1\`,\`t3_id2\`);`;

	const st4 =
		`ALTER TABLE \`t1\` ADD CONSTRAINT \`t1_t2_ref_t2_t2_id_fk\` FOREIGN KEY (\`t2_ref\`) REFERENCES \`t2\`(\`t2_id\`) ON DELETE no action;`;

	const st5 =
		`ALTER TABLE \`t1\` ADD CONSTRAINT \`t1_t1_col2_t1_col3_t3_t3_id1_t3_id2_fk\` FOREIGN KEY (\`t1_col2\`,\`t1_col3\`) REFERENCES \`t3\`(\`t3_id1\`,\`t3_id2\`) ON DELETE no action;`;

	const st6 = 'CREATE UNIQUE INDEX `t1_uni` ON `t1` (`t1_uni`);';
	const st7 = 'CREATE UNIQUE INDEX `t1_uni_idx` ON `t1` (`t1_uni_idx`);';
	const st8 = `CREATE INDEX \`t1_idx\` ON \`t1\` (\`t1_idx\`);`;

	expect(sqlStatements).toStrictEqual([st1, st2, st3, st4, st5, st6, st7, st8]);
});

test('optional db aliases (camel case)', async () => {
	const from = {};

	const t1 = googlesqlTable(
		't1',
		{
			t1_id1: int64().notNull().primaryKey(),
			t1_col2: int64().notNull(),
			t1_col3: int64().notNull(),
			t2_ref: int64().notNull().references(() => t2.t2_id),
			t1_uni_idx: int64().notNull(),
			t1_idx: int64().notNull(),
		},
		(table) => ({
			uni_idx: uniqueIndex('t1UniIdx').on(table.t1_uni_idx),
			idx: index('t1Idx').on(table.t1_idx),
			fk: foreignKey({
				columns: [table.t1_col2, table.t1_col3],
				foreignColumns: [t3.t3_id1, t3.t3_id2],
			}),
		}),
	);

	const t2 = googlesqlTable(
		't2',
		{
			t2_id: int64().primaryKey(),
		},
	);

	const t3 = googlesqlTable(
		't3',
		{
			t3_id1: int64(),
			t3_id2: int64(),
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

	const { sqlStatements } = await diffTestSchemasGooglesql(from, to, [], false, 'camelCase');

	const st1 = `CREATE TABLE \`t1\` (
	\`t1Id1\` int64 NOT NULL,
	\`t1Col2\` int64 NOT NULL,
	\`t1Col3\` int64 NOT NULL,
	\`t2Ref\` int64 NOT NULL,
	\`t1UniIdx\` int64 NOT NULL,
	\`t1Idx\` int64 NOT NULL
) PRIMARY KEY(\`t1Id1\`);`;

	const st2 = `CREATE TABLE \`t2\` (
	\`t2Id\` int64 NOT NULL
) PRIMARY KEY(\`t2Id\`);`;

	const st3 = `CREATE TABLE \`t3\` (
	\`t3Id1\` int64 NOT NULL,
	\`t3Id2\` int64 NOT NULL
) PRIMARY KEY(\`t3Id1\`,\`t3Id2\`);`;

	const st4 =
		`ALTER TABLE \`t1\` ADD CONSTRAINT \`t1_t2Ref_t2_t2Id_fk\` FOREIGN KEY (\`t2Ref\`) REFERENCES \`t2\`(\`t2Id\`) ON DELETE no action;`;

	const st5 =
		`ALTER TABLE \`t1\` ADD CONSTRAINT \`t1_t1Col2_t1Col3_t3_t3Id1_t3Id2_fk\` FOREIGN KEY (\`t1Col2\`,\`t1Col3\`) REFERENCES \`t3\`(\`t3Id1\`,\`t3Id2\`) ON DELETE no action;`;

	const st6 = 'CREATE UNIQUE INDEX `t1UniIdx` ON `t1` (`t1UniIdx`);';

	const st7 = `CREATE INDEX \`t1Idx\` ON \`t1\` (\`t1Idx\`);`;

	expect(sqlStatements).toStrictEqual([st1, st2, st3, st4, st5, st6, st7]);
});
