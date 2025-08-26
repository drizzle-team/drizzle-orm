import { isTime, trimChar, wrapWith } from 'src/utils';
import { expect, test } from 'vitest';

test('trim chars', () => {
	expect.soft(trimChar("'", "'")).toBe("'");
	expect.soft(trimChar("''", "'")).toBe('');
	expect.soft(trimChar("('')", ['(', ')'])).toBe("''");
	expect.soft(trimChar(trimChar("('')", ['(', ')']), "'")).toBe('');
});

test("wrap chars",()=>{
	expect.soft(wrapWith("10:20:30","'")).toBe("'10:20:30'")
	expect.soft(wrapWith("10:20:30'","'")).toBe("10:20:30'")
	expect.soft(wrapWith("'10:20:30","'")).toBe("'10:20:30")
})

test("is time", ()=>{
	expect.soft(isTime("10:20:30")).toBe(true)
	expect.soft(isTime("10:20:30+0000")).toBe(true)
	expect.soft(isTime("now()")).toBe(false)
})