import { describe, expect, test } from 'vitest';
import { int, sqliteTable, text } from '~/sqlite-core/index.ts';
import { drizzle } from '~/sqlite-proxy/index.ts';
import type { AsyncRemoteCallback } from '~/sqlite-proxy/driver.ts';

const users = sqliteTable('users', {
	id: int('id').primaryKey(),
	name: text('name').notNull(),
});

describe('sqlite-proxy get() with no matching row', () => {
	test('returns undefined when callback returns { rows: undefined }', async () => {
		const callback: AsyncRemoteCallback = async (_sql, _params, _method) => {
			return { rows: undefined };
		};

		const db = drizzle(callback);
		const result = await db.select().from(users).get();

		expect(result).toBeUndefined();
	});

	test('returns undefined when callback returns { rows: [] } for get', async () => {
		const callback: AsyncRemoteCallback = async (_sql, _params, _method) => {
			// Before the fix, returning an empty array for 'get' would cause
			// drizzle to return { id: undefined, name: undefined } instead of undefined
			return { rows: [] };
		};

		const db = drizzle(callback);
		const result = await db.select().from(users).get();

		expect(result).toBeUndefined();
	});

	test('returns the row when callback returns a valid result for get', async () => {
		const callback: AsyncRemoteCallback = async (_sql, _params, _method) => {
			return { rows: [1, 'Alice'] };
		};

		const db = drizzle(callback);
		const result = await db.select().from(users).get();

		expect(result).toEqual({ id: 1, name: 'Alice' });
	});
});
