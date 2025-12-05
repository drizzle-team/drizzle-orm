import { expect, test } from 'vitest';
import { formatForSingleQuotedString, unescapeSingleQuotes } from '../src/utils';

test('formatForSingleQuotedString basic functionality, ignoreFirstAndLastChar: false', () => {
	// Simple strings
	expect(formatForSingleQuotedString('abc', false)).toBe('abc');
	expect(formatForSingleQuotedString('', false)).toBe('');

	// Ignoring first and last character
	expect(formatForSingleQuotedString('abc', true)).toBe('abc');
	expect(formatForSingleQuotedString('a', true)).toBe('a');

	// Special characters
	expect(formatForSingleQuotedString("'", false)).toBe("\\'"); // Single quote
	expect(formatForSingleQuotedString('"', false)).toBe('"'); // Double quote
	expect(formatForSingleQuotedString('\\', false)).toBe('\\\\'); // Backslash

	// Control characters
	expect(formatForSingleQuotedString('\n', false)).toBe('\\n');
	expect(formatForSingleQuotedString('\r', false)).toBe('\\r');
	expect(formatForSingleQuotedString('\t', false)).toBe('\\t');
	expect(formatForSingleQuotedString('\0', false)).toBe('\\0');

	// Control characters below ASCII 32 (not in the replacements map)
	expect(formatForSingleQuotedString('\u0001', false)).toBe('\\x01');
	expect(formatForSingleQuotedString('\u0002', false)).toBe('\\x02');

	// Null character followed by a digit special case where a null character (`\0`) is followed by a digit, which should be escaped as `\x00` rather than `\0`.
	expect(formatForSingleQuotedString('\u00001', false)).toBe('\\x001');

	// Mixed special characters
	expect(formatForSingleQuotedString("a'b\\c\nd", false)).toBe("a\\'b\\\\c\\nd");

	// Unicode characters
	expect(formatForSingleQuotedString('你好', false)).toBe('你好');
	expect(formatForSingleQuotedString('🌍', false)).toBe('🌍');

	// Line terminators
	expect(formatForSingleQuotedString('\u2028', false)).toBe('\\u2028');
	expect(formatForSingleQuotedString('\u2029', false)).toBe('\\u2029');

	// Complex mix of characters
	const complexString = "a'\nb\tc\rd\0e\u0001f\\g\u2028h";
	expect(formatForSingleQuotedString(complexString, false))
		.toBe("a\\'\\nb\\tc\\rd\\0e\\x01f\\\\g\\u2028h");
});

test('formatForSingleQuotedString basic functionality, ignoreFirstAndLastChar: true', () => {
	// Simple strings
	expect(formatForSingleQuotedString('abc', true)).toBe('abc');
	expect(formatForSingleQuotedString('', true)).toBe('');

	// Ignoring first and last character
	expect(formatForSingleQuotedString('abc', true)).toBe('abc');
	expect(formatForSingleQuotedString('a', true)).toBe('a');

	// Special characters
	expect(formatForSingleQuotedString("'", true)).toBe("'"); // Single quote
	expect(formatForSingleQuotedString('"', true)).toBe('"'); // Double quote
	expect(formatForSingleQuotedString('\\', true)).toBe('\\'); // Backslash

	// Control characters
	expect(formatForSingleQuotedString('\n', true)).toBe('\n');
	expect(formatForSingleQuotedString('\r', true)).toBe('\r');
	expect(formatForSingleQuotedString('\t', true)).toBe('\t');
	expect(formatForSingleQuotedString('\0', true)).toBe('\0');

	// Control characters below ASCII 32 (not in the replacements map)
	expect(formatForSingleQuotedString('\u0001', true)).toBe('\x01');
	expect(formatForSingleQuotedString('\u0002', true)).toBe('\x02');

	// Null character followed by a digit (special case)
	expect(formatForSingleQuotedString('\u00001', true)).toBe('\u00001');

	// Mixed special characters
	expect(formatForSingleQuotedString("a'b\\c\nd", true)).toBe("a\\'b\\\\c\\nd");

	// Unicode characters
	expect(formatForSingleQuotedString('你好', true)).toBe('你好');
	expect(formatForSingleQuotedString('🌍', true)).toBe('🌍');

	// Line terminators
	expect(formatForSingleQuotedString('\u2028', true)).toBe('\u2028');
	expect(formatForSingleQuotedString('\u2029', true)).toBe('\u2029');

	// Complex mix of characters
	const complexString = "a'\nb\tc\rd\0e\u0001f\\g\u2028h";
	expect(formatForSingleQuotedString(complexString, true))
		.toBe("a\\'\\nb\\tc\\rd\\0e\\x01f\\\\g\\u2028h");
});

