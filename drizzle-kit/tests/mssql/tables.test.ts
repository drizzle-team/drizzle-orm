import { sql } from 'drizzle-orm';
import {
	foreignKey,
	index,
	int,
	mssqlSchema,
	mssqlTable,
	mssqlTableCreator,
	primaryKey,
	text,
	unique,
	uniqueIndex,
	varchar,
} from 'drizzle-orm/mssql-core';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diff, prepareTestDatabase, push, TestDatabase } from './mocks';

// @vitest-environment-options {"max-concurrency":1}
let _: TestDatabase;
let db: TestDatabase['db'];
let client: TestDatabase['client'];

beforeAll(async () => {
	_ = await prepareTestDatabase();
	db = _.db;
	client = _.client;
});

afterAll(async () => {
	await _.close();
});

beforeEach(async () => {
	await _.clear();
});

test('add table #1', async () => {
	const to = {
		users: mssqlTable('users', { id: int() }),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to: to });

	const st0 = ['CREATE TABLE [users] (\n\t[id] int\n);\n'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #2', async () => {
	const to = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to: to });

	const st0 = [
		'CREATE TABLE [users] (\n\t[id] int,\n\tCONSTRAINT [users_pkey] PRIMARY KEY([id])\n);\n',
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #3', async () => {
	const to = {
		users: mssqlTable('users', {
			id: int('id'),
		}, (t) => [primaryKey({ name: 'users_pk', columns: [t.id] })]),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to: to });

	const st0 = [
		'CREATE TABLE [users] (\n'
		+ '\t[id] int,\n'
		+ '\tCONSTRAINT [users_pk] PRIMARY KEY([id])\n'
		+ ');\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #4', async () => {
	const to = {
		users: mssqlTable('users', { id: int() }),
		posts: mssqlTable('posts', { id: int() }),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to: to });

	const st0 = [
		'CREATE TABLE [users] (\n\t[id] int\n);\n',
		'CREATE TABLE [posts] (\n\t[id] int\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #5', async () => {
	const schema = mssqlSchema('folder');
	const from = {
		schema,
	};

	const to = {
		schema,
		users: schema.table('users', {
			id: int(),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to });

	const st0 = [
		'CREATE TABLE [folder].[users] (\n\t[id] int\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #6', async () => {
	const from = {
		users1: mssqlTable('users1', { id: int() }),
	};

	const to = {
		users2: mssqlTable('users2', { id: int() }),
	};

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to });

	const st0 = [
		'CREATE TABLE [users2] (\n\t[id] int\n);\n',
		'DROP TABLE [users1];',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add table #7', async () => {
	const from = {
		users1: mssqlTable('users1', { id: int() }),
	};

	const to = {
		users: mssqlTable('users', { id: int() }),
		users2: mssqlTable('users2', { id: int() }),
	};

	const { sqlStatements: st } = await diff(from, to, [
		'dbo.users1->dbo.users2',
	]);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to, renames: ['dbo.users1->dbo.users2'] });

	const st0 = [
		'CREATE TABLE [users] (\n\t[id] int\n);\n',
		`EXEC sp_rename 'users1', [users2];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

/* unique inline */
test('add table #9', async () => {
	const to = {
		users: mssqlTable('users', {
			name: varchar().unique(),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to: to });

	expect(st).toStrictEqual([
		'CREATE TABLE [users] (\n'
		+ '\t[name] varchar,\n'
		+ '\tCONSTRAINT [users_name_key] UNIQUE([name])\n'
		+ ');\n',
	]);
	expect(pst).toStrictEqual([
		'CREATE TABLE [users] (\n'
		+ '\t[name] varchar,\n'
		+ '\tCONSTRAINT [users_name_key] UNIQUE([name])\n'
		+ ');\n',
	]);
});

/* unique inline named */
test('add table #10', async () => {
	const from = {};
	const to = {
		users: mssqlTable('users', {
			name: varchar().unique('name_unique'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);
	const { sqlStatements: pst } = await push({ db, to: to });

	expect(st).toStrictEqual([
		`CREATE TABLE [users] (\n\t[name] varchar,\n\tCONSTRAINT [name_unique] UNIQUE([name])\n);\n`,
	]);
	expect(pst).toStrictEqual([
		`CREATE TABLE [users] (\n\t[name] varchar,\n\tCONSTRAINT [name_unique] UNIQUE([name])\n);\n`,
	]);
});

/* unique default-named */
test('add table #13', async () => {
	const to = {
		users: mssqlTable('users', {
			name: varchar(),
		}, (t) => [unique('users_name_key').on(t.name)]),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to: to });

	expect(st).toStrictEqual([
		`CREATE TABLE [users] (\n\t[name] varchar,\n\tCONSTRAINT [users_name_key] UNIQUE([name])\n);\n`,
	]);
	expect(pst).toStrictEqual([
		`CREATE TABLE [users] (\n\t[name] varchar,\n\tCONSTRAINT [users_name_key] UNIQUE([name])\n);\n`,
	]);
});

// reference
test('add table #14', async () => {
	const company = mssqlTable('company', {
		id: int().primaryKey(),
		name: text(),
	});

	const to = {
		company,
		users: mssqlTable('users', {
			company_id: int().references(() => company.id),
			name: text(),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, [], 'snake_case');
	const { sqlStatements: pst } = await push({ db, to: to, casing: 'snake_case' });

	const st0 = [
		`CREATE TABLE [company] (
\t[id] int,
\t[name] text,
\tCONSTRAINT [company_pkey] PRIMARY KEY([id])
);\n`,
		`CREATE TABLE [users] (
\t[company_id] int,
\t[name] text
);\n`,
		`ALTER TABLE [users] ADD CONSTRAINT [users_company_id_company_id_fk] FOREIGN KEY ([company_id]) REFERENCES [company]([id]);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('multiproject schema add table #1', async () => {
	const table = mssqlTableCreator((name) => `prefix_${name}`);

	const to = {
		users: table('users', {
			id: int('id').primaryKey(),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to: to });

	expect(st).toStrictEqual([
		'CREATE TABLE [prefix_users] (\n\t[id] int,\n\tCONSTRAINT [prefix_users_pkey] PRIMARY KEY([id])\n);\n',
	]);
	expect(pst).toStrictEqual([
		'CREATE TABLE [prefix_users] (\n\t[id] int,\n\tCONSTRAINT [prefix_users_pkey] PRIMARY KEY([id])\n);\n',
	]);
});

test('multiproject schema drop table #1', async () => {
	const table = mssqlTableCreator((name) => `prefix_${name}`);

	const from = {
		users: table('users', {
			id: int('id').primaryKey(),
		}),
	};

	const { sqlStatements: st } = await diff(from, {}, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: {} });

	expect(st).toStrictEqual(['DROP TABLE [prefix_users];']);
	expect(pst).toStrictEqual(['DROP TABLE [prefix_users];']);
});

test('multiproject schema alter table name #1', async () => {
	const table = mssqlTableCreator((name) => `prefix_${name}`);

	const from = {
		users: table('users', {
			id: int('id').primaryKey(),
		}),
	};
	const to = {
		users1: table('users1', {
			id: int('id').primaryKey(),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, [
		'dbo.prefix_users->dbo.prefix_users1',
	]);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to, renames: ['dbo.prefix_users->dbo.prefix_users1'] });

	const st0 = [
		"EXEC sp_rename 'prefix_users', [prefix_users1];",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add schema + table #1', async () => {
	const schema = mssqlSchema('folder');

	const to = {
		schema,
		users: schema.table('users', {
			id: int(),
		}),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to: to });

	expect(st).toStrictEqual([
		'CREATE SCHEMA [folder];\n',
		'CREATE TABLE [folder].[users] (\n\t[id] int\n);\n',
	]);
	expect(pst).toStrictEqual([
		'CREATE SCHEMA [folder];\n',
		'CREATE TABLE [folder].[users] (\n\t[id] int\n);\n',
	]);
});

test('change schema with tables #1', async () => {
	const schema = mssqlSchema('folder');
	const schema2 = mssqlSchema('folder2');
	const from = {
		schema,
		users: schema.table('users', { id: int() }),
	};
	const to = {
		schema2,
		users: schema2.table('users', { id: int() }),
	};

	const { sqlStatements: st } = await diff(from, to, ['folder->folder2']);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to, renames: ['folder->folder2'], ignoreSubsequent: true });

	expect(st).toStrictEqual([`/**
 * ⚠️ Renaming schemas is not supported in SQL Server (MSSQL),
 * and therefore is not supported in Drizzle ORM at this time
 * 
 * SQL Server does not provide a built-in command to rename a schema directly.
 * Workarounds involve creating a new schema and migrating objects manually
 */`]);
	expect(pst).toStrictEqual([`/**
 * ⚠️ Renaming schemas is not supported in SQL Server (MSSQL),
 * and therefore is not supported in Drizzle ORM at this time
 * 
 * SQL Server does not provide a built-in command to rename a schema directly.
 * Workarounds involve creating a new schema and migrating objects manually
 */`]);
});

test('change table schema #1', async () => {
	const schema = mssqlSchema('folder');
	const from = {
		schema,
		users: mssqlTable('users', { id: int() }),
	};
	const to = {
		schema,
		users: schema.table('users', { id: int() }),
	};

	const { sqlStatements: st } = await diff(from, to, [
		'dbo.users->folder.users',
	]);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to, renames: ['dbo.users->folder.users'] });

	expect(st).toStrictEqual([`ALTER SCHEMA [folder] TRANSFER [dbo].[users];\n`]);
	expect(pst).toStrictEqual([`ALTER SCHEMA [folder] TRANSFER [dbo].[users];\n`]);
});

