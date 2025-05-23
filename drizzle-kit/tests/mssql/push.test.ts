import {
	bigint,
	bit,
	char,
	check,
	date,
	index,
	int,
	mssqlSchema,
	mssqlTable,
	mssqlView,
	numeric,
	primaryKey,
	real,
	smallint,
	text,
	time,
	uniqueIndex,
	varchar,
} from 'drizzle-orm/mssql-core';
import { eq, SQL, sql } from 'drizzle-orm/sql';
// import { suggestions } from 'src/cli/commands/push-mssql';
import { DB } from 'src/utils';
import { diff, prepareTestDatabase, push, TestDatabase } from 'tests/mssql/mocks';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { DialectSuite, run } from '../push/common';

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
		`ALTER TABLE [users] ALTER COLUMN [id] DROP IDENTITY;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// test('drop identity from a column - few params', async () => {
// 	const schema1 = {
// 		users: mssqlTable('users', {
// 			id: int('id').identity({ name: 'custom_name' }),
// 			id1: int('id1').identity({
// 				name: 'custom_name1',
// 				increment: 4,
// 			}),
// 			id2: int('id2').generatedAlwaysAsIdentity({
// 				name: 'custom_name2',
// 				increment: 4,
// 			}),
// 		}),
// 	};

// 	const schema2 = {
// 		users: mssqlTable('users', {
// 			id: int('id'),
// 			id1: int('id1'),
// 			id2: int('id2'),
// 		}),
// 	};

// 	const { sqlStatements: st } = await diff(schema1, schema2, []);

// 	await push({ db, to: schema1 });
// 	const { sqlStatements: pst } = await push({
// 		db,
// 		to: schema2,
// 	});

// 	const st0: string[] = [
// 		`ALTER TABLE \"users\" ALTER COLUMN \"id\" DROP IDENTITY;`,
// 		'ALTER TABLE "users" ALTER COLUMN "id1" DROP IDENTITY;',
// 		'ALTER TABLE "users" ALTER COLUMN "id2" DROP IDENTITY;',
// 	];
// 	expect(st).toStrictEqual(st0);
// 	expect(pst).toStrictEqual(st0);
// });

// test('drop identity from a column - all params', async () => {
// 	const schema1 = {
// 		users: mssqlTable('users', {
// 			id: int('id').identity(),
// 			id1: int('id1').identity({
// 				name: 'custom_name1',
// 				startWith: 10,
// 				minValue: 10,
// 				maxValue: 1000,
// 				cycle: true,
// 				cache: 10,
// 				increment: 2,
// 			}),
// 			id2: int('id2').generatedAlwaysAsIdentity({
// 				name: 'custom_name2',
// 				startWith: 10,
// 				minValue: 10,
// 				maxValue: 1000,
// 				cycle: true,
// 				cache: 10,
// 				increment: 2,
// 			}),
// 		}),
// 	};

// 	const schema2 = {
// 		users: mssqlTable('users', {
// 			id: int('id'),
// 			id1: int('id1'),
// 			id2: int('id2'),
// 		}),
// 	};

// 	const { sqlStatements: st } = await diff(schema1, schema2, []);

// 	await push({ db, to: schema1 });
// 	const { sqlStatements: pst } = await push({
// 		db,
// 		to: schema2,
// 	});

// 	const st0: string[] = [
// 		`ALTER TABLE \"users\" ALTER COLUMN \"id\" DROP IDENTITY;`,
// 		'ALTER TABLE "users" ALTER COLUMN "id1" DROP IDENTITY;',
// 		'ALTER TABLE "users" ALTER COLUMN "id2" DROP IDENTITY;',
// 	];
// 	expect(st).toStrictEqual(st0);
// 	expect(pst).toStrictEqual(st0);
// });

// test('alter identity from a column - no params', async () => {
// 	const schema1 = {
// 		users: mssqlTable('users', {
// 			id: int('id').identity(),
// 		}),
// 	};

// 	const schema2 = {
// 		users: mssqlTable('users', {
// 			id: int('id').identity({ startWith: 100 }),
// 		}),
// 	};

