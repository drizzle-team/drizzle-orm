import retry from 'async-retry';
import type { PgDatabase, QueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { afterAll, beforeAll, beforeEach } from 'vitest';

import { createDockerDB, tests } from './pg-common';

const ENABLE_LOGGING = false;

let db: PgDatabase<QueryResultHKT>;
let client: Sql;

beforeAll(async () => {
	const connectionString = process.env['PG_CONNECTION_STRING'] ?? await createDockerDB();
	client = await retry(async () => {
		client = postgres(connectionString, {
			max: 1,
			onnotice: () => {
				// disable notices
			},
		});
		await client`select 1`;
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
