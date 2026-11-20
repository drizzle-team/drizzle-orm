import postgres from 'postgres';
import { describe, expect, test } from 'vitest';
import { drizzle } from '~/postgres-js/driver.ts';

const connection = 'postgres://test_user@intended-db.invalid:6543/test_database';

describe('postgres-js initialization', () => {
	// postgres.js connects lazily. These tests only construct clients and never execute queries.
	test.each([false, true])('rejects a positional client (with config: %s)', async (withConfig) => {
		const client = postgres(connection);
		try {
			const initialize = () => {
				if (withConfig) {
					// @ts-expect-error Exercise the removed JavaScript API at runtime.
					return drizzle(client, { logger: false });
				}
				// @ts-expect-error Exercise the removed JavaScript API at runtime.
				return drizzle(client);
			};
			expect(initialize).toThrowError(TypeError);
			expect(initialize).toThrowError('Use drizzle({ client }) instead.');
		} finally {
			await client.end();
		}
	});

	test('reuses an explicit client', async () => {
		const client = postgres(connection);
		try {
			expect(drizzle({ client }).$client).toBe(client);
		} finally {
			await client.end();
		}
	});

	test.each([
		{ name: 'a connection string', initialize: () => drizzle(connection) },
		{ name: 'a connection string and config', initialize: () => drizzle(connection, { logger: false }) },
		{ name: 'a connection property', initialize: () => drizzle({ connection }) },
		{ name: 'connection options', initialize: () => drizzle({ connection: { url: connection, max: 1 } }) },
	])('accepts $name', async ({ initialize }) => {
		const db = initialize();
		try {
			expect(db.$client.options.host).toEqual(['intended-db.invalid']);
			expect(db.$client.options.port).toEqual([6543]);
		} finally {
			await db.$client.end();
		}
	});

	test('accepts empty connection options', async () => {
		const db = drizzle({ connection: {} });
		await db.$client.end();
	});
});
