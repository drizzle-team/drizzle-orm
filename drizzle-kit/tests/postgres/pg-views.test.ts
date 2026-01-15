import { and, eq, gt, or, sql } from 'drizzle-orm';
import { integer, pgMaterializedView, pgSchema, pgTable, pgView, serial, text } from 'drizzle-orm/pg-core';
import { generate } from 'src/cli/schema';
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
	const table = pgTable('test', {
		id: serial('id').primaryKey(),
	});
	const schema1 = {
		test: table,
	};

	const schema2 = {
		test: table,
		view: pgView('view').as((qb) => qb.selectDistinct().from(table)),
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
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view: pgView('some_view').as((qb) => qb.select().from(users)),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`CREATE TABLE "users" (\n\t"id" integer PRIMARY KEY\n);\n`,
		`CREATE VIEW "some_view" AS (select "id" from "users");`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create table and view #2', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view: pgView('some_view', { id: integer('id') }).as(sql`SELECT * FROM ${users}`),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`CREATE TABLE "users" (\n\t"id" integer PRIMARY KEY\n);\n`,
		`CREATE VIEW "some_view" AS (SELECT * FROM "users");`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create table and view #3', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view1: pgView('some_view1', { id: integer('id') }).with({
			checkOption: 'local',
			securityBarrier: false,
			securityInvoker: true,
		}).as(sql`SELECT * FROM ${users}`),
		view2: pgView('some_view2').with({
			checkOption: 'cascaded',
			securityBarrier: true,
			securityInvoker: false,
		}).as((qb) => qb.select().from(users)),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`CREATE TABLE "users" (\n\t"id" integer PRIMARY KEY\n);\n`,
		`CREATE VIEW "some_view1" WITH (check_option = local, security_barrier = false, security_invoker = true) AS (SELECT * FROM "users");`,
		`CREATE VIEW "some_view2" WITH (check_option = cascaded, security_barrier = true, security_invoker = false) AS (select "id" from "users");`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create table and view #4', async () => {
	const schema = pgSchema('new_schema');

	const users = schema.table('users', {
		id: integer('id').primaryKey().notNull(),
	});
	const to = {
		schema,
		users: users,
		view1: schema.view('some_view1', { id: integer('id') }).with({
			checkOption: 'local',
			securityBarrier: false,
			securityInvoker: true,
		}).as(sql`SELECT * FROM ${users}`),
		view2: schema.view('some_view2').with({
			checkOption: 'cascaded',
			securityBarrier: true,
			securityInvoker: false,
		}).as((qb) => qb.select().from(users)),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`CREATE SCHEMA "new_schema";\n`,
		`CREATE TABLE "new_schema"."users" (\n\t"id" integer PRIMARY KEY\n);\n`,
		`CREATE VIEW "new_schema"."some_view1" WITH (check_option = local, security_barrier = false, security_invoker = true) AS (SELECT * FROM "new_schema"."users");`,
		`CREATE VIEW "new_schema"."some_view2" WITH (check_option = cascaded, security_barrier = true, security_invoker = false) AS (select "id" from "new_schema"."users");`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create table and view #5', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view1: pgView('some_view', { id: integer('id') }).as(sql`SELECT * FROM ${users}`),
		view2: pgView('some_view', { id: integer('id') }).as(sql`SELECT * FROM ${users}`),
	};

	// view_name_duplicate
	await expect(diff({}, to, [])).rejects.toThrow();
	await expect(push({ db, to })).rejects.toThrow();
});

