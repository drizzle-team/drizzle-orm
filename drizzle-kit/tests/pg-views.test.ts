import { sql } from 'drizzle-orm';
import { integer, pgMaterializedView, pgSchema, pgTable, pgView } from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import { diffTestSchemas } from './schemaDiffer';

test('create table and view #1', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view: pgView('some_view').as((qb) => qb.select().from(users)),
	};

	const { statements, sqlStatements } = await diffTestSchemas({}, to, []);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'create_table',
		tableName: 'users',
		schema: '',
		columns: [{
			name: 'id',
			notNull: true,
			primaryKey: true,
			type: 'integer',
		}],
		compositePKs: [],
		uniqueConstraints: [],
		isRLSEnabled: false,
		compositePkName: '',
		checkConstraints: [],
		policies: [],
	});
	expect(statements[1]).toStrictEqual({
		type: 'create_view',
		name: 'some_view',
		definition: `select "id" from "users"`,
		schema: 'public',
		with: undefined,
		materialized: false,
		tablespace: undefined,
		using: undefined,
		withNoData: false,
	});

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`CREATE TABLE "users" (
\t"id" integer PRIMARY KEY NOT NULL
);\n`);
	expect(sqlStatements[1]).toBe(`CREATE VIEW "public"."some_view" AS (select "id" from "users");`);
});

test('create table and view #2', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view: pgView('some_view', { id: integer('id') }).as(sql`SELECT * FROM ${users}`),
	};

	const { statements, sqlStatements } = await diffTestSchemas({}, to, []);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'create_table',
		tableName: 'users',
		schema: '',
		columns: [{
			name: 'id',
			notNull: true,
			primaryKey: true,
			type: 'integer',
		}],
		compositePKs: [],
		uniqueConstraints: [],
		isRLSEnabled: false,
		compositePkName: '',
		policies: [],
		checkConstraints: [],
	});
	expect(statements[1]).toStrictEqual({
		type: 'create_view',
		name: 'some_view',
		definition: `SELECT * FROM "users"`,
		schema: 'public',
		with: undefined,
		materialized: false,
		tablespace: undefined,
		using: undefined,
		withNoData: false,
	});

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`CREATE TABLE "users" (
\t"id" integer PRIMARY KEY NOT NULL
);\n`);
	expect(sqlStatements[1]).toBe(`CREATE VIEW "public"."some_view" AS (SELECT * FROM "users");`);
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

	const { statements, sqlStatements } = await diffTestSchemas({}, to, []);

	expect(statements.length).toBe(3);
	expect(statements[0]).toStrictEqual({
		type: 'create_table',
		tableName: 'users',
		schema: '',
		columns: [{
			name: 'id',
			notNull: true,
			primaryKey: true,
			type: 'integer',
		}],
		compositePKs: [],
		uniqueConstraints: [],
		compositePkName: '',
		checkConstraints: [],
		isRLSEnabled: false,
		policies: [],
	});
	expect(statements[1]).toStrictEqual({
		type: 'create_view',
		name: 'some_view1',
		definition: `SELECT * FROM "users"`,
		schema: 'public',
		with: {
			checkOption: 'local',
			securityBarrier: false,
			securityInvoker: true,
		},
		materialized: false,
		tablespace: undefined,
		using: undefined,
		withNoData: false,
	});
	expect(statements[2]).toStrictEqual({
		type: 'create_view',
		name: 'some_view2',
		definition: `select "id" from "users"`,
		schema: 'public',
		with: {
			checkOption: 'cascaded',
			securityBarrier: true,
			securityInvoker: false,
		},
		materialized: false,
		tablespace: undefined,
		using: undefined,
		withNoData: false,
	});

	expect(sqlStatements.length).toBe(3);
	expect(sqlStatements[0]).toBe(`CREATE TABLE "users" (
\t"id" integer PRIMARY KEY NOT NULL
);\n`);
	expect(sqlStatements[1]).toBe(
		`CREATE VIEW "public"."some_view1" WITH (check_option = local, security_barrier = false, security_invoker = true) AS (SELECT * FROM "users");`,
	);
	expect(sqlStatements[2]).toBe(
		`CREATE VIEW "public"."some_view2" WITH (check_option = cascaded, security_barrier = true, security_invoker = false) AS (select "id" from "users");`,
	);
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

	const { statements, sqlStatements } = await diffTestSchemas({}, to, []);

	expect(statements.length).toBe(4);
	expect(statements[0]).toStrictEqual({
		type: 'create_schema',
		name: 'new_schema',
	});
	expect(statements[1]).toStrictEqual({
		type: 'create_table',
		tableName: 'users',
		schema: 'new_schema',
		columns: [{
			name: 'id',
			notNull: true,
			primaryKey: true,
			type: 'integer',
		}],
		compositePKs: [],
		uniqueConstraints: [],
		compositePkName: '',
		isRLSEnabled: false,
		policies: [],
		checkConstraints: [],
	});
	expect(statements[2]).toStrictEqual({
		type: 'create_view',
		name: 'some_view1',
		definition: `SELECT * FROM "new_schema"."users"`,
		schema: 'new_schema',
		with: {
			checkOption: 'local',
			securityBarrier: false,
			securityInvoker: true,
		},
		materialized: false,
		tablespace: undefined,
		using: undefined,
		withNoData: false,
	});
	expect(statements[3]).toStrictEqual({
		type: 'create_view',
		name: 'some_view2',
		definition: `select "id" from "new_schema"."users"`,
		schema: 'new_schema',
		with: {
			checkOption: 'cascaded',
			securityBarrier: true,
			securityInvoker: false,
		},
		materialized: false,
		tablespace: undefined,
		using: undefined,
		withNoData: false,
	});

	expect(sqlStatements.length).toBe(4);
	expect(sqlStatements[0]).toBe(`CREATE SCHEMA "new_schema";\n`);
	expect(sqlStatements[1]).toBe(`CREATE TABLE "new_schema"."users" (
\t"id" integer PRIMARY KEY NOT NULL
);\n`);
	expect(sqlStatements[2]).toBe(
		`CREATE VIEW "new_schema"."some_view1" WITH (check_option = local, security_barrier = false, security_invoker = true) AS (SELECT * FROM "new_schema"."users");`,
	);
	expect(sqlStatements[3]).toBe(
		`CREATE VIEW "new_schema"."some_view2" WITH (check_option = cascaded, security_barrier = true, security_invoker = false) AS (select "id" from "new_schema"."users");`,
	);
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

	await expect(diffTestSchemas({}, to, [])).rejects.toThrowError();
});

