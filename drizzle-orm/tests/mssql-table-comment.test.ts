import { describe, test } from 'vitest';
import { comment, getTableConfig, mssqlTable, varchar } from '~/mssql-core/index.ts';

describe.concurrent('mssql table comment', () => {
	test('mssql table with comment in extra config', ({ expect }) => {
		const users = mssqlTable('users', {
			id: varchar('id', { length: 255 }),
		}, () => [comment('users table')]);
		expect(getTableConfig(users).comment).toBe('users table');
	});

	test('table without extraConfig has undefined comment', ({ expect }) => {
		const users = mssqlTable('users', {
			id: varchar('id', { length: 255 }),
		});
		expect(getTableConfig(users).comment).toBeUndefined();
	});
});
