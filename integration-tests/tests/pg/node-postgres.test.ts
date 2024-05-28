import retry from 'async-retry';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { PgDatabase, QueryResultHKT } from 'drizzle-orm/pg-core';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach } from 'vitest';

import { createDockerDB, tests } from './pg-common';

const ENABLE_LOGGING = false;

let db: PgDatabase<QueryResultHKT>;
let client: Client;

beforeAll(async () => {
	const connectionString = process.env['PG_CONNECTION_STRING'] ?? await createDockerDB();
	client = await retry(async () => {
		client = new Client(connectionString);
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
});

afterAll(async () => {
	await client?.end();
});

beforeEach((ctx) => {
	ctx.pg = {
		db,
	};
});

tests();
