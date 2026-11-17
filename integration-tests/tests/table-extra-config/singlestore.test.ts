import { integer as pgInteger, pgTable, uniqueIndex as pgUniqueIndex } from 'drizzle-orm/pg-core';
import { getTableConfig, int, primaryKey, singlestoreTable, uniqueIndex } from 'drizzle-orm/singlestore-core';
import { describe, expect, test } from 'vitest';

class Unrelated {
	name = 'users_idx';

	on(..._columns: unknown[]) {
		return this;
	}
}

const pgUsers = pgTable('users', { id: pgInteger('id') });
const pgIndex = pgUniqueIndex('users_idx').on(pgUsers.id);

const users = singlestoreTable('users', { id: int('id') }, (t) => [
	uniqueIndex('users_id_idx').on(t.id),
	primaryKey({ columns: [t.id] }),
]);

// @ts-expect-error
const wrapped = singlestoreTable('users', { id: int('id') }, (t) => [{ idIdx: uniqueIndex('users_idx').on(t.id) }]);

// @ts-expect-error
const number = singlestoreTable('users', { id: int('id') }, () => [42]);

// @ts-expect-error
const mimic = singlestoreTable('users', { id: int('id') }, () => [{ name: 'users_idx', columns: ['id'] }]);

// @ts-expect-error
const foreignClass = singlestoreTable('users', { id: int('id') }, () => [new Unrelated()]);

// @ts-expect-error
const foreignDialect = singlestoreTable('users', { id: int('id') }, () => [pgIndex]);

describe('singlestore extra config', () => {
	test('Expected form', () => {
		const config = getTableConfig(users);

		expect(config.indexes).toHaveLength(1);
		expect(config.primaryKeys).toHaveLength(1);
	});

	test('Type mismatch - wrapped object', () => {
		expect(() => getTableConfig(wrapped)).toThrowError(/Invalid extra config value for table "users"/);
		expect(() => getTableConfig(wrapped)).toThrowError(/not wrapped in an object/);
	});

	test('Type mismatch - number', () => {
		expect(() => getTableConfig(number)).toThrowError(
			/Invalid extra config value for table "users": expected an index or constraint builder, but received a number/,
		);
	});

	test('Type mismatch - mimicking object', () => {
		expect(() => getTableConfig(mimic)).toThrowError(
			/expected an index or constraint builder, but received a plain object with keys "name", "columns"/,
		);
	});

	test('Type mismatch - unrelated class', () => {
		expect(() => getTableConfig(foreignClass)).toThrowError(
			/expected an index or constraint builder, but received a plain object with keys "name"/,
		);
	});

	test('Type mismatch - wrong dialect', () => {
		expect(() => getTableConfig(foreignDialect)).toThrowError(
			/Invalid extra config value for table "users": expected an index or constraint builder/,
		);
	});
});
