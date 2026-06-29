import { parseDefault } from 'src/dialects/mssql/grammar';
import { expect, test } from 'vitest';

// Regression test for https://github.com/drizzle-team/drizzle-orm/issues/5726
// `drizzle-kit pull` crashed with "Cannot read properties of null (reading 'replace')"
// when a decimal (or any numeric) column had a null definition in sys.default_constraints.
test.each([
	'decimal',
	'decimal(18,2)',
	'numeric',
	'numeric(10,0)',
	'int',
	'tinyint',
	'smallint',
	'bigint',
	'float',
	'real',
])('parseDefault(%s, null) returns null without throwing', (type) => {
	expect(parseDefault(type, null)).toBeNull();
});

test.each([
	['decimal', '((3.14))', '((3.14))'],
	['numeric', '((100))', '((100))'],
	['int', '((10))', '((10))'],
	['float', '((1.5))', '((1.5))'],
])('parseDefault(%s, %s) still works correctly', (type, input, expected) => {
	expect(parseDefault(type, input)).toBe(expected);
});
