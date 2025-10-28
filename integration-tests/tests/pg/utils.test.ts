import { char, foreignKey, getTableConfig, pgTable, primaryKey, serial, text, unique } from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';

test('table configs: unique third param', async () => {
	const cities1Table = pgTable(
		'cities1',
		{
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
			state: char('state', { length: 2 }),
		},
		(
			t,
		) => [unique('custom_name').on(t.name, t.state).nullsNotDistinct(), unique('custom_name1').on(t.name, t.state)],
	);

	const tableConfig = getTableConfig(cities1Table);

	expect(tableConfig.uniqueConstraints).toHaveLength(2);

	expect(tableConfig.uniqueConstraints[0]?.name).toBe('custom_name');
	expect(tableConfig.uniqueConstraints[0]?.nullsNotDistinct).toBe(true);
	expect(tableConfig.uniqueConstraints[0]?.columns.map((t) => t.name)).toEqual(['name', 'state']);

	expect(tableConfig.uniqueConstraints[1]?.name).toBe('custom_name1');
	expect(tableConfig.uniqueConstraints[1]?.nullsNotDistinct).toBe(false);
	expect(tableConfig.uniqueConstraints[1]?.columns.map((t) => t.name)).toEqual(['name', 'state']);
});

test('table configs: unique in column', async () => {
	const cities1Table = pgTable('cities1', {
		id: serial('id').primaryKey(),
		name: text('name').notNull().unique(),
		state: char('state', { length: 2 }).unique('custom'),
		field: char('field', { length: 2 }).unique('custom_field', { nulls: 'not distinct' }),
	});

	const tableConfig = getTableConfig(cities1Table);

	const columnName = tableConfig.columns.find((it) => it.name === 'name');

	expect(columnName?.uniqueName).toBe(undefined);
	expect(columnName?.isUnique).toBe(true);

	const columnState = tableConfig.columns.find((it) => it.name === 'state');
	expect(columnState?.uniqueName).toBe('custom');
	expect(columnState?.isUnique).toBe(true);

	const columnField = tableConfig.columns.find((it) => it.name === 'field');
	expect(columnField?.uniqueName).toBe('custom_field');
	expect(columnField?.isUnique).toBe(true);
	expect(columnField?.uniqueType).toBe('not distinct');
});

test('table config: foreign keys name', async () => {
	const table = pgTable('cities', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		state: text('state'),
	}, (t) => [foreignKey({ foreignColumns: [t.id], columns: [t.id], name: 'custom_fk' })]);

	const tableConfig = getTableConfig(table);

	expect(tableConfig.foreignKeys).toHaveLength(1);
	expect(tableConfig.foreignKeys[0]!.getName()).toBe('custom_fk');
});

test('table config: primary keys name', async () => {
	const table = pgTable('cities', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		state: text('state'),
	}, (t) => [primaryKey({ columns: [t.id, t.name], name: 'custom_pk' })]);

	const tableConfig = getTableConfig(table);

	expect(tableConfig.primaryKeys).toHaveLength(1);
	expect(tableConfig.primaryKeys[0]!.getName()).toBe('custom_pk');
});
