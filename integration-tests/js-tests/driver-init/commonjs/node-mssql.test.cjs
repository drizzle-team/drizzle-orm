require('dotenv/config');
const { drizzle } = require('drizzle-orm/node-mssql');
const mssql = require('mssql');
const { mssql: schema } = require('./schema.cjs');
import { afterAll, beforeAll, describe, expect } from 'vitest';
import { createDockerDB } from '../../../tests/mssql/mssql-common.ts';

const Pool = mssql.ConnectionPool;
let container;
let connectionString;

describe('node-mssql', async (it) => {
	beforeAll(async () => {
		if (process.env['MSSQL_CONNECTION_STRING']) {
			connectionString = process.env['MSSQL_CONNECTION_STRING'];
		} else {
			const { connectionString: conStr, container: contrainerObj } = await createDockerDB();
			container = contrainerObj;
			connectionString = conStr;
		}

		while (true) {
			try {
				await mssql.connect(connectionString);
				break;
			} catch (e) {
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		}
	});

	afterAll(async () => {
		await container?.stop();
	});

	it('drizzle(string)', async () => {
		const db = drizzle(connectionString);

		const awaitedPool = await db.$client;

		await awaitedPool.query('SELECT 1;');

		expect(awaitedPool).toBeInstanceOf(Pool);
	});

	it('drizzle(string, config)', async () => {
		const db = drizzle(connectionString, {
			schema,
		});

		const awaitedPool = await db.$client;

		await awaitedPool.query('SELECT 1;');

		expect(awaitedPool).toBeInstanceOf(Pool);
		// expect(db.query.User).not.toStrictEqual(undefined);
	});

	it('drizzle({connection: string, ...config})', async () => {
		const db = drizzle({
			connection: connectionString,
			schema,
		});

		const awaitedPool = await db.$client;

		await awaitedPool.query('SELECT 1;');

		expect(awaitedPool).toBeInstanceOf(Pool);
		// expect(db.query.User).not.toStrictEqual(undefined);
	});

	it('drizzle({ client })', async () => {
		const client = await mssql.connect(connectionString);
		const db = drizzle({ client });

		await db.$client.query('SELECT 1;');

		expect(db.$client).toBeInstanceOf(Pool);
	});

	it('drizzle({ client, ...config })', async () => {
		const client = await mssql.connect(connectionString);
		const db = drizzle({ client, schema });

		await db.$client.query('SELECT 1;');

		expect(db.$client).toBeInstanceOf(Pool);
		// expect(db.query.User).not.toStrictEqual(undefined);
	});
});
