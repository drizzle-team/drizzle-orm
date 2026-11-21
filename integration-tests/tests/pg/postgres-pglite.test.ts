// drizzle-orm/postgres/pglite: the Drizzle Postgres wire driver over an in-process PGlite instance
import { createPool, type Pool } from '@drizzle-team/postgres/pglite';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { postgis } from '@electric-sql/pglite-postgis';
import { defineRelations, sql } from 'drizzle-orm';
import { boolean, getTableConfig, integer, jsonb, pgTable, serial, text, time, timestamp } from 'drizzle-orm/pg-core';
import type { PostgresDatabase } from 'drizzle-orm/postgres';
import { migrate } from 'drizzle-orm/postgres/migrator';
import { drizzle } from 'drizzle-orm/postgres/pglite';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { describe, expect, expectTypeOf } from 'vitest';
import { randomString } from '~/utils';
import {
	allTypesData,
	allTypesEnum,
	allTypesRelations,
	allTypesTable,
	assertAllTypesBounds,
	assertAllTypesEmptyArrays,
	assertAllTypesNullArrayElements,
	assertAllTypesTemporalBounds,
	assertAllTypesUnions,
	boundsRelations,
	boundsSchema,
} from './all-types';
import { tests } from './common';
import { preparedNameTests } from './common-prepared-names';
import { _push, postgresPgliteTest as test } from './instrumentation';
import { type BulkDrizzle, bulkTests } from './postgres-bulk';
import { usersMigratorTable, usersTable } from './schema';
import { assertMalformedSnapshotRejected, assertSnapshotIdNotInjectable } from './snapshot';

tests(test, [
	// The pool decodes values through the shape, so raw rows without one do not match the codec normalization
	'all types ~codecs~',
]);
preparedNameTests(test);
bulkTests(test, { name: 'pglite', drizzle: drizzle as BulkDrizzle });

// https://github.com/drizzle-team/drizzle-orm/issues/661
test('raw db.execute type matches returned data', async ({ db: fixtureDb }) => {
	const db = fixtureDb as unknown as PostgresDatabase;
	const table = sql.identifier('raw_execute_types');

	await db.execute<never>(sql`drop table if exists ${table}`);

	// DDL
	const created = await db.execute<never>(sql`create table ${table} ("id" integer primary key, "name" text not null)`);
	expectTypeOf(created).toEqualTypeOf<
		{ rows: never[]; columns: string[]; command: string | null; rowCount: number | null }
	>();
	expect(created).toEqual({ rows: [], columns: [], command: 'CREATE', rowCount: null });

	// `insert` without returning
	const inserted = await db.execute<never>(sql`insert into ${table} values (1, 'John')`);
	expectTypeOf(inserted).toEqualTypeOf<
		{ rows: never[]; columns: string[]; command: string | null; rowCount: number | null }
	>();
	expect(inserted).toEqual({ rows: [], columns: [], command: 'INSERT', rowCount: 1 });

	// Simple select
	const selected = await db.execute<{ id: number; name: string }>(sql`select "id", "name" from ${table} order by "id"`);
	expectTypeOf(selected).toEqualTypeOf<
		{ rows: { id: number; name: string }[]; columns: string[]; command: string | null; rowCount: number | null }
	>();
	expect(selected).toEqual({
		rows: [{ id: 1, name: 'John' }],
		columns: ['id', 'name'],
		command: 'SELECT',
		rowCount: 1,
	});

	// Any response
	const any = await db.execute(sql`select "id", "name" from ${table} order by "id"`);
	expectTypeOf(any).toEqualTypeOf<
		{ rows: Record<string, unknown>[]; columns: string[]; command: string | null; rowCount: number | null }
	>();
	expect(any).toEqual({ rows: [{ id: 1, name: 'John' }], columns: ['id', 'name'], command: 'SELECT', rowCount: 1 });

	await db.execute<never>(sql`drop table ${table}`);
});

