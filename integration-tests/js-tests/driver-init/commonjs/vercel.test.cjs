require('dotenv/config');
const vc = require('@vercel/postgres');
const { drizzle } = require('drizzle-orm/vercel-postgres');
const { pg: schema } = require('./schema.cjs');
import { describe, expect } from 'vitest';
const { sql, createClient, createPool } = vc;

const Pool = vc.VercelPool;
const Client = vc.VercelClient;

if (!process.env['VERCEL_CONNECTION_STRING']) {
	throw new Error('VERCEL_CONNECTION_STRING is not defined');
}

// Used for non-pooled connection
if (!process.env['NEON_CONNECTION_STRING']) {
	throw new Error('NEON_CONNECTION_STRING is not defined');
}
process.env['POSTGRES_URL'] = process.env['VERCEL_CONNECTION_STRING'];

describe('vercel:sql', async (it) => {
	it('drizzle()', async () => {
		const db = drizzle();

		await sql.connect();

		await db.$client.query('SELECT 1;');

		expect(db.$client).toBeTypeOf('function');
	});

	it('drizzle(client)', async () => {
		const db = drizzle(sql);

		await db.$client.query('SELECT 1;');

		expect(db.$client).toBeTypeOf('function');
	});

	it('drizzle(client, config)', async () => {
		const db = drizzle(sql, {
			schema,
		});

		await db.$client.query('SELECT 1;');

		expect(db.$client).toBeTypeOf('function');
		expect(db.query.User).not.toStrictEqual(undefined);
	});

	it('drizzle({client, ...config})', async () => {
		const db = drizzle({
			client: sql,
			schema,
		});

		await db.$client.query('SELECT 1;');

		expect(db.$client).toBeTypeOf('function');
		expect(db.query.User).not.toStrictEqual(undefined);
	});

	it('drizzle({...config})', async () => {
		const db = drizzle({
			schema,
		});

		await db.$client.query('SELECT 1;');

		expect(db.$client).toBeTypeOf('function');
		expect(db.query.User).not.toStrictEqual(undefined);
	});
});

describe('vercel:Pool', async (it) => {
	it('drizzle(client)', async () => {
		const client = createPool({
			connectionString: process.env['VERCEL_CONNECTION_STRING'],
		});
		const db = drizzle(client);

		await db.$client.query('SELECT 1;');

		expect(db.$client).not.toBeTypeOf('function');
		expect(db.$client).toBeInstanceOf(Pool);
	});

	it('drizzle(client, config)', async () => {
		const client = createPool({
			connectionString: process.env['VERCEL_CONNECTION_STRING'],
		});
		const db = drizzle(client, {
			schema,
		});

		await db.$client.query('SELECT 1;');

		expect(db.$client).not.toBeTypeOf('function');
		expect(db.$client).toBeInstanceOf(Pool);
		expect(db.query.User).not.toStrictEqual(undefined);
	});

	it('drizzle({client, ...config})', async () => {
		const client = createPool({
			connectionString: process.env['VERCEL_CONNECTION_STRING'],
		});
		const db = drizzle({
			client: client,
			schema,
		});

		await db.$client.query('SELECT 1;');

		expect(db.$client).not.toBeTypeOf('function');
		expect(db.$client).toBeInstanceOf(Pool);
		expect(db.query.User).not.toStrictEqual(undefined);
	});
});

describe('vercel:Client', async (it) => {
	it('drizzle(client)', async () => {
		const client = createClient({
			connectionString: process.env['NEON_CONNECTION_STRING'],
		});
		const db = drizzle(client);

		await client.connect();

		await db.$client.query('SELECT 1;');

		expect(db.$client).not.toBeTypeOf('function');
		expect(db.$client).not.toBeInstanceOf(Pool);
		expect(db.$client).toBeInstanceOf(Client);
	});

	it('drizzle(client, config)', async () => {
		const client = createClient({
			connectionString: process.env['NEON_CONNECTION_STRING'],
		});
		const db = drizzle(client, {
			schema,
		});

		await client.connect();

		await db.$client.query('SELECT 1;');

		expect(db.$client).not.toBeTypeOf('function');
		expect(db.$client).not.toBeInstanceOf(Pool);
		expect(db.$client).toBeInstanceOf(Client);
		expect(db.query.User).not.toStrictEqual(undefined);
	});

	it('drizzle({client, ...config})', async () => {
		const client = createClient({
			connectionString: process.env['NEON_CONNECTION_STRING'],
		});
		const db = drizzle({
			client: client,
			schema,
		});

		await client.connect();

		await db.$client.query('SELECT 1;');

		expect(db.$client).not.toBeTypeOf('function');
		expect(db.$client).not.toBeInstanceOf(Pool);
		expect(db.$client).toBeInstanceOf(Client);
		expect(db.query.User).not.toStrictEqual(undefined);
	});
});

describe('vercel:PoolClient', async (it) => {
	it('drizzle(client)', async () => {
		const pool = createPool({
			connectionString: process.env['VERCEL_CONNECTION_STRING'],
		});
		const client = await pool.connect();

		const db = drizzle(client);

		await db.$client.query('SELECT 1;');
		client.release();

		expect(db.$client).not.toBeTypeOf('function');
		expect(db.$client).not.toBeInstanceOf(Pool);
		expect(db.$client).toBeInstanceOf(Client);
	});

	it('drizzle(client, config)', async () => {
		const pool = createPool({
			connectionString: process.env['VERCEL_CONNECTION_STRING'],
		});
		const client = await pool.connect();

		const db = drizzle(client, {
			schema,
		});

		await db.$client.query('SELECT 1;');
		client.release();

		expect(db.$client).not.toBeTypeOf('function');
		expect(db.$client).not.toBeInstanceOf(Pool);
		expect(db.$client).toBeInstanceOf(Client);
		expect(db.query.User).not.toStrictEqual(undefined);
	});

	it('drizzle({client, ...config})', async () => {
		const pool = createPool({
			connectionString: process.env['VERCEL_CONNECTION_STRING'],
		});
		const client = await pool.connect();

		const db = drizzle({
			client: client,
			schema,
		});

		await db.$client.query('SELECT 1;');
		client.release();

		expect(db.$client).not.toBeTypeOf('function');
		expect(db.$client).not.toBeInstanceOf(Pool);
		expect(db.$client).toBeInstanceOf(Client);
		expect(db.query.User).not.toStrictEqual(undefined);
	});
});