test('create table and view #6', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view1: pgView('some_view', { id: integer('id') }).with({ checkOption: 'cascaded' }).as(sql`SELECT * FROM ${users}`),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`CREATE TABLE "users" (\n\t"id" integer PRIMARY KEY\n);\n`,
		`CREATE VIEW "some_view" WITH (check_option = cascaded) AS (SELECT * FROM "users");`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create view with existing flag', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
	};

	const to = {
		users: users,
		view1: pgView('some_view', { id: integer('id') }).with({ checkOption: 'cascaded' }).existing(),
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
	const table = pgTable('test', {
		id: serial('id').primaryKey(),
	});
	const schema1 = {
		test: table,
	};

	const schema2 = {
		test: table,
		view: pgMaterializedView('view')
			.withNoData()
			.using('drizzle_heap')
			.as((qb) => qb.selectDistinct().from(table)),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0: string[] = [
		'CREATE MATERIALIZED VIEW "view" USING "drizzle_heap" AS (select distinct "id" from "test") WITH NO DATA;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create table and materialized view #1', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view: pgMaterializedView('some_view').as((qb) => qb.select().from(users)),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`CREATE TABLE "users" (\n\t"id" integer PRIMARY KEY\n);\n`,
		`CREATE MATERIALIZED VIEW "some_view" AS (select "id" from "users");`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create table and materialized view #2', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view: pgMaterializedView('some_view', { id: integer('id') }).as(sql`SELECT * FROM ${users}`),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`CREATE TABLE "users" (\n\t"id" integer PRIMARY KEY\n);\n`,
		`CREATE MATERIALIZED VIEW "some_view" AS (SELECT * FROM "users");`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create table and materialized view #3', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view1: pgMaterializedView('some_view1', { id: integer('id') }).as(sql`SELECT * FROM ${users}`),
		view2: pgMaterializedView('some_view2').tablespace('pg_default').using('drizzle_heap').withNoData().with({
			autovacuumEnabled: true,
			autovacuumFreezeMaxAge: 1000000,
			autovacuumFreezeMinAge: 1000000,
			autovacuumFreezeTableAge: 1,
			autovacuumMultixactFreezeMaxAge: 1000000,
			autovacuumMultixactFreezeMinAge: 1000000,
			autovacuumMultixactFreezeTableAge: 1000000,
			autovacuumVacuumCostDelay: 1,
			autovacuumVacuumCostLimit: 1,
			autovacuumVacuumScaleFactor: 1,
			autovacuumVacuumThreshold: 1,
			fillfactor: 10,
			logAutovacuumMinDuration: 1,
			parallelWorkers: 1,
			toastTupleTarget: 128,
			userCatalogTable: true,
			vacuumIndexCleanup: 'off',
			vacuumTruncate: false,
		}).as((qb) => qb.select().from(users)),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		`CREATE TABLE "users" (\n\t"id" integer PRIMARY KEY\n);\n`,
		`CREATE MATERIALIZED VIEW "some_view1" AS (SELECT * FROM "users");`,
		`CREATE MATERIALIZED VIEW "some_view2" USING "drizzle_heap" WITH (autovacuum_enabled = true, autovacuum_freeze_max_age = 1000000, autovacuum_freeze_min_age = 1000000, autovacuum_freeze_table_age = 1, autovacuum_multixact_freeze_max_age = 1000000, autovacuum_multixact_freeze_min_age = 1000000, autovacuum_multixact_freeze_table_age = 1000000, autovacuum_vacuum_cost_delay = 1, autovacuum_vacuum_cost_limit = 1, autovacuum_vacuum_scale_factor = 1, autovacuum_vacuum_threshold = 1, fillfactor = 10, log_autovacuum_min_duration = 1, parallel_workers = 1, toast_tuple_target = 128, user_catalog_table = true, vacuum_index_cleanup = off, vacuum_truncate = false) TABLESPACE pg_default AS (select "id" from "users") WITH NO DATA;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create table and materialized view #4', async () => {
	// same names
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view1: pgMaterializedView('some_view', { id: integer('id') }).as(sql`SELECT * FROM ${users}`),
		view2: pgMaterializedView('some_view', { id: integer('id') }).as(sql`SELECT * FROM ${users}`),
	};

	// view_name_duplicate
	await expect(diff({}, to, [])).rejects.toThrow();
	await expect(push({ db, to })).rejects.toThrow();
});

test('create table and materialized view #5', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view1: pgMaterializedView('some_view', { id: integer('id') }).with({ autovacuumFreezeMinAge: 14 }).as(
			sql`SELECT * FROM ${users}`,
		),
	};

	const { sqlStatements: st } = await diff({}, to, []);

	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`CREATE TABLE "users" (\n\t"id" integer PRIMARY KEY\n);\n`,
		`CREATE MATERIALIZED VIEW "some_view" WITH (autovacuum_freeze_min_age = 14) AS (SELECT * FROM "users");`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('create materialized view with existing flag', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
	};

	const to = {
		users: users,
		view1: pgMaterializedView('some_view', { id: integer('id') }).with({ autovacuumEnabled: true }).existing(),
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
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgView('some_view', { id: integer('id') }).as(sql`SELECT * FROM ${users}`),
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
	const table = pgTable('test', {
		id: serial('id').primaryKey(),
	});
	const schema1 = {
		test: table,
		view: pgView('view').as((qb) => qb.selectDistinct().from(table)),
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
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgView('some_view', { id: integer('id') }).existing(),
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
	const table = pgTable('table', {
		id: serial('id').primaryKey(),
	});
	const schema1 = {
		test: table,
		view: pgView('view', {}).as(sql`SELECT * FROM ${table}`),
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
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgMaterializedView('some_view', { id: integer('id') }).as(sql`SELECT * FROM ${users}`),
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
	const table = pgTable('test', {
		id: serial('id').primaryKey(),
	});
	const schema1 = {
		test: table,
		view: pgMaterializedView('view').as((qb) => qb.selectDistinct().from(table)),
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
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgMaterializedView('some_view', { id: integer('id') }).existing(),
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
	const table = pgTable('table', {
		id: serial('id').primaryKey(),
	});

	const schema1 = {
		test: table,
		view: pgMaterializedView('view', {}).as(sql`SELECT * FROM ${table}`),
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

test('drop materialized view without data', async () => {
	const table = pgTable('table', {
		id: serial('id').primaryKey(),
	});
	const schema1 = {
		test: table,
		view: pgMaterializedView('view', {}).as(sql`SELECT * FROM ${table}`),
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
		users: pgTable('users', { id: serial() }),
		view: pgView('some_view', { id: integer('id') }).as(sql`SELECT * FROM "users"`),
	};

	const to = {
		users: pgTable('users', { id: serial() }),
		view: pgView('new_some_view', { id: integer('id') }).as(sql`SELECT * FROM "users"`),
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
		view: pgView('some_view', { id: integer('id') }).existing(),
	};

	const to = {
		view: pgView('new_some_view', { id: integer('id') }).existing(),
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
		users: pgTable('users', { id: serial() }),
		view: pgMaterializedView('some_view', { id: integer('id') }).as(sql`SELECT * FROM "users"`),
	};

	const to = {
		users: pgTable('users', { id: serial() }),
		view: pgMaterializedView('new_some_view', { id: integer('id') }).as(sql`SELECT * FROM "users"`),
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
		view: pgMaterializedView('some_view', { id: integer('id') }).existing(),
	};

	const to = {
		view: pgMaterializedView('new_some_view', { id: integer('id') }).existing(),
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
	const schema = pgSchema('new_schema');

	const from = {
		users: pgTable('users', { id: serial() }),
		view: pgView('some_view', { id: integer('id') }).as(sql`SELECT * FROM "users"`),
	};

	const to = {
		schema,
		users: pgTable('users', { id: serial() }),
		view: schema.view('some_view', { id: integer('id') }).as(sql`SELECT * FROM "users"`),
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
	const schema = pgSchema('new_schema');

	const from = {
		view: pgView('some_view', { id: integer('id') }).existing(),
	};

	const to = {
		schema,
		view: schema.view('some_view', { id: integer('id') }).existing(),
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
	const schema = pgSchema('new_schema');

	const from = {
		users: pgTable('users', { id: serial() }),
		view: pgMaterializedView('some_view', { id: integer('id') }).as(sql`SELECT * FROM "users"`),
	};

	const to = {
		schema,
		users: pgTable('users', { id: serial() }),
		view: schema.materializedView('some_view', { id: integer('id') }).as(sql`SELECT * FROM "users"`),
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
	const schema = pgSchema('new_schema');

	const from = {
		view: pgMaterializedView('some_view', { id: integer('id') }).existing(),
	};

	const to = {
		schema,
		view: schema.materializedView('some_view', { id: integer('id') }).existing(),
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

test('add with option to view #1', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgView('some_view').as((qb) => qb.select().from(users)),
	};

	const to = {
		users,
		view: pgView('some_view').with({ checkOption: 'cascaded', securityBarrier: true }).as((qb) =>
			qb.select().from(users)
		),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER VIEW "some_view" SET (check_option = cascaded, security_barrier = true);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add with option to view with existing flag', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgView('some_view', {}).existing(),
	};

	const to = {
		users,
		view: pgView('some_view', {}).with({ checkOption: 'cascaded', securityBarrier: true }).existing(),
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

test('add with option to materialized view #1', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgMaterializedView('some_view').as((qb) => qb.select().from(users)),
	};

	const to = {
		users,
		view: pgMaterializedView('some_view').with({ autovacuumMultixactFreezeMaxAge: 1_000_000 }).as((qb) =>
			qb.select().from(users)
		),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		`ALTER MATERIALIZED VIEW "some_view" SET (autovacuum_multixact_freeze_max_age = 1000000);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add with option to materialized view #1_2', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgMaterializedView('some_view').as((qb) => qb.select().from(users)),
	};

	const to = {
		users,
		view: pgMaterializedView('some_view').tablespace('pg_default').as((qb) => qb.select().from(users)),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		`ALTER MATERIALIZED VIEW "some_view" SET TABLESPACE \"pg_default\";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]);
});

test('add with options for materialized view #2', async () => {
	const table = pgTable('test', {
		id: serial('id').primaryKey(),
	});
	const schema1 = {
		test: table,
		view: pgMaterializedView('view').as((qb) => qb.selectDistinct().from(table)),
	};

	const schema2 = {
		test: table,
		view: pgMaterializedView('view')
			.with({ autovacuumFreezeTableAge: 1, autovacuumEnabled: false })
			.as((qb) => qb.selectDistinct().from(table)),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0: string[] = [
		`ALTER MATERIALIZED VIEW "view" SET (autovacuum_enabled = false, autovacuum_freeze_table_age = 1);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add with options for materialized view #3', async () => {
	const table = pgTable('test', {
		id: serial('id').primaryKey(),
	});
	const schema1 = {
		test: table,
		view: pgMaterializedView('view').as((qb) => qb.selectDistinct().from(table)),
	};

	const schema2 = {
		test: table,
		view: pgMaterializedView('view')
			.with({ autovacuumVacuumCostDelay: 100, vacuumTruncate: false })
			.as((qb) => qb.selectDistinct().from(table)),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	const st0: string[] = [
		`ALTER MATERIALIZED VIEW "view" SET (autovacuum_vacuum_cost_delay = 100, vacuum_truncate = false);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add with option to materialized view with existing flag #1', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgMaterializedView('some_view', {}).existing(),
	};

	const to = {
		users,
		view: pgMaterializedView('some_view', {}).with({ autovacuumMultixactFreezeMaxAge: 3 }).existing(),
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

test('add with options to materialized view with existing flag #2', async () => {
	const table = pgTable('test', {
		id: serial('id').primaryKey(),
	});
	const schema1 = {
		test: table,
		view: pgMaterializedView('view', {}).as(sql`SELECT id FROM "test"`),
	};

	const schema2 = {
		test: table,
		view: pgMaterializedView('view', {}).with({ autovacuumVacuumCostDelay: 100, vacuumTruncate: false }).existing(),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({
		db,
		to: schema2,
	});

	expect(st).toStrictEqual(['DROP MATERIALIZED VIEW "view";']);
	expect(pst).toStrictEqual([]);
});

test('drop with option from view #1', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgView('some_view').with({ checkOption: 'cascaded', securityBarrier: true, securityInvoker: true }).as((qb) =>
			qb.select().from(users)
		),
	};

	const to = {
		users,
		view: pgView('some_view').as((qb) => qb.select().from(users)),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0 = [
		`ALTER VIEW "some_view" RESET (check_option, security_barrier, security_invoker);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop with option from view with existing flag', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgView('some_view', {}).with({ checkOption: 'cascaded', securityBarrier: true, securityInvoker: true })
			.existing(),
	};

	const to = {
		users,
		view: pgView('some_view', {}).existing(),
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

test('drop with option from materialized view #1', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgMaterializedView('some_view').with({ autovacuumEnabled: true, autovacuumFreezeMaxAge: 1_000_000 }).as((
			qb,
		) => qb.select().from(users)),
	};

	const to = {
		users,
		view: pgMaterializedView('some_view').as((qb) => qb.select().from(users)),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0 = [
		`ALTER MATERIALIZED VIEW "some_view" RESET (autovacuum_enabled, autovacuum_freeze_max_age);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop with option from materialized view with existing flag', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgMaterializedView('some_view', {}).with({ autovacuumEnabled: true, autovacuumFreezeMaxAge: 10 }).existing(),
	};

	const to = {
		users,
		view: pgMaterializedView('some_view', {}).existing(),
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

test('alter with option in view #1', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgView('some_view').with({ securityBarrier: true, securityInvoker: true }).as((qb) =>
			qb.select().from(users)
		),
	};

	const to = {
		users,
		view: pgView('some_view').with({ securityBarrier: true }).as((qb) => qb.select().from(users)),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0: string[] = [
		`ALTER VIEW "some_view" RESET (security_invoker);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter with option in view with existing flag', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgView('some_view', {}).with({ securityBarrier: true, securityInvoker: true }).existing(),
	};

	const to = {
		users,
		view: pgView('some_view', {}).with({ securityBarrier: true }).existing(),
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

test('alter with option in materialized view #1', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgMaterializedView('some_view').with({ autovacuumEnabled: true, autovacuumVacuumScaleFactor: 1 }).as((qb) =>
			qb.select().from(users)
		),
	};

	const to = {
		users,
		view: pgMaterializedView('some_view').with({ autovacuumEnabled: true }).as((qb) => qb.select().from(users)),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0: string[] = [
		`ALTER MATERIALIZED VIEW "some_view" RESET (autovacuum_vacuum_scale_factor);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter with option in materialized view with existing flag', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgMaterializedView('some_view', {}).with({ autovacuumEnabled: true, autovacuumVacuumScaleFactor: 1 })
			.existing(),
	};

	const to = {
		users,
		view: pgMaterializedView('some_view', {}).with({ autovacuumEnabled: true }).existing(),
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

test('alter with option in view #2', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgView('some_view').with({ checkOption: 'local', securityBarrier: true, securityInvoker: true }).as((qb) =>
			qb.select().from(users).where(gt(users.id, 10))
		),
	};

	const to = {
		users,
		view: pgView('some_view').with({ checkOption: 'cascaded', securityBarrier: true, securityInvoker: true }).as((qb) =>
			qb.select().from(users).where(gt(users.id, 10))
		),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		`ALTER VIEW "some_view" SET (check_option = cascaded);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter with option in materialized view #2', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgMaterializedView('some_view').with({ autovacuumEnabled: true, fillfactor: 10 }).as((qb) =>
			qb.select().from(users)
		),
	};

	const to = {
		users,
		view: pgMaterializedView('some_view').with({ autovacuumEnabled: false, fillfactor: 10 }).as((qb) =>
			qb.select().from(users)
		),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		`ALTER MATERIALIZED VIEW "some_view" SET (autovacuum_enabled = false);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter view ".as" value', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgView('some_view', { id: integer('id') }).with({
			checkOption: 'local',
			securityBarrier: true,
			securityInvoker: true,
		}).as(sql`select * from users where id > 100`),
	};

	const to = {
		users,
		view: pgView('some_view', { id: integer('id') }).with({
			checkOption: 'local',
			securityBarrier: true,
			securityInvoker: true,
		}).as(sql`select * from users where id > 101`),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0: string[] = [
		'DROP VIEW "some_view";',
		`CREATE VIEW "some_view" WITH (check_option = local, security_barrier = true, security_invoker = true) AS (select * from users where id > 101);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]); // push ignored definition change
});

test('alter view ".as" value with existing flag', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgView('some_view', { id: integer('id') }).with({
			checkOption: 'local',
			securityBarrier: true,
			securityInvoker: true,
		}).existing(),
	};

	const to = {
		users,
		view: pgView('some_view', { id: integer('id') }).with({
			checkOption: 'local',
			securityBarrier: true,
			securityInvoker: true,
		}).existing(),
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
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgMaterializedView('some_view', { id: integer('id') }).with({
			autovacuumVacuumCostLimit: 1,
		}).as(sql`SELECT '123'`),
	};

	const to = {
		users,
		view: pgMaterializedView('some_view', { id: integer('id') }).with({
			autovacuumVacuumCostLimit: 1,
		}).as(sql`SELECT '1234'`),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0: string[] = [
		'DROP MATERIALIZED VIEW "some_view";',
		`CREATE MATERIALIZED VIEW "some_view" WITH (autovacuum_vacuum_cost_limit = 1) AS (SELECT '1234');`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]); // we ignore definition changes for push
});

test('alter materialized view ".as" value with existing flag', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgMaterializedView('some_view', { id: integer('id') }).with({
			autovacuumVacuumCostLimit: 1,
		}).existing(),
	};

	const to = {
		users,
		view: pgMaterializedView('some_view', { id: integer('id') }).with({
			autovacuumVacuumCostLimit: 1,
		}).existing(),
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
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgMaterializedView('some_view', { id: integer('id') }).with({
			autovacuumVacuumCostLimit: 1,
		}).existing(),
	};

	const to = {
		users,
		view: pgMaterializedView('some_view', { id: integer('id') }).with({
			autovacuumVacuumCostLimit: 1,
		}).as(sql`SELECT 'asd'`),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0: string[] = [
		`CREATE MATERIALIZED VIEW "some_view" WITH (autovacuum_vacuum_cost_limit = 1) AS (SELECT 'asd');`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter tablespace - materialize', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgMaterializedView('some_view', { id: integer('id') }).with({
			autovacuumVacuumCostLimit: 1,
		}).as(sql`SELECT 'asd'`),
	};

	const to = {
		users,
		view: pgMaterializedView('some_view', { id: integer('id') }).tablespace('pg_default').with({
			autovacuumVacuumCostLimit: 1,
		}).as(sql`SELECT 'asd'`),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0: string[] = [
		`ALTER MATERIALIZED VIEW "some_view" SET TABLESPACE "pg_default";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]); // commutative
});

test('set tablespace - materialize', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgMaterializedView('some_view', { id: integer('id') }).with({
			autovacuumVacuumCostLimit: 1,
		}).as(sql`SELECT 'asd'`),
	};

	const to = {
		users,
		view: pgMaterializedView('some_view', { id: integer('id') }).tablespace('pg_default').with({
			autovacuumVacuumCostLimit: 1,
		}).as(sql`SELECT 'asd'`),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0: string[] = [
		`ALTER MATERIALIZED VIEW "some_view" SET TABLESPACE "pg_default";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]); // commutative
});

