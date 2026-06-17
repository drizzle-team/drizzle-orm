import { Schema } from 'effect';
import { describe, expect, test } from 'vitest';
import { createSelectSchema } from '~/effect-schema';
import { getTableConfig, SQLiteTable, sqliteTable, sqliteTableCreator, text } from '~/sqlite-core';

describe('SQLite Effect Schema', () => {
	test('derives schemas for strict tables', () => {
		const users = sqliteTable.strict('users', {
			name: text({ length: 3 }).notNull(),
		});
		const schema = createSelectSchema(users);

		expect(getTableConfig(users).isStrict).toBe(true);
		expect(Schema.decodeUnknownSync(schema)({ name: 'abc' })).toEqual({ name: 'abc' });
		expect(() => Schema.decodeUnknownSync(schema)({ name: 'abcd' })).toThrow();
	});

	test('preserves strict mode through custom table creators', () => {
		const prefixedTable = sqliteTableCreator((name) => `app_${name}`);
		const users = prefixedTable.strict('users', {
			name: text().notNull(),
		});

		expect(getTableConfig(users)).toMatchObject({
			name: 'app_users',
			isStrict: true,
		});
	});

	test('defaults mixed-version table metadata to non-strict', () => {
		const users = sqliteTable('users', {
			name: text().notNull(),
		});
		Reflect.deleteProperty(users, SQLiteTable.Symbol.Strict);

		expect(getTableConfig(users).isStrict).toBe(false);
	});
});
