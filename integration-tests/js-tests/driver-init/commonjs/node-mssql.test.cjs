require('dotenv/config');
const { drizzle } = require('drizzle-orm/node-mssql');
const mssql = require('mssql');
const { mssql: schema } = require('./schema.cjs');
import { describe, expect } from 'vitest';

const Pool = mssql.ConnectionPool;

if (!process.env['MSSQL_CONNECTION_STRING']) {
	throw new Error('MSSQL_CONNECTION_STRING is not defined');
}

describe('node-mssql', async (it) => {
	it('drizzle(string)', async () => {
		const db = drizzle(process.env['MSSQL_CONNECTION_STRING']);

		const awaitedPool = await db.$client;

		await awaitedPool.query('SELECT 1;');

		expect(awaitedPool).toBeInstanceOf(Pool);
	});

	it('drizzle(string, config)', async () => {
		const db = drizzle(process.env['MSSQL_CONNECTION_STRING'], {
			schema,
		});

		const awaitedPool = await db.$client;

		await awaitedPool.query('SELECT 1;');

		expect(awaitedPool).toBeInstanceOf(Pool);
		// expect(db.query.User).not.toStrictEqual(undefined);
	});

	it('drizzle({connection: string, ...config})', async () => {
		const db = drizzle({
			connection: process.env['MSSQL_CONNECTION_STRING'],
			schema,
		});

		const awaitedPool = await db.$client;

		await awaitedPool.query('SELECT 1;');

		expect(awaitedPool).toBeInstanceOf(Pool);
		// expect(db.query.User).not.toStrictEqual(undefined);
	});

	it('drizzle(client)', async () => {
		const client = await mssql.connect(process.env['MSSQL_CONNECTION_STRING']);
		const db = drizzle(client);

		await db.$client.query('SELECT 1;');

		expect(db.$client).toBeInstanceOf(Pool);
	});

	it('drizzle(client, config)', async () => {
		const client = await mssql.connect(process.env['MSSQL_CONNECTION_STRING']);
		const db = drizzle(client, {
			schema,
		});

		await db.$client.query('SELECT 1;');

		expect(db.$client).toBeInstanceOf(Pool);
		// expect(db.query.User).not.toStrictEqual(undefined);
	});
});