// 	const { sqlStatements: st } = await diff(schema1, schema2, []);

// 	await push({ db, to: schema1 });
// 	const { sqlStatements: pst } = await push({
// 		db,
// 		to: schema2,
// 	});

// 	const st0: string[] = [
// 		'ALTER TABLE "users" ALTER COLUMN "id" SET START WITH 100;',
// 	];
// 	expect(st).toStrictEqual(st0);
// 	expect(pst).toStrictEqual(st0);
// });

// test('alter identity from a column - few params', async () => {
// 	const schema1 = {
// 		users: mssqlTable('users', {
// 			id: int('id').identity({ startWith: 100 }),
// 		}),
// 	};

// 	const schema2 = {
// 		users: mssqlTable('users', {
// 			id: int('id').identity({
// 				startWith: 100,
// 				increment: 4,
// 				maxValue: 10000,
// 			}),
// 		}),
// 	};

// 	const { sqlStatements: st } = await diff(schema1, schema2, []);

// 	await push({ db, to: schema1 });
// 	const { sqlStatements: pst } = await push({
// 		db,
// 		to: schema2,
// 	});

// 	const st0: string[] = [
// 		'ALTER TABLE "users" ALTER COLUMN "id" SET MAXVALUE 10000;',
// 		'ALTER TABLE "users" ALTER COLUMN "id" SET INCREMENT BY 4;',
// 	];
// 	expect(st).toStrictEqual(st0);
// 	expect(pst).toStrictEqual(st0);
// });

// test('alter identity from a column - by default to always', async () => {
// 	const schema1 = {
// 		users: mssqlTable('users', {
// 			id: int('id').identity({ startWith: 100 }),
// 		}),
// 	};

// 	const schema2 = {
// 		users: mssqlTable('users', {
// 			id: int('id').generatedAlwaysAsIdentity({
// 				startWith: 100,
// 				increment: 4,
// 				maxValue: 10000,
// 			}),
// 		}),
// 	};

// 	const { sqlStatements: st } = await diff(schema1, schema2, []);

// 	await push({ db, to: schema1 });
// 	const { sqlStatements: pst } = await push({
// 		db,
// 		to: schema2,
// 	});

// 	const st0: string[] = [
// 		'ALTER TABLE "users" ALTER COLUMN "id" SET GENERATED ALWAYS;',
// 		'ALTER TABLE "users" ALTER COLUMN "id" SET MAXVALUE 10000;',
// 		'ALTER TABLE "users" ALTER COLUMN "id" SET INCREMENT BY 4;',
// 	];
// 	expect(st).toStrictEqual(st0);
// 	expect(pst).toStrictEqual(st0);
// });

// test('alter identity from a column - always to by default', async () => {
// 	const schema1 = {
// 		users: mssqlTable('users', {
// 			id: int('id').generatedAlwaysAsIdentity({ startWith: 100 }),
// 		}),
// 	};

// 	const schema2 = {
// 		users: mssqlTable('users', {
// 			id: int('id').identity({
// 				startWith: 100,
// 				increment: 4,
// 				maxValue: 10000,
// 				cycle: true,
// 				cache: 100,
// 			}),
// 		}),
// 	};

// 	const { sqlStatements: st } = await diff(schema1, schema2, []);

// 	await push({ db, to: schema1 });
// 	const { sqlStatements: pst } = await push({
// 		db,
// 		to: schema2,
// 	});

// 	const st0: string[] = [
// 		'ALTER TABLE "users" ALTER COLUMN "id" SET GENERATED BY DEFAULT;',
// 		'ALTER TABLE "users" ALTER COLUMN "id" SET MAXVALUE 10000;',
// 		'ALTER TABLE "users" ALTER COLUMN "id" SET INCREMENT BY 4;',
// 		'ALTER TABLE "users" ALTER COLUMN "id" SET CACHE 100;',
// 		'ALTER TABLE "users" ALTER COLUMN "id" SET CYCLE;',
// 	];
// 	expect(st).toStrictEqual(st0);
// 	expect(pst).toStrictEqual(st0);
// });

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