test('change table schema #2', async () => {
	const schema = mssqlSchema('folder');
	const from = {
		schema,
		users: schema.table('users', { id: int() }),
	};
	const to = {
		schema,
		users: mssqlTable('users', { id: int() }),
	};

	const { sqlStatements: st } = await diff(from, to, [
		'folder.users->dbo.users',
	]);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to, renames: ['folder.users->dbo.users'] });

	expect(st).toStrictEqual(['ALTER SCHEMA [dbo] TRANSFER [folder].[users];\n']);
	expect(pst).toStrictEqual(['ALTER SCHEMA [dbo] TRANSFER [folder].[users];\n']);
});

test('change table schema #3', async () => {
	const schema1 = mssqlSchema('folder1');
	const schema2 = mssqlSchema('folder2');
	const from = {
		schema1,
		schema2,
		users: schema1.table('users', { id: int() }),
	};
	const to = {
		schema1,
		schema2,
		users: schema2.table('users', { id: int() }),
	};

	const { sqlStatements: st } = await diff(from, to, [
		'folder1.users->folder2.users',
	]);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to, renames: ['folder1.users->folder2.users'] });

	expect(st).toStrictEqual(['ALTER SCHEMA [folder2] TRANSFER [folder1].[users];\n']);
	expect(pst).toStrictEqual(['ALTER SCHEMA [folder2] TRANSFER [folder1].[users];\n']);
});

