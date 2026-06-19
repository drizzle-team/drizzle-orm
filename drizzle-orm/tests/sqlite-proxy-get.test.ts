import { describe, expect, test } from 'vitest';
import { relations } from '~/relations.ts';
import { int, sqliteTable, text } from '~/sqlite-core/index.ts';
import type { AsyncBatchRemoteCallback, AsyncRemoteCallback } from '~/sqlite-proxy/driver.ts';
import { drizzle } from '~/sqlite-proxy/index.ts';

const users = sqliteTable('users', {
	id: int('id').primaryKey(),
	name: text('name').notNull(),
});

const usersRelations = relations(users, () => ({}));
const schema = { users, usersRelations };

// Proxy implementers naturally return `{ rows: [] }` for a no-row `get` because the
// callback is typed `rows?: any[]`. Native SQLite drivers return `undefined` here, so
// the proxy must treat an empty array the same as `undefined` (regression for #5461).
const emptyRowsGet: AsyncRemoteCallback = async () => ({ rows: [] });
const undefinedRowsGet: AsyncRemoteCallback = async () => ({ rows: undefined });

describe('sqlite-proxy get() with no matching row (#5461)', () => {
	test('select().get() returns undefined when callback returns { rows: undefined }', async () => {
		const db = drizzle(undefinedRowsGet);
		const result = await db.select().from(users).get();

		expect(result).toBeUndefined();
	});

	test('select().get() returns undefined when callback returns { rows: [] }', async () => {
		// Before the fix the empty array was truthy and got mapped field-by-field to
		// { id: undefined, name: undefined } instead of undefined.
		const db = drizzle(emptyRowsGet);
		const result = await db.select().from(users).get();

		expect(result).toBeUndefined();
	});

	test('query.findFirst() returns undefined when callback returns { rows: [] }', async () => {
		// The exact scenario from the issue: findFirst goes through the customResultMapper
		// path, which previously produced { id: undefined }.
		const db = drizzle(emptyRowsGet, { schema });
		const result = await db.query.users.findFirst({ columns: { id: true } });

		expect(result).toBeUndefined();
	});

	test('batch findFirst() returns undefined when callback returns { rows: [] }', async () => {
		// Batch get flows through mapResult(result, true) -> mapGetResult(result, true),
		// a path the get()-level guard did not cover. Centralizing the normalization in
		// mapGetResult fixes it.
		const batchEmpty: AsyncBatchRemoteCallback = async (batch) => batch.map(() => ({ rows: [] }));
		const db = drizzle(emptyRowsGet, batchEmpty, { schema });
		const [result] = await db.batch([db.query.users.findFirst({ columns: { id: true } })]);

		expect(result).toBeUndefined();
	});

	test('select().get() still maps a valid row', async () => {
		const validGet: AsyncRemoteCallback = async () => ({ rows: [1, 'Alice'] });
		const db = drizzle(validGet);
		const result = await db.select().from(users).get();

		expect(result).toEqual({ id: 1, name: 'Alice' });
	});

	test('batch findFirst() still maps a valid row', async () => {
		const validGet: AsyncRemoteCallback = async () => ({ rows: [1, 'Alice'] });
		const batchValid: AsyncBatchRemoteCallback = async (batch) => batch.map(() => ({ rows: [1, 'Alice'] }));
		const db = drizzle(validGet, batchValid, { schema });
		const [result] = await db.batch([db.query.users.findFirst()]);

		expect(result).toEqual({ id: 1, name: 'Alice' });
	});
});
