import { defineRelations, sql } from 'drizzle-orm';
import { boolean, getTableConfig, integer, jsonb, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { minipgCodecs } from 'drizzle-orm/postgres/codecs';
import { drizzle as drizzleHttp, type PostgresHttpDatabase } from 'drizzle-orm/postgres/http';
import { migrate } from 'drizzle-orm/postgres/http/migrator';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { describe, expect } from 'vitest';
import { randomString } from '~/utils';
import { allTypesData, allTypesEnum, allTypesRelations, allTypesTable } from './all-types';
import { assertAllTypesUnions } from './all-types-unions';
import { tests } from './common';
import { postgresHttpTest as test } from './instrumentation';
import { usersMigratorTable } from './schema';

const skips = [
	'RQB v2 transaction find first - no rows',
	'RQB v2 transaction find first - multiple rows',
	'RQB v2 transaction find first - with relation',
	'RQB v2 transaction find first - placeholders',
	'RQB v2 transaction find many - no rows',
	'RQB v2 transaction find many - multiple rows',
	'RQB v2 transaction find many - with relation',
	'RQB v2 transaction find many - placeholders',
	'transaction with options (set isolationLevel)',
	'transaction with options (accessMode read only)',
	'transaction with options (deferrable)',
	'transaction with an empty options object',
	'raw jsons',
	'all types ~codecs~',
];

tests(test, skips);

describe('postgres http', () => {
	test('interactive transactions are rejected', async ({ db }) => {
		await expect(db.transaction(async () => {})).rejects.toThrow(/No interactive transactions/);
	});

	test('backend errors keep their SQLSTATE across the HTTP hop', async ({ db }) => {
		const err = await db.execute(sql`select * from definitely_not_a_table`).catch((e) => e);

		expect(err.name).toBe('DrizzleQueryError');
		expect(err.cause?.message).toMatch(/does not exist/i);
		expect((err.cause as any)?.code).toBe('42P01');
	});
});

describe('migrator', () => {
	test('migrator : default migration strategy', async ({ db }) => {
		await db.execute(sql`drop table if exists all_columns`);
		await db.execute(sql`drop table if exists users12`);
		await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

		await migrate(db as any as PostgresHttpDatabase<any>, { migrationsFolder: './drizzle2/pg' });

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

		await migrate(db as any as PostgresHttpDatabase<any>, {
			migrationsFolder: './drizzle2/pg',
			migrationsSchema: customSchema,
		});

		const { rowCount } = await db.execute(sql`select * from ${sql.identifier(customSchema)}."__drizzle_migrations";`);
		expect(rowCount && rowCount > 0).toBeTruthy();

		await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
		const result = await db.select().from(usersMigratorTable);
		expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

		await db.execute(sql`drop table all_columns`);
		await db.execute(sql`drop table users12`);
		await db.execute(sql`drop schema ${sql.identifier(customSchema)} cascade`);
	});

	test('migrator : migrate with custom table', async ({ db }) => {
		const customTable = randomString();
		await db.execute(sql`drop table if exists all_columns`);
		await db.execute(sql`drop table if exists users12`);
		await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

		await migrate(db as any as PostgresHttpDatabase<any>, {
			migrationsFolder: './drizzle2/pg',
			migrationsTable: customTable,
		});

		const { rowCount } = await db.execute(sql`select * from "drizzle".${sql.identifier(customTable)};`);
		expect(rowCount && rowCount > 0).toBeTruthy();

		await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
		const result = await db.select().from(usersMigratorTable);
		expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

		await db.execute(sql`drop table all_columns`);
		await db.execute(sql`drop table users12`);
		await db.execute(sql`drop table "drizzle".${sql.identifier(customTable)}`);
	});

	test('migrator : --init', async ({ db }) => {
		const migrationsSchema = 'drzl_migrations_init';
		const migrationsTable = 'drzl_init';

		await db.execute(sql`drop schema if exists ${sql.identifier(migrationsSchema)} cascade;`);
		await db.execute(sql`drop schema if exists public cascade`);
		await db.execute(sql`create schema public`);

		const migratorRes = await migrate(db as any as PostgresHttpDatabase<any>, {
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

		const migrationDir = './migrations/postgres-http';
		if (existsSync(migrationDir)) rmSync(migrationDir, { recursive: true });
		mkdirSync(migrationDir, { recursive: true });

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

		await migrate(db as any as PostgresHttpDatabase<any>, { migrationsFolder: migrationDir });
		const res1 = await db.insert(users).values({ name: 'John', email: '', age: 30 }).returning();

		await expect(db.insert(users2).values({ name: 'John', email: '', age: 30 })).rejects.toThrowError();

		mkdirSync(`${migrationDir}/20240202020202_second`, { recursive: true });
		writeFileSync(
			`${migrationDir}/20240202020202_second/migration.sql`,
			`CREATE TABLE "migration_users2" (\n"id" serial PRIMARY KEY NOT NULL,\n"name" text NOT NULL,\n"email" text NOT NULL\n,"age" integer\n);`,
		);
		await migrate(db as any as PostgresHttpDatabase<any>, { migrationsFolder: migrationDir });

		const res2 = await db.insert(users2).values({ name: 'John', email: '', age: 30 }).returning();

		const expected = [{ id: 1, name: 'John', email: '', age: 30 }];
		expect(res1).toStrictEqual(expected);
		expect(res2).toStrictEqual(expected);

		rmSync(migrationDir, { recursive: true });
	});

	test('migrator : a failing migration leaves nothing applied', async ({ db }) => {
		await db.execute(sql`drop schema if exists "drizzle" cascade;`);
		await db.execute(sql`drop table if exists http_mig_ok`);

		const migrationDir = './migrations/postgres-http-fail';
		if (existsSync(migrationDir)) rmSync(migrationDir, { recursive: true });
		mkdirSync(`${migrationDir}/20240101010101_ok`, { recursive: true });
		writeFileSync(`${migrationDir}/20240101010101_ok/migration.sql`, 'CREATE TABLE "http_mig_ok" ("id" integer);');
		mkdirSync(`${migrationDir}/20240202020202_bad`, { recursive: true });
		writeFileSync(`${migrationDir}/20240202020202_bad/migration.sql`, 'CREATE TABLE "http_mig_ok" ("id" integer);');

		await expect(migrate(db as any as PostgresHttpDatabase<any>, { migrationsFolder: migrationDir })).rejects.toThrow(
			/already exists/i,
		);

		const present = await db.execute<{ present: boolean }>(
			sql`select to_regclass('public.http_mig_ok') is not null as present`,
		);
		expect(present.rows[0]!.present).toBe(false);

		const applied = await db.execute<{ n: number }>(
			sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
		);
		expect(applied.rows[0]!.n).toBe(0);

		await db.execute(sql`drop schema "drizzle" cascade`);
		rmSync(migrationDir, { recursive: true });
	});
	test('migrator : migrate with custom table and custom schema', async ({ db }) => {
		const customTable = randomString();
		const customSchema = randomString();
		await db.execute(sql`drop table if exists all_columns`);
		await db.execute(sql`drop table if exists users12`);
		await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

		await migrate(db as any as PostgresHttpDatabase<any>, {
			migrationsFolder: './drizzle2/pg',
			migrationsTable: customTable,
			migrationsSchema: customSchema,
		});

		const { rowCount } = await db.execute(
			sql`select * from ${sql.identifier(customSchema)}.${sql.identifier(customTable)};`,
		);
		expect(rowCount && rowCount > 0).toBeTruthy();

		await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
		const result = await db.select().from(usersMigratorTable);
		expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

		await db.execute(sql`drop table all_columns`);
		await db.execute(sql`drop table users12`);
		await db.execute(sql`drop table ${sql.identifier(customSchema)}.${sql.identifier(customTable)}`);
	});

	test('migrator : --init - local migrations error', async ({ db }) => {
		const migrationsSchema = 'drzl_migrations_init';
		const migrationsTable = 'drzl_init';

		await db.execute(sql`drop schema if exists ${sql.identifier(migrationsSchema)} cascade;`);
		await db.execute(sql`drop schema if exists public cascade`);
		await db.execute(sql`create schema public`);

		const migratorRes = await migrate(db as any as PostgresHttpDatabase<any>, {
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

		await migrate(db as any as PostgresHttpDatabase<any>, {
			migrationsFolder: './drizzle2/pg-init',
			migrationsSchema,
			migrationsTable,
		});

		const migratorRes = await migrate(db as any as PostgresHttpDatabase<any>, {
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
});

describe('driver-specific', () => {
	test('all date and time columns without timezone first case mode string', async ({ db }) => {
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

		await db.insert(table).values([
			{ timestamp: '2022-01-01 02:00:00.123456' },
		]);

		const result = await db.select().from(table);
		expect(result).toEqual([{ id: 1, timestamp: '2022-01-01 02:00:00.123456' }]);

		const result2 = await db.execute<{
			id: number;
			timestamp_string: string;
		}>(sql`select * from ${table}`);

		expect(result2.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456' }]);

		await db.execute(sql`drop table if exists ${table}`);
	});

	test('all date and time columns without timezone second case mode string', async ({ db }) => {
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

		await db.insert(table).values([
			{ timestamp: '2022-01-01T02:00:00.123456-02' },
		]);

		const result = await db.execute<{
			id: number;
			timestamp_string: string;
		}>(sql`select * from ${table}`);

		expect(result.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456' }]);

		await db.execute(sql`drop table if exists ${table}`);
	});

	test('all date and time columns without timezone third case mode date', async ({ db }) => {
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
		await db.insert(table).values([
			{ timestamp: insertedDate },
		]);

		const result = await db.execute<{
			id: number;
			timestamp_string: string;
		}>(sql`select * from ${table}`);
		expect(new Date(result.rows[0]!.timestamp_string + 'Z').getTime()).toBe(insertedDate.getTime());

		await db.execute(sql`drop table if exists ${table}`);
	});

	test('test mode string for timestamp with timezone', async ({ db }) => {
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

		await db.insert(table).values([
			{ timestamp: timestampString },
		]);

		const result = await db.select().from(table);
		expect(result).toEqual([{ id: 1, timestamp: '2022-01-01 02:00:00.123456+00' }]);

		const result2 = await db.execute<{
			id: number;
			timestamp_string: string;
		}>(sql`select * from ${table}`);

		expect(result2.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456+00' }]);

		await db.execute(sql`drop table if exists ${table}`);
	});

	test('test mode date for timestamp with timezone', async ({ db }) => {
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

		await db.insert(table).values([
			{ timestamp: timestampString },
		]);

		const result = await db.select().from(table);

		expect(result).toEqual([{ id: 1, timestamp: timestampString }]);

		const result2 = await db.execute<{
			id: number;
			timestamp_string: string;
		}>(sql`select * from ${table}`);

		expect(result2.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.456+00' }]);

		await db.execute(sql`drop table if exists ${table}`);
	});

	test('test mode string for timestamp with timezone in UTC timezone', async ({ db }) => {
		const timezone = await db.execute<{ TimeZone: string }>(sql`show timezone`);

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

		await db.insert(table).values([
			{ timestamp: timestampString },
		]);

		const result = await db.select().from(table);

		expect(result).toEqual([{ id: 1, timestamp: '2022-01-01 02:00:00.123456+00' }]);

		const result2 = await db.execute<{
			id: number;
			timestamp_string: string;
		}>(sql`select * from ${table}`);

		expect(result2.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456+00' }]);

		await db.execute(sql`set time zone '${sql.raw(timezone.rows[0]!.TimeZone)}'`);

		await db.execute(sql`drop table if exists ${table}`);
	});

	test('insert via db.execute + select via db.execute', async ({ db, push }) => {
		const usersTable = pgTable('users_execute_raw_minipg_1', {
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
		const usersTable = pgTable('users_execute_raw_minipg_2', {
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
		const usersTable = pgTable('users_execute_raw_minipg_1', {
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

	test('all types ~shapes~', async ({ createDB, push }) => {
		const db = createDB({ allTypesTable }, allTypesRelations);
		await push({ en: allTypesEnum, allTypesTable });
		await db.insert(allTypesTable).values(allTypesData);

		const [flat] = await db.select().from(allTypesTable);
		expect(flat).toStrictEqual(allTypesData);

		const nested = await db.query.allTypesTable.findFirst({ with: { self: true } });
		expect(nested).toStrictEqual({ ...allTypesData, self: [allTypesData] });

		await assertAllTypesUnions(db);
	});

	test('all types ~codecs~ override', async ({ createDB, push }) => {
		const base = createDB({ allTypesTable }, allTypesRelations);
		await push({ en: allTypesEnum, allTypesTable });

		const relations = defineRelations({ allTypesTable }, allTypesRelations);
		const db = drizzleHttp({ client: (base as any).$client, relations, codecs: minipgCodecs });
		await db.insert(allTypesTable).values(allTypesData);

		const [flat] = await db.select().from(allTypesTable);
		expect(flat).toStrictEqual(allTypesData);

		const nested = await db.query.allTypesTable.findFirst({ with: { self: true } });
		expect(nested).toStrictEqual({ ...allTypesData, self: [allTypesData] });

		await assertAllTypesUnions(db);
	});
});