test('create table and view #6', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view1: pgView('some_view', { id: integer('id') }).with({ checkOption: 'cascaded' }).as(sql`SELECT * FROM ${users}`),
	};

	const { statements, sqlStatements } = await diffTestSchemas({}, to, []);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		columns: [
			{
				name: 'id',
				notNull: true,
				primaryKey: true,
				type: 'integer',
			},
		],
		compositePKs: [],
		compositePkName: '',
		schema: '',
		tableName: 'users',
		type: 'create_table',
		uniqueConstraints: [],
		checkConstraints: [],
		isRLSEnabled: false,
		policies: [],
	});
	expect(statements[1]).toStrictEqual({
		definition: 'SELECT * FROM "users"',
		name: 'some_view',
		schema: 'public',
		type: 'create_view',
		with: {
			checkOption: 'cascaded',
		},
		materialized: false,
		tablespace: undefined,
		using: undefined,
		withNoData: false,
	});

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`CREATE TABLE "users" (
\t"id" integer PRIMARY KEY NOT NULL
);\n`);
	expect(sqlStatements[1]).toBe(
		`CREATE VIEW "public"."some_view" WITH (check_option = cascaded) AS (SELECT * FROM "users");`,
	);
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

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('create table and materialized view #1', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view: pgMaterializedView('some_view').as((qb) => qb.select().from(users)),
	};

	const { statements, sqlStatements } = await diffTestSchemas({}, to, []);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'create_table',
		tableName: 'users',
		schema: '',
		columns: [{
			name: 'id',
			notNull: true,
			primaryKey: true,
			type: 'integer',
		}],
		compositePKs: [],
		uniqueConstraints: [],
		isRLSEnabled: false,
		policies: [],
		compositePkName: '',
		checkConstraints: [],
	});
	expect(statements[1]).toStrictEqual({
		type: 'create_view',
		name: 'some_view',
		definition: `select "id" from "users"`,
		schema: 'public',
		with: undefined,
		materialized: true,
		tablespace: undefined,
		using: undefined,
		withNoData: false,
	});

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`CREATE TABLE "users" (
\t"id" integer PRIMARY KEY NOT NULL
);\n`);
	expect(sqlStatements[1]).toBe(`CREATE MATERIALIZED VIEW "public"."some_view" AS (select "id" from "users");`);
});

