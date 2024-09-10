import { sql } from 'drizzle-orm';
import {
	AnyPgColumn,
	geometry,
	index,
	integer,
	pgEnum,
	pgSchema,
	pgSequence,
	pgTable,
	pgTableCreator,
	primaryKey,
	serial,
	text,
	unique,
	vector,
} from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import { diffTestSchemas } from './schemaDiffer';

test('add table #1', async () => {
	const to = {
		users: pgTable('users', {}),
	};

	const { statements } = await diffTestSchemas({}, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'create_table',
		tableName: 'users',
		schema: '',
		columns: [],
		compositePKs: [],
		uniqueConstraints: [],
		compositePkName: '',
	});
});

test('add table #2', async () => {
	const to = {
		users: pgTable('users', {
			id: serial('id').primaryKey(),
		}),
	};

	const { statements } = await diffTestSchemas({}, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'create_table',
		tableName: 'users',
		schema: '',
		columns: [
			{
				name: 'id',
				notNull: true,
				primaryKey: true,
				type: 'serial',
			},
		],
		compositePKs: [],
		uniqueConstraints: [],
		compositePkName: '',
	});
});

test('add table #3', async () => {
	const to = {
		users: pgTable(
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

	const { statements } = await diffTestSchemas({}, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'create_table',
		tableName: 'users',
		schema: '',
		columns: [
			{
				name: 'id',
				notNull: true,
				primaryKey: false,
				type: 'serial',
			},
		],
		compositePKs: ['id;users_pk'],
		uniqueConstraints: [],
		compositePkName: 'users_pk',
	});
});

test('add table #4', async () => {
	const to = {
		users: pgTable('users', {}),
		posts: pgTable('posts', {}),
	};

	const { statements } = await diffTestSchemas({}, to, []);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'create_table',
		tableName: 'users',
		schema: '',
		columns: [],
		compositePKs: [],
		uniqueConstraints: [],
		compositePkName: '',
	});
	expect(statements[1]).toStrictEqual({
		type: 'create_table',
		tableName: 'posts',
		schema: '',
		columns: [],
		compositePKs: [],
		uniqueConstraints: [],
		compositePkName: '',
	});
});

test('add table #5', async () => {
	const schema = pgSchema('folder');
	const from = {
		schema,
	};

	const to = {
		schema,
		users: schema.table('users', {}),
	};

	const { statements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'create_table',
		tableName: 'users',
		schema: 'folder',
		columns: [],
		compositePKs: [],
		uniqueConstraints: [],
		compositePkName: '',
	});
});

test('add table #6', async () => {
	const from = {
		users1: pgTable('users1', {}),
	};

	const to = {
		users2: pgTable('users2', {}),
	};

	const { statements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'create_table',
		tableName: 'users2',
		schema: '',
		columns: [],
		compositePKs: [],
		uniqueConstraints: [],
		compositePkName: '',
	});
	expect(statements[1]).toStrictEqual({
		type: 'drop_table',
		tableName: 'users1',
		schema: '',
	});
});

test('add table #7', async () => {
	const from = {
		users1: pgTable('users1', {}),
	};

	const to = {
		users: pgTable('users', {}),
		users2: pgTable('users2', {}),
	};

	const { statements } = await diffTestSchemas(from, to, [
		'public.users1->public.users2',
	]);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'create_table',
		tableName: 'users',
		schema: '',
		columns: [],
		compositePKs: [],
		uniqueConstraints: [],
		compositePkName: '',
	});
	expect(statements[1]).toStrictEqual({
		type: 'rename_table',
		tableNameFrom: 'users1',
		tableNameTo: 'users2',
		fromSchema: '',
		toSchema: '',
	});
});

