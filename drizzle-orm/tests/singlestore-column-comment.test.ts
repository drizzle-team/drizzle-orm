import { describe, test } from 'vitest';
import { getTableConfig, singlestoreTable, text } from '~/singlestore-core/index.ts';

describe.concurrent('singlestore column comment', () => {
	test('singlestore column builder has comment method', ({ expect }) => {
		const builder = text('name').notNull().comment('users name');
		expect(builder).toBeDefined();
		expect(builder.config.comment).toBe('users name');
	});

	test('built column has comment property', ({ expect }) => {
		const table = singlestoreTable('users', {
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
		const table = singlestoreTable('users', {
			id: text('id'),
		});
		expect(table.id.comment).toBeUndefined();
		expect(getTableConfig(table).columns[0]!.comment).toBeUndefined();
	});
});
