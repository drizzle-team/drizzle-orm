import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-mssql';
import { ConnectionPool as Pool } from 'mssql';
import { expect } from 'vitest';
import { test } from '../../../tests/mssql/instrumentation';
import * as schema from './schema.mjs';

test('mssql:drizzle(string)', async ({ url2 }) => {
	const db = drizzle(url2);

	const awaitedPool = await db.$client;

	await awaitedPool.query('SELECT 1;');

	expect(awaitedPool).toBeInstanceOf(Pool);
});

test('mssql:drizzle(string, config)', async ({ url2 }) => {
	const db = drizzle(url2, {
		schema,
	});

	const awaitedPool = await db.$client;

	await awaitedPool.query('SELECT 1;');

	expect(awaitedPool).toBeInstanceOf(Pool);
	// expect(db.query.User).not.toStrictEqual(undefined);
});

test('mssql:drizzle({connection: string, ...config})', async ({ url2 }) => {
	const db = drizzle({
		connection: url2,
		schema,
	});

	const awaitedPool = await db.$client;

	await awaitedPool.query('SELECT 1;');

	expect(awaitedPool).toBeInstanceOf(Pool);
	// expect(db.query.User).not.toStrictEqual(undefined);
});

test('mssql:drizzle(client)', async ({ url, client }) => {
	const db = drizzle(client);

	await db.$client.query('SELECT 1;');

	expect(db.$client).toBeInstanceOf(Pool);
});

test('mssql:drizzle(client, config)', async ({ url, client }) => {
	const db = drizzle(client, {
		schema,
	});

	await db.$client.query('SELECT 1;');

	expect(db.$client).toBeInstanceOf(Pool);
	// expect(db.query.User).not.toStrictEqual(undefined);
});
