import { drizzle } from 'drizzle-orm/node-postgres';
import {
	boolean,
	char,
	foreignKey,
	getTableConfig,
	jsonb,
	pgTable,
	primaryKey,
	serial,
	text,
	timestamp,
	unique,
} from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';

const db = drizzle.mock();

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

test('Query check: Insert all defaults in 1 row', async () => {
	const users = pgTable('users_40', {
		id: serial('id').primaryKey(),
		name: text('name').default('Dan'),
		state: text('state'),
	});

	const query = db
		.insert(users)
		.values({})
		.toSQL();

	expect(query).toEqual({
		sql: 'insert into "users_40" ("id", "name", "state") values (default, default, default)',
		params: [],
	});
});

test('Query check: Insert all defaults in multiple rows', async () => {
	const users = pgTable('users_41', {
		id: serial('id').primaryKey(),
		name: text('name').default('Dan'),
		state: text('state').default('UA'),
	});

	const query = db
		.insert(users)
		.values([{}, {}])
		.toSQL();

	expect(query).toEqual({
		sql:
			'insert into "users_41" ("id", "name", "state") values (default, default, default), (default, default, default)',
		params: [],
	});
});

test.concurrent.only('build query insert with onConflict do update', async () => {
	const usersTable = pgTable('users_44', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: jsonb('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	});

	const query = db
		.insert(usersTable)
		.values({ name: 'John', jsonb: ['foo', 'bar'] })
		.onConflictDoUpdate({ target: usersTable.id, set: { name: 'John1' } })
		.toSQL();

	expect(query).toEqual({
		sql:
			'insert into "users_44" ("id", "name", "verified", "jsonb", "created_at") values (default, $1, default, $2, default) on conflict ("id") do update set "name" = $3',
		params: ['John', '["foo","bar"]', 'John1'],
	});
});

test('build query insert with onConflict do update / multiple columns', async () => {
	const usersTable = pgTable('users_45', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: jsonb('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	});

	const query = db
		.insert(usersTable)
		.values({ name: 'John', jsonb: ['foo', 'bar'] })
		.onConflictDoUpdate({ target: [usersTable.id, usersTable.name], set: { name: 'John1' } })
		.toSQL();

	expect(query).toEqual({
		sql:
			'insert into "users_45" ("id", "name", "verified", "jsonb", "created_at") values (default, $1, default, $2, default) on conflict ("id","name") do update set "name" = $3',
		params: ['John', '["foo","bar"]', 'John1'],
	});
});

test.concurrent.only('build query insert with onConflict do nothing', async () => {
	const usersTable = pgTable('users_46', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: jsonb('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	});

	const query = db
		.insert(usersTable)
		.values({ name: 'John', jsonb: ['foo', 'bar'] })
		.onConflictDoNothing()
		.toSQL();

	expect(query).toEqual({
		sql:
			'insert into "users_46" ("id", "name", "verified", "jsonb", "created_at") values (default, $1, default, $2, default) on conflict do nothing',
		params: ['John', '["foo","bar"]'],
	});
});

test.concurrent.only('build query insert with onConflict do nothing + target', async () => {
	const usersTable = pgTable('users_47', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: jsonb('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	});

	const query = db
		.insert(usersTable)
		.values({ name: 'John', jsonb: ['foo', 'bar'] })
		.onConflictDoNothing({ target: usersTable.id })
		.toSQL();

	expect(query).toEqual({
		sql:
			'insert into "users_47" ("id", "name", "verified", "jsonb", "created_at") values (default, $1, default, $2, default) on conflict ("id") do nothing',
		params: ['John', '["foo","bar"]'],
	});
});
