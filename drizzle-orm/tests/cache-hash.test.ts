import { describe, expect, test } from 'vitest';
import { hashQuery } from '~/cache/core/cache.ts';

// @see https://github.com/drizzle-team/drizzle-orm/issues/5842
// `JSON.stringify` silently coerces `undefined` array elements to `null`.
// Without the replacer in `hashQuery`, `[null]` and `[undefined]` would
// serialise to the identical string `"[null]"` and produce the same SHA-256
// hash, so two structurally different parameter arrays would collide on the
// same cache key and return the cached result of the other query.
describe('hashQuery', () => {
	test('produces different hashes for [null] and [undefined] params', async () => {
		const sql = 'SELECT * FROM users WHERE id = ?';
		const hashNull = await hashQuery(sql, [null]);
		const hashUndefined = await hashQuery(sql, [undefined]);
		expect(hashNull).not.toBe(hashUndefined);
	});

	test('produces different hashes for [] and [undefined] params', async () => {
		const sql = 'SELECT * FROM users WHERE id IN ?';
		const hashEmpty = await hashQuery(sql, []);
		const hashUndefined = await hashQuery(sql, [undefined]);
		expect(hashEmpty).not.toBe(hashUndefined);
	});

	test('produces stable hashes for repeated calls (regression guard)', async () => {
		const sql = 'SELECT * FROM users WHERE id = ?';
		const a = await hashQuery(sql, [42]);
		const b = await hashQuery(sql, [42]);
		expect(a).toBe(b);
	});
});