test('unescapeSingleQuotes functionality, ignoreFirstAndLastChar: false', () => {
	// Basic unescaping
	expect(unescapeSingleQuotes("a''b", false)).toBe("a\\'b");
	expect(unescapeSingleQuotes("''", false)).toBe("\\'");

	// Only interior quotes should be unescaped
	expect(unescapeSingleQuotes("''a''b''", false)).toBe("\\'a\\'b\\'");

	// With ignoreFirstAndLastChar
	expect(unescapeSingleQuotes("'a''b'", false)).toBe("\\'a\\'b\\'");
	expect(unescapeSingleQuotes("''a''b''", false)).toBe("\\'a\\'b\\'");

	// Complex case
	expect(unescapeSingleQuotes("'a''b''c\nd'", false)).toBe("\\'a\\'b\\'c\\nd\\'");

	// Simple strings
	expect(unescapeSingleQuotes('abc', false)).toBe('abc');
	expect(unescapeSingleQuotes('', false)).toBe('');

	// Ignoring first and last character
	expect(unescapeSingleQuotes('abc', true)).toBe('abc');
	expect(unescapeSingleQuotes('a', true)).toBe('a');

	// Special characters
	expect(unescapeSingleQuotes("'", false)).toBe("\\'"); // Single quote
	expect(unescapeSingleQuotes('"', false)).toBe('"'); // Double quote
	expect(unescapeSingleQuotes('\\', false)).toBe('\\\\'); // Backslash

	// Control characters
	expect(unescapeSingleQuotes('\n', false)).toBe('\\n');
	expect(unescapeSingleQuotes('\r', false)).toBe('\\r');
	expect(unescapeSingleQuotes('\t', false)).toBe('\\t');
	expect(unescapeSingleQuotes('\0', false)).toBe('\\0');

	// Control characters below ASCII 32 (not in the replacements map)
	expect(unescapeSingleQuotes('\u0001', false)).toBe('\\x01');
	expect(unescapeSingleQuotes('\u0002', false)).toBe('\\x02');

	// Null character followed by a digit special case where a null character (`\0`) is followed by a digit, which should be escaped as `\x00` rather than `\0`.
	expect(unescapeSingleQuotes('\u00001', false)).toBe('\\x001');

	// Mixed special characters
	expect(unescapeSingleQuotes("a'b\\c\nd", false)).toBe("a\\'b\\\\c\\nd");

	// Unicode characters
	expect(unescapeSingleQuotes('你好', false)).toBe('你好');
	expect(unescapeSingleQuotes('🌍', false)).toBe('🌍');

	// Line terminators
	expect(unescapeSingleQuotes('\u2028', false)).toBe('\\u2028');
	expect(unescapeSingleQuotes('\u2029', false)).toBe('\\u2029');

	// Complex mix of characters
	const complexString = "a'\nb\tc\rd\0e\u0001f\\g\u2028h";
	expect(unescapeSingleQuotes(complexString, false))
		.toBe("a\\'\\nb\\tc\\rd\\0e\\x01f\\\\g\\u2028h");
});
test('unescapeSingleQuotes functionality, ignoreFirstAndLastChar: true', () => {
	// Basic unescaping
	expect(unescapeSingleQuotes("a''b", true)).toBe("a\\'b");
	expect(unescapeSingleQuotes("''", true)).toBe("''");

	// Only interior quotes should be unescaped
	expect(unescapeSingleQuotes("''a''b''", true)).toBe("'\\'a\\'b\\''");

	// With ignoreFirstAndLastChar
	expect(unescapeSingleQuotes("'a''b'", true)).toBe("'a\\'b'");
	expect(unescapeSingleQuotes("''a''b''", true)).toBe("'\\'a\\'b\\''");

	// Complex case
	expect(unescapeSingleQuotes("'a''b''c\nd'", true)).toBe("'a\\'b\\'c\\nd'");

	// Simple strings
	expect(unescapeSingleQuotes('abc', true)).toBe('abc');
	expect(unescapeSingleQuotes('', true)).toBe('');

	// Ignoring first and last character
	expect(unescapeSingleQuotes('abc', true)).toBe('abc');
	expect(unescapeSingleQuotes('a', true)).toBe('a');

	// Special characters
	expect(unescapeSingleQuotes("'", true)).toBe("'"); // Single quote
	expect(unescapeSingleQuotes('"', true)).toBe('"'); // Double quote
	expect(unescapeSingleQuotes('\\', true)).toBe('\\'); // Backslash

	// Control characters
	expect(unescapeSingleQuotes('\n', true)).toBe('\n');
	expect(unescapeSingleQuotes('\r', true)).toBe('\r');
	expect(unescapeSingleQuotes('\t', true)).toBe('\t');
	expect(unescapeSingleQuotes('\0', true)).toBe('\0');

	// Control characters below ASCII 32 (not in the replacements map)
	expect(unescapeSingleQuotes('\u0001', true)).toBe('\x01');
	expect(unescapeSingleQuotes('\u0002', true)).toBe('\x02');

	// Null character followed by a digit special case where a null character (`\0`) is followed by a digit, which should be escaped as `\x00` rather than `\0`.
	expect(unescapeSingleQuotes('\u00001', true)).toBe('\u00001');

	// Mixed special characters
	expect(unescapeSingleQuotes("a'b\\c\nd", true)).toBe("a\\'b\\\\c\\nd");

	// Unicode characters
	expect(unescapeSingleQuotes('你好', true)).toBe('你好');
	expect(unescapeSingleQuotes('🌍', true)).toBe('🌍');

	// Line terminators
	expect(unescapeSingleQuotes('\u2028', true)).toBe('\u2028');
	expect(unescapeSingleQuotes('\u2029', true)).toBe('\u2029');

	// Complex mix of characters
	const complexString = "a'\nb\tc\rd\0e\u0001f\\g\u2028h";
	expect(unescapeSingleQuotes(complexString, true))
		.toBe("a\\'\\nb\\tc\\rd\\0e\\x01f\\\\g\\u2028h");
});