test('add table #8: geometry types', async () => {
	const from = {};

	const to = {
		users: pgTable('users', {
			geom: geometry('geom', { type: 'point' }).notNull(),
			geom1: geometry('geom1').notNull(),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);

	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE IF NOT EXISTS "users" (\n\t"geom" geometry(point) NOT NULL,\n\t"geom1" geometry(point) NOT NULL\n);\n`,
	]);
});

test('multiproject schema add table #1', async () => {
	const table = pgTableCreator((name) => `prefix_${name}`);

	const to = {
		users: table('users', {
			id: serial('id').primaryKey(),
		}),
	};

	const { statements } = await diffTestSchemas({}, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'create_table',
		tableName: 'prefix_users',
		schema: '',
		columns: [
			{
				name: 'id',
				notNull: true,
				primaryKey: true,
				type: 'serial',
			},
		],
		compositePKs: [],
		compositePkName: '',
		uniqueConstraints: [],
	});
});

test('multiproject schema drop table #1', async () => {
	const table = pgTableCreator((name) => `prefix_${name}`);

	const from = {
		users: table('users', {
			id: serial('id').primaryKey(),
		}),
	};
	const to = {};

	const { statements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		schema: '',
		tableName: 'prefix_users',
		type: 'drop_table',
	});
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

	const { statements } = await diffTestSchemas(from, to, [
		'public.prefix_users->public.prefix_users1',
	]);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'rename_table',
		fromSchema: '',
		toSchema: '',
		tableNameFrom: 'prefix_users',
		tableNameTo: 'prefix_users1',
	});
});

test('add table #8: column with pgvector', async () => {
	const from = {};

	const to = {
		users2: pgTable('users2', {
			id: serial('id').primaryKey(),
			name: vector('name', { dimensions: 3 }),
		}),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements[0]).toBe(
		`CREATE TABLE IF NOT EXISTS "users2" (\n\t"id" serial PRIMARY KEY NOT NULL,\n\t"name" vector(3)\n);
`,
	);
});

test('add schema + table #1', async () => {
	const schema = pgSchema('folder');

	const to = {
		schema,
		users: schema.table('users', {}),
	};

	const { statements } = await diffTestSchemas({}, to, []);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'create_schema',
		name: 'folder',
	});

	expect(statements[1]).toStrictEqual({
		type: 'create_table',
		tableName: 'users',
		schema: 'folder',
		columns: [],
		compositePKs: [],
		uniqueConstraints: [],
		compositePkName: '',
	});
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

	const { statements } = await diffTestSchemas(from, to, ['folder->folder2']);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'rename_schema',
		from: 'folder',
		to: 'folder2',
	});
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

	const { statements } = await diffTestSchemas(from, to, [
		'public.users->folder.users',
	]);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_set_schema',
		tableName: 'users',
		schemaFrom: 'public',
		schemaTo: 'folder',
	});
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

	const { statements } = await diffTestSchemas(from, to, [
		'folder.users->public.users',
	]);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_set_schema',
		tableName: 'users',
		schemaFrom: 'folder',
		schemaTo: 'public',
	});
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

	const { statements } = await diffTestSchemas(from, to, [
		'folder1.users->folder2.users',
	]);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_set_schema',
		tableName: 'users',
		schemaFrom: 'folder1',
		schemaTo: 'folder2',
	});
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

	const { statements } = await diffTestSchemas(from, to, [
		'folder1.users->folder2.users',
	]);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'create_schema',
		name: 'folder2',
	});
	expect(statements[1]).toStrictEqual({
		type: 'alter_table_set_schema',
		tableName: 'users',
		schemaFrom: 'folder1',
		schemaTo: 'folder2',
	});
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

	const { statements } = await diffTestSchemas(from, to, [
		'folder1.users->folder2.users',
	]);

	expect(statements.length).toBe(3);
	expect(statements[0]).toStrictEqual({
		type: 'create_schema',
		name: 'folder2',
	});
	expect(statements[1]).toStrictEqual({
		type: 'alter_table_set_schema',
		tableName: 'users',
		schemaFrom: 'folder1',
		schemaTo: 'folder2',
	});
	expect(statements[2]).toStrictEqual({
		type: 'drop_schema',
		name: 'folder1',
	});
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

	const { statements } = await diffTestSchemas(from, to, [
		'folder1.users->folder2.users2',
	]);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_set_schema',
		tableName: 'users',
		schemaFrom: 'folder1',
		schemaTo: 'folder2',
	});
	expect(statements[1]).toStrictEqual({
		type: 'rename_table',
		tableNameFrom: 'users',
		tableNameTo: 'users2',
		fromSchema: 'folder2',
		toSchema: 'folder2',
	});
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

	const { statements } = await diffTestSchemas(from, to, [
		'folder1->folder2',
		'folder2.users->folder2.users2',
	]);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'rename_schema',
		from: 'folder1',
		to: 'folder2',
	});
	expect(statements[1]).toStrictEqual({
		type: 'rename_table',
		tableNameFrom: 'users',
		tableNameTo: 'users2',
		fromSchema: 'folder2',
		toSchema: 'folder2',
	});
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

	const { statements } = await diffTestSchemas(from, to, ['folder1->folder2']);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'rename_schema',
		from: 'folder1',
		to: 'folder2',
	});
	expect(statements[1]).toStrictEqual({
		type: 'drop_table',
		tableName: 'users',
		schema: 'folder2',
	});
});

test('create table with tsvector', async () => {
	const from = {};
	const to = {
		users: pgTable(
			'posts',
			{
				id: serial('id').primaryKey(),
				title: text('title').notNull(),
				description: text('description').notNull(),
			},
			(table) => ({
				titleSearchIndex: index('title_search_index').using(
					'gin',
					sql`to_tsvector('english', ${table.title})`,
				),
			}),
		),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE IF NOT EXISTS "posts" (\n\t"id" serial PRIMARY KEY NOT NULL,\n\t"title" text NOT NULL,\n\t"description" text NOT NULL\n);\n',
		`CREATE INDEX IF NOT EXISTS "title_search_index" ON "posts" USING gin (to_tsvector('english', "title"));`,
	]);
});

test('composite primary key', async () => {
	const from = {};
	const to = {
		table: pgTable('works_to_creators', {
			workId: integer('work_id').notNull(),
			creatorId: integer('creator_id').notNull(),
			classification: text('classification').notNull()
		}, (t) => ({
			pk: primaryKey({
				columns: [t.workId, t.creatorId, t.classification]
			}),
		})),
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
		})
	};
	const to = {
		table: pgTable('table', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
		}, (t) => ({
			uq: unique('uq').on(t.name),
		})),
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
			col3: text('col3').notNull()
		}, (t) => ({
			pk: primaryKey({
				name: 'table_pk',
				columns: [t.col1, t.col2]
			}),
		})),
	};
	const to = {
		table: pgTable('table', {
			col1: integer('col1').notNull(),
			col2: integer('col2').notNull(),
			col3: text('col3').notNull()
		}, (t) => ({
			pk: primaryKey({
				name: 'table_pk',
				columns: [t.col2, t.col3]
			}),
		})),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "table" DROP CONSTRAINT "table_pk";\n--> statement-breakpoint\nALTER TABLE "table" ADD CONSTRAINT "table_pk" PRIMARY KEY("col2","col3");',
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
		}, (t) => ({
			nameIdx: index().using('gin', t.name.op('gin_trgm_ops'))
		})),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, []);

	expect(sqlStatements).toStrictEqual([
		'CREATE INDEX IF NOT EXISTS "users_name_index" ON "users" USING gin ("name" gin_trgm_ops);',
	]);
});