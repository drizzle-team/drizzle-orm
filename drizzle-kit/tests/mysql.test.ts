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
import { diffTestSchemasMysql } from './schemaDiffer';

test('add table #1', async () => {
	const to = {
		users: mysqlTable('users', {}),
	};

	const { statements } = await diffTestSchemasMysql({}, to, []);

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
		checkConstraints: [],
	});
});

test('add table #2', async () => {
	const to = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
		}),
	};

	const { statements } = await diffTestSchemasMysql({}, to, []);

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
		checkConstraints: [],
		internals: {
			tables: {},
			indexes: {},
		},
	});
});

test('add table #3', async () => {
	const to = {
		users: mysqlTable(
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

	const { statements } = await diffTestSchemasMysql({}, to, []);

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
		checkConstraints: [],
		internals: {
			tables: {},
			indexes: {},
		},
	});
});

test('add table #4', async () => {
	const to = {
		users: mysqlTable('users', {}),
		posts: mysqlTable('posts', {}),
	};

	const { statements } = await diffTestSchemasMysql({}, to, []);

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
		uniqueConstraints: [],
		compositePkName: '',
		checkConstraints: [],
	});
});

test('add table #5', async () => {
	const schema = mysqlSchema('folder');
	const from = {
		schema,
	};

	const to = {
		schema,
		users: schema.table('users', {}),
	};

	const { statements } = await diffTestSchemasMysql(from, to, []);

	expect(statements.length).toBe(0);
});

test('add table #6', async () => {
	const from = {
		users1: mysqlTable('users1', {}),
	};

	const to = {
		users2: mysqlTable('users2', {}),
	};

	const { statements } = await diffTestSchemasMysql(from, to, []);

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
		users1: mysqlTable('users1', {}),
	};

	const to = {
		users: mysqlTable('users', {}),
		users2: mysqlTable('users2', {}),
	};

	const { statements } = await diffTestSchemasMysql(from, to, [
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
	const schema = mysqlSchema('folder');

	const to = {
		schema,
		users: schema.table('users', {}),
	};

	const { statements } = await diffTestSchemasMysql({}, to, []);

	expect(statements.length).toBe(0);
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

	const { statements } = await diffTestSchemasMysql(from, to, [
		'folder->folder2',
	]);

	expect(statements.length).toBe(0);
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

	const { statements } = await diffTestSchemasMysql(from, to, [
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
	const schema = mysqlSchema('folder');
	const from = {
		schema,
		users: schema.table('users', {}),
	};
	const to = {
		schema,
		users: mysqlTable('users', {}),
	};

	const { statements } = await diffTestSchemasMysql(from, to, [
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
		checkConstraints: [],
		internals: {
			tables: {},
			indexes: {},
		},
	});
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

	const { statements } = await diffTestSchemasMysql(from, to, [
		'folder1.users->folder2.users',
	]);

	expect(statements.length).toBe(0);
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

	const { statements } = await diffTestSchemasMysql(from, to, [
		'folder1.users->folder2.users',
	]);

	expect(statements.length).toBe(0);
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

	const { statements } = await diffTestSchemasMysql(from, to, [
		'folder1.users->folder2.users',
	]);

	expect(statements.length).toBe(0);
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

	const { statements } = await diffTestSchemasMysql(from, to, [
		'folder1.users->folder2.users2',
	]);

	expect(statements.length).toBe(0);
});

test('change table schema #6', async () => {
	const schema1 = mysqlSchema('folder1');
	const schema2 = mysqlSchema('folder2');
	const from = {
		schema1,
		users: schema1.table('users', {}),
	};
	const to = {
		schema2, // rename schema
		users: schema2.table('users2', {}), // rename table
	};

	const { statements } = await diffTestSchemasMysql(from, to, [
		'folder1->folder2',
		'folder2.users->folder2.users2',
	]);

	expect(statements.length).toBe(0);
});

test('add table #10', async () => {
	const to = {
		users: mysqlTable('table', {
			json: json('json').default({}),
		}),
	};

	const { sqlStatements } = await diffTestSchemasMysql({}, to, []);
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		"CREATE TABLE `table` (\n\t`json` json DEFAULT ('{}')\n);\n",
	);
});

test('add table #11', async () => {
	const to = {
		users: mysqlTable('table', {
			json: json('json').default([]),
		}),
	};

	const { sqlStatements } = await diffTestSchemasMysql({}, to, []);
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		"CREATE TABLE `table` (\n\t`json` json DEFAULT ('[]')\n);\n",
	);
});

test('add table #12', async () => {
	const to = {
		users: mysqlTable('table', {
			json: json('json').default([1, 2, 3]),
		}),
	};

	const { sqlStatements } = await diffTestSchemasMysql({}, to, []);
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		"CREATE TABLE `table` (\n\t`json` json DEFAULT ('[1,2,3]')\n);\n",
	);
});

