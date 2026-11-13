import { describe, test } from 'vitest';
import { comment, getTableConfig, mysqlTable, serial } from '~/mysql-core/index.ts';

describe.concurrent('mysql table comment', () => {
	test('mysql table with comment in extra config', ({ expect }) => {
		const users = mysqlTable('users', {
			id: serial('id'),
		}, () => [comment('users table')]);
		expect(getTableConfig(users).comment).toBe('users table');
	});

	test('comment can be mixed with index and unique', ({ expect }) => {
		const users = mysqlTable('users', {
			id: serial('id'),
			email: serial('email'),
		}, (table) => [
			comment('Application users'),
		]);
		expect(getTableConfig(users).comment).toBe('Application users');
	});

	test('table without extraConfig has undefined comment', ({ expect }) => {
		const users = mysqlTable('users', {
			id: serial('id'),
		});
		expect(getTableConfig(users).comment).toBeUndefined();
	});
});
