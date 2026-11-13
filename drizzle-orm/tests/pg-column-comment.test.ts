import { describe, test } from 'vitest';
import { getTableConfig, pgTable, text } from '~/pg-core/index.ts';

describe.concurrent('pg column comment', () => {
	test('pg column builder has comment method', ({ expect }) => {
		const builder = text('email').notNull().comment('user email');
		expect(builder).toBeDefined();
		expect(builder.config.comment).toBe('user email');
	});

	test('built column has comment property', ({ expect }) => {
		const table = pgTable('users', {
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
		const table = pgTable('users', {
			id: text('id'),
		});
		expect(table.id.comment).toBeUndefined();
		expect(getTableConfig(table).columns[0]!.comment).toBeUndefined();
	});
});
