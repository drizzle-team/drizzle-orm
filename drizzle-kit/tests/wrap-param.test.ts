import pico from 'picocolors';
import { assert, expect, test } from 'vitest';
import { wrapParam } from '../src/cli/validations/common';

test('wrapParam', () => {
	expect(wrapParam('password', 'password123', false, 'secret')).toBe(`    [${pico.green('✓')}] password: '*****'`);
	expect(wrapParam('url', 'mysql://user:password@localhost:3306/database', false, 'url')).toBe(
		`    [${pico.green('✓')}] url: 'mysql://user:****@localhost:3306/database'`,
	);
	expect(wrapParam('url', 'singlestore://user:password@localhost:3306/database', false, 'url')).toBe(
		`    [${pico.green('✓')}] url: 'singlestore://user:****@localhost:3306/database'`,
	);
	expect(wrapParam('url', 'postgresql://user:password@localhost:5432/database', false, 'url')).toBe(
		`    [${pico.green('✓')}] url: 'postgresql://user:****@localhost:5432/database'`,
	);
});
