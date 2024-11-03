import 'dotenv/config';
import { PGlite as Database } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { describe, expect } from 'vitest';
import { pg as schema } from './schema.mjs';

describe('pglite', async (it) => {
	it('drizzle()', async () => {
		const db = drizzle();

		await db.$client.exec('SELECT 1;');
		await db.$client.close();
	});

	it('drizzle(string)', async () => {
		const db = drizzle('memory://');

		await db.$client.exec('SELECT 1;');
		await db.$client.close();
	});

	it('drizzle(string, config)', async () => {
		const db = drizzle('memory://', {
			schema,
		});

		await db.$client.exec('SELECT 1;');
		await db.$client.close();

		expect(db.query.User).not.toStrictEqual(undefined);
	});

	it('drizzle({connection: {}, ...config})', async () => {
		const db = drizzle({
			connection: {},
			schema,
		});

		await db.$client.exec('SELECT 1;');
		await db.$client.close();

		expect(db.query.User).not.toStrictEqual(undefined);
	});

	it('drizzle({...config})', async () => {
		const db = drizzle({
			schema,
		});

		await db.$client.exec('SELECT 1;');
		await db.$client.close();

		expect(db.query.User).not.toStrictEqual(undefined);
	});

	it('drizzle(client)', async () => {
		const client = new Database('memory://');
		const db = drizzle(client);

		await db.$client.exec('SELECT 1;');
		await db.$client.close();
	});

	it('drizzle(client, config)', async () => {
		const client = new Database('memory://');
		const db = drizzle(client, {
			schema,
		});

		await db.$client.exec('SELECT 1;');
		await db.$client.close();

		expect(db.query.User).not.toStrictEqual(undefined);
	});

	it('drizzle({client, ...config})', async () => {
		const client = new Database('memory://');
		const db = drizzle({
			client,
			schema,
		});

		await db.$client.exec('SELECT 1;');
		await db.$client.close();

		expect(db.query.User).not.toStrictEqual(undefined);
	});
});
