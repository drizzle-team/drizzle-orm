import { test as brotest } from '@drizzle-team/brocli';
import { assert, expect, test } from 'vitest';
import { drop } from '../src/cli/schema';

test('drop #1', async (t) => {
	const res = await brotest(
		drop,
		'--name=my-migration-file-name',
	);

	if (res.type !== 'handler') assert.fail(res.type, 'handler');

	expect(res.options).toStrictEqual({
		name: 'my-migration-file-name',
		bundle: false,
		out: 'drizzle',
	});
});
