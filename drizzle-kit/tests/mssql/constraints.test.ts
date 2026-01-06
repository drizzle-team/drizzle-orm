import { sql } from 'drizzle-orm';
import {
	AnyMsSqlColumn,
	bit,
	check,
	foreignKey,
	index,
	int,
	mssqlSchema,
	mssqlTable,
	nvarchar,
	primaryKey,
	unique,
	varchar,
} from 'drizzle-orm/mssql-core';
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

test('drop primary key', async () => {
	const schema1 = {
		table: mssqlTable('table', {
			id: int().primaryKey(),
		}),
	};

	const schema2 = {
		table: mssqlTable('table', {
			id: int(),
		}),
	};

	const { sqlStatements: st1 } = await diff(schema1, schema2, []);

	await push({
		db,
		to: schema1,
	});
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER TABLE [table] DROP CONSTRAINT [table_pkey];',
		'ALTER TABLE [table] ALTER COLUMN [id] int;',
	];

	expect(st1).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop primary key with not null', async () => {
	const schema1 = {
		table: mssqlTable('table', {
			id: int().primaryKey().notNull(),
		}),
	};

	const schema2 = {
		table: mssqlTable('table', {
			id: int().notNull(),
		}),
	};

	const { sqlStatements: st1 } = await diff(schema1, schema2, []);

	await push({
		db,
		to: schema1,
	});
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER TABLE [table] DROP CONSTRAINT [table_pkey];',
	];

	expect(st1).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop unique', async () => {
	const schema1 = {
		table: mssqlTable('table', {
			id: int().unique(),
		}),
	};

	const schema2 = {
		table: mssqlTable('table', {
			id: int(),
		}),
	};

	const { sqlStatements: st1 } = await diff({}, schema1, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema1 });

	const expSt0 = [
		`CREATE TABLE [table] (
\t[id] int,
\tCONSTRAINT [table_id_key] UNIQUE([id])
);\n`,
	];
	expect(st1).toStrictEqual(expSt0);
	expect(pst1).toStrictEqual(expSt0);

	const { sqlStatements: st2 } = await diff(schema1, schema2, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema2 });

	const expSt1 = [
		'ALTER TABLE [table] DROP CONSTRAINT [table_id_key];',
	];
	expect(st2).toStrictEqual(expSt1);
	expect(pst2).toStrictEqual(expSt1);
});

test('add fk', async () => {
	const table = mssqlTable('table', {
		id: int().primaryKey(),
	});
	const table1 = mssqlTable('table1', {
		id: int(),
	});
	const schema1 = {
		table,
		table1,
	};

	const table1WithReference = mssqlTable('table1', {
		id: int().references(() => table.id),
	});
	const schema2 = {
		table,
		table1: table1WithReference,
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);
	await push({
		db,
		to: schema1,
	});
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER TABLE [table1] ADD CONSTRAINT [table1_id_table_id_fk] FOREIGN KEY ([id]) REFERENCES [table]([id]);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop fk', async () => {
	const table = mssqlTable('table', {
		id: int().primaryKey(),
	});
	const table1WithReference = mssqlTable('table1', {
		id: int().references(() => table.id),
	});

	const schema1 = {
		table,
		table1: table1WithReference,
	};

	const table1 = mssqlTable('table1', {
		id: int(),
	});
	const schema2 = {
		table,
		table1,
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);
	await push({
		db,
		to: schema1,
	});
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER TABLE [table1] DROP CONSTRAINT [table1_id_table_id_fk];\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename pk #1', async (t) => {
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
			id2: int('id2'),
		}, (t) => [primaryKey({ columns: [t.id1, t.id2] })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, [
		`dbo.users.compositePK->dbo.users.${defaultNameForPK('users')}`,
	]);

	await push({
		db,
		to: schema1,
	});
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [`dbo.users.compositePK->dbo.users.${defaultNameForPK('users')}`],
	});

	const st0 = [`EXEC sp_rename 'compositePK', [users_pkey], 'OBJECT';`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]); // push will not change name if changed to !explicit
});

