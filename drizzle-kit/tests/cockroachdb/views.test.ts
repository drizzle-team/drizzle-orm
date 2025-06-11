import { eq, gt, sql } from 'drizzle-orm';
import {
	cockroachdbMaterializedView,
	cockroachdbSchema,
	cockroachdbTable,
	cockroachdbView,
	int4,
} from 'drizzle-orm/cockroachdb-core';
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

test('create view', async () => {
	const table = cockroachdbTable('test', {
		id: int4('id').primaryKey(),
	});
	const schema1 = {
		test: table,
	};

	const schema2 = {
		test: table,
		view: cockroachdbView('view').as((qb) => qb.selectDistinct().from(table)),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0: string[] = [
		'CREATE VIEW "view" AS (select distinct "id" from "test");',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create table and view #1', async () => {
	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view: cockroachdbView('some_view').as((qb) => qb.select().from(users)),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`CREATE TABLE "users" (\n\t"id" int4 PRIMARY KEY\n);\n`,
		`CREATE VIEW "some_view" AS (select "id" from "users");`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create table and view #2', async () => {
	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view: cockroachdbView('some_view', { id: int4('id') }).as(sql`SELECT * FROM ${users}`),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`CREATE TABLE "users" (\n\t"id" int4 PRIMARY KEY\n);\n`,
		`CREATE VIEW "some_view" AS (SELECT * FROM "users");`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create table and view #5', async () => {
	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view1: cockroachdbView('some_view', { id: int4('id') }).as(sql`SELECT * FROM ${users}`),
		view2: cockroachdbView('some_view', { id: int4('id') }).as(sql`SELECT * FROM ${users}`),
	};

	// view_name_duplicate
	await expect(diff({}, to, [])).rejects.toThrow();
	await expect(push({ db, to })).rejects.toThrow();
});

test('create view with existing flag', async () => {
	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey().notNull(),
	});

	const from = {
		users,
	};

	const to = {
		users: users,
		view1: cockroachdbView('some_view', { id: int4('id') }).existing(),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create materialized view', async () => {
	const table = cockroachdbTable('test', {
		id: int4('id').primaryKey(),
	});
	const schema1 = {
		test: table,
	};

	const schema2 = {
		test: table,
		view: cockroachdbMaterializedView('view')
			.withNoData()
			.as((qb) => qb.selectDistinct().from(table)),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0: string[] = [
		'CREATE MATERIALIZED VIEW "view" AS (select distinct "id" from "test") WITH NO DATA;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create table and materialized view #1', async () => {
	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view: cockroachdbMaterializedView('some_view').as((qb) => qb.select().from(users)),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`CREATE TABLE "users" (\n\t"id" int4 PRIMARY KEY\n);\n`,
		`CREATE MATERIALIZED VIEW "some_view" AS (select "id" from "users");`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create table and materialized view #2', async () => {
	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view: cockroachdbMaterializedView('some_view', { id: int4('id') }).as(sql`SELECT * FROM ${users}`),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`CREATE TABLE "users" (\n\t"id" int4 PRIMARY KEY\n);\n`,
		`CREATE MATERIALIZED VIEW "some_view" AS (SELECT * FROM "users");`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create table and materialized view #3', async () => {
	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view1: cockroachdbMaterializedView('some_view1', { id: int4('id') }).as(sql`SELECT * FROM ${users}`),
		view2: cockroachdbMaterializedView('some_view2')
			.withNoData().as((qb) => qb.select().from(users)),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		`CREATE TABLE "users" (\n\t"id" int4 PRIMARY KEY\n);\n`,
		`CREATE MATERIALIZED VIEW "some_view1" AS (SELECT * FROM "users");`,
		`CREATE MATERIALIZED VIEW "some_view2" AS (select "id" from "users") WITH NO DATA;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create table and materialized view #4', async () => {
	// same names
	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view1: cockroachdbMaterializedView('some_view', { id: int4('id') }).as(sql`SELECT * FROM ${users}`),
		view2: cockroachdbMaterializedView('some_view', { id: int4('id') }).as(sql`SELECT * FROM ${users}`),
	};

	// view_name_duplicate
	await expect(diff({}, to, [])).rejects.toThrow();
	await expect(push({ db, to })).rejects.toThrow();
});

test('create materialized view with existing flag', async () => {
	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey().notNull(),
	});

	const from = {
		users,
	};

	const to = {
		users: users,
		view1: cockroachdbMaterializedView('some_view', { id: int4('id') }).existing(),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop view #1', async () => {
	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: cockroachdbView('some_view', { id: int4('id') }).as(sql`SELECT * FROM ${users}`),
	};

	const to = {
		users: users,
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`DROP VIEW "some_view";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop view #2', async () => {
	const table = cockroachdbTable('test', {
		id: int4('id').primaryKey(),
	});
	const schema1 = {
		test: table,
		view: cockroachdbView('view').as((qb) => qb.selectDistinct().from(table)),
	};

	const schema2 = {
		test: table,
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0: string[] = [
		'DROP VIEW "view";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop view with existing flag', async () => {
	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: cockroachdbView('some_view', { id: int4('id') }).existing(),
	};

	const to = {
		users: users,
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop view with data', async () => {
	const table = cockroachdbTable('table', {
		id: int4('id').primaryKey(),
	});
	const schema1 = {
		test: table,
		view: cockroachdbView('view', {}).as(sql`SELECT * FROM ${table}`),
	};

	const schema2 = {
		test: table,
	};

	const seedStatements = [`INSERT INTO "table" ("id") VALUES (1), (2), (3)`];

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst, hints: phints } = await push({
		db,
		to: schema2,
	});

	// seeding
	for (const seedSt of seedStatements) {
		await db.query(seedSt);
	}

	const st0: string[] = [
		`DROP VIEW "view";`,
	];
	const hints0: string[] = [];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
	expect(phints).toStrictEqual(hints0);
});

test('drop materialized view #1', async () => {
	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: cockroachdbMaterializedView('some_view', { id: int4('id') }).as(sql`SELECT * FROM ${users}`),
	};

	const to = {
		users: users,
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`DROP MATERIALIZED VIEW "some_view";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop materialized view #2', async () => {
	const table = cockroachdbTable('test', {
		id: int4('id').primaryKey(),
	});
	const schema1 = {
		test: table,
		view: cockroachdbMaterializedView('view').as((qb) => qb.selectDistinct().from(table)),
	};

	const schema2 = {
		test: table,
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0: string[] = [
		'DROP MATERIALIZED VIEW "view";',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop materialized view with existing flag', async () => {
	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: cockroachdbMaterializedView('some_view', { id: int4('id') }).existing(),
	};

	const to = {
		users: users,
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop materialized view with data', async () => {
	const table = cockroachdbTable('table', {
		id: int4('id').primaryKey(),
	});

	const schema1 = {
		test: table,
		view: cockroachdbMaterializedView('view', {}).as(sql`SELECT * FROM ${table}`),
	};

	const schema2 = {
		test: table,
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	await db.query(`INSERT INTO "table" ("id") VALUES (1), (2), (3)`);

	const { sqlStatements: pst, hints, losses } = await push({ db, to: schema2 });

	const st0: string[] = [
		`DROP MATERIALIZED VIEW "view";`,
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);

	expect(hints).toStrictEqual([]);
	expect(losses).toStrictEqual([]);
});

test('drop materialized view without data', async () => {
	const table = cockroachdbTable('table', {
		id: int4('id').primaryKey(),
	});
	const schema1 = {
		test: table,
		view: cockroachdbMaterializedView('view', {}).as(sql`SELECT * FROM ${table}`),
	};

	const schema2 = {
		test: table,
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst, hints: phints } = await push({
		db,
		to: schema2,
	});

	const st0: string[] = [
		`DROP MATERIALIZED VIEW "view";`,
	];
	const hints0: string[] = [];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
	expect(phints).toStrictEqual(hints0);
});

test('rename view #1', async () => {
	const from = {
		users: cockroachdbTable('users', { id: int4() }),
		view: cockroachdbView('some_view', { id: int4('id') }).as(sql`SELECT * FROM "users"`),
	};

	const to = {
		users: cockroachdbTable('users', { id: int4() }),
		view: cockroachdbView('new_some_view', { id: int4('id') }).as(sql`SELECT * FROM "users"`),
	};

	const renames = ['public.some_view->public.new_some_view'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0 = [
		`ALTER VIEW "some_view" RENAME TO "new_some_view";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename view with existing flag', async () => {
	const from = {
		view: cockroachdbView('some_view', { id: int4('id') }).existing(),
	};

	const to = {
		view: cockroachdbView('new_some_view', { id: int4('id') }).existing(),
	};

	const renames = ['public.some_view->public.new_some_view'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames,
	});

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename materialized view #1', async () => {
	const from = {
		users: cockroachdbTable('users', { id: int4() }),
		view: cockroachdbMaterializedView('some_view', { id: int4('id') }).as(sql`SELECT * FROM "users"`),
	};

	const to = {
		users: cockroachdbTable('users', { id: int4() }),
		view: cockroachdbMaterializedView('new_some_view', { id: int4('id') }).as(sql`SELECT * FROM "users"`),
	};

	const renames = ['public.some_view->public.new_some_view'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0 = [
		`ALTER MATERIALIZED VIEW "some_view" RENAME TO "new_some_view";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename materialized view with existing flag', async () => {
	const from = {
		view: cockroachdbMaterializedView('some_view', { id: int4('id') }).existing(),
	};

	const to = {
		view: cockroachdbMaterializedView('new_some_view', { id: int4('id') }).existing(),
	};

	const renames = ['public.some_view->public.new_some_view'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames,
	});

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('view alter schema', async () => {
	const schema = cockroachdbSchema('new_schema');

	const from = {
		users: cockroachdbTable('users', { id: int4() }),
		view: cockroachdbView('some_view', { id: int4('id') }).as(sql`SELECT * FROM "users"`),
	};

	const to = {
		schema,
		users: cockroachdbTable('users', { id: int4() }),
		view: schema.view('some_view', { id: int4('id') }).as(sql`SELECT * FROM "users"`),
	};

	const renames = ['public.some_view->new_schema.some_view'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0 = [
		`CREATE SCHEMA "new_schema";\n`,
		`ALTER VIEW "some_view" SET SCHEMA "new_schema";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('view alter schema with existing flag', async () => {
	const schema = cockroachdbSchema('new_schema');

	const from = {
		view: cockroachdbView('some_view', { id: int4('id') }).existing(),
	};

	const to = {
		schema,
		view: schema.view('some_view', { id: int4('id') }).existing(),
	};

	const renames = ['public.some_view->new_schema.some_view'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames,
	});

	const st0 = [
		`CREATE SCHEMA "new_schema";\n`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('view alter schema for materialized', async () => {
	const schema = cockroachdbSchema('new_schema');

	const from = {
		users: cockroachdbTable('users', { id: int4() }),
		view: cockroachdbMaterializedView('some_view', { id: int4('id') }).as(sql`SELECT * FROM "users"`),
	};

	const to = {
		schema,
		users: cockroachdbTable('users', { id: int4() }),
		view: schema.materializedView('some_view', { id: int4('id') }).as(sql`SELECT * FROM "users"`),
	};

	const renames = ['public.some_view->new_schema.some_view'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0 = [
		`CREATE SCHEMA "new_schema";\n`,
		`ALTER MATERIALIZED VIEW "some_view" SET SCHEMA "new_schema";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('view alter schema for materialized with existing flag', async () => {
	const schema = cockroachdbSchema('new_schema');

	const from = {
		view: cockroachdbMaterializedView('some_view', { id: int4('id') }).existing(),
	};

	const to = {
		schema,
		view: schema.materializedView('some_view', { id: int4('id') }).existing(),
	};

	const renames = ['public.some_view->new_schema.some_view'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames,
	});

	const st0 = [
		`CREATE SCHEMA "new_schema";\n`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter view ".as" value', async () => {
	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: cockroachdbView('some_view', { id: int4('id') }).as(sql`select * from users where id > 100`),
	};

	const to = {
		users,
		view: cockroachdbView('some_view', { id: int4('id') }).as(sql`select * from users where id > 101`),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0: string[] = [
		'DROP VIEW "some_view";',
		`CREATE VIEW "some_view" AS (select * from users where id > 101);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]); // push ignored definition change
});

test('alter view ".as" value with existing flag', async () => {
	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: cockroachdbView('some_view', { id: int4('id') }).existing(),
	};

	const to = {
		users,
		view: cockroachdbView('some_view', { id: int4('id') }).existing(),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter materialized view ".as" value', async () => {
	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: cockroachdbMaterializedView('some_view', { id: int4('id') }).as(sql`SELECT '123'`),
	};

	const to = {
		users,
		view: cockroachdbMaterializedView('some_view', { id: int4('id') }).as(sql`SELECT '1234'`),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0: string[] = [
		'DROP MATERIALIZED VIEW "some_view";',
		`CREATE MATERIALIZED VIEW "some_view" AS (SELECT '1234');`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]); // we ignore definition changes for push
});

test('alter materialized view ".as" value with existing flag', async () => {
	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: cockroachdbMaterializedView('some_view', { id: int4('id') }).existing(),
	};

	const to = {
		users,
		view: cockroachdbMaterializedView('some_view', { id: int4('id') }).existing(),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0: string[] = [];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop existing flag', async () => {
	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: cockroachdbMaterializedView('some_view', { id: int4('id') }).existing(),
	};

	const to = {
		users,
		view: cockroachdbMaterializedView('some_view', { id: int4('id') }).as(sql`SELECT 'asd'`),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0: string[] = [
		`CREATE MATERIALIZED VIEW "some_view" AS (SELECT 'asd');`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('set existing - materialized', async () => {
	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: cockroachdbMaterializedView('some_view', { id: int4('id') }).as(sql`SELECT 'asd'`),
	};

	const to = {
		users,
		view: cockroachdbMaterializedView('new_some_view', { id: int4('id') }).withNoData().existing(),
	};

	const renames = ['public.some_view->public.new_some_view'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
		renames,
	});

	const st0: string[] = ['DROP MATERIALIZED VIEW "some_view";'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop existing - materialized', async () => {
	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: cockroachdbMaterializedView('view', { id: int4('id') }).existing(),
	};

	const to = {
		users,
		view: cockroachdbMaterializedView('view', { id: int4('id') }).withNoData().as(
			sql`SELECT * FROM users WHERE id > 100`,
		),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		`CREATE MATERIALIZED VIEW "view" AS (SELECT * FROM users WHERE id > 100) WITH NO DATA;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('set existing', async () => {
	const users = cockroachdbTable('users', {
		id: int4('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: cockroachdbView('some_view', { id: int4('id') }).as(sql`SELECT * from users where id > 100`),
	};

	const to = {
		users,
		view: cockroachdbView('new_some_view', { id: int4('id') }).existing(),
	};

	const renames = ['public.some_view->public.new_some_view'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = ['DROP VIEW "some_view";'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('moved schema', async () => {
	const schema = cockroachdbSchema('my_schema');
	const from = {
		schema,
		users: cockroachdbTable('users', { id: int4() }),
		view: cockroachdbView('some_view', { id: int4('id') }).as(sql`SELECT * FROM "users"`),
	};

	const to = {
		schema,
		users: cockroachdbTable('users', { id: int4() }),
		view: schema.view('some_view', { id: int4('id') }).as(
			sql`SELECT * FROM "users"`,
		),
	};

	const renames = ['public.some_view->my_schema.some_view'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = [
		`ALTER VIEW "some_view" SET SCHEMA "my_schema";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('push view with same name', async () => {
	const table = cockroachdbTable('test', {
		id: int4('id').primaryKey(),
	});
	const schema1 = {
		test: table,
		view: cockroachdbView('view').as((qb) => qb.selectDistinct().from(table)),
	};

	const schema2 = {
		test: table,
		view: cockroachdbView('view').as((qb) => qb.selectDistinct().from(table).where(eq(table.id, 1))),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	expect(st).toStrictEqual([
		'DROP VIEW "view";',
		'CREATE VIEW "view" AS (select distinct "id" from "test" where "test"."id" = 1);',
	]);
	expect(pst).toStrictEqual([]);
});

test('push materialized view with same name', async () => {
	const table = cockroachdbTable('test', {
		id: int4('id').primaryKey(),
	});
	const schema1 = {
		test: table,
		view: cockroachdbMaterializedView('view').as((qb) => qb.selectDistinct().from(table)),
	};

	const schema2 = {
		test: table,
		view: cockroachdbMaterializedView('view').as((qb) => qb.selectDistinct().from(table).where(eq(table.id, 1))),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	expect(st).toStrictEqual([
		'DROP MATERIALIZED VIEW "view";',
		'CREATE MATERIALIZED VIEW "view" AS (select distinct "id" from "test" where "test"."id" = 1);',
	]);
	expect(pst).toStrictEqual([]);
});
