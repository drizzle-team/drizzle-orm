import { sql } from 'drizzle-orm';
import { bit, check, int, mssqlSchema, mssqlTable, primaryKey, text, unique, varchar } from 'drizzle-orm/mssql-core';
import { defaultNameForPK } from 'src/dialects/mssql/grammar';
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

test('add columns #1', async (t) => {
	const schema1 = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
		}),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			name: text('name').notNull().default('hey'),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to: schema2, schemas: ['dbo'] });

	const st0 = [
		'ALTER TABLE [users] ADD [name] text NOT NULL;',
		`ALTER TABLE [users] ADD CONSTRAINT [users_name_default] DEFAULT 'hey' FOR [name];`,
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add columns #2', async (t) => {
	const schema1 = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
		}),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			name: text('name'),
			email: text('email'),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to: schema2, schemas: ['dbo'] });

	const st0 = [
		'ALTER TABLE [users] ADD [name] text;',
		'ALTER TABLE [users] ADD [email] text;',
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add columns #3', async (t) => {
	const schema1 = {
		users: mssqlTable('users', {
			id: int('id'),
		}),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id'),
			name: text('name').primaryKey(),
			email: text('email'),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to: schema2, schemas: ['dbo'] });

	const st0 = [
		'ALTER TABLE [users] ADD [name] text NOT NULL;',
		'ALTER TABLE [users] ADD [email] text;',
		'ALTER TABLE [users] ADD CONSTRAINT [users_pkey] PRIMARY KEY ([name]);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter column change name #1', async (t) => {
	const schema1 = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			name: text('name'),
		}),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			name: text('name1'),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, [
		'dbo.users.name->dbo.users.name1',
	]);

	expect(sqlStatements).toStrictEqual([`EXEC sp_rename 'users.name', [name1], 'COLUMN';`]);
});

test('alter column change name #2', async (t) => {
	const schema1 = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			name: text('name'),
		}),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			name: text('name1'),
			email: text('email'),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, [
		'dbo.users.name->dbo.users.name1',
	]);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'users.name', [name1], 'COLUMN';`,
		'ALTER TABLE [users] ADD [email] text;',
	]);
});

test('alter table add composite pk', async (t) => {
	const schema1 = {
		table: mssqlTable('table', {
			id1: int('id1'),
			id2: int('id2'),
		}),
	};

	const schema2 = {
		table: mssqlTable('table', {
			id1: int('id1'),
			id2: int('id2'),
		}, (t) => [primaryKey({ columns: [t.id1, t.id2] })]),
	};

	const { sqlStatements } = await diff(
		schema1,
		schema2,
		[],
	);

	expect(sqlStatements).toStrictEqual([`ALTER TABLE [table] ADD CONSTRAINT [table_pkey] PRIMARY KEY ([id1],[id2]);`]);
});

test('rename table rename column #1', async (t) => {
	const newSchema = mssqlSchema('new_schema');
	const schema1 = {
		newSchema,
		users: newSchema.table('users', {
			id: int('id'),
		}),
	};

	const schema2 = {
		newSchema,
		users: newSchema.table('users1', {
			id: int('id1'),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, [
		'new_schema.users->new_schema.users1',
		'new_schema.users1.id->new_schema.users1.id1',
	]);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'new_schema.users', [users1];`,
		`EXEC sp_rename 'new_schema.users1.id', [id1], 'COLUMN';`,
	]);
});

test('rename column #1', async (t) => {
	const newSchema = mssqlSchema('new_schema');
	const schema1 = {
		newSchema,
		users: newSchema.table('users', {
			id: int('id'),
		}),
	};

	const schema2 = {
		newSchema,
		users: newSchema.table('users', {
			id: int('id1'),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, [
		'new_schema.users.id->new_schema.users.id1',
	]);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'new_schema.users.id', [id1], 'COLUMN';`,
	]);
});

test('rename column #2. Part of unique constraint', async (t) => {
	const newSchema = mssqlSchema('new_schema');
	const schema1 = {
		newSchema,
		users: newSchema.table('users', {
			id: int('id').unique(),
		}),
	};

	const schema2 = {
		newSchema,
		users: newSchema.table('users', {
			id: int('id1').unique(),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, [
		'new_schema.users.id->new_schema.users.id1',
	]);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'new_schema.users.id', [id1], 'COLUMN';`,
	]);
});

test('rename column #3. Part of check constraint', async (t) => {
	const newSchema = mssqlSchema('new_schema');
	const schema1 = {
		newSchema,
		users: newSchema.table('users', {
			id: int('id'),
		}, (t) => [check('hey', sql`${t.id} != 2`)]),
	};

	const schema2 = {
		newSchema,
		users: newSchema.table('users', {
			id: int('id1'),
		}, (t) => [check('hey', sql`${t.id} != 2`)]),
	};

	const { sqlStatements } = await diff(schema1, schema2, [
		'new_schema.users.id->new_schema.users.id1',
	]);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE [new_schema].[users] DROP CONSTRAINT [hey];`,
		`EXEC sp_rename 'new_schema.users.id', [id1], 'COLUMN';`,
		`ALTER TABLE [new_schema].[users] ADD CONSTRAINT [hey] CHECK ([users].[id1] != 2);`,
	]);
});

test('drop column #1. Part of check constraint', async (t) => {
	const newSchema = mssqlSchema('new_schema');
	const schema1 = {
		newSchema,
		users: newSchema.table('users', {
			id: int('id'),
		}, (t) => [check('hey', sql`${t.id} != 2`)]),
	};

	const schema2 = {
		newSchema,
		users: newSchema.table('users', {}),
	};

	const { sqlStatements } = await diff(schema1, schema2, [
		'new_schema.users.id->new_schema.users.id1',
	]);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE [new_schema].[users] DROP CONSTRAINT [hey];`,
		`ALTER TABLE [new_schema].[users] DROP COLUMN [id];`,
	]);
});

