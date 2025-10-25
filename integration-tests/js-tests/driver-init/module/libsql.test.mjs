import 'dotenv/config';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { describe, expect } from 'vitest';
import { sqlite as schema } from './schema.mjs';

describe('libsql', async (it) => {
	it('drizzle(string)', async () => {
		const db = drizzle(':memory:');

		await db.$client.execute('SELECT 1;');

		await db.$client.close();
	});

	it('drizzle(string, config)', async () => {
		const db = drizzle(':memory:', {
			schema,
		});

		await db.$client.execute('SELECT 1;');

		await db.$client.close();

		expect(db._query.User).not.toStrictEqual(undefined);
	});

	it('drizzle({connection: string, ...config})', async () => {
		const db = drizzle({
			connection: ':memory:',
			schema,
		});

		await db.$client.execute('SELECT 1;');

		await db.$client.close();

		expect(db._query.User).not.toStrictEqual(undefined);
	});

	it('drizzle({connection: params, ...config})', async () => {
		const db = drizzle({
			connection: {
				url: ':memory:',
			},
			schema,
		});

		await db.$client.execute('SELECT 1;');

		await db.$client.close();

		expect(db._query.User).not.toStrictEqual(undefined);
	});

	it('drizzle({ client })', async () => {
		const client = createClient({
			url: ':memory:',
		});
		const db = drizzle({ client });

		await db.$client.execute('SELECT 1;');

		await db.$client.close();
	});

	it('drizzle({client, ...config})', async () => {
		const client = createClient({
			url: ':memory:',
		});
		const db = drizzle({
			client,
			schema,
		});

		await db.$client.execute('SELECT 1;');

		await db.$client.close();

		expect(db._query.User).not.toStrictEqual(undefined);
	});
});
