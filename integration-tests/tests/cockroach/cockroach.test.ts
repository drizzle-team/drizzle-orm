import retry from 'async-retry';
import { sql } from 'drizzle-orm';
import type { NodeCockroachDatabase } from 'drizzle-orm/cockroach';
import { drizzle } from 'drizzle-orm/cockroach';
import { cockroachTable, getTableConfig, int4, timestamp } from 'drizzle-orm/cockroach-core';
import { migrate } from 'drizzle-orm/cockroach/migrator';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { skipTests } from '~/common';
import { randomString } from '~/utils';
import { createDockerDB, tests, usersMigratorTable, usersTable } from './common';

const ENABLE_LOGGING = false;

let db: NodeCockroachDatabase;
let client: Client;

beforeAll(async () => {
	let connectionString;
	if (process.env['COCKROACH_CONNECTION_STRING']) {
		connectionString = process.env['COCKROACH_CONNECTION_STRING'];
	} else {
		const { connectionString: conStr } = await createDockerDB();
		connectionString = conStr;
	}
	client = await retry(async () => {
		client = new Client(connectionString);
		await client.connect();
		return client;
	}, {
		retries: 20,
		factor: 1,
		minTimeout: 250,
		maxTimeout: 250,
		randomize: false,
		onRetry() {
			client?.end();
		},
	});
	db = drizzle({ client, logger: ENABLE_LOGGING });
});

afterAll(async () => {
	await client?.end();
});

beforeEach((ctx) => {
	ctx.cockroach = {
		db,
	};
});

test('migrator : default migration strategy', async () => {
	await db.execute(sql`drop table if exists users12`);
	await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

	await migrate(db, { migrationsFolder: './drizzle2/cockroach' });

	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });

	const result = await db.select().from(usersMigratorTable);

	expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

	await db.execute(sql`drop table users12`);
	await db.execute(sql`drop table "drizzle"."__drizzle_migrations"`);
});

test('migrator : migrate with custom schema', async () => {
	const customSchema = randomString();
	await db.execute(sql`drop table if exists users12`);
	await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

	await migrate(db, { migrationsFolder: './drizzle2/cockroach', migrationsSchema: customSchema });

	// test if the custom migrations table was created
	const { rowCount } = await db.execute(sql`select * from ${sql.identifier(customSchema)}."__drizzle_migrations";`);
	expect(rowCount && rowCount > 0).toBeTruthy();

	// test if the migrated table are working as expected
	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
	const result = await db.select().from(usersMigratorTable);
	expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

	await db.execute(sql`drop table users12`);
	await db.execute(sql`drop table ${sql.identifier(customSchema)}."__drizzle_migrations"`);
});

test('migrator : migrate with custom table', async () => {
	const customTable = randomString();
	await db.execute(sql`drop table if exists users12`);
	await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

	await migrate(db, { migrationsFolder: './drizzle2/cockroach', migrationsTable: customTable });

	// test if the custom migrations table was created
	const { rowCount } = await db.execute(sql`select * from "drizzle".${sql.identifier(customTable)};`);
	expect(rowCount && rowCount > 0).toBeTruthy();

	// test if the migrated table are working as expected
	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
	const result = await db.select().from(usersMigratorTable);
	expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

	await db.execute(sql`drop table users12`);
	await db.execute(sql`drop table "drizzle".${sql.identifier(customTable)}`);
});