test('change table schema #4', async () => {
	const schema1 = mssqlSchema('folder1');
	const schema2 = mssqlSchema('folder2');
	const from = {
		schema1,
		users: schema1.table('users', { id: int() }),
	};
	const to = {
		schema1,
		schema2, // add schema
		users: schema2.table('users', { id: int() }), // move table
	};

	const { sqlStatements: st } = await diff(from, to, [
		'folder1.users->folder2.users',
	]);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to, renames: ['folder1.users->folder2.users'] });

	expect(st).toStrictEqual([
		'CREATE SCHEMA [folder2];\n',
		'ALTER SCHEMA [folder2] TRANSFER [folder1].[users];\n',
	]);
	expect(pst).toStrictEqual([
		'CREATE SCHEMA [folder2];\n',
		'ALTER SCHEMA [folder2] TRANSFER [folder1].[users];\n',
	]);
});

test('change table schema #5', async () => {
	const schema1 = mssqlSchema('folder1');
	const schema2 = mssqlSchema('folder2');
	const from = {
		schema1, // remove schema
		users: schema1.table('users', { id: int() }),
	};
	const to = {
		schema2, // add schema
		users: schema2.table('users', { id: int() }), // move table
	};

	const { sqlStatements: st } = await diff(from, to, [
		'folder1.users->folder2.users',
	]);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to, renames: ['folder1.users->folder2.users'] });

	expect(st).toStrictEqual([
		'CREATE SCHEMA [folder2];\n',
		'ALTER SCHEMA [folder2] TRANSFER [folder1].[users];\n',
		'DROP SCHEMA [folder1];\n',
	]);
	expect(pst).toStrictEqual([
		'CREATE SCHEMA [folder2];\n',
		'ALTER SCHEMA [folder2] TRANSFER [folder1].[users];\n',
		'DROP SCHEMA [folder1];\n',
	]);
});

