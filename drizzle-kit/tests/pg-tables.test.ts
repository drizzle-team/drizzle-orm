import { sql } from 'drizzle-orm';
import {
	AnyPgColumn,
	geometry,
	geometryMultiLineString,
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

test('add table #9: geometry multilinestring types', async () => {
	const from = {};

	const to = {
		users: pgTable('users', {
			multiLineStringWithoutSRID: geometryMultiLineString('multilinestring_without_srid').notNull(),
			multiLineStringWithSRID: geometryMultiLineString('multilinestring_with_srid', { srid: 4326 }).notNull(),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);

	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE IF NOT EXISTS "users" (\n\t"multilinestring_without_srid" geometry(multilinestring) NOT NULL,\n\t"multilinestring_with_srid" geometry(multilinestring,4326) NOT NULL\n);\n`,
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
