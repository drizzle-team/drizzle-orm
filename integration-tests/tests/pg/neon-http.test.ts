import type { NeonQueryFunction } from '@neondatabase/serverless';
import { defineRelations, eq, getColumns, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import {
	bigint,
	bigserial,
	boolean,
	bytea,
	char,
	cidr,
	date,
	doublePrecision,
	inet,
	integer,
	interval,
	json,
	jsonb,
	line,
	macaddr,
	macaddr8,
	numeric,
	pgEnum,
	pgMaterializedView,
	pgTable,
	point,
	real,
	serial,
	smallint,
	smallserial,
	text,
	time,
	timestamp,
	uuid,
	varchar,
} from 'drizzle-orm/pg-core';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { describe, expect, expectTypeOf, vi } from 'vitest';
import { randomString } from '~/utils';
import { tests } from './common';
import { neonHttpTest as test } from './instrumentation';
import { usersMigratorTable, usersTable } from './schema';

const skips = [
	'RQB v2 transaction find first - no rows',
	'RQB v2 transaction find first - multiple rows',
	'RQB v2 transaction find first - with relation',
	'RQB v2 transaction find first - placeholders',
	'RQB v2 transaction find many - no rows',
	'RQB v2 transaction find many - multiple rows',
	'RQB v2 transaction find many - with relation',
	'RQB v2 transaction find many - placeholders',
];

// COMMON
tests(test, skips);

describe('migrator', () => {
	test.beforeEach(async ({ db }) => {
		await db.execute(sql`drop schema if exists public cascade`);
		await db.execute(sql`create schema public`);
		await db.execute(
			sql`
			create table users (
				id serial primary key,
				name text not null,
				verified boolean not null default false,
				jsonb jsonb,
				created_at timestamptz not null default now()
			)
		`,
		);
	});

	test('migrator : default migration strategy', async ({ neonhttp: db }) => {
		await db.execute(sql`drop table if exists all_columns, users12, "drizzle"."__drizzle_migrations"`);
		await migrate(db, { migrationsFolder: './drizzle2/pg' });

		await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });

		const result = await db.select().from(usersMigratorTable);

		expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

		await db.execute(sql`drop table all_columns, users12, "drizzle"."__drizzle_migrations"`);
	});

	test('migrator : migrate with custom schema', async ({ neonhttp: db }) => {
		await db.execute(sql`drop table if exists all_columns, users12, "drizzle"."__drizzle_migrations"`);
		await migrate(db, { migrationsFolder: './drizzle2/pg', migrationsSchema: 'custom_migrations' });

		// test if the custom migrations table was created
		const { rowCount } = await db.execute(sql`select * from custom_migrations."__drizzle_migrations";`);
		expect(rowCount && rowCount > 0).toBeTruthy();
		// test if the migrated table are working as expected
		await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
		const result = await db.select().from(usersMigratorTable);
		expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);
		await db.execute(sql`drop table all_columns, users12, custom_migrations."__drizzle_migrations"`);
	});

	test('migrator : migrate with custom table', async ({ neonhttp: db }) => {
		const customTable = randomString();
		await db.execute(sql`drop table if exists all_columns, users12, "drizzle"."__drizzle_migrations"`);
		await migrate(db, { migrationsFolder: './drizzle2/pg', migrationsTable: customTable });

		// test if the custom migrations table was created
		const { rowCount } = await db.execute(sql`select * from "drizzle".${sql.identifier(customTable)};`);
		expect(rowCount && rowCount > 0).toBeTruthy();
		// test if the migrated table are working as expected
		await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
		const result = await db.select().from(usersMigratorTable);
		expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);
		await db.execute(sql`drop table all_columns, users12, "drizzle".${sql.identifier(customTable)}`);
	});

	test('migrator : migrate with custom table and custom schema', async ({ neonhttp: db }) => {
		const customTable = randomString();
		await db.execute(sql`drop table if exists all_columns, users12, "drizzle"."__drizzle_migrations"`);
		await migrate(db, {
			migrationsFolder: './drizzle2/pg',
			migrationsTable: customTable,
			migrationsSchema: 'custom_migrations',
		});

		// test if the custom migrations table was created
		const { rowCount } = await db.execute(
			sql`select * from custom_migrations.${sql.identifier(customTable)};`,
		);
		expect(rowCount && rowCount > 0).toBeTruthy();
		// test if the migrated table are working as expected
		await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
		const result = await db.select().from(usersMigratorTable);
		expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);
		await db.execute(sql`drop table all_columns, users12, custom_migrations.${sql.identifier(customTable)}`);
	});

	test('migrator : --init', async ({ neonhttp: db }) => {
		const migrationsSchema = 'drzl_migrations_init';
		const migrationsTable = 'drzl_init';

		await db.execute(sql`drop schema if exists ${sql.identifier(migrationsSchema)} cascade;`);
		await db.execute(sql`drop schema if exists public cascade`);
		await db.execute(sql`create schema public`);

		const migratorRes = await migrate(db, {
			migrationsFolder: './drizzle2/pg-init',
			migrationsTable,
			migrationsSchema,
			// @ts-ignore - internal param
			init: true,
		});

		const meta = await db.select({
			hash: sql<string>`${sql.identifier('hash')}`.as('hash'),
			createdAt: sql<number>`${sql.identifier('created_at')}`.mapWith(Number).as('created_at'),
		}).from(sql`${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`);

		const res = await db.execute<{ tableExists: boolean }>(sql`SELECT EXISTS (
			SELECT 1
			FROM pg_tables
			WHERE schemaname = ${getTableConfig(usersMigratorTable).schema ?? 'public'} AND tablename = ${
			getTableConfig(usersMigratorTable).name
		}
		) as ${sql.identifier('tableExists')};`);

		expect(migratorRes).toStrictEqual(undefined);
		expect(meta.length).toStrictEqual(1);
		expect(res.rows[0]?.tableExists).toStrictEqual(false);
	});

	test('migrator : --init - local migrations error', async ({ neonhttp: db }) => {
		const migrationsSchema = 'drzl_migrations_init';
		const migrationsTable = 'drzl_init';

		await db.execute(sql`drop schema if exists ${sql.identifier(migrationsSchema)} cascade;`);
		await db.execute(sql`drop schema if exists public cascade`);
		await db.execute(sql`create schema public`);

		const migratorRes = await migrate(db, {
			migrationsFolder: './drizzle2/pg',
			migrationsTable,
			migrationsSchema,
			// @ts-ignore - internal param
			init: true,
		});

		const meta = await db.select({
			hash: sql<string>`${sql.identifier('hash')}`.as('hash'),
			createdAt: sql<number>`${sql.identifier('created_at')}`.mapWith(Number).as('created_at'),
		}).from(sql`${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`);

		const res = await db.execute<{ tableExists: boolean }>(sql`SELECT EXISTS (
			SELECT 1
			FROM pg_tables
			WHERE schemaname = ${getTableConfig(usersMigratorTable).schema ?? 'public'} AND tablename = ${
			getTableConfig(usersMigratorTable).name
		}
		) as ${sql.identifier('tableExists')};`);

		expect(migratorRes).toStrictEqual({ exitCode: 'localMigrations' });
		expect(meta.length).toStrictEqual(0);
		expect(res.rows[0]?.tableExists).toStrictEqual(false);
	});

	test('migrator : --init - db migrations error', async ({ neonhttp: db }) => {
		const migrationsSchema = 'drzl_migrations_init';
		const migrationsTable = 'drzl_init';

		await db.execute(sql`drop schema if exists ${sql.identifier(migrationsSchema)} cascade;`);
		await db.execute(sql`drop schema if exists public cascade`);
		await db.execute(sql`create schema public`);

		await migrate(db, {
			migrationsFolder: './drizzle2/pg-init',
			migrationsSchema,
			migrationsTable,
		});

		const migratorRes = await migrate(db, {
			migrationsFolder: './drizzle2/pg',
			migrationsTable,
			migrationsSchema,
			// @ts-ignore - internal param
			init: true,
		});

		const meta = await db.select({
			hash: sql<string>`${sql.identifier('hash')}`.as('hash'),
			createdAt: sql<number>`${sql.identifier('created_at')}`.mapWith(Number).as('created_at'),
		}).from(sql`${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`);

		const res = await db.execute<{ tableExists: boolean }>(sql`SELECT EXISTS (
			SELECT 1
			FROM pg_tables
			WHERE schemaname = ${getTableConfig(usersMigratorTable).schema ?? 'public'} AND tablename = ${
			getTableConfig(usersMigratorTable).name
		}
		) as ${sql.identifier('tableExists')};`);

		expect(migratorRes).toStrictEqual({ exitCode: 'databaseMigrations' });
		expect(meta.length).toStrictEqual(1);
		expect(res.rows[0]?.tableExists).toStrictEqual(true);
	});

	test('migrator: local migration is unapplied. Migrations timestamp is less than last db migration', async ({ neonhttp: db }) => {
		const users = pgTable('migrations_users', {
			id: serial('id').primaryKey(),
			name: text().notNull(),
			email: text().notNull(),
			age: integer(),
		});

		const users2 = pgTable('migrations_users2', {
			id: serial('id').primaryKey(),
			name: text().notNull(),
			email: text().notNull(),
			age: integer(),
		});

		await db.execute(sql`drop schema if exists "drizzle" cascade;`);
		await db.execute(sql`drop table if exists ${users}`);
		await db.execute(sql`drop table if exists ${users2}`);

		// create migration directory
		const migrationDir = './migrations/postgres-neon-http';
		if (existsSync(migrationDir)) rmSync(migrationDir, { recursive: true });
		mkdirSync(migrationDir, { recursive: true });

		// first branch
		mkdirSync(`${migrationDir}/20240101010101_initial`, { recursive: true });
		writeFileSync(
			`${migrationDir}/20240101010101_initial/migration.sql`,
			`CREATE TABLE "migrations_users" (\n"id" serial PRIMARY KEY NOT NULL,\n"name" text NOT NULL,\n"email" text NOT NULL\n);`,
		);
		mkdirSync(`${migrationDir}/20240303030303_third`, { recursive: true });
		writeFileSync(
			`${migrationDir}/20240303030303_third/migration.sql`,
			`ALTER TABLE "migrations_users" ADD COLUMN "age" integer;`,
		);

		await migrate(db, { migrationsFolder: migrationDir });
		const res1 = await db.insert(users).values({ name: 'John', email: '', age: 30 }).returning();

		// second migration was not applied yet
		await expect(db.insert(users2).values({ name: 'John', email: '', age: 30 })).rejects.toThrowError();

		// insert migration with earlier timestamp
		mkdirSync(`${migrationDir}/20240202020202_second`, { recursive: true });
		writeFileSync(
			`${migrationDir}/20240202020202_second/migration.sql`,
			`CREATE TABLE "migrations_users2" (\n"id" serial PRIMARY KEY NOT NULL,\n"name" text NOT NULL,\n"email" text NOT NULL\n,"age" integer\n);`,
		);
		await migrate(db, { migrationsFolder: migrationDir });

		const res2 = await db.insert(users2).values({ name: 'John', email: '', age: 30 }).returning();

		const expected = [{ id: 1, name: 'John', email: '', age: 30 }];
		expect(res1).toStrictEqual(expected);
		expect(res2).toStrictEqual(expected);

		rmSync(migrationDir, { recursive: true });
	});

	test('all date and time columns without timezone first case mode string', async ({ db, push }) => {
		const table = pgTable('all_columns', {
			id: serial('id').primaryKey(),
			timestamp: timestamp('timestamp_string', { mode: 'string', precision: 6 }).notNull(),
		});

		await push({ table });

		// 1. Insert date in string format without timezone in it
		await db.insert(table).values([
			{ timestamp: '2022-01-01 02:00:00.123456' },
		]);

		// 2, Select in string format and check that values are the same
		const result = await db.select().from(table);

		expect(result).toEqual([{ id: 1, timestamp: '2022-01-01 02:00:00.123456' }]);

		// 3. Select as raw query and check that values are the same
		const result2 = await db.execute<{
			id: number;
			timestamp_string: string;
		}>(sql`select * from ${table}`);

		expect(result2.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456' }]);
	});

	test('all date and time columns without timezone second case mode string', async ({ db, push }) => {
		const table = pgTable('all_columns', {
			id: serial('id').primaryKey(),
			timestamp: timestamp('timestamp_string', { mode: 'string', precision: 6 }).notNull(),
		});

		await push({ table });

		// 1. Insert date in string format with timezone in it
		await db.insert(table).values([
			{ timestamp: '2022-01-01T02:00:00.123456-02' },
		]);

		// 2, Select as raw query and check that values are the same
		const result = await db.execute<{
			id: number;
			timestamp_string: string;
		}>(sql`select * from ${table}`);

		expect(result.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456' }]);
	});

	test('all date and time columns without timezone third case mode date', async ({ db, push }) => {
		const table = pgTable('all_columns', {
			id: serial('id').primaryKey(),
			timestamp: timestamp('timestamp_string', { mode: 'date', precision: 3 }).notNull(),
		});

		await push({ table });

		const insertedDate = new Date('2022-01-01 20:00:00.123+04');

		// 1. Insert date as new date
		await db.insert(table).values([
			{ timestamp: insertedDate },
		]);

		// 2, Select as raw query as string
		const result = await db.execute<{
			id: number;
			timestamp_string: string;
		}>(sql`select * from ${table}`);

		// 3. Compare both dates using orm mapping - Need to add 'Z' to tell JS that it is UTC
		expect(new Date(result.rows[0]!.timestamp_string + 'Z').getTime()).toBe(insertedDate.getTime());
	});

	test('test mode string for timestamp with timezone', async ({ db, push }) => {
		const table = pgTable('all_columns', {
			id: serial('id').primaryKey(),
			timestamp: timestamp('timestamp_string', { mode: 'string', withTimezone: true, precision: 6 }).notNull(),
		});

		await push({ table });

		const timestampString = '2022-01-01 00:00:00.123456-0200';

		// 1. Insert date in string format with timezone in it
		await db.insert(table).values([
			{ timestamp: timestampString },
		]);

		// 2. Select date in string format and check that the values are the same
		const result = await db.select().from(table);

		// 2.1 Notice that postgres will return the date in UTC, but it is exactly the same
		expect(result).toEqual([{ id: 1, timestamp: '2022-01-01 02:00:00.123456+00' }]);

		// 3. Select as raw query and checke that values are the same
		const result2 = await db.execute<{
			id: number;
			timestamp_string: string;
		}>(sql`select * from ${table}`);

		// 3.1 Notice that postgres will return the date in UTC, but it is exactlt the same
		expect(result2.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456+00' }]);
	});

	test('test mode date for timestamp with timezone', async ({ db, push }) => {
		const table = pgTable('all_columns', {
			id: serial('id').primaryKey(),
			timestamp: timestamp('timestamp_string', { mode: 'date', withTimezone: true, precision: 3 }).notNull(),
		});

		await push({ table });

		const timestampString = new Date('2022-01-01 00:00:00.456-0200');

		// 1. Insert date in string format with timezone in it
		await db.insert(table).values([
			{ timestamp: timestampString },
		]);

		// 2. Select date in string format and check that the values are the same
		const result = await db.select().from(table);

		// 2.1 Notice that postgres will return the date in UTC, but it is exactly the same
		expect(result).toEqual([{ id: 1, timestamp: timestampString }]);

		// 3. Select as raw query and checke that values are the same
		const result2 = await db.execute<{
			id: number;
			timestamp_string: string;
		}>(sql`select * from ${table}`);

		// 3.1 Notice that postgres will return the date in UTC, but it is exactlt the same
		expect(result2.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.456+00' }]);
	});

	test('test mode string for timestamp with timezone in UTC timezone', async ({ db, push }) => {
		// get current timezone from db
		const timezone = await db.execute<{ TimeZone: string }>(sql`show timezone`);

		// set timezone to UTC
		await db.execute(sql`set time zone 'UTC'`);

		const table = pgTable('all_columns_6', {
			id: serial('id').primaryKey(),
			timestamp: timestamp('timestamp_string', { mode: 'string', withTimezone: true, precision: 6 }).notNull(),
		});

		await push({ table });

		const timestampString = '2022-01-01 00:00:00.123456-0200';

		// 1. Insert date in string format with timezone in it
		await db.insert(table).values([
			{ timestamp: timestampString },
		]);

		// 2. Select date in string format and check that the values are the same
		const result = await db.select().from(table);

		// 2.1 Notice that postgres will return the date in UTC, but it is exactly the same
		expect(result).toEqual([{ id: 1, timestamp: '2022-01-01 02:00:00.123456+00' }]);

		// 3. Select as raw query and checke that values are the same
		const result2 = await db.execute<{
			id: number;
			timestamp_string: string;
		}>(sql`select * from ${table}`);

		// 3.1 Notice that postgres will return the date in UTC, but it is exactlt the same
		expect(result2.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456+00' }]);

		await db.execute(sql`set time zone '${sql.raw(timezone.rows[0]!.TimeZone)}'`);
	});

	test.skip('test mode string for timestamp with timezone in different timezone', async ({ db }) => {
		// get current timezone from db
		const timezone = await db.execute<{ TimeZone: string }>(sql`show timezone`);

		// set timezone to HST (UTC - 10)
		await db.execute(sql`set time zone 'HST'`);

		const table = pgTable('all_columns', {
			id: serial('id').primaryKey(),
			timestamp: timestamp('timestamp_string', { mode: 'string', withTimezone: true, precision: 6 }).notNull(),
		});

		await db.execute(sql`drop table if exists ${table}`);

		await db.execute(sql`
		create table ${table} (
					id serial primary key,
					timestamp_string timestamp(6) with time zone not null
			)
	`);

		const timestampString = '2022-01-01 00:00:00.123456-1000';

		// 1. Insert date in string format with timezone in it
		await db.insert(table).values([
			{ timestamp: timestampString },
		]);

		// 2. Select date in string format and check that the values are the same
		const result = await db.select().from(table);

		expect(result).toEqual([{ id: 1, timestamp: '2022-01-01 00:00:00.123456-10' }]);

		// 3. Select as raw query and checke that values are the same
		const result2 = await db.execute<{
			id: number;
			timestamp_string: string;
		}>(sql`select * from ${table}`);

		expect(result2.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 00:00:00.123456+00' }]);

		await db.execute(sql`set time zone '${sql.raw(timezone.rows[0]!.TimeZone)}'`);

		await db.execute(sql`drop table if exists ${table}`);
	});

	test('insert via db.execute + select via db.execute', async ({ db }) => {
		await db.execute(
			sql`insert into ${usersTable} (${sql.identifier(usersTable.name.name)}) values (${'John'})`,
		);

		const result = await db.execute<{ id: number; name: string }>(
			sql`select id, name from "users"`,
		);
		expect(result.rows).toEqual([{ id: 1, name: 'John' }]);
	});

	test('insert via db.execute + returning', async ({ db }) => {
		const inserted = await db.execute<{ id: number; name: string }>(
			sql`insert into ${usersTable} (${
				sql.identifier(
					usersTable.name.name,
				)
			}) values (${'John'}) returning ${usersTable.id}, ${usersTable.name}`,
		);
		expect(inserted.rows).toEqual([{ id: 1, name: 'John' }]);
	});

	test('insert via db.execute w/ query builder', async ({ db }) => {
		const inserted = await db.execute<Pick<typeof usersTable.$inferSelect, 'id' | 'name'>>(
			db
				.insert(usersTable)
				.values({ name: 'John' })
				.returning({ id: usersTable.id, name: usersTable.name }),
		);
		expect(inserted.rows).toEqual([{ id: 1, name: 'John' }]);
	});
});

describe('$withAuth tests', (it) => {
	const client = vi.fn();
	const db = drizzle({
		client: client as any as NeonQueryFunction<any, any>,
		relations: defineRelations({ usersTable }),
	});

	it('$count', async () => {
		await db.$withAuth('$count').$count(usersTable).catch(() => null);

		expect(client.mock.lastCall?.[2]).toStrictEqual({ arrayMode: true, fullResults: true, authToken: '$count' });
	});

	it('delete', async () => {
		await db.$withAuth('delete').delete(usersTable).catch(() => null);

		expect(client.mock.lastCall?.[2]).toStrictEqual({ arrayMode: false, fullResults: true, authToken: 'delete' });
	});

	it('select', async () => {
		await db.$withAuth('select').select().from(usersTable).catch(() => null);

		expect(client.mock.lastCall?.[2]).toStrictEqual({ arrayMode: true, fullResults: true, authToken: 'select' });
	});

	it('selectDistinct', async () => {
		await db.$withAuth('selectDistinct').selectDistinct().from(usersTable).catch(() => null);

		expect(client.mock.lastCall?.[2]).toStrictEqual({
			arrayMode: true,
			fullResults: true,
			authToken: 'selectDistinct',
		});
	});

	it('selectDistinctOn', async () => {
		await db.$withAuth('selectDistinctOn').selectDistinctOn([usersTable.name]).from(usersTable).catch(() => null);

		expect(client.mock.lastCall?.[2]).toStrictEqual({
			arrayMode: true,
			fullResults: true,
			authToken: 'selectDistinctOn',
		});
	});

	it('update', async () => {
		await db.$withAuth('update').update(usersTable).set({
			name: 'CHANGED',
		}).where(eq(usersTable.name, 'TARGET')).catch(() => null);

		expect(client.mock.lastCall?.[2]).toStrictEqual({ arrayMode: false, fullResults: true, authToken: 'update' });
	});

	it('insert', async () => {
		await db.$withAuth('insert').insert(usersTable).values({
			name: 'WITHAUTHUSER',
		}).catch(() => null);

		expect(client.mock.lastCall?.[2]).toStrictEqual({ arrayMode: false, fullResults: true, authToken: 'insert' });
	});

	it('with', async () => {
		await db.$withAuth('with').with(db.$with('WITH').as((qb) => qb.select().from(usersTable))).select().from(usersTable)
			.catch(() => null);

		expect(client.mock.lastCall?.[2]).toStrictEqual({ arrayMode: true, fullResults: true, authToken: 'with' });
	});

	it('rqbV2', async () => {
		await db.$withAuth('rqbV2').query.usersTable.findFirst().catch(() => null);

		expect(client.mock.lastCall?.[2]).toStrictEqual({ arrayMode: false, fullResults: true, authToken: 'rqbV2' });
	});

	it('exec', async () => {
		await db.$withAuth('exec').execute(`SELECT 1`).catch(() => null);

		expect(client.mock.lastCall?.[2]).toStrictEqual({ arrayMode: false, fullResults: true, authToken: 'exec' });
	});

	it('prepared', async () => {
		const prep = db.$withAuth('prepared').select().from(usersTable).prepare('withAuthPrepared');

		await prep.execute().catch(() => null);

		expect(client.mock.lastCall?.[2]).toStrictEqual({ arrayMode: true, fullResults: true, authToken: 'prepared' });
	});

	it('refreshMaterializedView', async () => {
		const johns = pgMaterializedView('johns')
			.as((qb) => qb.select().from(usersTable).where(eq(usersTable.name, 'John')));

		await db.$withAuth('refreshMaterializedView').refreshMaterializedView(johns);

		expect(client.mock.lastCall?.[2]).toStrictEqual({
			arrayMode: false,
			fullResults: true,
			authToken: 'refreshMaterializedView',
		});
	});
});

describe('$withAuth callback tests', (it) => {
	const client = vi.fn();
	const db = drizzle({
		client: client as any as NeonQueryFunction<any, any>,
		relations: defineRelations({ usersTable }),
	});
	const auth = (token: string) => () => token;

	it('$count', async () => {
		await db.$withAuth(auth('$count')).$count(usersTable).catch(() => null);

		expect(client.mock.lastCall?.[2]['authToken']()).toStrictEqual('$count');
	});

	it('delete', async () => {
		await db.$withAuth(auth('delete')).delete(usersTable).catch(() => null);

		expect(client.mock.lastCall?.[2]['authToken']()).toStrictEqual('delete');
	});

	it('select', async () => {
		await db.$withAuth(auth('select')).select().from(usersTable).catch(() => null);

		expect(client.mock.lastCall?.[2]['authToken']()).toStrictEqual('select');
	});

	it('selectDistinct', async () => {
		await db.$withAuth(auth('selectDistinct')).selectDistinct().from(usersTable).catch(() => null);

		expect(client.mock.lastCall?.[2]['authToken']()).toStrictEqual('selectDistinct');
	});

	it('selectDistinctOn', async () => {
		await db.$withAuth(auth('selectDistinctOn')).selectDistinctOn([usersTable.name]).from(usersTable).catch(() => null);

		expect(client.mock.lastCall?.[2]['authToken']()).toStrictEqual('selectDistinctOn');
	});

	it('update', async () => {
		await db.$withAuth(auth('update')).update(usersTable).set({
			name: 'CHANGED',
		}).where(eq(usersTable.name, 'TARGET')).catch(() => null);

		expect(client.mock.lastCall?.[2]['authToken']()).toStrictEqual('update');
	});

	it('insert', async () => {
		await db.$withAuth(auth('insert')).insert(usersTable).values({
			name: 'WITHAUTHUSER',
		}).catch(() => null);

		expect(client.mock.lastCall?.[2]['authToken']()).toStrictEqual('insert');
	});

	it('with', async () => {
		await db.$withAuth(auth('with')).with(db.$with('WITH').as((qb) => qb.select().from(usersTable))).select().from(
			usersTable,
		)
			.catch(() => null);

		expect(client.mock.lastCall?.[2]['authToken']()).toStrictEqual('with');
	});

	it('rqbV2', async () => {
		await db.$withAuth(auth('rqbV2')).query.usersTable.findFirst().catch(() => null);

		expect(client.mock.lastCall?.[2]['authToken']()).toStrictEqual('rqbV2');
	});

	it('exec', async () => {
		await db.$withAuth(auth('exec')).execute(`SELECT 1`).catch(() => null);

		expect(client.mock.lastCall?.[2]['authToken']()).toStrictEqual('exec');
	});

	it('prepared', async () => {
		const prep = db.$withAuth(auth('prepared')).select().from(usersTable).prepare('withAuthPrepared');

		await prep.execute().catch(() => null);

		expect(client.mock.lastCall?.[2]['authToken']()).toStrictEqual('prepared');
	});

	it('refreshMaterializedView', async () => {
		const johns = pgMaterializedView('johns')
			.as((qb) => qb.select().from(usersTable).where(eq(usersTable.name, 'John')));

		await db.$withAuth(auth('refreshMaterializedView')).refreshMaterializedView(johns);

		expect(client.mock.lastCall?.[2]['authToken']()).toStrictEqual('refreshMaterializedView');
	});
});

describe('$withAuth async callback tests', (it) => {
	const client = vi.fn();
	const db = drizzle({
		client: client as any as NeonQueryFunction<any, any>,
		relations: defineRelations({ usersTable }),
	});
	const auth = (token: string) => async () => token;

	it('$count', async () => {
		await db.$withAuth(auth('$count')).$count(usersTable).catch(() => null);

		expect(client.mock.lastCall?.[2]['authToken']()).toBeInstanceOf(Promise);
		expect(await client.mock.lastCall?.[2]['authToken']()).toStrictEqual('$count');
	});

	it('delete', async () => {
		await db.$withAuth(auth('delete')).delete(usersTable).catch(() => null);

		expect(client.mock.lastCall?.[2]['authToken']()).toBeInstanceOf(Promise);
		expect(await client.mock.lastCall?.[2]['authToken']()).toStrictEqual('delete');
	});

	it('select', async () => {
		await db.$withAuth(auth('select')).select().from(usersTable).catch(() => null);

		expect(client.mock.lastCall?.[2]['authToken']()).toBeInstanceOf(Promise);
		expect(await client.mock.lastCall?.[2]['authToken']()).toStrictEqual('select');
	});

	it('selectDistinct', async () => {
		await db.$withAuth(auth('selectDistinct')).selectDistinct().from(usersTable).catch(() => null);

		expect(client.mock.lastCall?.[2]['authToken']()).toBeInstanceOf(Promise);
		expect(await client.mock.lastCall?.[2]['authToken']()).toStrictEqual('selectDistinct');
	});

	it('selectDistinctOn', async () => {
		await db.$withAuth(auth('selectDistinctOn')).selectDistinctOn([usersTable.name]).from(usersTable).catch(() => null);

		expect(client.mock.lastCall?.[2]['authToken']()).toBeInstanceOf(Promise);
		expect(await client.mock.lastCall?.[2]['authToken']()).toStrictEqual('selectDistinctOn');
	});

	it('update', async () => {
		await db.$withAuth(auth('update')).update(usersTable).set({
			name: 'CHANGED',
		}).where(eq(usersTable.name, 'TARGET')).catch(() => null);

		expect(client.mock.lastCall?.[2]['authToken']()).toBeInstanceOf(Promise);
		expect(await client.mock.lastCall?.[2]['authToken']()).toStrictEqual('update');
	});

	it('insert', async () => {
		await db.$withAuth(auth('insert')).insert(usersTable).values({
			name: 'WITHAUTHUSER',
		}).catch(() => null);

		expect(client.mock.lastCall?.[2]['authToken']()).toBeInstanceOf(Promise);
		expect(await client.mock.lastCall?.[2]['authToken']()).toStrictEqual('insert');
	});

	it('with', async () => {
		await db.$withAuth(auth('with')).with(db.$with('WITH').as((qb) => qb.select().from(usersTable))).select().from(
			usersTable,
		)
			.catch(() => null);

		expect(client.mock.lastCall?.[2]['authToken']()).toBeInstanceOf(Promise);
		expect(await client.mock.lastCall?.[2]['authToken']()).toStrictEqual('with');
	});

	it('rqbV2', async () => {
		await db.$withAuth(auth('rqbV2')).query.usersTable.findFirst().catch(() => null);

		expect(client.mock.lastCall?.[2]['authToken']()).toBeInstanceOf(Promise);
		expect(await client.mock.lastCall?.[2]['authToken']()).toStrictEqual('rqbV2');
	});

	it('exec', async () => {
		await db.$withAuth(auth('exec')).execute(`SELECT 1`).catch(() => null);

		expect(client.mock.lastCall?.[2]['authToken']()).toBeInstanceOf(Promise);
		expect(await client.mock.lastCall?.[2]['authToken']()).toStrictEqual('exec');
	});

	it('prepared', async () => {
		const prep = db.$withAuth(auth('prepared')).select().from(usersTable).prepare('withAuthPrepared');

		await prep.execute().catch(() => null);

		expect(client.mock.lastCall?.[2]['authToken']()).toBeInstanceOf(Promise);
		expect(await client.mock.lastCall?.[2]['authToken']()).toStrictEqual('prepared');
	});

	it('refreshMaterializedView', async () => {
		const johns = pgMaterializedView('johns')
			.as((qb) => qb.select().from(usersTable).where(eq(usersTable.name, 'John')));

		await db.$withAuth(auth('refreshMaterializedView')).refreshMaterializedView(johns);

		expect(client.mock.lastCall?.[2]['authToken']()).toBeInstanceOf(Promise);
		expect(await client.mock.lastCall?.[2]['authToken']()).toStrictEqual('refreshMaterializedView');
	});
});
