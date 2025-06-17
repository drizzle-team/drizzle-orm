import { sql } from 'drizzle-orm';
import {
	bigint,
	binary,
	char,
	date,
	datetime,
	decimal,
	double,
	float,
	foreignKey,
	index,
	int,
	json,
	mediumint,
	mysqlEnum,
	mysqlSchema,
	mysqlTable,
	primaryKey,
	serial,
	smallint,
	text,
	time,
	timestamp,
	tinyint,
	unique,
	uniqueIndex,
	varbinary,
	varchar,
	year,
} from 'drizzle-orm/mysql-core';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diff, prepareTestDatabase, push, TestDatabase } from './mocks';

// @vitest-environment-options {"max-concurrency":1}
let _: TestDatabase;
let db: TestDatabase['db'];

beforeAll(async () => {
	_ = await prepareTestDatabase();
	db = _.db;
});

afterAll(async () => {
	await _.close();
});

beforeEach(async () => {
	await _.clear();
});

test('add table #1', async () => {
	const to = {
		users: mysqlTable('users', { id: int() }),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = ['CREATE TABLE `users` (\n\t`id` int\n);\n'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #2', async () => {
	const to = {
		users: mysqlTable('users', {
			id: serial('id').primaryKey(),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `users` (\n\t`id` serial PRIMARY KEY\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #3', async () => {
	const to = {
		users: mysqlTable('users', {
			id: serial('id'),
		}, (t) => [
			primaryKey({
				name: 'users_pk',
				columns: [t.id],
			}),
		]),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `users` (\n\t`id` serial,\n\tCONSTRAINT `users_pk` PRIMARY KEY(`id`)\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #4', async () => {
	const to = {
		users: mysqlTable('users', { id: int() }),
		posts: mysqlTable('posts', { id: int() }),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `users` (\n\t`id` int\n);\n',
		'CREATE TABLE `posts` (\n\t`id` int\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #6', async () => {
	const from = {
		users1: mysqlTable('users1', { id: int() }),
	};

	const to = {
		users2: mysqlTable('users2', { id: int() }),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `users2` (\n\t`id` int\n);\n',
		'DROP TABLE `users1`;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #7', async () => {
	const from = {
		users1: mysqlTable('users1', { id: int() }),
	};

	const to = {
		users: mysqlTable('users', { id: int() }),
		users2: mysqlTable('users2', { id: int() }),
	};

	const renames = ['users1->users2'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = [
		'CREATE TABLE `users` (\n\t`id` int\n);\n',
		'RENAME TABLE `users1` TO `users2`;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add schema + table #1', async () => {
	const schema = mysqlSchema('folder');

	const to = {
		schema,
		users: schema.table('users', {}),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const renames = ['folder->folder2'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const renames = ['users->folder.users'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = ['DROP TABLE `users`;'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const renames = ['folder.users->users'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = ['CREATE TABLE `users` (\n\t`id` int\n);\n'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const renames = ['folder1.users->folder2.users'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const renames = ['folder1.users->folder2.users'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const renames = ['folder1.users->folder2.users'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const renames = ['folder1.users->folder2.users2'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const renames = ['folder1->folder2', 'folder2.users->folder2.users2'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #10', async () => {
	const to = {
		users: mysqlTable('table', {
			json: json('json').default({}),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		"CREATE TABLE `table` (\n\t`json` json DEFAULT ('{}')\n);\n",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #11', async () => {
	const to = {
		users: mysqlTable('table', {
			json: json('json').default([]),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		"CREATE TABLE `table` (\n\t`json` json DEFAULT ('[]')\n);\n",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #12', async () => {
	const to = {
		users: mysqlTable('table', {
			json: json('json').default([1, 2, 3]),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		"CREATE TABLE `table` (\n\t`json` json DEFAULT ('[1,2,3]')\n);\n",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #13', async () => {
	const to = {
		users: mysqlTable('table', {
			json: json('json').default({ key: 'value' }),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `table` (\n\t`json` json DEFAULT (\'{"key":"value"}\')\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `table` (\n\t`json` json DEFAULT (\'{"key":"value","arr":[1,2,3]}\')\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop index', async () => {
	const from = {
		users: mysqlTable(
			'table',
			{
				name: text('name'),
			},
			(t) => [
				index('name_idx').on(t.name),
			],
		),
	};

	const to = {
		users: mysqlTable('table', {
			name: text('name'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = ['DROP INDEX `name_idx` ON `table`;'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop unique constraint', async () => {
	const from = {
		users: mysqlTable('table', {
			name: text('name'),
		}, (t) => [unique('name_uq').on(t.name)]),
	};

	const to = {
		users: mysqlTable('table', {
			name: text('name'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'DROP INDEX `name_uq` ON `table`;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(from, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		`CREATE TABLE \`users\` (\n\t\`id\` serial PRIMARY KEY,\n\t\`name\` text,\n\t\`email\` text,\n\tCONSTRAINT \`uniqueExpr\` UNIQUE((lower(\`email\`))),\n\tCONSTRAINT \`uniqueCol\` UNIQUE(\`email\`)\n);\n`,
		'CREATE INDEX `indexExpr` ON `users` ((lower(`email`)));',
		'CREATE INDEX `indexExprMultiple` ON `users` ((lower(`email`)),(lower(`email`)));',
		'CREATE INDEX `indexCol` ON `users` (`email`);',
		'CREATE INDEX `indexColMultiple` ON `users` (`email`,`email`);',
		'CREATE INDEX `indexColExpr` ON `users` ((lower(`email`)),`email`);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('varchar and text default values escape single quotes', async (t) => {
	const schema1 = {
		table: mysqlTable('table', {
			id: serial('id').primaryKey(),
		}),
	};

	const schema2 = {
		table: mysqlTable('table', {
			id: serial('id').primaryKey(),
			enum: mysqlEnum('enum', ["escape's quotes", "escape's quotes 2"]).default("escape's quotes"),
			text: text('text').default("escape's quotes"),
			varchar: varchar('varchar', { length: 255 }).default("escape's quotes"),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		"ALTER TABLE `table` ADD `enum` enum('escape''s quotes','escape''s quotes 2') DEFAULT 'escape''s quotes';",
		"ALTER TABLE `table` ADD `text` text DEFAULT ('escape''s quotes');",
		"ALTER TABLE `table` ADD `varchar` varchar(255) DEFAULT 'escape''s quotes';",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('composite primary key #1', async () => {
	const from = {};
	const to = {
		table: mysqlTable('works_to_creators', {
			workId: int('work_id').notNull(),
			creatorId: int('creator_id').notNull(),
			classification: text('classification').notNull(),
		}, (t) => [
			primaryKey({
				columns: [t.workId, t.creatorId, t.classification],
			}),
		]),
	};

	const { sqlStatements: st } = await diff(from, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `works_to_creators` (\n\t`work_id` int NOT NULL,\n\t`creator_id` int NOT NULL,\n\t`classification` text NOT NULL,\n\tCONSTRAINT `works_to_creators_work_id_creator_id_classification_pk` PRIMARY KEY(`work_id`,`creator_id`,`classification`)\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('composite primary key #2', async () => {
	const schema1 = {};

	const schema2 = {
		table: mysqlTable('table', {
			col1: int('col1').notNull(),
			col2: int('col2').notNull(),
		}, (t) => [
			primaryKey({
				columns: [t.col1, t.col2],
			}),
		]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		'CREATE TABLE `table` (\n\t`col1` int NOT NULL,\n\t`col2` int NOT NULL,\n\tCONSTRAINT `table_col1_col2_pk` PRIMARY KEY(`col1`,`col2`)\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename table with composite primary key', async () => {
	const productsCategoriesTable = (tableName: string) => {
		return mysqlTable(tableName, {
			productId: varchar('product_id', { length: 10 }).notNull(),
			categoryId: varchar('category_id', { length: 10 }).notNull(),
		}, (t) => [
			primaryKey({
				columns: [t.productId, t.categoryId],
			}),
		]);
	};

	const schema1 = {
		table: productsCategoriesTable('products_categories'),
	};
	const schema2 = {
		test: productsCategoriesTable('products_to_categories'),
	};

	const renames = ['products_categories->products_to_categories'];
	const { sqlStatements: st } = await diff(schema1, schema2, renames);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, renames });

	const st0: string[] = [
		'RENAME TABLE `products_categories` TO `products_to_categories`;',
		'ALTER TABLE `products_to_categories` DROP PRIMARY KEY;',
		'ALTER TABLE `products_to_categories` ADD PRIMARY KEY (`product_id`,`category_id`);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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
		}, (t) => [
			unique('uq').on(t.name),
		]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `table` ADD `name` text NOT NULL;',
		'CREATE UNIQUE INDEX `uq` ON `table` (`name`);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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
	}, (table) => [
		unique('t1_uni').on(table.t1Uni),
		uniqueIndex('t1_uni_idx').on(table.t1UniIdx),
		index('t1_idx').on(table.t1Idx),
		foreignKey({
			columns: [table.t1Col2, table.t1Col3],
			foreignColumns: [t3.t3Id1, t3.t3Id2],
		}),
	]);

	const t2 = mysqlTable('t2', {
		t2Id: serial().primaryKey(),
	});

	const t3 = mysqlTable('t3', {
		t3Id1: int(),
		t3Id2: int(),
	}, (table) => [primaryKey({
		columns: [table.t3Id1, table.t3Id2],
	})]);

	const to = { t1, t2, t3 };

	const casing = 'snake_case';
	const { sqlStatements: st } = await diff(from, to, [], casing);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		`CREATE TABLE \`t1\` (
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
);\n`,
		`CREATE TABLE \`t2\` (\n\t\`t2_id\` serial PRIMARY KEY\n);\n`,
		`CREATE TABLE \`t3\` (
	\`t3_id1\` int,
	\`t3_id2\` int,
	CONSTRAINT \`t3_t3_id1_t3_id2_pk\` PRIMARY KEY(\`t3_id1\`,\`t3_id2\`)
);`,
		`CREATE INDEX \`t1_idx\` ON \`t1\` (\`t1_idx\`);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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
	}, (table) => [
		unique('t1Uni').on(table.t1_uni),
		uniqueIndex('t1UniIdx').on(table.t1_uni_idx),
		index('t1Idx').on(table.t1_idx),
		foreignKey({
			columns: [table.t1_col2, table.t1_col3],
			foreignColumns: [t3.t3_id1, t3.t3_id2],
		}),
	]);

	const t2 = mysqlTable('t2', {
		t2_id: serial().primaryKey(),
	});

	const t3 = mysqlTable('t3', {
		t3_id1: int(),
		t3_id2: int(),
	}, (table) => [primaryKey({
		columns: [table.t3_id1, table.t3_id2],
	})]);

	const to = {
		t1,
		t2,
		t3,
	};

	const casing = 'camelCase';
	const { sqlStatements: st } = await diff(from, to, [], casing);
	const { sqlStatements: pst } = await push({ db, to, casing });

	const st0: string[] = [
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
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	// TODO: should I rewrite this test as multistep test?
	// const { sqlStatements: st1, next: n1 } = await diff(state0, state1, []);
	const { sqlStatements: st1 } = await diff(state0, state1, []);
	const { sqlStatements: pst1 } = await push({ db, to: state1 });

	const { sqlStatements: st2 } = await diff(state1, state2, []);
	const { sqlStatements: pst2 } = await push({ db, to: state2 });

	const st01: string[] = [
		'CREATE TABLE `users` (\n\t`id` int,\n\tCONSTRAINT `id_unique` UNIQUE(`id`)\n);\n',
	];
	expect(st1).toStrictEqual(st01);
	expect(pst1).toStrictEqual(st01);

	const st02: string[] = [
		'DROP INDEX `id_unique` ON `users`;',
	];
	expect(st2).toStrictEqual(st02);
	expect(pst2).toStrictEqual(st02);
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

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `users` (\n\t`id` int\n);\n',
		'CREATE TABLE `places` (\n\t`id` int,\n\t`ref` int,\n\tCONSTRAINT `places_ref_users_id_fk` FOREIGN KEY (`ref`) REFERENCES `users`(`id`)\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = ["CREATE TABLE `users` (\n\t`enum` enum('value')\n);\n"];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('all types', async () => {
	const schema1 = {
		allBigInts: mysqlTable('all_big_ints', {
			simple: bigint('simple', { mode: 'number' }),
			columnNotNull: bigint('column_not_null', { mode: 'number' }).notNull(),
			columnDefault: bigint('column_default', { mode: 'number' }).default(12),
			columnDefaultSql: bigint('column_default_sql', { mode: 'number' }).default(12),
		}),
		allBools: mysqlTable('all_bools', {
			simple: tinyint('simple'),
			columnNotNull: tinyint('column_not_null').notNull(),
			columnDefault: tinyint('column_default').default(1),
		}),
		allChars: mysqlTable('all_chars', {
			simple: char('simple', { length: 1 }),
			columnNotNull: char('column_not_null', { length: 45 }).notNull(),
			// columnDefault: char("column_default", { length: 1 }).default("h"),
			columnDefaultSql: char('column_default_sql', { length: 1 }).default('h'),
		}),
		allDateTimes: mysqlTable('all_date_times', {
			simple: datetime('simple', { mode: 'string', fsp: 1 }),
			columnNotNull: datetime('column_not_null', { mode: 'string' }).notNull(),
			columnDefault: datetime('column_default', { mode: 'string' }).default('2023-03-01 14:05:29'),
		}),
		allDates: mysqlTable('all_dates', {
			simple: date('simple', { mode: 'string' }),
			column_not_null: date('column_not_null', { mode: 'string' }).notNull(),
			column_default: date('column_default', { mode: 'string' }).default('2023-03-01'),
		}),
		allDecimals: mysqlTable('all_decimals', {
			simple: decimal('simple', { precision: 1, scale: 0 }),
			columnNotNull: decimal('column_not_null', { precision: 45, scale: 3 }).notNull(),
			columnDefault: decimal('column_default', { precision: 10, scale: 0 }).default('100'),
			columnDefaultSql: decimal('column_default_sql', { precision: 10, scale: 0 }).default('101'),
		}),

		allDoubles: mysqlTable('all_doubles', {
			simple: double('simple'),
			columnNotNull: double('column_not_null').notNull(),
			columnDefault: double('column_default').default(100),
			columnDefaultSql: double('column_default_sql').default(101),
		}),

		allEnums: mysqlTable('all_enums', {
			simple: mysqlEnum('simple', ['hi', 'hello']),
		}),

		allEnums1: mysqlTable('all_enums1', {
			simple: mysqlEnum('simple', ['hi', 'hello']).default('hi'),
		}),

		allFloats: mysqlTable('all_floats', {
			columnNotNull: float('column_not_null').notNull(),
			columnDefault: float('column_default').default(100),
			columnDefaultSql: float('column_default_sql').default(101),
		}),

		allInts: mysqlTable('all_ints', {
			simple: int('simple'),
			columnNotNull: int('column_not_null').notNull(),
			columnDefault: int('column_default').default(100),
			columnDefaultSql: int('column_default_sql').default(101),
		}),

		allIntsRef: mysqlTable('all_ints_ref', {
			simple: int('simple'),
			columnNotNull: int('column_not_null').notNull(),
			columnDefault: int('column_default').default(100),
			columnDefaultSql: int('column_default_sql').default(101),
		}),

		allJsons: mysqlTable('all_jsons', {
			columnDefaultObject: json('column_default_object').default({ hello: 'world world' }).notNull(),
			columnDefaultArray: json('column_default_array').default({
				hello: { 'world world': ['foo', 'bar'] },
				foo: 'bar',
				fe: 23,
			}),
			column: json('column'),
		}),

		allMInts: mysqlTable('all_m_ints', {
			simple: mediumint('simple'),
			columnNotNull: mediumint('column_not_null').notNull(),
			columnDefault: mediumint('column_default').default(100),
			columnDefaultSql: mediumint('column_default_sql').default(101),
		}),

		allReals: mysqlTable('all_reals', {
			simple: double('simple', { precision: 5, scale: 2 }),
			columnNotNull: double('column_not_null').notNull(),
			columnDefault: double('column_default').default(100),
			columnDefaultSql: double('column_default_sql').default(101),
		}),

		allSInts: mysqlTable('all_s_ints', {
			simple: smallint('simple'),
			columnNotNull: smallint('column_not_null').notNull(),
			columnDefault: smallint('column_default').default(100),
			columnDefaultSql: smallint('column_default_sql').default(101),
		}),

		allSmallSerials: mysqlTable('all_small_serials', {
			columnAll: serial('column_all').primaryKey().notNull(),
		}),

		allTInts: mysqlTable('all_t_ints', {
			simple: tinyint('simple'),
			columnNotNull: tinyint('column_not_null').notNull(),
			columnDefault: tinyint('column_default').default(10),
			columnDefaultSql: tinyint('column_default_sql').default(11),
		}),

		allTexts: mysqlTable('all_texts', {
			simple: text('simple'),
			columnNotNull: text('column_not_null').notNull(),
			columnDefault: text('column_default').default('hello'),
			columnDefaultSql: text('column_default_sql').default('hello'),
		}),

		allTimes: mysqlTable('all_times', {
			simple: time('simple', { fsp: 1 }),
			columnNotNull: time('column_not_null').notNull(),
			columnDefault: time('column_default').default('22:12:12'),
		}),

		allTimestamps: mysqlTable('all_timestamps', {
			columnDateNow: timestamp('column_date_now', { fsp: 1, mode: 'string' }).default(sql`(now())`),
			columnAll: timestamp('column_all', { mode: 'string' })
				.default('2023-03-01 14:05:29')
				.notNull(),
			column: timestamp('column', { mode: 'string' }).default('2023-02-28 16:18:31'),
		}),

		allVarChars: mysqlTable('all_var_chars', {
			simple: varchar('simple', { length: 100 }),
			columnNotNull: varchar('column_not_null', { length: 45 }).notNull(),
			columnDefault: varchar('column_default', { length: 100 }).default('hello'),
			columnDefaultSql: varchar('column_default_sql', { length: 100 }).default('hello'),
		}),

		allVarbinaries: mysqlTable('all_varbinaries', {
			simple: varbinary('simple', { length: 100 }),
			columnNotNull: varbinary('column_not_null', { length: 100 }).notNull(),
			columnDefault: varbinary('column_default', { length: 12 }).default(sql`(uuid_to_bin(uuid()))`),
		}),

		allYears: mysqlTable('all_years', {
			simple: year('simple'),
			columnNotNull: year('column_not_null').notNull(),
			columnDefault: year('column_default').default(2022),
		}),

		binafry: mysqlTable('binary', {
			simple: binary('simple', { length: 1 }),
			columnNotNull: binary('column_not_null', { length: 1 }).notNull(),
			columnDefault: binary('column_default', { length: 12 }).default(sql`(uuid_to_bin(uuid()))`),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema1, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema1 });

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
