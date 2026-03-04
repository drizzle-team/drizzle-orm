import 'dotenv/config';
import { neon as pg } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { describe, expect } from 'vitest';
import { pg as schema } from './schema.mjs';

if (!process.env['NEON_CONNECTION_STRING']) {
	throw new Error('NEON_CONNECTION_STRING is not defined');
}

describe('neon-http', async (it) => {
	it('drizzle(string)', async () => {
		const db = drizzle(
			process.env['NEON_CONNECTION_STRING'],
		);

		await db.$client('SELECT 1;');
	});

	it('drizzle(string, config)', async () => {
		const db = drizzle(
			process.env['NEON_CONNECTION_STRING'],
			{
				schema,
			},
		);

		await db.$client('SELECT 1;');

		expect(db._query.User).not.toStrictEqual(undefined);
	});

	it('drizzle({connection: string, ...config})', async () => {
		const db = drizzle({
			connection: process.env['NEON_CONNECTION_STRING'],
			schema,
		});

		await db.$client('SELECT 1;');

		expect(db._query.User).not.toStrictEqual(undefined);
	});

	it('drizzle({connection: params, ...config})', async () => {
		const db = drizzle({
			connection: {
				connectionString: process.env['NEON_CONNECTION_STRING'],
			},
			schema,
		});

		await db.$client('SELECT 1;');

		expect(db._query.User).not.toStrictEqual(undefined);
	});

	it('drizzle({ client })', async () => {
		const client = pg(
			process.env['NEON_CONNECTION_STRING'],
		);
		const db = drizzle({ client });

		await db.$client('SELECT 1;');
	});

	it('drizzle({client, ...config})', async () => {
		const client = pg(
			process.env['NEON_CONNECTION_STRING'],
		);
		const db = drizzle({
			client,
			schema,
		});

		await db.$client('SELECT 1;');

		expect(db._query.User).not.toStrictEqual(undefined);
	});
});
