import { describe, test } from 'vitest';
import { comment, getTableConfig, singlestoreTable, text } from '~/singlestore-core/index.ts';

describe.concurrent('singlestore table comment', () => {
	test('singlestore table with comment in extra config', ({ expect }) => {
		const users = singlestoreTable('users', {
			id: text('id'),
		}, () => [comment('users table')]);
		expect(getTableConfig(users).comment).toBe('users table');
	});

	test('table without extraConfig has undefined comment', ({ expect }) => {
		const users = singlestoreTable('users', {
			id: text('id'),
		});
		expect(getTableConfig(users).comment).toBeUndefined();
	});
});