test('create table and materialized view #2', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view: pgMaterializedView('some_view', { id: integer('id') }).as(sql`SELECT * FROM ${users}`),
	};

	const { statements, sqlStatements } = await diffTestSchemas({}, to, []);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'create_table',
		tableName: 'users',
		schema: '',
		columns: [{
			name: 'id',
			notNull: true,
			primaryKey: true,
			type: 'integer',
		}],
		compositePKs: [],
		uniqueConstraints: [],
		compositePkName: '',
		isRLSEnabled: false,
		policies: [],
		checkConstraints: [],
	});
	expect(statements[1]).toStrictEqual({
		type: 'create_view',
		name: 'some_view',
		definition: `SELECT * FROM "users"`,
		schema: 'public',
		with: undefined,
		materialized: true,
		tablespace: undefined,
		using: undefined,
		withNoData: false,
	});

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`CREATE TABLE "users" (
\t"id" integer PRIMARY KEY NOT NULL
);\n`);
	expect(sqlStatements[1]).toBe(`CREATE MATERIALIZED VIEW "public"."some_view" AS (SELECT * FROM "users");`);
});

test('create table and materialized view #3', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});
	const to = {
		users: users,
		view1: pgMaterializedView('some_view1', { id: integer('id') }).as(sql`SELECT * FROM ${users}`),
		view2: pgMaterializedView('some_view2').tablespace('some_tablespace').using('heap').withNoData().with({
			autovacuumEnabled: true,
			autovacuumFreezeMaxAge: 1,
			autovacuumFreezeMinAge: 1,
			autovacuumFreezeTableAge: 1,
			autovacuumMultixactFreezeMaxAge: 1,
			autovacuumMultixactFreezeMinAge: 1,
			autovacuumMultixactFreezeTableAge: 1,
			autovacuumVacuumCostDelay: 1,
			autovacuumVacuumCostLimit: 1,
			autovacuumVacuumScaleFactor: 1,
			autovacuumVacuumThreshold: 1,
			fillfactor: 1,
			logAutovacuumMinDuration: 1,
			parallelWorkers: 1,
			toastTupleTarget: 1,
			userCatalogTable: true,
			vacuumIndexCleanup: 'off',
			vacuumTruncate: false,
		}).as((qb) => qb.select().from(users)),
	};

	const { statements, sqlStatements } = await diffTestSchemas({}, to, []);

	expect(statements.length).toBe(3);
	expect(statements[0]).toStrictEqual({
		type: 'create_table',
		tableName: 'users',
		schema: '',
		columns: [{
			name: 'id',
			notNull: true,
			primaryKey: true,
			type: 'integer',
		}],
		compositePKs: [],
		uniqueConstraints: [],
		isRLSEnabled: false,
		compositePkName: '',
		policies: [],
		checkConstraints: [],
	});
	expect(statements[1]).toStrictEqual({
		type: 'create_view',
		name: 'some_view1',
		definition: `SELECT * FROM "users"`,
		schema: 'public',
		with: undefined,
		materialized: true,
		withNoData: false,
		using: undefined,
		tablespace: undefined,
	});
	expect(statements[2]).toStrictEqual({
		type: 'create_view',
		name: 'some_view2',
		definition: `select "id" from "users"`,
		schema: 'public',
		with: {
			autovacuumEnabled: true,
			autovacuumFreezeMaxAge: 1,
			autovacuumFreezeMinAge: 1,
			autovacuumFreezeTableAge: 1,
			autovacuumMultixactFreezeMaxAge: 1,
			autovacuumMultixactFreezeMinAge: 1,
			autovacuumMultixactFreezeTableAge: 1,
			autovacuumVacuumCostDelay: 1,
			autovacuumVacuumCostLimit: 1,
			autovacuumVacuumScaleFactor: 1,
			autovacuumVacuumThreshold: 1,
			fillfactor: 1,
			logAutovacuumMinDuration: 1,
			parallelWorkers: 1,
			toastTupleTarget: 1,
			userCatalogTable: true,
			vacuumIndexCleanup: 'off',
			vacuumTruncate: false,
		},
		materialized: true,
		tablespace: 'some_tablespace',
		using: 'heap',
		withNoData: true,
	});

	expect(sqlStatements.length).toBe(3);
	expect(sqlStatements[0]).toBe(`CREATE TABLE "users" (
\t"id" integer PRIMARY KEY NOT NULL
);\n`);
	expect(sqlStatements[1]).toBe(
		`CREATE MATERIALIZED VIEW "public"."some_view1" AS (SELECT * FROM "users");`,
	);
	expect(sqlStatements[2]).toBe(
		`CREATE MATERIALIZED VIEW "public"."some_view2" USING "heap" WITH (autovacuum_enabled = true, autovacuum_freeze_max_age = 1, autovacuum_freeze_min_age = 1, autovacuum_freeze_table_age = 1, autovacuum_multixact_freeze_max_age = 1, autovacuum_multixact_freeze_min_age = 1, autovacuum_multixact_freeze_table_age = 1, autovacuum_vacuum_cost_delay = 1, autovacuum_vacuum_cost_limit = 1, autovacuum_vacuum_scale_factor = 1, autovacuum_vacuum_threshold = 1, fillfactor = 1, log_autovacuum_min_duration = 1, parallel_workers = 1, toast_tuple_target = 1, user_catalog_table = true, vacuum_index_cleanup = off, vacuum_truncate = false) TABLESPACE some_tablespace AS (select "id" from "users") WITH NO DATA;`,
	);
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

	await expect(diffTestSchemas({}, to, [])).rejects.toThrowError();
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

	const { statements, sqlStatements } = await diffTestSchemas({}, to, []);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		columns: [
			{
				name: 'id',
				notNull: true,
				primaryKey: true,
				type: 'integer',
			},
		],
		compositePKs: [],
		compositePkName: '',
		schema: '',
		tableName: 'users',
		type: 'create_table',
		uniqueConstraints: [],
		isRLSEnabled: false,
		policies: [],
		checkConstraints: [],
	});
	expect(statements[1]).toEqual({
		definition: 'SELECT * FROM "users"',
		name: 'some_view',
		schema: 'public',
		type: 'create_view',
		with: {
			autovacuumFreezeMinAge: 14,
		},
		materialized: true,
		tablespace: undefined,
		using: undefined,
		withNoData: false,
	});

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`CREATE TABLE "users" (
\t"id" integer PRIMARY KEY NOT NULL
);\n`);
	expect(sqlStatements[1]).toBe(
		`CREATE MATERIALIZED VIEW "public"."some_view" WITH (autovacuum_freeze_min_age = 14) AS (SELECT * FROM "users");`,
	);
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

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
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

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'drop_view',
		name: 'some_view',
		schema: 'public',
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`DROP VIEW "public"."some_view";`);
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

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
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

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'drop_view',
		name: 'some_view',
		schema: 'public',
		materialized: true,
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`DROP MATERIALIZED VIEW "public"."some_view";`);
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

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('rename view #1', async () => {
	const from = {
		view: pgView('some_view', { id: integer('id') }).as(sql`SELECT * FROM "users"`),
	};

	const to = {
		view: pgView('new_some_view', { id: integer('id') }).as(sql`SELECT * FROM "users"`),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, ['public.some_view->public.new_some_view']);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'rename_view',
		nameFrom: 'some_view',
		nameTo: 'new_some_view',
		schema: 'public',
	});
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`ALTER VIEW "public"."some_view" RENAME TO "new_some_view";`);
});

