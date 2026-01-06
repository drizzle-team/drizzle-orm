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

	const { sqlStatements: st0 } = await diff({}, schema1, []);
	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to: schema2, schemas: ['dbo'] });

	const expected2 = [
		`ALTER TABLE [users] ADD [name] text NOT NULL CONSTRAINT [users_name_default] DEFAULT ('hey');`,
	];

	// expect(st0).toStrictEqual([]);
	expect(st).toStrictEqual(expected2);
	expect(pst).toStrictEqual(expected2);
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
			name: varchar('name', { length: 100 }).primaryKey(),
			email: text('email'),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to: schema2, schemas: ['dbo'] });

	const st0 = [
		'ALTER TABLE [users] ADD [name] varchar(100) NOT NULL;',
		'ALTER TABLE [users] ADD [email] text;',
		'ALTER TABLE [users] ADD CONSTRAINT [users_pkey] PRIMARY KEY ([name]);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add columns #4. With default', async (t) => {
	const schema1 = {
		users: mssqlTable('users', {
			id: int('id'),
		}),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id'),
			name: varchar('name', { length: 100 }).primaryKey(),
			email: text('email').default('hey'),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to: schema2, schemas: ['dbo'] });

	const st0 = [
		'ALTER TABLE [users] ADD [name] varchar(100) NOT NULL;',
		`ALTER TABLE [users] ADD [email] text CONSTRAINT [users_email_default] DEFAULT ('hey');`,
		'ALTER TABLE [users] ADD CONSTRAINT [users_pkey] PRIMARY KEY ([name]);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add columns #5. With not null and with default', async (t) => {
	const schema1 = {
		users: mssqlTable('users', {
			id: int('id'),
		}),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id'),
			name: varchar('name', { length: 100 }).primaryKey(),
			email: text('email').notNull().default('hey'),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to: schema2, schemas: ['dbo'] });

	const st0 = [
		'ALTER TABLE [users] ADD [name] varchar(100) NOT NULL;',
		`ALTER TABLE [users] ADD [email] text NOT NULL CONSTRAINT [users_email_default] DEFAULT ('hey');`,
		'ALTER TABLE [users] ADD CONSTRAINT [users_pkey] PRIMARY KEY ([name]);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter column: change data type, add not null with default', async (t) => {
	const from = {
		users: mssqlTable('users', {
			id: int(),
			name: varchar({ length: 200 }),
		}),
	};

	await push({ db, to: from });

	await db.query(`INSERT INTO [users] ([id]) VALUES (1), (2);`);

	const to = {
		users: mssqlTable('users', {
			id: int(),
			name: varchar({ length: 200 }).notNull().default('1'),
		}),
	};
	const { sqlStatements: pst1, hints, error } = await push({
		db,
		to: to,
		expectError: true,
		ignoreSubsequent: true,
	});

	const st_01 = [
		`ALTER TABLE [users] ALTER COLUMN [name] varchar(200) NOT NULL;`,
		`ALTER TABLE [users] ADD CONSTRAINT [users_name_default] DEFAULT ('1') FOR [name];`,
	];

	expect(pst1).toStrictEqual(st_01);
	expect(hints).toStrictEqual([]);
	expect(error).not.toBeNull();
});

test('column conflict duplicate name #1', async (t) => {
	const schema1 = {
		users: mssqlTable('users', {
			id: int('id'),
		}),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id'),
			name: varchar('name', { length: 100 }).primaryKey(),
			email: text('name'),
		}),
	};

	await push({ to: schema1, db, schemas: ['dbo'] });

	await expect(diff(schema1, schema2, [])).rejects.toThrowError(); // duplicate names in columns
	await expect(push({ to: schema2, db, schemas: ['dbo'] })).rejects.toThrowError(); // duplicate names in columns
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

	const { sqlStatements: st } = await diff(schema1, schema2, [
		'dbo.users.name->dbo.users.name1',
	]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, renames: ['dbo.users.name->dbo.users.name1'] });

	const st0 = [`EXEC sp_rename 'users.name', [name1], 'COLUMN';`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, [
		'dbo.users.name->dbo.users.name1',
	]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, renames: ['dbo.users.name->dbo.users.name1'] });

	const st0 = [
		`EXEC sp_rename 'users.name', [name1], 'COLUMN';`,
		'ALTER TABLE [users] ADD [email] text;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, [
		'new_schema.users->new_schema.users1',
		'new_schema.users1.id->new_schema.users1.id1',
	]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [
			'new_schema.users->new_schema.users1',
			'new_schema.users1.id->new_schema.users1.id1',
		],
	});

	const st0 = [
		`EXEC sp_rename 'new_schema.users', [users1];`,
		`EXEC sp_rename 'new_schema.users1.id', [id1], 'COLUMN';`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, [
		'new_schema.users.id->new_schema.users.id1',
	]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [
			'new_schema.users.id->new_schema.users.id1',
		],
	});

	const st0 = [
		`EXEC sp_rename 'new_schema.users.id', [id1], 'COLUMN';`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, [
		'new_schema.users.id->new_schema.users.id1',
	]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [
			'new_schema.users.id->new_schema.users.id1',
		],
	});

	const st0 = [
		`EXEC sp_rename 'new_schema.users.id', [id1], 'COLUMN';`,
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, [
		'new_schema.users.id->new_schema.users.id1',
	]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst, hints: phints, error } = await push({
		db,
		to: schema2,
		renames: [
			'new_schema.users.id->new_schema.users.id1',
		],
		expectError: true,
		ignoreSubsequent: true,
	});

	expect(st).toStrictEqual([
		`ALTER TABLE [new_schema].[users] DROP CONSTRAINT [hey];`,
		`EXEC sp_rename 'new_schema.users.id', [id1], 'COLUMN';`,
		`ALTER TABLE [new_schema].[users] ADD CONSTRAINT [hey] CHECK ([users].[id1] != 2);`,
	]);
	// error expected
	// since there will be changes in defintion
	// push will skip alter definition and tries to rename column
	expect(pst).toStrictEqual([
		`EXEC sp_rename 'new_schema.users.id', [id1], 'COLUMN';`,
	]);
	expect(error).not.toBeNull();
	expect(phints).toStrictEqual([{
		hint:
			'· You are trying to rename column from id to id1, but it is not possible to rename a column if it is used in a check constraint on the table.'
			+ '\n'
			+ 'To rename the column, first drop the check constraint, then rename the column, and finally recreate the check constraint',
	}]);
});

