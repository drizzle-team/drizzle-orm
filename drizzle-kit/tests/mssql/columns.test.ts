import { bit, int, mssqlSchema, mssqlTable, primaryKey, text, varchar } from 'drizzle-orm/mssql-core';
import { defaultNameForPK } from 'src/dialects/mssql/grammar';
import { expect, test } from 'vitest';
import { diff } from './mocks';

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

	const { sqlStatements } = await diff(schema1, schema2, []);
	expect(sqlStatements).toStrictEqual(["ALTER TABLE [users] ADD [name] text DEFAULT 'hey' NOT NULL;"]);
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

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE [users] ADD [name] text;',
		'ALTER TABLE [users] ADD [email] text;',
	]);
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

test('rename table should cause rename pk. Name is not explicit', async (t) => {
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
		`EXEC sp_rename 'users_pkey', [users2_pkey], 'OBJECT';`,
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

test('move table to other schema + rename table. Should cause rename pk. Name is not explicit', async (t) => {
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
		`EXEC sp_rename 'my_schema.users_pkey', [users2_pkey], 'OBJECT';`,
	]);
});

test('rename table should cause rename fk. Name is not explicit. #1', async (t) => {
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
		`EXEC sp_rename 'users_company_id_company_id_fk', [users_company_id_company2_id_fk], 'OBJECT';`,
	]);

	const { sqlStatements: sqlStatements2 } = await diff(schema2, schema2, []);

	expect(sqlStatements2).toStrictEqual([]);
});

test('rename table should cause rename fk. Name is not explicit. #2', async (t) => {
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
		`EXEC sp_rename 'company_id_users_id_fk', [company2_id_users_id_fk], 'OBJECT';`,
	]);
});

test('move table to other schema + rename fk', async (t) => {
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
		`EXEC sp_rename 'my_schema.company_id_users_id_fk', [company2_id_users_id_fk], 'OBJECT';`,
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
		`ALTER TABLE [table] ADD [text] text DEFAULT 'escape''s quotes';`,
		`ALTER TABLE [table] ADD [varchar] varchar DEFAULT 'escape''s quotes';`,
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
		"ALTER TABLE [table] ADD [text1] text DEFAULT '';",
		"ALTER TABLE [table] ADD [text2] text DEFAULT 'text';",
		'ALTER TABLE [table] ADD [int1] int DEFAULT 10;',
		'ALTER TABLE [table] ADD [int2] int DEFAULT 0;',
		'ALTER TABLE [table] ADD [int3] int DEFAULT -10;',
		'ALTER TABLE [table] ADD [bool1] bit DEFAULT 1;',
		'ALTER TABLE [table] ADD [bool2] bit DEFAULT 0;',
	]);
});