test('add table #13', async () => {
	const to = {
		users: mysqlTable('table', {
			json: json('json').default({ key: 'value' }),
		}),
	};

	const { sqlStatements } = await diffTestSchemasMysql({}, to, []);
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

	const { sqlStatements } = await diffTestSchemasMysql({}, to, []);
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

	const { sqlStatements } = await diffTestSchemasMysql(from, to, []);
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe('DROP INDEX `name_idx` ON `table`;');
});

test('drop unique constraint', async () => {
	const from = {
		users: mysqlTable(
			'table',
			{
				name: text('name'),
			},
			(t) => {
				return {
					uq: unique('name_uq').on(t.name),
				};
			},
		),
	};

	const to = {
		users: mysqlTable('table', {
			name: text('name'),
		}),
	};

	const { sqlStatements } = await diffTestSchemasMysql(from, to, []);
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe('ALTER TABLE `table` DROP INDEX `name_uq`;');
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

	const { sqlStatements } = await diffTestSchemasMysql(from, to, []);
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

	const { sqlStatements } = await diffTestSchemasMysql(schema1, schem2, []);

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

	const { sqlStatements } = await diffTestSchemasMysql(from, to, []);

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

	const { sqlStatements } = await diffTestSchemasMysql(from, to, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE `table` ADD `name` text NOT NULL;',
		'ALTER TABLE `table` ADD CONSTRAINT `uq` UNIQUE(`name`);',
	]);
});

