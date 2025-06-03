import { SQL, sql } from 'drizzle-orm';
import {
	cockroachdbSchema,
	cockroachdbTable,
	cockroachdbTableCreator,
	foreignKey,
	geometry,
	index,
	int4,
	primaryKey,
	text,
	unique,
	uniqueIndex,
	vector,
} from 'drizzle-orm/cockroachdb-core';
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
		users: cockroachdbTable('users', {}),
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
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'CREATE TABLE "users" (\n\t"id" int4 PRIMARY KEY\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #3', async () => {
	const to = {
		users: cockroachdbTable('users', {
			id: int4('id'),
		}, (t) => [primaryKey({ name: 'users_pk', columns: [t.id] })]),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'CREATE TABLE "users" (\n'
		+ '\t"id" int4 NOT NULL,\n'
		+ '\tCONSTRAINT "users_pk" PRIMARY KEY("id")\n'
		+ ');\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #4', async () => {
	const to = {
		users: cockroachdbTable('users', { id: int4() }),
		posts: cockroachdbTable('posts', { id: int4() }),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'CREATE TABLE "users" (\n\t"id" int4\n);\n',
		'CREATE TABLE "posts" (\n\t"id" int4\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #5', async () => {
	const schema = cockroachdbSchema('folder');
	const from = {
		schema,
	};

	const to = {
		schema,
		users: schema.table('users', {
			id: int4(),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'CREATE TABLE "folder"."users" (\n\t"id" int4\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #6', async () => {
	const from = {
		users1: cockroachdbTable('users1', { id: int4() }),
	};

	const to = {
		users2: cockroachdbTable('users2', { id: int4() }),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'CREATE TABLE "users2" (\n\t"id" int4\n);\n',
		'DROP TABLE "users1";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #7', async () => {
	const from = {
		users1: cockroachdbTable('users1', { id: int4() }),
	};

	const to = {
		users: cockroachdbTable('users', { id: int4() }),
		users2: cockroachdbTable('users2', { id: int4() }),
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
		'CREATE TABLE "users" (\n\t"id" int4\n);\n',
		'ALTER TABLE "users1" RENAME TO "users2";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #8: geometry types', async () => {
	const to = {
		users: cockroachdbTable('users', {
			geom: geometry('geom', { type: 'point' }).notNull(),
			geom1: geometry('geom1').notNull(),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		`CREATE TABLE "users" (\n\t"geom" geometry(point) NOT NULL,\n\t"geom1" geometry(point) NOT NULL\n);\n`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

/* unique inline */
test('add table #9', async () => {
	const to = {
		users: cockroachdbTable('users', {
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
		+ '\t"name" text,\n'
		+ '\tCONSTRAINT "users_name_key" UNIQUE("name")\n'
		+ ');\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

/* unique inline named */
test('add table #10', async () => {
	const from = {};
	const to = {
		users: cockroachdbTable('users', {
			name: text().unique('name_unique'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`CREATE TABLE "users" (\n\t"name" text,\n\tCONSTRAINT "name_unique" UNIQUE("name")\n);\n`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #11', async () => {
	const from = {};
	const to = {
		users: cockroachdbTable('users', {
			name: text().unique('name_unique'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`CREATE TABLE "users" (\n\t"name" text,\n\tCONSTRAINT "name_unique" UNIQUE("name")\n);\n`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #12', async () => {
	const from = {};
	const to = {
		users: cockroachdbTable('users', {
			name: text().unique('users_name_key'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`CREATE TABLE "users" (\n\t"name" text,\n\tCONSTRAINT "users_name_key" UNIQUE("name")\n);\n`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

/* unique default-named */
test('add table #13', async () => {
	const to = {
		users: cockroachdbTable('users', {
			name: text(),
		}, (t) => [unique('users_name_key').on(t.name)]),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`CREATE TABLE "users" (\n\t"name" text,\n\tCONSTRAINT "users_name_key" UNIQUE("name")\n);\n`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #14', async () => {
	const from = {};
	const to = {
		users: cockroachdbTable('users', {
			name: text(),
		}, (t) => [unique('users_name_key').on(t.name)]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`CREATE TABLE "users" (\n\t"name" text,\n\tCONSTRAINT "users_name_key" UNIQUE("name")\n);\n`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

/* unique */
test('add table #15', async () => {
	const from = {};
	const to = {
		users: cockroachdbTable('users', {
			name: text(),
		}, (t) => [unique('name_unique').on(t.name)]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		`CREATE TABLE "users" (\n\t"name" text,\n\tCONSTRAINT "name_unique" UNIQUE("name")\n);\n`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('multiproject schema add table #1', async () => {
	const table = cockroachdbTableCreator((name) => `prefix_${name}`);

	const to = {
		users: table('users', {
			id: int4('id').primaryKey(),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'CREATE TABLE "prefix_users" (\n\t"id" int4 PRIMARY KEY\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('multiproject schema drop table #1', async () => {
	const table = cockroachdbTableCreator((name) => `prefix_${name}`);

	const from = {
		users: table('users', {
			id: int4('id').primaryKey(),
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
	const table = cockroachdbTableCreator((name) => `prefix_${name}`);

	const from = {
		users: table('users', {
			id: int4('id').primaryKey(),
		}),
	};
	const to = {
		users1: table('users1', {
			id: int4('id').primaryKey(),
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

test('add table #8: column with vector', async () => {
	const to = {
		users2: cockroachdbTable('users2', {
			id: int4('id').primaryKey(),
			name: vector('name', { dimensions: 3 }),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`CREATE TABLE "users2" (\n\t"id" int4 PRIMARY KEY,\n\t"name" vector(3)\n);\n`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add schema + table #1', async () => {
	const schema = cockroachdbSchema('folder');

	const to = {
		schema,
		users: schema.table('users', {
			id: int4(),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		'CREATE SCHEMA "folder";\n',
		'CREATE TABLE "folder"."users" (\n\t"id" int4\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('change schema with tables #1', async () => {
	const schema = cockroachdbSchema('folder');
	const schema2 = cockroachdbSchema('folder2');
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
	const schema = cockroachdbSchema('folder');
	const from = {
		schema,
		users: cockroachdbTable('users', {}),
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
	const schema = cockroachdbSchema('folder');
	const from = {
		schema,
		users: schema.table('users', {}),
	};
	const to = {
		schema,
		users: cockroachdbTable('users', {}),
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
	const schema1 = cockroachdbSchema('folder1');
	const schema2 = cockroachdbSchema('folder2');
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
	const schema1 = cockroachdbSchema('folder1');
	const schema2 = cockroachdbSchema('folder2');
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
	const schema1 = cockroachdbSchema('folder1');
	const schema2 = cockroachdbSchema('folder2');
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
	const schema1 = cockroachdbSchema('folder1');
	const schema2 = cockroachdbSchema('folder2');
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
	const schema1 = cockroachdbSchema('folder1');
	const schema2 = cockroachdbSchema('folder2');
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
	const schema1 = cockroachdbSchema('folder1');
	const schema2 = cockroachdbSchema('folder2');
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

// TODO Need to know about using and op classes to finish this
test.todo('create table with tsvector', async () => {
	const from = {};
	const to = {
		users: cockroachdbTable('posts', {
			id: int4('id').primaryKey(),
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
		'CREATE TABLE "posts" (\n\t"id" int4 PRIMARY KEY,\n\t"title" text NOT NULL,\n\t"description" text NOT NULL\n);\n',
		`CREATE INDEX "title_search_index" ON "posts" USING gin (to_tsvector('english', "title"));`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('composite primary key', async () => {
	const from = {};
	const to = {
		table: cockroachdbTable('works_to_creators', {
			workId: int4('work_id').notNull(),
			creatorId: int4('creator_id').notNull(),
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
		'CREATE TABLE "works_to_creators" (\n\t"work_id" int4 NOT NULL,\n\t"creator_id" int4 NOT NULL,\n\t"classification" text NOT NULL,\n\tCONSTRAINT "works_to_creators_pkey" PRIMARY KEY("work_id","creator_id","classification")\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add column before creating unique constraint', async () => {
	const from = {
		table: cockroachdbTable('table', {
			id: int4('id').primaryKey(),
		}),
	};
	const to = {
		table: cockroachdbTable('table', {
			id: int4('id').primaryKey(),
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
		'CREATE UNIQUE INDEX "uq" ON "table" ("name");',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter composite primary key', async () => {
	const from = {
		table: cockroachdbTable('table', {
			col1: int4('col1').notNull(),
			col2: int4('col2').notNull(),
			col3: text('col3').notNull(),
		}, (t) => [
			primaryKey({
				name: 'table_pk',
				columns: [t.col1, t.col2],
			}),
		]),
	};
	const to = {
		table: cockroachdbTable('table', {
			col1: int4('col1').notNull(),
			col2: int4('col2').notNull(),
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
		'ALTER TABLE "table" DROP CONSTRAINT "table_pk", ADD CONSTRAINT "table_pk" PRIMARY KEY("col2","col3");',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// TODO Need to know about op
test.todo('add index with op', async () => {
	const from = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
			name: text('name').notNull(),
		}),
	};
	const to = {
		users: cockroachdbTable('users', {
			id: int4('id').primaryKey(),
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

	const t1 = cockroachdbTable(
		't1',
		{
			t1Id1: int4().notNull().primaryKey(),
			t1Col2: int4().notNull(),
			t1Col3: int4().notNull(),
			t2Ref: int4().notNull().references(() => t2.t2Id),
			t1Uni: int4().notNull(),
			t1UniIdx: int4().notNull(),
			t1Idx: int4().notNull(),
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

	const t2 = cockroachdbTable(
		't2',
		{
			t2Id: int4().primaryKey(),
		},
	);

	const t3 = cockroachdbTable(
		't3',
		{
			t3Id1: int4(),
			t3Id2: int4(),
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
	"t1_id1" int4 PRIMARY KEY,
	"t1_col2" int4 NOT NULL,
	"t1_col3" int4 NOT NULL,
	"t2_ref" int4 NOT NULL,
	"t1_uni" int4 NOT NULL,
	"t1_uni_idx" int4 NOT NULL,
	"t1_idx" int4 NOT NULL,
	CONSTRAINT "t1_uni" UNIQUE("t1_uni"),
	CONSTRAINT "t1_uni_idx" UNIQUE("t1_uni_idx")
);
`;

	const st2 = `CREATE TABLE "t2" (
	"t2_id" int4 PRIMARY KEY
);
`;

	const st3 = `CREATE TABLE "t3" (
	"t3_id1" int4 NOT NULL,
	"t3_id2" int4 NOT NULL,
	CONSTRAINT "t3_pkey" PRIMARY KEY("t3_id1","t3_id2")
);
`;

	const st4 =
		`ALTER TABLE "t1" ADD CONSTRAINT "t1_t2_ref_t2_t2_id_fkey" FOREIGN KEY ("t2_ref") REFERENCES "t2"("t2_id");`;
	const st5 =
		`ALTER TABLE "t1" ADD CONSTRAINT "t1_t1_col2_t1_col3_t3_t3_id1_t3_id2_fkey" FOREIGN KEY ("t1_col2","t1_col3") REFERENCES "t3"("t3_id1","t3_id2");`;

	const st6 = `CREATE INDEX "t1_idx" ON "t1" ("t1_idx") WHERE "t1"."t1_idx" > 0;`;

	const st0 = [st1, st2, st3, st4, st5, st6];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('optional db aliases (camel case)', async () => {
	const from = {};

	const t1 = cockroachdbTable('t1', {
		t1_id1: int4().notNull().primaryKey(),
		t1_col2: int4().notNull(),
		t1_col3: int4().notNull(),
		t2_ref: int4().notNull().references(() => t2.t2_id),
		t1_uni: int4().notNull(),
		t1_uni_idx: int4().notNull(),
		t1_idx: int4().notNull(),
	}, (table) => [
		unique('t1Uni').on(table.t1_uni),
		uniqueIndex('t1UniIdx').on(table.t1_uni_idx),
		index('t1Idx').on(table.t1_idx).where(sql`${table.t1_idx} > 0`),
		foreignKey({
			columns: [table.t1_col2, table.t1_col3],
			foreignColumns: [t3.t3_id1, t3.t3_id2],
		}),
	]);

	const t2 = cockroachdbTable('t2', {
		t2_id: int4().primaryKey(),
	});

	const t3 = cockroachdbTable('t3', {
		t3_id1: int4(),
		t3_id2: int4(),
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
	"t1Id1" int4 PRIMARY KEY,
	"t1Col2" int4 NOT NULL,
	"t1Col3" int4 NOT NULL,
	"t2Ref" int4 NOT NULL,
	"t1Uni" int4 NOT NULL,
	"t1UniIdx" int4 NOT NULL,
	"t1Idx" int4 NOT NULL,
	CONSTRAINT "t1Uni" UNIQUE("t1Uni"),
	CONSTRAINT "t1UniIdx" UNIQUE("t1UniIdx")
);
`;

	const st2 = `CREATE TABLE "t2" (
	"t2Id" int4 PRIMARY KEY
);
`;

	const st3 = `CREATE TABLE "t3" (
	"t3Id1" int4 NOT NULL,
	"t3Id2" int4 NOT NULL,
	CONSTRAINT "t3_pkey" PRIMARY KEY("t3Id1","t3Id2")
);
`;

	const st4 = `ALTER TABLE "t1" ADD CONSTRAINT "t1_t2Ref_t2_t2Id_fkey" FOREIGN KEY ("t2Ref") REFERENCES "t2"("t2Id");`;
	const st5 =
		`ALTER TABLE "t1" ADD CONSTRAINT "t1_t1Col2_t1Col3_t3_t3Id1_t3Id2_fkey" FOREIGN KEY ("t1Col2","t1Col3") REFERENCES "t3"("t3Id1","t3Id2");`;

	const st6 = `CREATE INDEX "t1Idx" ON "t1" ("t1Idx") WHERE "t1"."t1Idx" > 0;`;

	const st0 = [st1, st2, st3, st4, st5, st6];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create table with generated column', async () => {
	const schema1 = {};
	const schema2 = {
		users: cockroachdbTable('users', {
			id: int4('id'),
			id2: int4('id2'),
			name: text('name'),
			generatedName: text('gen_name').generatedAlwaysAs((): SQL => sql`${schema2.users.name} || 'hello'`),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		'CREATE TABLE "users" (\n\t"id" int4,\n\t"id2" int4,\n\t"name" text,\n\t"gen_name" text GENERATED ALWAYS AS ("users"."name" || \'hello\') STORED\n);\n',
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename table with composite primary key', async () => {
	const schema1 = {
		table: cockroachdbTable('table1', {
			productId: text('product_id').notNull(),
			categoryId: text('category_id').notNull(),
		}, (t) => [primaryKey({ columns: [t.productId, t.categoryId] })]),
	};
	const schema2 = {
		test: cockroachdbTable('table2', {
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
