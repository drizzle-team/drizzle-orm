require('dotenv/config');
const Database = require('better-sqlite3');
const { drizzle } = require('drizzle-orm/better-sqlite3');
const { sqlite: schema } = require('./schema.cjs');
import { describe, expect } from 'vitest';

describe('better-sqlite3', async (it) => {
	it('drizzle()', async () => {
		const db = drizzle();

		await db.$client.exec('SELECT 1;');

		await db.$client.close();
	});

	it('drizzle(string)', async () => {
		const db = drizzle(':memory:');

		await db.$client.exec('SELECT 1;');

		await db.$client.close();
	});

	it('drizzle(string, config)', async () => {
		const db = drizzle(':memory:', {
			schema,
		});

		await db.$client.exec('SELECT 1;');

		await db.$client.close();

		expect(db._query.User).not.toStrictEqual(undefined);
	});

	it('drizzle({connection: string, ...config})', async () => {
		const db = drizzle({
			connection: ':memory:',
			schema,
		});

		await db.$client.exec('SELECT 1;');

		await db.$client.close();

		expect(db._query.User).not.toStrictEqual(undefined);
	});

	it('drizzle({connection: params, ...config})', async () => {
		const db = drizzle({
			connection: {
				source: ':memory:',
			},
			schema,
		});

		await db.$client.exec('SELECT 1;');

		await db.$client.close();

		expect(db._query.User).not.toStrictEqual(undefined);
	});

	it('drizzle({connection: {}, ...config})', async () => {
		const db = drizzle({
			connection: {},
			schema,
		});

		await db.$client.exec('SELECT 1;');

		await db.$client.close();

		expect(db._query.User).not.toStrictEqual(undefined);
	});

	it('drizzle({...config})', async () => {
		const db = drizzle({
			schema,
		});

		await db.$client.exec('SELECT 1;');

		await db.$client.close();

		expect(db._query.User).not.toStrictEqual(undefined);
	});

	it('drizzle({ client })', async () => {
		const client = new Database(':memory:');
		const db = drizzle({ client });

		await db.$client.exec('SELECT 1;');

		await db.$client.close();
	});

	it('drizzle({client, ...config})', async () => {
		const client = new Database(':memory:');
		const db = drizzle({
			client,
			schema,
		});

		await db.$client.exec('SELECT 1;');

		await db.$client.close();

		expect(db._query.User).not.toStrictEqual(undefined);
	});
});
