import { eq, sql } from 'drizzle-orm';
import {
	cockroachMaterializedView,
	cockroachSchema,
	cockroachTable,
	cockroachView,
	int4,
} from 'drizzle-orm/cockroach-core';
import { expect } from 'vitest';
import { diff, push, test } from './mocks';

test.concurrent('create view', async ({ db }) => {
	const table = cockroachTable('test', {
		id: int4('id').primaryKey(),
	});
	const schema1 = {
		test: table,
	};

	const schema2 = {
		test: table,
		view: cockroachView('view').as((qb) => qb.selectDistinct().from(table)),
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

test.concurrent('create table and view #1', async ({ db }) => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view: cockroachView('some_view').as((qb) => qb.select().from(users)),
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

test.concurrent('create table and view #2', async ({ db }) => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view: cockroachView('some_view', { id: int4('id') }).as(sql`SELECT * FROM ${users}`),
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

test.concurrent('create table and view #5', async ({ db }) => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view1: cockroachView('some_view', { id: int4('id') }).as(sql`SELECT * FROM ${users}`),
		view2: cockroachView('some_view', { id: int4('id') }).as(sql`SELECT * FROM ${users}`),
	};

	// view_name_duplicate
	await expect(diff({}, to, [])).rejects.toThrow();
	await expect(push({ db, to })).rejects.toThrow();
});

test.concurrent('create view with existing flag', async ({ db }) => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey().notNull(),
	});

	const from = {
		users,
	};

	const to = {
		users: users,
		view1: cockroachView('some_view', { id: int4('id') }).existing(),
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

test.concurrent('create materialized view', async ({ db }) => {
	const table = cockroachTable('test', {
		id: int4('id').primaryKey(),
	});
	const schema1 = {
		test: table,
	};

	const schema2 = {
		test: table,
		view: cockroachMaterializedView('view')
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

test.concurrent('create table and materialized view #1', async ({ db }) => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view: cockroachMaterializedView('some_view').as((qb) => qb.select().from(users)),
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

test.concurrent('create table and materialized view #2', async ({ db }) => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view: cockroachMaterializedView('some_view', { id: int4('id') }).as(sql`SELECT * FROM ${users}`),
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

test.concurrent('create table and materialized view #3', async ({ db }) => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view1: cockroachMaterializedView('some_view1', { id: int4('id') }).as(sql`SELECT * FROM ${users}`),
		view2: cockroachMaterializedView('some_view2')
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

test.concurrent('create table and materialized view #4', async ({ db }) => {
	// same names
	const users = cockroachTable('users', {
		id: int4('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view1: cockroachMaterializedView('some_view', { id: int4('id') }).as(sql`SELECT * FROM ${users}`),
		view2: cockroachMaterializedView('some_view', { id: int4('id') }).as(sql`SELECT * FROM ${users}`),
	};

	// view_name_duplicate
	await expect(diff({}, to, [])).rejects.toThrow();
	await expect(push({ db, to })).rejects.toThrow();
});

test.concurrent('create materialized view with existing flag', async ({ db }) => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey().notNull(),
	});

	const from = {
		users,
	};

	const to = {
		users: users,
		view1: cockroachMaterializedView('some_view', { id: int4('id') }).existing(),
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

test.concurrent('drop view #1', async ({ db }) => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: cockroachView('some_view', { id: int4('id') }).as(sql`SELECT * FROM ${users}`),
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

test.concurrent('drop view #2', async ({ db }) => {
	const table = cockroachTable('test', {
		id: int4('id').primaryKey(),
	});
	const schema1 = {
		test: table,
		view: cockroachView('view').as((qb) => qb.selectDistinct().from(table)),
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

test.concurrent('drop view with existing flag', async ({ db }) => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: cockroachView('some_view', { id: int4('id') }).existing(),
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

test.concurrent('drop view with data', async ({ db }) => {
	const table = cockroachTable('table', {
		id: int4('id').primaryKey(),
	});
	const schema1 = {
		test: table,
		view: cockroachView('view', {}).as(sql`SELECT * FROM ${table}`),
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

test.concurrent('drop materialized view #1', async ({ db }) => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: cockroachMaterializedView('some_view', { id: int4('id') }).as(sql`SELECT * FROM ${users}`),
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

test.concurrent('drop materialized view #2', async ({ db }) => {
	const table = cockroachTable('test', {
		id: int4('id').primaryKey(),
	});
	const schema1 = {
		test: table,
		view: cockroachMaterializedView('view').as((qb) => qb.selectDistinct().from(table)),
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

test.concurrent('drop materialized view with existing flag', async ({ db }) => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: cockroachMaterializedView('some_view', { id: int4('id') }).existing(),
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

test.concurrent('drop materialized view with data', async ({ db }) => {
	const table = cockroachTable('table', {
		id: int4('id').primaryKey(),
	});

	const schema1 = {
		test: table,
		view: cockroachMaterializedView('view', {}).as(sql`SELECT * FROM ${table}`),
	};

	const schema2 = {
		test: table,
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	await db.query(`INSERT INTO "table" ("id") VALUES (1), (2), (3)`);

	const { sqlStatements: pst, hints } = await push({ db, to: schema2 });

	const st0: string[] = [
		`DROP MATERIALIZED VIEW "view";`,
	];

	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);

	expect(hints).toStrictEqual([]);
});

test.concurrent('drop materialized view without data', async ({ db }) => {
	const table = cockroachTable('table', {
		id: int4('id').primaryKey(),
	});
	const schema1 = {
		test: table,
		view: cockroachMaterializedView('view', {}).as(sql`SELECT * FROM ${table}`),
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

test.concurrent('rename view #1', async ({ db }) => {
	const from = {
		users: cockroachTable('users', { id: int4() }),
		view: cockroachView('some_view', { id: int4('id') }).as(sql`SELECT * FROM "users"`),
	};

	const to = {
		users: cockroachTable('users', { id: int4() }),
		view: cockroachView('new_some_view', { id: int4('id') }).as(sql`SELECT * FROM "users"`),
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

test.concurrent('rename view with existing flag', async ({ db }) => {
	const from = {
		view: cockroachView('some_view', { id: int4('id') }).existing(),
	};

	const to = {
		view: cockroachView('new_some_view', { id: int4('id') }).existing(),
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

test.concurrent('rename materialized view #1', async ({ db }) => {
	const from = {
		users: cockroachTable('users', { id: int4() }),
		view: cockroachMaterializedView('some_view', { id: int4('id') }).as(sql`SELECT * FROM "users"`),
	};

	const to = {
		users: cockroachTable('users', { id: int4() }),
		view: cockroachMaterializedView('new_some_view', { id: int4('id') }).as(sql`SELECT * FROM "users"`),
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

test.concurrent('rename materialized view with existing flag', async ({ db }) => {
	const from = {
		view: cockroachMaterializedView('some_view', { id: int4('id') }).existing(),
	};

	const to = {
		view: cockroachMaterializedView('new_some_view', { id: int4('id') }).existing(),
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

test.concurrent('view alter schema', async ({ db }) => {
	const schema = cockroachSchema('new_schema');

	const from = {
		users: cockroachTable('users', { id: int4() }),
		view: cockroachView('some_view', { id: int4('id') }).as(sql`SELECT * FROM "users"`),
	};

	const to = {
		schema,
		users: cockroachTable('users', { id: int4() }),
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

test.concurrent('view alter schema with existing flag', async ({ db }) => {
	const schema = cockroachSchema('new_schema');

	const from = {
		view: cockroachView('some_view', { id: int4('id') }).existing(),
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

test.concurrent('view alter schema for materialized', async ({ db }) => {
	const schema = cockroachSchema('new_schema');

	const from = {
		users: cockroachTable('users', { id: int4() }),
		view: cockroachMaterializedView('some_view', { id: int4('id') }).as(sql`SELECT * FROM "users"`),
	};

	const to = {
		schema,
		users: cockroachTable('users', { id: int4() }),
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

test.concurrent('view alter schema for materialized with existing flag', async ({ db }) => {
	const schema = cockroachSchema('new_schema');

	const from = {
		view: cockroachMaterializedView('some_view', { id: int4('id') }).existing(),
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

test.concurrent('alter view ".as" value', async ({ db }) => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: cockroachView('some_view', { id: int4('id') }).as(sql`select * from users where id > 100`),
	};

	const to = {
		users,
		view: cockroachView('some_view', { id: int4('id') }).as(sql`select * from users where id > 101`),
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

test.concurrent('alter view ".as" value with existing flag', async ({ db }) => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: cockroachView('some_view', { id: int4('id') }).existing(),
	};

	const to = {
		users,
		view: cockroachView('some_view', { id: int4('id') }).existing(),
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

test.concurrent('alter materialized view ".as" value', async ({ db }) => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: cockroachMaterializedView('some_view', { id: int4('id') }).as(sql`SELECT '123'`),
	};

	const to = {
		users,
		view: cockroachMaterializedView('some_view', { id: int4('id') }).as(sql`SELECT '1234'`),
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

test.concurrent('alter materialized view ".as" value with existing flag', async ({ db }) => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: cockroachMaterializedView('some_view', { id: int4('id') }).existing(),
	};

	const to = {
		users,
		view: cockroachMaterializedView('some_view', { id: int4('id') }).existing(),
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

test.concurrent('drop existing flag', async ({ db }) => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: cockroachMaterializedView('some_view', { id: int4('id') }).existing(),
	};

	const to = {
		users,
		view: cockroachMaterializedView('some_view', { id: int4('id') }).as(sql`SELECT 'asd'`),
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

test.concurrent('set existing - materialized', async ({ db }) => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: cockroachMaterializedView('some_view', { id: int4('id') }).as(sql`SELECT 'asd'`),
	};

	const to = {
		users,
		view: cockroachMaterializedView('new_some_view', { id: int4('id') }).withNoData().existing(),
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

test.concurrent('drop existing - materialized', async ({ db }) => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: cockroachMaterializedView('view', { id: int4('id') }).existing(),
	};

	const to = {
		users,
		view: cockroachMaterializedView('view', { id: int4('id') }).withNoData().as(
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

test.concurrent('set existing', async ({ db }) => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: cockroachView('some_view', { id: int4('id') }).as(sql`SELECT * from users where id > 100`),
	};

	const to = {
		users,
		view: cockroachView('new_some_view', { id: int4('id') }).existing(),
	};

	const renames = ['public.some_view->public.new_some_view'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = ['DROP VIEW "some_view";'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test.concurrent('moved schema', async ({ db }) => {
	const schema = cockroachSchema('my_schema');
	const from = {
		schema,
		users: cockroachTable('users', { id: int4() }),
		view: cockroachView('some_view', { id: int4('id') }).as(sql`SELECT * FROM "users"`),
	};

	const to = {
		schema,
		users: cockroachTable('users', { id: int4() }),
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

test.concurrent('push view with same name', async ({ db }) => {
	const table = cockroachTable('test', {
		id: int4('id').primaryKey(),
	});
	const schema1 = {
		test: table,
		view: cockroachView('view').as((qb) => qb.selectDistinct().from(table)),
	};

	const schema2 = {
		test: table,
		view: cockroachView('view').as((qb) => qb.selectDistinct().from(table).where(eq(table.id, 1))),
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

test.concurrent('push materialized view with same name', async ({ db }) => {
	const table = cockroachTable('test', {
		id: int4('id').primaryKey(),
	});
	const schema1 = {
		test: table,
		view: cockroachMaterializedView('view').as((qb) => qb.selectDistinct().from(table)),
	};

	const schema2 = {
		test: table,
		view: cockroachMaterializedView('view').as((qb) => qb.selectDistinct().from(table).where(eq(table.id, 1))),
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
