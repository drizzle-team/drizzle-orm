import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import { getTableConfig, pgTable, serial, timestamp } from 'drizzle-orm/pg-core';
import { PgAsyncDatabase } from 'drizzle-orm/pg-core/async/db';
import { describe } from 'node:test';
import { expect } from 'vitest';
import { randomString } from '~/utils';
import { tests } from './common';
import { neonWsTest as test } from './instrumentation';
import { usersMigratorTable, usersMySchemaTable, usersTable } from './schema';

/*
	it doesn't work as expected, scope: "file" treats all these tests as 1 file
	thus extra execute statements below
 */
tests(test, []);
describe('neon-serverless', () => {
	let db: PgAsyncDatabase<any, any>;
	test.sequential('_', async ({ db: _db, push }) => {
		db = _db;

		await db.execute('drop schema if exists public, "mySchema" cascade;');
		await db.execute('create schema public');
		await db.execute('create schema "mySchema";');

		await push({ usersTable, usersMySchemaTable });
	});

	test('migrator : default migration strategy', async () => {
		await db.execute(sql`drop table if exists all_columns,users12,"drizzle"."__drizzle_migrations"`);

		await migrate(db, { migrationsFolder: './drizzle2/pg' });

		await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });

		const result = await db.select().from(usersMigratorTable);

		expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

		await db.execute(sql`drop table all_columns,users12,"drizzle"."__drizzle_migrations"`);
	});

	test('migrator : migrate with custom schema', async () => {
		await db.execute(sql`drop table if exists all_columns,users12,"drizzle"."__drizzle_migrations"`);

		await migrate(db, { migrationsFolder: './drizzle2/pg', migrationsSchema: 'custom_migrations' });

		// test if the custom migrations table was created
		const { rowCount } = await db.execute(sql`select * from custom_migrations."__drizzle_migrations";`);
		expect(rowCount && rowCount > 0).toBeTruthy();

		// test if the migrated table are working as expected
		await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
		const result = await db.select().from(usersMigratorTable);
		expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

		await db.execute(sql`drop table all_columns,users12,custom_migrations."__drizzle_migrations"`);
	});

	test('migrator : migrate with custom table', async () => {
		const customTable = randomString();
		await db.execute(sql`drop table if exists all_columns,users12,"drizzle"."__drizzle_migrations"`);

		await migrate(db, { migrationsFolder: './drizzle2/pg', migrationsTable: customTable });

		// test if the custom migrations table was created
		const { rowCount } = await db.execute(sql`select * from "drizzle".${sql.identifier(customTable)};`);
		expect(rowCount && rowCount > 0).toBeTruthy();

		// test if the migrated table are working as expected
		await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
		const result = await db.select().from(usersMigratorTable);
		expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

		await db.execute(sql`drop table all_columns,users12,"drizzle".${sql.identifier(customTable)}`);
	});

	test('migrator : migrate with custom table and custom schema', async () => {
		const customTable = randomString();
		await db.execute(sql`drop table if exists all_columns,users12,"drizzle"."__drizzle_migrations"`);

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

		await db.execute(sql`drop table all_columns,users12,custom_migrations.${sql.identifier(customTable)}`);
	});

	test('all date and time columns without timezone first case mode string', async () => {
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
		}>(sql`select * from ${table}`);

		expect(result2.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456' }]);

		await db.execute(sql`drop table if exists ${table}`);
	});

	test('all date and time columns without timezone second case mode string', async () => {
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
		}>(sql`select * from ${table}`);

		expect(result.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456' }]);

		await db.execute(sql`drop table if exists ${table}`);
	});

	test('all date and time columns without timezone third case mode date', async () => {
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
		}>(sql`select * from ${table}`);

		// 3. Compare both dates using orm mapping - Need to add 'Z' to tell JS that it is UTC
		expect(new Date(result.rows[0]!.timestamp_string + 'Z').getTime()).toBe(insertedDate.getTime());

		await db.execute(sql`drop table if exists ${table}`);
	});

	test('test mode string for timestamp with timezone', async () => {
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
		}>(sql`select * from ${table}`);

		// 3.1 Notice that postgres will return the date in UTC, but it is exactlt the same
		expect(result2.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456+00' }]);

		await db.execute(sql`drop table if exists ${table}`);
	});

	test('test mode date for timestamp with timezone', async () => {
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
		}>(sql`select * from ${table}`);

		// 3.1 Notice that postgres will return the date in UTC, but it is exactlt the same
		expect(result2.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.456+00' }]);

		await db.execute(sql`drop table if exists ${table}`);
	});

	test('test mode string for timestamp with timezone in UTC timezone', async () => {
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
		}>(sql`select * from ${table}`);

		// 3.1 Notice that postgres will return the date in UTC, but it is exactlt the same
		expect(result2.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456+00' }]);

		await db.execute(sql`set time zone '${sql.raw(timezone.rows[0]!.TimeZone)}'`);

		await db.execute(sql`drop table if exists ${table}`);
	});

	test.skip('test mode string for timestamp with timezone in different timezone', async () => {
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

	test('select all fields', async () => {
		await db.execute(`truncate table users restart identity;`);
		const now = Date.now();

		await db.insert(usersTable).values({ name: 'John' });
		const result = await db.select().from(usersTable);

		expect(result[0]!.createdAt).toBeInstanceOf(Date);
		expect(Math.abs(result[0]!.createdAt.getTime() - now)).toBeLessThan(5000);
		expect(result).toEqual([{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);
	});

	test('update with returning all fields', async () => {
		await db.execute(`truncate table users restart identity;`);
		const now = Date.now();

		await db.insert(usersTable).values({ name: 'John' });
		const users = await db
			.update(usersTable)
			.set({ name: 'Jane' })
			.where(eq(usersTable.name, 'John'))
			.returning();

		expect(users[0]!.createdAt).toBeInstanceOf(Date);
		expect(Math.abs(users[0]!.createdAt.getTime() - now)).toBeLessThan(3000);
		expect(users).toEqual([
			{ id: 1, name: 'Jane', verified: false, jsonb: null, createdAt: users[0]!.createdAt },
		]);
	});

	test('delete with returning all fields', async () => {
		await db.execute(`truncate table users restart identity;`);
		const now = Date.now();

		await db.insert(usersTable).values({ name: 'John' });
		const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning();

		expect(users[0]!.createdAt).toBeInstanceOf(Date);
		expect(Math.abs(users[0]!.createdAt.getTime() - now)).toBeLessThan(3000);
		expect(users).toEqual([
			{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: users[0]!.createdAt },
		]);
	});

	test('mySchema :: select all fields', async () => {
		await db.execute(`truncate table users restart identity;`);
		const now = Date.now();

		await db.insert(usersMySchemaTable).values({ name: 'John' });
		const result = await db.select().from(usersMySchemaTable);

		expect(result[0]!.createdAt).toBeInstanceOf(Date);
		expect(Math.abs(result[0]!.createdAt.getTime() - now)).toBeLessThan(3000);
		expect(result).toEqual([{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);
	});

	test('mySchema :: delete with returning all fields', async () => {
		await db.execute(`truncate table "mySchema"."users" restart identity;`);
		const now = Date.now();

		await db.insert(usersMySchemaTable).values({ name: 'John' });
		const users = await db.delete(usersMySchemaTable).where(eq(usersMySchemaTable.name, 'John')).returning();

		expect(users[0]!.createdAt).toBeInstanceOf(Date);
		expect(Math.abs(users[0]!.createdAt.getTime() - now)).toBeLessThan(3000);
		expect(users).toEqual([{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: users[0]!.createdAt }]);
	});

	test('insert via db.execute + select via db.execute', async () => {
		await db.execute(`truncate table users restart identity;`);
		await db.execute(
			sql`insert into ${usersTable} (${sql.identifier(usersTable.name.name)}) values (${'John'})`,
		);

		const result = await db.execute<{ id: number; name: string }>(
			sql`select id, name from "users"`,
		);
		expect(result.rows).toEqual([{ id: 1, name: 'John' }]);
	});

	test('insert via db.execute + returning', async () => {
		await db.execute(`truncate table users restart identity;`);
		const inserted = await db.execute<{ id: number; name: string }>(
			sql`insert into ${usersTable} (${
				sql.identifier(
					usersTable.name.name,
				)
			}) values (${'John'}) returning ${usersTable.id}, ${usersTable.name}`,
		);
		expect(inserted.rows).toEqual([{ id: 1, name: 'John' }]);
	});

	test('insert via db.execute w/ query builder', async () => {
		await db.execute(`truncate table users restart identity;`);
		const inserted = await db.execute<Pick<typeof usersTable.$inferSelect, 'id' | 'name'>>(
			db
				.insert(usersTable)
				.values({ name: 'John' })
				.returning({ id: usersTable.id, name: usersTable.name }),
		);
		expect(inserted.rows).toEqual([{ id: 1, name: 'John' }]);
	});

	test('migrator : --init', async () => {
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

	test('migrator : --init - local migrations error', async () => {
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

	test('migrator : --init - db migrations error', async () => {
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
});