test('with composite pks #1', async (t) => {
	const schema1 = {
		users: mssqlTable('users', {
			id1: int('id1'),
			id2: int('id2'),
		}, (t) => [primaryKey({ columns: [t.id1, t.id2], name: 'compositePK' })]),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id1: int('id1'),
			id2: int('id2'),
			text: text('text'),
		}, (t) => [primaryKey({ columns: [t.id1, t.id2], name: 'compositePK' })]),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(['ALTER TABLE [users] ADD [text] text;']);
});

test('add composite pks on existing table', async (t) => {
	const schema1 = {
		users: mssqlTable('users', {
			id1: int('id1'),
			id2: int('id2'),
		}),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id1: int('id1'),
			id2: int('id2'),
		}, (t) => [primaryKey({ columns: [t.id1, t.id2], name: 'compositePK' })]),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual(['ALTER TABLE [users] ADD CONSTRAINT [compositePK] PRIMARY KEY ([id1],[id2]);']);
});

test('rename column that is part of the pk. Name explicit', async (t) => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id1: int('id1'),
				id2: int('id2'),
			},
			(t) => [primaryKey({ columns: [t.id1, t.id2], name: 'compositePK' })],
		),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id1: int('id1'),
			id3: int('id3'),
		}, (t) => [primaryKey({ columns: [t.id1, t.id3], name: 'compositePK' })]),
	};

	const { sqlStatements } = await diff(schema1, schema2, [
		'dbo.users.id2->dbo.users.id3',
	]);

	expect(sqlStatements).toStrictEqual([`EXEC sp_rename 'users.id2', [id3], 'COLUMN';`]);
});

test('rename column and pk #2', async (t) => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id1: int('id1'),
				id2: int('id2'),
			},
			(t) => [primaryKey({ columns: [t.id1, t.id2], name: 'compositePK' })],
		),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id1: int('id1'),
			id3: int('id3'),
		}, (t) => [primaryKey({ columns: [t.id1, t.id3] })]),
	};

	const { sqlStatements } = await diff(schema1, schema2, [
		`dbo.users.id2->dbo.users.id3`,
		`dbo.users.compositePK->dbo.users.${defaultNameForPK('users')}`,
	]);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'users.id2', [id3], 'COLUMN';`,
		`EXEC sp_rename 'compositePK', [users_pkey], 'OBJECT';`,
	]);
});

test('rename table should not cause rename pk. Name is not explicit', async (t) => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id1: int('id1'),
				id2: int('id2'),
			},
			(t) => [primaryKey({ columns: [t.id1, t.id2] })],
		),
	};

	const schema2 = {
		users: mssqlTable('users2', {
			id1: int('id1'),
			id2: int('id2'),
		}, (t) => [primaryKey({ columns: [t.id1, t.id2] })]),
	};

	const { sqlStatements } = await diff(schema1, schema2, [
		`dbo.users->dbo.users2`,
	]);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'users', [users2];`,
	]);
});

test('rename table should not cause rename pk. Name explicit', async (t) => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id1: int('id1'),
				id2: int('id2'),
			},
			(t) => [primaryKey({ columns: [t.id1, t.id2], name: 'compositePk' })],
		),
	};

	const schema2 = {
		users: mssqlTable('users2', {
			id1: int('id1'),
			id2: int('id2'),
		}, (t) => [primaryKey({ columns: [t.id1, t.id2], name: 'compositePk' })]),
	};

	const { sqlStatements } = await diff(schema1, schema2, [
		`dbo.users->dbo.users2`,
	]);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'users', [users2];`,
	]);
});

test('move table to other schema + rename table. Should not cause rename pk. Name is not explicit', async (t) => {
	const mySchema = mssqlSchema('my_schema');
	const schema1 = {
		mySchema,
		users: mssqlTable(
			'users',
			{
				id1: int('id1'),
				id2: int('id2'),
			},
			(t) => [primaryKey({ columns: [t.id1, t.id2] })],
		),
	};

	const schema2 = {
		mySchema,
		users: mySchema.table('users2', {
			id1: int('id1'),
			id2: int('id2'),
		}, (t) => [primaryKey({ columns: [t.id1, t.id2] })]),
	};

	const { sqlStatements } = await diff(schema1, schema2, [
		`dbo.users->my_schema.users2`,
	]);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'users', [users2];`,
		`ALTER SCHEMA [my_schema] TRANSFER [dbo].[users2];\n`,
	]);
});

test('rename table should not cause rename fk. Name is not explicit. #1', async (t) => {
	const company = mssqlTable(
		'company',
		{
			id: int('id'),
		},
	);
	const schema1 = {
		company,
		users: mssqlTable(
			'users',
			{
				id: int('id'),
				companyId: int('company_id').references(() => company.id),
			},
		),
	};

	const renamedCompany = mssqlTable(
		'company2',
		{
			id: int('id'),
		},
	);
	const schema2 = {
		company: renamedCompany,
		users: mssqlTable(
			'users',
			{
				id: int('id'),
				companyId: int('company_id').references(() => renamedCompany.id),
			},
		),
	};

	const { sqlStatements: sqlStatements1 } = await diff(schema1, schema2, [
		`dbo.company->dbo.company2`,
	]);

	expect(sqlStatements1).toStrictEqual([
		`EXEC sp_rename 'company', [company2];`,
	]);

	const { sqlStatements: sqlStatements2 } = await diff(schema2, schema2, []);

	expect(sqlStatements2).toStrictEqual([]);
});

