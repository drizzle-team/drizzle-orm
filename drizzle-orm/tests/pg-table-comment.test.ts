import { describe, test } from 'vitest';
import { comment, getTableConfig, pgTable, serial } from '~/pg-core/index.ts';

describe.concurrent('pg table comment', () => {
	test('pg table with comment in extra config', ({ expect }) => {
		const users = pgTable('users', {
			id: serial('id'),
		}, () => [comment('users table')]);
		expect(getTableConfig(users).comment).toBe('users table');
	});

	test('comment can be mixed with index and unique', ({ expect }) => {
		const users = pgTable('users', {
			id: serial('id'),
			email: serial('email'),
		}, (table) => [
			comment('Application users'),
		]);
		expect(getTableConfig(users).comment).toBe('Application users');
	});

	test('table without extraConfig has undefined comment', ({ expect }) => {
		const users = pgTable('users', {
			id: serial('id'),
		});
		expect(getTableConfig(users).comment).toBeUndefined();
	});
});
