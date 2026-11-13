import { describe, test } from 'vitest';
import * as my from '~/mysql-core/index.ts';

describe.concurrent('mysql comment API via namespace import', () => {
	test('exact expected API: column and table comments via my.*', ({ expect }) => {
		const usersMy = my.mysqlTable(
			'users',
			{
				id: my.serial('id').primaryKey().comment('Primary key'),
				email: my.text('email').notNull().comment('User email address'),
			},
			() => [my.comment('Application users table')],
		);

		expect(usersMy.id.comment).toBe('Primary key');
		expect(usersMy.email.comment).toBe('User email address');
		expect(my.getTableConfig(usersMy).comment).toBe('Application users table');
	});

	test('namespace import includes comment function', ({ expect }) => {
		expect(typeof my.comment).toBe('function');
	});
});
