require('dotenv/config');
const { drizzle } = require('drizzle-orm/postgres-js');
const pg = require('postgres');
const { pg: schema } = require('./schema.cjs');
import { describe, expect } from 'vitest';

if (!process.env['PG_CONNECTION_STRING']) {
	throw new Error('PG_CONNECTION_STRING is not defined');
}

describe('postgres-js', async (it) => {
	it('drizzle(string)', async () => {
		const db = drizzle(process.env['PG_CONNECTION_STRING']);

		await db.$client.unsafe('SELECT 1;');
	});

	it('drizzle(string, config)', async () => {
		const db = drizzle(process.env['PG_CONNECTION_STRING'], {
			schema,
		});

		await db.$client.unsafe('SELECT 1;');

		expect(db._query.User).not.toStrictEqual(undefined);
	});

	it('drizzle({connection: string, ...config})', async () => {
		const db = drizzle({
			connection: process.env['PG_CONNECTION_STRING'],
			schema,
		});

		await db.$client.unsafe('SELECT 1;');

		expect(db._query.User).not.toStrictEqual(undefined);
	});

	it('drizzle({connection: params, ...config})', async () => {
		const db = drizzle({
			connection: {
				url: process.env['PG_CONNECTION_STRING'],
			},
			schema,
		});

		await db.$client.unsafe('SELECT 1;');

		expect(db._query.User).not.toStrictEqual(undefined);
	});

	it('drizzle({ client })', async () => {
		const client = pg(process.env['PG_CONNECTION_STRING']);
		const db = drizzle({ client });

		await db.$client.unsafe('SELECT 1;');
	});

	it('drizzle({client, ...config})', async () => {
		const client = pg(process.env['PG_CONNECTION_STRING']);
		const db = drizzle({
			client,
			schema,
		});

		await db.$client.unsafe('SELECT 1;');

		expect(db._query.User).not.toStrictEqual(undefined);
	});
});