test('change table schema #6', async () => {
	const schema1 = mssqlSchema('folder1');
	const schema2 = mssqlSchema('folder2');
	const from = {
		schema1,
		schema2,
		users: schema1.table('users', { id: int() }),
	};
	const to = {
		schema1,
		schema2,
		users: schema2.table('users2', { id: int() }), // rename and move table
	};

	const { sqlStatements: st } = await diff(from, to, [
		'folder1.users->folder2.users2',
	]);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to, renames: ['folder1.users->folder2.users2'] });

	expect(st).toStrictEqual([
		`EXEC sp_rename 'folder1.users', [users2];`,
		`ALTER SCHEMA [folder2] TRANSFER [folder1].[users2];\n`,
	]);
	expect(pst).toStrictEqual([
		`EXEC sp_rename 'folder1.users', [users2];`,
		`ALTER SCHEMA [folder2] TRANSFER [folder1].[users2];\n`,
	]);
});

test('change table schema #7', async () => {
	const schema1 = mssqlSchema('folder1');
	const schema2 = mssqlSchema('folder2');
	const from = {
		schema1,
		users: schema1.table('users', { id: int() }),
	};
	const to = {
		schema2, // rename schema
		users: schema2.table('users2', { id: int() }), // rename table
	};

	const { sqlStatements: st } = await diff(from, to, [
		'folder1->folder2',
		'folder2.users->folder2.users2',
	]);
	await push({ db, to: from });

	expect(st).toStrictEqual([
		`/**
 * ⚠️ Renaming schemas is not supported in SQL Server (MSSQL),
 * and therefore is not supported in Drizzle ORM at this time
 * 
 * SQL Server does not provide a built-in command to rename a schema directly.
 * Workarounds involve creating a new schema and migrating objects manually
 */`,
		`EXEC sp_rename 'folder2.users', [users2];`,
	]);
	await expect(push({
		db,
		to: to,
		renames: ['folder1->folder2', 'folder2.users->folder2.users2'],
	})).rejects.toThrowError(); // no folder2.users to rename
});

test('drop table + rename schema #1', async () => {
	const schema1 = mssqlSchema('folder1');
	const schema2 = mssqlSchema('folder2');
	const from = {
		schema1,
		users: schema1.table('users', { id: int() }),
	};
	const to = {
		schema2, // rename schema
		// drop table
	};

	const { sqlStatements: st } = await diff(from, to, ['folder1->folder2']);
	await push({ db, to: from });

	expect(st).toStrictEqual([
		`/**
 * ⚠️ Renaming schemas is not supported in SQL Server (MSSQL),
 * and therefore is not supported in Drizzle ORM at this time
 * 
 * SQL Server does not provide a built-in command to rename a schema directly.
 * Workarounds involve creating a new schema and migrating objects manually
 */`,
		`DROP TABLE [folder2].[users];`,
	]);
	await expect(push({
		db,
		to: to,
		renames: ['folder1->folder2', 'folder2.users->folder2.users2'],
	})).rejects.toThrowError(); // no folder2.users to drop
});

