import { describe, expect, it } from 'vitest';
import { bigintsToStrings, hashQuery, stringifyForCache } from '~/cache/core/index.ts';

// Regression tests for #6395: drivers such as @effect/sql-pg decode int8/bigserial
// columns as BigInt. `JSON.stringify` (used by `hashQuery` and, internally, by
// `@upstash/redis`) throws `TypeError: Do not know how to serialize a BigInt` on
// such values. Without the `stringifyForCache`/`bigintsToStrings` helpers these
// tests throw at the same call sites the fix touches.

describe.concurrent('stringifyForCache', () => {
	it('serializes BigInt values instead of throwing', ({ expect }) => {
		expect(() => JSON.stringify([1n, 2n])).toThrow(TypeError);
		expect(stringifyForCache([1n, 2n])).toBe('["1","2"]');
	});

	it('leaves non-BigInt values untouched', ({ expect }) => {
		expect(stringifyForCache({ a: 1, b: 'x', c: [true, null] })).toBe(
			JSON.stringify({ a: 1, b: 'x', c: [true, null] }),
		);
	});
});

describe.concurrent('hashQuery with BigInt params', () => {
	it('does not throw on BigInt parameters', async ({ expect }) => {
		await expect(hashQuery('select * from t where id = ?', [9007199254740993n])).resolves.toMatch(/^[0-9a-f]{64}$/);
	});

	it('is deterministic across calls for the same BigInt params', async ({ expect }) => {
		const sql = 'select * from t where a = ? and b = ?';
		const first = await hashQuery(sql, [10n, 20n]);
		const second = await hashQuery(sql, [10n, 20n]);
		expect(first).toBe(second);
	});

	it('produces different hashes for different BigInt values', async ({ expect }) => {
		// Guards against a "fix" that stringifies every BigInt into a single token,
		// which would silently collapse distinct queries onto one cache key.
		const sql = 'select * from t where id = ?';
		const a = await hashQuery(sql, [10n]);
		const b = await hashQuery(sql, [20n]);
		const c = await hashQuery(sql, [10n, 20n]);
		expect(a).not.toBe(b);
		expect(a).not.toBe(c);
		expect(b).not.toBe(c);
	});

	it('matches the hash of the equivalent string-normalized params', async ({ expect }) => {
		// The hash is computed over the BigInt-as-string form, so hashing raw BigInt
		// params must equal hashing them after `bigintsToStrings` normalization.
		const asBigInt = await hashQuery('q', [42n, { id: 7n }]);
		const asString = await hashQuery('q', bigintsToStrings([42n, { id: 7n }]));
		expect(asBigInt).toBe(asString);
	});
});

describe.concurrent('bigintsToStrings', () => {
	it('recursively converts nested BigInts to strings', ({ expect }) => {
		const input = {
			id: 9007199254740993n,
			rows: [{ v: 1n }, { v: 2n }],
			deep: { list: [3n, 'kept', 4] },
		};
		const output = bigintsToStrings(input);
		expect(output).toEqual({
			id: '9007199254740993',
			rows: [{ v: '1' }, { v: '2' }],
			deep: { list: ['3', 'kept', 4] },
		});
		// The result must survive plain JSON.stringify (the @upstash/redis path).
		expect(() => JSON.stringify(output)).not.toThrow();
		expect(() => JSON.stringify(input)).toThrow(TypeError);
	});

	it('passes through primitives unchanged', ({ expect }) => {
		expect(bigintsToStrings(null)).toBe(null);
		expect(bigintsToStrings('abc')).toBe('abc');
		expect(bigintsToStrings(12)).toBe(12);
	});
});
