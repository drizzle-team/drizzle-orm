import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { diffTestSchemasSqlite } from 'tests/schemaDiffer';
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

		const { statements } = await diffTestSchemasSqlite(schema1, schema2, []);

		expect(statements.length).toBe(1);
		expect(statements[0]).toStrictEqual({
			type: 'sqlite_alter_table_add_column',
			tableName: 'users',
			referenceData: undefined,
			column: {
				name: 'name',
				type: 'text',
				primaryKey: false,
				notNull: false,
				autoincrement: false,
			},
		});
	},
};

run(sqliteSuite);
