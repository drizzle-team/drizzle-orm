import 'dotenv/config';
import { Client, neonConfig, Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { describe, expect } from 'vitest';
import ws from 'ws';
import { pg as schema } from './schema.mjs';

neonConfig.webSocketConstructor = ws;

if (!process.env['NEON_CONNECTION_STRING']) {
	throw new Error('NEON_CONNECTION_STRING is not defined');
}

describe('neon-ws', async (it) => {
	it('drizzle(string)', async () => {
		const db = drizzle(
			process.env['NEON_CONNECTION_STRING'],
		);

		await db.$client.query('SELECT 1;');
	});

	it('drizzle(string, config)', async () => {
		const db = drizzle(
			process.env['NEON_CONNECTION_STRING'],
			{
				schema,
			},
		);

		await db.$client.query('SELECT 1;');

		expect(db.query.User).not.toStrictEqual(undefined);
		expect(db.$client).toBeInstanceOf(Pool);
	});

	it('drizzle({connection: string, ...config})', async () => {
		const db = drizzle({
			connection: process.env['NEON_CONNECTION_STRING'],
			schema,
		});

		await db.$client.query('SELECT 1;');

		expect(db.query.User).not.toStrictEqual(undefined);
		expect(db.$client).toBeInstanceOf(Pool);
	});

	it('drizzle({connection: params, ...config})', async () => {
		const db = drizzle({
			connection: {
				connectionString: process.env['NEON_CONNECTION_STRING'],
			},
			schema,
		});

		await db.$client.query('SELECT 1;');

		expect(db.query.User).not.toStrictEqual(undefined);
		expect(db.$client).toBeInstanceOf(Pool);
	});

	it('drizzle(client)', async () => {
		const client = new Pool({
			connectionString: process.env['NEON_CONNECTION_STRING'],
		});
		const db = drizzle(client);

		await db.$client.query('SELECT 1;');

		expect(db.$client).toBeInstanceOf(Pool);
	});

	it('drizzle(client, config)', async () => {
		const client = new Pool({
			connectionString: process.env['NEON_CONNECTION_STRING'],
		});
		const db = drizzle(client, {
			schema,
		});

		await db.$client.query('SELECT 1;');

		expect(db.query.User).not.toStrictEqual(undefined);
		expect(db.$client).toBeInstanceOf(Pool);
	});

	it('drizzle({client, ...config})', async () => {
		const client = new Pool({
			connectionString: process.env['NEON_CONNECTION_STRING'],
		});
		const db = drizzle({
			client,
			schema,
		});

		await db.$client.query('SELECT 1;');

		expect(db.query.User).not.toStrictEqual(undefined);
		expect(db.$client).toBeInstanceOf(Pool);
	});
});

describe('neon-ws:Client', async (it) => {
	it('drizzle(client)', async () => {
		const client = new Client({
			connectionString: process.env['NEON_CONNECTION_STRING'],
		});

		await client.connect();

		const db = drizzle(client);

		await db.$client.query('SELECT 1;');

		expect(db.$client).toBeInstanceOf(Client);
		expect(db.$client).not.toBeInstanceOf(Pool);
	});

	it('drizzle(client, config)', async () => {
		const client = new Client({
			connectionString: process.env['NEON_CONNECTION_STRING'],
		});
		const db = drizzle(client, {
			schema,
		});

		await client.connect();

		await db.$client.query('SELECT 1;');

		expect(db.query.User).not.toStrictEqual(undefined);
		expect(db.$client).toBeInstanceOf(Client);
		expect(db.$client).not.toBeInstanceOf(Pool);
	});

	it('drizzle({client, ...config})', async () => {
		const client = new Client({
			connectionString: process.env['NEON_CONNECTION_STRING'],
		});
		const db = drizzle({
			client,
			schema,
		});

		await client.connect();

		await db.$client.query('SELECT 1;');

		expect(db.query.User).not.toStrictEqual(undefined);
		expect(db.$client).toBeInstanceOf(Client);
		expect(db.$client).not.toBeInstanceOf(Pool);
	});
});

describe('neon-ws:PoolClient', async (it) => {
	it('drizzle(client)', async () => {
		const pool = new Pool({
			connectionString: process.env['NEON_CONNECTION_STRING'],
		});
		const client = await pool.connect();

		const db = drizzle(client);

		await db.$client.query('SELECT 1;');

		client.release();

		expect(db.$client).toBeInstanceOf(Client);
		expect(db.$client).not.toBeInstanceOf(Pool);
	});

	it('drizzle(client, config)', async () => {
		const pool = new Pool({
			connectionString: process.env['NEON_CONNECTION_STRING'],
		});
		const client = await pool.connect();

		const db = drizzle(client, {
			schema,
		});

		await db.$client.query('SELECT 1;');

		client.release();

		expect(db.query.User).not.toStrictEqual(undefined);
		expect(db.$client).toBeInstanceOf(Client);
		expect(db.$client).not.toBeInstanceOf(Pool);
	});

	it('drizzle({client, ...config})', async () => {
		const pool = new Pool({
			connectionString: process.env['NEON_CONNECTION_STRING'],
		});
		const client = await pool.connect();

		const db = drizzle({
			client,
			schema,
		});

		await db.$client.query('SELECT 1;');

		client.release();

		expect(db.query.User).not.toStrictEqual(undefined);
		expect(db.$client).toBeInstanceOf(Client);
		expect(db.$client).not.toBeInstanceOf(Pool);
	});
});
