import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { diff } from 'tests/sqlite/mocks';
import { expect } from 'vitest';
import { DialectSuite, run } from '../common';

const sqliteSuite: DialectSuite = {
	async columns1() {
		const schema1 = {
			users: sqliteTable('users', {
				id: int('id').primaryKey({ autoIncrement: true }),
			}),
		};

		const schema2 = {
			users: sqliteTable('users', {
				id: int('id').primaryKey({ autoIncrement: true }),
				name: text('name'),
			}),
		};

		const { sqlStatements } = await diff(schema1, schema2, []);
		expect(sqlStatements).toStrictEqual(['ALTER TABLE `users` ADD `name` text;']);
	},
};

run(sqliteSuite);
