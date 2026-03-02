import { neon, neonConfig, Pool as NeonPool } from '@neondatabase/serverless';
import { eq, sql } from 'drizzle-orm';
import { drizzle, type NetlifyDbDatabase } from 'drizzle-orm/netlify-db';
import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import ws from 'ws';
import { skipTests } from '~/common';
import { tests, usersMigratorTable, usersTable } from './pg-common';
import { TestCache, TestGlobalCache, tests as cacheTests } from './pg-common-cache';

const ENABLE_LOGGING = false;

let connectionString: string;
let db: NetlifyDbDatabase;
let dbGlobalCached: NetlifyDbDatabase;
let cachedDb: NetlifyDbDatabase;

beforeAll(async () => {
	connectionString = process.env['NETLIFY_DB_URL']!;
	if (!connectionString) {
		throw new Error('NETLIFY_DB_URL is not defined');
	}

	// WebSocket constructor for Node.js < 22
	if (!neonConfig.webSocketConstructor && typeof WebSocket === 'undefined') {
		neonConfig.webSocketConstructor = ws;
	}

	db = drizzle(connectionString, { logger: ENABLE_LOGGING });
	cachedDb = drizzle(connectionString, {
		logger: ENABLE_LOGGING,
		cache: new TestCache(),
	});
	dbGlobalCached = drizzle(connectionString, {
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

skipTests([
	// No migrator for netlify-db — use the underlying adapter's migrator
	'migrator : default migration strategy',
	'migrator : migrate with custom schema',
	'migrator : migrate with custom table',
	'migrator : migrate with custom table and custom schema',
	// db.execute over HTTP returns results differently from node-postgres;
	// custom versions are provided below
	'insert via db.execute + select via db.execute',
	'insert via db.execute + returning',
	'insert via db.execute w/ query builder',
	// Timestamp formatting differences between HTTP and node-postgres
	'all date and time columns without timezone first case mode string',
	'all date and time columns without timezone third case mode date',
	'test mode string for timestamp with timezone',
	'test mode date for timestamp with timezone',
	'test mode string for timestamp with timezone in UTC timezone',
	'timestamp timezone',
	// Timing-sensitive
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

	// 3. Select as raw query and check that values are the same
	const result2 = await db.execute<{
		id: number;
		timestamp_string: string;
	}>(sql`select * from ${table}`);

	// 3.1 Notice that postgres will return the date in UTC, but it is exactly the same
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

	// 3. Select as raw query and check that values are the same
	const result2 = await db.execute<{
		id: number;
		timestamp_string: string;
	}>(sql`select * from ${table}`);

	// 3.1 Notice that postgres will return the date in UTC, but it is exactly the same
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

	// 3. Select as raw query and check that values are the same
	const result2 = await db.execute<{
		id: number;
		timestamp_string: string;
	}>(sql`select * from ${table}`);

	// 3.1 Notice that postgres will return the date in UTC, but it is exactly the same
	expect(result2.rows).toEqual([{ id: 1, timestamp_string: '2022-01-01 02:00:00.123456+00' }]);

	await db.execute(sql`set time zone '${sql.raw(timezone.rows[0]!.TimeZone)}'`);

	await db.execute(sql`drop table if exists ${table}`);
});

// ─── Netlify DB–specific tests ──────────────────────────────────────────────

const testItems = pgTable('netlify_db_test_items', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	value: integer('value').default(0),
});

async function setupTestTable(database: { execute: (query: any) => Promise<any> }) {
	await database.execute(sql`drop table if exists netlify_db_test_items`);
	await database.execute(sql`
		create table netlify_db_test_items (
			id serial primary key,
			name text not null,
			value integer default 0
		)
	`);
}

async function teardownTestTable(database: { execute: (query: any) => Promise<any> }) {
	await database.execute(sql`drop table if exists netlify_db_test_items`);
}

describe('instantiation paths', () => {
	test('connection string', async () => {
		const testDb = drizzle(connectionString);
		await setupTestTable(testDb);

		await testDb.insert(testItems).values({ name: 'Alice' });
		const rows = await testDb.select().from(testItems);
		expect(rows).toEqual([{ id: 1, name: 'Alice', value: 0 }]);

		await teardownTestTable(testDb);
	});

	test('config with connection string', async () => {
		const testDb = drizzle({ connection: connectionString });
		await setupTestTable(testDb);

		await testDb.insert(testItems).values({ name: 'Bob' });
		const rows = await testDb.select().from(testItems);
		expect(rows).toEqual([{ id: 1, name: 'Bob', value: 0 }]);

		await teardownTestTable(testDb);
	});

	test('config with connection object', async () => {
		const testDb = drizzle({ connection: { connectionString } });
		await setupTestTable(testDb);

		await testDb.insert(testItems).values({ name: 'Charlie' });
		const rows = await testDb.select().from(testItems);
		expect(rows).toEqual([{ id: 1, name: 'Charlie', value: 0 }]);

		await teardownTestTable(testDb);
	});

	test('zero-config via NETLIFY_DB_URL env var', async () => {
		const savedUrl = process.env['NETLIFY_DB_URL'];
		const savedDriver = process.env['NETLIFY_DB_DRIVER'];

		try {
			process.env['NETLIFY_DB_URL'] = connectionString;
			delete process.env['NETLIFY_DB_DRIVER'];

			const testDb = drizzle();
			await setupTestTable(testDb);

			await testDb.insert(testItems).values({ name: 'ZeroConfig' });
			const rows = await testDb.select().from(testItems);
			expect(rows).toEqual([{ id: 1, name: 'ZeroConfig', value: 0 }]);

			await teardownTestTable(testDb);
		} finally {
			process.env['NETLIFY_DB_URL'] = savedUrl;
			process.env['NETLIFY_DB_DRIVER'] = savedDriver;
		}
	});

	test('zero-config with NETLIFY_DB_DRIVER=server uses node-postgres', async () => {
		const savedUrl = process.env['NETLIFY_DB_URL'];
		const savedDriver = process.env['NETLIFY_DB_DRIVER'];

		try {
			process.env['NETLIFY_DB_URL'] = connectionString;
			process.env['NETLIFY_DB_DRIVER'] = 'server';

			const testDb = drizzle();
			await setupTestTable(testDb);

			await testDb.insert(testItems).values({ name: 'ServerMode' });
			const rows = await testDb.select().from(testItems);
			expect(rows).toEqual([{ id: 1, name: 'ServerMode', value: 0 }]);

			await teardownTestTable(testDb);
		} finally {
			process.env['NETLIFY_DB_URL'] = savedUrl;
			process.env['NETLIFY_DB_DRIVER'] = savedDriver;
		}
	});

	test('explicit serverless client', async () => {
		const httpClient = neon(connectionString);
		const pool = new NeonPool({ connectionString });

		const testDb = drizzle({
			client: {
				driver: 'serverless' as const,
				httpClient,
				pool,
				connectionString,
			},
		});
		await setupTestTable(testDb);

		await testDb.insert(testItems).values({ name: 'Serverless' });
		const rows = await testDb.select().from(testItems);
		expect(rows).toEqual([{ id: 1, name: 'Serverless', value: 0 }]);

		await teardownTestTable(testDb);
		await pool.end();
	});

	test('explicit server client', async () => {
		const pool = new pg.Pool({ connectionString });

		const testDb = drizzle({
			client: {
				driver: 'server' as const,
				pool,
				connectionString,
			},
		});
		await setupTestTable(testDb);

		await testDb.insert(testItems).values({ name: 'Server' });
		const rows = await testDb.select().from(testItems);
		expect(rows).toEqual([{ id: 1, name: 'Server', value: 0 }]);

		await teardownTestTable(testDb);
		await pool.end();
	});
});

describe('serverless transport selection', () => {
	test('regular queries and transactions both work in the same session', async () => {
		const testDb = drizzle(connectionString);
		await setupTestTable(testDb);

		// Regular query — goes over HTTP
		await testDb.insert(testItems).values([
			{ name: 'Alice', value: 10 },
			{ name: 'Bob', value: 20 },
		]);

		const beforeTx = await testDb.select().from(testItems).orderBy(testItems.id);
		expect(beforeTx).toHaveLength(2);

		// Transaction — switches to WebSocket
		await testDb.transaction(async (tx) => {
			await tx.update(testItems).set({ value: 100 }).where(eq(testItems.name, 'Alice'));
			await tx.insert(testItems).values({ name: 'Charlie', value: 30 });
		});

		const afterTx = await testDb.select().from(testItems).orderBy(testItems.id);
		expect(afterTx).toHaveLength(3);
		expect(afterTx[0]).toEqual({ id: 1, name: 'Alice', value: 100 });
		expect(afterTx[2]).toEqual({ id: 3, name: 'Charlie', value: 30 });

		await teardownTestTable(testDb);
	});

	test('transaction rollback works', async () => {
		const testDb = drizzle(connectionString);
		await setupTestTable(testDb);

		await testDb.insert(testItems).values({ name: 'Alice', value: 10 });

		try {
			await testDb.transaction(async (tx) => {
				await tx.insert(testItems).values({ name: 'Ghost' });
				throw new Error('intentional rollback');
			});
		} catch (e: any) {
			expect(e.message).toBe('intentional rollback');
		}

		// The rolled-back row should not exist
		const rows = await testDb.select().from(testItems);
		expect(rows).toHaveLength(1);
		expect(rows[0]!.name).toBe('Alice');

		await teardownTestTable(testDb);
	});

	test('nested transactions use savepoints', async () => {
		const testDb = drizzle(connectionString);
		await setupTestTable(testDb);

		await testDb.transaction(async (tx) => {
			await tx.insert(testItems).values({ name: 'Outer' });

			try {
				await tx.transaction(async (tx2) => {
					await tx2.insert(testItems).values({ name: 'Inner - rolled back' });
					throw new Error('inner rollback');
				});
			} catch {
				// inner savepoint rolled back
			}

			await tx.insert(testItems).values({ name: 'After inner rollback' });
		});

		const rows = await testDb.select().from(testItems).orderBy(testItems.id);
		const names = rows.map((r) => r.name);
		expect(names).toContain('Outer');
		expect(names).toContain('After inner rollback');
		expect(names).not.toContain('Inner - rolled back');

		await teardownTestTable(testDb);
	});
});
