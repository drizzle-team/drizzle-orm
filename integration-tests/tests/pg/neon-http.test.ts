import { neon, neonConfig, type NeonQueryFunction } from '@neondatabase/serverless';
import { eq, sql } from 'drizzle-orm';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { pgMaterializedView, pgTable, serial, timestamp } from 'drizzle-orm/pg-core';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { skipTests } from '~/common';
import { randomString } from '~/utils';
import { tests, usersMigratorTable, usersTable } from './pg-common';
import { TestCache, TestGlobalCache, tests as cacheTests } from './pg-common-cache';

const ENABLE_LOGGING = false;

let db: NeonHttpDatabase;
let dbGlobalCached: NeonHttpDatabase;
let cachedDb: NeonHttpDatabase;

beforeAll(async () => {
	const connectionString = process.env['NEON_HTTP_CONNECTION_STRING'];
	if (!connectionString) {
		throw new Error('NEON_CONNECTION_STRING is not defined');
	}

	neonConfig.fetchEndpoint = (host) => {
		const [protocol, port] = host === 'db.localtest.me' ? ['http', 4444] : ['https', 443];
		return `${protocol}://${host}:${port}/sql`;
	};
	const client = neon(connectionString);
	db = drizzle(client, { logger: ENABLE_LOGGING });
	cachedDb = drizzle(client, {
		logger: ENABLE_LOGGING,
		cache: new TestCache(),
	});
	dbGlobalCached = drizzle(client, {
		logger: ENABLE_LOGGING,
		cache: new TestGlobalCache(),
	});
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
]);
tests();
cacheTests();

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

describe('$withAuth tests', (it) => {
	const client = vi.fn();
	const db = drizzle({
		client: client as any as NeonQueryFunction<any, any>,
		schema: {
			usersTable,
		},
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
		await db.$withAuth('rqb').query.usersTable.findFirst().catch(() => null);

		expect(client.mock.lastCall?.[2]).toStrictEqual({ arrayMode: true, fullResults: true, authToken: 'rqb' });
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
		await db.$withAuth(auth('rqb')).query.usersTable.findFirst().catch(() => null);

		expect(client.mock.lastCall?.[2]['authToken']()).toStrictEqual('rqb');
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
		await db.$withAuth(auth('rqb')).query.usersTable.findFirst().catch(() => null);

		expect(client.mock.lastCall?.[2]['authToken']()).toBeInstanceOf(Promise);
		expect(await client.mock.lastCall?.[2]['authToken']()).toStrictEqual('rqb');
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
