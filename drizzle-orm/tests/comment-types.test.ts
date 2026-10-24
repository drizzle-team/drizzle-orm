import { describe, test } from 'vitest';
import { mysqlTable, serial, text } from '~/mysql-core/index.ts';
import { pgTable, serial as pgSerial, text as pgText } from '~/pg-core/index.ts';
import { integer, sqliteTable, text as sqliteText } from '~/sqlite-core/index.ts';

describe.concurrent('comment types', () => {
	test('comment does not break mysql table inference', ({ expect }) => {
		const table = mysqlTable('users', {
			id: serial('id').comment('pk'),
			email: text('email').notNull().comment('email').default('a@b.com'),
		});

		type Select = typeof table.$inferSelect;
		type Insert = typeof table.$inferInsert;

		// id should have default, email should be not null with default
		const _select: Select = { id: 1, email: 'test' };
		const _insert: Insert = { email: 'test' };
		expect(_select).toBeDefined();
		expect(_insert).toBeDefined();
	});

	test('comment does not break pg table inference', ({ expect }) => {
		const table = pgTable('users', {
			id: pgSerial('id').comment('pk'),
			email: pgText('email').notNull().comment('email').default('a@b.com'),
		});

		type Select = typeof table.$inferSelect;
		type Insert = typeof table.$inferInsert;

		const _select: Select = { id: 1, email: 'test' };
		const _insert: Insert = { email: 'test' };
		expect(_select).toBeDefined();
		expect(_insert).toBeDefined();
	});

	test('comment does not break sqlite table inference', ({ expect }) => {
		const table = sqliteTable('users', {
			id: integer('id').primaryKey().comment('pk'),
			email: sqliteText('email').notNull().comment('email').default('a@b.com'),
		});

		type Select = typeof table.$inferSelect;
		type Insert = typeof table.$inferInsert;

		const _select: Select = { id: 1, email: 'test' };
		const _insert: Insert = { email: 'test' };
		expect(_select).toBeDefined();
		expect(_insert).toBeDefined();
	});
});