test('rename table should not cause rename fk. Name is not explicit. #2', async (t) => {
	const company = mssqlTable(
		'company',
		{
			id: int('id').references(() => users.id),
		},
	);
	const users = mssqlTable(
		'users',
		{
			id: int('id'),
		},
	);
	const schema1 = {
		company,
		users,
	};

	const renamedCompany = mssqlTable(
		'company2',
		{
			id: int('id').references(() => users.id),
		},
	);
	const schema2 = {
		company: renamedCompany,
		users,
	};

	const { sqlStatements } = await diff(schema1, schema2, [
		`dbo.company->dbo.company2`,
	]);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'company', [company2];`,
	]);
});

test('move table to other schema + rename table. Should not cause rename fk', async (t) => {
	const mySchema = mssqlSchema('my_schema');

	const company = mssqlTable(
		'company',
		{
			id: int('id').references(() => users.id),
		},
	);
	const users = mssqlTable(
		'users',
		{
			id: int('id'),
		},
	);
	const schema1 = {
		mySchema,
		company,
		users,
	};

	const renamedCompany = mySchema.table(
		'company2',
		{
			id: int('id').references(() => users.id),
		},
	);
	const schema2 = {
		mySchema,
		company: renamedCompany,
		users,
	};

	const { sqlStatements } = await diff(schema1, schema2, [
		`dbo.company->my_schema.company2`,
	]);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'company', [company2];`,
		`ALTER SCHEMA [my_schema] TRANSFER [dbo].[company2];\n`,
	]);
});

test('varchar and text default values escape single quotes', async () => {
	const schema1 = {
		table: mssqlTable('table', {
			id: int('id').primaryKey(),
		}),
	};

	const schema2 = {
		table: mssqlTable('table', {
			id: int('id').primaryKey(),
			text: text('text').default("escape's quotes"),
			varchar: varchar('varchar').default("escape's quotes"),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE [table] ADD [text] text;`,
		`ALTER TABLE [table] ADD [varchar] varchar;`,
		`ALTER TABLE [table] ADD CONSTRAINT [table_text_default] DEFAULT 'escape''s quotes' FOR [text];`,
		`ALTER TABLE [table] ADD CONSTRAINT [table_varchar_default] DEFAULT 'escape''s quotes' FOR [varchar];`,
	]);
});

test('add columns with defaults', async () => {
	const schema1 = {
		table: mssqlTable('table', {
			id: int().primaryKey(),
		}),
	};

	const schema2 = {
		table: mssqlTable('table', {
			id: int().primaryKey(),
			text1: text().default(''),
			text2: text().default('text'),
			int1: int().default(10),
			int2: int().default(0),
			int3: int().default(-10),
			bool1: bit().default(true),
			bool2: bit().default(false),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE [table] ADD [text1] text;',
		'ALTER TABLE [table] ADD [text2] text;',
		'ALTER TABLE [table] ADD [int1] int;',
		'ALTER TABLE [table] ADD [int2] int;',
		'ALTER TABLE [table] ADD [int3] int;',
		'ALTER TABLE [table] ADD [bool1] bit;',
		'ALTER TABLE [table] ADD [bool2] bit;',
		`ALTER TABLE [table] ADD CONSTRAINT [table_text1_default] DEFAULT '' FOR [text1];`,
		`ALTER TABLE [table] ADD CONSTRAINT [table_text2_default] DEFAULT 'text' FOR [text2];`,
		`ALTER TABLE [table] ADD CONSTRAINT [table_int1_default] DEFAULT 10 FOR [int1];`,
		`ALTER TABLE [table] ADD CONSTRAINT [table_int2_default] DEFAULT 0 FOR [int2];`,
		`ALTER TABLE [table] ADD CONSTRAINT [table_int3_default] DEFAULT -10 FOR [int3];`,
		`ALTER TABLE [table] ADD CONSTRAINT [table_bool1_default] DEFAULT 1 FOR [bool1];`,
		`ALTER TABLE [table] ADD CONSTRAINT [table_bool2_default] DEFAULT 0 FOR [bool2];`,
	]);
});

test('rename column should not cause rename unique. Name is not explicit', async (t) => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id1: int('id1'),
				id2: int('id2'),
			},
			(t) => [unique().on(t.id1)],
		),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id3: int('id3'), // renamed
			id2: int('id2'),
		}, (t) => [unique().on(t.id3)]),
	};

	const { sqlStatements } = await diff(schema1, schema2, [
		`dbo.users.id1->dbo.users.id3`,
	]);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'users.id1', [id3], 'COLUMN';`,
	]);
});

test('rename column should not cause rename default. Name is not explicit', async (t) => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id1: int('id1').default(1),
				id2: int('id2'),
			},
		),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id3: int('id3').default(1), // renamed
			id2: int('id2'),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, [
		`dbo.users.id1->dbo.users.id3`,
	]);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'users.id1', [id3], 'COLUMN';`,
	]);
});

test('rename column should not cause rename fk. Name is not explicit #1', async (t) => {
	const table = mssqlTable('table', {
		id: int(),
	});
	const schema1 = {
		table,
		users: mssqlTable(
			'users',
			{
				id1: int('id1').references(() => table.id),
				id2: int('id2'),
			},
		),
	};

	const schema2 = {
		table,
		users: mssqlTable('users', {
			id3: int('id3').references(() => table.id), // renamed
			id2: int('id2'),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, [
		`dbo.users.id1->dbo.users.id3`,
	]);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'users.id1', [id3], 'COLUMN';`,
	]);
});

test('rename column should not cause rename unique. Name is explicit #1', async (t) => {
	const table = mssqlTable('table', {
		id: int(),
	});
	const schema1 = {
		table,
		users: mssqlTable(
			'users',
			{
				id1: int('id1').unique('unique_name'),
				id2: int('id2'),
			},
		),
	};

	const schema2 = {
		table,
		users: mssqlTable('users', {
			id3: int('id3').unique('unique_name'), // renamed
			id2: int('id2'),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, [
		`dbo.users.id1->dbo.users.id3`,
	]);

	expect(sqlStatements).toStrictEqual([`EXEC sp_rename 'users.id1', [id3], 'COLUMN';`]);
});

test('drop identity from existing column #1. Part of default constraint', async (t) => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id: int('id').default(1).identity(),
			},
		),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id').default(1),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE [users] DROP CONSTRAINT [users_id_default];',
		`EXEC sp_rename 'users.id', [__old_id], 'COLUMN';`,
		`ALTER TABLE [users] ADD [id] int;`,
		`INSERT INTO [users] ([id]) SELECT [__old_id] FROM [users];`,
		`ALTER TABLE [users] DROP COLUMN [__old_id];`,
		'ALTER TABLE [users] ADD CONSTRAINT [users_id_default] DEFAULT 1 FOR [id];',
	]);
});

