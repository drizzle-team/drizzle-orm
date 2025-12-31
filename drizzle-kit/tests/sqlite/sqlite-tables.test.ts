import { sql } from 'drizzle-orm';
import {
	AnySQLiteColumn,
	blob,
	customType,
	foreignKey,
	index,
	int,
	integer,
	numeric,
	primaryKey,
	real,
	sqliteTable,
	text,
	unique,
	uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diff, prepareTestDatabase, push, TestDatabase } from './mocks';

fs.mkdirSync('./tests/sqlite/migrations', { recursive: true });

// @vitest-environment-options {"max-concurrency":1}
let _: TestDatabase;
let db: TestDatabase['db'];
let client: ReturnType<TestDatabase['getClient']>;

beforeAll(() => {
	_ = prepareTestDatabase();
	db = _.db;
	client = _.getClient();
});

afterAll(async () => {
	await _.close();
});

beforeEach(async () => {
	await _.clear();
	client = _.getClient();
});

test('add table #1', async () => {
	const to = {
		users: sqliteTable('users', { id: int() }),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = ['CREATE TABLE `users` (\n\t`id` integer\n);\n'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #2', async () => {
	const to = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `users` (\n\t`id` integer PRIMARY KEY AUTOINCREMENT\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #3', async () => {
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
		}, (t) => [primaryKey({
			name: 'users_pk',
			columns: [t.id],
		})]),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `users` (\n\t`id` integer,\n\tCONSTRAINT \`users_pk\` PRIMARY KEY(\`id\`)\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #4', async () => {
	const to = {
		users: sqliteTable('users', { id: int() }),
		posts: sqliteTable('posts', { id: int() }),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `users` (\n\t`id` integer\n);\n',
		'CREATE TABLE `posts` (\n\t`id` integer\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #5', async () => {
	const to = {
		users: sqliteTable('users', {
			id1: integer(),
			id2: integer(),
		}, (t) => [
			primaryKey({ columns: [t.id1, t.id2] }),
		]),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `users` (\n'
		+ '\t`id1` integer,\n'
		+ '\t`id2` integer,\n'
		+ '\tCONSTRAINT \`users_pk\` PRIMARY KEY(`id1`, `id2`)\n'
		+ ');\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #6', async () => {
	const from = {
		users1: sqliteTable('users1', { id: int() }),
	};

	const to = {
		users2: sqliteTable('users2', { id: int() }),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = ['CREATE TABLE `users2` (\n\t`id` integer\n);\n', 'DROP TABLE `users1`;'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #7', async () => {
	const from = {
		users1: sqliteTable('users1', { id: int() }),
	};

	const to = {
		users: sqliteTable('users', { id: int() }),
		users2: sqliteTable('users2', { id: int() }),
	};

	const renames = ['users1->users2'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = ['CREATE TABLE `users` (\n\t`id` integer\n);\n', 'ALTER TABLE `users1` RENAME TO `users2`;'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #8', async () => {
	const users = sqliteTable('users', {
		id: int('id').primaryKey({ autoIncrement: true }),
		reporteeId: int('reportee_id').references((): AnySQLiteColumn => users.id),
	});

	const to = {
		users,
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `users` (\n'
		+ '\t`id` integer PRIMARY KEY AUTOINCREMENT,\n'
		+ '\t`reportee_id` integer,\n'
		+ '\tCONSTRAINT `fk_users_reportee_id_users_id_fk` FOREIGN KEY (`reportee_id`) REFERENCES `users`(`id`)\n'
		+ ');\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #9', async () => {
	const to = {
		users: sqliteTable(
			'users',
			{
				id: int('id').primaryKey({ autoIncrement: true }),
				reporteeId: int('reportee_id'),
			},
			(t) => [index('reportee_idx').on(t.reporteeId)],
		),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `users` (\n'
		+ '\t`id` integer PRIMARY KEY AUTOINCREMENT,\n'
		+ '\t`reportee_id` integer\n'
		+ ');\n',
		'CREATE INDEX `reportee_idx` ON `users` (`reportee_id`);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #10', async () => {
	const to = {
		users: sqliteTable('table', {
			json: text('json', { mode: 'json' }).default({}),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = ["CREATE TABLE `table` (\n\t`json` text DEFAULT '{}'\n);\n"];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #11', async () => {
	const to = {
		users: sqliteTable('table', {
			json: text('json', { mode: 'json' }).default([]),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = ["CREATE TABLE `table` (\n\t`json` text DEFAULT '[]'\n);\n"];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #12', async () => {
	const to = {
		users: sqliteTable('table', {
			json: text('json', { mode: 'json' }).default([1, 2, 3]),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = ["CREATE TABLE `table` (\n\t`json` text DEFAULT '[1,2,3]'\n);\n"];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #13', async () => {
	const to = {
		users: sqliteTable('table', {
			json: text('json', { mode: 'json' }).default({ key: 'value' }),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = ['CREATE TABLE `table` (\n\t`json` text DEFAULT \'{"key":"value"}\'\n);\n'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = ['CREATE TABLE `table` (\n\t`json` text DEFAULT \'{"key":"value","arr":[1,2,3]}\'\n);\n'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename table #1', async () => {
	const from = {
		users: sqliteTable('table', {
			id: integer(),
		}),
	};
	const to = {
		users: sqliteTable('table1', {
			id: integer(),
		}),
	};

	const renames = ['table->table1'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = ['ALTER TABLE `table` RENAME TO `table1`;'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename table #2', async () => {
	const profiles = sqliteTable('profiles', {
		id: integer().primaryKey({ autoIncrement: true }),
	});

	const from = {
		profiles,
		users: sqliteTable(
			'table',
			{
				id: integer().primaryKey({ autoIncrement: true }),
				profileId: integer(),
			},
			(t) => [foreignKey({
				name: 'table_profileId',
				columns: [t.id],
				foreignColumns: [profiles.id],
			})],
		),
	};

	const to = {
		profiles,
		users: sqliteTable(
			'table1',
			{
				id: integer().primaryKey({ autoIncrement: true }),
				profileId: integer(),
			},
			(t) => [foreignKey({
				name: 'table_profileId',
				columns: [t.id],
				foreignColumns: [profiles.id],
			})],
		),
	};

	const renames = ['table->table1'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = ['ALTER TABLE `table` RENAME TO `table1`;'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename table #3', async () => {
	const profiles = sqliteTable('profiles', {
		id: integer().primaryKey({ autoIncrement: true }),
	});

	const from = {
		profiles,
		users: sqliteTable('table', {
			id: integer().primaryKey({ autoIncrement: true }),
			profileId: integer().references(() => profiles.id),
		}),
	};

	const to = {
		profiles,
		users: sqliteTable('table1', {
			id: integer().primaryKey({ autoIncrement: true }),
			profileId: integer().references(() => profiles.id),
		}),
	};

	const renames = ['table->table1'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = ['ALTER TABLE `table` RENAME TO `table1`;'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `users` (\n\t`id` integer PRIMARY KEY,\n\t`name` text,\n\t`email` text\n);\n',
		'CREATE UNIQUE INDEX `uniqueExpr` ON `users` ((lower("email")));',
		'CREATE INDEX `indexExpr` ON `users` ((lower("email")));',
		'CREATE INDEX `indexExprMultiple` ON `users` ((lower("email")),(lower("email")));',
		'CREATE UNIQUE INDEX `uniqueCol` ON `users` (`email`);',
		'CREATE INDEX `indexCol` ON `users` (`email`);',
		'CREATE INDEX `indexColMultiple` ON `users` (`email`,`email`);',
		'CREATE INDEX `indexColExpr` ON `users` ((lower("email")),`email`);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('composite primary key', async () => {
	const from = {};
	const to = {
		table: sqliteTable('works_to_creators', {
			workId: int('work_id').notNull(),
			creatorId: int('creator_id').notNull(),
			classification: text('classification').notNull(),
		}, (t) => [primaryKey({
			columns: [t.workId, t.creatorId, t.classification],
		})]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `works_to_creators` (\n\t`work_id` integer NOT NULL,\n\t`creator_id` integer NOT NULL,\n\t`classification` text NOT NULL,\n\tCONSTRAINT \`works_to_creators_pk\` PRIMARY KEY(`work_id`, `creator_id`, `classification`)\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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
		}, (t) => [unique('uq').on(t.name)]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `table` ADD `name` text NOT NULL;',
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_table` (\n'
		+ '\t`id` integer PRIMARY KEY,\n'
		+ '\t`name` text NOT NULL CONSTRAINT \`uq\` UNIQUE\n'
		+ ');\n',
		'INSERT INTO `__new_table`(`id`) SELECT `id` FROM `table`;',
		'DROP TABLE `table`;',
		'ALTER TABLE `__new_table` RENAME TO `table`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create table with unique in third param and in column config', async () => {
	const to = {
		table: sqliteTable('table', {
			id: int('id').unique(),
			name: text('name').notNull(),
		}, (t) => [unique('uq').on(t.name)]),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'CREATE TABLE `table` (\n'
		+ '\t`id` integer UNIQUE,\n'
		+ '\t`name` text NOT NULL CONSTRAINT \`uq\` UNIQUE\n'
		+ ');\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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
		(table) => [
			unique('t1_uni').on(table.t1Uni),
			uniqueIndex('t1_uni_idx').on(table.t1UniIdx),
			index('t1_idx').on(table.t1Idx),
			foreignKey({
				columns: [table.t1Col2, table.t1Col3],
				foreignColumns: [t3.t3Id1, t3.t3Id2],
			}),
		],
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
		(table) => [primaryKey({
			columns: [table.t3Id1, table.t3Id2],
		})],
	);

	const to = {
		t1,
		t2,
		t3,
	};

	const casing = 'snake_case';
	const { sqlStatements: st } = await diff(from, to, [], casing);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, casing });

	const st0: string[] = [
		'CREATE TABLE `t1` (\n'
		+ '\t`t1_id1` integer PRIMARY KEY,\n'
		+ '\t`t1_col2` integer NOT NULL,\n'
		+ '\t`t1_col3` integer NOT NULL,\n'
		+ '\t`t2_ref` integer NOT NULL,\n'
		+ '\t`t1_uni` integer NOT NULL CONSTRAINT \`t1_uni\` UNIQUE,\n'
		+ '\t`t1_uni_idx` integer NOT NULL,\n'
		+ '\t`t1_idx` integer NOT NULL,\n'
		+ '\tCONSTRAINT `fk_t1_t2_ref_t2_t2_id_fk` FOREIGN KEY (`t2_ref`) REFERENCES `t2`(`t2_id`),\n'
		+ '\tCONSTRAINT `fk_t1_t1_col2_t1_col3_t3_t3_id1_t3_id2_fk` FOREIGN KEY (`t1_col2`,`t1_col3`) REFERENCES `t3`(`t3_id1`,`t3_id2`)\n'
		+ ');\n',
		'CREATE TABLE `t2` (\n\t`t2_id` integer PRIMARY KEY AUTOINCREMENT\n);\n',
		'CREATE TABLE `t3` (\n'
		+ '\t`t3_id1` integer,\n'
		+ '\t`t3_id2` integer,\n'
		+ '\tCONSTRAINT \`t3_pk\` PRIMARY KEY(`t3_id1`, `t3_id2`)\n'
		+ ');\n',
		'CREATE UNIQUE INDEX `t1_uni_idx` ON `t1` (`t1_uni_idx`);',
		'CREATE INDEX `t1_idx` ON `t1` (`t1_idx`);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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
		(table) => [
			unique('t1Uni').on(table.t1_uni),
			uniqueIndex('t1UniIdx').on(table.t1_uni_idx),
			index('t1Idx').on(table.t1_idx),
			foreignKey({
				columns: [table.t1_col2, table.t1_col3],
				foreignColumns: [t3.t3_id1, t3.t3_id2],
			}),
		],
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
		(table) => [primaryKey({
			columns: [table.t3_id1, table.t3_id2],
		})],
	);

	const to = {
		t1,
		t2,
		t3,
	};

	const casing = 'camelCase';
	const { sqlStatements: st } = await diff(from, to, [], casing);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, casing });

	const st0: string[] = [
		'CREATE TABLE `t1` (\n'
		+ '\t`t1Id1` integer PRIMARY KEY,\n'
		+ '\t`t1Col2` integer NOT NULL,\n'
		+ '\t`t1Col3` integer NOT NULL,\n'
		+ '\t`t2Ref` integer NOT NULL,\n'
		+ '\t`t1Uni` integer NOT NULL CONSTRAINT `t1Uni` UNIQUE,\n'
		+ '\t`t1UniIdx` integer NOT NULL,\n'
		+ '\t`t1Idx` integer NOT NULL,\n'
		+ '\tCONSTRAINT `fk_t1_t2Ref_t2_t2Id_fk` FOREIGN KEY (`t2Ref`) REFERENCES `t2`(`t2Id`),\n'
		+ '\tCONSTRAINT `fk_t1_t1Col2_t1Col3_t3_t3Id1_t3Id2_fk` FOREIGN KEY (`t1Col2`,`t1Col3`) REFERENCES `t3`(`t3Id1`,`t3Id2`)\n'
		+ ');\n',
		'CREATE TABLE `t2` (\n\t`t2Id` integer PRIMARY KEY AUTOINCREMENT\n);\n',
		'CREATE TABLE `t3` (\n'
		+ '\t`t3Id1` integer,\n'
		+ '\t`t3Id2` integer,\n'
		+ '\tCONSTRAINT `t3_pk` PRIMARY KEY(`t3Id1`, `t3Id2`)\n'
		+ ');\n',
		'CREATE UNIQUE INDEX `t1UniIdx` ON `t1` (`t1UniIdx`);',
		'CREATE INDEX `t1Idx` ON `t1` (`t1Idx`);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('nothing changed in schema', async (t) => {
	const users = sqliteTable('users', {
		id: integer('id').primaryKey().notNull(),
		name: text('name').notNull(),
		email: text('email'),
		textJson: text('text_json', { mode: 'json' }),
		blobJon: blob('blob_json', { mode: 'json' }),
		blobBigInt: blob('blob_bigint', { mode: 'bigint' }),
		numeric: numeric('numeric'),
		createdAt: integer('created_at', { mode: 'timestamp' }),
		createdAtMs: integer('created_at_ms', { mode: 'timestamp_ms' }),
		real: real('real'),
		text: text('text', { length: 255 }),
		role: text('role', { enum: ['admin', 'user'] }).default('user'),
		isConfirmed: integer('is_confirmed', {
			mode: 'boolean',
		}),
	});

	const schema1 = {
		users,
		customers: sqliteTable('customers', {
			id: integer('id').primaryKey(),
			address: text('address').notNull(),
			isConfirmed: integer('is_confirmed', { mode: 'boolean' }),
			registrationDate: integer('registration_date', { mode: 'timestamp_ms' })
				.notNull()
				.$defaultFn(() => new Date()),
			userId: integer('user_id')
				.references(() => users.id)
				.notNull(),
		}),

		posts: sqliteTable('posts', {
			id: integer('id').primaryKey(),
			content: text('content'),
			authorId: integer('author_id'),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema1, []);
	await push({ db, to: schema1 });
	const { sqlStatements: pst, hints: phints } = await push({ db, to: schema1 });

	expect(st).toStrictEqual([]);
	expect(pst).toStrictEqual([]);
	expect(phints).toStrictEqual([]);
});

test('create table with custom name references', async (t) => {
	const users = sqliteTable('users', {
		id: int('id').primaryKey({ autoIncrement: true }),
		name: text('name').notNull(),
	});

	const schema1 = {
		users,
		posts: sqliteTable('posts', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
			userId: int('user_id'),
		}, (t) => [foreignKey({
			columns: [t.id],
			foreignColumns: [users.id],
			name: 'custom_name_fk',
		})]),
	};

	const schema2 = {
		users,
		posts: sqliteTable('posts', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
			userId: int('user_id'),
		}, (t) => [foreignKey({
			columns: [t.id],
			foreignColumns: [users.id],
			name: 'custom_name_fk',
		})]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst, hints: phints } = await push({ db, to: schema2 });

	expect(st).toStrictEqual([]);
	expect(pst).toStrictEqual([]);
	expect(phints).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/3047
test('create table with custom type column', async (t) => {
	const f32Blob = customType<{
		data: number[];
		config: {
			length: number;
		};
		configRequired: true;
	}>({
		dataType(conf: { length: number }) {
			return `F32_BLOB(${conf.length})`;
		},
		fromDriver(value: Buffer) {
			const fArr = new Float32Array(new Uint8Array(value).buffer);
			return Array.from(fArr);
		},

		toDriver(value: number[]) {
			return Buffer.from(new Float32Array(value).buffer);
		},
	});
	const schema = {
		table1: sqliteTable('table1', {
			id: text('id').primaryKey(),
			blob: f32Blob('blob', {
				length: 10,
			}),
		}),
	};

	const { next: n1 } = await diff({}, schema, []);
	await push({ db, to: schema });

	const { sqlStatements: st2 } = await diff(n1, schema, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema });
	expect(st2).toStrictEqual([]);
	expect(pst2).toStrictEqual([]);
});

test('rename table and change data type', async (t) => {
	const schema1 = {
		users: sqliteTable('old_users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			age: text('age'),
		}),
	};

	const schema2 = {
		users: sqliteTable('new_users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			age: integer('age'),
		}),
	};

	const renames = ['old_users->new_users'];
	const { sqlStatements: st } = await diff(schema1, schema2, renames);

	await push({ db, to: schema1 });
	const { sqlStatements: pst, hints: phints } = await push({ db, to: schema2, renames });

	const st0: string[] = [
		'ALTER TABLE `old_users` RENAME TO `new_users`;',
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_new_users` (\n'
		+ '\t`id` integer PRIMARY KEY AUTOINCREMENT,\n'
		+ '\t`age` integer\n'
		+ ');\n',
		'INSERT INTO `__new_new_users`(`id`, `age`) SELECT `id`, `age` FROM `new_users`;',
		'DROP TABLE `new_users`;',
		'ALTER TABLE `__new_new_users` RENAME TO `new_users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);

	expect(phints).toStrictEqual([]);
});

test('recreate table with nested references', async (t) => {
	let users = sqliteTable('users', {
		id: int('id').primaryKey({ autoIncrement: true }),
		name: text('name'),
		age: integer('age'),
	});
	let subscriptions = sqliteTable('subscriptions', {
		id: int('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id').references(() => users.id),
		customerId: text('customer_id'),
	});
	const schema1 = {
		users: users,
		subscriptions: subscriptions,
		subscriptionMetadata: sqliteTable('subscriptions_metadata', {
			id: int('id').primaryKey({ autoIncrement: true }),
			subscriptionId: text('subscription_id').references(
				() => subscriptions.id,
			),
		}),
	};

	users = sqliteTable('users', {
		id: int('id').primaryKey({ autoIncrement: false }),
		name: text('name'),
		age: integer('age'),
	});
	const schema2 = {
		users: users,
		subscriptions: subscriptions,
		subscriptionMetadata: sqliteTable('subscriptions_metadata', {
			id: int('id').primaryKey({ autoIncrement: true }),
			subscriptionId: text('subscription_id').references(
				() => subscriptions.id,
			),
		}),
	};

	const renames = ['users.name->users.age'];
	const { sqlStatements: st } = await diff(schema1, schema2, renames);

	await push({ db, to: schema1 });
	const { sqlStatements: pst, hints: phints } = await push({ db, to: schema2, renames });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		`CREATE TABLE \`__new_users\` (
\t\`id\` integer PRIMARY KEY,
\t\`name\` text,
\t\`age\` integer
);\n`,
		`INSERT INTO \`__new_users\`(\`id\`, \`name\`, \`age\`) SELECT \`id\`, \`name\`, \`age\` FROM \`users\`;`,
		`DROP TABLE \`users\`;`,
		`ALTER TABLE \`__new_users\` RENAME TO \`users\`;`,
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
	expect(phints).toStrictEqual([]);
});

test('recreate table with added column not null and without default with data', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
			age: integer('age'),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: false }),
			name: text('name'),
			age: integer('age'),
			newColumn: text('new_column').notNull(),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	await db.run(`INSERT INTO \`users\` ("name", "age") VALUES ('drizzle', 12)`);
	await db.run(`INSERT INTO \`users\` ("name", "age") VALUES ('turso', 12)`);

	const { sqlStatements: pst, hints: phints, error } = await push({
		db,
		to: schema2,
		expectError: true,
		force: true,
	});

	const st0: string[] = [
		'ALTER TABLE `users` ADD `new_column` text NOT NULL;',
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_users` (\n'
		+ '\t`id` integer PRIMARY KEY,\n'
		+ '\t`name` text,\n'
		+ '\t`age` integer,\n'
		+ '\t`new_column` text NOT NULL\n'
		+ ');\n',
		'INSERT INTO `__new_users`(`id`, `name`, `age`) SELECT `id`, `name`, `age` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);

	expect(phints[0].statement).toStrictEqual('DELETE FROM "users" where true;');
	expect(error).toBeNull();
});

test('rename table with composite primary key', async () => {
	const productsCategoriesTable = (tableName: string) => {
		return sqliteTable(tableName, {
			productId: text('product_id').notNull(),
			categoryId: text('category_id').notNull(),
		}, (t) => [primaryKey({
			columns: [t.productId, t.categoryId],
		})]);
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
	const { sqlStatements: pst, hints: phints } = await push({ db, to: schema2, renames });

	const st0: string[] = [
		'ALTER TABLE `products_categories` RENAME TO `products_to_categories`;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);

	expect(phints).toStrictEqual([]);
});

test('push after migrate with custom migrations table #1', async () => {
	const migrationsConfig = {
		table: undefined,
	};

	const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
	const { drizzle } = await import('drizzle-orm/better-sqlite3');

	migrate(drizzle({ client }), {
		migrationsTable: migrationsConfig.table,
		migrationsFolder: './tests/sqlite/migrations',
	});

	const to = {
		table: sqliteTable('table1', { col1: integer() }),
	};

	const { sqlStatements: st2 } = await diff({}, to, []);
	const { sqlStatements: pst2 } = await push({ db, to, migrationsConfig });
	const expectedSt2 = [
		'CREATE TABLE `table1` (\n\t`col1` integer\n);\n',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

// https://github.com/drizzle-team/drizzle-orm/issues/5083
test('push after migrate with custom migrations table #2', async () => {
	const migrationsConfig = {
		table: 'migrations',
	};

	const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
	const { drizzle } = await import('drizzle-orm/better-sqlite3');

	migrate(drizzle({ client }), {
		migrationsTable: migrationsConfig.table,
		migrationsFolder: './tests/sqlite/migrations',
	});

	const to = {
		table: sqliteTable('table1', { col1: integer() }),
	};

	const { sqlStatements: st2 } = await diff({}, to, []);
	const { sqlStatements: pst2 } = await push({ db, to, migrationsConfig });
	const expectedSt2 = [
		'CREATE TABLE `table1` (\n\t`col1` integer\n);\n',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});
