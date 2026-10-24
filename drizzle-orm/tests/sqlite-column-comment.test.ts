import { describe, test } from 'vitest';
import { getTableConfig, sqliteTable, text } from '~/sqlite-core/index.ts';

describe.concurrent('sqlite column comment', () => {
	test('sqlite column builder has comment method', ({ expect }) => {
		const builder = text('bio').comment('user bio');
		expect(builder).toBeDefined();
		expect(builder.config.comment).toBe('user bio');
	});

	test('built column has comment property', ({ expect }) => {
		const table = sqliteTable('users', {
			id: text('id').comment('pk'),
		});
		expect(table.id.comment).toBe('pk');
		expect(getTableConfig(table).columns[0]!.comment).toBe('pk');
	});

	test('comment chains with other methods', ({ expect }) => {
		const builder = text('email').notNull().comment('x').default('y');
		expect(builder.config.comment).toBe('x');
		expect(builder.config.notNull).toBe(true);
		expect(builder.config.default).toBe('y');
	});

	test('column without comment has undefined comment', ({ expect }) => {
		const table = sqliteTable('users', {
			id: text('id'),
		});
		expect(table.id.comment).toBeUndefined();
		expect(getTableConfig(table).columns[0]!.comment).toBeUndefined();
	});
});