test('drop identity from existing column #2. Rename table. Part of default constraint', async (t) => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id: int('id').default(1).identity(),
			},
		),
	};

	const schema2 = {
		users: mssqlTable('users2', {
			id: int('id').default(1),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, ['dbo.users->dbo.users2']);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'users', [users2];`,
		'ALTER TABLE [users2] DROP CONSTRAINT [users_id_default];',
		`EXEC sp_rename 'users2.id', [__old_id], 'COLUMN';`,
		`ALTER TABLE [users2] ADD [id] int;`,
		`INSERT INTO [users2] ([id]) SELECT [__old_id] FROM [users2];`,
		`ALTER TABLE [users2] DROP COLUMN [__old_id];`,
		'ALTER TABLE [users2] ADD CONSTRAINT [users_id_default] DEFAULT 1 FOR [id];',
	]);
});

test('drop identity from existing column #3. Rename table + rename column. Part of default constraint', async (t) => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id: int('id').default(1).identity(),
			},
		),
	};

	const schema2 = {
		users: mssqlTable('users2', {
			id: int('id1').default(1),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, ['dbo.users->dbo.users2', 'dbo.users2.id->dbo.users2.id1']);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'users', [users2];`,
		`EXEC sp_rename 'users2.id', [id1], 'COLUMN';`,
		'ALTER TABLE [users2] DROP CONSTRAINT [users_id_default];',
		`EXEC sp_rename 'users2.id1', [__old_id1], 'COLUMN';`,
		`ALTER TABLE [users2] ADD [id1] int;`,
		`INSERT INTO [users2] ([id1]) SELECT [__old_id1] FROM [users2];`,
		`ALTER TABLE [users2] DROP COLUMN [__old_id1];`,
		'ALTER TABLE [users2] ADD CONSTRAINT [users_id_default] DEFAULT 1 FOR [id1];',
	]);
});

test('drop identity from existing column #4. Rename table + rename column. Add default', async (t) => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id: int('id').identity(),
			},
		),
	};

	const schema2 = {
		users: mssqlTable('users2', {
			id: int('id1').default(1),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, ['dbo.users->dbo.users2', 'dbo.users2.id->dbo.users2.id1']);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'users', [users2];`,
		`EXEC sp_rename 'users2.id', [id1], 'COLUMN';`,
		`EXEC sp_rename 'users2.id1', [__old_id1], 'COLUMN';`,
		`ALTER TABLE [users2] ADD [id1] int;`,
		`INSERT INTO [users2] ([id1]) SELECT [__old_id1] FROM [users2];`,
		`ALTER TABLE [users2] DROP COLUMN [__old_id1];`,
		'ALTER TABLE [users2] ADD CONSTRAINT [users2_id1_default] DEFAULT 1 FOR [id1];',
	]);
});

test('drop identity from existing column #5. Rename table + rename column. Drop default', async (t) => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id: int('id').default(1).identity(),
			},
		),
	};

	const schema2 = {
		users: mssqlTable('users2', {
			id: int('id1'),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, ['dbo.users->dbo.users2', 'dbo.users2.id->dbo.users2.id1']);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'users', [users2];`,
		`EXEC sp_rename 'users2.id', [id1], 'COLUMN';`,
		'ALTER TABLE [users2] DROP CONSTRAINT [users_id_default];',
		`EXEC sp_rename 'users2.id1', [__old_id1], 'COLUMN';`,
		`ALTER TABLE [users2] ADD [id1] int;`,
		`INSERT INTO [users2] ([id1]) SELECT [__old_id1] FROM [users2];`,
		`ALTER TABLE [users2] DROP COLUMN [__old_id1];`,
	]);
});

test('drop identity from existing column #6. Part of unique constraint', async (t) => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id: int('id').unique().identity(),
			},
		),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id').unique(),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE [users] DROP CONSTRAINT [users_id_key];',
		`EXEC sp_rename 'users.id', [__old_id], 'COLUMN';`,
		`ALTER TABLE [users] ADD [id] int;`,
		`INSERT INTO [users] ([id]) SELECT [__old_id] FROM [users];`,
		`ALTER TABLE [users] DROP COLUMN [__old_id];`,
		'ALTER TABLE [users] ADD CONSTRAINT [users_id_key] UNIQUE([id]);',
	]);
});

test('drop identity from existing column #7. Rename table. Part of unique constraint', async (t) => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id: int('id').unique().identity(),
			},
		),
	};

	const schema2 = {
		users: mssqlTable('users2', {
			id: int('id').unique(),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, [`dbo.users->dbo.users2`]);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'users', [users2];`,
		'ALTER TABLE [users2] DROP CONSTRAINT [users_id_key];',
		`EXEC sp_rename 'users2.id', [__old_id], 'COLUMN';`,
		`ALTER TABLE [users2] ADD [id] int;`,
		`INSERT INTO [users2] ([id]) SELECT [__old_id] FROM [users2];`,
		`ALTER TABLE [users2] DROP COLUMN [__old_id];`,
		'ALTER TABLE [users2] ADD CONSTRAINT [users_id_key] UNIQUE([id]);',
	]);
});

test('drop identity from existing column #8. Rename table + rename column. Part of unique constraint', async (t) => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id: int('id').unique().identity(),
			},
		),
	};

	const schema2 = {
		users: mssqlTable('users2', {
			id: int('id1').unique(),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, [`dbo.users->dbo.users2`, `dbo.users2.id->dbo.users2.id1`]);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'users', [users2];`,
		`EXEC sp_rename 'users2.id', [id1], 'COLUMN';`,
		'ALTER TABLE [users2] DROP CONSTRAINT [users_id_key];',
		`EXEC sp_rename 'users2.id1', [__old_id1], 'COLUMN';`,
		`ALTER TABLE [users2] ADD [id1] int;`,
		`INSERT INTO [users2] ([id1]) SELECT [__old_id1] FROM [users2];`,
		`ALTER TABLE [users2] DROP COLUMN [__old_id1];`,
		'ALTER TABLE [users2] ADD CONSTRAINT [users_id_key] UNIQUE([id1]);',
	]);
});

