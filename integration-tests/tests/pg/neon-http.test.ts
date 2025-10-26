import { neon, neonConfig, type NeonQueryFunction } from '@neondatabase/serverless';
import { defineRelations, eq, sql } from 'drizzle-orm';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { pgMaterializedView, pgTable, serial, timestamp } from 'drizzle-orm/pg-core';
import { beforeAll, beforeEach, describe, expect, expectTypeOf, test, vi } from 'vitest';
import { skipTests } from '~/common';
import { randomString } from '~/utils';
import { allTypesTable, tests, usersMigratorTable, usersTable } from './pg-common';
import { TestCache, TestGlobalCache, tests as cacheTests } from './pg-common-cache';
import relations from './relations';

const ENABLE_LOGGING = false;

let db: NeonHttpDatabase<never, typeof relations>;
let dbGlobalCached: NeonHttpDatabase;
let cachedDb: NeonHttpDatabase;

beforeAll(async () => {
	const connectionString = process.env['NEON_CONNECTION_STRING'];
	if (!connectionString) throw new Error();

	neonConfig.fetchEndpoint = (host) => {
		const [protocol, port] = host === 'db.localtest.me' ? ['http', 4444] : ['https', 443];
		return `${protocol}://${host}:${port}/sql`;
	};
	const client = neon(connectionString);

	db = drizzle({ client, logger: ENABLE_LOGGING, relations });
	cachedDb = drizzle({ client, logger: ENABLE_LOGGING, cache: new TestCache() });
	dbGlobalCached = drizzle({ client, logger: ENABLE_LOGGING, cache: new TestGlobalCache() });
});

beforeEach((ctx) => {
	ctx.pg = {
		db,
	};
	ctx.cachedPg = {
		db: cachedDb,
		dbGlobalCached,
	};
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
	'nested transaction rollback',
	'transaction rollback',
	'nested transaction',
	'transaction',
	'timestamp timezone',
	'test $onUpdateFn and $onUpdate works as $default',
	'RQB v2 transaction find first - no rows',
	'RQB v2 transaction find first - multiple rows',
	'RQB v2 transaction find first - with relation',
	'RQB v2 transaction find first - placeholders',
	'RQB v2 transaction find many - no rows',
	'RQB v2 transaction find many - multiple rows',
	'RQB v2 transaction find many - with relation',
	'RQB v2 transaction find many - placeholders',
	// Disabled until Buffer insertion is fixed
	'all types',
]);
tests();
cacheTests();

