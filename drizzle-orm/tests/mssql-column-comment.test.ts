import { describe, test } from 'vitest';
import { getTableConfig, mssqlTable, varchar } from '~/mssql-core/index.ts';

describe.concurrent('mssql column comment', () => {
	test('mssql column builder has comment method', ({ expect }) => {
		const builder = varchar('name', { length: 255 }).notNull().comment('users name');
		expect(builder).toBeDefined();
		expect(builder.config.comment).toBe('users name');
	});

	test('built column has comment property', ({ expect }) => {
		const table = mssqlTable('users', {
			id: varchar('id', { length: 255 }).comment('pk'),
		});
		expect(table.id.comment).toBe('pk');
		expect(getTableConfig(table).columns[0]!.comment).toBe('pk');
	});

	test('comment chains with other methods', ({ expect }) => {
		const builder = varchar('email', { length: 255 }).notNull().comment('x').default('y');
		expect(builder.config.comment).toBe('x');
		expect(builder.config.notNull).toBe(true);
		expect(builder.config.default).toBe('y');
	});

	test('column without comment has undefined comment', ({ expect }) => {
		const table = mssqlTable('users', {
			id: varchar('id', { length: 255 }),
		});
		expect(table.id.comment).toBeUndefined();
		expect(getTableConfig(table).columns[0]!.comment).toBeUndefined();
	});
});
