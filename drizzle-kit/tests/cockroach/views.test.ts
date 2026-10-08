import { eq, sql } from 'drizzle-orm';
import {
	cockroachMaterializedView,
	cockroachSchema,
	cockroachTable,
	cockroachView,
	int4,
} from 'drizzle-orm/cockroach-core';
import { stripAnsi } from 'hanji/utils';
import { explain } from 'src/cli/views';
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

const mySchema = cockroachSchema('my_schema');
const allUsers = sql`SELECT * FROM "users"`;

test.concurrent.for([
	{
		name: 'a view',
		from: cockroachView('some_view', { id: int4('id') }).as(allUsers),
		to: mySchema.view('new_view', { id: int4('id') }).as(allUsers),
		alter: 'ALTER VIEW',
	},
	{
		name: 'a materialized view',
		from: cockroachMaterializedView('some_view', { id: int4('id') }).as(allUsers),
		to: mySchema.materializedView('new_view', { id: int4('id') }).as(allUsers),
		alter: 'ALTER MATERIALIZED VIEW',
	},
])(
	'$name that moves to another schema with a new name writes SQL that runs',
	async ({ from: view, to: moved, alter }, { db }) => {
		const users = cockroachTable('users', { id: int4() });
		const from = { users, mySchema, view };
		const to = { users, mySchema, view: moved };
		const renames = ['public.some_view->my_schema.new_view'];

		const { sqlStatements: st } = await diff(from, to, renames);
		await push({ db, to: from });
		const { sqlStatements: pst } = await push({ db, to, renames });

		const st0 = [`${alter} "some_view" RENAME TO "new_view";`, `${alter} "new_view" SET SCHEMA "my_schema";`];
		expect(st).toStrictEqual(st0);
		expect(pst).toStrictEqual(st0);
	},
);

test.concurrent.for([
	{ name: 'the same name', to: 'some_view' },
	{ name: 'a new name', to: 'new_view' },
])(
	'a view that moves to another schema with $name and a new definition writes SQL that runs',
	async ({ to: name }, { db }) => {
		const users = cockroachTable('users', { id: int4() });
		const from = {
			users,
			mySchema,
			view: cockroachView('some_view', { id: int4('id') }).as(sql`SELECT 1 AS "id" FROM "users"`),
		};
		const to = {
			users,
			mySchema,
			view: mySchema.view(name, { id: int4('id') }).as(sql`SELECT 2 AS "id" FROM "users"`),
		};

		const { sqlStatements: st } = await diff(from, to, [`public.some_view->my_schema.${name}`]);
		await push({ db, to: from });
		await db.query('INSERT INTO "users" VALUES (0);');
		// push does not compare the definition of a view, so the SQL of generate runs here.
		for (const statement of st) await db.query(statement);

		expect(st).toStrictEqual([
			'DROP VIEW "some_view";',
			`CREATE VIEW "my_schema"."${name}" AS (SELECT 2 AS "id" FROM "users");`,
		]);
		expect(await db.query(`SELECT "id"::int4 FROM "my_schema"."${name}";`)).toStrictEqual([{ id: 2 }]);
		expect((await push({ db, to })).sqlStatements).toStrictEqual([]);
	},
);

