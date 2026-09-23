import { Name, sql } from 'drizzle-orm';
import {
	boolean,
	customType,
	getTableConfig,
	integer,
	json,
	jsonb,
	pgTable,
	text,
	timestamp,
} from 'drizzle-orm/pg-core';
import { migrate } from 'drizzle-orm/postgres-js/dsql/migrator';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { describe, expect } from 'vitest';
import { randomString } from '~/utils';
import { tests } from './common';
import { postgresJsDsqlTest as test } from './instrumentation';
import { usersMigratorTable } from './schema';

tests(test, [
	'Issue No1504',
	'set json/jsonb fields with strings and retrieve with the ->> operator',
	'set json/jsonb fields with strings and retrieve with the -> operator',
]);

describe('postgres-js dsql', () => {
	test('all date and time columns without timezone first case mode string', async ({ db }) => {
		const table = pgTable('all_columns', {
			id: integer('id').primaryKey(),
			timestamp: timestamp('timestamp_string', { mode: 'string', precision: 6 }).notNull(),
		});

		await db.execute(sql`drop table if exists ${table}`);

		await db.execute(sql`
		create table ${table} (
					id integer primary key,
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

		expect([...result2]).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456' }]);

		await db.execute(sql`drop table if exists ${table}`);
	});

	test('all date and time columns without timezone second case mode string', async ({ db }) => {
		const table = pgTable('all_columns', {
			id: integer('id').primaryKey(),
			timestamp: timestamp('timestamp_string', { mode: 'string', precision: 6 }).notNull(),
		});

		await db.execute(sql`drop table if exists ${table}`);

		await db.execute(sql`
		create table ${table} (
					id integer primary key,
					timestamp_string timestamp(6) not null
			)
	`);

		// 1. Insert date in string format with timezone in it
		await db.insert(table).values([
			{ id: 1, timestamp: '2022-01-01T02:00:00.123456-02' },
		]);

		// 2, Select as raw query and check that values are the same
		const result = await db.execute<{
			id: number;
			timestamp_string: string;
		}>(sql`select * from ${table}`);

		expect([...result]).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456' }]);

		await db.execute(sql`drop table if exists ${table}`);
	});

	test('all date and time columns without timezone third case mode date', async ({ db }) => {
		const table = pgTable('all_columns', {
			id: integer('id').primaryKey(),
			timestamp: timestamp('timestamp_string', { mode: 'date', precision: 3 }).notNull(),
		});

		await db.execute(sql`drop table if exists ${table}`);

		await db.execute(sql`
		create table ${table} (
					id integer primary key,
					timestamp_string timestamp(3) not null
			)
	`);

		const insertedDate = new Date('2022-01-01 20:00:00.123+04');

		// 1. Insert date as new date
		await db.insert(table).values([
			{ id: 1, timestamp: insertedDate },
		]);

		// 2, Select as raw query as string
		const result = await db.execute<{
			id: number;
			timestamp_string: string;
		}>(sql`select * from ${table}`);

		// 3. Compare both dates using orm mapping - Need to add 'Z' to tell JS that it is UTC
		expect(new Date(result[0]!.timestamp_string + 'Z').getTime()).toBe(insertedDate.getTime());

		await db.execute(sql`drop table if exists ${table}`);
	});

	test('test mode string for timestamp with timezone', async ({ db }) => {
		const table = pgTable('all_columns', {
			id: integer('id').primaryKey(),
			timestamp: timestamp('timestamp_string', { mode: 'string', withTimezone: true, precision: 6 }).notNull(),
		});

		await db.execute(sql`drop table if exists ${table}`);

		await db.execute(sql`
		create table ${table} (
					id integer primary key,
					timestamp_string timestamp(6) with time zone not null
			)
	`);

		const timestampString = '2022-01-01 00:00:00.123456-0200';

		// 1. Insert date in string format with timezone in it
		await db.insert(table).values([
			{ id: 1, timestamp: timestampString },
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
		expect([...result2]).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456+00' }]);

		await db.execute(sql`drop table if exists ${table}`);
	});

	test('test mode date for timestamp with timezone', async ({ db }) => {
		const table = pgTable('all_columns', {
			id: integer('id').primaryKey(),
			timestamp: timestamp('timestamp_string', { mode: 'date', withTimezone: true, precision: 3 }).notNull(),
		});

		await db.execute(sql`drop table if exists ${table}`);

		await db.execute(sql`
		create table ${table} (
					id integer primary key,
					timestamp_string timestamp(3) with time zone not null
			)
	`);

		const timestampString = new Date('2022-01-01 00:00:00.456-0200');

		// 1. Insert date in string format with timezone in it
		await db.insert(table).values([
			{ id: 1, timestamp: timestampString },
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
		expect([...result2]).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.456+00' }]);

		await db.execute(sql`drop table if exists ${table}`);
	});

	test('insert via db.execute + select via db.execute', async ({ db, push }) => {
		const usersTable = pgTable('users2', {
			id: integer('id' as string).primaryKey(),
			name: text('name').notNull(),
			verified: boolean('verified').notNull().default(false),
			jsonb: jsonb('jsonb').$type<string[]>(),
			createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		});
		await push({ usersTable });

		await db.execute(
			sql`insert into ${usersTable} (${new Name(usersTable.id.name)}, ${new Name(
				usersTable.name.name,
			)}) values (${1}, ${'John'})`,
		);

		const result = await db.execute<{ id: number; name: string }>(
			sql`select id, name from "users2";`,
		);
		expect(Array.prototype.slice.call(result)).toEqual([{ id: 1, name: 'John' }]);
		await db.execute(sql`drop table ${usersTable};`);
	});

	test('insert via db.execute + returning', async ({ db, push }) => {
		const usersTable = pgTable('users3', {
			id: integer('id' as string).primaryKey(),
			name: text('name').notNull(),
			verified: boolean('verified').notNull().default(false),
			jsonb: jsonb('jsonb').$type<string[]>(),
			createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		});
		await push({ usersTable });

		const result = await db.execute<{ id: number; name: string }>(
			sql`insert into ${usersTable} (${new Name(usersTable.id.name)}, ${new Name(
				usersTable.name.name,
			)}) values (${1}, ${'John'}) returning ${usersTable.id}, ${usersTable.name}`,
		);
		expect(Array.prototype.slice.call(result)).toEqual([{ id: 1, name: 'John' }]);
		await db.execute(sql`drop table ${usersTable};`);
	});

	test('insert via db.execute w/ query builder', async ({ db, push }) => {
		const usersTable = pgTable('users4', {
			id: integer('id' as string).primaryKey(),
			name: text('name').notNull(),
			verified: boolean('verified').notNull().default(false),
			jsonb: jsonb('jsonb').$type<string[]>(),
			createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		});
		await push({ usersTable });
		const result = await db.execute<Pick<typeof usersTable.$inferSelect, 'id' | 'name'>>(
			db.insert(usersTable).values({ id: 1, name: 'John' }).returning({ id: usersTable.id, name: usersTable.name }),
		);
		expect(Array.prototype.slice.call(result)).toEqual([{ id: 1, name: 'John' }]);
		await db.execute(sql`drop table ${usersTable};`);
	});
});

describe('raw sql`` params', () => {
	test('insert -> select roundtrip over json, jsonb and date columns', async ({ db }) => {
		const table = pgTable('raw_sql_params', {
			id: integer('id').primaryKey(),
			json: json('json').$type<{ hello: string }>().notNull(),
			jsonb: jsonb('jsonb').$type<{ foo: string }>().notNull(),
			ts: timestamp('ts', { withTimezone: true, mode: 'date' }).notNull(),
		});

		await db.execute(sql`drop table if exists ${table}`);
		await db.execute(
			sql`create table ${table} (id integer primary key, json json not null, jsonb jsonb not null, ts timestamptz not null)`,
		);

		const jsonValue = { hello: 'world' };
		const jsonbValue = { foo: 'bar' };
		const ts = new Date('2024-03-05T06:07:08.900Z');

		await db.execute(
			sql`insert into ${table} (id, json, jsonb, ts) values (${1}, ${jsonValue}, ${jsonbValue}, ${ts})`,
		);

		expect(await db.select().from(table)).toEqual([{ id: 1, json: jsonValue, jsonb: jsonbValue, ts }]);

		await db.execute(sql`drop table if exists ${table}`);
	});
});

describe('json params', () => {
	test.concurrent('Issue No1504 - postgres-js', async ({ push, db }) => {
		type PropTypes = { [key: string]: any };

		const jsonDbType = customType<{ data: PropTypes }>({
			dataType() {
				return 'jsonb';
			},
			toDriver(value: PropTypes) {
				return sql`${value}::jsonb`;
			},
			fromDriver(value: any): PropTypes {
				return JSON.parse(value);
			},
		});

		const table = pgTable('table', {
			column: jsonDbType('column'),
		});

		await db.execute(sql`DROP TABLE IF EXISTS ${table}`);
		await push({ table });

		await db.insert(table).values({ column: { hello: 'world' } });
		const res = await db
			.select({ value: sql`${table.column} ->> 'hello'` })
			.from(table);
		expect(res).toStrictEqual([{ value: 'world' }]);
	});

	test.concurrent(
		'set json/jsonb fields with strings and retrieve with the ->> operator - postgres-js',
		async ({ db, push }) => {
			const jsonTestTable = pgTable('json_test_25', {
				id: integer('id').primaryKey(),
				json: json('json').notNull(),
				jsonb: jsonb('jsonb').notNull(),
			});

			await push({ jsonTestTable });

			const obj = { string: 'test', number: 123 };
			const { string: testString, number: testNumber } = obj;

			await db.insert(jsonTestTable).values({
				id: 1,
				json: sql`${obj}`,
				jsonb: sql`${obj}`,
			});

			const result = await db
				.select({
					jsonStringField: sql<string>`${jsonTestTable.json}->>'string'`,
					jsonNumberField: sql<string>`${jsonTestTable.json}->>'number'`,
					jsonbStringField: sql<string>`${jsonTestTable.jsonb}->>'string'`,
					jsonbNumberField: sql<string>`${jsonTestTable.jsonb}->>'number'`,
				})
				.from(jsonTestTable);

			expect(result).toStrictEqual([
				{
					jsonStringField: testString,
					jsonNumberField: String(testNumber),
					jsonbStringField: testString,
					jsonbNumberField: String(testNumber),
				},
			]);
		},
	);

	test.concurrent(
		'set json/jsonb fields with strings and retrieve with the -> operator - postgres-js',
		async ({ db, push }) => {
			const jsonTestTable = pgTable('json_test_27', {
				id: integer('id').primaryKey(),
				json: json('json').notNull(),
				jsonb: jsonb('jsonb').notNull(),
			});

			await push({ jsonTestTable });

			const obj = { string: 'test', number: 123 };
			const { string: testString, number: testNumber } = obj;

			await db.insert(jsonTestTable).values({
				id: 1,
				json: sql`${obj}`,
				jsonb: sql`${obj}`,
			});

			const result = await db
				.select({
					jsonStringField: sql<string>`${jsonTestTable.json}->'string'`,
					jsonNumberField: sql<number>`${jsonTestTable.json}->'number'`,
					jsonbStringField: sql<string>`${jsonTestTable.jsonb}->'string'`,
					jsonbNumberField: sql<number>`${jsonTestTable.jsonb}->'number'`,
				})
				.from(jsonTestTable);

			expect(result).toStrictEqual([
				{
					jsonStringField: testString,
					jsonNumberField: testNumber,
					jsonbStringField: testString,
					jsonbNumberField: testNumber,
				},
			]);
		},
	);
});

describe('migrator', () => {
	test('migrator : default migration strategy', async ({ db }) => {
		await db.execute(sql`drop table if exists all_columns`);
		await db.execute(sql`drop table if exists users12`);
		await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

		await migrate(db, { migrationsFolder: './drizzle2/dsql' });

		await db.insert(usersMigratorTable).values({ id: 1, name: 'John', email: 'email' });

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

		await migrate(db, { migrationsFolder: './drizzle2/dsql', migrationsSchema: customSchema });

		// test if the custom migrations table was created
		const { count } = await db.execute(sql`select * from ${sql.identifier(customSchema)}."__drizzle_migrations";`);
		expect(count > 0).toBeTruthy();

		// test if the migrated table are working as expected
		await db.insert(usersMigratorTable).values({ id: 1, name: 'John', email: 'email' });
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

		await migrate(db, { migrationsFolder: './drizzle2/dsql', migrationsTable: customTable });

		// test if the custom migrations table was created
		const { count } = await db.execute(sql`select * from "drizzle".${sql.identifier(customTable)};`);
		expect(count > 0).toBeTruthy();

		// test if the migrated table are working as expected
		await db.insert(usersMigratorTable).values({ id: 1, name: 'John', email: 'email' });
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

		await migrate(db, {
			migrationsFolder: './drizzle2/dsql',
			migrationsTable: customTable,
			migrationsSchema: customSchema,
		});

		// test if the custom migrations table was created
		const { count } = await db.execute(
			sql`select * from ${sql.identifier(customSchema)}.${sql.identifier(customTable)};`,
		);
		expect(count > 0).toBeTruthy();

		// test if the migrated table are working as expected
		await db.insert(usersMigratorTable).values({ id: 1, name: 'John', email: 'email' });
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
		// DSQL can't drop and recreate `public`, so the tables the migrations own go one by one
		await db.execute(sql`drop table if exists all_columns`);
		await db.execute(sql`drop table if exists users12`);

		const migratorRes = await migrate(db, {
			migrationsFolder: './drizzle2/dsql-init',
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
		expect(res[0]?.tableExists).toStrictEqual(false);
	});

	test('migrator : --init - local migrations error', async ({ db }) => {
		const migrationsSchema = 'drzl_migrations_init';
		const migrationsTable = 'drzl_init';

		await db.execute(sql`drop schema if exists ${sql.identifier(migrationsSchema)} cascade;`);
		await db.execute(sql`drop table if exists all_columns`);
		await db.execute(sql`drop table if exists users12`);

		const migratorRes = await migrate(db, {
			migrationsFolder: './drizzle2/dsql',
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
		expect(res[0]?.tableExists).toStrictEqual(false);
	});

	test('migrator : --init - db migrations error', async ({ db }) => {
		const migrationsSchema = 'drzl_migrations_init';
		const migrationsTable = 'drzl_init';

		await db.execute(sql`drop schema if exists ${sql.identifier(migrationsSchema)} cascade;`);
		await db.execute(sql`drop table if exists all_columns`);
		await db.execute(sql`drop table if exists users12`);

		await migrate(db, {
			migrationsFolder: './drizzle2/dsql-init',
			migrationsSchema,
			migrationsTable,
		});

		const migratorRes = await migrate(db, {
			migrationsFolder: './drizzle2/dsql',
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
		expect(res[0]?.tableExists).toStrictEqual(true);
	});

	test('migrator: local migration is unapplied. Migrations timestamp is less than last db migration', async ({ db }) => {
		const users = pgTable('migration_users', {
			id: integer('id').primaryKey(),
			name: text().notNull(),
			email: text().notNull(),
			age: integer(),
		});

		const users2 = pgTable('migration_users2', {
			id: integer('id').primaryKey(),
			name: text().notNull(),
			email: text().notNull(),
			age: integer(),
		});

		await db.execute(sql`drop schema if exists "drizzle" cascade;`);
		await db.execute(sql`drop table if exists ${users}`);
		await db.execute(sql`drop table if exists ${users2}`);

		// create migration directory
		const migrationDir = './migrations/dsql-postgres-js';
		if (existsSync(migrationDir)) rmSync(migrationDir, { recursive: true });
		mkdirSync(migrationDir, { recursive: true });

		// first branch
		mkdirSync(`${migrationDir}/20240101010101_initial`, { recursive: true });
		writeFileSync(
			`${migrationDir}/20240101010101_initial/migration.sql`,
			`CREATE TABLE "migration_users" (\n"id" integer PRIMARY KEY NOT NULL,\n"name" text NOT NULL,\n"email" text NOT NULL\n);`,
		);
		mkdirSync(`${migrationDir}/20240303030303_third`, { recursive: true });
		writeFileSync(
			`${migrationDir}/20240303030303_third/migration.sql`,
			`ALTER TABLE "migration_users" ADD COLUMN "age" integer;`,
		);

		await migrate(db, { migrationsFolder: migrationDir });
		const res1 = await db.insert(users).values({ id: 1, name: 'John', email: '', age: 30 }).returning();

		// second migration was not applied yet
		await expect(db.insert(users2).values({ id: 1, name: 'John', email: '', age: 30 })).rejects.toThrowError();

		// insert migration with earlier timestamp
		mkdirSync(`${migrationDir}/20240202020202_second`, { recursive: true });
		writeFileSync(
			`${migrationDir}/20240202020202_second/migration.sql`,
			`CREATE TABLE "migration_users2" (\n"id" integer PRIMARY KEY NOT NULL,\n"name" text NOT NULL,\n"email" text NOT NULL\n,"age" integer\n);`,
		);
		await migrate(db, { migrationsFolder: migrationDir });

		const res2 = await db.insert(users2).values({ id: 1, name: 'John', email: '', age: 30 }).returning();

		const expected = [{ id: 1, name: 'John', email: '', age: 30 }];
		expect(res1).toStrictEqual(expected);
		expect(res2).toStrictEqual(expected);

		rmSync(migrationDir, { recursive: true });
	});
});