test('rename view with existing flag', async () => {
	const from = {
		view: pgView('some_view', { id: integer('id') }).existing(),
	};

	const to = {
		view: pgView('new_some_view', { id: integer('id') }).existing(),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, ['public.some_view->public.new_some_view']);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('rename materialized view #1', async () => {
	const from = {
		view: pgMaterializedView('some_view', { id: integer('id') }).as(sql`SELECT * FROM "users"`),
	};

	const to = {
		view: pgMaterializedView('new_some_view', { id: integer('id') }).as(sql`SELECT * FROM "users"`),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, ['public.some_view->public.new_some_view']);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'rename_view',
		nameFrom: 'some_view',
		nameTo: 'new_some_view',
		schema: 'public',
		materialized: true,
	});
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`ALTER MATERIALIZED VIEW "public"."some_view" RENAME TO "new_some_view";`);
});

test('rename materialized view with existing flag', async () => {
	const from = {
		view: pgMaterializedView('some_view', { id: integer('id') }).existing(),
	};

	const to = {
		view: pgMaterializedView('new_some_view', { id: integer('id') }).existing(),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, ['public.some_view->public.new_some_view']);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('view alter schema', async () => {
	const schema = pgSchema('new_schema');

	const from = {
		view: pgView('some_view', { id: integer('id') }).as(sql`SELECT * FROM "users"`),
	};

	const to = {
		schema,
		view: schema.view('some_view', { id: integer('id') }).as(sql`SELECT * FROM "users"`),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, ['public.some_view->new_schema.some_view']);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'create_schema',
		name: 'new_schema',
	});
	expect(statements[1]).toStrictEqual({
		type: 'alter_view_alter_schema',
		toSchema: 'new_schema',
		fromSchema: 'public',
		name: 'some_view',
	});
	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`CREATE SCHEMA "new_schema";\n`);
	expect(sqlStatements[1]).toBe(`ALTER VIEW "public"."some_view" SET SCHEMA "new_schema";`);
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

	const { statements, sqlStatements } = await diffTestSchemas(from, to, ['public.some_view->new_schema.some_view']);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'create_schema',
		name: 'new_schema',
	});
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`CREATE SCHEMA "new_schema";\n`);
});

