import { trimChar } from 'src/utils';
import { expect, test } from 'vitest';

test('trim chars', () => {
	expect.soft(trimChar("'", "'")).toBe("'");
	expect.soft(trimChar("''", "'")).toBe('');
	expect.soft(trimChar("('')", ['(', ')'])).toBe("''");
	expect.soft(trimChar(trimChar("('')", ['(', ')']), "'")).toBe('');
});
