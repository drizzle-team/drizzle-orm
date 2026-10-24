import { describe, test } from 'vitest';
import { cockroachTable, comment, getTableConfig, varchar } from '~/cockroach-core/index.ts';

describe.concurrent('cockroach table comment', () => {
	test('cockroach table with comment in extra config', ({ expect }) => {
		const users = cockroachTable('users', {
			id: varchar('id', { length: 255 }),
		}, () => [comment('users table')]);
		expect(getTableConfig(users).comment).toBe('users table');
	});

	test('table without extraConfig has undefined comment', ({ expect }) => {
		const users = cockroachTable('users', {
			id: varchar('id', { length: 255 }),
		});
		expect(getTableConfig(users).comment).toBeUndefined();
	});
});