test('view alter schema for materialized', async () => {
	const schema = pgSchema('new_schema');

	const from = {
		view: pgMaterializedView('some_view', { id: integer('id') }).as(sql`SELECT * FROM "users"`),
	};

	const to = {
		schema,
		view: schema.materializedView('some_view', { id: integer('id') }).as(sql`SELECT * FROM "users"`),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, ['public.some_view->new_schema.some_view']);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'create_schema',
		name: 'new_schema',
	});
	expect(statements[1]).toStrictEqual({
		type: 'alter_view_alter_schema',
		toSchema: 'new_schema',
		fromSchema: 'public',
		name: 'some_view',
		materialized: true,
	});
	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`CREATE SCHEMA "new_schema";\n`);
	expect(sqlStatements[1]).toBe(`ALTER MATERIALIZED VIEW "public"."some_view" SET SCHEMA "new_schema";`);
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

	const { statements, sqlStatements } = await diffTestSchemas(from, to, ['public.some_view->new_schema.some_view']);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'create_schema',
		name: 'new_schema',
	});
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`CREATE SCHEMA "new_schema";\n`);
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

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		name: 'some_view',
		schema: 'public',
		type: 'alter_view_add_with_option',
		with: {
			checkOption: 'cascaded',
			securityBarrier: true,
		},
		materialized: false,
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER VIEW "public"."some_view" SET (check_option = cascaded, security_barrier = true);`,
	);
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

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
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
		view: pgMaterializedView('some_view').with({ autovacuumMultixactFreezeMaxAge: 3 }).as((qb) =>
			qb.select().from(users)
		),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		name: 'some_view',
		schema: 'public',
		type: 'alter_view_add_with_option',
		with: {
			autovacuumMultixactFreezeMaxAge: 3,
		},
		materialized: true,
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER MATERIALIZED VIEW "public"."some_view" SET (autovacuum_multixact_freeze_max_age = 3);`,
	);
});