test('drop identity from existing column #9. Rename table + rename column. Add unique', async (t) => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id: int('id').identity(),
			},
		),
	};

	const schema2 = {
		users: mssqlTable('users2', {
			id: int('id1').unique(),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, [`dbo.users->dbo.users2`, `dbo.users2.id->dbo.users2.id1`]);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'users', [users2];`,
		`EXEC sp_rename 'users2.id', [id1], 'COLUMN';`,
		`EXEC sp_rename 'users2.id1', [__old_id1], 'COLUMN';`,
		`ALTER TABLE [users2] ADD [id1] int;`,
		`INSERT INTO [users2] ([id1]) SELECT [__old_id1] FROM [users2];`,
		`ALTER TABLE [users2] DROP COLUMN [__old_id1];`,
		'ALTER TABLE [users2] ADD CONSTRAINT [users2_id1_key] UNIQUE([id1]);',
	]);
});

test('drop identity from existing column #9. Rename table + rename column. Drop unique', async (t) => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id: int('id').unique().identity(),
			},
		),
	};

	const schema2 = {
		users: mssqlTable('users2', {
			id: int('id1'),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, [`dbo.users->dbo.users2`, `dbo.users2.id->dbo.users2.id1`]);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'users', [users2];`,
		`EXEC sp_rename 'users2.id', [id1], 'COLUMN';`,
		'ALTER TABLE [users2] DROP CONSTRAINT [users_id_key];',
		`EXEC sp_rename 'users2.id1', [__old_id1], 'COLUMN';`,
		`ALTER TABLE [users2] ADD [id1] int;`,
		`INSERT INTO [users2] ([id1]) SELECT [__old_id1] FROM [users2];`,
		`ALTER TABLE [users2] DROP COLUMN [__old_id1];`,
	]);
});

test('drop identity from existing column #10. Table has checks', async (t) => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id: int('id').identity(),
			},
			(t) => [check('hello_world', sql`${t.id} != 1`)],
		),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id'),
		}, (t) => [check('hello_world', sql`${t.id} != 1`)]),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE [users] DROP CONSTRAINT [hello_world];',
		`EXEC sp_rename 'users.id', [__old_id], 'COLUMN';`,
		`ALTER TABLE [users] ADD [id] int;`,
		`INSERT INTO [users] ([id]) SELECT [__old_id] FROM [users];`,
		`ALTER TABLE [users] DROP COLUMN [__old_id];`,
		'ALTER TABLE [users] ADD CONSTRAINT [hello_world] CHECK ([users].[id] != 1);',
	]);
});

// Still expect recreate here. We could not know if the column is in check definition
test('drop identity from existing column #11. Table has checks. Column is not in check', async (t) => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id: int('id').identity(),
				name: varchar(),
			},
			(t) => [check('hello_world', sql`${t.name} != 'Alex'`)],
		),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id'),
			name: varchar(),
		}, (t) => [check('hello_world', sql`${t.name} != 'Alex'`)]),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE [users] DROP CONSTRAINT [hello_world];',
		`EXEC sp_rename 'users.id', [__old_id], 'COLUMN';`,
		`ALTER TABLE [users] ADD [id] int;`,
		`INSERT INTO [users] ([id]) SELECT [__old_id] FROM [users];`,
		`ALTER TABLE [users] DROP COLUMN [__old_id];`,
		"ALTER TABLE [users] ADD CONSTRAINT [hello_world] CHECK ([users].[name] != 'Alex');",
	]);
});

test('drop identity from existing column #12. Rename table. Table has checks', async (t) => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id: int('id').identity(),
				name: varchar(),
			},
			(t) => [check('hello_world', sql`${t.name} != 'Alex'`)],
		),
	};

	const schema2 = {
		users: mssqlTable('users2', {
			id: int('id'),
			name: varchar(),
		}, (t) => [check('hello_world', sql`${t.name} != 'Alex'`)]),
	};

	const { sqlStatements } = await diff(schema1, schema2, [`dbo.users->dbo.users2`]);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'users', [users2];`,
		'ALTER TABLE [users2] DROP CONSTRAINT [hello_world];',
		`EXEC sp_rename 'users2.id', [__old_id], 'COLUMN';`,
		`ALTER TABLE [users2] ADD [id] int;`,
		`INSERT INTO [users2] ([id]) SELECT [__old_id] FROM [users2];`,
		`ALTER TABLE [users2] DROP COLUMN [__old_id];`,
		"ALTER TABLE [users2] ADD CONSTRAINT [hello_world] CHECK ([users2].[name] != 'Alex');",
	]);
});

test('rename table. Table has checks', async (t) => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id: int('id'),
				name: varchar(),
			},
			(t) => [check('hello_world', sql`${t.name} != 'Alex'`)],
		),
	};

	const schema2 = {
		users: mssqlTable('users2', {
			id: int('id'),
			name: varchar(),
		}, (t) => [check('hello_world', sql`${t.name} != 'Alex'`)]),
	};

	const { sqlStatements } = await diff(schema1, schema2, [`dbo.users->dbo.users2`]);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'users', [users2];`,
		`ALTER TABLE [users2] DROP CONSTRAINT [hello_world];`,
		`ALTER TABLE [users2] ADD CONSTRAINT [hello_world] CHECK ([users2].[name] != 'Alex');`,
	]);
});

