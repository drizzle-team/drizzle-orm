import {
	bigint,
	check,
	foreignKey,
	int,
	mssqlSchema,
	mssqlTable,
	mssqlView,
	smallint,
	text,
	varchar,
} from 'drizzle-orm/mssql-core';
import { eq, sql } from 'drizzle-orm/sql';
// import { suggestions } from 'src/cli/commands/push-mssql';
import { DB } from 'src/utils';
import { diff, prepareTestDatabase, push, TestDatabase } from 'tests/mssql/mocks';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';

// @vitest-environment-options {"max-concurrency":1}
let _: TestDatabase;
let db: DB;

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

// identity push tests
test('create table: identity - no params', async () => {
	const schema1 = {};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id').identity(),
			id1: bigint('id1', { mode: 'number' }),
			id2: smallint('id2'),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		schemas: ['dbo'],
	});

	const st0: string[] = [
		`CREATE TABLE [users] (
\t[id] int IDENTITY(1, 1),
\t[id1] bigint,
\t[id2] smallint
);\n`,
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('view encryption', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey().notNull(),
	});

	const schema = {
		users,
		view: mssqlView('some_view').with({ encryption: true })
			.as((
				qb,
			) => qb.select().from(users)),
	};

	const { sqlStatements: st } = await diff(schema, schema, []);

	await push({ db, to: schema });
	const { sqlStatements: pst } = await push({ db, to: schema });

	expect(st).toStrictEqual([]);
	expect(pst).toStrictEqual([]);
});