test('drop column #1. Part of check constraint', async (t) => {
	const newSchema = mssqlSchema('new_schema');
	const schema1 = {
		newSchema,
		users: newSchema.table('users', {
			id: int('id'),
			name: varchar('name'),
		}, (t) => [check('hey', sql`${t.id} != 2`)]),
	};

	const schema2 = {
		newSchema,
		users: newSchema.table('users', {
			name: varchar('name'),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		`ALTER TABLE [new_schema].[users] DROP CONSTRAINT [hey];`,
		`ALTER TABLE [new_schema].[users] DROP COLUMN [id];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop column #2. Part of unique constraint', async (t) => {
	const newSchema = mssqlSchema('new_schema');
	const schema1 = {
		newSchema,
		users: newSchema.table('users', {
			id: int('id'),
			name: varchar('name'),
		}, (t) => [unique('hey').on(t.id)]),
	};

	const schema2 = {
		newSchema,
		users: newSchema.table('users', {
			name: varchar('name'),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		`ALTER TABLE [new_schema].[users] DROP CONSTRAINT [hey];`,
		`ALTER TABLE [new_schema].[users] DROP COLUMN [id];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop column #3. Part of pk', async (t) => {
	const newSchema = mssqlSchema('new_schema');
	const schema1 = {
		newSchema,
		users: newSchema.table('users', {
			id: int('id'),
			name: varchar('name'),
		}, (t) => [primaryKey({ name: 'hey', columns: [t.id] })]),
	};

	const schema2 = {
		newSchema,
		users: newSchema.table('users', {
			name: varchar('name'),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		`ALTER TABLE [new_schema].[users] DROP CONSTRAINT [hey];`,
		`ALTER TABLE [new_schema].[users] DROP COLUMN [id];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop column #4. Has default', async (t) => {
	const newSchema = mssqlSchema('new_schema');
	const schema1 = {
		newSchema,
		users: newSchema.table('users', {
			id: int('id'),
			name: varchar('name'),
		}, (t) => [primaryKey({ name: 'hey', columns: [t.id] })]),
	};

	const schema2 = {
		newSchema,
		users: newSchema.table('users', {
			name: varchar('name'),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		`ALTER TABLE [new_schema].[users] DROP CONSTRAINT [hey];`,
		`ALTER TABLE [new_schema].[users] DROP COLUMN [id];`,
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = ['ALTER TABLE [users] ADD [text] text;'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, [
		'dbo.users.id2->dbo.users.id3',
	]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: ['dbo.users.id2->dbo.users.id3'],
	});

	const st0 = [`EXEC sp_rename 'users.id2', [id3], 'COLUMN';`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, [
		`dbo.users.id2->dbo.users.id3`,
		`dbo.users.compositePK->dbo.users.${defaultNameForPK('users')}`,
	]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [
			`dbo.users.id2->dbo.users.id3`,
			`dbo.users.compositePK->dbo.users.${defaultNameForPK('users')}`,
		],
	});
	const { sqlStatements: pst2 } = await push({ db, to: schema2 });

	expect(st).toStrictEqual([
		`EXEC sp_rename 'users.id2', [id3], 'COLUMN';`,
		`EXEC sp_rename 'compositePK', [users_pkey], 'OBJECT';`,
	]);
	expect(pst).toStrictEqual([`EXEC sp_rename 'users.id2', [id3], 'COLUMN';`]); // pk name is preserved
	expect(pst2).toStrictEqual([]);
});

test('rename column and pk #3', async (t) => {
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
		}, (t) => [primaryKey({ columns: [t.id1, t.id3], name: 'compositePK1' })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, [
		`dbo.users.id2->dbo.users.id3`,
		`dbo.users.compositePK->dbo.users.compositePK1`,
	]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [`dbo.users.id2->dbo.users.id3`, `dbo.users.compositePK->dbo.users.compositePK1`],
	});

	const { sqlStatements: pst1 } = await push({ db, to: schema2 });

	const st0 = [
		`EXEC sp_rename 'users.id2', [id3], 'COLUMN';`,
		`EXEC sp_rename 'compositePK', [compositePK1], 'OBJECT';`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
	expect(pst1).toStrictEqual([]);
});

test('rename column that is part of pk', async (t) => {
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

	const { sqlStatements: st } = await diff(schema1, schema2, [
		`dbo.users.id2->dbo.users.id3`,
	]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [`dbo.users.id2->dbo.users.id3`],
	});

	const { sqlStatements: pst1 } = await push({ db, to: schema2 });

	const st0 = [
		`EXEC sp_rename 'users.id2', [id3], 'COLUMN';`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
	expect(pst1).toStrictEqual([]);
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

	const { sqlStatements: st } = await diff(schema1, schema2, [
		`dbo.users->dbo.users2`,
	]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [`dbo.users->dbo.users2`],
	});

	const st0 = [`EXEC sp_rename 'users', [users2];`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, [
		`dbo.users->dbo.users2`,
	]);
	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [`dbo.users->dbo.users2`],
	});

	const st0 = [
		`EXEC sp_rename 'users', [users2];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, [
		`dbo.users->my_schema.users2`,
	]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [`dbo.users->my_schema.users2`],
	});

	const st0 = [
		`EXEC sp_rename 'users', [users2];`,
		`ALTER SCHEMA [my_schema] TRANSFER [dbo].[users2];\n`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename table should not cause rename fk. Name is not explicit. #1', async (t) => {
	const company = mssqlTable(
		'company',
		{
			id: int('id').primaryKey(),
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
			id: int('id').primaryKey(),
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

	const { sqlStatements: st } = await diff(schema1, schema2, [
		`dbo.company->dbo.company2`,
	]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [`dbo.company->dbo.company2`],
	});

	const st0 = [
		`EXEC sp_rename 'company', [company2];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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
			id: int('id').primaryKey(),
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

	const { sqlStatements: st } = await diff(schema1, schema2, [
		`dbo.company->dbo.company2`,
	]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [`dbo.company->dbo.company2`],
	});

	const st0 = [
		`EXEC sp_rename 'company', [company2];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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
			id: int('id').primaryKey(),
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

	const { sqlStatements: st } = await diff(schema1, schema2, [
		`dbo.company->my_schema.company2`,
	]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [`dbo.company->my_schema.company2`],
	});

	const st0 = [
		`EXEC sp_rename 'company', [company2];`,
		`ALTER SCHEMA [my_schema] TRANSFER [dbo].[company2];\n`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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
			varchar: varchar('varchar', { length: 100 }).default("escape's quotes"),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		`ALTER TABLE [table] ADD [text] text CONSTRAINT [table_text_default] DEFAULT ('escape''s quotes');`,
		`ALTER TABLE [table] ADD [varchar] varchar(100) CONSTRAINT [table_varchar_default] DEFAULT ('escape''s quotes');`,
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		`ALTER TABLE [table] ADD [text1] text CONSTRAINT [table_text1_default] DEFAULT ('');`,
		`ALTER TABLE [table] ADD [text2] text CONSTRAINT [table_text2_default] DEFAULT ('text');`,
		`ALTER TABLE [table] ADD [int1] int CONSTRAINT [table_int1_default] DEFAULT ((10));`,
		`ALTER TABLE [table] ADD [int2] int CONSTRAINT [table_int2_default] DEFAULT ((0));`,
		`ALTER TABLE [table] ADD [int3] int CONSTRAINT [table_int3_default] DEFAULT ((-10));`,
		`ALTER TABLE [table] ADD [bool1] bit CONSTRAINT [table_bool1_default] DEFAULT ((1));`,
		`ALTER TABLE [table] ADD [bool2] bit CONSTRAINT [table_bool2_default] DEFAULT ((0));`,
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, [
		`dbo.users.id1->dbo.users.id3`,
	]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [`dbo.users.id1->dbo.users.id3`],
	});

	const st0 = [`EXEC sp_rename 'users.id1', [id3], 'COLUMN';`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, [
		`dbo.users.id1->dbo.users.id3`,
	]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [`dbo.users.id1->dbo.users.id3`],
	});

	const st0 = [`EXEC sp_rename 'users.id1', [id3], 'COLUMN';`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename column should not cause rename fk. Name is not explicit #1', async (t) => {
	const table = mssqlTable('table', {
		id: int().primaryKey(),
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

	const { sqlStatements: st } = await diff(schema1, schema2, [
		`dbo.users.id1->dbo.users.id3`,
	]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [`dbo.users.id1->dbo.users.id3`],
	});

	const st0 = [
		`EXEC sp_rename 'users.id1', [id3], 'COLUMN';`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, [
		`dbo.users.id1->dbo.users.id3`,
	]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [`dbo.users.id1->dbo.users.id3`],
	});

	const st0 = [`EXEC sp_rename 'users.id1', [id3], 'COLUMN';`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop identity from existing column #1. Rename table + rename column. Add default', async (t) => {
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

	const { sqlStatements: st } = await diff(schema1, schema2, [
		'dbo.users->dbo.users2',
		'dbo.users2.id->dbo.users2.id1',
	]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: ['dbo.users->dbo.users2', 'dbo.users2.id->dbo.users2.id1'],
	});

	const st0 = [
		`EXEC sp_rename 'users', [users2];`,
		`EXEC sp_rename 'users2.id', [id1], 'COLUMN';`,
		`EXEC sp_rename 'users2.id1', [__old_id1], 'COLUMN';`,
		`ALTER TABLE [users2] ADD [id1] int CONSTRAINT [users2_id1_default] DEFAULT ((1));`,
		`INSERT INTO [users2] ([id1]) SELECT [__old_id1] FROM [users2];`,
		`ALTER TABLE [users2] DROP COLUMN [__old_id1];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER TABLE [users] DROP CONSTRAINT [users_id_key];',
		`EXEC sp_rename 'users.id', [__old_id], 'COLUMN';`,
		`ALTER TABLE [users] ADD [id] int;`,
		`INSERT INTO [users] ([id]) SELECT [__old_id] FROM [users];`,
		`ALTER TABLE [users] DROP COLUMN [__old_id];`,
		'ALTER TABLE [users] ADD CONSTRAINT [users_id_key] UNIQUE([id]);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, [`dbo.users->dbo.users2`]);
	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [`dbo.users->dbo.users2`],
	});

	const st0 = [
		`EXEC sp_rename 'users', [users2];`,
		'ALTER TABLE [users2] DROP CONSTRAINT [users_id_key];',
		`EXEC sp_rename 'users2.id', [__old_id], 'COLUMN';`,
		`ALTER TABLE [users2] ADD [id] int;`,
		`INSERT INTO [users2] ([id]) SELECT [__old_id] FROM [users2];`,
		`ALTER TABLE [users2] DROP COLUMN [__old_id];`,
		'ALTER TABLE [users2] ADD CONSTRAINT [users_id_key] UNIQUE([id]);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, [
		`dbo.users->dbo.users2`,
		`dbo.users2.id->dbo.users2.id1`,
	]);
	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [`dbo.users->dbo.users2`, `dbo.users2.id->dbo.users2.id1`],
	});

	const st0 = [
		`EXEC sp_rename 'users', [users2];`,
		`EXEC sp_rename 'users2.id', [id1], 'COLUMN';`,
		'ALTER TABLE [users2] DROP CONSTRAINT [users_id_key];',
		`EXEC sp_rename 'users2.id1', [__old_id1], 'COLUMN';`,
		`ALTER TABLE [users2] ADD [id1] int;`,
		`INSERT INTO [users2] ([id1]) SELECT [__old_id1] FROM [users2];`,
		`ALTER TABLE [users2] DROP COLUMN [__old_id1];`,
		'ALTER TABLE [users2] ADD CONSTRAINT [users_id_key] UNIQUE([id1]);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, [
		`dbo.users->dbo.users2`,
		`dbo.users2.id->dbo.users2.id1`,
	]);
	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [`dbo.users->dbo.users2`, `dbo.users2.id->dbo.users2.id1`],
	});

	const st0 = [
		`EXEC sp_rename 'users', [users2];`,
		`EXEC sp_rename 'users2.id', [id1], 'COLUMN';`,
		`EXEC sp_rename 'users2.id1', [__old_id1], 'COLUMN';`,
		`ALTER TABLE [users2] ADD [id1] int;`,
		`INSERT INTO [users2] ([id1]) SELECT [__old_id1] FROM [users2];`,
		`ALTER TABLE [users2] DROP COLUMN [__old_id1];`,
		'ALTER TABLE [users2] ADD CONSTRAINT [users2_id1_key] UNIQUE([id1]);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, [
		`dbo.users->dbo.users2`,
		`dbo.users2.id->dbo.users2.id1`,
	]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [`dbo.users->dbo.users2`, `dbo.users2.id->dbo.users2.id1`],
	});

	const st0 = [
		`EXEC sp_rename 'users', [users2];`,
		`EXEC sp_rename 'users2.id', [id1], 'COLUMN';`,
		'ALTER TABLE [users2] DROP CONSTRAINT [users_id_key];',
		`EXEC sp_rename 'users2.id1', [__old_id1], 'COLUMN';`,
		`ALTER TABLE [users2] ADD [id1] int;`,
		`INSERT INTO [users2] ([id1]) SELECT [__old_id1] FROM [users2];`,
		`ALTER TABLE [users2] DROP COLUMN [__old_id1];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER TABLE [users] DROP CONSTRAINT [hello_world];',
		`EXEC sp_rename 'users.id', [__old_id], 'COLUMN';`,
		`ALTER TABLE [users] ADD [id] int;`,
		`INSERT INTO [users] ([id]) SELECT [__old_id] FROM [users];`,
		`ALTER TABLE [users] DROP COLUMN [__old_id];`,
		'ALTER TABLE [users] ADD CONSTRAINT [hello_world] CHECK ([users].[id] != 1);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER TABLE [users] DROP CONSTRAINT [hello_world];',
		`EXEC sp_rename 'users.id', [__old_id], 'COLUMN';`,
		`ALTER TABLE [users] ADD [id] int;`,
		`INSERT INTO [users] ([id]) SELECT [__old_id] FROM [users];`,
		`ALTER TABLE [users] DROP COLUMN [__old_id];`,
		"ALTER TABLE [users] ADD CONSTRAINT [hello_world] CHECK ([users].[name] != 'Alex');",
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, [`dbo.users->dbo.users2`]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [`dbo.users->dbo.users2`],
	});

	const st0 = [
		`EXEC sp_rename 'users', [users2];`,
		'ALTER TABLE [users2] DROP CONSTRAINT [hello_world];',
		`EXEC sp_rename 'users2.id', [__old_id], 'COLUMN';`,
		`ALTER TABLE [users2] ADD [id] int;`,
		`INSERT INTO [users2] ([id]) SELECT [__old_id] FROM [users2];`,
		`ALTER TABLE [users2] DROP COLUMN [__old_id];`,
		"ALTER TABLE [users2] ADD CONSTRAINT [hello_world] CHECK ([users2].[name] != 'Alex');",
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, [
		`dbo.users->dbo.users2`,
		`dbo.users2.id->dbo.users2.id1`,
	]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [`dbo.users->dbo.users2`, `dbo.users2.id->dbo.users2.id1`],
	});

	const st0 = [
		`EXEC sp_rename 'users', [users2];`,
		`EXEC sp_rename 'users2.id', [id1], 'COLUMN';`,
		`EXEC sp_rename 'users2.id1', [__old_id1], 'COLUMN';`,
		`ALTER TABLE [users2] ADD [id1] int;`,
		`INSERT INTO [users2] ([id1]) SELECT [__old_id1] FROM [users2];`,
		`ALTER TABLE [users2] DROP COLUMN [__old_id1];`,
		"ALTER TABLE [users2] ADD CONSTRAINT [hello_world] CHECK ([users2].[name] != 'Alex');",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, [
		`dbo.users->dbo.users2`,
		`dbo.users2.id->dbo.users2.id1`,
	]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [`dbo.users->dbo.users2`, `dbo.users2.id->dbo.users2.id1`],
	});

	const st0 = [
		`EXEC sp_rename 'users', [users2];`,
		`EXEC sp_rename 'users2.id', [id1], 'COLUMN';`,
		`ALTER TABLE [users2] DROP CONSTRAINT [hello_world];`,
		`EXEC sp_rename 'users2.id1', [__old_id1], 'COLUMN';`,
		`ALTER TABLE [users2] ADD [id1] int;`,
		`INSERT INTO [users2] ([id1]) SELECT [__old_id1] FROM [users2];`,
		`ALTER TABLE [users2] DROP COLUMN [__old_id1];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, [
		`dbo.users->dbo.users2`,
		`dbo.users2.id->dbo.users2.id1`,
	]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [`dbo.users->dbo.users2`, `dbo.users2.id->dbo.users2.id1`],
	});

	const st0 = [
		`EXEC sp_rename 'users', [users2];`,
		`EXEC sp_rename 'users2.id', [id1], 'COLUMN';`,
		`ALTER TABLE [users2] DROP CONSTRAINT [hello_world];`,
		`EXEC sp_rename 'users2.id1', [__old_id1], 'COLUMN';`,
		`ALTER TABLE [users2] ADD [id1] int;`,
		`INSERT INTO [users2] ([id1]) SELECT [__old_id1] FROM [users2];`,
		`ALTER TABLE [users2] DROP COLUMN [__old_id1];`,
		"ALTER TABLE [users2] ADD CONSTRAINT [hello_world] CHECK ([users2].[name] != 'Alex');",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, []);
	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER TABLE [ref] DROP CONSTRAINT [ref_age_users_id_fk];\n',
		`ALTER TABLE [users] DROP CONSTRAINT [users_pkey];`,
		`EXEC sp_rename 'users.id', [__old_id], 'COLUMN';`,
		`ALTER TABLE [users] ADD [id] int NOT NULL;`,
		`INSERT INTO [users] ([id]) SELECT [__old_id] FROM [users];`,
		`ALTER TABLE [users] DROP COLUMN [__old_id];`,
		`ALTER TABLE [users] ADD CONSTRAINT [users_pkey] PRIMARY KEY ([id]);`,
		`ALTER TABLE [ref] ADD CONSTRAINT [ref_age_users_id_fk] FOREIGN KEY ([age]) REFERENCES [users]([id]);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// This is really strange case. Do not think this is a real business case
// But this could be created in mssql so i checked that
// (column with identity references to other column)
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

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER TABLE [users2] DROP CONSTRAINT [users2_id_users_id_fk];\n',
		`EXEC sp_rename 'users2.id', [__old_id], 'COLUMN';`,
		`ALTER TABLE [users2] ADD [id] int;`,
		`INSERT INTO [users2] ([id]) SELECT [__old_id] FROM [users2];`,
		`ALTER TABLE [users2] DROP COLUMN [__old_id];`,
		`ALTER TABLE [users2] ADD CONSTRAINT [users2_id_users_id_fk] FOREIGN KEY ([id]) REFERENCES [users]([id]);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, ['dbo.users->dbo.new_users']);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: ['dbo.users->dbo.new_users'],
	});

	const st0 = [
		`EXEC sp_rename 'users', [new_users];`,
		'ALTER TABLE [ref] DROP CONSTRAINT [ref_age_users_id_fk];\n',
		`ALTER TABLE [new_users] DROP CONSTRAINT [users_pkey];`,
		`EXEC sp_rename 'new_users.id', [__old_id], 'COLUMN';`,
		`ALTER TABLE [new_users] ADD [id] int NOT NULL;`,
		`INSERT INTO [new_users] ([id]) SELECT [__old_id] FROM [new_users];`,
		`ALTER TABLE [new_users] DROP COLUMN [__old_id];`,
		`ALTER TABLE [new_users] ADD CONSTRAINT [users_pkey] PRIMARY KEY ([id]);`,
		`ALTER TABLE [ref] ADD CONSTRAINT [ref_age_users_id_fk] FOREIGN KEY ([age]) REFERENCES [new_users]([id]);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, [
		`dbo.users->dbo.new_users`,
		`dbo.new_users.id->dbo.new_users.id1`,
	]);

	await push({
		db,
		to: schema1,
	});
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [`dbo.users->dbo.new_users`, `dbo.new_users.id->dbo.new_users.id1`],
	});

	const st0 = [
		`EXEC sp_rename 'users', [new_users];`,
		`EXEC sp_rename 'new_users.id', [id1], 'COLUMN';`,
		'ALTER TABLE [ref] DROP CONSTRAINT [ref_age_users_id_fk];\n',
		`ALTER TABLE [new_users] DROP CONSTRAINT [users_pkey];`,
		`EXEC sp_rename 'new_users.id1', [__old_id1], 'COLUMN';`,
		`ALTER TABLE [new_users] ADD [id1] int NOT NULL;`,
		`INSERT INTO [new_users] ([id1]) SELECT [__old_id1] FROM [new_users];`,
		`ALTER TABLE [new_users] DROP COLUMN [__old_id1];`,
		`ALTER TABLE [new_users] ADD CONSTRAINT [users_pkey] PRIMARY KEY ([id1]);`,
		`ALTER TABLE [ref] ADD CONSTRAINT [ref_age_users_id_fk] FOREIGN KEY ([age]) REFERENCES [new_users]([id1]);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, [
		'dbo.users->dbo.new_users',
		'dbo.new_users.id->dbo.new_users.id1',
	]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: ['dbo.users->dbo.new_users', 'dbo.new_users.id->dbo.new_users.id1'],
	});

	const st0 = [
		`EXEC sp_rename 'users', [new_users];`,
		`EXEC sp_rename 'new_users.id', [id1], 'COLUMN';`,
		`ALTER TABLE [new_users] DROP CONSTRAINT [users_pkey];`,
		`EXEC sp_rename 'new_users.id1', [__old_id1], 'COLUMN';`,
		`ALTER TABLE [new_users] ADD [id1] int NOT NULL;`,
		`INSERT INTO [new_users] ([id1]) SELECT [__old_id1] FROM [new_users];`,
		`ALTER TABLE [new_users] DROP COLUMN [__old_id1];`,
		`ALTER TABLE [new_users] ADD CONSTRAINT [users_pkey] PRIMARY KEY ([id1]);`,
		`ALTER TABLE [ref] ADD CONSTRAINT [ref_age_new_users_id1_fk] FOREIGN KEY ([age]) REFERENCES [new_users]([id1]);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, [
		'dbo.users->dbo.new_users',
		'dbo.new_users.id->dbo.new_users.id1',
	]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: ['dbo.users->dbo.new_users', 'dbo.new_users.id->dbo.new_users.id1'],
	});

	const st0 = [
		`EXEC sp_rename 'users', [new_users];`,
		`EXEC sp_rename 'new_users.id', [id1], 'COLUMN';`,
		`ALTER TABLE [ref] DROP CONSTRAINT [ref_age_users_id_fk];\n`,
		`ALTER TABLE [new_users] DROP CONSTRAINT [users_pkey];`,
		`EXEC sp_rename 'new_users.id1', [__old_id1], 'COLUMN';`,
		`ALTER TABLE [new_users] ADD [id1] int NOT NULL;`,
		`INSERT INTO [new_users] ([id1]) SELECT [__old_id1] FROM [new_users];`,
		`ALTER TABLE [new_users] DROP COLUMN [__old_id1];`,
		`ALTER TABLE [new_users] ADD CONSTRAINT [users_pkey] PRIMARY KEY ([id1]);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER TABLE [users] DROP CONSTRAINT [users_pkey];',
		`EXEC sp_rename 'users.id', [__old_id], 'COLUMN';`,
		`ALTER TABLE [users] ADD [id] int NOT NULL;`,
		`INSERT INTO [users] ([id]) SELECT [__old_id] FROM [users];`,
		`ALTER TABLE [users] DROP COLUMN [__old_id];`,
		'ALTER TABLE [users] ADD CONSTRAINT [users_pkey] PRIMARY KEY ([id]);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, [`dbo.users->dbo.users2`]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [`dbo.users->dbo.users2`],
	});

	const st0 = [
		`EXEC sp_rename 'users', [users2];`,
		'ALTER TABLE [users2] DROP CONSTRAINT [users_pkey];',
		`EXEC sp_rename 'users2.id', [__old_id], 'COLUMN';`,
		`ALTER TABLE [users2] ADD [id] int NOT NULL;`,
		`INSERT INTO [users2] ([id]) SELECT [__old_id] FROM [users2];`,
		`ALTER TABLE [users2] DROP COLUMN [__old_id];`,
		'ALTER TABLE [users2] ADD CONSTRAINT [users_pkey] PRIMARY KEY ([id]);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, [
		`dbo.users->dbo.users2`,
		`dbo.users2.id->dbo.users2.id1`,
	]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [`dbo.users->dbo.users2`, `dbo.users2.id->dbo.users2.id1`],
	});

	const st0 = [
		`EXEC sp_rename 'users', [users2];`,
		`EXEC sp_rename 'users2.id', [id1], 'COLUMN';`,
		'ALTER TABLE [users2] DROP CONSTRAINT [users_pkey];',
		`EXEC sp_rename 'users2.id1', [__old_id1], 'COLUMN';`,
		`ALTER TABLE [users2] ADD [id1] int NOT NULL;`,
		`INSERT INTO [users2] ([id1]) SELECT [__old_id1] FROM [users2];`,
		`ALTER TABLE [users2] DROP COLUMN [__old_id1];`,
		'ALTER TABLE [users2] ADD CONSTRAINT [users_pkey] PRIMARY KEY ([id1]);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, [
		`dbo.users->dbo.users2`,
		`dbo.users2.id->dbo.users2.id1`,
	]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [`dbo.users->dbo.users2`, `dbo.users2.id->dbo.users2.id1`],
	});

	const st0 = [
		`EXEC sp_rename 'users', [users2];`,
		`EXEC sp_rename 'users2.id', [id1], 'COLUMN';`,
		`EXEC sp_rename 'users2.id1', [__old_id1], 'COLUMN';`,
		`ALTER TABLE [users2] ADD [id1] int NOT NULL;`,
		`INSERT INTO [users2] ([id1]) SELECT [__old_id1] FROM [users2];`,
		`ALTER TABLE [users2] DROP COLUMN [__old_id1];`,
		'ALTER TABLE [users2] ADD CONSTRAINT [users2_pkey] PRIMARY KEY ([id1]);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, [
		`dbo.users->dbo.users2`,
		`dbo.users2.id->dbo.users2.id1`,
	]);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [`dbo.users->dbo.users2`, `dbo.users2.id->dbo.users2.id1`],
	});

	const st0 = [
		`EXEC sp_rename 'users', [users2];`,
		`EXEC sp_rename 'users2.id', [id1], 'COLUMN';`,
		'ALTER TABLE [users2] DROP CONSTRAINT [users_pkey];',
		`EXEC sp_rename 'users2.id1', [__old_id1], 'COLUMN';`,
		`ALTER TABLE [users2] ADD [id1] int;`,
		`INSERT INTO [users2] ([id1]) SELECT [__old_id1] FROM [users2];`,
		`ALTER TABLE [users2] DROP COLUMN [__old_id1];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop identity from existing column #27. Add not null and add default', async (t) => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id: int('id').identity(),
				name: varchar({ length: 100 }),
			},
		),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id').default(1).notNull(),
			name: varchar({ length: 100 }),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });

	await db.query(`INSERT INTO [users] ([name]) VALUES ('Alex');`);
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		`EXEC sp_rename 'users.id', [__old_id], 'COLUMN';`,
		`ALTER TABLE [users] ADD [id] int NOT NULL CONSTRAINT [users_id_default] DEFAULT ((1));`,
		`INSERT INTO [users] ([id]) SELECT [__old_id] FROM [users];`,
		`ALTER TABLE [users] DROP COLUMN [__old_id];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		`EXEC sp_rename 'users.id', [__old_id], 'COLUMN';`,
		`ALTER TABLE [users] ADD [id] int IDENTITY(1, 1);`,
		`ALTER TABLE [users] DROP COLUMN [__old_id];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [`ALTER TABLE [users] ALTER COLUMN [name] varchar;`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, []);
	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [`ALTER TABLE [users] ALTER COLUMN [name] varchar NOT NULL;`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [`ALTER TABLE [users] ALTER COLUMN [name] varchar;`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('same column names in two tables. Check for correct not null creation. Explicit column names', async (t) => {
	const users = mssqlTable(
		'users',
		{
			id: int('id').primaryKey().identity(),
			departmentId: int('department_id').references(() => departments.id, { onDelete: 'set null' }),
		},
	);
	const userHasDepartmentFilter = mssqlTable(
		'user_has_department_filter',
		{
			userId: int('user_id').references(() => users.id),
			departmentId: int('department_id').references(() => departments.id),
		},
		(table) => {
			return [primaryKey({ columns: [table.userId, table.departmentId] })];
		},
	);
	const departments = mssqlTable(
		'departments',
		{
			id: int('id').primaryKey().identity(),
		},
	);

	// order matters here
	const schema1 = { departments, userHasDepartmentFilter, users };
	const { sqlStatements: st } = await diff({}, schema1, []);
	const { sqlStatements: pst } = await push({ db, to: schema1 });

	const st0 = [
		`CREATE TABLE [departments] (
\t[id] int IDENTITY(1, 1),
\tCONSTRAINT [departments_pkey] PRIMARY KEY([id])
);\n`,
		`CREATE TABLE [user_has_department_filter] (
\t[user_id] int,
\t[department_id] int,
\tCONSTRAINT [user_has_department_filter_pkey] PRIMARY KEY([user_id],[department_id])
);\n`,
		`CREATE TABLE [users] (
\t[id] int IDENTITY(1, 1),
\t[department_id] int,
\tCONSTRAINT [users_pkey] PRIMARY KEY([id])
);\n`,

		`ALTER TABLE [user_has_department_filter] ADD CONSTRAINT [user_has_department_filter_user_id_users_id_fk] FOREIGN KEY ([user_id]) REFERENCES [users]([id]);`,
		`ALTER TABLE [user_has_department_filter] ADD CONSTRAINT [user_has_department_filter_department_id_departments_id_fk] FOREIGN KEY ([department_id]) REFERENCES [departments]([id]);`,
		`ALTER TABLE [users] ADD CONSTRAINT [users_department_id_departments_id_fk] FOREIGN KEY ([department_id]) REFERENCES [departments]([id]) ON DELETE SET NULL;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
test('same column names in two tables. Check for correct not null creation #2. no casing', async (t) => {
	const users = mssqlTable(
		'users',
		{
			id: int().primaryKey().identity(),
			departmentId: int().references(() => departments.id, { onDelete: 'set null' }),
		},
	);
	const userHasDepartmentFilter = mssqlTable(
		'user_has_department_filter',
		{
			userId: int().references(() => users.id),
			departmentId: int().references(() => departments.id),
		},
		(table) => {
			return [primaryKey({ columns: [table.userId, table.departmentId] })];
		},
	);
	const departments = mssqlTable(
		'departments',
		{
			id: int().primaryKey().identity(),
		},
	);

	// order matters here
	const schema1 = { departments, userHasDepartmentFilter, users };
	const { sqlStatements: st } = await diff({}, schema1, []);
	const { sqlStatements: pst } = await push({ db, to: schema1 });

	const st0 = [
		`CREATE TABLE [departments] (
\t[id] int IDENTITY(1, 1),
\tCONSTRAINT [departments_pkey] PRIMARY KEY([id])
);\n`,
		`CREATE TABLE [user_has_department_filter] (
\t[userId] int,
\t[departmentId] int,
\tCONSTRAINT [user_has_department_filter_pkey] PRIMARY KEY([userId],[departmentId])
);\n`,
		`CREATE TABLE [users] (
\t[id] int IDENTITY(1, 1),
\t[departmentId] int,
\tCONSTRAINT [users_pkey] PRIMARY KEY([id])
);\n`,

		`ALTER TABLE [user_has_department_filter] ADD CONSTRAINT [user_has_department_filter_userId_users_id_fk] FOREIGN KEY ([userId]) REFERENCES [users]([id]);`,
		`ALTER TABLE [user_has_department_filter] ADD CONSTRAINT [user_has_department_filter_departmentId_departments_id_fk] FOREIGN KEY ([departmentId]) REFERENCES [departments]([id]);`,
		`ALTER TABLE [users] ADD CONSTRAINT [users_departmentId_departments_id_fk] FOREIGN KEY ([departmentId]) REFERENCES [departments]([id]) ON DELETE SET NULL;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
test('same column names in two tables. Check for correct not null creation #3. camelCase', async (t) => {
	const users = mssqlTable(
		'users',
		{
			id: int().primaryKey().identity(),
			departmentId: int().references(() => departments.id, { onDelete: 'set null' }),
		},
	);
	const userHasDepartmentFilter = mssqlTable(
		'user_has_department_filter',
		{
			userId: int().references(() => users.id),
			departmentId: int().references(() => departments.id),
		},
		(table) => {
			return [primaryKey({ columns: [table.userId, table.departmentId] })];
		},
	);
	const departments = mssqlTable(
		'departments',
		{
			id: int().primaryKey().identity(),
		},
	);

	// order matters here
	const schema1 = { departments, userHasDepartmentFilter, users };
	const { sqlStatements: st } = await diff({}, schema1, [], 'camelCase');
	const { sqlStatements: pst } = await push({ db, to: schema1, casing: 'camelCase' });

	const st0 = [
		`CREATE TABLE [departments] (
\t[id] int IDENTITY(1, 1),
\tCONSTRAINT [departments_pkey] PRIMARY KEY([id])
);\n`,
		`CREATE TABLE [user_has_department_filter] (
\t[userId] int,
\t[departmentId] int,
\tCONSTRAINT [user_has_department_filter_pkey] PRIMARY KEY([userId],[departmentId])
);\n`,
		`CREATE TABLE [users] (
\t[id] int IDENTITY(1, 1),
\t[departmentId] int,
\tCONSTRAINT [users_pkey] PRIMARY KEY([id])
);\n`,

		`ALTER TABLE [user_has_department_filter] ADD CONSTRAINT [user_has_department_filter_userId_users_id_fk] FOREIGN KEY ([userId]) REFERENCES [users]([id]);`,
		`ALTER TABLE [user_has_department_filter] ADD CONSTRAINT [user_has_department_filter_departmentId_departments_id_fk] FOREIGN KEY ([departmentId]) REFERENCES [departments]([id]);`,
		`ALTER TABLE [users] ADD CONSTRAINT [users_departmentId_departments_id_fk] FOREIGN KEY ([departmentId]) REFERENCES [departments]([id]) ON DELETE SET NULL;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
test('same column names in two tables. Check for correct not null creation #4. snake_case', async (t) => {
	const users = mssqlTable(
		'users',
		{
			id: int().primaryKey().identity(),
			departmentId: int().references(() => departments.id, { onDelete: 'set null' }),
		},
	);
	const userHasDepartmentFilter = mssqlTable(
		'user_has_department_filter',
		{
			userId: int().references(() => users.id),
			departmentId: int().references(() => departments.id),
		},
		(table) => {
			return [primaryKey({ columns: [table.userId, table.departmentId] })];
		},
	);
	const departments = mssqlTable(
		'departments',
		{
			id: int().primaryKey().identity(),
		},
	);

	// order matters here
	const schema1 = { departments, userHasDepartmentFilter, users };
	const { sqlStatements: st } = await diff({}, schema1, [], 'snake_case');
	const { sqlStatements: pst } = await push({ db, to: schema1, casing: 'snake_case' });

	const st0 = [
		`CREATE TABLE [departments] (
\t[id] int IDENTITY(1, 1),
\tCONSTRAINT [departments_pkey] PRIMARY KEY([id])
);\n`,
		`CREATE TABLE [user_has_department_filter] (
\t[user_id] int,
\t[department_id] int,
\tCONSTRAINT [user_has_department_filter_pkey] PRIMARY KEY([user_id],[department_id])
);\n`,
		`CREATE TABLE [users] (
\t[id] int IDENTITY(1, 1),
\t[department_id] int,
\tCONSTRAINT [users_pkey] PRIMARY KEY([id])
);\n`,

		`ALTER TABLE [user_has_department_filter] ADD CONSTRAINT [user_has_department_filter_user_id_users_id_fk] FOREIGN KEY ([user_id]) REFERENCES [users]([id]);`,
		`ALTER TABLE [user_has_department_filter] ADD CONSTRAINT [user_has_department_filter_department_id_departments_id_fk] FOREIGN KEY ([department_id]) REFERENCES [departments]([id]);`,
		`ALTER TABLE [users] ADD CONSTRAINT [users_department_id_departments_id_fk] FOREIGN KEY ([department_id]) REFERENCES [departments]([id]) ON DELETE SET NULL;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