test('drop tables with fk constraint', async () => {
	const table1 = mssqlTable('table1', {
		column1: int().primaryKey(),
	});
	const table2 = mssqlTable('table2', {
		column1: int().primaryKey(),
		column2: int().references(() => table1.column1),
	});
	const schema1 = { table1, table2 };

	const { sqlStatements: st1, next: n1 } = await diff({}, schema1, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema1 });
	const expectedSt1 = [
		'CREATE TABLE [table1] (\n\t[column1] int,\n\tCONSTRAINT [table1_pkey] PRIMARY KEY([column1])\n);\n',
		'CREATE TABLE [table2] (\n\t[column1] int,\n\t[column2] int,\n\tCONSTRAINT [table2_pkey] PRIMARY KEY([column1])\n);\n',
		'ALTER TABLE [table2] ADD CONSTRAINT [table2_column2_table1_column1_fk] FOREIGN KEY ([column2]) REFERENCES [table1]([column1]);',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const { sqlStatements: st2 } = await diff(n1, {}, []);
	const { sqlStatements: pst2 } = await push({ db, to: {} });

	const expectedSt2 = [
		'ALTER TABLE [table2] DROP CONSTRAINT [table2_column2_table1_column1_fk];\n',
		'DROP TABLE [table1];',
		'DROP TABLE [table2];',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

test('composite primary key', async () => {
	const from = {};
	const to = {
		table: mssqlTable('works_to_creators', {
			workId: int('work_id').notNull(),
			creatorId: int('creator_id').notNull(),
			classification: varchar('classification').notNull(),
		}, (t) => [
			primaryKey({ columns: [t.workId, t.creatorId, t.classification] }),
		]),
	};

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to });

	const st0 = [
		'CREATE TABLE [works_to_creators] (\n\t[work_id] int,\n\t[creator_id] int,\n\t[classification] varchar,\n\tCONSTRAINT [works_to_creators_pkey] PRIMARY KEY([work_id],[creator_id],[classification])\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add column before creating unique constraint', async () => {
	const from = {
		table: mssqlTable('table', {
			id: int('id').primaryKey(),
		}),
	};
	const to = {
		table: mssqlTable('table', {
			id: int('id').primaryKey(),
			name: varchar('name', { length: 255 }).notNull(),
		}, (t) => [unique('uq').on(t.name)]),
	};

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to });

	expect(st).toStrictEqual([
		'ALTER TABLE [table] ADD [name] varchar(255) NOT NULL;',
		'ALTER TABLE [table] ADD CONSTRAINT [uq] UNIQUE([name]);',
	]);

	expect(pst).toStrictEqual([
		'ALTER TABLE [table] ADD [name] varchar(255) NOT NULL;',
		'ALTER TABLE [table] ADD CONSTRAINT [uq] UNIQUE([name]);',
	]);
});

test('alter composite primary key', async () => {
	const from = {
		table: mssqlTable('table', {
			col1: int('col1').notNull(),
			col2: int('col2').notNull(),
			col3: varchar('col3').notNull(),
		}, (t) => [
			primaryKey({
				name: 'table_pk',
				columns: [t.col1, t.col2],
			}),
		]),
	};
	const to = {
		table: mssqlTable('table', {
			col1: int('col1').notNull(),
			col2: int('col2').notNull(),
			col3: varchar('col3').notNull(),
		}, (t) => [
			primaryKey({
				name: 'table_pk',
				columns: [t.col2, t.col3],
			}),
		]),
	};

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to });

	expect(st).toStrictEqual([
		'ALTER TABLE [table] DROP CONSTRAINT [table_pk];',
		'ALTER TABLE [table] ADD CONSTRAINT [table_pk] PRIMARY KEY ([col2],[col3]);',
	]);
	expect(pst).toStrictEqual([
		'ALTER TABLE [table] DROP CONSTRAINT [table_pk];',
		'ALTER TABLE [table] ADD CONSTRAINT [table_pk] PRIMARY KEY ([col2],[col3]);',
	]);
});

test('add index', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			name: varchar('name', { length: 255 }).notNull(),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			name: varchar('name', { length: 255 }).notNull(),
		}, (t) => [index('some_index_name').on(t.name)]),
	};

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to });

	expect(st).toStrictEqual([
		'CREATE INDEX [some_index_name] ON [users] ([name]);',
	]);
	expect(pst).toStrictEqual([
		'CREATE INDEX [some_index_name] ON [users] ([name]);',
	]);
});

test('add unique index', async () => {
	const from = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			name: varchar('name', { length: 255 }).notNull(),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			name: varchar('name', { length: 255 }).notNull(),
		}, (t) => [uniqueIndex('some_index_name').on(t.name)]),
	};

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to: to });

	expect(st).toStrictEqual([
		'CREATE UNIQUE INDEX [some_index_name] ON [users] ([name]);',
	]);
	expect(pst).toStrictEqual([
		'CREATE UNIQUE INDEX [some_index_name] ON [users] ([name]);',
	]);
});

