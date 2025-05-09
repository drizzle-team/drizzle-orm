import { sql } from 'drizzle-orm';
import { index, int, mssqlTable, text } from 'drizzle-orm/mssql-core';
import { expect, test } from 'vitest';
import { diff } from './mocks';

test('indexes #0', async (t) => {
	const schema1 = {
		users: mssqlTable(
			'users',
			{
				id: int('id').primaryKey(),
				name: text('name'),
			},
			(
				t,
			) => [
				index('changeName').on(t.name),
				index('removeColumn').on(t.name, t.id),
				index('addColumn').on(t.name),
				index('removeWhere').on(t.name).where(sql`${t.name} != 'name'`),
				index('addWhere').on(t.name),
			],
		),
	};

	const schema2 = {
		users: mssqlTable(
			'users',
			{
				id: int('id').primaryKey(),
				name: text('name'),
			},
			(t) => [
				index('newName').on(t.name),
				index('removeColumn').on(t.name),
				index('addColumn').on(t.name, t.id),
				index('removeWhere').on(t.name),
				index('addWhere').on(t.name).where(sql`${t.name} != 'name'`),
			],
		),
	};

	const { sqlStatements } = await diff(schema1, schema2, []);

	expect(sqlStatements).toStrictEqual([
		'DROP INDEX [changeName] ON [users];',
		'DROP INDEX [removeColumn] ON [users];',
		'DROP INDEX [addColumn] ON [users];',
		'DROP INDEX [removeWhere] ON [users];',
		'DROP INDEX [addWhere] ON [users];',
		'CREATE INDEX [newName] ON [users] ([name]);',
		'CREATE INDEX [removeColumn] ON [users] ([name]);',
		'CREATE INDEX [addColumn] ON [users] ([name],[id]);',
		'CREATE INDEX [removeWhere] ON [users] ([name]);',
		"CREATE INDEX [addWhere] ON [users] ([name]) WHERE [users].[name] != 'name';",
	]);
});
