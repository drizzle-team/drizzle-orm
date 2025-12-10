import { char, string, varchar } from 'drizzle-orm/cockroach-core';
import { expect } from 'vitest';
import { diffDefault, test } from './mocks';

test.concurrent('char + char arrays', async ({ db }) => {
	const res1_0 = await diffDefault(db, char().default('text'), `'text'`, { expectError: true });
	// char is less than default
	const res10 = await diffDefault(db, char({ length: 2 }).default('text'), `'text'`, { expectError: true });

	expect(res1_0).toStrictEqual([`Insert default failed`]);
	expect(res10).toStrictEqual([`Insert default failed`]);
});

test.concurrent('varchar + varchar arrays', async ({ db }) => {
	// varchar length is less than default
	const res10 = await diffDefault(db, varchar({ length: 2 }).default('text'), `'text'`, { expectError: true });

	expect(res10).toStrictEqual([`Insert default failed`]);
});

test.concurrent('string + string arrays', async ({ db }) => {
	// varchar length is less than default
	const res10 = await diffDefault(db, string({ length: 2 }).default('text'), `'text'`, { expectError: true });

	expect(res10).toStrictEqual([`Insert default failed`]);
});