test('optional db aliases (snake case)', async () => {
	const from = {};

	const t1 = mysqlTable(
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

	const t2 = mysqlTable(
		't2',
		{
			t2Id: serial().primaryKey(),
		},
	);

	const t3 = mysqlTable(
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

	const { sqlStatements } = await diffTestSchemasMysql(from, to, [], false, 'snake_case');

	const st1 = `CREATE TABLE \`t1\` (
	\`t1_id1\` int NOT NULL,
	\`t1_col2\` int NOT NULL,
	\`t1_col3\` int NOT NULL,
	\`t2_ref\` int NOT NULL,
	\`t1_uni\` int NOT NULL,
	\`t1_uni_idx\` int NOT NULL,
	\`t1_idx\` int NOT NULL,
	CONSTRAINT \`t1_t1_id1\` PRIMARY KEY(\`t1_id1\`),
	CONSTRAINT \`t1_uni\` UNIQUE(\`t1_uni\`),
	CONSTRAINT \`t1_uni_idx\` UNIQUE(\`t1_uni_idx\`)
);
`;

	const st2 = `CREATE TABLE \`t2\` (
	\`t2_id\` serial AUTO_INCREMENT NOT NULL,
	CONSTRAINT \`t2_t2_id\` PRIMARY KEY(\`t2_id\`)
);
`;

	const st3 = `CREATE TABLE \`t3\` (
	\`t3_id1\` int NOT NULL,
	\`t3_id2\` int NOT NULL,
	CONSTRAINT \`t3_t3_id1_t3_id2_pk\` PRIMARY KEY(\`t3_id1\`,\`t3_id2\`)
);
`;

	const st4 =
		`ALTER TABLE \`t1\` ADD CONSTRAINT \`t1_t2_ref_t2_t2_id_fk\` FOREIGN KEY (\`t2_ref\`) REFERENCES \`t2\`(\`t2_id\`) ON DELETE no action ON UPDATE no action;`;

	const st5 =
		`ALTER TABLE \`t1\` ADD CONSTRAINT \`t1_t1_col2_t1_col3_t3_t3_id1_t3_id2_fk\` FOREIGN KEY (\`t1_col2\`,\`t1_col3\`) REFERENCES \`t3\`(\`t3_id1\`,\`t3_id2\`) ON DELETE no action ON UPDATE no action;`;

	const st6 = `CREATE INDEX \`t1_idx\` ON \`t1\` (\`t1_idx\`);`;

	expect(sqlStatements).toStrictEqual([st1, st2, st3, st4, st5, st6]);
});

test('optional db aliases (camel case)', async () => {
	const from = {};

	const t1 = mysqlTable(
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

	const t2 = mysqlTable(
		't2',
		{
			t2_id: serial().primaryKey(),
		},
	);

	const t3 = mysqlTable(
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

	const { sqlStatements } = await diffTestSchemasMysql(from, to, [], false, 'camelCase');

	const st1 = `CREATE TABLE \`t1\` (
	\`t1Id1\` int NOT NULL,
	\`t1Col2\` int NOT NULL,
	\`t1Col3\` int NOT NULL,
	\`t2Ref\` int NOT NULL,
	\`t1Uni\` int NOT NULL,
	\`t1UniIdx\` int NOT NULL,
	\`t1Idx\` int NOT NULL,
	CONSTRAINT \`t1_t1Id1\` PRIMARY KEY(\`t1Id1\`),
	CONSTRAINT \`t1Uni\` UNIQUE(\`t1Uni\`),
	CONSTRAINT \`t1UniIdx\` UNIQUE(\`t1UniIdx\`)
);
`;

	const st2 = `CREATE TABLE \`t2\` (
	\`t2Id\` serial AUTO_INCREMENT NOT NULL,
	CONSTRAINT \`t2_t2Id\` PRIMARY KEY(\`t2Id\`)
);
`;

	const st3 = `CREATE TABLE \`t3\` (
	\`t3Id1\` int NOT NULL,
	\`t3Id2\` int NOT NULL,
	CONSTRAINT \`t3_t3Id1_t3Id2_pk\` PRIMARY KEY(\`t3Id1\`,\`t3Id2\`)
);
`;

	const st4 =
		`ALTER TABLE \`t1\` ADD CONSTRAINT \`t1_t2Ref_t2_t2Id_fk\` FOREIGN KEY (\`t2Ref\`) REFERENCES \`t2\`(\`t2Id\`) ON DELETE no action ON UPDATE no action;`;

	const st5 =
		`ALTER TABLE \`t1\` ADD CONSTRAINT \`t1_t1Col2_t1Col3_t3_t3Id1_t3Id2_fk\` FOREIGN KEY (\`t1Col2\`,\`t1Col3\`) REFERENCES \`t3\`(\`t3Id1\`,\`t3Id2\`) ON DELETE no action ON UPDATE no action;`;

	const st6 = `CREATE INDEX \`t1Idx\` ON \`t1\` (\`t1Idx\`);`;

	expect(sqlStatements).toStrictEqual([st1, st2, st3, st4, st5, st6]);
});

test('add table with ts enum', async () => {
	enum Test {
		value = 'value',
	}
	const to = {
		users: mysqlTable('users', {
			enum: mysqlEnum(Test),
		}),
	};

	const { statements } = await diffTestSchemasMysql({}, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'create_table',
		tableName: 'users',
		schema: undefined,
		columns: [{
			autoincrement: false,
			name: 'enum',
			notNull: false,
			primaryKey: false,
			type: "enum('value')",
		}],
		compositePKs: [],
		internals: {
			tables: {},
			indexes: {},
		},
		uniqueConstraints: [],
		compositePkName: '',
		checkConstraints: [],
	});
});
