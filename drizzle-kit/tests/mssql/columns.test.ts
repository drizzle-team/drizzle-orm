import { bit, int, mssqlTable, primaryKey, text, varchar } from 'drizzle-orm/mssql-core';
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
			name: text('name'),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);
	expect(sqlStatements).toStrictEqual(['ALTER TABLE [users] ADD [name] text;']);
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

	expect(sqlStatements).toStrictEqual([`EXEC sp_rename '[users].[name]', [name1], 'COLUMN';`]);
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
		`EXEC sp_rename '[users].[name]', [name1], 'COLUMN';`,
		'ALTER TABLE [users] ADD [email] text;',
	]);
});

// TODO here i need to be sure that name is correct, syntax is correct here
test.todo('alter table add composite pk', async (t) => {
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
	const schema1 = {
		users: mssqlTable('users', {
			id: int('id'),
		}),
	};

	const schema2 = {
		users: mssqlTable('users1', {
			id: int('id1'),
		}),
	};

	const { sqlStatements } = await diff(schema1, schema2, [
		'dbo.users->dbo.users1',
		'dbo.users1.id->dbo.users1.id1',
	]);

	expect(sqlStatements).toStrictEqual([
		`EXEC sp_rename '[users]', '[users1]';`,
		`EXEC sp_rename '[users1].[id]', [id1], 'COLUMN';`,
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

test('rename column that is part of the pk', async (t) => {
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

	// TODO: remove redundand drop/create create constraint
	const { sqlStatements } = await diff(schema1, schema2, [
		'dbo.users.id2->dbo.users.id3',
	]);

	expect(sqlStatements).toStrictEqual([`EXEC sp_rename '[users].[id2]', [id3], 'COLUMN';`]);
});

// test('add multiple constraints #1', async (t) => {
// 	const t1 = mssqlTable('t1', {
// 		id: uuid('id').primaryKey().defaultRandom(),
// 	});

// 	const t2 = mssqlTable('t2', {
// 		id: ('id').primaryKey(),
// 	});

// 	const t3 = mssqlTable('t3', {
// 		id: uuid('id').primaryKey().defaultRandom(),
// 	});

// 	const schema1 = {
// 		t1,
// 		t2,
// 		t3,
// 		ref1: mssqlTable('ref1', {
// 			id1: uuid('id1').references(() => t1.id),
// 			id2: uuid('id2').references(() => t2.id),
// 			id3: uuid('id3').references(() => t3.id),
// 		}),
// 	};

// 	const schema2 = {
// 		t1,
// 		t2,
// 		t3,
// 		ref1: mssqlTable('ref1', {
// 			id1: uuid('id1').references(() => t1.id, { onDelete: 'cascade' }),
// 			id2: uuid('id2').references(() => t2.id, { onDelete: 'set null' }),
// 			id3: uuid('id3').references(() => t3.id, { onDelete: 'cascade' }),
// 		}),
// 	};

// 	// TODO: remove redundand drop/create create constraint
// 	const { sqlStatements } = await diff(schema1, schema2, []);

// 	expect(sqlStatements).toStrictEqual([]);
// });

// test('add multiple constraints #2', async (t) => {
// 	const t1 = mssqlTable('t1', {
// 		id1: uuid('id1').primaryKey().defaultRandom(),
// 		id2: uuid('id2').primaryKey().defaultRandom(),
// 		id3: uuid('id3').primaryKey().defaultRandom(),
// 	});

// 	const schema1 = {
// 		t1,
// 		ref1: mssqlTable('ref1', {
// 			id1: uuid('id1').references(() => t1.id1),
// 			id2: uuid('id2').references(() => t1.id2),
// 			id3: uuid('id3').references(() => t1.id3),
// 		}),
// 	};

// 	const schema2 = {
// 		t1,
// 		ref1: mssqlTable('ref1', {
// 			id1: uuid('id1').references(() => t1.id1, { onDelete: 'cascade' }),
// 			id2: uuid('id2').references(() => t1.id2, { onDelete: 'set null' }),
// 			id3: uuid('id3').references(() => t1.id3, { onDelete: 'cascade' }),
// 		}),
// 	};

// 	// TODO: remove redundand drop/create create constraint
// 	const { sqlStatements } = await diff(schema1, schema2, []);

// 	expect(sqlStatements).toStrictEqual([]);
// });

// test('add multiple constraints #3', async (t) => {
// 	const t1 = mssqlTable('t1', {
// 		id1: uuid('id1').primaryKey().defaultRandom(),
// 		id2: uuid('id2').primaryKey().defaultRandom(),
// 		id3: uuid('id3').primaryKey().defaultRandom(),
// 	});

// 	const schema1 = {
// 		t1,
// 		ref1: mssqlTable('ref1', {
// 			id: uuid('id').references(() => t1.id1),
// 		}),
// 		ref2: mssqlTable('ref2', {
// 			id: uuid('id').references(() => t1.id2),
// 		}),
// 		ref3: mssqlTable('ref3', {
// 			id: uuid('id').references(() => t1.id3),
// 		}),
// 	};

// 	const schema2 = {
// 		t1,
// 		ref1: mssqlTable('ref1', {
// 			id: uuid('id').references(() => t1.id1, { onDelete: 'cascade' }),
// 		}),
// 		ref2: mssqlTable('ref2', {
// 			id: uuid('id').references(() => t1.id2, { onDelete: 'set null' }),
// 		}),
// 		ref3: mssqlTable('ref3', {
// 			id: uuid('id').references(() => t1.id3, { onDelete: 'cascade' }),
// 		}),
// 	};

// 	// TODO: remove redundand drop/create create constraint
// 	const { sqlStatements } = await diff(schema1, schema2, []);

// 	expect(sqlStatements).toStrictEqual([]);
// });

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

	// TODO: check for created tables, etc
	expect(sqlStatements).toStrictEqual([
		"ALTER TABLE [table] ADD [text1] text DEFAULT '';",
		"ALTER TABLE [table] ADD [text2] text DEFAULT 'text';",
		'ALTER TABLE [table] ADD [int1] int DEFAULT 10;',
		'ALTER TABLE [table] ADD [int2] int DEFAULT 0;',
		'ALTER TABLE [table] ADD [int3] int DEFAULT -10;',
		'ALTER TABLE [table] ADD [bool1] bit DEFAULT true;',
		'ALTER TABLE [table] ADD [bool2] bit DEFAULT false;',
	]);
});