test('add unique', async () => {
	const schema1 = {
		table: mssqlTable('table', {
			id: int(),
		}),
	};

	const schema2 = {
		table: mssqlTable('table', {
			id: int().unique(),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);
	await push({
		db,
		to: schema1,
	});
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0 = [
		'ALTER TABLE [table] ADD CONSTRAINT [table_id_key] UNIQUE([id]);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename unique', async (t) => {
	const schema1 = {
		table: mssqlTable('table', {
			id: int().unique('old_name'),
		}),
	};

	const schema2 = {
		table: mssqlTable('table', {
			id: int().unique('new_name'),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, [
		`dbo.table.old_name->dbo.table.new_name`,
	]);
	await push({
		db,
		to: schema1,
	});
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		renames: [`dbo.table.old_name->dbo.table.new_name`],
	});

	const st0 = [`EXEC sp_rename 'old_name', [new_name], 'OBJECT';`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('unique #1', async () => {
	const from = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }).unique(),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to,
		schemas: ['dbo'],
	});

	const st0 = [
		`ALTER TABLE [users] ADD CONSTRAINT [users_name_key] UNIQUE([name]);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('unique #2', async () => {
	const from = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }).unique('unique_name'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to,
		schemas: ['dbo'],
	});

	const st0 = [
		`ALTER TABLE [users] ADD CONSTRAINT [unique_name] UNIQUE([name]);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('unique #3', async () => {
	const from = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }),
		}, (t) => [unique('unique_name').on(t.name)]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to,
		schemas: ['dbo'],
	});

	const st0 = [
		`ALTER TABLE [users] ADD CONSTRAINT [unique_name] UNIQUE([name]);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('unique #4', async () => {
	const from = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }),
		}, (t) => [unique('unique_name').on(t.name)]),
	};
	const to = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }),
		}, (t) => [unique('unique_name2').on(t.name)]),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to,
		schemas: ['dbo'],
	});

	const st0 = [
		`ALTER TABLE [users] DROP CONSTRAINT [unique_name];`,
		`ALTER TABLE [users] ADD CONSTRAINT [unique_name2] UNIQUE([name]);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('unique #5', async () => {
	const from = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }),
		}, (t) => [unique('unique_name').on(t.name)]),
	};
	const to = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }),
		}, (t) => [unique('unique_name2').on(t.name)]),
	};

	const { sqlStatements: st } = await diff(from, to, [
		'dbo.users.unique_name->dbo.users.unique_name2',
	]);

	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to,
		schemas: ['dbo'],
		renames: [
			'dbo.users.unique_name->dbo.users.unique_name2',
		],
	});

	const st0 = [
		"EXEC sp_rename 'unique_name', [unique_name2], 'OBJECT';",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('unique #6', async () => {
	const mySchema = mssqlSchema('my_schema');
	const from = {
		mySchema,
		users: mySchema.table('users', {
			name: varchar({ length: 255 }),
		}, (t) => [unique('unique_name').on(t.name)]),
	};
	const to = {
		mySchema,
		users: mySchema.table('users', {
			name: varchar({ length: 255 }),
		}, (t) => [unique('unique_name2').on(t.name)]),
	};

	const { sqlStatements: st } = await diff(from, to, [
		'my_schema.users.unique_name->my_schema.users.unique_name2',
	]);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames: [
			'my_schema.users.unique_name->my_schema.users.unique_name2',
		],
	});

	const st0 = [
		"EXEC sp_rename 'my_schema.unique_name', [unique_name2], 'OBJECT';",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('unique #7', async () => {
	const from = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }),
			email: varchar({ length: 255 }).unique(),
		}, (t) => [unique('unique_name').on(t.name)]),
	};
	const to = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }),
			email2: varchar({ length: 255 }).unique(),
		}, (t) => [unique('unique_name2').on(t.name)]),
	};

	const { sqlStatements: st } = await diff(from, to, [
		'dbo.users.email->dbo.users.email2',
		'dbo.users.unique_name->dbo.users.unique_name2',
	]);

	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to,
		schemas: ['dbo'],
		renames: [
			'dbo.users.email->dbo.users.email2',
			'dbo.users.unique_name->dbo.users.unique_name2',
		],
	});

	const st0 = [
		`EXEC sp_rename 'users.email', [email2], 'COLUMN';`,
		`EXEC sp_rename 'unique_name', [unique_name2], 'OBJECT';`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

/* rename table */
test('unique #8', async () => {
	const from = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }),
			email: varchar({ length: 255 }).unique(),
		}),
	};
	const to = {
		users: mssqlTable('users2', {
			name: varchar({ length: 255 }),
			email: varchar({ length: 255 }).unique(),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, [
		'dbo.users->dbo.users2',
	]);

	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to,
		schemas: ['dbo'],
		renames: [
			'dbo.users->dbo.users2',
		],
	});

	const st0 = [
		`EXEC sp_rename 'users', [users2];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('unique #9', async () => {
	const sch1 = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }),
			email: varchar({ length: 255 }).unique(),
		}),
	};
	const sch2 = {
		users: mssqlTable('users2', {
			name: varchar({ length: 255 }),
			email2: varchar({ length: 255 }).unique('users_email_key'),
		}),
	};

	const sch3 = {
		users: mssqlTable('users2', {
			name: varchar({ length: 255 }),
			email2: varchar({ length: 255 }),
		}),
	};

	// sch1 -> sch2
	const { sqlStatements: st1, next: n1 } = await diff(sch1, sch2, [
		'dbo.users->dbo.users2',
		'dbo.users2.email->dbo.users2.email2',
	]);

	await push({ db, to: sch1, schemas: ['dbo'] });
	const { sqlStatements: pst1 } = await push({
		db,
		to: sch2,
		schemas: ['dbo'],
		renames: [
			'dbo.users->dbo.users2',
			'dbo.users2.email->dbo.users2.email2',
		],
	});

	const st10 = [
		`EXEC sp_rename 'users', [users2];`,
		`EXEC sp_rename 'users2.email', [email2], 'COLUMN';`,
	];
	expect(st1).toStrictEqual(st10);
	expect(pst1).toStrictEqual(st10);

	// sch2 -> sch3
	const { sqlStatements: st2 } = await diff(n1, sch3, []);

	const { sqlStatements: pst2 } = await push({
		db,
		to: sch3,
		schemas: ['dbo'],
	});

	const st20 = [
		'ALTER TABLE [users2] DROP CONSTRAINT [users_email_key];',
	];
	expect(st2).toStrictEqual(st20);
	expect(pst2).toStrictEqual(st20);
});

test('unique multistep #1', async () => {
	const sch1 = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }).unique(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1, schemas: ['dbo'] });

	const e1 = ['CREATE TABLE [users] (\n\t[name] varchar(255),\n\tCONSTRAINT [users_name_key] UNIQUE([name])\n);\n'];
	expect(st1).toStrictEqual(e1);
	expect(pst1).toStrictEqual(e1);

	const sch2 = {
		users: mssqlTable('users2', {
			name: varchar('name2', { length: 255 }).unique(),
		}),
	};

	const renames = ['dbo.users->dbo.users2', 'dbo.users2.name->dbo.users2.name2'];
	const { sqlStatements: st2, next: n2 } = await diff(n1, sch2, renames);
	const { sqlStatements: pst2 } = await push({ db, to: sch2, renames, schemas: ['dbo'] });

	const e2 = [
		`EXEC sp_rename 'users', [users2];`,
		`EXEC sp_rename 'users2.name', [name2], 'COLUMN';`,
	];
	expect(st2).toStrictEqual(e2);
	expect(pst2).toStrictEqual(e2);

	const { sqlStatements: st3, next: n3 } = await diff(n2, sch2, []);
	const { sqlStatements: pst3 } = await push({ db, to: sch2, schemas: ['dbo'] });

	expect(st3).toStrictEqual([]);
	expect(pst3).toStrictEqual([]);

	const sch3 = {
		users: mssqlTable('users2', {
			name: varchar('name2', { length: 255 }),
		}),
	};

	const { sqlStatements: st4 } = await diff(n3, sch3, []);
	const { sqlStatements: pst4 } = await push({ db, to: sch3, schemas: ['dbo'] });

	const e3 = ['ALTER TABLE [users2] DROP CONSTRAINT [users_name_key];'];

	expect(pst4).toStrictEqual(e3);
	expect(st4).toStrictEqual(e3);
});

test('unique multistep #2', async () => {
	const sch1 = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }).unique(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1, schemas: ['dbo'] });
	expect(st1).toStrictEqual([
		'CREATE TABLE [users] (\n\t[name] varchar(255),\n\tCONSTRAINT [users_name_key] UNIQUE([name])\n);\n',
	]);
	expect(pst1).toStrictEqual([
		'CREATE TABLE [users] (\n\t[name] varchar(255),\n\tCONSTRAINT [users_name_key] UNIQUE([name])\n);\n',
	]);

	const sch2 = {
		users: mssqlTable('users2', {
			name: varchar('name2', { length: 255 }).unique(),
		}),
	};

	const r1 = [
		'dbo.users->dbo.users2',
		'dbo.users2.name->dbo.users2.name2',
	];
	const { sqlStatements: st2, next: n2 } = await diff(n1, sch2, r1);
	const { sqlStatements: pst2 } = await push({ db, to: sch2, renames: r1, schemas: ['dbo'] });

	const e2 = [
		`EXEC sp_rename 'users', [users2];`,
		`EXEC sp_rename 'users2.name', [name2], 'COLUMN';`,
	];
	expect(pst2).toStrictEqual(e2);
	expect(st2).toStrictEqual(e2);

	const { sqlStatements: st3, next: n3 } = await diff(n2, sch2, []);
	const { sqlStatements: pst3 } = await push({ db, to: sch2, schemas: ['dbo'] });

	expect(st3).toStrictEqual([]);
	expect(pst3).toStrictEqual([]);

	const sch3 = {
		users: mssqlTable('users2', {
			name: varchar('name2', { length: 255 }),
		}, (t) => [unique().on(t.name)]),
	};

	const { sqlStatements: st4, next: n4 } = await diff(n3, sch3, []);
	const { sqlStatements: pst4 } = await push({ db, to: sch3, schemas: ['dbo'] });
	expect(st4).toStrictEqual([]);
	expect(pst4).toStrictEqual([]);

	const sch4 = {
		users: mssqlTable('users2', {
			name: varchar('name2', { length: 255 }),
		}),
	};

	const { sqlStatements: st5 } = await diff(n4, sch4, []);
	const { sqlStatements: pst5 } = await push({ db, to: sch4, schemas: ['dbo'] });
	expect(st5).toStrictEqual(['ALTER TABLE [users2] DROP CONSTRAINT [users_name_key];']);
	expect(pst5).toStrictEqual(['ALTER TABLE [users2] DROP CONSTRAINT [users_name_key];']);
});

test('unique multistep #3', async () => {
	const sch1 = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }).unique(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1, schemas: ['dbo'] });

	expect(st1).toStrictEqual([
		'CREATE TABLE [users] (\n\t[name] varchar(255),\n\tCONSTRAINT [users_name_key] UNIQUE([name])\n);\n',
	]);
	expect(pst1).toStrictEqual([
		'CREATE TABLE [users] (\n\t[name] varchar(255),\n\tCONSTRAINT [users_name_key] UNIQUE([name])\n);\n',
	]);

	const sch2 = {
		users: mssqlTable('users2', {
			name: varchar('name2', { length: 255 }).unique(),
		}),
	};

	const renames = ['dbo.users->dbo.users2', 'dbo.users2.name->dbo.users2.name2'];
	const { sqlStatements: st2, next: n2 } = await diff(n1, sch2, renames);
	const { sqlStatements: pst2 } = await push({ db, to: sch2, renames, schemas: ['dbo'] });

	const e2 = [
		`EXEC sp_rename 'users', [users2];`,
		`EXEC sp_rename 'users2.name', [name2], 'COLUMN';`,
	];
	expect(st2).toStrictEqual(e2);
	expect(pst2).toStrictEqual(e2);

	const { sqlStatements: st3, next: n3 } = await diff(n2, sch2, []);
	const { sqlStatements: pst3 } = await push({ db, to: sch2, schemas: ['dbo'] });

	expect(st3).toStrictEqual([]);
	expect(pst3).toStrictEqual([]);

	const sch3 = {
		users: mssqlTable('users2', {
			name: varchar('name2', { length: 255 }),
		}, (t) => [unique('name_unique').on(t.name)]),
	};

	const { sqlStatements: st4, next: n4 } = await diff(n3, sch3, []);
	const { sqlStatements: pst4 } = await push({ db, to: sch3, schemas: ['dbo'] });

	const e4 = [
		'ALTER TABLE [users2] DROP CONSTRAINT [users_name_key];',
		'ALTER TABLE [users2] ADD CONSTRAINT [name_unique] UNIQUE([name2]);',
	];
	expect(st4).toStrictEqual(e4);
	expect(pst4).toStrictEqual(e4);

	const sch4 = {
		users: mssqlTable('users2', {
			name: varchar('name2', { length: 255 }),
		}),
	};

	const { sqlStatements: st5 } = await diff(n4, sch4, []);
	const { sqlStatements: pst5 } = await push({ db, to: sch4, schemas: ['dbo'] });
	expect(st5).toStrictEqual(['ALTER TABLE [users2] DROP CONSTRAINT [name_unique];']);
	expect(pst5).toStrictEqual(['ALTER TABLE [users2] DROP CONSTRAINT [name_unique];']);
});

test('pk #1', async () => {
	const from = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }).notNull(),
		}),
	};

	const to = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }).primaryKey().notNull(),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to, schemas: ['dbo'] });

	expect(st).toStrictEqual(['ALTER TABLE [users] ADD CONSTRAINT [users_pkey] PRIMARY KEY ([name]);']);
	expect(pst).toStrictEqual(['ALTER TABLE [users] ADD CONSTRAINT [users_pkey] PRIMARY KEY ([name]);']);
});

test('pk #2', async () => {
	const from = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }).primaryKey(),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }).primaryKey(),
		}),
	};

	const { sqlStatements } = await diff(from, to, []);

	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to, schemas: ['dbo'] });

	expect(sqlStatements).toStrictEqual([]);
	expect(pst).toStrictEqual([]);
});

test('pk #3', async () => {
	const from = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }).primaryKey(),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }),
		}, (t) => [primaryKey({ columns: [t.name] })]),
	};

	const { sqlStatements } = await diff(from, to, []);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to, schemas: ['dbo'] });

	expect(sqlStatements).toStrictEqual([]);
	expect(pst).toStrictEqual([]);
});

test('pk #4', async () => {
	const from = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }),
		}, (t) => [primaryKey({ columns: [t.name] })]),
	};

	const to = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }).primaryKey(),
		}),
	};

	const { sqlStatements } = await diff(from, to, []);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to, schemas: ['dbo'] });

	expect(sqlStatements).toStrictEqual([]);
	expect(pst).toStrictEqual([]);
});

test('pk #5', async () => {
	const from = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }),
		}, (t) => [primaryKey({ columns: [t.name] })]),
	};

	const to = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }),
		}),
	};

	const { sqlStatements } = await diff(from, to, []);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to, schemas: ['dbo'] });

	const st0 = [
		'ALTER TABLE [users] DROP CONSTRAINT [users_pkey];',
		'ALTER TABLE [users] ALTER COLUMN [name] varchar(255);',
	];
	expect(sqlStatements).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('pk #6', async () => {
	const from = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }),
		}),
	};

	const to = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }),
		}, (t) => [primaryKey({ columns: [t.name] })]),
	};

	const { sqlStatements } = await diff(from, to, []);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to, schemas: ['dbo'] });

	const st0 = [
		`ALTER TABLE [users] ALTER COLUMN [name] varchar(255) NOT NULL;`,
		'ALTER TABLE [users] ADD CONSTRAINT [users_pkey] PRIMARY KEY ([name]);',
	];
	expect(sqlStatements).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('pk extra #1', async () => {
	const from = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }),
		}),
	};

	const to = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }).primaryKey(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff(from, to, []);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to, schemas: ['dbo'] });

	const st0 = [
		`ALTER TABLE [users] ALTER COLUMN [name] varchar(255) NOT NULL;`,
		'ALTER TABLE [users] ADD CONSTRAINT [users_pkey] PRIMARY KEY ([name]);',
	];
	expect(st1).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);

	// drop pk
	// expect to drop not null because current state is without not null
	// expect to drop pk
	const to2 = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }),
		}),
	};

	const { sqlStatements: st2 } = await diff(n1, to2, []);
	const { sqlStatements: pst2 } = await push({ db, to: to2 });

	const st01 = [
		'ALTER TABLE [users] DROP CONSTRAINT [users_pkey];',
		`ALTER TABLE [users] ALTER COLUMN [name] varchar(255);`,
	];
	expect(st2).toStrictEqual(st01);
	expect(pst2).toStrictEqual(st01);
});

test('pk extra #2', async () => {
	const from = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }),
		}),
	};

	const to = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }).primaryKey(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff(from, to, []);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to, schemas: ['dbo'] });

	const st0 = [
		`ALTER TABLE [users] ALTER COLUMN [name] varchar(255) NOT NULL;`,
		'ALTER TABLE [users] ADD CONSTRAINT [users_pkey] PRIMARY KEY ([name]);',
	];
	expect(st1).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);

	// drop pk but left not nutt
	// expect to drop pk only
	const to2 = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }).notNull(),
		}),
	};

	const { sqlStatements: st2, next: n2 } = await diff(n1, to2, []);
	const { sqlStatements: pst2 } = await push({ db, to: to2 });

	const st01 = [
		'ALTER TABLE [users] DROP CONSTRAINT [users_pkey];',
	];
	expect(st2).toStrictEqual(st01);
	expect(pst2).toStrictEqual(st01);
});

test('pk extra #3', async () => {
	const from = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }),
		}),
	};

	const to = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }),
		}, (t) => [primaryKey({ columns: [t.name] })]),
	};

	const { sqlStatements: st1, next: n1 } = await diff(from, to, []);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to, schemas: ['dbo'] });

	const st0 = [
		`ALTER TABLE [users] ALTER COLUMN [name] varchar(255) NOT NULL;`,
		'ALTER TABLE [users] ADD CONSTRAINT [users_pkey] PRIMARY KEY ([name]);',
	];
	expect(st1).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);

	// drop pk
	// expect to drop not null because current state is without not null
	// expect to drop pk
	const to2 = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }),
		}),
	};

	const { sqlStatements: st2, next: n2 } = await diff(n1, to2, []);
	const { sqlStatements: pst2 } = await push({ db, to: to2 });

	const st01 = [
		'ALTER TABLE [users] DROP CONSTRAINT [users_pkey];',
		`ALTER TABLE [users] ALTER COLUMN [name] varchar(255);`,
	];
	expect(st2).toStrictEqual(st01);
	expect(pst2).toStrictEqual(st01);
});

test('pk extra #4', async () => {
	const from = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }),
		}),
	};

	const to = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }),
		}, (t) => [primaryKey({ columns: [t.name] })]),
	};

	const { sqlStatements: st1, next: n1 } = await diff(from, to, []);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to, schemas: ['dbo'] });

	const st0 = [
		`ALTER TABLE [users] ALTER COLUMN [name] varchar(255) NOT NULL;`,
		'ALTER TABLE [users] ADD CONSTRAINT [users_pkey] PRIMARY KEY ([name]);',
	];
	expect(st1).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);

	// drop pk but left not nutt
	// expect to drop pk only
	const to2 = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }).notNull(),
		}),
	};

	const { sqlStatements: st2, next: n2 } = await diff(n1, to2, []);
	const { sqlStatements: pst2 } = await push({ db, to: to2 });

	const st01 = [
		'ALTER TABLE [users] DROP CONSTRAINT [users_pkey];',
	];
	expect(st2).toStrictEqual(st01);
	expect(pst2).toStrictEqual(st01);
});

test('pk multistep #1', async () => {
	const sch1 = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }).primaryKey(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1, schemas: ['dbo'] });

	const res1 = ['CREATE TABLE [users] (\n\t[name] varchar(255),\n\tCONSTRAINT [users_pkey] PRIMARY KEY([name])\n);\n'];
	expect(st1).toStrictEqual(res1);
	expect(pst1).toStrictEqual(res1);

	const sch2 = {
		users: mssqlTable('users2', {
			name: varchar('name2', { length: 255 }).primaryKey(),
		}),
	};

	const renames = [
		'dbo.users->dbo.users2',
		'dbo.users2.name->dbo.users2.name2',
	];
	const { sqlStatements: st2, next: n2 } = await diff(n1, sch2, renames);
	const { sqlStatements: pst2 } = await push({ db, to: sch2, renames, schemas: ['dbo'] });

	const e2 = [
		`EXEC sp_rename 'users', [users2];`,
		`EXEC sp_rename 'users2.name', [name2], 'COLUMN';`,
	];
	expect(st2).toStrictEqual(e2);
	expect(pst2).toStrictEqual(e2);

	const { sqlStatements: st3, next: n3 } = await diff(n2, sch2, []);
	const { sqlStatements: pst3 } = await push({ db, to: sch2, schemas: ['dbo'] });

	expect(st3).toStrictEqual([]);
	expect(pst3).toStrictEqual([]);

	const sch3 = {
		users: mssqlTable('users2', {
			name: varchar('name2', { length: 255 }),
		}),
	};

	const { sqlStatements: st4 } = await diff(n3, sch3, []);
	const { sqlStatements: pst4 } = await push({ db, to: sch3, schemas: ['dbo'] });

	const st04 = [
		'ALTER TABLE [users2] DROP CONSTRAINT [users_pkey];',
		`ALTER TABLE [users2] ALTER COLUMN [name2] varchar(255);`,
	];
	expect(st4).toStrictEqual(st04);
	expect(pst4).toStrictEqual(st04);
});

test('pk multistep #2', async () => {
	const sch1 = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }).primaryKey(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1, schemas: ['dbo'] });

	const res1 = ['CREATE TABLE [users] (\n\t[name] varchar(255),\n\tCONSTRAINT [users_pkey] PRIMARY KEY([name])\n);\n'];
	expect(st1).toStrictEqual(res1);
	expect(pst1).toStrictEqual(res1);

	const sch2 = {
		users: mssqlTable('users2', {
			name: varchar('name2', { length: 255 }),
		}, (t) => [primaryKey({ columns: [t.name] })]),
	};

	const renames = [
		'dbo.users->dbo.users2',
		'dbo.users2.name->dbo.users2.name2',
	];
	const { sqlStatements: st2, next: n2 } = await diff(n1, sch2, renames);
	const { sqlStatements: pst2 } = await push({ db, to: sch2, renames, schemas: ['dbo'] });

	const e2 = [
		`EXEC sp_rename 'users', [users2];`,
		`EXEC sp_rename 'users2.name', [name2], 'COLUMN';`,
	];
	expect(st2).toStrictEqual(e2);
	expect(pst2).toStrictEqual(e2);

	const { sqlStatements: st3, next: n3 } = await diff(n2, sch2, []);
	const { sqlStatements: pst3 } = await push({ db, to: sch2, schemas: ['dbo'] });

	expect(st3).toStrictEqual([]);
	expect(pst3).toStrictEqual([]);

	const sch3 = {
		users: mssqlTable('users2', {
			name: varchar('name2', { length: 255 }),
		}, (t) => [primaryKey({ name: 'users2_pk', columns: [t.name] })]),
	};

	const renames2 = ['dbo.users2.users_pkey->dbo.users2.users2_pk'];
	const { sqlStatements: st4, next: n4 } = await diff(n3, sch3, renames2);
	const { sqlStatements: pst4 } = await push({ db, to: sch3, renames: renames2, schemas: ['dbo'] });

	expect(st4).toStrictEqual([`EXEC sp_rename 'users_pkey', [users2_pk], 'OBJECT';`]);
	expect(pst4).toStrictEqual([`EXEC sp_rename 'users_pkey', [users2_pk], 'OBJECT';`]);

	const sch4 = {
		users: mssqlTable('users2', {
			name: varchar('name2', { length: 255 }),
		}),
	};

	const { sqlStatements: st5 } = await diff(n4, sch4, []);
	const { sqlStatements: pst5 } = await push({ db, to: sch4, schemas: ['dbo'] });

	const st05 = [
		'ALTER TABLE [users2] DROP CONSTRAINT [users2_pk];',
		`ALTER TABLE [users2] ALTER COLUMN [name2] varchar(255);`,
	];
	expect(st5).toStrictEqual(st05);
	expect(pst5).toStrictEqual(st05);
});

test('pk multistep #3', async () => {
	const sch1 = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }).primaryKey(),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1, schemas: ['dbo'] });

	expect(st1).toStrictEqual([
		'CREATE TABLE [users] (\n\t[name] varchar(255),\n\tCONSTRAINT [users_pkey] PRIMARY KEY([name])\n);\n',
	]);
	expect(pst1).toStrictEqual([
		'CREATE TABLE [users] (\n\t[name] varchar(255),\n\tCONSTRAINT [users_pkey] PRIMARY KEY([name])\n);\n',
	]);

	const sch2 = {
		users: mssqlTable('users2', {
			name: varchar('name2', { length: 255 }),
		}, (t) => [primaryKey({ columns: [t.name] })]),
	};

	const renames = [
		'dbo.users->dbo.users2',
		'dbo.users2.name->dbo.users2.name2',
	];
	const { sqlStatements: st2, next: n2 } = await diff(n1, sch2, renames);
	const { sqlStatements: pst2 } = await push({ db, to: sch2, renames, schemas: ['dbo'] });

	const e2 = [
		`EXEC sp_rename 'users', [users2];`,
		`EXEC sp_rename 'users2.name', [name2], 'COLUMN';`,
	];
	expect(st2).toStrictEqual(e2);
	expect(pst2).toStrictEqual(e2);

	const { sqlStatements: st3, next: n3 } = await diff(n2, sch2, []);
	const { sqlStatements: pst3 } = await push({ db, to: sch2, schemas: ['dbo'] });

	expect(st3).toStrictEqual([]);
	expect(pst3).toStrictEqual([]);

	const sch3 = {
		users: mssqlTable('users2', {
			name: varchar('name2', { length: 255 }),
		}, (t) => [primaryKey({ name: 'users2_pk', columns: [t.name] })]),
	};

	const { sqlStatements: st4, next: n4 } = await diff(n3, sch3, []);
	const { sqlStatements: pst4 } = await push({ db, to: sch3, schemas: ['dbo'] });

	const e4 = [
		'ALTER TABLE [users2] DROP CONSTRAINT [users_pkey];',
		'ALTER TABLE [users2] ADD CONSTRAINT [users2_pk] PRIMARY KEY ([name2]);',
	];
	expect(st4).toStrictEqual(e4);
	expect(pst4).toStrictEqual(e4);

	const sch4 = {
		users: mssqlTable('users2', {
			name: varchar('name2', { length: 255 }),
		}),
	};

	const { sqlStatements: st5 } = await diff(n4, sch4, []);
	const { sqlStatements: pst5 } = await push({ db, to: sch4, schemas: ['dbo'] });

	const st05 = [
		'ALTER TABLE [users2] DROP CONSTRAINT [users2_pk];',
		`ALTER TABLE [users2] ALTER COLUMN [name2] varchar(255);`,
	];
	expect(st5).toStrictEqual(st05);
	expect(pst5).toStrictEqual(st05);
});

test('pk multistep #4', async () => {
	const users = mssqlTable('users', {
		id: int().primaryKey(),
		id2: int(),
	});

	const users2 = mssqlTable('users2', {
		id: int('id3').primaryKey(),
		id2: int(),
	});

	const sch1 = { users };
	const sch2 = { users: users2 };

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1, schemas: ['dbo'] });

	const e1 = [
		'CREATE TABLE [users] (\n\t[id] int,\n\t[id2] int,\n\tCONSTRAINT [users_pkey] PRIMARY KEY([id])\n);\n',
	];
	expect(st1).toStrictEqual(e1);
	expect(pst1).toStrictEqual(e1);

	const { sqlStatements: st2, next: n2 } = await diff(n1, sch2, []);
	const { sqlStatements: pst2 } = await push({ db, to: sch2, schemas: ['dbo'] });

	const e2 = [
		'CREATE TABLE [users2] (\n\t[id3] int,\n\t[id2] int,\n\tCONSTRAINT [users2_pkey] PRIMARY KEY([id3])\n);\n',
		'DROP TABLE [users];',
	];
	expect(st2).toStrictEqual(e2);
	expect(pst2).toStrictEqual(e2);

	const { sqlStatements: st3 } = await diff(n2, sch2, []);
	const { sqlStatements: pst3 } = await push({ db, to: sch2, schemas: ['dbo'] });

	expect(st3).toStrictEqual([]);
	expect(pst3).toStrictEqual([]);
});

test('fk #1', async () => {
	const users = mssqlTable('users', {
		id: int().primaryKey(),
	});
	const posts = mssqlTable('posts', {
		id: int().primaryKey(),
		authorId: int().references(() => users.id),
	});

	const to = {
		posts,
		users,
	};

	const { sqlStatements } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to, schemas: ['dbo'] });

	const e = [
		`CREATE TABLE [posts] (\n\t[id] int,\n\t[authorId] int,\n\tCONSTRAINT [posts_pkey] PRIMARY KEY([id])\n);\n`,
		`CREATE TABLE [users] (\n\t[id] int,\n\tCONSTRAINT [users_pkey] PRIMARY KEY([id])\n);\n`,
		`ALTER TABLE [posts] ADD CONSTRAINT [posts_authorId_users_id_fk] FOREIGN KEY ([authorId]) REFERENCES [users]([id]);`,
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

// exactly 128 symbols fk, fk name explicit
test('fk #2', async () => {
	const users = mssqlTable('123456789_123456789_123456789_123456789_123456789_12_users', {
		id3: int().primaryKey(),
		id2: int().references((): AnyMsSqlColumn => users.id3),
	});

	const to = { users };

	const { sqlStatements } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to, schemas: ['dbo'] });

	const e = [
		`CREATE TABLE [123456789_123456789_123456789_123456789_123456789_12_users] (\n\t[id3] int,\n\t[id2] int,\n\tCONSTRAINT [123456789_123456789_123456789_123456789_123456789_12_users_pkey] PRIMARY KEY([id3])\n);\n`,
		'ALTER TABLE [123456789_123456789_123456789_123456789_123456789_12_users] ADD CONSTRAINT [123456789_123456789_123456789_123456789_123456789_12_users_id2_123456789_123456789_123456789_123456789_123456789_12_users_id3_fk] FOREIGN KEY ([id2]) REFERENCES [123456789_123456789_123456789_123456789_123456789_12_users]([id3]);',
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

// 130 symbols fkey, fkey = table_hash_fkey
test('fk #3', async () => {
	const users = mssqlTable('123456789_123456789_123456789_123456789_123456789_123_users', {
		id3: int().primaryKey(),
		id2: int().references((): AnyMsSqlColumn => users.id3),
	});

	const to = { users };

	const { sqlStatements } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to, schemas: ['dbo'] });

	const e = [
		`CREATE TABLE [123456789_123456789_123456789_123456789_123456789_123_users] (\n\t[id3] int,\n\t[id2] int,\n\tCONSTRAINT [123456789_123456789_123456789_123456789_123456789_123_users_pkey] PRIMARY KEY([id3])\n);\n`,
		'ALTER TABLE [123456789_123456789_123456789_123456789_123456789_123_users] ADD CONSTRAINT [123456789_123456789_123456789_123456789_123456789_123_users_RqTNlAl1EEx0_fk] FOREIGN KEY ([id2]) REFERENCES [123456789_123456789_123456789_123456789_123456789_123_users]([id3]);',
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

// >=110 length table name, fkey = hash_fkey
test('fk #4', async () => {
	const users = mssqlTable(
		'1234567890_1234567890_1234567890_1234567890_1234567890_1234567890_1234567890_1234567890_1234567890_123456_users',
		{
			id: int().primaryKey(),
			id2: int().references((): AnyMsSqlColumn => users.id),
		},
	);

	const to = { users };

	const { sqlStatements } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to, schemas: ['dbo'] });

	const e = [
		`CREATE TABLE [1234567890_1234567890_1234567890_1234567890_1234567890_1234567890_1234567890_1234567890_1234567890_123456_users] (\n\t[id] int,\n\t[id2] int,\n\tCONSTRAINT [1234567890_1234567890_1234567890_1234567890_1234567890_1234567890_1234567890_1234567890_1234567890_123456_users_pkey] PRIMARY KEY([id])\n);\n`,
		'ALTER TABLE [1234567890_1234567890_1234567890_1234567890_1234567890_1234567890_1234567890_1234567890_1234567890_123456_users] ADD CONSTRAINT [1roIIPOipLA5_fk] FOREIGN KEY ([id2]) REFERENCES [1234567890_1234567890_1234567890_1234567890_1234567890_1234567890_1234567890_1234567890_1234567890_123456_users]([id]);',
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

test('fk #5', async () => {
	const users = mssqlTable('users', {
		id: int().primaryKey(),
		id2: int().references((): AnyMsSqlColumn => users.id),
	});

	const users2 = mssqlTable('users2', {
		id: int('id3').primaryKey(),
		id2: int().references((): AnyMsSqlColumn => users2.id),
	});

	const from = { users };
	const to = { users: users2 };

	const renames = ['dbo.users->dbo.users2', 'dbo.users2.id->dbo.users2.id3'];
	const { sqlStatements } = await diff(from, to, renames);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to, renames, schemas: ['dbo'] });

	const e = [
		`EXEC sp_rename 'users', [users2];`,
		`EXEC sp_rename 'users2.id', [id3], 'COLUMN';`,
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

test('fk #7', async () => {
	const users = mssqlTable('users', {
		id1: int().primaryKey(),
		id2: int().references((): AnyMsSqlColumn => users.id1),
	});

	const users2 = mssqlTable('users', {
		id1: int().primaryKey(),
		id2: int(),
	}, (t) => [foreignKey({ name: 'id2_id1_fk', columns: [t.id2], foreignColumns: [t.id1] })]);

	const from = { users };
	const to = { users: users2 };

	const renames = ['dbo.users.users_id2_users_id1_fk->dbo.users.id2_id1_fk'];
	const { sqlStatements } = await diff(from, to, renames);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to, renames, schemas: ['dbo'] });

	const e = [
		`EXEC sp_rename 'users_id2_users_id1_fk', [id2_id1_fk], 'OBJECT';`,
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

test('fk #8', async () => {
	const users = mssqlTable('users', {
		id1: int().primaryKey(),
		id2: int().unique(),
		id3: int().references((): AnyMsSqlColumn => users.id1),
	});

	const users2 = mssqlTable('users', {
		id1: int().primaryKey(),
		id2: int().unique(),
		id3: int().references((): AnyMsSqlColumn => users.id2),
	});

	const from = { users };
	const to = { users: users2 };

	const { sqlStatements } = await diff(from, to, []);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to, schemas: ['dbo'] });

	const e = [
		'ALTER TABLE [users] DROP CONSTRAINT [users_id3_users_id1_fk];\n',
		'ALTER TABLE [users] ADD CONSTRAINT [users_id3_users_id2_fk] FOREIGN KEY ([id3]) REFERENCES [users]([id2]);',
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

test('fk #9', async () => {
	const users = mssqlTable('users', {
		id1: int().primaryKey(),
		id2: int().unique(),
		id3: int(),
	}, (t) => [foreignKey({ name: 'fk1', columns: [t.id3], foreignColumns: [t.id1] })]);

	const users2 = mssqlTable('users', {
		id1: int().primaryKey(),
		id2: int().unique(),
		id3: int(),
	}, (t) => [foreignKey({ name: 'fk1', columns: [t.id3], foreignColumns: [t.id2] })]);

	const from = { users };
	const to = { users: users2 };

	const { sqlStatements } = await diff(from, to, []);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to, schemas: ['dbo'] });

	const e = [
		`ALTER TABLE [users] DROP CONSTRAINT [fk1];\n`,
		`ALTER TABLE [users] ADD CONSTRAINT [fk1] FOREIGN KEY ([id3]) REFERENCES [users]([id2]);`,
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

test('fk #10', async () => {
	const users = mssqlTable('users', {
		id1: int().primaryKey(),
	});

	const users2 = mssqlTable('users2', {
		id1: int().primaryKey(),
		id2: int().references((): AnyMsSqlColumn => users2.id1),
	});

	const from = { users };
	const to = { users: users2 };

	const renames = ['dbo.users->dbo.users2'];
	const { sqlStatements } = await diff(from, to, renames);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to, renames, schemas: ['dbo'] });

	const e = [
		`EXEC sp_rename 'users', [users2];`,
		'ALTER TABLE [users2] ADD [id2] int;',
		'ALTER TABLE [users2] ADD CONSTRAINT [users2_id2_users2_id1_fk] FOREIGN KEY ([id2]) REFERENCES [users2]([id1]);',
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

test('fk #11', async () => {
	const users = mssqlTable('users', {
		id1: int().primaryKey(),
		id2: int().references((): AnyMsSqlColumn => users.id1),
	});

	const users2 = mssqlTable('users2', {
		id1: int().primaryKey(),
		id2: int(),
	});

	const from = { users };
	const to = { users: users2 };

	const renames = ['dbo.users->dbo.users2'];
	const { sqlStatements } = await diff(from, to, renames);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to, renames, schemas: ['dbo'] });

	const e = [
		`EXEC sp_rename 'users', [users2];`,
		'ALTER TABLE [users2] DROP CONSTRAINT [users_id2_users_id1_fk];\n',
	];
	expect(sqlStatements).toStrictEqual(e);
	expect(pst).toStrictEqual(e);
});

test('fk multistep #1', async () => {
	const users = mssqlTable('users', {
		id: int().primaryKey(),
		id2: int().references((): AnyMsSqlColumn => users.id),
	});

	const users2 = mssqlTable('users2', {
		id: int('id3').primaryKey(),
		id2: int().references((): AnyMsSqlColumn => users2.id),
	});

	const sch1 = { users };
	const sch2 = { users: users2 };

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1, schemas: ['dbo'] });

	const e1 = [
		'CREATE TABLE [users] (\n\t[id] int,\n\t[id2] int,\n\tCONSTRAINT [users_pkey] PRIMARY KEY([id])\n);\n',
		'ALTER TABLE [users] ADD CONSTRAINT [users_id2_users_id_fk] FOREIGN KEY ([id2]) REFERENCES [users]([id]);',
	];
	expect(st1).toStrictEqual(e1);
	expect(pst1).toStrictEqual(e1);

	const renames = ['dbo.users->dbo.users2', 'dbo.users2.id->dbo.users2.id3'];
	const { sqlStatements: st2, next: n2 } = await diff(n1, sch2, renames);
	const { sqlStatements: pst2 } = await push({ db, to: sch2, renames, schemas: ['dbo'] });

	const e2 = [
		`EXEC sp_rename 'users', [users2];`,
		`EXEC sp_rename 'users2.id', [id3], 'COLUMN';`,
	];
	expect(st2).toStrictEqual(e2);
	expect(pst2).toStrictEqual(e2);

	const { sqlStatements: st3, next: n3 } = await diff(n2, sch2, []);
	const { sqlStatements: pst3 } = await push({ db, to: sch2, schemas: ['dbo'] });

	expect(st3).toStrictEqual([]);
	expect(pst3).toStrictEqual([]);

	const users3 = mssqlTable('users2', {
		id: int('id3').primaryKey(),
		id2: int(),
	});
	const sch3 = { users: users3 };

	const { sqlStatements: st4 } = await diff(n3, sch3, []);
	const { sqlStatements: pst4 } = await push({ db, to: sch3, schemas: ['dbo'] });
	expect(st4).toStrictEqual(['ALTER TABLE [users2] DROP CONSTRAINT [users_id2_users_id_fk];\n']);
	expect(pst4).toStrictEqual(['ALTER TABLE [users2] DROP CONSTRAINT [users_id2_users_id_fk];\n']);
});

test('fk multistep #2', async () => {
	const users = mssqlTable('users', {
		id: int().primaryKey(),
		id2: int().references((): AnyMsSqlColumn => users.id),
	});

	const users2 = mssqlTable('users2', {
		id: int('id3').primaryKey(),
		id2: int().references((): AnyMsSqlColumn => users2.id),
	});

	const sch1 = { users };
	const sch2 = { users: users2 };

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1, schemas: ['dbo'] });

	const e1 = [
		'CREATE TABLE [users] (\n\t[id] int,\n\t[id2] int,\n\tCONSTRAINT [users_pkey] PRIMARY KEY([id])\n);\n',
		'ALTER TABLE [users] ADD CONSTRAINT [users_id2_users_id_fk] FOREIGN KEY ([id2]) REFERENCES [users]([id]);',
	];
	expect(st1).toStrictEqual(e1);
	expect(pst1).toStrictEqual(e1);

	const { sqlStatements: st2, next: n2 } = await diff(n1, sch2, []);
	const { sqlStatements: pst2 } = await push({ db, to: sch2, schemas: ['dbo'] });

	const e2 = [
		'CREATE TABLE [users2] (\n\t[id3] int,\n\t[id2] int,\n\tCONSTRAINT [users2_pkey] PRIMARY KEY([id3])\n);\n',
		'DROP TABLE [users];',
		'ALTER TABLE [users2] ADD CONSTRAINT [users2_id2_users2_id3_fk] FOREIGN KEY ([id2]) REFERENCES [users2]([id3]);',
	];
	expect(st2).toStrictEqual(e2);
	expect(pst2).toStrictEqual(e2);

	const { sqlStatements: st3 } = await diff(n2, sch2, []);
	const { sqlStatements: pst3 } = await push({ db, to: sch2, schemas: ['dbo'] });

	expect(st3).toStrictEqual([]);
	expect(pst3).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4456#issuecomment-3076042688
test('fk multistep #3', async () => {
	const foo = mssqlTable('foo', {
		id: int().primaryKey(),
	});

	const bar = mssqlTable('bar', {
		id: int().primaryKey(),
		fooId: int().references(() => foo.id),
	});

	const schema1 = { foo, bar };

	const { sqlStatements: st1, next: n1 } = await diff({}, schema1, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema1 });
	const expectedSt1 = [
		'CREATE TABLE [foo] (\n\t[id] int,\n\tCONSTRAINT [foo_pkey] PRIMARY KEY([id])\n);\n',
		'CREATE TABLE [bar] (\n\t[id] int,\n\t[fooId] int,\n\tCONSTRAINT [bar_pkey] PRIMARY KEY([id])\n);\n',
		'ALTER TABLE [bar] ADD CONSTRAINT [bar_fooId_foo_id_fk] FOREIGN KEY ([fooId]) REFERENCES [foo]([id]);',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const schema2 = {
		bar: mssqlTable('bar', {
			id: int().primaryKey(),
			fooId: int(),
		}),
	};
	const { sqlStatements: st2 } = await diff(n1, schema2, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema2 });
	const expectedSt2 = [
		'ALTER TABLE [bar] DROP CONSTRAINT [bar_fooId_foo_id_fk];\n',
		'DROP TABLE [foo];',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

test('add check', async () => {
	const schema1 = {
		table: mssqlTable('table', {
			id: int(),
		}),
	};

	const schema2 = {
		table: mssqlTable('table', {
			id: int(),
		}, (t) => [check('new_check', sql`${t.id} != 10`), check('new_check2', sql`${t.id} != 10`)]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);
	await push({ db, to: schema1, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to: schema2, schemas: ['dbo'] });

	const st0 = [
		'ALTER TABLE [table] ADD CONSTRAINT [new_check] CHECK ([table].[id] != 10);',
		'ALTER TABLE [table] ADD CONSTRAINT [new_check2] CHECK ([table].[id] != 10);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop check', async () => {
	const schema1 = {
		table: mssqlTable('table', {
			id: int(),
		}, (t) => [check('new_check', sql`${t.id} != 10`)]),
	};

	const schema2 = {
		table: mssqlTable('table', {
			id: int(),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);
	await push({ db, to: schema1, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to: schema2, schemas: ['dbo'] });

	const st0 = [
		'ALTER TABLE [table] DROP CONSTRAINT [new_check];',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create table with check', async (t) => {
	const to = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}, (table) => [check('some_check_name', sql`${table.age} > 21`)]),
	};

	const { sqlStatements: st } = await diff({}, to, []);
	const { sqlStatements: pst } = await push({ db, to: to, schemas: ['dbo'] });

	const st0 = [`CREATE TABLE [users] (
\t[id] int,
\t[age] int,
\tCONSTRAINT [users_pkey] PRIMARY KEY([id]),
\tCONSTRAINT [some_check_name] CHECK ([users].[age] > 21)
);\n`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add check contraint to existing table', async (t) => {
	const from = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}),
	};

	const to = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}, (table) => [
			check('some_check_name', sql`${table.age} > 21`),
		]),
	};

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to: to, schemas: ['dbo'] });

	const st0 = [
		`ALTER TABLE [users] ADD CONSTRAINT [some_check_name] CHECK ([users].[age] > 21);`,
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop check contraint in existing table', async (t) => {
	const from = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}, (table) => [check('some_check_name', sql`${table.age} > 21`)]),
	};

	const to = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to: to, schemas: ['dbo'] });

	const st0 = [
		`ALTER TABLE [users] DROP CONSTRAINT [some_check_name];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('recreate check constraint (renamed)', async (t) => {
	const from = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}, (table) => [check('some_check_name', sql`${table.age} > 21`)]),
	};

	const to = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}, (table) => [check('new_check_name', sql`${table.age} > 21`)]),
	};

	const { sqlStatements } = await diff(from, to, []);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE [users] DROP CONSTRAINT [some_check_name];`,
		`ALTER TABLE [users] ADD CONSTRAINT [new_check_name] CHECK ([users].[age] > 21);`,
	]);
});

test('rename check constraint', async (t) => {
	const from = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}, (table) => [check('some_check_name', sql`${table.age} > 21`)]),
	};

	const to = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}, (table) => [check('new_check_name', sql`${table.age} > 21`)]),
	};

	const { sqlStatements: st } = await diff(from, to, ['dbo.users.some_check_name->dbo.users.new_check_name']);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to: to,
		schemas: ['dbo'],
		renames: ['dbo.users.some_check_name->dbo.users.new_check_name'],
	});

	const st0 = [
		`EXEC sp_rename 'some_check_name', [new_check_name], 'OBJECT';`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter check constraint (definition)', async (t) => {
	const from = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}, (table) => [check('some_check_name', sql`${table.age} > 21`)]),
	};

	const to = {
		users: mssqlTable('users', {
			id: int('id').primaryKey(),
			age: int('age'),
		}, (table) => [check('some_check_name', sql`${table.age} > 10`)]),
	};

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to: to, schemas: ['dbo'] });

	expect(st).toStrictEqual([
		`ALTER TABLE [users] DROP CONSTRAINT [some_check_name];`,
		`ALTER TABLE [users] ADD CONSTRAINT [some_check_name] CHECK ([users].[age] > 10);`,
	]);
	expect(pst).toStrictEqual([]);
});

test('alter multiple check constraints (rename)', async (t) => {
	const from = {
		users: mssqlTable(
			'users',
			{
				id: int('id').primaryKey(),
				age: int('age'),
				name: varchar('name'),
			},
			(
				table,
			) => [
				check('some_check_name_1', sql`${table.age} > 21`),
				check('some_check_name_2', sql`${table.name} != 'Alex'`),
			],
		),
	};

	const to = {
		users: mssqlTable(
			'users',
			{
				id: int('id').primaryKey(),
				age: int('age'),
				name: varchar('name'),
			},
			(
				table,
			) => [
				check('some_check_name_3', sql`${table.age} > 21`),
				check('some_check_name_4', sql`${table.name} != 'Alex'`),
			],
		),
	};

	const { sqlStatements: st } = await diff(from, to, []);
	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to: to, schemas: ['dbo'] });

	const st0 = [
		`ALTER TABLE [users] DROP CONSTRAINT [some_check_name_1];`,
		`ALTER TABLE [users] DROP CONSTRAINT [some_check_name_2];`,
		`ALTER TABLE [users] ADD CONSTRAINT [some_check_name_3] CHECK ([users].[age] > 21);`,
		`ALTER TABLE [users] ADD CONSTRAINT [some_check_name_4] CHECK ([users].[name] != 'Alex');`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create checks with same names', async (t) => {
	const to = {
		users: mssqlTable(
			'users',
			{
				id: int('id').primaryKey(),
				age: int('age'),
				name: varchar('name'),
			},
			(
				table,
			) => [check('some_check_name', sql`${table.age} > 21`), check('some_check_name', sql`${table.name} != 'Alex'`)],
		),
	};

	// 'constraint_name_duplicate'
	await expect(diff({}, to, [])).rejects.toThrow();
	await expect(push({ db, to: to, schemas: ['dbo'] })).rejects.toThrow();
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

	const { sqlStatements: st } = await diff(schema1, schema2, [`dbo.users->dbo.users2`]);
	await push({ db, to: schema1, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to: schema2, schemas: ['dbo'], renames: [`dbo.users->dbo.users2`] });

	expect(st).toStrictEqual([
		`EXEC sp_rename 'users', [users2];`,
		'ALTER TABLE [users2] DROP CONSTRAINT [hello_world];',
		"ALTER TABLE [users2] ADD CONSTRAINT [hello_world] CHECK ([users2].[name] != 'Alex');",
	]);
	expect(pst).toStrictEqual([`EXEC sp_rename 'users', [users2];`]); // do not trigger on definition change when using push
});

test('add composite pks on existing table', async (t) => {
	const schema1 = {
		users: mssqlTable('users', {
			id1: int('id1').notNull(),
			id2: int('id2').notNull(),
		}),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id1: int('id1').notNull(),
			id2: int('id2').notNull(),
		}, (t) => [primaryKey({ columns: [t.id1, t.id2], name: 'compositePK' })]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);
	await push({ db, to: schema1, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({ db, to: schema2, schemas: ['dbo'] });

	const st0 = ['ALTER TABLE [users] ADD CONSTRAINT [compositePK] PRIMARY KEY ([id1],[id2]);'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('default #1', async () => {
	const from = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }).default('hey'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to,
		schemas: ['dbo'],
	});

	const st0 = [
		`ALTER TABLE [users] ADD CONSTRAINT [users_name_default] DEFAULT ('hey') FOR [name];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('default #2', async () => {
	const from = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }).default('hey'),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }).default('hey'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to,
		schemas: ['dbo'],
	});

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('default #3', async () => {
	const from = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }).default('hey'),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }).default('hey1'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to,
		schemas: ['dbo'],
		renames: [],
	});

	const st0 = [
		'ALTER TABLE [users] DROP CONSTRAINT [users_name_default];',
		"ALTER TABLE [users] ADD CONSTRAINT [users_name_default] DEFAULT ('hey1') FOR [name];",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('default #4', async () => {
	const mySchema = mssqlSchema('my_schema');
	const from = {
		mySchema,
		users: mySchema.table('users', {
			name: varchar({ length: 255 }).default('hey'),
		}),
	};
	const to = {
		mySchema,
		users: mySchema.table('users', {
			name: varchar('name2', { length: 255 }).default('hey'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, [
		'my_schema.users.name->my_schema.users.name2',
	]);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames: [
			'my_schema.users.name->my_schema.users.name2',
		],
	});

	const st0 = [
		"EXEC sp_rename 'my_schema.users.name', [name2], 'COLUMN';",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

/* rename table */
test('default #5', async () => {
	const from = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }),
			email: varchar({ length: 255 }).unique(),
		}),
	};
	const to = {
		users: mssqlTable('users2', {
			name: varchar({ length: 255 }),
			email: varchar({ length: 255 }).unique(),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, [
		'dbo.users->dbo.users2',
	]);

	await push({ db, to: from, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to,
		schemas: ['dbo'],
		renames: [
			'dbo.users->dbo.users2',
		],
	});

	const st0 = [
		`EXEC sp_rename 'users', [users2];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('default multistep #1', async () => {
	const sch1 = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }).default('hey'),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1, schemas: ['dbo'] });

	const e1 = [
		"CREATE TABLE [users] (\n\t[name] varchar(255) CONSTRAINT [users_name_default] DEFAULT ('hey')\n);\n",
	];
	expect(st1).toStrictEqual(e1);
	expect(pst1).toStrictEqual(e1);

	const sch2 = {
		users: mssqlTable('users2', {
			name: varchar('name2', { length: 255 }).default('hey'),
		}),
	};

	const renames = ['dbo.users->dbo.users2', 'dbo.users2.name->dbo.users2.name2'];
	const { sqlStatements: st2, next: n2 } = await diff(n1, sch2, renames);
	const { sqlStatements: pst2 } = await push({ db, to: sch2, renames, schemas: ['dbo'] });

	const e2 = [
		`EXEC sp_rename 'users', [users2];`,
		`EXEC sp_rename 'users2.name', [name2], 'COLUMN';`,
	];
	expect(st2).toStrictEqual(e2);
	expect(pst2).toStrictEqual(e2);

	const { sqlStatements: st3, next: n3 } = await diff(n2, sch2, []);
	const { sqlStatements: pst3 } = await push({ db, to: sch2, schemas: ['dbo'] });

	expect(st3).toStrictEqual([]);
	expect(pst3).toStrictEqual([]);

	const sch3 = {
		users: mssqlTable('users2', {
			name: varchar('name2', { length: 255 }),
		}),
	};

	const { sqlStatements: st4 } = await diff(n3, sch3, []);
	const { sqlStatements: pst4 } = await push({ db, to: sch3, schemas: ['dbo'] });

	const e3 = ['ALTER TABLE [users2] DROP CONSTRAINT [users_name_default];'];

	expect(pst4).toStrictEqual(e3);
	expect(st4).toStrictEqual(e3);
});

test('default multistep #2', async () => {
	const sch1 = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }).default('hey'),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, sch1, []);
	const { sqlStatements: pst1 } = await push({ db, to: sch1, schemas: ['dbo'] });

	expect(st1).toStrictEqual([
		"CREATE TABLE [users] (\n\t[name] varchar(255) CONSTRAINT [users_name_default] DEFAULT ('hey')\n);\n",
	]);
	expect(pst1).toStrictEqual([
		"CREATE TABLE [users] (\n\t[name] varchar(255) CONSTRAINT [users_name_default] DEFAULT ('hey')\n);\n",
	]);

	const sch2 = {
		users: mssqlTable('users2', {
			name: varchar('name2', { length: 255 }).default('hey'),
		}),
	};

	const renames = ['dbo.users->dbo.users2', 'dbo.users2.name->dbo.users2.name2'];
	const { sqlStatements: st2, next: n2 } = await diff(n1, sch2, renames);
	const { sqlStatements: pst2 } = await push({ db, to: sch2, renames, schemas: ['dbo'] });

	const e2 = [
		`EXEC sp_rename 'users', [users2];`,
		`EXEC sp_rename 'users2.name', [name2], 'COLUMN';`,
	];
	expect(st2).toStrictEqual(e2);
	expect(pst2).toStrictEqual(e2);

	const { sqlStatements: st3, next: n3 } = await diff(n2, sch2, []);
	const { sqlStatements: pst3 } = await push({ db, to: sch2, schemas: ['dbo'] });

	expect(st3).toStrictEqual([]);
	expect(pst3).toStrictEqual([]);

	const sch3 = {
		users: mssqlTable('users2', {
			name: varchar('name2', { length: 255 }).default('hey1'),
		}),
	};

	const { sqlStatements: st4, next: n4 } = await diff(n3, sch3, []);
	const { sqlStatements: pst4 } = await push({ db, to: sch3, schemas: ['dbo'] });

	const e4 = [
		'ALTER TABLE [users2] DROP CONSTRAINT [users_name_default];',
		"ALTER TABLE [users2] ADD CONSTRAINT [users2_name2_default] DEFAULT ('hey1') FOR [name2];",
	];
	expect(st4).toStrictEqual(e4);
	expect(pst4).toStrictEqual(e4);

	const sch4 = {
		users: mssqlTable('users2', {
			name: varchar('name2', { length: 255 }),
		}),
	};

	const { sqlStatements: st5 } = await diff(n4, sch4, []);
	const { sqlStatements: pst5 } = await push({ db, to: sch4, schemas: ['dbo'] });
	expect(st5).toStrictEqual(['ALTER TABLE [users2] DROP CONSTRAINT [users2_name2_default];']);
	expect(pst5).toStrictEqual(['ALTER TABLE [users2] DROP CONSTRAINT [users2_name2_default];']);
});

test('unique duplicate name', async (t) => {
	const from = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }),
			age: int(),
		}),
		users2: mssqlTable('users2', {
			name: varchar({ length: 255 }),
			age: int(),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }),
			age: int(),
		}, (t) => [unique('test').on(t.name)]),
		users2: mssqlTable('users2', {
			name: varchar({ length: 255 }),
			age: int(),
		}, (t) => [unique('test').on(t.name)]),
	};

	await push({ db, to: from });

	await expect(diff(from, to, [])).rejects.toThrowError();
	await expect(push({ db, to })).rejects.toThrowError();
});

test('pk duplicate name', async (t) => {
	const from = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }),
			age: int(),
		}),
		users2: mssqlTable('users2', {
			name: varchar({ length: 255 }),
			age: int(),
		}),
	};
	const to = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }),
			age: int(),
		}, (t) => [primaryKey({ name: 'test', columns: [t.name] })]),
		users2: mssqlTable('users2', {
			name: varchar({ length: 255 }),
			age: int(),
		}, (t) => [primaryKey({ name: 'test', columns: [t.name] })]),
	};

	await push({ db, to: from });

	await expect(diff(from, to, [])).rejects.toThrowError();
	await expect(push({ db, to })).rejects.toThrowError();
});

test('fk duplicate name', async (t) => {
	const users = mssqlTable('users', {
		name: varchar({ length: 255 }).primaryKey(),
		age: int().unique(),
	});
	const from = {
		users,
		users2: mssqlTable('users2', {
			name: varchar({ length: 255 }),
			age: int(),
		}),
	};
	const to = {
		users,
		users2: mssqlTable(
			'users2',
			{
				name: varchar({ length: 255 }),
				age: int(),
			},
			(
				t,
			) => [
				foreignKey({ name: 'test', columns: [t.age], foreignColumns: [users.age] }),
				foreignKey({ name: 'test', columns: [t.name], foreignColumns: [users.name] }),
			],
		),
	};

	await push({ db, to: from });

	await expect(diff(from, to, [])).rejects.toThrowError();
	await expect(push({ db, to })).rejects.toThrowError();
});

test('index duplicate name', async (t) => {
	const to = {
		users: mssqlTable('users', {
			name: varchar({ length: 255 }).primaryKey(),
			age: int().unique(),
		}, (t) => [index('test').on(t.age), index('test').on(t.name)]),
	};

	await expect(diff({}, to, [])).rejects.toThrowError();
	await expect(push({ db, to })).rejects.toThrowError();
});

// https://github.com/drizzle-team/drizzle-orm/issues/4456
test('drop column with pk and add pk to another column #1', async () => {
	const schema1 = {
		authors: mssqlTable('authors', {
			publicationId: varchar('publication_id', { length: 64 }),
			authorID: varchar('author_id', { length: 10 }),
		}, (table) => [
			primaryKey({ columns: [table.publicationId, table.authorID] }),
		]),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, schema1, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema1 });
	const expectedSt1 = [
		'CREATE TABLE [authors] (\n\t[publication_id] varchar(64),\n\t[author_id] varchar(10),'
		+ '\n\tCONSTRAINT [authors_pkey] PRIMARY KEY([publication_id],[author_id])\n);\n',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const schema2 = {
		authors: mssqlTable('authors', {
			publicationId: varchar('publication_id', { length: 64 }),
			authorID: varchar('author_id', { length: 10 }),
			orcidId: varchar('orcid_id', { length: 64 }),
		}, (table) => [
			primaryKey({ columns: [table.publicationId, table.authorID, table.orcidId] }),
		]),
	};

	const { sqlStatements: st2 } = await diff(n1, schema2, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema2 });

	const expectedSt2: string[] = [
		'ALTER TABLE [authors] DROP CONSTRAINT [authors_pkey];',
		/*
			HAS TO BE NOT NULL, othervise:

			ALTER TABLE [authors] ADD CONSTRAINT [authors_pkey] PRIMARY KEY ([publication_id],[author_id],[orcid_id]);
			Error: Could not create constraint or index. See previous errors.
		*/
		'ALTER TABLE [authors] ADD [orcid_id] varchar(64) NOT NULL;',
		'ALTER TABLE [authors] ADD CONSTRAINT [authors_pkey] PRIMARY KEY ([publication_id],[author_id],[orcid_id]);',
	];

	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

// https://github.com/drizzle-team/drizzle-orm/issues/5182
test('constraints in different schemas', async () => {
	const userSchema = mssqlSchema('user_schema');

	const users = userSchema.table('users', {
		id: int().identity().primaryKey(),
		name: nvarchar({ length: 255 }).notNull(),
		email: nvarchar({ length: 255 }).notNull().unique(),
	});

	const orgSchema = mssqlSchema('org_schema');

	const orgRoleAssignments = orgSchema.table('org_role_assignments', {
		id: int().identity().notNull().primaryKey(),
		idUser: int('id_user')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		canApply: bit('can_apply').default(false).notNull(),
		canApprove: bit('can_approve').default(false).notNull(),
	});

	const schema1 = { userSchema, users, orgSchema, orgRoleAssignments };

	const { sqlStatements: st1, next: n1 } = await diff({}, schema1, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema1 });

	const expectedSt2: string[] = [
		'CREATE SCHEMA [user_schema];\n',
		'CREATE SCHEMA [org_schema];\n',
		`CREATE TABLE [user_schema].[users] (
\t[id] int IDENTITY(1, 1),
\t[name] nvarchar(255) NOT NULL,
\t[email] nvarchar(255) NOT NULL,
\tCONSTRAINT [users_pkey] PRIMARY KEY([id]),
\tCONSTRAINT [users_email_key] UNIQUE([email])
);\n`,
		`CREATE TABLE [org_schema].[org_role_assignments] (
\t[id] int IDENTITY(1, 1),
\t[id_user] int NOT NULL,
\t[can_apply] bit NOT NULL CONSTRAINT [org_role_assignments_can_apply_default] DEFAULT ((0)),
\t[can_approve] bit NOT NULL CONSTRAINT [org_role_assignments_can_approve_default] DEFAULT ((0)),
\tCONSTRAINT [org_role_assignments_pkey] PRIMARY KEY([id])
);\n`,
		`ALTER TABLE [org_schema].[org_role_assignments] ADD CONSTRAINT [org_role_assignments_id_user_users_id_fk] FOREIGN KEY ([id_user]) REFERENCES [user_schema].[users]([id]) ON DELETE CASCADE;`,
	];
	expect(st1).toStrictEqual(expectedSt2);
	expect(pst1).toStrictEqual(expectedSt2);
});
