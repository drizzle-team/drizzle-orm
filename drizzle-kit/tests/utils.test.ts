import { splitExpressions, trimChar } from 'src/utils';
import { expect, test } from 'vitest';

test('trim chars', () => {
	expect.soft(trimChar("'", "'")).toBe("'");
	expect.soft(trimChar("''", "'")).toBe('');
	expect.soft(trimChar("('')", ['(', ')'])).toBe("''");
	expect.soft(trimChar(trimChar("('')", ['(', ')']), "'")).toBe('');
});

test.each([
	['lower(name)', ['lower(name)']],
	['lower(name), upper(name)', ['lower(name)', 'upper(name)']],
	['lower(name), lower(name)', ['lower(name)', 'lower(name)']],
	[`((name || ','::text) || name1)`, [`((name || ','::text) || name1)`]],
	["((name || ','::text) || name1), SUBSTRING(name1 FROM 1 FOR 3)", [
		"((name || ','::text) || name1)",
		'SUBSTRING(name1 FROM 1 FOR 3)',
	]],
	[`((name || ','::text) || name1), COALESCE("name", '"default", value'::text)`, [
		`((name || ','::text) || name1)`,
		`COALESCE("name", '"default", value'::text)`,
	]],
	["COALESCE(name, 'default,'' value'''::text), SUBSTRING(name1 FROM 1 FOR 3)", [
		"COALESCE(name, 'default,'' value'''::text)",
		'SUBSTRING(name1 FROM 1 FOR 3)',
	]],
	["COALESCE(name, 'default,value'''::text), SUBSTRING(name1 FROM 1 FOR 3)", [
		"COALESCE(name, 'default,value'''::text)",
		'SUBSTRING(name1 FROM 1 FOR 3)',
	]],
	["COALESCE(name, 'default,''value'::text), SUBSTRING(name1 FROM 1 FOR 3)", [
		"COALESCE(name, 'default,''value'::text)",
		'SUBSTRING(name1 FROM 1 FOR 3)',
	]],
	["COALESCE(name, 'default,value'::text), SUBSTRING(name1 FROM 1 FOR 3)", [
		"COALESCE(name, 'default,value'::text)",
		'SUBSTRING(name1 FROM 1 FOR 3)',
	]],
	["COALESCE(name, 'default, value'::text), SUBSTRING(name1 FROM 1 FOR 3)", [
		"COALESCE(name, 'default, value'::text)",
		'SUBSTRING(name1 FROM 1 FOR 3)',
	]],
	[`COALESCE("name", '"default", value'::text), SUBSTRING("name1" FROM 1 FOR 3)`, [
		`COALESCE("name", '"default", value'::text)`,
		`SUBSTRING("name1" FROM 1 FOR 3)`,
	]],
	[`COALESCE("namewithcomma,", '"default", value'::text), SUBSTRING("name1" FROM 1 FOR 3)`, [
		`COALESCE("namewithcomma,", '"default", value'::text)`,
		`SUBSTRING("name1" FROM 1 FOR 3)`,
	]],
	["((lower(first_name) || ', '::text) || lower(last_name))", [
		"((lower(first_name) || ', '::text) || lower(last_name))",
	]],
])('split expression %#: %s', (it, expected) => {
	expect(splitExpressions(it)).toStrictEqual(expected);
});
