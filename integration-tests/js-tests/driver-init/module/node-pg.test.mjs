import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { describe, expect } from 'vitest';
import { pg as schema } from './schema.mjs';

const Pool = pg.Pool;
const Client = pg.Client;

if (!process.env['PG_CONNECTION_STRING']) {
	throw new Error('PG_CONNECTION_STRING is not defined');
}

describe('node-pg', async (it) => {
	it('drizzle(string)', async () => {
		const db = drizzle(process.env['PG_CONNECTION_STRING']);

		await db.$client.query('SELECT 1;');

		expect(db.$client).toBeInstanceOf(Pool);
	});

	it('drizzle(string, config)', async () => {
		const db = drizzle(process.env['PG_CONNECTION_STRING'], {
			schema,
		});

		await db.$client.query('SELECT 1;');

		expect(db.$client).toBeInstanceOf(Pool);
		expect(db.query.User).not.toStrictEqual(undefined);
	});

	it('drizzle({connection: string, ...config})', async () => {
		const db = drizzle({
			connection: process.env['PG_CONNECTION_STRING'],
			schema,
		});

		await db.$client.query('SELECT 1;');

		expect(db.$client).toBeInstanceOf(Pool);
		expect(db.query.User).not.toStrictEqual(undefined);
	});

	it('drizzle({connection: params, ...config})', async () => {
		const db = drizzle({
			connection: {
				connectionString: process.env['PG_CONNECTION_STRING'],
			},
			schema,
		});

		await db.$client.query('SELECT 1;');

		expect(db.$client).toBeInstanceOf(Pool);
		expect(db.query.User).not.toStrictEqual(undefined);
	});

	it('drizzle(client)', async () => {
		const client = new Pool({
			connectionString: process.env['PG_CONNECTION_STRING'],
		});
		const db = drizzle(client);

		await db.$client.query('SELECT 1;');

		expect(db.$client).toBeInstanceOf(Pool);
	});

	it('drizzle(client, config)', async () => {
		const client = new Pool({
			connectionString: process.env['PG_CONNECTION_STRING'],
		});
		const db = drizzle(client, {
			schema,
		});

		await db.$client.query('SELECT 1;');

		expect(db.$client).toBeInstanceOf(Pool);
		expect(db.query.User).not.toStrictEqual(undefined);
	});

	it('drizzle({client, ...config})', async () => {
		const client = new Pool({
			connectionString: process.env['PG_CONNECTION_STRING'],
		});
		const db = drizzle({
			client,
			schema,
		});

		await db.$client.query('SELECT 1;');

		expect(db.$client).toBeInstanceOf(Pool);
		expect(db.query.User).not.toStrictEqual(undefined);
	});
});

describe('node-pg:Client', async (it) => {
	it('drizzle(client)', async () => {
		const client = new Client({
			connectionString: process.env['PG_CONNECTION_STRING'],
		});
		const db = drizzle(client);

		await client.connect();

		await db.$client.query('SELECT 1;');

		expect(db.$client).not.toBeInstanceOf(Pool);
		expect(db.$client).toBeInstanceOf(Client);
	});

	it('drizzle(client, config)', async () => {
		const client = new Client({
			connectionString: process.env['PG_CONNECTION_STRING'],
		});
		const db = drizzle(client, {
			schema,
		});

		await client.connect();

		await db.$client.query('SELECT 1;');

		expect(db.$client).not.toBeInstanceOf(Pool);
		expect(db.$client).toBeInstanceOf(Client);
		expect(db.query.User).not.toStrictEqual(undefined);
	});

	it('drizzle({client, ...config})', async () => {
		const client = new Client({
			connectionString: process.env['PG_CONNECTION_STRING'],
		});
		const db = drizzle({
			client,
			schema,
		});

		await client.connect();

		await db.$client.query('SELECT 1;');

		expect(db.$client).not.toBeInstanceOf(Pool);
		expect(db.$client).toBeInstanceOf(Client);
		expect(db.query.User).not.toStrictEqual(undefined);
	});
});

describe('node-pg:PoolClient', async (it) => {
	it('drizzle(client)', async () => {
		const pool = new Pool({
			connectionString: process.env['PG_CONNECTION_STRING'],
		});
		const client = await pool.connect();
		const db = drizzle(client);

		await db.$client.query('SELECT 1;');
		client.release();

		expect(db.$client).not.toBeInstanceOf(Pool);
		expect(db.$client).toBeInstanceOf(Client);
	});

	it('drizzle(client, config)', async () => {
		const pool = new Pool({
			connectionString: process.env['PG_CONNECTION_STRING'],
		});
		const client = await pool.connect();
		const db = drizzle(client, {
			schema,
		});

		await db.$client.query('SELECT 1;');
		client.release();

		expect(db.$client).not.toBeInstanceOf(Pool);
		expect(db.$client).toBeInstanceOf(Client);
		expect(db.query.User).not.toStrictEqual(undefined);
	});

	it('drizzle({client, ...config})', async () => {
		const pool = new Pool({
			connectionString: process.env['PG_CONNECTION_STRING'],
		});
		const client = await pool.connect();
		const db = drizzle({
			client,
			schema,
		});

		await db.$client.query('SELECT 1;');
		client.release();

		expect(db.$client).not.toBeInstanceOf(Pool);
		expect(db.$client).toBeInstanceOf(Client);
		expect(db.query.User).not.toStrictEqual(undefined);
	});
});