test('optional db aliases (snake case)', async () => {
	const from = {};

	const t1 = mssqlTable(
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
			index('t1_idx').on(table.t1Idx).where(sql`${table.t1Idx} > 0`),
			foreignKey({
				columns: [table.t1Col2, table.t1Col3],
				foreignColumns: [t3.t3Id1, t3.t3Id2],
			}),
		],
	);

	const t2 = mssqlTable(
		't2',
		{
			t2Id: int().primaryKey(),
		},
	);

	const t3 = mssqlTable(
		't3',
		{
			t3Id1: int(),
			t3Id2: int(),
		},
		(table) => [primaryKey({ columns: [table.t3Id1, table.t3Id2] })],
	);

	const to = {
		t1,
		t2,
		t3,
	};

	const { sqlStatements: st } = await diff(from, to, [], 'snake_case');
	await push({ db, to: from, casing: 'snake_case' });
	const { sqlStatements: pst } = await push({ db, to: to, casing: 'snake_case' });

	const st1 = `CREATE TABLE [t1] (
	[t1_id1] int,
	[t1_col2] int NOT NULL,
	[t1_col3] int NOT NULL,
	[t2_ref] int NOT NULL,
	[t1_uni] int NOT NULL,
	[t1_uni_idx] int NOT NULL,
	[t1_idx] int NOT NULL,
	CONSTRAINT [t1_pkey] PRIMARY KEY([t1_id1]),
	CONSTRAINT [t1_uni] UNIQUE([t1_uni])
);
`;

	const st2 = `CREATE TABLE [t2] (
	[t2_id] int,
	CONSTRAINT [t2_pkey] PRIMARY KEY([t2_id])
);
`;

	const st3 = `CREATE TABLE [t3] (
	[t3_id1] int,
	[t3_id2] int,
	CONSTRAINT [t3_pkey] PRIMARY KEY([t3_id1],[t3_id2])
);
`;

	const st4 =
		`ALTER TABLE [t1] ADD CONSTRAINT [t1_t2_ref_t2_t2_id_fk] FOREIGN KEY ([t2_ref]) REFERENCES [t2]([t2_id]);`;
	const st5 =
		`ALTER TABLE [t1] ADD CONSTRAINT [t1_t1_col2_t1_col3_t3_t3_id1_t3_id2_fk] FOREIGN KEY ([t1_col2],[t1_col3]) REFERENCES [t3]([t3_id1],[t3_id2]);`;

	const st6 = `CREATE UNIQUE INDEX [t1_uni_idx] ON [t1] ([t1_uni_idx]);`;

	const st7 = `CREATE INDEX [t1_idx] ON [t1] ([t1_idx]) WHERE [t1].[t1_idx] > 0;`;

	expect(st).toStrictEqual([st1, st2, st3, st4, st5, st6, st7]);
	expect(pst).toStrictEqual([st1, st2, st3, st4, st5, st6, st7]);
});

test('optional db aliases (camel case)', async () => {
	const from = {};

	const t1 = mssqlTable('t1', {
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
		index('t1Idx').on(table.t1_idx).where(sql`${table.t1_idx} > 0`),
		foreignKey({
			columns: [table.t1_col2, table.t1_col3],
			foreignColumns: [t3.t3_id1, t3.t3_id2],
		}),
	]);

	const t2 = mssqlTable('t2', {
		t2_id: int().primaryKey(),
	});

	const t3 = mssqlTable('t3', {
		t3_id1: int(),
		t3_id2: int(),
	}, (table) => [primaryKey({ columns: [table.t3_id1, table.t3_id2] })]);

	const to = {
		t1,
		t2,
		t3,
	};

	const { sqlStatements: st } = await diff(from, to, [], 'camelCase');
	await push({ db, to: from, casing: 'camelCase' });
	const { sqlStatements: pst } = await push({ db, to: to, casing: 'camelCase' });

	const st1 = `CREATE TABLE [t1] (
	[t1Id1] int,
	[t1Col2] int NOT NULL,
	[t1Col3] int NOT NULL,
	[t2Ref] int NOT NULL,
	[t1Uni] int NOT NULL,
	[t1UniIdx] int NOT NULL,
	[t1Idx] int NOT NULL,
	CONSTRAINT [t1_pkey] PRIMARY KEY([t1Id1]),
	CONSTRAINT [t1Uni] UNIQUE([t1Uni])
);
`;

	const st2 = `CREATE TABLE [t2] (
	[t2Id] int,
	CONSTRAINT [t2_pkey] PRIMARY KEY([t2Id])
);
`;

	const st3 = `CREATE TABLE [t3] (
	[t3Id1] int,
	[t3Id2] int,
	CONSTRAINT [t3_pkey] PRIMARY KEY([t3Id1],[t3Id2])
);
`;

	const st4 = `ALTER TABLE [t1] ADD CONSTRAINT [t1_t2Ref_t2_t2Id_fk] FOREIGN KEY ([t2Ref]) REFERENCES [t2]([t2Id]);`;
	const st5 =
		`ALTER TABLE [t1] ADD CONSTRAINT [t1_t1Col2_t1Col3_t3_t3Id1_t3Id2_fk] FOREIGN KEY ([t1Col2],[t1Col3]) REFERENCES [t3]([t3Id1],[t3Id2]);`;

	const st6 = `CREATE UNIQUE INDEX [t1UniIdx] ON [t1] ([t1UniIdx]);`;

	const st7 = `CREATE INDEX [t1Idx] ON [t1] ([t1Idx]) WHERE [t1].[t1Idx] > 0;`;

	expect(st).toStrictEqual([st1, st2, st3, st4, st5, st6, st7]);
	expect(pst).toStrictEqual([st1, st2, st3, st4, st5, st6, st7]);
});