test('drop identity from existing column #13. Rename table + Rename column. Add check', async (t) => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id: int('id').identity(),
				name: varchar(),
			},
		),
	};

	const schema2 = {
		users: mssqlTable('users2', {
			id: int('id1'),
			name: varchar(),
		}, (t) => [check('hello_world', sql`${t.name} != 'Alex'`)]),
	};

	const { sqlStatements } = await diff(schema1, schema2, [`dbo.users->dbo.users2`, `dbo.users2.id->dbo.users2.id1`]);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'users', [users2];`,
		`EXEC sp_rename 'users2.id', [id1], 'COLUMN';`,
		`EXEC sp_rename 'users2.id1', [__old_id1], 'COLUMN';`,
		`ALTER TABLE [users2] ADD [id1] int;`,
		`INSERT INTO [users2] ([id1]) SELECT [__old_id1] FROM [users2];`,
		`ALTER TABLE [users2] DROP COLUMN [__old_id1];`,
		"ALTER TABLE [users2] ADD CONSTRAINT [hello_world] CHECK ([users2].[name] != 'Alex');",
	]);
});

test('drop identity from existing column #14. Rename table + Rename column. Drop check', async (t) => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id: int('id').identity(),
				name: varchar(),
			},
			(t) => [check('hello_world', sql`${t.name} != 'Alex'`)],
		),
	};

	const schema2 = {
		users: mssqlTable('users2', {
			id: int('id1'),
			name: varchar(),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, [`dbo.users->dbo.users2`, `dbo.users2.id->dbo.users2.id1`]);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'users', [users2];`,
		`EXEC sp_rename 'users2.id', [id1], 'COLUMN';`,
		`ALTER TABLE [users2] DROP CONSTRAINT [hello_world];`,
		`EXEC sp_rename 'users2.id1', [__old_id1], 'COLUMN';`,
		`ALTER TABLE [users2] ADD [id1] int;`,
		`INSERT INTO [users2] ([id1]) SELECT [__old_id1] FROM [users2];`,
		`ALTER TABLE [users2] DROP COLUMN [__old_id1];`,
	]);
});

test('drop identity from existing column #15. Rename table + Rename column. Table has checks', async (t) => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id: int('id').identity(),
				name: varchar(),
			},
			(t) => [check('hello_world', sql`${t.name} != 'Alex'`)],
		),
	};

	const schema2 = {
		users: mssqlTable('users2', {
			id: int('id1'),
			name: varchar(),
		}, (t) => [check('hello_world', sql`${t.name} != 'Alex'`)]),
	};

	const { sqlStatements } = await diff(schema1, schema2, [`dbo.users->dbo.users2`, `dbo.users2.id->dbo.users2.id1`]);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'users', [users2];`,
		`EXEC sp_rename 'users2.id', [id1], 'COLUMN';`,
		`ALTER TABLE [users2] DROP CONSTRAINT [hello_world];`,
		`EXEC sp_rename 'users2.id1', [__old_id1], 'COLUMN';`,
		`ALTER TABLE [users2] ADD [id1] int;`,
		`INSERT INTO [users2] ([id1]) SELECT [__old_id1] FROM [users2];`,
		`ALTER TABLE [users2] DROP COLUMN [__old_id1];`,
		"ALTER TABLE [users2] ADD CONSTRAINT [hello_world] CHECK ([users2].[name] != 'Alex');",
	]);
});

test('drop identity from existing column #16. Part of fk', async (t) => {
	const users = mssqlTable(
		'users',
		{
			id: int('id').primaryKey().identity(),
		},
	);
	const schema1 = {
		ref: mssqlTable('ref', {
			age: int().unique().references(() => users.id),
		}),
		users,
	};

	const droppedIdentity = mssqlTable(
		'users',
		{
			id: int('id').primaryKey(),
		},
	);
	const schema2 = {
		ref: mssqlTable('ref', {
			age: int().unique().references(() => droppedIdentity.id),
		}),
		users: droppedIdentity,
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE [users] DROP CONSTRAINT [users_pkey];`,
		'ALTER TABLE [ref] DROP CONSTRAINT [ref_age_users_id_fk];\n',
		`EXEC sp_rename 'users.id', [__old_id], 'COLUMN';`,
		`ALTER TABLE [users] ADD [id] int NOT NULL;`,
		`INSERT INTO [users] ([id]) SELECT [__old_id] FROM [users];`,
		`ALTER TABLE [users] DROP COLUMN [__old_id];`,
		`ALTER TABLE [users] ADD CONSTRAINT [users_pkey] PRIMARY KEY ([id]);`,
		`ALTER TABLE [ref] ADD CONSTRAINT [ref_age_users_id_fk] FOREIGN KEY ([age]) REFERENCES [users]([id]);`,
	]);
});

// This is really strange case. Do not this this is a real business case
// But this could be created in mssql so i checked that
test('drop identity from existing column #17. Part of fk', async (t) => {
	const users = mssqlTable(
		'users',
		{
			id: int('id').primaryKey(),
			name: varchar(),
		},
	);
	const schema1 = {
		users2: mssqlTable('users2', {
			id: int('id').identity().references(() => users.id),
			name: varchar(),
		}),
		users,
	};

	const schema2 = {
		users2: mssqlTable('users2', {
			id: int('id').references(() => users.id), // dropped identity
			name: varchar(),
		}),
		users,
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE [users2] DROP CONSTRAINT [users2_id_users_id_fk];\n',
		`EXEC sp_rename 'users2.id', [__old_id], 'COLUMN';`,
		`ALTER TABLE [users2] ADD [id] int;`,
		`INSERT INTO [users2] ([id]) SELECT [__old_id] FROM [users2];`,
		`ALTER TABLE [users2] DROP COLUMN [__old_id];`,
		`ALTER TABLE [users2] ADD CONSTRAINT [users2_id_users_id_fk] FOREIGN KEY ([id]) REFERENCES [users]([id]);`,
	]);
});