test('add with option to materialized view with existing flag', async () => {
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

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
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

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		name: 'some_view',
		schema: 'public',
		type: 'alter_view_drop_with_option',
		materialized: false,
		with: {
			checkOption: 'cascaded',
			securityBarrier: true,
			securityInvoker: true,
		},
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER VIEW "public"."some_view" RESET (check_option, security_barrier, security_invoker);`,
	);
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

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('drop with option from materialized view #1', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgMaterializedView('some_view').with({ autovacuumEnabled: true, autovacuumFreezeMaxAge: 10 }).as((qb) =>
			qb.select().from(users)
		),
	};

	const to = {
		users,
		view: pgMaterializedView('some_view').as((qb) => qb.select().from(users)),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		name: 'some_view',
		schema: 'public',
		type: 'alter_view_drop_with_option',
		materialized: true,
		with: {
			autovacuumEnabled: true,
			autovacuumFreezeMaxAge: 10,
		},
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER MATERIALIZED VIEW "public"."some_view" RESET (autovacuum_enabled, autovacuum_freeze_max_age);`,
	);
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

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
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

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		name: 'some_view',
		schema: 'public',
		type: 'alter_view_drop_with_option',
		with: {
			securityInvoker: true,
		},
		materialized: false,
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER VIEW "public"."some_view" RESET (security_invoker);`,
	);
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

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
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

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		name: 'some_view',
		schema: 'public',
		type: 'alter_view_drop_with_option',
		with: {
			autovacuumVacuumScaleFactor: 1,
		},
		materialized: true,
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER MATERIALIZED VIEW "public"."some_view" RESET (autovacuum_vacuum_scale_factor);`,
	);
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

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('alter with option in view #2', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgView('some_view').with({ checkOption: 'local', securityBarrier: true, securityInvoker: true }).as((qb) =>
			qb.selectDistinct().from(users)
		),
	};

	const to = {
		users,
		view: pgView('some_view').with({ checkOption: 'cascaded', securityBarrier: true, securityInvoker: true }).as((qb) =>
			qb.selectDistinct().from(users)
		),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_view_add_with_option',
		name: 'some_view',
		schema: 'public',
		with: {
			checkOption: 'cascaded',
		},
		materialized: false,
	});

	expect(sqlStatements.length).toBe(1);

	expect(sqlStatements[0]).toBe(
		`ALTER VIEW "public"."some_view" SET (check_option = cascaded);`,
	);
});

