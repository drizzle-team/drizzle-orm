import { describe, expect, test } from 'vitest';
import { hashQuery } from '~/cache/core/cache.ts';

// @see https://github.com/drizzle-team/drizzle-orm/issues/5842
describe('hashQuery', () => {
	test('null and undefined params produce different cache keys', async () => {
		const query = 'select * from users where id = $1';
		const hashNull = await hashQuery(query, [null]);
		const hashUndefined = await hashQuery(query, [undefined]);
		expect(hashNull).not.toBe(hashUndefined);
	});

	test('same sql with no params and undefined params produce different cache keys', async () => {
		const query = 'select * from users where id = $1';
		const hashNoParams = await hashQuery(query, []);
		const hashUndefined = await hashQuery(query, [undefined]);
		expect(hashNoParams).not.toBe(hashUndefined);
	});

	test('bigint and number params produce different cache keys', async () => {
		const query = 'select * from users where id = $1';
		const hashBigint = await hashQuery(query, [1n]);
		const hashNumber = await hashQuery(query, [1]);
		expect(hashBigint).not.toBe(hashNumber);
	});
});
