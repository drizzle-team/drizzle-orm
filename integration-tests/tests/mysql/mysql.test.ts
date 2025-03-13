import retry from 'async-retry';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { drizzle } from 'drizzle-orm/mysql2';
import * as mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { createDockerDB, tests } from './mysql-common';
import relations from './relations';

const ENABLE_LOGGING = false;

let db: MySql2Database<never, typeof relations>;
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
		client = await mysql.createConnection(connectionString);
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
	db = drizzle(client, { logger: ENABLE_LOGGING, relations });
});

afterAll(async () => {
	await client?.end();
});

beforeEach((ctx) => {
	ctx.mysql = {
		db,
	};
});

tests();