test('alter with option in materialized view #2', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgMaterializedView('some_view').with({ autovacuumEnabled: true, fillfactor: 1 }).as((qb) =>
			qb.select().from(users)
		),
	};

	const to = {
		users,
		view: pgMaterializedView('some_view').with({ autovacuumEnabled: false, fillfactor: 1 }).as((qb) =>
			qb.select().from(users)
		),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_view_add_with_option',
		name: 'some_view',
		schema: 'public',
		with: {
			autovacuumEnabled: false,
		},
		materialized: true,
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER MATERIALIZED VIEW "public"."some_view" SET (autovacuum_enabled = false);`,
	);
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
		}).as(sql`SELECT '123'`),
	};

	const to = {
		users,
		view: pgView('some_view', { id: integer('id') }).with({
			checkOption: 'local',
			securityBarrier: true,
			securityInvoker: true,
		}).as(sql`SELECT '1234'`),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual(
		{
			name: 'some_view',
			schema: 'public',
			type: 'drop_view',
		},
	);
	expect(statements[1]).toStrictEqual(
		{
			definition: "SELECT '1234'",
			name: 'some_view',
			schema: 'public',
			type: 'create_view',
			materialized: false,
			with: {
				checkOption: 'local',
				securityBarrier: true,
				securityInvoker: true,
			},
			withNoData: false,
			tablespace: undefined,
			using: undefined,
		},
	);
	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe('DROP VIEW "public"."some_view";');
	expect(sqlStatements[1]).toBe(
		`CREATE VIEW "public"."some_view" WITH (check_option = local, security_barrier = true, security_invoker = true) AS (SELECT '1234');`,
	);
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

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
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

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual(
		{
			name: 'some_view',
			schema: 'public',
			type: 'drop_view',
			materialized: true,
		},
	);
	expect(statements[1]).toStrictEqual(
		{
			definition: "SELECT '1234'",
			name: 'some_view',
			schema: 'public',
			type: 'create_view',
			with: {
				autovacuumVacuumCostLimit: 1,
			},
			materialized: true,
			withNoData: false,
			tablespace: undefined,
			using: undefined,
		},
	);
	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe('DROP MATERIALIZED VIEW "public"."some_view";');
	expect(sqlStatements[1]).toBe(
		`CREATE MATERIALIZED VIEW "public"."some_view" WITH (autovacuum_vacuum_cost_limit = 1) AS (SELECT '1234');`,
	);
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

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
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

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(2);
	expect(statements[0]).toEqual({
		type: 'drop_view',
		name: 'some_view',
		schema: 'public',
		materialized: true,
	});
	expect(statements[1]).toEqual({
		definition: "SELECT 'asd'",
		materialized: true,
		name: 'some_view',
		schema: 'public',
		tablespace: undefined,
		type: 'create_view',
		using: undefined,
		with: {
			autovacuumVacuumCostLimit: 1,
		},
		withNoData: false,
	});
	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`DROP MATERIALIZED VIEW "public"."some_view";`);
	expect(sqlStatements[1]).toBe(
		`CREATE MATERIALIZED VIEW "public"."some_view" WITH (autovacuum_vacuum_cost_limit = 1) AS (SELECT 'asd');`,
	);
});

test('alter tablespace - materialize', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgMaterializedView('some_view', { id: integer('id') }).tablespace('some_tablespace').with({
			autovacuumVacuumCostLimit: 1,
		}).as(sql`SELECT 'asd'`),
	};

	const to = {
		users,
		view: pgMaterializedView('some_view', { id: integer('id') }).tablespace('new_tablespace').with({
			autovacuumVacuumCostLimit: 1,
		}).as(sql`SELECT 'asd'`),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toEqual({
		type: 'alter_view_alter_tablespace',
		name: 'some_view',
		schema: 'public',
		materialized: true,
		toTablespace: 'new_tablespace',
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER MATERIALIZED VIEW "public"."some_view" SET TABLESPACE new_tablespace;`,
	);
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
		view: pgMaterializedView('some_view', { id: integer('id') }).tablespace('new_tablespace').with({
			autovacuumVacuumCostLimit: 1,
		}).as(sql`SELECT 'asd'`),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toEqual({
		type: 'alter_view_alter_tablespace',
		name: 'some_view',
		schema: 'public',
		materialized: true,
		toTablespace: 'new_tablespace',
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER MATERIALIZED VIEW "public"."some_view" SET TABLESPACE new_tablespace;`,
	);
});

test('drop tablespace - materialize', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgMaterializedView('some_view', { id: integer('id') }).tablespace('new_tablespace').with({
			autovacuumVacuumCostLimit: 1,
		}).as(sql`SELECT 'asd'`),
	};

	const to = {
		users,
		view: pgMaterializedView('some_view', { id: integer('id') }).with({
			autovacuumVacuumCostLimit: 1,
		}).as(sql`SELECT 'asd'`),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toEqual({
		type: 'alter_view_alter_tablespace',
		name: 'some_view',
		schema: 'public',
		materialized: true,
		toTablespace: 'pg_default',
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER MATERIALIZED VIEW "public"."some_view" SET TABLESPACE pg_default;`,
	);
});

test('set existing - materialized', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgMaterializedView('some_view', { id: integer('id') }).tablespace('new_tablespace').with({
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

	const { statements, sqlStatements } = await diffTestSchemas(from, to, ['public.some_view->public.new_some_view']);

	expect(statements.length).toBe(0);

	expect(sqlStatements.length).toBe(0);
});

test('drop existing - materialized', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgMaterializedView('some_view', { id: integer('id') }).tablespace('new_tablespace').with({
			autovacuumVacuumCostLimit: 1,
		}).existing(),
	};

	const to = {
		users,
		view: pgMaterializedView('some_view', { id: integer('id') }).with({
			autovacuumVacuumCostLimit: 1,
			autovacuumFreezeMinAge: 1,
		}).withNoData().as(sql`SELECT 'asd'`),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(2);

	expect(sqlStatements.length).toBe(2);
});

