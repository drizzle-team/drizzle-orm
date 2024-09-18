import { eq, sql } from 'drizzle-orm';
import { integer, pgSchema, pgTable, pgView } from 'drizzle-orm/pg-core';
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
		compositePkName: '',
	});
	expect(statements[1]).toStrictEqual({
		type: 'create_view',
		name: 'some_view',
		definition: `select "id" from "users"`,
		schema: 'public',
		with: undefined,
	});

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`CREATE TABLE IF NOT EXISTS "users" (
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
		compositePkName: '',
	});
	expect(statements[1]).toStrictEqual({
		type: 'create_view',
		name: 'some_view',
		definition: `SELECT * FROM "users"`,
		schema: 'public',
		with: undefined,
	});

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`CREATE TABLE IF NOT EXISTS "users" (
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
	});

	expect(sqlStatements.length).toBe(3);
	expect(sqlStatements[0]).toBe(`CREATE TABLE IF NOT EXISTS "users" (
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
	});

	expect(sqlStatements.length).toBe(4);
	expect(sqlStatements[0]).toBe(`CREATE SCHEMA "new_schema";\n`);
	expect(sqlStatements[1]).toBe(`CREATE TABLE IF NOT EXISTS "new_schema"."users" (
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

test('drop view #2', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgView('some_view').as((qb) => qb.select().from(users)),
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

test('drop view #3', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view1: pgView('some_view1').with({ checkOption: 'cascaded', securityBarrier: true, securityInvoker: true }).as((
			qb,
		) => qb.select().from(users)),
		view2: pgView('some_view2', { id: integer('id') }).with({
			checkOption: 'cascaded',
			securityBarrier: true,
			securityInvoker: true,
		}).as(sql`SELECT * FROM ${users}`),
	};

	const to = {
		users: users,
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'drop_view',
		name: 'some_view1',
		schema: 'public',
	});
	expect(statements[1]).toStrictEqual({
		type: 'drop_view',
		name: 'some_view2',
		schema: 'public',
	});

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`DROP VIEW "public"."some_view1";`);
	expect(sqlStatements[1]).toBe(`DROP VIEW "public"."some_view2";`);
});

test('drop view #4', async () => {
	const schema = pgSchema('new_schema');

	const users = schema.table('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		schema,
		view1: schema.view('some_view1').with({ checkOption: 'cascaded', securityBarrier: true, securityInvoker: true }).as(
			(qb) => qb.select().from(users),
		),
		view2: schema.view('some_view2', { id: integer('id') }).with({
			checkOption: 'cascaded',
			securityBarrier: true,
			securityInvoker: true,
		}).as(sql`SELECT * FROM ${users}`),
	};

	const to = {
		schema,
		users: users,
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'drop_view',
		name: 'some_view1',
		schema: 'new_schema',
	});
	expect(statements[1]).toStrictEqual({
		type: 'drop_view',
		name: 'some_view2',
		schema: 'new_schema',
	});

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`DROP VIEW "new_schema"."some_view1";`);
	expect(sqlStatements[1]).toBe(`DROP VIEW "new_schema"."some_view2";`);
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
	expect(sqlStatements[0]).toBe(`ALTER VIEW "public"."some_view" RENAME TO "public"."new_some_view";`);
});

test('rename view #2', async () => {
	const schema = pgSchema('new_schema');

	const from = {
		view: schema.view('some_view', { id: integer('id') }).as(sql`SELECT * FROM "users"`),
	};

	const to = {
		view: schema.view('new_some_view', { id: integer('id') }).as(sql`SELECT * FROM "users"`),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, [
		'new_schema.some_view->new_schema.new_some_view',
	]);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'rename_view',
		nameFrom: 'some_view',
		nameTo: 'new_some_view',
		schema: 'new_schema',
	});
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`ALTER VIEW "new_schema"."some_view" RENAME TO "new_schema"."new_some_view";`);
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

	const { statements, sqlStatements } = await diffTestSchemas(from, to, ['public.some_view->new_schema.new_some_view']);

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

test('add with option to view', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgView('some_view').as((qb) => qb.select().from(users)),
	};

	const to = {
		users,
		view: pgView('some_view').with({ checkOption: 'cascaded', securityBarrier: true, securityInvoker: true }).as((qb) =>
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
			securityInvoker: true,
		},
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER VIEW "public"."some_view" SET (check_option = cascaded, security_barrier = true, security_invoker = true);`,
	);
});

test('drop with option to view', async () => {
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
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER VIEW "public"."some_view" RESET (check_option, security_barrier, security_invoker);`,
	);
});

test('alter with option in view', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgView('some_view').with({ checkOption: 'local', securityBarrier: true, securityInvoker: true }).as((qb) =>
			qb.select().from(users)
		),
	};

	const to = {
		users,
		view: pgView('some_view').with({ checkOption: 'cascaded', securityBarrier: true, securityInvoker: true }).as((qb) =>
			qb.select().from(users)
		),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_view_alter_with_option',
		name: 'some_view',
		schema: 'public',
		with: {
			checkOption: 'cascaded',
			securityBarrier: true,
			securityInvoker: true,
		},
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER VIEW "public"."some_view" SET (check_option = cascaded, security_barrier = true, security_invoker = true);`,
	);
});

test('alter view', async () => {
	const users = pgTable('users', {
		id: integer('id').primaryKey().notNull(),
	});

	const from = {
		users,
		view: pgView('some_view').with({ checkOption: 'local', securityBarrier: true, securityInvoker: true }).as((qb) =>
			qb.select().from(users)
		),
	};

	const to = {
		users,
		view: pgView('some_view').with({ checkOption: 'cascaded', securityBarrier: true, securityInvoker: true }).as((qb) =>
			qb.select().from(users).where(eq(users.id, 1))
		),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'drop_view',
		name: 'some_view',
		schema: 'public',
	});
	expect(statements[1]).toStrictEqual({
		type: 'create_view',
		name: 'some_view',
		schema: 'public',
		definition: `select "id" from "users" where "users"."id" = 1`,
		with: {
			checkOption: 'cascaded',
			securityBarrier: true,
			securityInvoker: true,
		},
	});

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(
		`DROP VIEW "public"."some_view";`,
	);
	expect(sqlStatements[1]).toBe(
		`CREATE VIEW "public"."some_view" WITH (check_option = cascaded, security_barrier = true, security_invoker = true) AS (select "id" from "users" where "users"."id" = 1);`,
	);
});