test('drop identity from existing column #18. Rename Table. Part of fk', async (t) => {
	const users = mssqlTable(
		'users',
		{
			id: int('id').primaryKey().identity(),
		},
	);
	const schema1 = {
		ref: mssqlTable('ref', {
			age: int().unique().references(() => users.id),
		}),
		users,
	};

	const droppedIdentity = mssqlTable(
		'new_users',
		{
			id: int('id').primaryKey(),
		},
	);
	const schema2 = {
		ref: mssqlTable('ref', {
			age: int().unique().references(() => droppedIdentity.id),
		}),
		users: droppedIdentity,
	};

	const { sqlStatements } = await diff(schema1, schema2, ['dbo.users->dbo.new_users']);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'users', [new_users];`,
		`ALTER TABLE [new_users] DROP CONSTRAINT [users_pkey];`,
		'ALTER TABLE [ref] DROP CONSTRAINT [ref_age_users_id_fk];\n',
		`EXEC sp_rename 'new_users.id', [__old_id], 'COLUMN';`,
		`ALTER TABLE [new_users] ADD [id] int NOT NULL;`,
		`INSERT INTO [new_users] ([id]) SELECT [__old_id] FROM [new_users];`,
		`ALTER TABLE [new_users] DROP COLUMN [__old_id];`,
		`ALTER TABLE [new_users] ADD CONSTRAINT [users_pkey] PRIMARY KEY ([id]);`,
		`ALTER TABLE [ref] ADD CONSTRAINT [ref_age_users_id_fk] FOREIGN KEY ([age]) REFERENCES [new_users]([id]);`,
	]);
});

test('drop identity from existing column #19. Rename Table + Rename column. Part of fk', async (t) => {
	const users = mssqlTable(
		'users',
		{
			id: int('id').primaryKey().identity(),
		},
	);
	const schema1 = {
		ref: mssqlTable('ref', {
			age: int().unique().references(() => users.id),
		}),
		users,
	};

	const droppedIdentity = mssqlTable(
		'new_users',
		{
			id: int('id1').primaryKey(),
		},
	);
	const schema2 = {
		ref: mssqlTable('ref', {
			age: int().unique().references(() => droppedIdentity.id),
		}),
		users: droppedIdentity,
	};

	const { sqlStatements } = await diff(schema1, schema2, [
		'dbo.users->dbo.new_users',
		'dbo.new_users.id->dbo.new_users.id1',
	]);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'users', [new_users];`,
		`EXEC sp_rename 'new_users.id', [id1], 'COLUMN';`,
		`ALTER TABLE [new_users] DROP CONSTRAINT [users_pkey];`,
		'ALTER TABLE [ref] DROP CONSTRAINT [ref_age_users_id_fk];\n',
		`EXEC sp_rename 'new_users.id1', [__old_id1], 'COLUMN';`,
		`ALTER TABLE [new_users] ADD [id1] int NOT NULL;`,
		`INSERT INTO [new_users] ([id1]) SELECT [__old_id1] FROM [new_users];`,
		`ALTER TABLE [new_users] DROP COLUMN [__old_id1];`,
		`ALTER TABLE [new_users] ADD CONSTRAINT [users_pkey] PRIMARY KEY ([id1]);`,
		`ALTER TABLE [ref] ADD CONSTRAINT [ref_age_users_id_fk] FOREIGN KEY ([age]) REFERENCES [new_users]([id1]);`,
	]);
});

test('drop identity from existing column #20. Rename Table + Rename column. Add fk', async (t) => {
	const users = mssqlTable(
		'users',
		{
			id: int('id').primaryKey().identity(),
		},
	);
	const schema1 = {
		ref: mssqlTable('ref', {
			age: int().unique(),
		}),
		users,
	};

	const droppedIdentity = mssqlTable(
		'new_users',
		{
			id: int('id1').primaryKey(),
		},
	);
	const schema2 = {
		ref: mssqlTable('ref', {
			age: int().unique().references(() => droppedIdentity.id),
		}),
		users: droppedIdentity,
	};

	const { sqlStatements } = await diff(schema1, schema2, [
		'dbo.users->dbo.new_users',
		'dbo.new_users.id->dbo.new_users.id1',
	]);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'users', [new_users];`,
		`EXEC sp_rename 'new_users.id', [id1], 'COLUMN';`,
		`ALTER TABLE [new_users] DROP CONSTRAINT [users_pkey];`,
		`EXEC sp_rename 'new_users.id1', [__old_id1], 'COLUMN';`,
		`ALTER TABLE [new_users] ADD [id1] int NOT NULL;`,
		`INSERT INTO [new_users] ([id1]) SELECT [__old_id1] FROM [new_users];`,
		`ALTER TABLE [new_users] DROP COLUMN [__old_id1];`,
		`ALTER TABLE [new_users] ADD CONSTRAINT [users_pkey] PRIMARY KEY ([id1]);`,
		`ALTER TABLE [ref] ADD CONSTRAINT [ref_age_new_users_id1_fk] FOREIGN KEY ([age]) REFERENCES [new_users]([id1]);`,
	]);
});

test('drop identity from existing column #21. Rename Table + Rename column. Drop fk', async (t) => {
	const users = mssqlTable(
		'users',
		{
			id: int('id').primaryKey().identity(),
		},
	);
	const schema1 = {
		ref: mssqlTable('ref', {
			age: int().unique().references(() => users.id),
		}),
		users,
	};

	const droppedIdentity = mssqlTable(
		'new_users',
		{
			id: int('id1').primaryKey(),
		},
	);
	const schema2 = {
		ref: mssqlTable('ref', {
			age: int().unique(),
		}),
		users: droppedIdentity,
	};

	const { sqlStatements } = await diff(schema1, schema2, [
		'dbo.users->dbo.new_users',
		'dbo.new_users.id->dbo.new_users.id1',
	]);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'users', [new_users];`,
		`EXEC sp_rename 'new_users.id', [id1], 'COLUMN';`,
		`ALTER TABLE [new_users] DROP CONSTRAINT [users_pkey];`,
		`ALTER TABLE [ref] DROP CONSTRAINT [ref_age_users_id_fk];\n`,
		`EXEC sp_rename 'new_users.id1', [__old_id1], 'COLUMN';`,
		`ALTER TABLE [new_users] ADD [id1] int NOT NULL;`,
		`INSERT INTO [new_users] ([id1]) SELECT [__old_id1] FROM [new_users];`,
		`ALTER TABLE [new_users] DROP COLUMN [__old_id1];`,
		`ALTER TABLE [new_users] ADD CONSTRAINT [users_pkey] PRIMARY KEY ([id1]);`,
	]);
});