describe('migrator', () => {
	test('migrator : default migration strategy', async ({ db }) => {
		await db.execute(sql`drop table if exists all_columns`);
		await db.execute(sql`drop table if exists users12`);
		await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

		await migrate(db as any as PostgresDatabase<any>, { migrationsFolder: './drizzle2/pg' });

		await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });

		const result = await db.select().from(usersMigratorTable);

		expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

		await db.execute(sql`drop table all_columns`);
		await db.execute(sql`drop table users12`);
		await db.execute(sql`drop table "drizzle"."__drizzle_migrations"`);
	});

	test('migrator : migrate with custom schema', async ({ db }) => {
		const customSchema = randomString();
		await db.execute(sql`drop table if exists all_columns`);
		await db.execute(sql`drop table if exists users12`);
		await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

		await migrate(db as any as PostgresDatabase<any>, {
			migrationsFolder: './drizzle2/pg',
			migrationsSchema: customSchema,
		});

		// test if the custom migrations table was created
		const { rowCount } = await db.execute(sql`select * from ${sql.identifier(customSchema)}."__drizzle_migrations";`);
		expect(rowCount && rowCount > 0).toBeTruthy();

		// test if the migrated table are working as expected
		await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
		const result = await db.select().from(usersMigratorTable);
		expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

		await db.execute(sql`drop table all_columns`);
		await db.execute(sql`drop table users12`);
		await db.execute(sql`drop table ${sql.identifier(customSchema)}."__drizzle_migrations"`);
	});

	test('migrator : migrate with custom table', async ({ db }) => {
		const customTable = randomString();
		await db.execute(sql`drop table if exists all_columns`);
		await db.execute(sql`drop table if exists users12`);
		await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

		await migrate(db as any as PostgresDatabase<any>, {
			migrationsFolder: './drizzle2/pg',
			migrationsTable: customTable,
		});

		// test if the custom migrations table was created
		const { rowCount } = await db.execute(sql`select * from "drizzle".${sql.identifier(customTable)};`);
		expect(rowCount && rowCount > 0).toBeTruthy();

		// test if the migrated table are working as expected
		await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
		const result = await db.select().from(usersMigratorTable);
		expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

		await db.execute(sql`drop table all_columns`);
		await db.execute(sql`drop table users12`);
		await db.execute(sql`drop table "drizzle".${sql.identifier(customTable)}`);
	});

	test('migrator : migrate with custom table and custom schema', async ({ db }) => {
		const customTable = randomString();
		const customSchema = randomString();
		await db.execute(sql`drop table if exists all_columns`);
		await db.execute(sql`drop table if exists users12`);
		await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

		await migrate(db as any as PostgresDatabase<any>, {
			migrationsFolder: './drizzle2/pg',
			migrationsTable: customTable,
			migrationsSchema: customSchema,
		});

		// test if the custom migrations table was created
		const { rowCount } = await db.execute(
			sql`select * from ${sql.identifier(customSchema)}.${sql.identifier(customTable)};`,
		);
		expect(rowCount && rowCount > 0).toBeTruthy();

		// test if the migrated table are working as expected
		await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
		const result = await db.select().from(usersMigratorTable);
		expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

		await db.execute(sql`drop table all_columns`);
		await db.execute(sql`drop table users12`);
		await db.execute(sql`drop table ${sql.identifier(customSchema)}.${sql.identifier(customTable)}`);
	});

	test('migrator : --init', async ({ db }) => {
		const migrationsSchema = 'drzl_migrations_init';
		const migrationsTable = 'drzl_init';

		await db.execute(sql`drop schema if exists ${sql.identifier(migrationsSchema)} cascade;`);
		await db.execute(sql`drop schema if exists public cascade`);
		await db.execute(sql`create schema public`);

		const migratorRes = await migrate(db as any as PostgresDatabase<any>, {
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
		}) as ${sql.identifier('tableExists')};`);

		expect(migratorRes).toStrictEqual(undefined);
		expect(meta.length).toStrictEqual(1);
		expect(res.rows[0]?.tableExists).toStrictEqual(false);
	});

	test('migrator : --init - local migrations error', async ({ db }) => {
		const migrationsSchema = 'drzl_migrations_init';
		const migrationsTable = 'drzl_init';

		await db.execute(sql`drop schema if exists ${sql.identifier(migrationsSchema)} cascade;`);
		await db.execute(sql`drop schema if exists public cascade`);
		await db.execute(sql`create schema public`);

		const migratorRes = await migrate(db as any as PostgresDatabase<any>, {
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
		}) as ${sql.identifier('tableExists')};`);

		expect(migratorRes).toStrictEqual({ exitCode: 'localMigrations' });
		expect(meta.length).toStrictEqual(0);
		expect(res.rows[0]?.tableExists).toStrictEqual(false);
	});

	test('migrator : --init - db migrations error', async ({ db }) => {
		const migrationsSchema = 'drzl_migrations_init';
		const migrationsTable = 'drzl_init';

		await db.execute(sql`drop schema if exists ${sql.identifier(migrationsSchema)} cascade;`);
		await db.execute(sql`drop schema if exists public cascade`);
		await db.execute(sql`create schema public`);

		await migrate(db as any as PostgresDatabase<any>, {
			migrationsFolder: './drizzle2/pg-init',
			migrationsSchema,
			migrationsTable,
		});

		const migratorRes = await migrate(db as any as PostgresDatabase<any>, {
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
		}) as ${sql.identifier('tableExists')};`);

		expect(migratorRes).toStrictEqual({ exitCode: 'databaseMigrations' });
		expect(meta.length).toStrictEqual(1);
		expect(res.rows[0]?.tableExists).toStrictEqual(true);
	});

	test('migrator: local migration is unapplied. Migrations timestamp is less than last db migration', async ({ db }) => {
		const users = pgTable('migration_users', {
			id: serial('id').primaryKey(),
			name: text().notNull(),
			email: text().notNull(),
			age: integer(),
		});

		const users2 = pgTable('migration_users2', {
			id: serial('id').primaryKey(),
			name: text().notNull(),
			email: text().notNull(),
			age: integer(),
		});

		await db.execute(sql`drop schema if exists "drizzle" cascade;`);
		await db.execute(sql`drop table if exists ${users}`);
		await db.execute(sql`drop table if exists ${users2}`);

		// create migration directory
		const migrationDir = './migrations/postgres-pglite';
		if (existsSync(migrationDir)) rmSync(migrationDir, { recursive: true });
		mkdirSync(migrationDir, { recursive: true });

		// first branch
		mkdirSync(`${migrationDir}/20240101010101_initial`, { recursive: true });
		writeFileSync(
			`${migrationDir}/20240101010101_initial/migration.sql`,
			`CREATE TABLE "migration_users" (\n"id" serial PRIMARY KEY NOT NULL,\n"name" text NOT NULL,\n"email" text NOT NULL\n);`,
		);
		mkdirSync(`${migrationDir}/20240303030303_third`, { recursive: true });
		writeFileSync(
			`${migrationDir}/20240303030303_third/migration.sql`,
			`ALTER TABLE "migration_users" ADD COLUMN "age" integer;`,
		);

		await migrate(db as any as PostgresDatabase<any>, { migrationsFolder: migrationDir });
		const res1 = await db.insert(users).values({ name: 'John', email: '', age: 30 }).returning();

		// second migration was not applied yet
		await expect(db.insert(users2).values({ name: 'John', email: '', age: 30 })).rejects.toThrowError();

		// insert migration with earlier timestamp
		mkdirSync(`${migrationDir}/20240202020202_second`, { recursive: true });
		writeFileSync(
			`${migrationDir}/20240202020202_second/migration.sql`,
			`CREATE TABLE "migration_users2" (\n"id" serial PRIMARY KEY NOT NULL,\n"name" text NOT NULL,\n"email" text NOT NULL\n,"age" integer\n);`,
		);
		await migrate(db as any as PostgresDatabase<any>, { migrationsFolder: migrationDir });

		const res2 = await db.insert(users2).values({ name: 'John', email: '', age: 30 }).returning();

		const expected = [{ id: 1, name: 'John', email: '', age: 30 }];
		expect(res1).toStrictEqual(expected);
		expect(res2).toStrictEqual(expected);

		rmSync(migrationDir, { recursive: true });
	});
});

/** A pool that decodes temporal values as text, on a PGlite instance of it's own */
const stringTemporalClient = () => createPool(new PGlite(), { temporal: 'string' });

describe('driver-specific', () => {
	test('all date and time columns without timezone first case mode string', async ({ onTestFinished }) => {
		const client = stringTemporalClient();
		onTestFinished(() => client.end());
		const db = drizzle({ client });

		const table = pgTable('all_columns', {
			id: serial('id').primaryKey(),
			timestamp: timestamp('timestamp_string', { mode: 'string', precision: 6 }).notNull(),
		});

		await db.execute(sql`drop table if exists ${table}`);

		await db.execute(sql`
		create table ${table} (
					id serial primary key,
					timestamp_string timestamp(6) not null
			)
	`);

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
		}>(sql`select "id", "timestamp_string"::text from ${table}`);

		expect(result2.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456' }]);

		await db.execute(sql`drop table if exists ${table}`);
	});

	test('all date and time columns without timezone second case mode string', async ({ onTestFinished }) => {
		const client = stringTemporalClient();
		onTestFinished(() => client.end());
		const db = drizzle({ client });

		const table = pgTable('all_columns', {
			id: serial('id').primaryKey(),
			timestamp: timestamp('timestamp_string', { mode: 'string', precision: 6 }).notNull(),
		});

		await db.execute(sql`drop table if exists ${table}`);

		await db.execute(sql`
		create table ${table} (
					id serial primary key,
					timestamp_string timestamp(6) not null
			)
	`);

		// 1. Insert date in string format with timezone in it
		await db.insert(table).values([
			{ timestamp: '2022-01-01T02:00:00.123456-02' },
		]);

		// 2, Select as raw query and check that values are the same
		const result = await db.execute<{
			id: number;
			timestamp_string: string;
		}>(sql`select "id", "timestamp_string"::text from ${table}`);

		expect(result.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456' }]);

		await db.execute(sql`drop table if exists ${table}`);
	});

	test('all date and time columns without timezone third case mode date', async ({ onTestFinished }) => {
		const client = stringTemporalClient();
		onTestFinished(() => client.end());
		const db = drizzle({ client });

		const table = pgTable('all_columns', {
			id: serial('id').primaryKey(),
			timestamp: timestamp('timestamp_string', { mode: 'date', precision: 3 }).notNull(),
		});

		await db.execute(sql`drop table if exists ${table}`);

		await db.execute(sql`
		create table ${table} (
					id serial primary key,
					timestamp_string timestamp(3) not null
			)
	`);

		const insertedDate = new Date('2022-01-01 20:00:00.123+04');

		// 1. Insert date as new date
		await db.insert(table).values([
			{ timestamp: insertedDate },
		]);

		// 2, Select as raw query as string
		const result = await db.execute<{
			id: number;
			timestamp_string: string;
		}>(sql`select "id", "timestamp_string"::text from ${table}`);

		// 3. Compare both dates using orm mapping - Need to add 'Z' to tell JS that it is UTC
		expect(new Date(result.rows[0]!.timestamp_string + 'Z').getTime()).toBe(insertedDate.getTime());

		await db.execute(sql`drop table if exists ${table}`);
	});

	test('test mode string for timestamp with timezone', async ({ onTestFinished }) => {
		const client = stringTemporalClient();
		onTestFinished(() => client.end());
		const db = drizzle({ client });

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
		}>(sql`select "id", "timestamp_string"::text from ${table}`);

		// 3.1 Notice that postgres will return the date in UTC, but it is exactlt the same
		expect(result2.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456+00' }]);

		await db.execute(sql`drop table if exists ${table}`);
	});

	test('test mode date for timestamp with timezone', async ({ onTestFinished }) => {
		const client = stringTemporalClient();
		onTestFinished(() => client.end());
		const db = drizzle({ client });

		const table = pgTable('all_columns', {
			id: serial('id').primaryKey(),
			timestamp: timestamp('timestamp_string', { mode: 'date', withTimezone: true, precision: 3 }).notNull(),
		});

		await db.execute(sql`drop table if exists ${table}`);

		await db.execute(sql`
		create table ${table} (
					id serial primary key,
					timestamp_string timestamp(3) with time zone not null
			)
	`);

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
		}>(sql`select "id", "timestamp_string"::text from ${table}`);

		// 3.1 Notice that postgres will return the date in UTC, but it is exactlt the same
		expect(result2.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.456+00' }]);

		await db.execute(sql`drop table if exists ${table}`);
	});

	test('test mode string for timestamp with timezone in UTC timezone', async ({ onTestFinished }) => {
		const client = stringTemporalClient();
		onTestFinished(() => client.end());
		const db = drizzle({ client });

		// get current timezone from db
		const timezone = await db.execute<{ TimeZone: string }>(sql`show timezone`);

		// set timezone to UTC
		await db.execute(sql`set time zone 'UTC'`);

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
		}>(sql`select "id", "timestamp_string"::text from ${table}`);

		// 3.1 Notice that postgres will return the date in UTC, but it is exactlt the same
		expect(result2.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456+00' }]);

		await db.execute(sql`set time zone '${sql.raw(timezone.rows[0]!.TimeZone)}'`);

		await db.execute(sql`drop table if exists ${table}`);
	});

	test('test mode string for timestamp with timezone in different timezone', async ({ onTestFinished }) => {
		const client = stringTemporalClient();
		onTestFinished(() => client.end());
		const db = drizzle({ client });

		// get current timezone from db
		const timezone = await db.execute<{ TimeZone: string }>(sql`show timezone`);

		// set timezone to HST (UTC - 10)
		await db.execute(sql`set time zone '-10'`);

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
		}>(sql`select "id", "timestamp_string"::text from ${table}`);

		expect(result2.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 00:00:00.123456-10' }]);

		await db.execute(sql`set time zone '${sql.raw(timezone.rows[0]!.TimeZone)}'`);

		await db.execute(sql`drop table if exists ${table}`);
	});

	test('insert via db.execute + select via db.execute', async ({ db, push }) => {
		const usersTable = pgTable('users_execute_raw_postgres_1', {
			id: serial('id' as string).primaryKey(),
			name: text('name').notNull(),
			verified: boolean('verified').notNull().default(false),
			jsonb: jsonb('jsonb').$type<string[]>(),
			createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		});

		await push({ usersTable });

		await db.execute(
			sql`insert into ${usersTable} (${sql.identifier(usersTable.name.name)}) values (${'John'})`,
		);

		const result = await db.execute<{ id: number; name: string }>(
			sql`select id, name from ${usersTable}`,
		);
		expect(result.rows).toEqual([{ id: 1, name: 'John' }]);
	});

	test('insert via db.execute + returning', async ({ db, push }) => {
		const usersTable = pgTable('users_execute_raw_postgres_2', {
			id: serial('id' as string).primaryKey(),
			name: text('name').notNull(),
			verified: boolean('verified').notNull().default(false),
			jsonb: jsonb('jsonb').$type<string[]>(),
			createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		});

		await push({ usersTable });

		const inserted = await db.execute<{ id: number; name: string }>(
			sql`insert into ${usersTable} (${
				sql.identifier(
					usersTable.name.name,
				)
			}) values (${'John'}) returning ${usersTable.id}, ${usersTable.name}`,
		);
		expect(inserted.rows).toEqual([{ id: 1, name: 'John' }]);
	});

	test('insert via db.execute w/ query builder', async ({ db, push }) => {
		const usersTable = pgTable('users_execute_raw_postgres_3', {
			id: serial('id' as string).primaryKey(),
			name: text('name').notNull(),
			verified: boolean('verified').notNull().default(false),
			jsonb: jsonb('jsonb').$type<string[]>(),
			createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		});

		await push({ usersTable });

		const inserted = await db.execute<Pick<typeof usersTable.$inferSelect, 'id' | 'name'>>(
			db
				.insert(usersTable)
				.values({ name: 'John' })
				.returning({ id: usersTable.id, name: usersTable.name }),
		);
		expect(inserted.rows).toEqual([{ id: 1, name: 'John' }]);
	});

	// Can't test shapes via generic codecs test
	test('all types ~shapes~', async ({ createDB, push }) => {
		const db = createDB({ allTypesTable, ...boundsSchema }, (r) => ({
			...allTypesRelations(r),
			...boundsRelations(r),
		}));
		await push({ en: allTypesEnum, allTypesTable });
		await db.insert(allTypesTable).values(allTypesData);

		const [flat] = await db.select().from(allTypesTable);
		expect(flat).toStrictEqual(allTypesData);

		const nested = await db.query.allTypesTable.findFirst({ with: { self: true } });
		expect(nested).toStrictEqual({ ...allTypesData, self: [allTypesData] });

		await assertAllTypesUnions(db);
		await assertAllTypesBounds(db, { rqb: true });
		await assertAllTypesNullArrayElements(db, { rqb: true });
		await assertAllTypesTemporalBounds(db, { rqb: true });

		await assertAllTypesEmptyArrays(db, allTypesTable, { rqb: true });
	});

	test('timetz keeps offset', async ({ createDB, push }) => {
		const times = pgTable('times', {
			id: integer('id').primaryKey(),
			time: time('time', { withTimezone: true }).notNull(),
			arr: time('arr', { withTimezone: true }).array().notNull(),
			mtx: time('mtx', { withTimezone: true }).array('[][]').notNull(),
		});

		await push({ times });
		const shaped = createDB({ times });

		const value = {
			id: 1,
			time: '12:00:00.5-02',
			arr: ['12:00:00.5-02', '23:59:59+05:30'],
			mtx: [['12:00:00.5-02'], ['23:59:59+05:30']],
		};
		await shaped.insert(times).values(value);

		expect(await shaped.select().from(times)).toStrictEqual([value]);
	});
});

describe('transaction snapshot', () => {
	test('rejects a malformed id', async ({ db }) => {
		await assertMalformedSnapshotRejected(db, expect);
	});

	test('does not let the id inject SQL', async ({ db }) => {
		await assertSnapshotIdNotInjectable(db, expect, 'drizzle-postgres');
	});
});

describe('drizzle()', () => {
	const users = pgTable('users', { id: integer('id').primaryKey(), name: text('name').notNull() });

	/** Creates `users`, writes a row and reads it back: the database works end to end */
	const roundTrip = async (db: ReturnType<typeof drizzle>) => {
		await db.execute(sql`create table ${users} (id integer primary key, name text not null)`);
		await db.insert(users).values({ id: 1, name: 'John' });
		expect(await db.select().from(users)).toStrictEqual([{ id: 1, name: 'John' }]);
	};

	test("with no arguments, on an in-memory instance of it's own", async () => {
		const db = drizzle();
		expectTypeOf(db.$client).toEqualTypeOf<Pool>();
		await roundTrip(db);
		await db.$client.end();
	});

	test('with a data directory, and with PGlite options', async () => {
		const fromString = drizzle('memory://');
		await roundTrip(fromString);
		await fromString.$client.end();

		const fromOptions = drizzle({ connection: { dataDir: 'memory://', debug: 0 } });
		await roundTrip(fromOptions);
		await fromOptions.$client.end();
	});

	test("on an instance of the caller's, which stays open", async () => {
		const pg = await PGlite.create();
		const db = drizzle({ connection: pg });
		await roundTrip(db);
		await db.$client.end();

		expect((await pg.query<{ name: string }>('select name from users')).rows).toStrictEqual([{ name: 'John' }]);
		await pg.close();
	});

	test("on a pool of the caller's, which it keeps as $client", async () => {
		const pg = await PGlite.create();
		const pool = createPool(pg);
		const db = drizzle({ client: pool });
		expect(db.$client).toBe(pool);
		await roundTrip(db);

		// batch, with metrics: the wire driver's features run on PGlite too
		const measured = await db.batch([db.select().from(users), db.$count(users)], { metrics: true });
		expect([...measured]).toStrictEqual([[{ id: 1, name: 'John' }], 1]);
		expect(measured.metrics).toMatchObject({ statements: 4, roundTrips: 1 });

		await pool.end();
		await pg.close();
	});
});

describe('pglite extensions', () => {
	const extensionTypes = pgTable('extension_types', (t) => ({
		id: t.integer('id').primaryKey(),
		geo: t.geometry('geo'),
		arrgeo: t.geometry('arrgeo').array(),
		geoxy: t.geometry('geoxy', { mode: 'xy' }),
		arrgeoxy: t.geometry('arrgeoxy', { mode: 'xy' }).array(),
		bit: t.bit('bit', { dimensions: 3 }),
		arrbit: t.bit('arrbit', { dimensions: 3 }).array(),
		halfvec: t.halfvec('halfvec', { dimensions: 3 }),
		arrhalfvec: t.halfvec('arrhalfvec', { dimensions: 3 }).array(),
		vector: t.vector('vector', { dimensions: 3 }),
		arrvector: t.vector('arrvector', { dimensions: 3 }).array(),
		sparsevec: t.sparsevec('sparsevec', { dimensions: 5 }),
		arrsparsevec: t.sparsevec('arrsparsevec', { dimensions: 5 }).array(),
	}));
	const extensionRelations = defineRelations({ extensionTypes }, (r) => ({
		extensionTypes: { self: r.many.extensionTypes({ from: r.extensionTypes.id, to: r.extensionTypes.id }) },
	}));

	// Can't test shapes via generic codecs test
	test('extension types ~shapes~', async () => {
		const pg = new PGlite({ extensions: { postgis, vector: vector as any } });
		const db = drizzle({ connection: pg, relations: extensionRelations });
		await db.execute(sql`create extension if not exists postgis`);
		await db.execute(sql`create extension if not exists vector`);
		await _push(async (s, params) => (await db.$client.query(s, params ?? [])).rows as any[], { extensionTypes });

		await db.insert(extensionTypes).values({
			id: 1,
			geo: [15.23, 51.13],
			arrgeo: [[15.23, 51.13], [1.5, 2.5]],
			geoxy: { x: 15.23, y: 51.13 },
			arrgeoxy: [{ x: 15.23, y: 51.13 }, { x: 1.5, y: 2.5 }],
			bit: '101',
			arrbit: ['101', '010'],
			halfvec: [0.2, 3.5, 8.4],
			arrhalfvec: [[0.2, 3.5, 8.4], [1, 2, 3]],
			vector: [1.9345, 2.8238, 12.3465],
			arrvector: [[1.9345, 2.8238, 12.3465], [4.5, 5.5, 6.5]],
			sparsevec: '{1:1,3:2,5:3}/5',
			arrsparsevec: ['{1:1,3:2,5:3}/5', '{2:9}/5'],
		});

		const expected = {
			id: 1,
			geo: [15.23, 51.13],
			arrgeo: [[15.23, 51.13], [1.5, 2.5]],
			geoxy: { x: 15.23, y: 51.13 },
			arrgeoxy: [{ x: 15.23, y: 51.13 }, { x: 1.5, y: 2.5 }],
			bit: '101',
			arrbit: ['101', '010'],
			halfvec: [0.19995117, 3.5, 8.3984375],
			arrhalfvec: [[0.19995117, 3.5, 8.3984375], [1, 2, 3]],
			vector: [1.9345, 2.8238, 12.3465],
			arrvector: [[1.9345, 2.8238, 12.3465], [4.5, 5.5, 6.5]],
			sparsevec: '{1:1,3:2,5:3}/5',
			arrsparsevec: ['{1:1,3:2,5:3}/5', '{2:9}/5'],
		};
		expect(await db.select().from(extensionTypes)).toStrictEqual([expected]);
		expect(await db.query.extensionTypes.findFirst({ with: { self: true } })).toStrictEqual({
			...expected,
			self: [expected],
		});

		await db.$client.end();
		await pg.close();
	});
});
