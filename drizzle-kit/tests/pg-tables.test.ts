import { sql } from 'drizzle-orm';
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
import { expect, test } from 'vitest';
import { diffTestSchemas } from './mocks-postgres';

test('add table #1', async () => {
	const to = {
		users: pgTable('users', {}),
	};

	const { sqlStatements } = await diffTestSchemas({}, to, []);
	expect(sqlStatements).toStrictEqual(['CREATE TABLE IF NOT EXISTS "users" (\n\n);\n']);
});

test('add table #2', async () => {
	const to = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
		}),
	};

	const { sqlStatements } = await diffTestSchemas({}, to, []);
	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE IF NOT EXISTS "users" (\n\t"id" serial PRIMARY KEY\n);\n',
	]);
});

test('add table #3', async () => {
	const to = {
		users: pgTable('users', {
			id: serial('id'),
		}, (t) => [primaryKey({ name: 'users_pk', columns: [t.id] })]),
	};

	const { sqlStatements } = await diffTestSchemas({}, to, []);
	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE IF NOT EXISTS "users" (\n'
		+ '\t"id" serial NOT NULL,\n'
		+ '\tCONSTRAINT "users_pk" PRIMARY KEY("id")\n'
		+ ');\n',
	]);
});

test('add table #4', async () => {
	const to = {
		users: pgTable('users', { id: integer() }),
		posts: pgTable('posts', { id: integer() }),
	};

	const { sqlStatements } = await diffTestSchemas({}, to, []);
	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE IF NOT EXISTS "users" (\n\t"id" integer\n);\n',
		'CREATE TABLE IF NOT EXISTS "posts" (\n\t"id" integer\n);\n',
	]);
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

	const { sqlStatements } = await diffTestSchemas(from, to, []);
	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE IF NOT EXISTS "folder"."users" (\n\t"id" integer\n);\n',
	]);
});

test('add table #6', async () => {
	const from = {
		users1: pgTable('users1', { id: integer() }),
	};

	const to = {
		users2: pgTable('users2', { id: integer() }),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, []);
	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE IF NOT EXISTS "users2" (\n\t"id" integer\n);\n',
		'DROP TABLE "users1" CASCADE;',
	]);
});

test('add table #7', async () => {
	const from = {
		users1: pgTable('users1', { id: integer() }),
	};

	const to = {
		users: pgTable('users', { id: integer() }),
		users2: pgTable('users2', { id: integer() }),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, [
		'public.users1->public.users2',
	]);

	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE IF NOT EXISTS "users" (\n\t"id" integer\n);\n',
		'ALTER TABLE "users1" RENAME TO "users2";',
	]);
});

test('add table #8: geometry types', async () => {
	const to = {
		users: pgTable('users', {
			geom: geometry('geom', { type: 'point' }).notNull(),
			geom1: geometry('geom1').notNull(),
		}),
	};

	const { sqlStatements } = await diffTestSchemas({}, to, []);

	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE IF NOT EXISTS "users" (\n\t"geom" geometry(point) NOT NULL,\n\t"geom1" geometry(point) NOT NULL\n);\n`,
	]);
});

/* unique inline */
test('add table #9', async () => {
	const to = {
		users: pgTable('users', {
			name: text().unique(),
		}),
	};

	const { sqlStatements } = await diffTestSchemas({}, to, []);
	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE IF NOT EXISTS "users" (\n'
		+ '\t"name" text UNIQUE\n'
		+ ');\n',
	]);
});

/* unique inline named */
test('add table #10', async () => {
	const from = {};
	const to = {
		users: pgTable('users', {
			name: text().unique('name_unique'),
		}),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, []);
	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE IF NOT EXISTS "users" (\n\t"name" text UNIQUE("name_unique")\n);\n`,
	]);
});

