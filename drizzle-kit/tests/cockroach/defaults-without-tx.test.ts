import { char, string, varchar } from 'drizzle-orm/cockroach-core';
import { expect } from 'vitest';
import { diffDefault, test } from './mocks';

test('char + char arrays', async ({ db }) => {
	const res1_0 = await diffDefault(db, char().default('text'), `'text'`, true);
	// char is less than default
	const res10 = await diffDefault(db, char({ length: 2 }).default('text'), `'text'`, true);

	expect.soft(res1_0).toStrictEqual([`Insert default failed`]);
	expect.soft(res10).toStrictEqual([`Insert default failed`]);
});

test('varchar + varchar arrays', async ({ db }) => {
	// varchar length is less than default
	const res10 = await diffDefault(db, varchar({ length: 2 }).default('text'), `'text'`, true);

	expect.soft(res10).toStrictEqual([`Insert default failed`]);
});

test('string + string arrays', async ({ db }) => {
	// varchar length is less than default
	const res10 = await diffDefault(db, string({ length: 2 }).default('text'), `'text'`, true);

	expect.soft(res10).toStrictEqual([`Insert default failed`]);
});