test.concurrent('a view that moves to another schema and becomes a materialized view writes SQL that runs', async ({ db }) => {
	const users = cockroachTable('users', { id: int4() });
	const from = { users, mySchema, view: cockroachView('some_view', { id: int4('id') }).as(allUsers) };
	const to = { users, mySchema, view: mySchema.materializedView('some_view', { id: int4('id') }).as(allUsers) };
	const renames = ['public.some_view->my_schema.some_view'];

	const { sqlStatements: st } = await diff(from, to, renames);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0 = [
		'DROP VIEW "some_view";',
		'CREATE MATERIALIZED VIEW "my_schema"."some_view" AS (SELECT * FROM "users");',
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

// https://github.com/drizzle-team/drizzle-orm/issues/4520
test.concurrent(
	'create 2 dependent materialized views',
	async ({ db }) => {
		const table1 = cockroachTable('table1', {
			col1: int4(),
			col2: int4(),
			col3: int4(),
		});
		const accountBalancesPMMV = cockroachMaterializedView('accountBalancesPM').as(
			(qb) => {
				return qb
					.select({
						col1: table1.col1,
						col2: table1.col2,
						col3: table1.col3,
					})
					.from(table1);
			},
		);

		const accountBalancesMV = cockroachMaterializedView('accountBalances').as(
			(qb) =>
				qb
					.select({
						accountId: accountBalancesPMMV.col1,
					})
					.from(accountBalancesPMMV),
		);

		const schema = { table1, accountBalancesMV, accountBalancesPMMV };
		const { sqlStatements: st1, next: n1 } = await diff({}, schema, []);
		const { sqlStatements: pst1 } = await push({ db, to: schema });
		const expectedSt1 = [
			'CREATE TABLE "table1" (\n\t"col1" int4,\n\t"col2" int4,\n\t"col3" int4\n);\n',
			'CREATE MATERIALIZED VIEW "accountBalancesPM" AS (select "col1", "col2", "col3" from "table1");',
			'CREATE MATERIALIZED VIEW "accountBalances" AS (select "col1" from "accountBalancesPM");',
		];
		expect(st1).toStrictEqual(expectedSt1);
		expect(pst1).toStrictEqual(expectedSt1);

		const { sqlStatements: st2 } = await diff(n1, schema, []);
		const { sqlStatements: pst2 } = await push({ db, to: schema });
		expect(st2).toStrictEqual([]);
		expect(pst2).toStrictEqual([]);
	},
);

test.concurrent('create 2 dependent views', async ({ db }) => {
	const table1 = cockroachTable('table1', {
		col1: int4(),
		col2: int4(),
		col3: int4(),
	});
	const accountBalancesPMMV = cockroachView('accountBalancesPM').as(
		(qb) => {
			return qb
				.select({
					col1: table1.col1,
					col2: table1.col2,
					col3: table1.col3,
				})
				.from(table1);
		},
	);

	const accountBalancesMV = cockroachView('accountBalances').as(
		(qb) =>
			qb
				.select({
					accountId: accountBalancesPMMV.col1,
				})
				.from(accountBalancesPMMV),
	);

	const schema = { table1, accountBalancesMV, accountBalancesPMMV };
	const { sqlStatements: st1, next: n1 } = await diff({}, schema, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema });
	const expectedSt1 = [
		'CREATE TABLE "table1" (\n\t"col1" int4,\n\t"col2" int4,\n\t"col3" int4\n);\n',
		'CREATE VIEW "accountBalancesPM" AS (select "col1", "col2", "col3" from "table1");',
		'CREATE VIEW "accountBalances" AS (select "col1" from "accountBalancesPM");',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const { sqlStatements: st2 } = await diff(n1, schema, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema });
	expect(st2).toStrictEqual([]);
	expect(pst2).toStrictEqual([]);
});

// Cockroach refuses to rename or to move a table while a view reads it.
const folder = cockroachSchema('folder');

test.concurrent.for([
	{
		name: 'a view that reads a table that moves to another schema',
		kind: 'VIEW',
		users: folder.table('users', { id: int4() }),
		rename: 'public.users->folder.users',
		alter: 'ALTER TABLE "users" SET SCHEMA "folder";\n',
		source: '"folder"."users"',
	},
	{
		name: 'a view that reads a table that gets a new name',
		kind: 'VIEW',
		users: cockroachTable('people', { id: int4() }),
		rename: 'public.users->public.people',
		alter: 'ALTER TABLE "users" RENAME TO "people";',
		source: '"people"',
	},
	{
		name: 'a materialized view that reads a table that moves to another schema',
		kind: 'MATERIALIZED VIEW',
		users: folder.table('users', { id: int4() }),
		rename: 'public.users->folder.users',
		alter: 'ALTER TABLE "users" SET SCHEMA "folder";\n',
		source: '"folder"."users"',
	},
])('$name is dropped before the table statement and created after it', async (
	{ kind, users, rename, alter, source },
	{ db },
) => {
	const reader = (table: string) => {
		const query = sql.raw(`SELECT "id" FROM ${table}`);
		return kind === 'VIEW'
			? cockroachView('v', { id: int4('id') }).as(query)
			: cockroachMaterializedView('v', { id: int4('id') }).as(query);
	};
	const from = { folder, users: cockroachTable('users', { id: int4() }), view: reader('"users"') };
	const to = { folder, users, view: reader(source) };

	const { sqlStatements: st } = await diff(from, to, [rename]);
	await push({ db, to: from });
	await db.query('INSERT INTO "users" VALUES (7);');
	const { sqlStatements: pst } = await push({ db, to, renames: [rename] });

	const st0 = [`DROP ${kind} "v";`, alter, `CREATE ${kind} "v" AS (SELECT "id" FROM ${source});`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
	expect(await db.query('SELECT "id"::int4 FROM "v";')).toStrictEqual([{ id: 7 }]);
});

test.concurrent('a view that is created again keeps its place when it does not read the table that moves', async ({ db }) => {
	const users = cockroachTable('users', { id: int4() });
	const reader = (id: number) =>
		cockroachView('v', { id: int4('id') }).as(sql.raw(`SELECT ${id} AS "id" FROM "users"`));
	const from = { folder, users, pets: cockroachTable('pets', { id: int4() }), view: reader(1) };
	const to = { folder, users, pets: folder.table('pets', { id: int4() }), view: reader(2) };
	const renames = ['public.pets->folder.pets'];

	const { sqlStatements: st } = await diff(from, to, renames);
	await push({ db, to: from });
	// push does not compare the definition of a view, so the SQL of generate runs here.
	for (const statement of st) await db.query(statement);

	expect(st).toStrictEqual([
		'DROP VIEW "v";',
		'CREATE VIEW "v" AS (SELECT 2 AS "id" FROM "users");',
		'ALTER TABLE "pets" SET SCHEMA "folder";\n',
	]);
	expect((await push({ db, to })).sqlStatements).toStrictEqual([]);
});

test.concurrent('explain shows a view with a new definition one time, with both definitions', async () => {
	const users = cockroachTable('users', { id: int4() });
	const reader = (id: number) =>
		cockroachView('v', { id: int4('id') }).as(sql.raw(`SELECT ${id} AS "id" FROM "users"`));

	const { statements, groupedStatements } = await diff({ users, view: reader(1) }, { users, view: reader(2) }, []);

	expect(statements.map((it) => it.type)).toStrictEqual(['drop_view', 'create_view']);
	expect(stripAnsi(explain('cockroach', groupedStatements, []))).toBe(
		'\n--- Generated migration statements ---\n'
			+ '┌─── public.v view changed:\n'
			+ '│ definition: [SELECT 1 AS "id" FROM "users"] -> [SELECT 2 AS "id" FROM "users"]\n'
			+ '├───\n'
			+ '│ DROP VIEW "v";\n'
			+ '└───\n'
			+ '\n'
			+ 'CREATE VIEW "v" AS (SELECT 2 AS "id" FROM "users");',
	);
});

test.concurrent('explain shows a view that reads a renamed table one time, with both definitions', async () => {
	const reader = (table: string) => cockroachView('v', { id: int4('id') }).as(sql.raw(`SELECT "id" FROM ${table}`));
	const from = { users: cockroachTable('users', { id: int4() }), view: reader('"users"') };
	const to = { users: cockroachTable('people', { id: int4() }), view: reader('"people"') };

	const { statements, groupedStatements } = await diff(from, to, ['public.users->public.people']);

	expect(statements.map((it) => it.type)).toStrictEqual(['drop_view', 'rename_table', 'create_view']);
	expect(stripAnsi(explain('cockroach', groupedStatements, []))).toBe(
		'\n--- Generated migration statements ---\n'
			+ '┌─── public.v view changed:\n'
			+ '│ definition: [SELECT "id" FROM "users"] -> [SELECT "id" FROM "people"]\n'
			+ '├───\n'
			+ '│ DROP VIEW "v";\n'
			+ '└───\n'
			+ '\n'
			+ 'ALTER TABLE "users" RENAME TO "people";\n'
			+ 'CREATE VIEW "v" AS (SELECT "id" FROM "people");',
	);
});

test.concurrent('push asks for no confirmation when it creates a materialized view with rows again', async ({ db }) => {
	const reader = (table: string) =>
		cockroachMaterializedView('v', { id: int4('id') }).as(sql.raw(`SELECT "id" FROM ${table}`));
	const users = cockroachTable('users', { id: int4() });
	const renames = ['public.users->public.people'];

	await push({ db, to: { users } });
	await db.query('INSERT INTO "users" VALUES (7);');
	await push({ db, to: { users, view: reader('"users"') } });
	const { sqlStatements: pst, hints } = await push({
		db,
		to: { users: cockroachTable('people', { id: int4() }), view: reader('"people"') },
		renames,
	});

	expect(pst).toStrictEqual([
		'DROP MATERIALIZED VIEW "v";',
		'ALTER TABLE "users" RENAME TO "people";',
		'CREATE MATERIALIZED VIEW "v" AS (SELECT "id" FROM "people");',
	]);
	expect(hints).toStrictEqual([]);
});

// The view reads the table `log` of the schema `people`, and no table with the name `people`.
test.concurrent('a table rename leaves a view alone that reads a table of a schema with the new table name', async ({ db }) => {
	const people = cockroachSchema('people');
	const log = people.table('log', { id: int4() });
	const view = cockroachView('v', { id: int4() }).as(sql`SELECT "id" FROM "people"."log"`);
	const from = { people, log, view, users: cockroachTable('users', { id: int4() }) };
	const to = { people, log, view, users: cockroachTable('people', { id: int4() }) };
	const renames = ['public.users->public.people'];

	const { sqlStatements: st } = await diff(from, to, renames);
	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0 = ['ALTER TABLE "users" RENAME TO "people";'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});