test('drop identity from existing column #22. Part of pk constraint', async (t) => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id: int('id').primaryKey().identity(),
			},
		),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE [users] DROP CONSTRAINT [users_pkey];',
		`EXEC sp_rename 'users.id', [__old_id], 'COLUMN';`,
		`ALTER TABLE [users] ADD [id] int NOT NULL;`,
		`INSERT INTO [users] ([id]) SELECT [__old_id] FROM [users];`,
		`ALTER TABLE [users] DROP COLUMN [__old_id];`,
		'ALTER TABLE [users] ADD CONSTRAINT [users_pkey] PRIMARY KEY ([id]);',
	]);
});

test('drop identity from existing column #23. Rename table. Part of pk constraint', async (t) => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id: int('id').primaryKey().identity(),
			},
		),
	};

	const schema2 = {
		users: mssqlTable('users2', {
			id: int('id').primaryKey(),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, [`dbo.users->dbo.users2`]);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'users', [users2];`,
		'ALTER TABLE [users2] DROP CONSTRAINT [users_pkey];',
		`EXEC sp_rename 'users2.id', [__old_id], 'COLUMN';`,
		`ALTER TABLE [users2] ADD [id] int NOT NULL;`,
		`INSERT INTO [users2] ([id]) SELECT [__old_id] FROM [users2];`,
		`ALTER TABLE [users2] DROP COLUMN [__old_id];`,
		'ALTER TABLE [users2] ADD CONSTRAINT [users_pkey] PRIMARY KEY ([id]);',
	]);
});

test('drop identity from existing column #24. Rename table + rename column. Part of pk constraint', async (t) => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id: int('id').primaryKey().identity(),
			},
		),
	};

	const schema2 = {
		users: mssqlTable('users2', {
			id: int('id1').primaryKey(),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, [`dbo.users->dbo.users2`, `dbo.users2.id->dbo.users2.id1`]);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'users', [users2];`,
		`EXEC sp_rename 'users2.id', [id1], 'COLUMN';`,
		'ALTER TABLE [users2] DROP CONSTRAINT [users_pkey];',
		`EXEC sp_rename 'users2.id1', [__old_id1], 'COLUMN';`,
		`ALTER TABLE [users2] ADD [id1] int NOT NULL;`,
		`INSERT INTO [users2] ([id1]) SELECT [__old_id1] FROM [users2];`,
		`ALTER TABLE [users2] DROP COLUMN [__old_id1];`,
		'ALTER TABLE [users2] ADD CONSTRAINT [users_pkey] PRIMARY KEY ([id1]);',
	]);
});

test('drop identity from existing column #25. Rename table + rename column. Add pk', async (t) => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id: int('id').identity(),
			},
		),
	};

	const schema2 = {
		users: mssqlTable('users2', {
			id: int('id1').primaryKey(),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, [`dbo.users->dbo.users2`, `dbo.users2.id->dbo.users2.id1`]);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'users', [users2];`,
		`EXEC sp_rename 'users2.id', [id1], 'COLUMN';`,
		`EXEC sp_rename 'users2.id1', [__old_id1], 'COLUMN';`,
		`ALTER TABLE [users2] ADD [id1] int NOT NULL;`,
		`INSERT INTO [users2] ([id1]) SELECT [__old_id1] FROM [users2];`,
		`ALTER TABLE [users2] DROP COLUMN [__old_id1];`,
		'ALTER TABLE [users2] ADD CONSTRAINT [users2_pkey] PRIMARY KEY ([id1]);',
	]);
});

test('drop identity from existing column #26. Rename table + rename column. Drop pk', async (t) => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id: int('id').primaryKey().identity(),
			},
		),
	};

	const schema2 = {
		users: mssqlTable('users2', {
			id: int('id1'),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, [`dbo.users->dbo.users2`, `dbo.users2.id->dbo.users2.id1`]);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'users', [users2];`,
		`EXEC sp_rename 'users2.id', [id1], 'COLUMN';`,
		'ALTER TABLE [users2] DROP CONSTRAINT [users_pkey];',
		`EXEC sp_rename 'users2.id1', [__old_id1], 'COLUMN';`,
		`ALTER TABLE [users2] ADD [id1] int;`,
		`INSERT INTO [users2] ([id1]) SELECT [__old_id1] FROM [users2];`,
		`ALTER TABLE [users2] DROP COLUMN [__old_id1];`,
	]);
});

// TODO add more 'create identity' tests
test('add identity to existing column', async (t) => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id: int('id'),
			},
		),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id').identity(),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename 'users.id', [__old_id], 'COLUMN';`,
		`ALTER TABLE [users] ADD [id] int IDENTITY(1, 1);`,
		`ALTER TABLE [users] DROP COLUMN [__old_id];`,
	]);
});

test('alter column change data type', async (t) => {
	const schema1 = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			name: text('name'),
		}),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			name: varchar('name'),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([`ALTER TABLE [users] ALTER COLUMN [name] varchar;`]);
});

test('alter column change data type + add not null', async (t) => {
	const schema1 = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			name: text('name'),
		}),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			name: varchar('name').notNull(),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([`ALTER TABLE [users] ALTER COLUMN [name] varchar NOT NULL;`]);
});

test('alter column change data type + drop not null', async (t) => {
	const schema1 = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			name: text('name').notNull(),
		}),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			name: varchar('name'),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([`ALTER TABLE [users] ALTER COLUMN [name] varchar;`]);
});
