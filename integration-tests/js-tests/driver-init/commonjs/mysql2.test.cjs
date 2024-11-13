require('dotenv/config');
const { drizzle } = require('drizzle-orm/mysql2');
const { createPool, createConnection, Connection } = require('mysql2');
const { mysql: schema } = require('./schema.cjs');
import { describe, expect } from 'vitest';

if (!process.env['MYSQL_CONNECTION_STRING']) {
	throw new Error('MYSQL_CONNECTION_STRING is not defined');
}

describe('mysql2', async (it) => {
	it('drizzle(string)', async () => {
		const db = drizzle(
			process.env['MYSQL_CONNECTION_STRING'],
		);

		await db.$client.execute(`SELECT 1`);

		expect(db.$client.getConnection).not.toStrictEqual(undefined);
	});

	it('drizzle(string, config)', async () => {
		const db = drizzle(
			process.env['MYSQL_CONNECTION_STRING'],
			{
				schema,
				mode: 'default',
			},
		);
		await db.$client.execute('SELECT 1;');

		expect(db.query.User).not.toStrictEqual(undefined);
		expect(db.$client.getConnection).not.toStrictEqual(undefined);
	});

	it('drizzle({connection: string, ...config})', async () => {
		const db = drizzle({
			connection: process.env['MYSQL_CONNECTION_STRING'],
			schema,
			mode: 'default',
		});

		await db.$client.execute('SELECT 1;');

		expect(db.query.User).not.toStrictEqual(undefined);
		expect(db.$client.getConnection).not.toStrictEqual(undefined);
	});

	it('drizzle({connection: params, ...config})', async () => {
		const db = drizzle({
			connection: {
				uri: process.env['MYSQL_CONNECTION_STRING'],
			},
			schema,
			mode: 'default',
		});

		await db.$client.execute('SELECT 1;');

		expect(db.query.User).not.toStrictEqual(undefined);
		expect(db.$client.getConnection).not.toStrictEqual(undefined);
	});

	it('drizzle(client)', async () => {
		const client = createPool({
			uri: process.env['MYSQL_CONNECTION_STRING'],
		});

		const db = drizzle(client);

		await db.$client.execute('SELECT 1;');

		expect(db.$client.getConnection).not.toStrictEqual(undefined);
	});

	it('drizzle(client, config)', async () => {
		const client = createPool({
			uri: process.env['MYSQL_CONNECTION_STRING'],
		});
		const db = drizzle(client, {
			schema,
			mode: 'default',
		});

		await db.$client.execute('SELECT 1;');

		expect(db.query.User).not.toStrictEqual(undefined);
		expect(db.$client.getConnection).not.toStrictEqual(undefined);
	});

	it('drizzle({client, ...config})', async () => {
		const client = createPool({
			uri: process.env['MYSQL_CONNECTION_STRING'],
		});

		const db = drizzle({
			client,
			schema,
			mode: 'default',
		});

		await db.$client.execute('SELECT 1;');

		expect(db.query.User).not.toStrictEqual(undefined);
		expect(db.$client.getConnection).not.toStrictEqual(undefined);
	});
});

describe('mysql2:connection', async (it) => {
	it('drizzle(client)', async () => {
		const client = createConnection({
			uri: process.env['MYSQL_CONNECTION_STRING'],
		});

		const db = drizzle(client);

		await db.$client.execute('SELECT 1;');

		expect(db.$client.getConnection).toStrictEqual(undefined);
	});

	it('drizzle(client, config)', async () => {
		const client = createConnection({
			uri: process.env['MYSQL_CONNECTION_STRING'],
		});
		const db = drizzle(client, {
			schema,
			mode: 'default',
		});

		await db.$client.execute('SELECT 1;');

		expect(db.query.User).not.toStrictEqual(undefined);
		expect(db.$client.getConnection).toStrictEqual(undefined);
	});

	it('drizzle({client, ...config})', async () => {
		const client = createConnection({
			uri: process.env['MYSQL_CONNECTION_STRING'],
		});

		const db = drizzle({
			client,
			schema,
			mode: 'default',
		});

		await db.$client.execute('SELECT 1;');

		expect(db.query.User).not.toStrictEqual(undefined);
		expect(db.$client.getConnection).toStrictEqual(undefined);
	});
});