describe('default', () => {
	beforeEach(async () => {
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

	test('migrator : default migration strategy', async () => {
		await db.execute(sql`drop table if exists all_columns`);
		await db.execute(sql`drop table if exists users12`);
		await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

		await migrate(db, { migrationsFolder: './drizzle2/pg' });

		await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });

		const result = await db.select().from(usersMigratorTable);

		expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

		await db.execute(sql`drop table all_columns`);
		await db.execute(sql`drop table users12`);
		await db.execute(sql`drop table "drizzle"."__drizzle_migrations"`);
	});

	test('migrator : migrate with custom schema', async () => {
		await db.execute(sql`drop table if exists all_columns`);
		await db.execute(sql`drop table if exists users12`);
		await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

		await migrate(db, { migrationsFolder: './drizzle2/pg', migrationsSchema: 'custom_migrations' });

		// test if the custom migrations table was created
		const { rowCount } = await db.execute(sql`select * from custom_migrations."__drizzle_migrations";`);
		expect(rowCount && rowCount > 0).toBeTruthy();

		// test if the migrated table are working as expected
		await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
		const result = await db.select().from(usersMigratorTable);
		expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

		await db.execute(sql`drop table all_columns`);
		await db.execute(sql`drop table users12`);
		await db.execute(sql`drop table custom_migrations."__drizzle_migrations"`);
	});

	test('migrator : migrate with custom table', async () => {
		const customTable = randomString();
		await db.execute(sql`drop table if exists all_columns`);
		await db.execute(sql`drop table if exists users12`);
		await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

		await migrate(db, { migrationsFolder: './drizzle2/pg', migrationsTable: customTable });

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

	test('migrator : migrate with custom table and custom schema', async () => {
		const customTable = randomString();
		await db.execute(sql`drop table if exists all_columns`);
		await db.execute(sql`drop table if exists users12`);
		await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

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

		await db.execute(sql`drop table all_columns`);
		await db.execute(sql`drop table users12`);
		await db.execute(sql`drop table custom_migrations.${sql.identifier(customTable)}`);
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
	test('insert via db.execute + select via db.execute', async () => {
		await db.execute(
			sql`insert into ${usersTable} (${sql.identifier(usersTable.name.name)}) values (${'John'})`,
		);

		const result = await db.execute<{ id: number; name: string }>(
			sql`select id, name from "users"`,
		);
		expect(result.rows).toEqual([{ id: 1, name: 'John' }]);
	});

	test('insert via db.execute + returning', async () => {
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
		const inserted = await db.execute<Pick<typeof usersTable.$inferSelect, 'id' | 'name'>>(
			db
				.insert(usersTable)
				.values({ name: 'John' })
				.returning({ id: usersTable.id, name: usersTable.name }),
		);
		expect(inserted.rows).toEqual([{ id: 1, name: 'John' }]);
	});

	test('all types - neon-http', async (ctx) => {
		const { db } = ctx.pg;

		await db.execute(sql`CREATE TYPE "public"."en" AS ENUM('enVal1', 'enVal2');`);
		await db.execute(sql`
		CREATE TABLE "all_types" (
			"serial" serial NOT NULL,
			"bigserial53" bigserial NOT NULL,
			"bigserial64" bigserial,
			"int" integer,
			"bigint53" bigint,
			"bigint64" bigint,
			"bool" boolean,
			"bytea" bytea,
			"char" char,
			"cidr" "cidr",
			"date" date,
			"date_str" date,
			"double" double precision,
			"enum" "en",
			"inet" "inet",
			"interval" interval,
			"json" json,
			"jsonb" jsonb,
			"line" "line",
			"line_tuple" "line",
			"macaddr" "macaddr",
			"macaddr8" "macaddr8",
			"numeric" numeric,
			"numeric_num" numeric,
			"numeric_big" numeric,
			"point" "point",
			"point_tuple" "point",
			"real" real,
			"smallint" smallint,
			"smallserial" "smallserial" NOT NULL,
			"text" text,
			"time" time,
			"timestamp" timestamp,
			"timestamp_tz" timestamp with time zone,
			"timestamp_str" timestamp,
			"timestamp_tz_str" timestamp with time zone,
			"uuid" uuid,
			"varchar" varchar,
			"arrint" integer[],
			"arrbigint53" bigint[],
			"arrbigint64" bigint[],
			"arrbool" boolean[],
			"arrbytea" bytea[],
			"arrchar" char[],
			"arrcidr" "cidr"[],
			"arrdate" date[],
			"arrdate_str" date[],
			"arrdouble" double precision[],
			"arrenum" "en"[],
			"arrinet" "inet"[],
			"arrinterval" interval[],
			"arrjson" json[],
			"arrjsonb" jsonb[],
			"arrline" "line"[],
			"arrline_tuple" "line"[],
			"arrmacaddr" "macaddr"[],
			"arrmacaddr8" "macaddr8"[],
			"arrnumeric" numeric[],
			"arrnumeric_num" numeric[],
			"arrnumeric_big" numeric[],
			"arrpoint" "point"[],
			"arrpoint_tuple" "point"[],
			"arrreal" real[],
			"arrsmallint" smallint[],
			"arrtext" text[],
			"arrtime" time[],
			"arrtimestamp" timestamp[],
			"arrtimestamp_tz" timestamp with time zone[],
			"arrtimestamp_str" timestamp[],
			"arrtimestamp_tz_str" timestamp with time zone[],
			"arruuid" uuid[],
			"arrvarchar" varchar[]
		);
	`);

		await db.insert(allTypesTable).values({
			serial: 1,
			smallserial: 15,
			bigint53: 9007199254740991,
			bigint64: 5044565289845416380n,
			bigserial53: 9007199254740991,
			bigserial64: 5044565289845416380n,
			bool: true,
			bytea: null,
			char: 'c',
			cidr: '2001:4f8:3:ba:2e0:81ff:fe22:d1f1/128',
			inet: '192.168.0.1/24',
			macaddr: '08:00:2b:01:02:03',
			macaddr8: '08:00:2b:01:02:03:04:05',
			date: new Date(1741743161623),
			dateStr: new Date(1741743161623).toISOString(),
			double: 15.35325689124218,
			enum: 'enVal1',
			int: 621,
			interval: '2 months ago',
			json: {
				str: 'strval',
				arr: ['str', 10],
			},
			jsonb: {
				str: 'strvalb',
				arr: ['strb', 11],
			},
			line: {
				a: 1,
				b: 2,
				c: 3,
			},
			lineTuple: [1, 2, 3],
			numeric: '475452353476',
			numericNum: 9007199254740991,
			numericBig: 5044565289845416380n,
			point: {
				x: 24.5,
				y: 49.6,
			},
			pointTuple: [57.2, 94.3],
			real: 1.048596,
			smallint: 10,
			text: 'TEXT STRING',
			time: '13:59:28',
			timestamp: new Date(1741743161623),
			timestampTz: new Date(1741743161623),
			timestampStr: new Date(1741743161623).toISOString(),
			timestampTzStr: new Date(1741743161623).toISOString(),
			uuid: 'b77c9eef-8e28-4654-88a1-7221b46d2a1c',
			varchar: 'C4-',
			arrbigint53: [9007199254740991],
			arrbigint64: [5044565289845416380n],
			arrbool: [true],
			arrbytea: [Buffer.from('BYTES')],
			arrchar: ['c'],
			arrcidr: ['2001:4f8:3:ba:2e0:81ff:fe22:d1f1/128'],
			arrinet: ['192.168.0.1/24'],
			arrmacaddr: ['08:00:2b:01:02:03'],
			arrmacaddr8: ['08:00:2b:01:02:03:04:05'],
			arrdate: [new Date(1741743161623)],
			arrdateStr: [new Date(1741743161623).toISOString()],
			arrdouble: [15.35325689124218],
			arrenum: ['enVal1'],
			arrint: [621],
			arrinterval: ['2 months ago'],
			arrjson: [{
				str: 'strval',
				arr: ['str', 10],
			}],
			arrjsonb: [{
				str: 'strvalb',
				arr: ['strb', 11],
			}],
			arrline: [{
				a: 1,
				b: 2,
				c: 3,
			}],
			arrlineTuple: [[1, 2, 3]],
			arrnumeric: ['475452353476'],
			arrnumericNum: [9007199254740991],
			arrnumericBig: [5044565289845416380n],
			arrpoint: [{
				x: 24.5,
				y: 49.6,
			}],
			arrpointTuple: [[57.2, 94.3]],
			arrreal: [1.048596],
			arrsmallint: [10],
			arrtext: ['TEXT STRING'],
			arrtime: ['13:59:28'],
			arrtimestamp: [new Date(1741743161623)],
			arrtimestampTz: [new Date(1741743161623)],
			arrtimestampStr: [new Date(1741743161623).toISOString()],
			arrtimestampTzStr: [new Date(1741743161623).toISOString()],
			arruuid: ['b77c9eef-8e28-4654-88a1-7221b46d2a1c'],
			arrvarchar: ['C4-'],
		});

		const rawRes = await db.select().from(allTypesTable);

		type ExpectedType = {
			serial: number;
			bigserial53: number;
			bigserial64: bigint;
			int: number | null;
			bigint53: number | null;
			bigint64: bigint | null;
			bool: boolean | null;
			bytea: Buffer | null;
			char: string | null;
			cidr: string | null;
			date: Date | null;
			dateStr: string | null;
			double: number | null;
			enum: 'enVal1' | 'enVal2' | null;
			inet: string | null;
			interval: string | null;
			json: unknown;
			jsonb: unknown;
			line: {
				a: number;
				b: number;
				c: number;
			} | null;
			lineTuple: [number, number, number] | null;
			macaddr: string | null;
			macaddr8: string | null;
			numeric: string | null;
			numericNum: number | null;
			numericBig: bigint | null;
			point: {
				x: number;
				y: number;
			} | null;
			pointTuple: [number, number] | null;
			real: number | null;
			smallint: number | null;
			smallserial: number;
			text: string | null;
			time: string | null;
			timestamp: Date | null;
			timestampTz: Date | null;
			timestampStr: string | null;
			timestampTzStr: string | null;
			uuid: string | null;
			varchar: string | null;
			arrint: number[] | null;
			arrbigint53: number[] | null;
			arrbigint64: bigint[] | null;
			arrbool: boolean[] | null;
			arrbytea: Buffer[] | null;
			arrchar: string[] | null;
			arrcidr: string[] | null;
			arrdate: Date[] | null;
			arrdateStr: string[] | null;
			arrdouble: number[] | null;
			arrenum: ('enVal1' | 'enVal2')[] | null;
			arrinet: string[] | null;
			arrinterval: string[] | null;
			arrjson: unknown[] | null;
			arrjsonb: unknown[] | null;
			arrline: {
				a: number;
				b: number;
				c: number;
			}[] | null;
			arrlineTuple: [number, number, number][] | null;
			arrmacaddr: string[] | null;
			arrmacaddr8: string[] | null;
			arrnumeric: string[] | null;
			arrnumericNum: number[] | null;
			arrnumericBig: bigint[] | null;
			arrpoint: { x: number; y: number }[] | null;
			arrpointTuple: [number, number][] | null;
			arrreal: number[] | null;
			arrsmallint: number[] | null;
			arrtext: string[] | null;
			arrtime: string[] | null;
			arrtimestamp: Date[] | null;
			arrtimestampTz: Date[] | null;
			arrtimestampStr: string[] | null;
			arrtimestampTzStr: string[] | null;
			arruuid: string[] | null;
			arrvarchar: string[] | null;
		}[];

		const expectedRes: ExpectedType = [
			{
				serial: 1,
				bigserial53: 9007199254740991,
				bigserial64: 5044565289845416380n,
				int: 621,
				bigint53: 9007199254740991,
				bigint64: 5044565289845416380n,
				bool: true,
				bytea: null,
				char: 'c',
				cidr: '2001:4f8:3:ba:2e0:81ff:fe22:d1f1/128',
				date: new Date('2025-03-12T00:00:00.000Z'),
				dateStr: '2025-03-12',
				double: 15.35325689124218,
				enum: 'enVal1',
				inet: '192.168.0.1/24',
				interval: '-2 mons',
				json: { str: 'strval', arr: ['str', 10] },
				jsonb: { arr: ['strb', 11], str: 'strvalb' },
				line: { a: 1, b: 2, c: 3 },
				lineTuple: [1, 2, 3],
				macaddr: '08:00:2b:01:02:03',
				macaddr8: '08:00:2b:01:02:03:04:05',
				numeric: '475452353476',
				numericNum: 9007199254740991,
				numericBig: 5044565289845416380n,
				point: { x: 24.5, y: 49.6 },
				pointTuple: [57.2, 94.3],
				real: 1.048596,
				smallint: 10,
				smallserial: 15,
				text: 'TEXT STRING',
				time: '13:59:28',
				timestamp: new Date('2025-03-12T01:32:41.623Z'),
				timestampTz: new Date('2025-03-12T01:32:41.623Z'),
				timestampStr: '2025-03-12 01:32:41.623',
				timestampTzStr: '2025-03-12 01:32:41.623+00',
				uuid: 'b77c9eef-8e28-4654-88a1-7221b46d2a1c',
				varchar: 'C4-',
				arrint: [621],
				arrbigint53: [9007199254740991],
				arrbigint64: [5044565289845416380n],
				arrbool: [true],
				arrbytea: [Buffer.from('BYTES')],
				arrchar: ['c'],
				arrcidr: ['2001:4f8:3:ba:2e0:81ff:fe22:d1f1/128'],
				arrdate: [new Date('2025-03-12T00:00:00.000Z')],
				arrdateStr: ['2025-03-12'],
				arrdouble: [15.35325689124218],
				arrenum: ['enVal1'],
				arrinet: ['192.168.0.1/24'],
				arrinterval: ['-2 mons'],
				arrjson: [{ str: 'strval', arr: ['str', 10] }],
				arrjsonb: [{ arr: ['strb', 11], str: 'strvalb' }],
				arrline: [{ a: 1, b: 2, c: 3 }],
				arrlineTuple: [[1, 2, 3]],
				arrmacaddr: ['08:00:2b:01:02:03'],
				arrmacaddr8: ['08:00:2b:01:02:03:04:05'],
				arrnumeric: ['475452353476'],
				arrnumericNum: [9007199254740991],
				arrnumericBig: [5044565289845416380n],
				arrpoint: [{ x: 24.5, y: 49.6 }],
				arrpointTuple: [[57.2, 94.3]],
				arrreal: [1.048596],
				arrsmallint: [10],
				arrtext: ['TEXT STRING'],
				arrtime: ['13:59:28'],
				arrtimestamp: [new Date('2025-03-12T01:32:41.623Z')],
				arrtimestampTz: [new Date('2025-03-12T01:32:41.623Z')],
				arrtimestampStr: ['2025-03-12 01:32:41.623'],
				arrtimestampTzStr: ['2025-03-12 01:32:41.623+00'],
				arruuid: ['b77c9eef-8e28-4654-88a1-7221b46d2a1c'],
				arrvarchar: ['C4-'],
			},
		];

		expectTypeOf(rawRes).toEqualTypeOf<ExpectedType>();
		expect(rawRes).toStrictEqual(expectedRes);
	});
});

describe('$withAuth tests', (it) => {
	const client = vi.fn();
	const db = drizzle({
		client: client as any as NeonQueryFunction<any, any>,
		schema: {
			usersTable,
		},
		relations: defineRelations({ usersTable }),
	});

	it('$count', async () => {
		await db.$withAuth('$count').$count(usersTable).catch(() => null);

		expect(client.mock.lastCall?.[2]).toStrictEqual({ arrayMode: false, fullResults: true, authToken: '$count' });
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

	it('rqb', async () => {
		await db.$withAuth('rqb')._query.usersTable.findFirst().catch(() => null);

		expect(client.mock.lastCall?.[2]).toStrictEqual({ arrayMode: true, fullResults: true, authToken: 'rqb' });
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
		schema: {
			usersTable,
		},
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

	it('rqb', async () => {
		await db.$withAuth(auth('rqb'))._query.usersTable.findFirst().catch(() => null);

		expect(client.mock.lastCall?.[2]['authToken']()).toStrictEqual('rqb');
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
		schema: {
			usersTable,
		},
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

	it('rqb', async () => {
		await db.$withAuth(auth('rqb'))._query.usersTable.findFirst().catch(() => null);

		expect(client.mock.lastCall?.[2]['authToken']()).toBeInstanceOf(Promise);
		expect(await client.mock.lastCall?.[2]['authToken']()).toStrictEqual('rqb');
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