test('set existing', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgView('some_view', { id: integer('id') }).with({
			checkOption: 'cascaded',
		}).as(sql`SELECT 'asd'`),
	};

	const to = {
		users,
		view: pgView('new_some_view', { id: integer('id') }).with({
			checkOption: 'cascaded',
			securityBarrier: true,
		}).existing(),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, ['public.some_view->public.new_some_view']);

	expect(statements.length).toBe(0);

	expect(sqlStatements.length).toBe(0);
});

test('alter using - materialize', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgMaterializedView('some_view', { id: integer('id') }).tablespace('some_tablespace').using('some_using').with(
			{
				autovacuumVacuumCostLimit: 1,
			},
		).as(sql`SELECT 'asd'`),
	};

	const to = {
		users,
		view: pgMaterializedView('some_view', { id: integer('id') }).tablespace('some_tablespace').using('new_using').with({
			autovacuumVacuumCostLimit: 1,
		}).as(sql`SELECT 'asd'`),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toEqual({
		type: 'alter_view_alter_using',
		name: 'some_view',
		schema: 'public',
		materialized: true,
		toUsing: 'new_using',
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER MATERIALIZED VIEW "public"."some_view" SET ACCESS METHOD "new_using";`,
	);
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
		view: pgMaterializedView('some_view', { id: integer('id') }).using('new_using').with({
			autovacuumVacuumCostLimit: 1,
		}).as(sql`SELECT 'asd'`),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toEqual({
		type: 'alter_view_alter_using',
		name: 'some_view',
		schema: 'public',
		materialized: true,
		toUsing: 'new_using',
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER MATERIALIZED VIEW "public"."some_view" SET ACCESS METHOD "new_using";`,
	);
});

test('drop using - materialize', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgMaterializedView('some_view', { id: integer('id') }).using('new_using').with({
			autovacuumVacuumCostLimit: 1,
		}).as(sql`SELECT 'asd'`),
	};

	const to = {
		users,
		view: pgMaterializedView('some_view', { id: integer('id') }).with({
			autovacuumVacuumCostLimit: 1,
		}).as(sql`SELECT 'asd'`),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toEqual({
		type: 'alter_view_alter_using',
		name: 'some_view',
		schema: 'public',
		materialized: true,
		toUsing: 'heap',
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER MATERIALIZED VIEW "public"."some_view" SET ACCESS METHOD "heap";`,
	);
});

test('rename view and alter view', async () => {
	const from = {
		view: pgView('some_view', { id: integer('id') }).as(sql`SELECT * FROM "users"`),
	};

	const to = {
		view: pgView('new_some_view', { id: integer('id') }).with({ checkOption: 'cascaded' }).as(
			sql`SELECT * FROM "users"`,
		),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, ['public.some_view->public.new_some_view']);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'rename_view',
		nameFrom: 'some_view',
		nameTo: 'new_some_view',
		schema: 'public',
	});
	expect(statements[1]).toStrictEqual({
		materialized: false,
		name: 'new_some_view',
		schema: 'public',
		type: 'alter_view_add_with_option',
		with: {
			checkOption: 'cascaded',
		},
	});
	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`ALTER VIEW "public"."some_view" RENAME TO "new_some_view";`);
	expect(sqlStatements[1]).toBe(`ALTER VIEW "public"."new_some_view" SET (check_option = cascaded);`);
});

test('moved schema and alter view', async () => {
	const schema = pgSchema('my_schema');
	const from = {
		schema,
		view: pgView('some_view', { id: integer('id') }).as(sql`SELECT * FROM "users"`),
	};

	const to = {
		schema,
		view: schema.view('some_view', { id: integer('id') }).with({ checkOption: 'cascaded' }).as(
			sql`SELECT * FROM "users"`,
		),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, ['public.some_view->my_schema.some_view']);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		fromSchema: 'public',
		name: 'some_view',
		toSchema: 'my_schema',
		type: 'alter_view_alter_schema',
	});
	expect(statements[1]).toStrictEqual({
		name: 'some_view',
		schema: 'my_schema',
		type: 'alter_view_add_with_option',
		materialized: false,
		with: {
			checkOption: 'cascaded',
		},
	});
	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`ALTER VIEW "public"."some_view" SET SCHEMA "my_schema";`);
	expect(sqlStatements[1]).toBe(`ALTER VIEW "my_schema"."some_view" SET (check_option = cascaded);`);
});