// test('add identity to column - all params', async () => {
// 	const schema1 = {
// 		users: mssqlTable('users', {
// 			id: int('id'),
// 			id1: int('id1'),
// 		}),
// 	};

// 	const schema2 = {
// 		users: mssqlTable('users', {
// 			id: int('id').identity({ seed: 1, increment: 1 }),
// 			id1: int('id1'),
// 		}),
// 	};

// 	const { sqlStatements: st } = await diff(schema1, schema2, []);

// 	await push({ db, to: schema1 });
// 	const { sqlStatements: pst } = await push({
// 		db,
// 		to: schema2,
// 	});

// 	const st0: string[] = [
// 		'ALTER TABLE "users" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (sequence name "custom_name" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1);',
// 		'ALTER TABLE "users" ALTER COLUMN "id1" ADD GENERATED ALWAYS AS IDENTITY (sequence name "custom_name1" INCREMENT BY 4 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1);',
// 	];
// 	expect(st).toStrictEqual(st0);
// 	expect(pst).toStrictEqual(st0);
// });

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

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
		schemas: ['dbo'],
	});

	const st0: string[] = [
		'CREATE VIEW "view" AS (select distinct "id" from "test");',
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

	const st0: string[] = [
		'ALTER TABLE [test] DROP CONSTRAINT [some_check];',
		'ALTER TABLE [test] ADD CONSTRAINT [some_check] CHECK (1=1);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

// TODO should be so?
// Why not recreating, just skipping
test.todo('push view with same name', async () => {
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

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
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

test('unique multistep #1', async (t) => {
	const sch1 = {
		users: mssqlTable('users', {
			name: varchar().unique(),
		}),
	};

	const { sqlStatements: diffSt1 } = await diff({}, sch1, []);
	const { sqlStatements: st1 } = await push({ db, to: sch1, schemas: ['dbo'] });

	const st01 = [
		'CREATE TABLE [users] (\n\t[name] varchar,\n\tCONSTRAINT [users_name_key] UNIQUE([name])\n);\n',
	];

	expect(st1).toStrictEqual(st01);
	expect(diffSt1).toStrictEqual(st01);

	const sch2 = {
		users: mssqlTable('users2', {
			name: varchar('name2').unique(),
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

	// const sch3 = {
	// 	users: mssqlTable('users2', {
	// 		name: varchar('name2'),
	// 	}),
	// };

	// // TODO should we check diff here?
	// // const { sqlStatements: diffSt4 } = await diff(sch2, sch3, []);
	// const { sqlStatements: st4 } = await push({ db, to: sch3, schemas: ['dbo'] });

	// const st04 = ['ALTER TABLE [users2] DROP CONSTRAINT [users_name_key];'];

	// expect(st4).toStrictEqual(st04);
	// expect(diffSt4).toStrictEqual(st04);
});

test('primary key multistep #1', async (t) => {
	const sch1 = {
		users: mssqlTable('users', {
			name: varchar().primaryKey(),
		}),
	};

	const { sqlStatements: diffSt1 } = await diff({}, sch1, []);
	const { sqlStatements: st1 } = await push({ db, to: sch1, schemas: ['dbo'] });

	const st01 = [
		'CREATE TABLE [users] (\n\t[name] varchar,\n\tCONSTRAINT [users_pkey] PRIMARY KEY([name])\n);\n',
	];

	expect(st1).toStrictEqual(st01);
	expect(diffSt1).toStrictEqual(st01);

	const sch2 = {
		users: mssqlTable('users2', {
			name: varchar('name2').primaryKey(),
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
		users: mssqlTable('users2', {
			name: varchar('name2'),
		}),
	};

	// TODO should we check diff here?
	// const { sqlStatements: diffSt4 } = await diff(sch2, sch3, []);
	const { sqlStatements: st4 } = await push({ db, to: sch3, schemas: ['dbo'] });

	const st04 = ['ALTER TABLE [users2] DROP CONSTRAINT [users_pkey];'];

	expect(st4).toStrictEqual(st04);
	// expect(diffSt4).toStrictEqual(st04);
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
