import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createDockerDB } from './pg-common';

let pool: pg.Pool;
let db: NodePgDatabase;

beforeAll(async () => {
	let connectionString;
	if (process.env['PG_CONNECTION_STRING']) {
		connectionString = process.env['PG_CONNECTION_STRING'];
	} else {
		const { connectionString: conStr } = await createDockerDB();
		connectionString = conStr;
	}

	// A max:1 pool with a client-side query_timeout makes the leak deterministic.
	pool = new pg.Pool({
		connectionString,
		max: 1,
		query_timeout: 300,
		connectionTimeoutMillis: 5_000,
		idleTimeoutMillis: 0,
	});

	db = drizzle({ client: pool });
});

afterAll(async () => {
	await pool?.end();
});

test('a transaction that hits query_timeout must not poison the pooled client', async () => {
	// 1. A transaction whose statement exceeds query_timeout rejects, as expected.
	// The statement keeps running on the server, so the pooled client is broken.
	await db.transaction(async (tx) => {
		await tx.execute(sql`select pg_sleep(2)`);
	}).catch(() => {});

	// 2. The unrelated query must run on a fresh connection. On the buggy code the
	// broken client is returned to the idle pool, so this fails with
	// "Query read timeout" because it inherits the still-running pg_sleep.
	const after = await db.execute(sql`select 1 as ok`);

	expect(after.rows).toEqual([{ ok: 1 }]);
});