test('drop tablespace - materialize', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgMaterializedView('some_view', { id: integer('id') }).tablespace('pg_default').with({
			autovacuumVacuumCostLimit: 1,
		}).as(sql`SELECT 1`),
	};

	const to = {
		users,
		view: pgMaterializedView('some_view', { id: integer('id') }).with({
			autovacuumVacuumCostLimit: 1,
		}).as(sql`SELECT 1`),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		`ALTER MATERIALIZED VIEW "some_view" SET TABLESPACE "pg_default";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual([]); // commutative
});

test('set existing - materialized', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgMaterializedView('some_view', { id: integer('id') }).tablespace('pg_default').with({
			autovacuumVacuumCostLimit: 1,
		}).as(sql`SELECT 'asd'`),
	};

	const to = {
		users,
		view: pgMaterializedView('new_some_view', { id: integer('id') }).with({
			autovacuumVacuumCostLimit: 1,
			autovacuumFreezeMinAge: 1,
		}).withNoData().existing(),
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
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgMaterializedView('view', { id: integer('id') }).tablespace('pg_default').with({
			autovacuumVacuumCostLimit: 1,
		}).existing(),
	};

	const to = {
		users,
		view: pgMaterializedView('view', { id: integer('id') }).with({
			autovacuumVacuumCostLimit: 1,
			autovacuumFreezeMinAge: 1,
		}).withNoData().as(sql`SELECT * FROM users WHERE id > 100`),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		`CREATE MATERIALIZED VIEW "view" WITH (autovacuum_freeze_min_age = 1, autovacuum_vacuum_cost_limit = 1) AS (SELECT * FROM users WHERE id > 100) WITH NO DATA;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('set existing', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgView('some_view', { id: integer('id') }).with({
			checkOption: 'cascaded',
		}).as(sql`SELECT * from users where id > 100`),
	};

	const to = {
		users,
		view: pgView('new_some_view', { id: integer('id') }).with({
			checkOption: 'cascaded',
			securityBarrier: true,
		}).existing(),
	};

	const renames = ['public.some_view->public.new_some_view'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = ['DROP VIEW "some_view";'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter using - materialize', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgMaterializedView('some_view', { id: integer('id') }).tablespace('pg_default').using('heap').with(
			{
				autovacuumVacuumCostLimit: 1,
			},
		).as(sql`SELECT 1`),
	};

	const to = {
		users,
		view: pgMaterializedView('some_view', { id: integer('id') }).tablespace('pg_default').using('drizzle_heap').with({
			autovacuumVacuumCostLimit: 1,
		}).as(sql`SELECT 1`),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0: string[] = [
		`ALTER MATERIALIZED VIEW "some_view" SET ACCESS METHOD "drizzle_heap";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('set using - materialize', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgMaterializedView('some_view', { id: integer('id') }).with({
			autovacuumVacuumCostLimit: 1,
		}).as(sql`SELECT 'asd'`),
	};

	const to = {
		users,
		view: pgMaterializedView('some_view', { id: integer('id') }).using('drizzle_heap').with({
			autovacuumVacuumCostLimit: 1,
		}).as(sql`SELECT 'asd'`),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({
		db,
		to,
	});

	const st0: string[] = [
		`ALTER MATERIALIZED VIEW "some_view" SET ACCESS METHOD "drizzle_heap";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('drop using - materialize', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgMaterializedView('some_view', { id: integer('id') }).using('drizzle_heap').with({
			autovacuumVacuumCostLimit: 1,
		}).as(sql`SELECT 'asd'`),
	};

	const to = {
		users,
		view: pgMaterializedView('some_view', { id: integer('id') }).with({
			autovacuumVacuumCostLimit: 1,
		}).as(sql`SELECT 'asd'`),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		`ALTER MATERIALIZED VIEW "some_view" SET ACCESS METHOD "heap";`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename view and alter view', async () => {
	const from = {
		users: pgTable('users', { id: serial() }),
		view: pgView('some_view', { id: integer('id') }).as(sql`SELECT * FROM "users"`),
	};

	const to = {
		users: pgTable('users', { id: serial() }),
		view: pgView('new_some_view', { id: integer('id') }).with({ checkOption: 'cascaded' }).as(
			sql`SELECT * FROM "users"`,
		),
	};

	const renames = ['public.some_view->public.new_some_view'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = [
		`ALTER VIEW "some_view" RENAME TO "new_some_view";`,
		`ALTER VIEW "new_some_view" SET (check_option = cascaded);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('moved schema and alter view', async () => {
	const schema = pgSchema('my_schema');
	const from = {
		schema,
		users: pgTable('users', { id: serial() }),
		view: pgView('some_view', { id: integer('id') }).as(sql`SELECT * FROM "users"`),
	};

	const to = {
		schema,
		users: pgTable('users', { id: serial() }),
		view: schema.view('some_view', { id: integer('id') }).with({ checkOption: 'cascaded' }).as(
			sql`SELECT * FROM "users"`,
		),
	};

	const renames = ['public.some_view->my_schema.some_view'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = [
		`ALTER VIEW "some_view" SET SCHEMA "my_schema";`,
		`ALTER VIEW "my_schema"."some_view" SET (check_option = cascaded);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('push view with same name', async () => {
	const table = pgTable('test', {
		id: serial('id').primaryKey(),
	});
	const schema1 = {
		test: table,
		view: pgView('view').as((qb) => qb.selectDistinct().from(table)),
	};

	const schema2 = {
		test: table,
		view: pgView('view').as((qb) => qb.selectDistinct().from(table).where(eq(table.id, 1))),
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
	const table = pgTable('test', {
		id: serial('id').primaryKey(),
	});
	const schema1 = {
		test: table,
		view: pgMaterializedView('view').as((qb) => qb.selectDistinct().from(table)),
	};

	const schema2 = {
		test: table,
		view: pgMaterializedView('view').as((qb) => qb.selectDistinct().from(table).where(eq(table.id, 1))),
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

// https://github.com/drizzle-team/drizzle-orm/issues/4265
test('.as in view select', async () => {
	const user = pgTable('user', {
		id: serial().primaryKey(),
		email: text(),
		name: text(),
	});

	const userSubscription = pgTable('user_subscription', {
		id: serial().primaryKey(),
		userId: integer().references(() => user.id),
		status: text(),
	});
	const userSubscriptionView = pgView('user_subscription_view').as(
		(qb) => {
			return qb
				.select({
					userId: user.id.as('userId'),
					email: user.email,
					name: user.name,
					subscriptionId: userSubscription.id.as('subscriptionId'),
					status: userSubscription.status,
				})
				.from(user)
				.leftJoin(
					userSubscription,
					sql`(${user.id} = ${userSubscription.userId} and (${userSubscription.status} = 'active' or ${userSubscription.status} = 'trialing'))`,
				);
		},
	);

	const userSubscriptionView1 = pgView('user_subscription_view1').as(
		(qb) => {
			return qb
				.select({
					userId: user.id.as('userId'),
					email: user.email,
					name: user.name,
					subscriptionId: userSubscription.id.as('subscriptionId'),
					status: userSubscription.status,
				})
				.from(user)
				.leftJoin(
					userSubscription,
					and(
						eq(user.id, userSubscription.userId),
						or(eq(userSubscription.status, 'active'), eq(userSubscription.status, 'trialing')),
					),
				);
		},
	);

	const schema = {
		user,
		userSubscription,
		userSubscriptionView,
		userSubscriptionView1,
	};

	const { sqlStatements: st1, next: n1 } = await diff({}, schema, []);
	const { sqlStatements: pst1 } = await push({ db, to: schema });

	const expectedSt1View = (viewName: string) =>
		`CREATE VIEW "${viewName}" AS `
		+ `(select "user"."id" as "userId", "user"."email", "user"."name", "user_subscription"."id" as "subscriptionId", "user_subscription"."status" `
		+ `from "user" left join "user_subscription" on ("user"."id" = "user_subscription"."userId" `
		+ `and ("user_subscription"."status" = 'active' or "user_subscription"."status" = 'trialing')));`;
	const expectedSt1 = [
		'CREATE TABLE "user" (\n\t"id" serial PRIMARY KEY,\n\t"email" text,\n\t"name" text\n);\n',
		'CREATE TABLE "user_subscription" (\n\t"id" serial PRIMARY KEY,\n\t"userId" integer,\n\t"status" text\n);\n',
		'ALTER TABLE "user_subscription" ADD CONSTRAINT "user_subscription_userId_user_id_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id");',
		expectedSt1View('user_subscription_view'),
		expectedSt1View('user_subscription_view1'),
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const { sqlStatements: st2 } = await diff(n1, schema, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema });

	expect(st2).toStrictEqual([]);
	expect(pst2).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4181
// casing bug
test.skipIf(Date.now() < +new Date('2026-01-20'))('create view with snake_case', async () => {
	const test = pgTable('test', {
		testId: serial().primaryKey(),
		testName: text().notNull(),
	});

	const testView = pgView('test_view').as((qb) => {
		return qb
			.select({
				testId1: test.testId,
				testName1: test.testName,
			})
			.from(test);
	});
	const schema = { test, testView };
	const casing = 'snake_case';

	const { sqlStatements: st1, next: n1 } = await diff({}, schema, [], casing);
	const { sqlStatements: pst1 } = await push({ db, to: schema, casing });
	const expectedSt1 = [
		'CREATE TABLE "test" (\n'
		+ '\t"test_id" serial PRIMARY KEY,\n'
		+ '\t"test_name" text NOT NULL\n'
		+ ');\n',
		'CREATE VIEW "test_view" AS (select "test_id", "test_name" from "test");',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const { sqlStatements: st2 } = await diff(n1, schema, [], casing);
	const { sqlStatements: pst2 } = await push({ db, to: schema, casing });
	expect(st2).toStrictEqual([]);
	expect(pst2).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4181
// casing bug
test.skipIf(Date.now() < +new Date('2026-01-20'))('create view with camelCase', async () => {
	const test = pgTable('test', {
		test_id: serial().primaryKey(),
		test_name: text().notNull(),
	});

	const testView = pgView('test_view').as((qb) => {
		return qb
			.select({
				test_id: test.test_id,
				test_name: test.test_name,
			})
			.from(test);
	});
	const schema = { test, testView };
	const casing = 'camelCase';

	const { sqlStatements: st1, next: n1 } = await diff({}, schema, [], casing);
	const { sqlStatements: pst1 } = await push({ db, to: schema, casing });
	const expectedSt1 = [
		'CREATE TABLE "test" (\n'
		+ '\t"testId" serial PRIMARY KEY,\n'
		+ '\t"testName" text NOT NULL\n'
		+ ');\n',
		'CREATE VIEW "test_view" AS (select "testId", "testName" from "test");',
	];
	expect(st1).toStrictEqual(expectedSt1);
	expect(pst1).toStrictEqual(expectedSt1);

	const { sqlStatements: st2 } = await diff(n1, schema, [], casing);
	const { sqlStatements: pst2 } = await push({ db, to: schema, casing });
	expect(st2).toStrictEqual([]);
	expect(pst2).toStrictEqual([]);
});

test('drop column referenced by a view', async () => {
	const users = pgTable('users', { id: integer(), name: text() });
	const uv = pgView('users_view').as((q) => q.select().from(users));
	const from = { users, uv };

	const users2 = pgTable('users', { id: integer() });
	const uv2 = pgView('users_view').as((q) => q.select().from(users2));
	const to = { users2, uv2 };

	// push command ignores view definition
	const res = await diff(from, to, []);
	await push({ db, to: from });
	// no view recreate in push so far, with shadow db we can
	// const resp = await push({ db, to });

	for (const st of res.sqlStatements) {
		await db.query(st);
	}

	expect(res.sqlStatements).toStrictEqual([
		'DROP VIEW "users_view";',
		'ALTER TABLE "users" DROP COLUMN "name";',
		'CREATE VIEW "users_view" AS (select "id" from "users");',
	]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/5116
test('rename column referenced in view', async () => {
	const users = pgTable('users', { id: integer(), name: text() });
	const uv = pgView('users_view').as((q) => q.select().from(users));

	const from = {
		users,
		uv,
	};

	const users2 = pgTable('users', { id2: integer(), name2: text() });
	const uv2 = pgView('users_view').as((q) => q.select().from(users2));
	const to = { users2, uv2 };

	// push command ignores view definition
	const res = await diff(from, to, ['public.users.name->public.users.name2', 'public.users.id->public.users.id2']);
	await push({ db, to: from });
	for (const s of res.sqlStatements) {
		await db.query(s);
	}
	expect(res.sqlStatements).toStrictEqual([
		'DROP VIEW "users_view";',
		'ALTER TABLE "users" RENAME COLUMN "name" TO "name2";',
		'ALTER TABLE "users" RENAME COLUMN "id" TO "id2";',
		'CREATE VIEW "users_view" AS (select "id2", "name2" from "users");',
	]);
});
