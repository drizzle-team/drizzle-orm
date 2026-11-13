import { describe, test } from 'vitest';
import { mysqlTable, serial, text } from '~/mysql-core/index.ts';
import { pgTable, serial as pgSerial, text as pgText } from '~/pg-core/index.ts';
import { integer, sqliteTable, text as sqliteText } from '~/sqlite-core/index.ts';

describe.concurrent('comment on column instance', () => {
	test('mysql built column has comment property', ({ expect }) => {
		const table = mysqlTable('users', {
			id: serial('id').comment('pk'),
		});
		expect(table.id.comment).toBe('pk');
	});

	test('pg built column has comment property', ({ expect }) => {
		const table = pgTable('users', {
			id: pgSerial('id').comment('pk'),
		});
		expect(table.id.comment).toBe('pk');
	});

	test('sqlite built column has comment property', ({ expect }) => {
		const table = sqliteTable('users', {
			id: integer('id').primaryKey().comment('pk'),
		});
		expect(table.id.comment).toBe('pk');
	});
});
