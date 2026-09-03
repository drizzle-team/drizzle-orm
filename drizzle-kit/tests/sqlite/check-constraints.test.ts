import { parseTableSQL } from 'src/dialects/sqlite/grammar';
import { describe, expect, test } from 'vitest';

describe('parseTableSQL CHECK constraints', () => {
	test.each(
		[
			[
				'CHECK without whitespace',
				"CREATE TABLE t (a TEXT CHECK(a <> ''), b INTEGER, CHECK (b > 0));",
				[
					{ name: null, value: "a <> ''" },
					{ name: null, value: 'b > 0' },
				],
			],
			[
				'multiple CHECK constraints on one line',
				'CREATE TABLE two (a INTEGER, CHECK (a > 0), CHECK (a < 10));',
				[
					{ name: null, value: 'a > 0' },
					{ name: null, value: 'a < 10' },
				],
			],
			[
				'multiline CHECK constraint',
				'CREATE TABLE multi (b INTEGER, CHECK (\n  b > 0\n));',
				[{ name: null, value: 'b > 0' }],
			],
		] as const,
	)('parses %s', (_, sql, expected) => {
		expect(parseTableSQL(sql).checks).toStrictEqual(expected);
	});

	test('balances nested parentheses without counting quoted parentheses', () => {
		const sql =
			"CREATE TABLE nested (a TEXT, CONSTRAINT [validity check] CHECK (length(a) > 0 AND coalesce(a, ')') <> 'it''s (empty)'));";

		expect(parseTableSQL(sql).checks).toStrictEqual([
			{
				name: 'validity check',
				value: "length(a) > 0 AND coalesce(a, ')') <> 'it''s (empty)'",
			},
		]);
	});

	test('ignores CHECK-like text inside literals and quoted identifiers', () => {
		const sql =
			"CREATE TABLE literals (\"CHECK(fake)\" TEXT DEFAULT 'RECHECK (fake)', note TEXT DEFAULT 'CHECK(other)');";

		expect(parseTableSQL(sql).checks).toStrictEqual([]);
	});

	test('recognizes keywords case-insensitively and unescapes quoted names', () => {
		const sql = 'CREATE TABLE named (a INTEGER, cOnStRaInT "positive ""value" ChEcK(a > 0));';

		expect(parseTableSQL(sql).checks).toStrictEqual([
			{ name: 'positive "value', value: 'a > 0' },
		]);
	});
});
