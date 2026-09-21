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

const binaryBufferTable = mysqlTable('binary_buffer_test', {
	binaryBuffer: binary('binary_buffer', { length: 4, mode: 'buffer' }).notNull(),
	varbinaryBuffer: varbinary('varbinary_buffer', { length: 4, mode: 'buffer' }).notNull(),
});

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

test('binary and varbinary buffer modes preserve mysql2 bytes', async () => {
	await db.execute(sql`drop table if exists binary_buffer_test`);
	await db.execute(sql`
		create table binary_buffer_test (
			binary_buffer binary(4) not null,
			varbinary_buffer varbinary(4) not null
		)
	`);

	try {
		const bytes = Buffer.from([0xff, 0xfe, 0xfd, 0x00]);
		await db.insert(binaryBufferTable).values({
			binaryBuffer: bytes,
			varbinaryBuffer: bytes,
		});

		const [row] = await db.select().from(binaryBufferTable);
		expect(Buffer.isBuffer(row!.binaryBuffer)).toBe(true);
		expect(Buffer.isBuffer(row!.varbinaryBuffer)).toBe(true);
		expect(row!.binaryBuffer).toEqual(bytes);
		expect(row!.varbinaryBuffer).toEqual(bytes);
	} finally {
		await db.execute(sql`drop table if exists binary_buffer_test`);
	}
});

cacheTests();
tests();
