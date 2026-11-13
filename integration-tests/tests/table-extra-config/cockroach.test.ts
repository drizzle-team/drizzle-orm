import { cockroachTable, getTableConfig, int4, primaryKey, uniqueIndex } from 'drizzle-orm/cockroach-core';
import { integer as sqliteInteger, sqliteTable, uniqueIndex as sqliteUniqueIndex } from 'drizzle-orm/sqlite-core';
import { describe, expect, test } from 'vitest';

class Unrelated {
	name = 'users_idx';

	on(..._columns: unknown[]) {
		return this;
	}
}

const sqliteUsers = sqliteTable('users', { id: sqliteInteger('id') });
const sqliteIndex = sqliteUniqueIndex('users_idx').on(sqliteUsers.id);

const users = cockroachTable('users', { id: int4('id') }, (t) => [
	uniqueIndex('users_id_idx').on(t.id),
	primaryKey({ columns: [t.id] }),
]);

// @ts-expect-error
const wrapped = cockroachTable('users', { id: int4('id') }, (t) => [{ idIdx: uniqueIndex('users_idx').on(t.id) }]);

// @ts-expect-error
const number = cockroachTable('users', { id: int4('id') }, () => [42]);

// @ts-expect-error
const mimic = cockroachTable('users', { id: int4('id') }, () => [{ name: 'users_idx', columns: ['id'] }]);

// @ts-expect-error
const foreignClass = cockroachTable('users', { id: int4('id') }, () => [new Unrelated()]);

// @ts-expect-error
const foreignDialect = cockroachTable('users', { id: int4('id') }, () => [sqliteIndex]);

describe('cockroach extra config', () => {
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
