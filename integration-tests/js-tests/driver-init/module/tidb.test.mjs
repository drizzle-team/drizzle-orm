import 'dotenv/config';
import { connect } from '@tidbcloud/serverless';
import { drizzle } from 'drizzle-orm/tidb-serverless';
import { describe, expect } from 'vitest';
import { mysql as schema } from './schema.mjs';

if (!process.env['TIDB_CONNECTION_STRING']) {
	throw new Error('TIDB_CONNECTION_STRING is not defined');
}

describe('tidb', async (it) => {
	it('drizzle(string)', async () => {
		const db = drizzle(
			process.env['TIDB_CONNECTION_STRING'],
		);

		await db.$client.execute(`SELECT 1`);
	});

	it('drizzle(string, config)', async () => {
		const db = drizzle(
			process.env['TIDB_CONNECTION_STRING'],
			{
				schema,
			},
		);

		await db.$client.execute('SELECT 1;');
		expect(db._query.User).not.toStrictEqual(undefined);
	});

	it('drizzle({connection: string, ...config})', async () => {
		const db = drizzle({
			connection: process.env['TIDB_CONNECTION_STRING'],
			schema,
		});

		await db.$client.execute('SELECT 1;');
		expect(db._query.User).not.toStrictEqual(undefined);
	});

	it('drizzle({connection: params, ...config})', async () => {
		const db = drizzle({
			connection: {
				url: process.env['TIDB_CONNECTION_STRING'],
			},
			schema,
		});

		await db.$client.execute('SELECT 1;');
		expect(db._query.User).not.toStrictEqual(undefined);
	});

	it('drizzle({ client })', async () => {
		const client = connect({
			url: process.env['TIDB_CONNECTION_STRING'],
		});

		const db = drizzle({ client });

		await db.$client.execute('SELECT 1;');
	});

	it('drizzle({client, ...config})', async () => {
		const client = connect({
			url: process.env['TIDB_CONNECTION_STRING'],
		});
		const db = drizzle({
			client,
			schema,
		});

		await db.$client.execute('SELECT 1;');
		expect(db._query.User).not.toStrictEqual(undefined);
	});
});
