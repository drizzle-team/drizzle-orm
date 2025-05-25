import { SQL, sql } from 'drizzle-orm';
import {
	foreignKey,
	geometry,
	index,
	integer,
	pgSchema,
	pgTable,
	pgTableCreator,
	primaryKey,
	serial,
	text,
	unique,
	uniqueIndex,
	vector,
} from 'drizzle-orm/pg-core';
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
		users: pgTable('users', {}),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'CREATE TABLE "users" (\n\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #2', async () => {
	const to = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'CREATE TABLE "users" (\n\t"id" serial PRIMARY KEY\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #3', async () => {
	const to = {
		users: pgTable('users', {
			id: serial('id'),
		}, (t) => [primaryKey({ name: 'users_pk', columns: [t.id] })]),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'CREATE TABLE "users" (\n'
		+ '\t"id" serial NOT NULL,\n'
		+ '\tCONSTRAINT "users_pk" PRIMARY KEY("id")\n'
		+ ');\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #4', async () => {
	const to = {
		users: pgTable('users', { id: integer() }),
		posts: pgTable('posts', { id: integer() }),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'CREATE TABLE "users" (\n\t"id" integer\n);\n',
		'CREATE TABLE "posts" (\n\t"id" integer\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #5', async () => {
	const schema = pgSchema('folder');
	const from = {
		schema,
	};

	const to = {
		schema,
		users: schema.table('users', {
			id: integer(),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'CREATE TABLE "folder"."users" (\n\t"id" integer\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #6', async () => {
	const from = {
		users1: pgTable('users1', { id: integer() }),
	};

	const to = {
		users2: pgTable('users2', { id: integer() }),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'CREATE TABLE "users2" (\n\t"id" integer\n);\n',
		'DROP TABLE "users1";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #7', async () => {
	const from = {
		users1: pgTable('users1', { id: integer() }),
	};

	const to = {
		users: pgTable('users', { id: integer() }),
		users2: pgTable('users2', { id: integer() }),
	};

	const renames = ['public.users1->public.users2'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames,
	});

	const st0 = [
		'CREATE TABLE "users" (\n\t"id" integer\n);\n',
		'ALTER TABLE "users1" RENAME TO "users2";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #8: geometry types', async () => {
	const to = {
		users: pgTable('users', {
			geom: geometry('geom', { type: 'point' }).notNull(),
			geom1: geometry('geom1').notNull(),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	// TODO: for now pglite does not support postgis extension, revise later https://github.com/electric-sql/pglite/issues/11
	// const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		`CREATE TABLE "users" (\n\t"geom" geometry(point) NOT NULL,\n\t"geom1" geometry(point) NOT NULL\n);\n`,
	];
	expect(st).toStrictEqual(st0);
	// expect(pst).toStrictEqual(st0);
});

/* unique inline */
test('add table #9', async () => {
	const to = {
		users: pgTable('users', {
			name: text().unique(),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'CREATE TABLE "users" (\n'
		+ '\t"name" text UNIQUE\n'
		+ ');\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

/* unique inline named */
test('add table #10', async () => {
	const from = {};
	const to = {
		users: pgTable('users', {
			name: text().unique('name_unique'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`CREATE TABLE "users" (\n\t"name" text CONSTRAINT "name_unique" UNIQUE\n);\n`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

/* unique inline named nulls not distinct */
test('add table #11', async () => {
	const from = {};
	const to = {
		users: pgTable('users', {
			name: text().unique('name_unique', { nulls: 'not distinct' }),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`CREATE TABLE "users" (\n\t"name" text CONSTRAINT "name_unique" UNIQUE NULLS NOT DISTINCT\n);\n`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

/* unique inline default-named nulls not distinct */
test('add table #12', async () => {
	const from = {};
	const to = {
		users: pgTable('users', {
			name: text().unique('users_name_key', { nulls: 'not distinct' }),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`CREATE TABLE "users" (\n\t"name" text CONSTRAINT "users_name_key" UNIQUE NULLS NOT DISTINCT\n);\n`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

/* unique default-named */
test('add table #13', async () => {
	const to = {
		users: pgTable('users', {
			name: text(),
		}, (t) => [unique('users_name_key').on(t.name)]),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`CREATE TABLE "users" (\n\t"name" text CONSTRAINT "users_name_key" UNIQUE\n);\n`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

/* unique default-named nulls not distinct */
test('add table #14', async () => {
	const from = {};
	const to = {
		users: pgTable('users', {
			name: text(),
		}, (t) => [unique('users_name_key').on(t.name).nullsNotDistinct()]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`CREATE TABLE "users" (\n\t"name" text CONSTRAINT "users_name_key" UNIQUE NULLS NOT DISTINCT\n);\n`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

/* unique */
test('add table #15', async () => {
	const from = {};
	const to = {
		users: pgTable('users', {
			name: text(),
		}, (t) => [unique('name_unique').on(t.name).nullsNotDistinct()]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		`CREATE TABLE "users" (\n\t"name" text CONSTRAINT "name_unique" UNIQUE NULLS NOT DISTINCT\n);\n`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('multiproject schema add table #1', async () => {
	const table = pgTableCreator((name) => `prefix_${name}`);

	const to = {
		users: table('users', {
			id: serial('id').primaryKey(),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'CREATE TABLE "prefix_users" (\n\t"id" serial PRIMARY KEY\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('multiproject schema drop table #1', async () => {
	const table = pgTableCreator((name) => `prefix_${name}`);

	const from = {
		users: table('users', {
			id: serial('id').primaryKey(),
		}),
	};

	const { sqlStatements: st } = await diff(from, {}, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to: {},
	});

	const st0 = [
		'DROP TABLE "prefix_users";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('multiproject schema alter table name #1', async () => {
	const table = pgTableCreator((name) => `prefix_${name}`);

	const from = {
		users: table('users', {
			id: serial('id').primaryKey(),
		}),
	};
	const to = {
		users1: table('users1', {
			id: serial('id').primaryKey(),
		}),
	};

	const renames = [
		'public.prefix_users->public.prefix_users1',
	];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames,
	});

	const st0 = [
		'ALTER TABLE "prefix_users" RENAME TO "prefix_users1";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #8: column with pgvector', async () => {
	const to = {
		users2: pgTable('users2', {
			id: serial('id').primaryKey(),
			name: vector('name', { dimensions: 3 }),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`CREATE TABLE "users2" (\n\t"id" serial PRIMARY KEY,\n\t"name" vector(3)\n);\n`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add schema + table #1', async () => {
	const schema = pgSchema('folder');

	const to = {
		schema,
		users: schema.table('users', {
			id: integer(),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'CREATE SCHEMA "folder";\n',
		'CREATE TABLE "folder"."users" (\n\t"id" integer\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('change schema with tables #1', async () => {
	const schema = pgSchema('folder');
	const schema2 = pgSchema('folder2');
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
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames,
	});

	const st0 = [
		'ALTER SCHEMA "folder" RENAME TO "folder2";\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('change table schema #1', async () => {
	const schema = pgSchema('folder');
	const from = {
		schema,
		users: pgTable('users', {}),
	};
	const to = {
		schema,
		users: schema.table('users', {}),
	};

	const renames = [
		'public.users->folder.users',
	];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames,
	});

	const st0 = [
		'ALTER TABLE "users" SET SCHEMA "folder";\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('change table schema #2', async () => {
	const schema = pgSchema('folder');
	const from = {
		schema,
		users: schema.table('users', {}),
	};
	const to = {
		schema,
		users: pgTable('users', {}),
	};

	const renames = [
		'folder.users->public.users',
	];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames,
	});

	const st0 = [
		'ALTER TABLE "folder"."users" SET SCHEMA "public";\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('change table schema #3', async () => {
	const schema1 = pgSchema('folder1');
	const schema2 = pgSchema('folder2');
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

	const renames = [
		'folder1.users->folder2.users',
	];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames,
	});

	const st0 = [
		'ALTER TABLE "folder1"."users" SET SCHEMA "folder2";\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('change table schema #4', async () => {
	const schema1 = pgSchema('folder1');
	const schema2 = pgSchema('folder2');
	const from = {
		schema1,
		users: schema1.table('users', {}),
	};
	const to = {
		schema1,
		schema2, // add schema
		users: schema2.table('users', {}), // move table
	};

	const renames = [
		'folder1.users->folder2.users',
	];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames,
	});

	const st0 = [
		'CREATE SCHEMA "folder2";\n',
		'ALTER TABLE "folder1"."users" SET SCHEMA "folder2";\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('change table schema #5', async () => {
	const schema1 = pgSchema('folder1');
	const schema2 = pgSchema('folder2');
	const from = {
		schema1, // remove schema
		users: schema1.table('users', {}),
	};
	const to = {
		schema2, // add schema
		users: schema2.table('users', {}), // move table
	};

	const renames = [
		'folder1.users->folder2.users',
	];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames,
	});

	const st0 = [
		'CREATE SCHEMA "folder2";\n',
		'ALTER TABLE "folder1"."users" SET SCHEMA "folder2";\n',
		'DROP SCHEMA "folder1";\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('change table schema #5', async () => {
	const schema1 = pgSchema('folder1');
	const schema2 = pgSchema('folder2');
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

	const renames = [
		'folder1.users->folder2.users2',
	];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0 = [
		'ALTER TABLE "folder1"."users" RENAME TO "users2";',
		'ALTER TABLE "folder1"."users2" SET SCHEMA "folder2";\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('change table schema #6', async () => {
	const schema1 = pgSchema('folder1');
	const schema2 = pgSchema('folder2');
	const from = {
		schema1,
		users: schema1.table('users', {}),
	};
	const to = {
		schema2, // rename schema
		users: schema2.table('users2', {}), // rename table
	};

	const renames = [
		'folder1->folder2',
		'folder2.users->folder2.users2',
	];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames,
	});

	const st0 = [
		'ALTER SCHEMA "folder1" RENAME TO "folder2";\n',
		'ALTER TABLE "folder2"."users" RENAME TO "users2";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop table + rename schema #1', async () => {
	const schema1 = pgSchema('folder1');
	const schema2 = pgSchema('folder2');
	const from = {
		schema1,
		users: schema1.table('users', {}),
	};
	const to = {
		schema2, // rename schema
		// drop table
	};

	const renames = ['folder1->folder2'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0 = [
		'ALTER SCHEMA "folder1" RENAME TO "folder2";\n',
		'DROP TABLE "folder2"."users";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create table with tsvector', async () => {
	const from = {};
	const to = {
		users: pgTable('posts', {
			id: serial('id').primaryKey(),
			title: text('title').notNull(),
			description: text('description').notNull(),
		}, (table) => [
			index('title_search_index').using('gin', sql`to_tsvector('english', ${table.title})`),
		]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'CREATE TABLE "posts" (\n\t"id" serial PRIMARY KEY,\n\t"title" text NOT NULL,\n\t"description" text NOT NULL\n);\n',
		`CREATE INDEX "title_search_index" ON "posts" USING gin (to_tsvector('english', "title"));`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('composite primary key', async () => {
	const from = {};
	const to = {
		table: pgTable('works_to_creators', {
			workId: integer('work_id').notNull(),
			creatorId: integer('creator_id').notNull(),
			classification: text('classification').notNull(),
		}, (t) => [
			primaryKey({ columns: [t.workId, t.creatorId, t.classification] }),
		]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'CREATE TABLE "works_to_creators" (\n\t"work_id" integer NOT NULL,\n\t"creator_id" integer NOT NULL,\n\t"classification" text NOT NULL,\n\tCONSTRAINT "works_to_creators_pkey" PRIMARY KEY("work_id","creator_id","classification")\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add column before creating unique constraint', async () => {
	const from = {
		table: pgTable('table', {
			id: serial('id').primaryKey(),
		}),
	};
	const to = {
		table: pgTable('table', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
		}, (t) => [unique('uq').on(t.name)]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'ALTER TABLE "table" ADD COLUMN "name" text NOT NULL;',
		'ALTER TABLE "table" ADD CONSTRAINT "uq" UNIQUE("name");',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter composite primary key', async () => {
	const from = {
		table: pgTable('table', {
			col1: integer('col1').notNull(),
			col2: integer('col2').notNull(),
			col3: text('col3').notNull(),
		}, (t) => [
			primaryKey({
				name: 'table_pk',
				columns: [t.col1, t.col2],
			}),
		]),
	};
	const to = {
		table: pgTable('table', {
			col1: integer('col1').notNull(),
			col2: integer('col2').notNull(),
			col3: text('col3').notNull(),
		}, (t) => [
			primaryKey({
				name: 'table_pk',
				columns: [t.col2, t.col3],
			}),
		]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'ALTER TABLE "table" DROP CONSTRAINT "table_pk";',
		'ALTER TABLE "table" ADD CONSTRAINT "table_pk" PRIMARY KEY("col2","col3");',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add index with op', async () => {
	const from = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
		}),
	};
	const to = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
		}, (t) => [index().using('gin', t.name.op('gin_trgm_ops'))]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		'CREATE INDEX "users_name_index" ON "users" USING gin ("name" gin_trgm_ops);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('optional db aliases (snake case)', async () => {
	const from = {};

	const t1 = pgTable(
		't1',
		{
			t1Id1: integer().notNull().primaryKey(),
			t1Col2: integer().notNull(),
			t1Col3: integer().notNull(),
			t2Ref: integer().notNull().references(() => t2.t2Id),
			t1Uni: integer().notNull(),
			t1UniIdx: integer().notNull(),
			t1Idx: integer().notNull(),
		},
		(table) => [
			unique('t1_uni').on(table.t1Uni),
			uniqueIndex('t1_uni_idx').on(table.t1UniIdx),
			index('t1_idx').on(table.t1Idx).where(sql`${table.t1Idx} > 0`),
			foreignKey({
				columns: [table.t1Col2, table.t1Col3],
				foreignColumns: [t3.t3Id1, t3.t3Id2],
			}),
		],
	);

	const t2 = pgTable(
		't2',
		{
			t2Id: serial().primaryKey(),
		},
	);

	const t3 = pgTable(
		't3',
		{
			t3Id1: integer(),
			t3Id2: integer(),
		},
		(table) => [primaryKey({ columns: [table.t3Id1, table.t3Id2] })],
	);

	const to = {
		t1,
		t2,
		t3,
	};

	const casing = 'snake_case';
	const { sqlStatements: st } = await diff(from, to, [], casing);

	const { sqlStatements: pst } = await push({
		db,
		to,
		casing,
	});

	const st1 = `CREATE TABLE "t1" (
	"t1_id1" integer PRIMARY KEY,
	"t1_col2" integer NOT NULL,
	"t1_col3" integer NOT NULL,
	"t2_ref" integer NOT NULL,
	"t1_uni" integer NOT NULL CONSTRAINT "t1_uni" UNIQUE,
	"t1_uni_idx" integer NOT NULL,
	"t1_idx" integer NOT NULL
);
`;

	const st2 = `CREATE TABLE "t2" (
	"t2_id" serial PRIMARY KEY
);
`;

	const st3 = `CREATE TABLE "t3" (
	"t3_id1" integer,
	"t3_id2" integer,
	CONSTRAINT "t3_pkey" PRIMARY KEY("t3_id1","t3_id2")
);
`;

	const st4 =
		`ALTER TABLE "t1" ADD CONSTRAINT "t1_t2_ref_t2_t2_id_fkey" FOREIGN KEY ("t2_ref") REFERENCES "t2"("t2_id");`;
	const st5 =
		`ALTER TABLE "t1" ADD CONSTRAINT "t1_t1_col2_t1_col3_t3_t3_id1_t3_id2_fkey" FOREIGN KEY ("t1_col2","t1_col3") REFERENCES "t3"("t3_id1","t3_id2");`;

	const st6 = `CREATE UNIQUE INDEX "t1_uni_idx" ON "t1" ("t1_uni_idx");`;

	const st7 = `CREATE INDEX "t1_idx" ON "t1" ("t1_idx") WHERE "t1"."t1_idx" > 0;`;

	const st0 = [st1, st2, st3, st4, st5, st6, st7];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('optional db aliases (camel case)', async () => {
	const from = {};

	const t1 = pgTable('t1', {
		t1_id1: integer().notNull().primaryKey(),
		t1_col2: integer().notNull(),
		t1_col3: integer().notNull(),
		t2_ref: integer().notNull().references(() => t2.t2_id),
		t1_uni: integer().notNull(),
		t1_uni_idx: integer().notNull(),
		t1_idx: integer().notNull(),
	}, (table) => [
		unique('t1Uni').on(table.t1_uni),
		uniqueIndex('t1UniIdx').on(table.t1_uni_idx),
		index('t1Idx').on(table.t1_idx).where(sql`${table.t1_idx} > 0`),
		foreignKey({
			columns: [table.t1_col2, table.t1_col3],
			foreignColumns: [t3.t3_id1, t3.t3_id2],
		}),
	]);

	const t2 = pgTable('t2', {
		t2_id: serial().primaryKey(),
	});

	const t3 = pgTable('t3', {
		t3_id1: integer(),
		t3_id2: integer(),
	}, (table) => [primaryKey({ columns: [table.t3_id1, table.t3_id2] })]);

	const to = {
		t1,
		t2,
		t3,
	};

	const casing = 'camelCase';
	const { sqlStatements: st } = await diff(from, to, [], casing);

	const { sqlStatements: pst } = await push({
		db,
		to,
		casing,
	});

	const st1 = `CREATE TABLE "t1" (
	"t1Id1" integer PRIMARY KEY,
	"t1Col2" integer NOT NULL,
	"t1Col3" integer NOT NULL,
	"t2Ref" integer NOT NULL,
	"t1Uni" integer NOT NULL CONSTRAINT "t1Uni" UNIQUE,
	"t1UniIdx" integer NOT NULL,
	"t1Idx" integer NOT NULL
);
`;

	const st2 = `CREATE TABLE "t2" (
	"t2Id" serial PRIMARY KEY
);
`;

	const st3 = `CREATE TABLE "t3" (
	"t3Id1" integer,
	"t3Id2" integer,
	CONSTRAINT "t3_pkey" PRIMARY KEY("t3Id1","t3Id2")
);
`;

	const st4 = `ALTER TABLE "t1" ADD CONSTRAINT "t1_t2Ref_t2_t2Id_fkey" FOREIGN KEY ("t2Ref") REFERENCES "t2"("t2Id");`;
	const st5 =
		`ALTER TABLE "t1" ADD CONSTRAINT "t1_t1Col2_t1Col3_t3_t3Id1_t3Id2_fkey" FOREIGN KEY ("t1Col2","t1Col3") REFERENCES "t3"("t3Id1","t3Id2");`;
	const st6 = `CREATE UNIQUE INDEX "t1UniIdx" ON "t1" ("t1UniIdx");`;
	const st7 = `CREATE INDEX "t1Idx" ON "t1" ("t1Idx") WHERE "t1"."t1Idx" > 0;`;

	const st0 = [st1, st2, st3, st4, st5, st6, st7];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create table with generated column', async () => {
	const schema1 = {};
	const schema2 = {
		users: pgTable('users', {
			id: integer('id'),
			id2: integer('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs((): SQL => sql`${schema2.users.name} || 'hello'`),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		'CREATE TABLE "users" (\n\t"id" integer,\n\t"id2" integer,\n\t"name" text,\n\t"gen_name" text GENERATED ALWAYS AS ("users"."name" || \'hello\') STORED\n);\n',
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename table with composite primary key', async () => {
	const schema1 = {
		table: pgTable('table1', {
			productId: text('product_id').notNull(),
			categoryId: text('category_id').notNull(),
		}, (t) => [primaryKey({ columns: [t.productId, t.categoryId] })]),
	};
	const schema2 = {
		test: pgTable('table2', {
			productId: text('product_id').notNull(),
			categoryId: text('category_id').notNull(),
		}, (t) => [primaryKey({ columns: [t.productId, t.categoryId] })]),
	};

	const renames = ['public.table1->public.table2'];
	const { sqlStatements: st } = await diff(schema1, schema2, renames);

	await push({ db, to: schema1 });
	const { sqlStatements: pst, losses } = await push({ db, to: schema2, renames });

	const st0: string[] = ['ALTER TABLE "table1" RENAME TO "table2";'];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
