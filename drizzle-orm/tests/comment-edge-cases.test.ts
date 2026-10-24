import { describe, test } from 'vitest';
import { comment, getTableConfig, mysqlTable, text } from '~/mysql-core/index.ts';

describe.concurrent('comment edge cases', () => {
	test('empty string comment is preserved', ({ expect }) => {
		const table = mysqlTable('users', { id: text('id').comment('') });
		expect(table.id.comment).toBe('');
		expect(getTableConfig(table).columns[0]!.comment).toBe('');
	});

	test('last .comment() wins on column', ({ expect }) => {
		const table = mysqlTable('users', {
			id: text('id').comment('first').comment('second'),
		});
		expect(table.id.comment).toBe('second');
	});

	test('last comment() wins in extraConfig', ({ expect }) => {
		const users = mysqlTable('users', { id: text('id') }, () => [
			comment('first'),
			comment('second'),
		]);
		expect(getTableConfig(users).comment).toBe('second');
	});

	test('table without extraConfig has undefined comment', ({ expect }) => {
		const users = mysqlTable('users', { id: text('id') });
		expect(getTableConfig(users).comment).toBeUndefined();
	});

	test('very long comment round-trips', ({ expect }) => {
		const long = 'a'.repeat(5000);
		const users = mysqlTable('users', { id: text('id').comment(long) });
		expect(users.id.comment).toBe(long);
	});

	test('special characters round-trip', ({ expect }) => {
		const special = `It's a "test"\nline two -- DROP TABLE users;`;
		const users = mysqlTable('users', { id: text('id').comment(special) });
		expect(users.id.comment).toBe(special);
	});

	test('multiple getTableConfig calls are idempotent', ({ expect }) => {
		const users = mysqlTable('users', { id: text('id') }, (table) => [
			comment('users table'),
		]);
		const c1 = getTableConfig(users);
		const c2 = getTableConfig(users);
		expect(c1.comment).toBe('users table');
		expect(c2.comment).toBe('users table');
	});
});