/* unique inline named nulls not distinct */
test('add table #11', async () => {
	const from = {};
	const to = {
		users: pgTable('users', {
			name: text().unique('name_unique', { nulls: 'not distinct' }),
		}),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, []);
	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE IF NOT EXISTS "users" (\n\t"name" text UNIQUE("name_unique") NULLS NOT DISTINCT\n);\n`,
	]);
});

/* unique inline default-named nulls not distinct */
test('add table #12', async () => {
	const from = {};
	const to = {
		users: pgTable('users', {
			name: text().unique('users_name_key', { nulls: 'not distinct' }),
		}),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, []);
	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE IF NOT EXISTS "users" (\n\t"name" text UNIQUE("users_name_key") NULLS NOT DISTINCT\n);\n`,
	]);
});

/* unique default-named */
test('add table #13', async () => {
	const to = {
		users: pgTable('users', {
			name: text(),
		}, (t) => [unique('users_name_key').on(t.name)]),
	};

	const { sqlStatements } = await diffTestSchemas({}, to, []);
	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE IF NOT EXISTS "users" (\n\t"name" text,\n\tCONSTRAINT "users_name_key" UNIQUE("name")\n);\n`,
	]);
});

/* unique default-named nulls not distinct */
test('add table #14', async () => {
	const from = {};
	const to = {
		users: pgTable('users', {
			name: text(),
		}, (t) => [unique('users_name_key').on(t.name).nullsNotDistinct()]),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, []);
	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE IF NOT EXISTS "users" (\n\t"name" text,\n\tCONSTRAINT "users_name_key" UNIQUE NULLS NOT DISTINCT("name")\n);\n`,
	]);
});

/* unique */
test('add table #15', async () => {
	const from = {};
	const to = {
		users: pgTable('users', {
			name: text(),
		}, (t) => [unique('name_unique').on(t.name).nullsNotDistinct()]),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, []);
	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE IF NOT EXISTS "users" (\n\t"name" text,\n\tCONSTRAINT "name_unique" UNIQUE NULLS NOT DISTINCT("name")\n);\n`,
	]);
});

test('multiproject schema add table #1', async () => {
	const table = pgTableCreator((name) => `prefix_${name}`);

	const to = {
		users: table('users', {
			id: serial('id').primaryKey(),
		}),
	};

	const { sqlStatements } = await diffTestSchemas({}, to, []);
	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE IF NOT EXISTS "prefix_users" (\n\t"id" serial PRIMARY KEY\n);\n',
	]);
});

test('multiproject schema drop table #1', async () => {
	const table = pgTableCreator((name) => `prefix_${name}`);

	const from = {
		users: table('users', {
			id: serial('id').primaryKey(),
		}),
	};

	const { sqlStatements } = await diffTestSchemas(from, {}, []);
	expect(sqlStatements).toStrictEqual(['DROP TABLE "prefix_users" CASCADE;']);
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

	const { sqlStatements } = await diffTestSchemas(from, to, [
		'public.prefix_users->public.prefix_users1',
	]);
	expect(sqlStatements).toStrictEqual(['ALTER TABLE "prefix_users" RENAME TO "prefix_users1";']);
});

test('add table #8: column with pgvector', async () => {
	const to = {
		users2: pgTable('users2', {
			id: serial('id').primaryKey(),
			name: vector('name', { dimensions: 3 }),
		}),
	};

	const { sqlStatements } = await diffTestSchemas({}, to, []);
	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE IF NOT EXISTS "users2" (\n\t"id" serial PRIMARY KEY,\n\t"name" vector(3)\n);\n`,
	]);
});