test('create table: identity always/by default - with params', async () => {
	const schema1 = {};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id').identity({
				increment: 4,
				seed: 3,
			}),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		schemas: ['dbo'],
	});

	const st0: string[] = [
		`CREATE TABLE [users] (
\t[id] int IDENTITY(3, 4)
);\n`,
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('no diff: identity always/by default - no params', async () => {
	const schema1 = {
		users: mssqlTable('users', {
			id: int('id').identity(),
		}),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id').identity(),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		schemas: ['dbo'],
	});

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('no diff: identity always/by default - all params', async () => {
	const schema1 = {
		users: mssqlTable('users', {
			id: int('id').identity({
				seed: 1,
				increment: 1,
			}),
		}),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id').identity({
				seed: 1,
				increment: 1,
			}),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		schemas: ['dbo'],
	});

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop identity from a column - no params', async () => {
	const schema1 = {
		users: mssqlTable('users', {
			id: int('id').identity(),
		}),
	};

	const schema2 = {
		users: mssqlTable('users', {
			id: int('id'),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		schemas: ['dbo'],
	});

	const st0: string[] = [
		`EXEC sp_rename 'users.id', [__old_id], 'COLUMN';`,
		`ALTER TABLE [users] ADD [id] int;`,
		`INSERT INTO [users] ([id]) SELECT [__old_id] FROM [users];`,
		`ALTER TABLE [users] DROP COLUMN [__old_id];`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add column with identity - no params', async () => {
	const schema1 = {
		users: mssqlTable('users', {
			email: text('email'),
		}),
	};

	const schema2 = {
		users: mssqlTable('users', {
			email: text('email'),
			id: int('id').identity(),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		schemas: ['dbo'],
	});

	const st0: string[] = [
		'ALTER TABLE [users] ADD [id] int IDENTITY(1, 1);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create view', async () => {
	const table = mssqlTable('test', {
		id: int('id').primaryKey(),
	});
	const schema1 = {
		test: table,
	};

	const schema2 = {
		test: table,
		view: mssqlView('view').as((qb) => qb.selectDistinct().from(table)),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		schemas: ['dbo'],
	});

	const st0: string[] = [
		'CREATE VIEW [view] AS select distinct [id] from [test];',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add check constraint to table', async () => {
	const schema1 = {
		test: mssqlTable('test', {
			id: int('id').primaryKey(),
			values: int('values').default(2),
		}),
	};
	const schema2 = {
		test: mssqlTable('test', {
			id: int('id').primaryKey(),
			values: int('values').default(2),
		}, (table) => [
			check('some_check1', sql`${table.values} < 100`),
		]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		schemas: ['dbo'],
	});

	const st0: string[] = [
		'ALTER TABLE [test] ADD CONSTRAINT [some_check1] CHECK ([test].[values] < 100);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop check constraint', async () => {
	const schema1 = {
		test: mssqlTable('test', {
			id: int('id').primaryKey(),
			values: int('values').default(1),
		}, (table) => [
			check('some_check', sql`${table.values} < 100`),
		]),
	};
	const schema2 = {
		test: mssqlTable('test', {
			id: int('id').primaryKey(),
			values: int('values').default(1),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		schemas: ['dbo'],
	});

	const st0: string[] = [
		'ALTER TABLE [test] DROP CONSTRAINT [some_check];',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter check constraint', async () => {
	const schema1 = {
		test: mssqlTable('test', {
			id: int('id').primaryKey(),
			values: int('values').default(1),
		}, (table) => [
			check('some_check', sql`${table.values} < 100`),
		]),
	};
	const schema2 = {
		test: mssqlTable('test', {
			id: int('id').primaryKey(),
			values: int('values').default(1),
		}, (table) => [
			check('some_check', sql`${table.values} < 10`),
		]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		schemas: ['dbo'],
	});

	// Only diff should find changes
	expect(st).toStrictEqual([
		'ALTER TABLE [test] DROP CONSTRAINT [some_check];',
		'ALTER TABLE [test] ADD CONSTRAINT [some_check] CHECK ([test].[values] < 10);',
	]);
	expect(pst).toStrictEqual([]);
});

test('db has checks. Push with same names', async () => {
	const schema1 = {
		test: mssqlTable('test', {
			id: int('id').primaryKey(),
			values: int('values').default(1),
		}, (table) => [check('some_check', sql`${table.values} < 100`)]),
	};
	const schema2 = {
		test: mssqlTable('test', {
			id: int('id').primaryKey(),
			values: int('values').default(1),
		}, (table) => [check('some_check', sql`1=1`)]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		schemas: ['dbo'],
	});

	expect(st).toStrictEqual([
		`ALTER TABLE [test] DROP CONSTRAINT [some_check];`,
		`ALTER TABLE [test] ADD CONSTRAINT [some_check] CHECK (1=1);`,
	]);
	expect(pst).toStrictEqual([]);
});

test('drop view', async () => {
	const table = mssqlTable('test', {
		id: int('id').primaryKey(),
	});
	const schema1 = {
		test: table,
		view: mssqlView('view').as((qb) => qb.selectDistinct().from(table)),
	};

	const schema2 = {
		test: table,
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		schemas: ['dbo'],
	});

	const st0: string[] = [
		'DROP VIEW [view];',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter view definition', async () => {
	const table = mssqlTable('test', {
		id: int('id').primaryKey(),
	});
	const schema1 = {
		test: table,
		view: mssqlView('view').as((qb) => qb.selectDistinct().from(table)),
	};

	const schema2 = {
		test: table,
		view: mssqlView('view').as((qb) => qb.selectDistinct().from(table).where(eq(table.id, 1))),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, schemas: ['dbo'] });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		schemas: ['dbo'],
	});

	expect(st).toStrictEqual([
		`ALTER VIEW [view] AS select distinct [id] from [test] where [test].[id] = 1;`,
	]);
	expect(pst).toStrictEqual([]);
});

test('drop view with data', async () => {
	const table = mssqlTable('table', {
		id: int('id').primaryKey(),
	});
	const schema1 = {
		test: table,
		view: mssqlView('view', {}).as(sql`SELECT * FROM ${table}`),
	};

	const schema2 = {
		test: table,
	};

	const seedStatements = [`INSERT INTO [table] ([id]) VALUES (1), (2), (3)`];

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1, schemas: ['dbo'] });
	const { sqlStatements: pst, hints: phints } = await push({
		db,
		to: schema2,
		schemas: ['dbo'],
	});

	// seeding
	for (const seedSt of seedStatements) {
		await db.query(seedSt);
	}

	const st0: string[] = [
		`DROP VIEW [view];`,
	];
	// const hints0: string[] = [];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
	// expect(phints).toStrictEqual(hints0);
});

test('fk multistep #1', async (t) => {
	const refTable = mssqlTable('ref', {
		id: int().identity(),
		name: varchar().unique(),
	});
	const sch1 = {
		refTable,
		users: mssqlTable('users', {
			name: varchar().unique().references(() => refTable.name),
		}),
	};

	const { sqlStatements: diffSt1 } = await diff({}, sch1, []);
	const { sqlStatements: st1 } = await push({ db, to: sch1, schemas: ['dbo'] });

	const st01 = [
		'CREATE TABLE [ref] (\n\t[id] int IDENTITY(1, 1),\n\t[name] varchar,\n\tCONSTRAINT [ref_name_key] UNIQUE([name])\n);\n',
		'CREATE TABLE [users] (\n\t[name] varchar,\n\tCONSTRAINT [users_name_key] UNIQUE([name])\n);\n',
		'ALTER TABLE [users] ADD CONSTRAINT [users_name_ref_name_fk] FOREIGN KEY ([name]) REFERENCES [ref]([name]);',
	];

	expect(st1).toStrictEqual(st01);
	expect(diffSt1).toStrictEqual(st01);

	const sch2 = {
		refTable,
		users: mssqlTable('users2', {
			name: varchar('name2').unique().references(() => refTable.name),
		}),
	};

	const renames = ['dbo.users->dbo.users2', 'dbo.users2.name->dbo.users2.name2'];
	const { sqlStatements: diffSt2 } = await diff(sch1, sch2, renames);
	const { sqlStatements: st2 } = await push({
		db,
		to: sch2,
		renames,
		schemas: ['dbo'],
	});

	const st02 = [
		`EXEC sp_rename 'users', [users2];`,
		`EXEC sp_rename 'users2.name', [name2], 'COLUMN';`,
	];

	expect(st2).toStrictEqual(st02);
	expect(diffSt2).toStrictEqual(st02);

	const { sqlStatements: diffSt3 } = await diff(sch2, sch2, []);
	const { sqlStatements: st3 } = await push({ db, to: sch2, schemas: ['dbo'] });

	expect(st3).toStrictEqual([]);
	expect(diffSt3).toStrictEqual([]);

	const sch3 = {
		refTable,
		users: mssqlTable('users2', {
			name: varchar('name2').unique(),
		}),
	};

	// TODO should we check diff here?
	// const { sqlStatements: diffSt4 } = await diff(sch2, sch3, []);
	const { sqlStatements: st4 } = await push({ db, to: sch3, schemas: ['dbo'] });

	const st04 = ['ALTER TABLE [users2] DROP CONSTRAINT [users_name_ref_name_fk];\n'];

	expect(st4).toStrictEqual(st04);
	// expect(diffSt4).toStrictEqual(st04);
});

test('fk multistep #2', async (t) => {
	const refTable = mssqlTable('ref', {
		id: int().identity(),
		name: varchar().unique(),
	});
	const sch1 = {
		refTable,
		users: mssqlTable('users', {
			name: varchar().unique().references(() => refTable.name),
		}),
	};

	const { sqlStatements: diffSt1 } = await diff({}, sch1, []);
	const { sqlStatements: st1 } = await push({ db, to: sch1, schemas: ['dbo'] });

	const st01 = [
		'CREATE TABLE [ref] (\n\t[id] int IDENTITY(1, 1),\n\t[name] varchar,\n\tCONSTRAINT [ref_name_key] UNIQUE([name])\n);\n',
		'CREATE TABLE [users] (\n\t[name] varchar,\n\tCONSTRAINT [users_name_key] UNIQUE([name])\n);\n',
		'ALTER TABLE [users] ADD CONSTRAINT [users_name_ref_name_fk] FOREIGN KEY ([name]) REFERENCES [ref]([name]);',
	];

	expect(st1).toStrictEqual(st01);
	expect(diffSt1).toStrictEqual(st01);

	const refTableRenamed = mssqlTable('ref2', {
		id: int().identity(),
		name: varchar('name2').unique(),
	});
	const sch2 = {
		refTable: refTableRenamed,
		users: mssqlTable('users', {
			name: varchar().unique().references(() => refTableRenamed.name),
		}),
	};

	const renames = ['dbo.ref->dbo.ref2', 'dbo.ref2.name->dbo.ref2.name2'];
	const { sqlStatements: diffSt2 } = await diff(sch1, sch2, renames);
	const { sqlStatements: st2 } = await push({
		db,
		to: sch2,
		renames,
		schemas: ['dbo'],
	});

	const st02 = [
		`EXEC sp_rename 'ref', [ref2];`,
		`EXEC sp_rename 'ref2.name', [name2], 'COLUMN';`,
	];

	expect(st2).toStrictEqual(st02);
	expect(diffSt2).toStrictEqual(st02);

	const { sqlStatements: diffSt3 } = await diff(sch2, sch2, []);
	const { sqlStatements: st3 } = await push({ db, to: sch2, schemas: ['dbo'] });

	expect(st3).toStrictEqual([]);
	expect(diffSt3).toStrictEqual([]);

	const sch3 = {
		refTable: refTableRenamed,
		users: mssqlTable('users', {
			name: varchar('name').unique(),
		}),
	};

	// TODO should we check diff here?
	// const { sqlStatements: diffSt4 } = await diff(sch2, sch3, []);
	const { sqlStatements: st4 } = await push({ db, to: sch3, schemas: ['dbo'] });

	const st04 = ['ALTER TABLE [users] DROP CONSTRAINT [users_name_ref_name_fk];\n'];

	expect(st4).toStrictEqual(st04);
	// expect(diffSt4).toStrictEqual(st04);
});

test('rename fk', async (t) => {
	const refTable = mssqlTable('ref', {
		id: int().identity(),
		name: varchar().unique(),
	});

	const sch1 = {
		refTable,
		users: mssqlTable('users', {
			name: varchar().unique(),
		}, (t) => [foreignKey({ name: 'some', columns: [t.name], foreignColumns: [refTable.name] })]),
	};

	const { sqlStatements: diffSt1 } = await diff({}, sch1, []);
	const { sqlStatements: st1 } = await push({ db, to: sch1, schemas: ['dbo'] });

	const st01 = [
		'CREATE TABLE [ref] (\n\t[id] int IDENTITY(1, 1),\n\t[name] varchar,\n\tCONSTRAINT [ref_name_key] UNIQUE([name])\n);\n',
		'CREATE TABLE [users] (\n\t[name] varchar,\n\tCONSTRAINT [users_name_key] UNIQUE([name])\n);\n',
		'ALTER TABLE [users] ADD CONSTRAINT [some] FOREIGN KEY ([name]) REFERENCES [ref]([name]);',
	];

	expect(st1).toStrictEqual(st01);
	expect(diffSt1).toStrictEqual(st01);

	const sch2 = {
		refTable,
		users: mssqlTable('users', {
			name: varchar().unique(),
		}, (t) => [foreignKey({ name: 'some_new', columns: [t.name], foreignColumns: [refTable.name] })]), // renamed fk
	};

	const renames = ['dbo.users.some->dbo.users.some_new'];
	const { sqlStatements: diffSt2 } = await diff(sch1, sch2, renames);
	const { sqlStatements: st2 } = await push({
		db,
		to: sch2,
		renames,
		schemas: ['dbo'],
	});

	const st02 = [
		`EXEC sp_rename 'some', [some_new], 'OBJECT';`,
	];

	expect(st2).toStrictEqual(st02);
	expect(diffSt2).toStrictEqual(st02);
});

test('hints + losses: drop table that is not empty', async (t) => {
	const from = {
		users: mssqlTable('users', {
			id: int(),
			name: varchar({ length: 200 }),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, from, []);
	const { sqlStatements: pst1 } = await push({ db, to: from });

	const st_01 = [
		'CREATE TABLE [users] (\n\t[id] int,\n\t[name] varchar(200)\n);\n',
	];

	expect(st1).toStrictEqual(st_01);
	expect(pst1).toStrictEqual(st_01);

	await db.query(`INSERT INTO [users] ([id], [name]) VALUES (1, 'Alex'), (2, 'Andrew');`);

	const { sqlStatements: st2 } = await diff(n1, {}, []);
	const { sqlStatements: pst2, hints, error } = await push({ db, to: {} });

	const st_02 = [
		'DROP TABLE [users];',
	];

	expect(st2).toStrictEqual(st_02);
	expect(pst2).toStrictEqual(st_02);
	expect(hints).toStrictEqual([{ hint: "· You're about to delete non-empty [users] table" }]);
	expect(error).toBeNull();
});

test('hints + losses: drop column that is not empty', async (t) => {
	const from = {
		users: mssqlTable('users', {
			id: int(),
			name: varchar({ length: 200 }),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, from, []);
	const { sqlStatements: pst1 } = await push({ db, to: from });

	const st_01 = [
		'CREATE TABLE [users] (\n\t[id] int,\n\t[name] varchar(200)\n);\n',
	];

	expect(st1).toStrictEqual(st_01);
	expect(pst1).toStrictEqual(st_01);

	await db.query(`INSERT INTO [users] ([id], [name]) VALUES (1, 'Alex'), (2, 'Andrew');`);

	const to = {
		users: mssqlTable('users', {
			id: int(),
		}),
	};

	const { sqlStatements: st2 } = await diff(from, to, []);
	const { sqlStatements: pst2, hints, error } = await push({ db, to: to });

	const st_02 = [
		'ALTER TABLE [users] DROP COLUMN [name];',
	];

	expect(st2).toStrictEqual(st_02);
	expect(pst2).toStrictEqual(st_02);
	expect(hints).toStrictEqual([{ hint: "· You're about to delete non-empty [name] column in [users] table" }]);
	expect(error).toBeNull();
});

test('hints + losses: drop column that is empty', async (t) => {
	const from = {
		users: mssqlTable('users', {
			id: int(),
			name: varchar({ length: 200 }),
		}),
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, from, []);
	const { sqlStatements: pst1 } = await push({ db, to: from });

	const st_01 = [
		'CREATE TABLE [users] (\n\t[id] int,\n\t[name] varchar(200)\n);\n',
	];

	expect(st1).toStrictEqual(st_01);
	expect(pst1).toStrictEqual(st_01);

	const to = {
		users: mssqlTable('users', {
			id: int(),
		}),
	};

	const { sqlStatements: st2 } = await diff(from, to, []);
	const { sqlStatements: pst2, hints, error } = await push({ db, to: to });

	const st_02 = [
		'ALTER TABLE [users] DROP COLUMN [name];',
	];

	expect(st2).toStrictEqual(st_02);
	expect(pst2).toStrictEqual(st_02);
	expect(hints).toStrictEqual([]);
	expect(error).toBeNull();
});

test('hints + losses: drop schema', async (t) => {
	const users = mssqlTable('users', {
		id: int(),
		name: varchar({ length: 200 }),
	});
	const from = {
		mySchema: mssqlSchema('my_schema'),
		users,
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, from, []);
	const { sqlStatements: pst1 } = await push({ db, to: from });

	const st_01 = [
		`CREATE SCHEMA [my_schema];\n`,
		'CREATE TABLE [users] (\n\t[id] int,\n\t[name] varchar(200)\n);\n',
	];

	expect(st1).toStrictEqual(st_01);
	expect(pst1).toStrictEqual(st_01);

	const to = {
		users,
	};

	const { sqlStatements: st2 } = await diff(from, to, []);
	const { sqlStatements: pst2, hints, error } = await push({ db, to: to });

	const st_02 = [
		'DROP SCHEMA [my_schema];\n',
	];

	expect(st2).toStrictEqual(st_02);
	expect(pst2).toStrictEqual(st_02);
	expect(hints).toStrictEqual([]);
	expect(error).toBeNull();
});

test('hints + losses: drop schema with tables', async (t) => {
	// user has a schema in db with table
	await db.query(`CREATE SCHEMA test;`);
	await db.query(`CREATE TABLE test.test(id int);`);

	const to = {
		users: mssqlTable('users', {
			id: int(),
			name: varchar({ length: 200 }),
		}),
	};

	const { sqlStatements: pst1, hints, error } = await push({ db, to: to });

	const st_01 = [
		`CREATE TABLE [users] (\n\t[id] int,\n\t[name] varchar(200)\n);\n`,
		'DROP TABLE [test].[test];',
		`DROP SCHEMA [test];\n`,
	];

	expect(pst1).toStrictEqual(st_01);
	expect(hints).toStrictEqual([{ hint: `· You're about to delete [test] schema with 1 table` }]);
	expect(error).toBeNull();
});

test('hints + losses: add column', async (t) => {
	const from = {
		users: mssqlTable('users', {
			id: int(),
			name: varchar({ length: 200 }),
		}),
	};

	await push({ db, to: from });

	await db.query(`INSERT INTO [users] ([id], [name]) VALUES (1, 'Alex'), (2, 'Andrew');`);

	const to = {
		users: mssqlTable('users', {
			id: int(),
			name: varchar({ length: 200 }),
			age: int(),
		}),
	};
	const { sqlStatements: pst1, hints, error } = await push({ db, to: to });

	const st_01 = [
		`ALTER TABLE [users] ADD [age] int;`,
	];

	expect(pst1).toStrictEqual(st_01);
	expect(hints).toStrictEqual([]);
	expect(error).toBeNull();
});

test('hints + losses: add column with not null without default', async (t) => {
	const from = {
		users: mssqlTable('users', {
			id: int(),
			name: varchar({ length: 200 }),
		}),
	};

	await push({ db, to: from });

	await db.query(`INSERT INTO [users] ([id], [name]) VALUES (1, 'Alex'), (2, 'Andrew');`);

	const to = {
		users: mssqlTable('users', {
			id: int(),
			name: varchar({ length: 200 }),
			age: int().notNull(),
		}),
	};
	const { sqlStatements: pst1, hints, error } = await push({
		db,
		to: to,
		expectError: true,
		ignoreSubsequent: true,
	});

	const st_01 = [
		`ALTER TABLE [users] ADD [age] int NOT NULL;`,
	];

	expect(pst1).toStrictEqual(st_01);
	expect(hints).toStrictEqual([
		{ hint: `· You're about to add not-null [age] column without default value to a non-empty [users] table` },
	]);
	expect(error).not.toBeNull();

	// await expect(push({ db, to: to, force: true, ignoreSubsequent: true })).resolves.not.toThrowError();
});
test('hints + losses: add column with not null without default #2', async (t) => {
	const from = {
		users: mssqlTable('users', {
			id: int(),
			name: varchar({ length: 200 }),
		}),
	};

	await push({ db, to: from });

	await db.query(`INSERT INTO [users] ([id], [name]) VALUES (1, 'Alex'), (2, 'Andrew');`);

	const to = {
		users: mssqlTable('users', {
			id: int(),
			name: varchar({ length: 200 }),
			age: int().notNull(),
		}),
	};
	const { sqlStatements: pst1, hints, error } = await push({
		db,
		to: to,
		expectError: true,
		ignoreSubsequent: true,
	});

	const st_01 = [
		`ALTER TABLE [users] ADD [age] int NOT NULL;`,
	];

	// expect(pst1).toStrictEqual(st_01);
	expect(hints).toStrictEqual([
		{ hint: `· You're about to add not-null [age] column without default value to a non-empty [users] table` },
	]);
});

test('hints + losses: add column with not null with default', async (t) => {
	const from = {
		users: mssqlTable('users', {
			id: int(),
			name: varchar({ length: 200 }),
		}),
	};

	await push({ db, to: from });

	await db.query(`INSERT INTO [users] ([id], [name]) VALUES (1, 'Alex'), (2, 'Andrew');`);

	const to = {
		users: mssqlTable('users', {
			id: int(),
			name: varchar({ length: 200 }),
			age: int().notNull().default(1),
		}),
	};
	const { sqlStatements: pst1, hints, error } = await push({ db, to: to });

	const st_01 = [
		`ALTER TABLE [users] ADD [age] int NOT NULL CONSTRAINT [users_age_default] DEFAULT ((1));`,
	];

	expect(pst1).toStrictEqual(st_01);
	expect(hints).toStrictEqual([]);
	expect(error).toBeNull();
});

test('hints + losses: alter column add not null without default', async (t) => {
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
			name: varchar({ length: 200 }).notNull(),
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
	];

	expect(pst1).toStrictEqual(st_01);
	expect(hints).toStrictEqual([
		{ hint: `· You're about to add not-null to [name] column without default value to a non-empty [users] table` },
	]);
	expect(error).not.toBeNull();

	// await expect(push({ db, to: to, force: true, ignoreSubsequent: true })).resolves.toThrowError();
});

test('hints + losses: alter column add not null without default #2', async (t) => {
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
			name: varchar({ length: 200 }).notNull(),
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
	];

	expect(pst1).toStrictEqual(st_01);
	expect(hints).toStrictEqual([
		{ hint: `· You're about to add not-null to [name] column without default value to a non-empty [users] table` },
	]);
	expect(error).not.toBeNull();

	await expect(push({ db, to: to, force: true, ignoreSubsequent: true })).rejects.toThrowError();
});

// TODO
// this should definitely fail
// MSSQL does not support altering column for adding default
//                                                                  not possible
// <ALTER TABLE [users] ALTER COLUMN [name] varchar(200) NOT NULL> !CONSTRAINT DEFAULT ...!;
//
// Even if to try change data type + add default + add not null
// MSSQL will not update existing NULLS to defaults, so this will not work
// Should add hints i believe for generate and push
test('hints + losses: alter column add not null with default', async (t) => {
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

test('hints + losses: add unique to column #1', async (t) => {
	const from = {
		users: mssqlTable('users', {
			id: int(),
			name: varchar({ length: 200 }),
		}),
	};

	await push({ db, to: from });

	await db.query(`INSERT INTO [users] ([id], [name]) VALUES (1, 'Alex'), (2, 'Andrew');`);

	const to = {
		users: mssqlTable('users', {
			id: int(),
			name: varchar({ length: 200 }).unique(),
		}),
	};
	const { sqlStatements: pst1, hints, error } = await push({ db, to: to });

	const st_01 = [
		`ALTER TABLE [users] ADD CONSTRAINT [users_name_key] UNIQUE([name]);`,
	];

	expect(pst1).toStrictEqual(st_01);
	expect(error).toBeNull();
});

test('hints + losses: add unique to column #2', async (t) => {
	const from = {
		users: mssqlTable('users', {
			id: int(),
			name: varchar({ length: 200 }),
		}),
	};

	await push({ db, to: from });

	await db.query(`INSERT INTO [users] ([id], [name]) VALUES (1, 'Alex'), (2, 'Alex');`);

	const to = {
		users: mssqlTable('users', {
			id: int(),
			name: varchar({ length: 200 }).unique(),
		}),
	};
	const { sqlStatements: pst1, hints, error } = await push({
		db,
		to: to,
		expectError: true,
		ignoreSubsequent: true,
	});

	const st_01 = [
		`ALTER TABLE [users] ADD CONSTRAINT [users_name_key] UNIQUE([name]);`,
	];

	expect(pst1).toStrictEqual(st_01);
	expect(error).not.toBeNull();
});
