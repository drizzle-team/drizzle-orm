import retry from 'async-retry';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { drizzle } from 'drizzle-orm/mysql2';
import * as mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, vi } from 'vitest';
import { createDockerDB, tests } from './mysql-common';
import { TestCache, TestGlobalCache, tests as cacheTests } from './mysql-common-cache';
import { tests as onErrorTests } from './mysql-on-error';

const ENABLE_LOGGING = false;

let db: MySql2Database;
let dbGlobalCached: MySql2Database;
let cachedDb: MySql2Database;
let client: mysql.Connection;
const onErrorFn = vi.fn();
let onErrorDb: MySql2Database;

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
	onErrorDb = drizzle(client, { logger: ENABLE_LOGGING, onError: onErrorFn });
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
	ctx.onErrorMysql = {
		db: onErrorDb,
		onError: onErrorFn,
	};
});

cacheTests();
tests();
onErrorTests();
