import retry from 'async-retry';
import { sql } from 'drizzle-orm';
import { binary, mysqlTable, varbinary } from 'drizzle-orm/mysql-core';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { drizzle } from 'drizzle-orm/mysql2';
import * as mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createDockerDB, tests } from './mysql-common';
import { TestCache, TestGlobalCache, tests as cacheTests } from './mysql-common-cache';

const ENABLE_LOGGING = false;

let db: MySql2Database;
let dbGlobalCached: MySql2Database;
let cachedDb: MySql2Database;
let client: mysql.Connection;

beforeAll(async () => {
	let connectionString;
	if (process.env['MYSQL_CONNECTION_STRING']) {
		connectionString = process.env['MYSQL_CONNECTION_STRING'];
	} else {
		const { connectionString: conStr } = await createDockerDB();
		connectionString = conStr;
	}
	client = await retry(async () => {
		client = await mysql.createConnection({
			uri: connectionString!,
			supportBigNumbers: true,
		});
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
	db = drizzle(client, { logger: ENABLE_LOGGING });
	cachedDb = drizzle(client, { logger: ENABLE_LOGGING, cache: new TestCache() });
	dbGlobalCached = drizzle(client, { logger: ENABLE_LOGGING, cache: new TestGlobalCache() });
});

afterAll(async () => {
	await client?.end();
});

beforeEach((ctx) => {
	ctx.mysql = {
		db,
	};
	ctx.cachedMySQL = {
		db: cachedDb,
		dbGlobalCached,
	};
});

test('binary and varbinary preserve non-UTF-8 bytes', async () => {
	const table = mysqlTable('binary_buffer_mysql2', {
		binary: binary('binary', { length: 4 }).notNull(),
		varbinary: varbinary('varbinary', { length: 4 }).notNull(),
	});
	const value = Buffer.from([0x00, 0xff, 0x80, 0x31]);

	await db.execute(sql`drop table if exists ${table}`);
	await db.execute(sql`create table ${table} (binary binary(4) not null, varbinary varbinary(4) not null)`);
	await db.insert(table).values({ binary: value, varbinary: value });

	const [row] = await db.select().from(table);

	expect(Buffer.isBuffer(row!.binary)).toBe(true);
	expect(Buffer.isBuffer(row!.varbinary)).toBe(true);
	expect(row!.binary).toEqual(value);
	expect(row!.varbinary).toEqual(value);

	await db.execute(sql`drop table ${table}`);
});

cacheTests();
tests();