import { describe, test } from 'vitest';
import { comment, getTableConfig, integer, sqliteTable } from '~/sqlite-core/index.ts';

describe.concurrent('sqlite table comment', () => {
	test('sqlite table with comment in extra config', ({ expect }) => {
		const users = sqliteTable('users', {
			id: integer('id').primaryKey(),
		}, () => [comment('users table')]);
		expect(getTableConfig(users).comment).toBe('users table');
	});

	test('comment can be mixed with index and unique', ({ expect }) => {
		const users = sqliteTable('users', {
			id: integer('id').primaryKey(),
			email: integer('email'),
		}, (table) => [
			comment('Application users'),
		]);
		expect(getTableConfig(users).comment).toBe('Application users');
	});

	test('table without extraConfig has undefined comment', ({ expect }) => {
		const users = sqliteTable('users', {
			id: integer('id').primaryKey(),
		});
		expect(getTableConfig(users).comment).toBeUndefined();
	});
});
