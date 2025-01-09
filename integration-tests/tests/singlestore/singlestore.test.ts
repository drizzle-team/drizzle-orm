import retry from 'async-retry';
import { drizzle } from 'drizzle-orm/singlestore';
import type { SingleStoreDriverDatabase } from 'drizzle-orm/singlestore';
import * as mysql2 from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { createDockerDB, tests } from './singlestore-common';

const ENABLE_LOGGING = false;

let db: SingleStoreDriverDatabase;
let client: mysql2.Connection;

beforeAll(async () => {
	let connectionString;
	if (process.env['SINGLESTORE_CONNECTION_STRING']) {
		connectionString = process.env['SINGLESTORE_CONNECTION_STRING'];
	} else {
		const { connectionString: conStr } = await createDockerDB();
		connectionString = conStr;
	}
	client = await retry(async () => {
		client = await mysql2.createConnection(connectionString);
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
});

afterAll(async () => {
	await client?.end();
});

beforeEach((ctx) => {
	ctx.singlestore = {
		db,
	};
});

tests();