test('add schema + table #1', async () => {
	const schema = pgSchema('folder');

	const to = {
		schema,
		users: schema.table('users', {
			id: integer(),
		}),
	};

	const { sqlStatements } = await diffTestSchemas({}, to, []);
	expect(sqlStatements).toStrictEqual([
		'CREATE SCHEMA "folder";\n',
		'CREATE TABLE IF NOT EXISTS "folder"."users" (\n\t"id" integer\n);\n',
	]);
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

	const { sqlStatements } = await diffTestSchemas(from, to, ['folder->folder2']);
	expect(sqlStatements).toStrictEqual(['ALTER SCHEMA "folder" RENAME TO "folder2";\n']);
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

	const { sqlStatements } = await diffTestSchemas(from, to, [
		'public.users->folder.users',
	]);
	expect(sqlStatements).toStrictEqual(['ALTER TABLE "users" SET SCHEMA "folder";\n']);
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

	const { sqlStatements } = await diffTestSchemas(from, to, [
		'folder.users->public.users',
	]);
	expect(sqlStatements).toStrictEqual(['ALTER TABLE "folder"."users" SET SCHEMA "public";\n']);
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

	const { sqlStatements } = await diffTestSchemas(from, to, [
		'folder1.users->folder2.users',
	]);
	expect(sqlStatements).toStrictEqual(['ALTER TABLE "folder1"."users" SET SCHEMA "folder2";\n']);
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

	const { sqlStatements } = await diffTestSchemas(from, to, [
		'folder1.users->folder2.users',
	]);
	expect(sqlStatements).toStrictEqual([
		'CREATE SCHEMA "folder2";\n',
		'ALTER TABLE "folder1"."users" SET SCHEMA "folder2";\n',
	]);
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

	const { sqlStatements } = await diffTestSchemas(from, to, [
		'folder1.users->folder2.users',
	]);
	expect(sqlStatements).toStrictEqual([
		'CREATE SCHEMA "folder2";\n',
		'ALTER TABLE "folder1"."users" SET SCHEMA "folder2";\n',
		'DROP SCHEMA "folder1";\n',
	]);
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

	const { sqlStatements } = await diffTestSchemas(from, to, [
		'folder1.users->folder2.users2',
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "folder1"."users" RENAME TO "folder1"."users2";',
		'ALTER TABLE "folder1"."users2" SET SCHEMA "folder2";\n',
	]);
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

	const { sqlStatements } = await diffTestSchemas(from, to, [
		'folder1->folder2',
		'folder2.users->folder2.users2',
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER SCHEMA "folder1" RENAME TO "folder2";\n',
		'ALTER TABLE "folder2"."users" RENAME TO "folder2"."users2";',
	]);
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

	const { sqlStatements } = await diffTestSchemas(from, to, ['folder1->folder2']);
	expect(sqlStatements).toStrictEqual([
		'ALTER SCHEMA "folder1" RENAME TO "folder2";\n',
		'DROP TABLE "folder2"."users" CASCADE;',
	]);
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

	const { sqlStatements } = await diffTestSchemas(from, to, []);
	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE IF NOT EXISTS "posts" (\n\t"id" serial PRIMARY KEY,\n\t"title" text NOT NULL,\n\t"description" text NOT NULL\n);\n',
		`CREATE INDEX IF NOT EXISTS "title_search_index" ON "posts" USING gin (to_tsvector('english', "title"));`,
	]);
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

	const { sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE IF NOT EXISTS "works_to_creators" (\n\t"work_id" integer NOT NULL,\n\t"creator_id" integer NOT NULL,\n\t"classification" text NOT NULL,\n\tCONSTRAINT "works_to_creators_work_id_creator_id_classification_pk" PRIMARY KEY("work_id","creator_id","classification")\n);\n',
	]);
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

	const { sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "table" ADD COLUMN "name" text NOT NULL;',
		'ALTER TABLE "table" ADD CONSTRAINT "uq" UNIQUE("name");',
	]);
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

	const { sqlStatements } = await diffTestSchemas(from, to, []);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "table" DROP CONSTRAINT "table_pk";',
		'ALTER TABLE "table" ADD CONSTRAINT "table_pk" PRIMARY KEY("col2","col3");',
	]);
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

	const { sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements).toStrictEqual([
		'CREATE INDEX IF NOT EXISTS "users_name_index" ON "users" USING gin ("name" gin_trgm_ops);',
	]);
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

	const { sqlStatements } = await diffTestSchemas(from, to, [], false, 'snake_case');

	const st1 = `CREATE TABLE IF NOT EXISTS "t1" (
	"t1_id1" integer PRIMARY KEY,
	"t1_col2" integer NOT NULL,
	"t1_col3" integer NOT NULL,
	"t2_ref" integer NOT NULL,
	"t1_uni" integer NOT NULL,
	"t1_uni_idx" integer NOT NULL,
	"t1_idx" integer NOT NULL,
	CONSTRAINT "t1_uni" UNIQUE("t1_uni")
);
`;

	const st2 = `CREATE TABLE IF NOT EXISTS "t2" (
	"t2_id" serial PRIMARY KEY
);
`;

	const st3 = `CREATE TABLE IF NOT EXISTS "t3" (
	"t3_id1" integer,
	"t3_id2" integer,
	CONSTRAINT "t3_t3_id1_t3_id2_pk" PRIMARY KEY("t3_id1","t3_id2")
);
`;

	const st4 =
		`ALTER TABLE "t1" ADD CONSTRAINT "t1_t2_ref_t2_t2_id_fk" FOREIGN KEY ("t2_ref") REFERENCES "t2"("t2_id");`;
	const st5 =
		`ALTER TABLE "t1" ADD CONSTRAINT "t1_t1_col2_t1_col3_t3_t3_id1_t3_id2_fk" FOREIGN KEY ("t1_col2","t1_col3") REFERENCES "t3"("t3_id1","t3_id2");`;

	const st6 = `CREATE UNIQUE INDEX IF NOT EXISTS "t1_uni_idx" ON "t1" USING btree ("t1_uni_idx");`;

	const st7 = `CREATE INDEX IF NOT EXISTS "t1_idx" ON "t1" USING btree ("t1_idx") WHERE "t1"."t1_idx" > 0;`;

	expect(sqlStatements).toStrictEqual([st1, st2, st3, st4, st5, st6, st7]);
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

	const { sqlStatements } = await diffTestSchemas(from, to, [], false, 'camelCase');

	const st1 = `CREATE TABLE IF NOT EXISTS "t1" (
	"t1Id1" integer PRIMARY KEY,
	"t1Col2" integer NOT NULL,
	"t1Col3" integer NOT NULL,
	"t2Ref" integer NOT NULL,
	"t1Uni" integer NOT NULL,
	"t1UniIdx" integer NOT NULL,
	"t1Idx" integer NOT NULL,
	CONSTRAINT "t1Uni" UNIQUE("t1Uni")
);
`;

	const st2 = `CREATE TABLE IF NOT EXISTS "t2" (
	"t2Id" serial PRIMARY KEY
);
`;

	const st3 = `CREATE TABLE IF NOT EXISTS "t3" (
	"t3Id1" integer,
	"t3Id2" integer,
	CONSTRAINT "t3_t3Id1_t3Id2_pk" PRIMARY KEY("t3Id1","t3Id2")
);
`;

	const st4 = `ALTER TABLE "t1" ADD CONSTRAINT "t1_t2Ref_t2_t2Id_fk" FOREIGN KEY ("t2Ref") REFERENCES "t2"("t2Id");`;
	const st5 =
		`ALTER TABLE "t1" ADD CONSTRAINT "t1_t1Col2_t1Col3_t3_t3Id1_t3Id2_fk" FOREIGN KEY ("t1Col2","t1Col3") REFERENCES "t3"("t3Id1","t3Id2");`;
	const st6 = `CREATE UNIQUE INDEX IF NOT EXISTS "t1UniIdx" ON "t1" USING btree ("t1UniIdx");`;
	const st7 = `CREATE INDEX IF NOT EXISTS "t1Idx" ON "t1" USING btree ("t1Idx") WHERE "t1"."t1Idx" > 0;`;

	expect(sqlStatements).toStrictEqual([st1, st2, st3, st4, st5, st6, st7]);
});
