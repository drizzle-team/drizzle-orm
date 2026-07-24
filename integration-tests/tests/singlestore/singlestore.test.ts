import retry from 'async-retry';
import { drizzle } from 'drizzle-orm/singlestore';
import type { SingleStoreDriverDatabase } from 'drizzle-orm/singlestore';
import * as mysql2 from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, vi } from 'vitest';
import { TestCache, TestGlobalCache, tests as cacheTests } from './singlestore-cache';
import { createDockerDB, tests } from './singlestore-common';
import { tests as onErrorTests } from './singlestore-on-error';

const ENABLE_LOGGING = false;

let db: SingleStoreDriverDatabase;
let dbGlobalCached: SingleStoreDriverDatabase;
let cachedDb: SingleStoreDriverDatabase;
let client: mysql2.Connection;
const onErrorFn = vi.fn();
let onErrorDb: SingleStoreDriverDatabase;

beforeAll(async () => {
	let connectionString;
	if (process.env['SINGLESTORE_CONNECTION_STRING']) {
		connectionString = process.env['SINGLESTORE_CONNECTION_STRING'];
	} else {
		const { connectionString: conStr } = await createDockerDB();
		connectionString = conStr;
	}
	client = await retry(async () => {
		client = await mysql2.createConnection({ uri: connectionString, supportBigNumbers: true });
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

	await client.query(`CREATE DATABASE IF NOT EXISTS drizzle;`);
	await client.changeUser({ database: 'drizzle' });
	db = drizzle(client, { logger: ENABLE_LOGGING });
	cachedDb = drizzle(client, { logger: ENABLE_LOGGING, cache: new TestCache() });
	dbGlobalCached = drizzle(client, { logger: ENABLE_LOGGING, cache: new TestGlobalCache() });
	onErrorDb = drizzle(client, { logger: ENABLE_LOGGING, onError: onErrorFn });
});

afterAll(async () => {
	await client?.end();
});

beforeEach((ctx) => {
	ctx.singlestore = {
		db,
	};
	ctx.cachedSingleStore = {
		db: cachedDb,
		dbGlobalCached,
	};
	ctx.onErrorSingleStore = {
		db: onErrorDb,
		onError: onErrorFn,
	};
});

cacheTests();
tests();
onErrorTests();
