import { test as brotest } from '@drizzle-team/brocli';
import { assert, expect, test } from 'vitest';
import { exportRaw } from '../src/cli/schema';

test('export with async config', async (t) => {
	const res = await brotest(exportRaw, '');

	if (res.type !== 'handler') assert.fail(res.type, 'handler');
	expect(res.options).toStrictEqual({
		dialect: 'postgresql',
		schema: './schema.ts',
		sql: true,
	});
});
