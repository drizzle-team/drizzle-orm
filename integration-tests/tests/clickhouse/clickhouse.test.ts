import { createClient } from '@clickhouse/client';
import type { ClickHouseClient } from '@clickhouse/client';
import retry from 'async-retry';
import { drizzle } from 'drizzle-orm/clickhouse';
import type { ClickHouseDriverDatabase } from 'drizzle-orm/clickhouse';
import { afterAll, beforeAll } from 'vitest';
import { createDockerDB, tests } from './clickhouse-common';

const ENABLE_LOGGING = false;

let db: ClickHouseDriverDatabase;
let client: ClickHouseClient;

beforeAll(async () => {
	const url = process.env['CLICKHOUSE_CONNECTION_STRING'] ?? (await createDockerDB()).url;

	client = await retry(async () => {
		const candidate = createClient({ url, database: 'default' });
		// `ping` is the cheapest way to find out whether the server is accepting queries yet.
		const result = await candidate.ping();
		if (!result.success) throw new Error('ClickHouse is not ready');
		return candidate;
	}, {
		retries: 20,
		factor: 1,
		minTimeout: 250,
		maxTimeout: 250,
		randomize: false,
	});

	await client.command({ query: 'create database if not exists drizzle' });
	await client.close();

	client = createClient({ url, database: 'drizzle' });
	db = drizzle(client, { logger: ENABLE_LOGGING });
});

afterAll(async () => {
	await client?.close();
});

tests(() => db);
