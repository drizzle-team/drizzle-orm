import { parseCheckDefinition } from 'src/serializer/pgCheckDefinition';
import { expect, test } from 'vitest';

// `pg_get_constraintdef()` wraps the expression twice and appends trailing
// modifiers, so the closing `))` is not always at the end of the string.
test.each([
	['CHECK ((version >= 0))', 'version >= 0'],
	['CHECK ((version >= 0)) NOT VALID', 'version >= 0'],
	['CHECK ((version >= 0)) NO INHERIT', 'version >= 0'],
	['CHECK ((version >= 0)) NO INHERIT NOT VALID', 'version >= 0'],
	[
		"CHECK (((email)::text <> 'test@gmail.com'::text))",
		"(email)::text <> 'test@gmail.com'::text",
	],
	['CHECK (((age > 21) AND (age < 100)))', '(age > 21) AND (age < 100)'],
	['CHECK (((age > 21) AND (age < 100))) NOT VALID', '(age > 21) AND (age < 100)'],
])('parses %s', (definition, expected) => {
	expect(parseCheckDefinition(definition)).toBe(expected);
});

test('keeps parentheses that live inside a string literal', () => {
	expect(parseCheckDefinition("CHECK (((label)::text <> ') NOT VALID'::text))")).toBe(
		"(label)::text <> ') NOT VALID'::text",
	);
});

test('keeps parentheses that live inside a quoted identifier', () => {
	expect(parseCheckDefinition('CHECK (("odd)name" > 0))')).toBe('"odd)name" > 0');
});

test('treats a doubled quote as an escaped quote, not the end of the literal', () => {
	expect(parseCheckDefinition("CHECK (((note)::text <> 'it''s ()'::text))")).toBe(
		"(note)::text <> 'it''s ()'::text",
	);
});

test('leaves a definition it does not recognise untouched', () => {
	expect(parseCheckDefinition('FOREIGN KEY (a) REFERENCES b(c)')).toBe(
		'FOREIGN KEY (a) REFERENCES b(c)',
	);
	expect(parseCheckDefinition('CHECK (version >= 0')).toBe('CHECK (version >= 0');
});

test('unwraps only the pair Postgres adds', () => {
	// A single-wrapped definition keeps its expression intact rather than
	// losing the first character of it.
	expect(parseCheckDefinition('CHECK (version >= 0)')).toBe('version >= 0');
});
