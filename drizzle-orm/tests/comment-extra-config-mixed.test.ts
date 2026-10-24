import { describe, test } from 'vitest';
import { comment, getTableConfig, index, mysqlTable, serial, unique } from '~/mysql-core/index.ts';

describe.concurrent('comment extra config mixed', () => {
	test('comment mixed with index and unique in mysql', ({ expect }) => {
		const users = mysqlTable('users', {
			id: serial('id'),
			email: serial('email'),
		}, (table) => [
			index('email_idx').on(table.email),
			unique('email_unq').on(table.email),
			comment('Application users'),
		]);
		const config = getTableConfig(users);
		expect(config.comment).toBe('Application users');
		expect(config.indexes.length).toBe(1);
		expect(config.uniqueConstraints.length).toBe(1);
	});
});