test('migrator : migrate with custom table and custom schema', async () => {
	const customTable = randomString();
	const customSchema = randomString();
	await db.execute(sql`drop table if exists users12`);
	await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

	await migrate(db, {
		migrationsFolder: './drizzle2/cockroach',
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

	await db.execute(sql`drop table users12`);
	await db.execute(sql`drop table ${sql.identifier(customSchema)}.${sql.identifier(customTable)}`);
});

test('migrator : --init', async () => {
	const migrationsSchema = 'drzl_migrations_init';
	const migrationsTable = 'drzl_init';

	await db.execute(sql`drop schema if exists ${sql.identifier(migrationsSchema)} cascade;`);
	await db.execute(sql`drop table if exists ${usersMigratorTable}`);

	const migratorRes = await migrate(db, {
		migrationsFolder: './drizzle2/cockroach',
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
				FROM information_schema.tables
				WHERE table_schema = ${getTableConfig(usersMigratorTable).schema ?? 'public'} AND table_name = ${
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
	await db.execute(sql`drop table if exists ${usersMigratorTable}`);

	const migratorRes = await migrate(db, {
		migrationsFolder: './drizzle2/cockroach-init',
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
				FROM information_schema.tables
				WHERE table_schema = ${getTableConfig(usersMigratorTable).schema ?? 'public'} AND table_name = ${
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
	await db.execute(sql`drop table if exists ${usersMigratorTable}`);

	await migrate(db, {
		migrationsFolder: './drizzle2/cockroach-init',
		migrationsSchema,
		migrationsTable,
	});

	const migratorRes = await migrate(db, {
		migrationsFolder: './drizzle2/cockroach',
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
				FROM information_schema.tables
				WHERE table_schema = ${getTableConfig(usersMigratorTable).schema ?? 'public'} AND table_name = ${
		getTableConfig(usersMigratorTable).name
	}
			) as ${sql.identifier('tableExists')};`);

	expect(migratorRes).toStrictEqual({ exitCode: 'databaseMigrations' });
	expect(meta.length).toStrictEqual(2);
	expect(res.rows[0]?.tableExists).toStrictEqual(true);
});

test('all date and time columns without timezone first case mode string', async () => {
	const table = cockroachTable('all_columns', {
		id: int4('id').primaryKey(),
		timestamp: timestamp('timestamp_string', { mode: 'string', precision: 6 }).notNull(),
	});

	await db.execute(sql`drop table if exists ${table}`);

	await db.execute(sql`
		create table ${table} (
					id int4 primary key,
					timestamp_string timestamp(6) not null
			)
	`);

	// 1. Insert date in string format without timezone in it
	await db.insert(table).values([
		{ id: 1, timestamp: '2022-01-01 02:00:00.123456' },
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
	const table = cockroachTable('all_columns', {
		id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
		timestamp: timestamp('timestamp_string', { mode: 'string', precision: 6 }).notNull(),
	});

	await db.execute(sql`drop table if exists ${table}`);

	await db.execute(sql`
		create table ${table} (
					id int4 primary key generated by default as identity,
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
	const table = cockroachTable('all_columns', {
		id: int4('id').primaryKey().generatedAlwaysAsIdentity(),
		timestamp: timestamp('timestamp_string', { mode: 'date', precision: 3 }).notNull(),
	});

	await db.execute(sql`drop table if exists ${table}`);

	await db.execute(sql`
		create table ${table} (
					id int4 primary key generated always as identity,
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
		id: string;
		timestamp_string: string;
	}>(sql`select * from ${table}`);

	// 3. Compare both dates using orm mapping - Need to add 'Z' to tell JS that it is UTC
	expect(new Date(result.rows[0]!.timestamp_string + 'Z').getTime()).toBe(insertedDate.getTime());

	await db.execute(sql`drop table if exists ${table}`);
});

test('test mode string for timestamp with timezone', async () => {
	const table = cockroachTable('all_columns', {
		id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
		timestamp: timestamp('timestamp_string', { mode: 'string', withTimezone: true, precision: 6 }).notNull(),
	});

	await db.execute(sql`drop table if exists ${table}`);

	await db.execute(sql`
		create table ${table} (
					id int4 primary key generated by default as identity,
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

	expect(result).toEqual([{ id: 1, timestamp: '2022-01-01 02:00:00.123456+00' }]);

	// 3. Select as raw query and checke that values are the same
	const result2 = await db.execute<{
		id: string;
		timestamp_string: string;
	}>(sql`select * from ${table}`);

	expect(result2.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456+00' }]);

	await db.execute(sql`drop table if exists ${table}`);
});

test('test mode date for timestamp with timezone', async () => {
	const table = cockroachTable('all_columns', {
		id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
		timestamp: timestamp('timestamp_string', { mode: 'date', withTimezone: true, precision: 3 }).notNull(),
	});

	await db.execute(sql`drop table if exists ${table}`);

	await db.execute(sql`
		create table ${table} (
					id int4 primary key generated by default as identity,
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
		id: string;
		timestamp_string: string;
	}>(sql`select * from ${table}`);

	expect(result2.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.456+00' }]);

	await db.execute(sql`drop table if exists ${table}`);
});

test('test mode string for timestamp with timezone in UTC timezone', async () => {
	// get current timezone from db
	const timezone = await db.execute<{ TimeZone: string }>(sql`show timezone`);

	// set timezone to UTC
	await db.execute(sql`set time zone 'UTC'`);

	const table = cockroachTable('all_columns', {
		id: int4('id').primaryKey().generatedAlwaysAsIdentity(),
		timestamp: timestamp('timestamp_string', { mode: 'string', withTimezone: true, precision: 6 }).notNull(),
	});

	await db.execute(sql`drop table if exists ${table}`);

	await db.execute(sql`
		create table ${table} (
					id int4 primary key generated by default as identity,
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
		id: string;
		timestamp_string: string;
	}>(sql`select * from ${table}`);

	expect(result2.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456+00' }]);

	await db.execute(sql`set time zone '${sql.raw(timezone.rows[0]!.TimeZone)}'`);

	await db.execute(sql`drop table if exists ${table}`);
});

test('test mode string for timestamp with timezone in different timezone', async () => {
	// get current timezone from db
	const timezone = await db.execute<{ TimeZone: string }>(sql`show timezone`);

	// set timezone to HST (UTC - 10)
	await db.execute(sql`set time zone 'HST'`);

	const table = cockroachTable('all_columns', {
		id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
		timestamp: timestamp('timestamp_string', { mode: 'string', withTimezone: true, precision: 6 }).notNull(),
	});

	await db.execute(sql`drop table if exists ${table}`);

	await db.execute(sql`
		create table ${table} (
					id int4 primary key generated by default as identity,
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
		id: string;
		timestamp_string: string;
	}>(sql`select * from ${table}`);

	expect(result2.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 00:00:00.123456-10' }]);

	await db.execute(sql`set time zone '${sql.raw(timezone.rows[0]!.TimeZone)}'`);

	await db.execute(sql`drop table if exists ${table}`);
});

skipTests([
	'migrator : default migration strategy',
	'migrator : migrate with custom schema',
	'migrator : migrate with custom table',
	'migrator : migrate with custom table and custom schema',
	'insert via db.execute + select via db.execute',
	'insert via db.execute + returning',
	'insert via db.execute w/ query builder',
	'all date and time columns without timezone first case mode string',
	'all date and time columns without timezone third case mode date',
	'test mode string for timestamp with timezone',
	'test mode date for timestamp with timezone',
	'test mode string for timestamp with timezone in UTC timezone',
	'test mode string for timestamp with timezone in different timezone',
]);
tests();

beforeEach(async () => {
	await db.execute(sql`drop database defaultdb;`);
	await db.execute(sql`create database defaultdb;`);
	await db.execute(
		sql`
			create table users (
				id int4 primary key generated by default as identity,
				name text not null,
				verified boolean not null default false, 
				jsonb jsonb,
				created_at timestamptz not null default now()
			)
		`,
	);
});

test('insert via db.execute + select via db.execute', async () => {
	await db.execute(
		sql`insert into ${usersTable} (${sql.identifier(usersTable.name.name)}) values (${'John'})`,
	);

	const result = await db.execute<{ id: string; name: string }>(
		sql`select id, name from "users"`,
	);
	expect(result.rows).toEqual([{ id: 1, name: 'John' }]);
});

test('insert via db.execute + returning', async () => {
	const inserted = await db.execute<{ id: string; name: string }>(
		sql`insert into ${usersTable} (${
			sql.identifier(
				usersTable.name.name,
			)
		}) values (${'John'}) returning ${usersTable.id}, ${usersTable.name}`,
	);
	expect(inserted.rows).toEqual([{ id: 1, name: 'John' }]);
});

test('insert via db.execute w/ query builder', async () => {
	const inserted = await db.execute<Pick<typeof usersTable.$inferSelect, 'id' | 'name'>>(
		db
			.insert(usersTable)
			.values({ name: 'John' })
			.returning({ id: usersTable.id, name: usersTable.name }),
	);
	expect(inserted.rows).toEqual([{ id: 1, name: 'John' }]);
});
