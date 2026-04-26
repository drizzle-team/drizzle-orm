import { describe, it } from 'vitest';
import { makePgComposite, parsePgComposite } from '~/pg-core/utils/composite.ts';

describe.concurrent('parsePgComposite', () => {
	it('parses zero-field composite', ({ expect }) => {
		expect(parsePgComposite('()')).toEqual([]);
	});

	it('parses simple unquoted fields', ({ expect }) => {
		expect(parsePgComposite('(1,2,3)')).toEqual(['1', '2', '3']);
	});

	it('parses single-field composite', ({ expect }) => {
		expect(parsePgComposite('(42)')).toEqual(['42']);
	});

	it('treats empty unquoted fields as NULL', ({ expect }) => {
		expect(parsePgComposite('(,)')).toEqual([null, null]);
		expect(parsePgComposite('(1,,3)')).toEqual(['1', null, '3']);
		expect(parsePgComposite('(,1)')).toEqual([null, '1']);
		expect(parsePgComposite('(1,)')).toEqual(['1', null]);
	});

	it('preserves empty string when quoted', ({ expect }) => {
		expect(parsePgComposite('(1,"",3)')).toEqual(['1', '', '3']);
	});

	it('parses quoted strings with embedded commas', ({ expect }) => {
		expect(parsePgComposite('(1,"hello, world",3)')).toEqual(['1', 'hello, world', '3']);
	});

	it('parses quoted strings with embedded parens', ({ expect }) => {
		expect(parsePgComposite('(1,"(nested)",3)')).toEqual(['1', '(nested)', '3']);
	});

	it('parses doubled-double-quote escapes ("")', ({ expect }) => {
		expect(parsePgComposite('(1,"he said ""hi""",3)')).toEqual(['1', 'he said "hi"', '3']);
	});

	it('parses backslash-escaped double quotes (\\")', ({ expect }) => {
		expect(parsePgComposite('(1,"he said \\"hi\\"",3)')).toEqual(['1', 'he said "hi"', '3']);
	});

	it('parses backslash-escaped backslashes (\\\\)', ({ expect }) => {
		expect(parsePgComposite('(1,"a\\\\b",3)')).toEqual(['1', 'a\\b', '3']);
	});

	it('parses unquoted fields with backslash escapes', ({ expect }) => {
		// Unquoted backslash escapes are unusual but valid: PG passes the next char through.
		expect(parsePgComposite('(a\\,b,c)')).toEqual(['a,b', 'c']);
	});

	it('parses nested composite (already-quoted by PG)', ({ expect }) => {
		// `(1,(2,3))` arrives from PG as `(1,"(2,3)")` — outer composite quotes the inner.
		const fields = parsePgComposite('(1,"(2,3)")');
		expect(fields).toEqual(['1', '(2,3)']);
		// The caller would recursively parse fields[1] for nested composites:
		expect(parsePgComposite(fields[1]!)).toEqual(['2', '3']);
	});

	it('parses doubly-nested composite', ({ expect }) => {
		// `(1,(2,(3,4)))` → outer quotes once, inner quotes again with escaping
		const fields = parsePgComposite('(1,"(2,\\"(3,4)\\")")');
		expect(fields).toEqual(['1', '(2,"(3,4)")']);
		const inner = parsePgComposite(fields[1]!);
		expect(inner).toEqual(['2', '(3,4)']);
		expect(parsePgComposite(inner[1]!)).toEqual(['3', '4']);
	});

	it('handles whitespace-only fields when quoted', ({ expect }) => {
		expect(parsePgComposite('(1," ",3)')).toEqual(['1', ' ', '3']);
		// PG's composite format treats `\X` as literal X (no C-style escapes), so `\t` → `t`.
		expect(parsePgComposite('(1,"\\t",3)')).toEqual(['1', 't', '3']);
	});

	it('rejects malformed inputs', ({ expect }) => {
		expect(() => parsePgComposite('1,2,3')).toThrow();
		expect(() => parsePgComposite('(1,2,3')).toThrow();
		expect(() => parsePgComposite('1,2,3)')).toThrow();
		expect(() => parsePgComposite('')).toThrow();
		expect(() => parsePgComposite('(')).toThrow();
	});
});

describe.concurrent('makePgComposite', () => {
	it('emits zero-field composite', ({ expect }) => {
		expect(makePgComposite([])).toBe('()');
	});

	it('emits simple unquoted values', ({ expect }) => {
		expect(makePgComposite(['1', '2', '3'])).toBe('(1,2,3)');
	});

	it('emits NULL fields as empty', ({ expect }) => {
		expect(makePgComposite([null, null])).toBe('(,)');
		expect(makePgComposite(['1', null, '3'])).toBe('(1,,3)');
	});

	it('quotes empty strings to disambiguate from NULL', ({ expect }) => {
		expect(makePgComposite(['1', '', '3'])).toBe('(1,"",3)');
	});

	it('quotes fields with structural characters', ({ expect }) => {
		expect(makePgComposite(['1', 'hello, world', '3'])).toBe('(1,"hello, world",3)');
		expect(makePgComposite(['(nested)'])).toBe('("(nested)")');
	});

	it('escapes embedded backslashes and double quotes', ({ expect }) => {
		expect(makePgComposite(['he said "hi"'])).toBe('("he said \\"hi\\"")');
		expect(makePgComposite(['a\\b'])).toBe('("a\\\\b")');
	});

	it('quotes whitespace-containing fields', ({ expect }) => {
		expect(makePgComposite(['has space'])).toBe('("has space")');
		expect(makePgComposite([' '])).toBe('(" ")');
	});

	it('round-trips through the parser', ({ expect }) => {
		const cases: (string | null)[][] = [
			['1', '2', '3'],
			['1', null, '3'],
			['1', '', '3'],
			['1', 'hello, world', '3'],
			['1', 'he said "hi"', '3'],
			['1', 'a\\b', '3'],
			['1', '(nested)', '3'],
			[null, null],
			[],
			[' leading space'],
			['trailing space '],
		];
		for (const fields of cases) {
			expect(parsePgComposite(makePgComposite(fields))).toEqual(fields);
		}
	});
});
