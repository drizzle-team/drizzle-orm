import { sql } from 'drizzle-orm';
import { jsonb } from 'drizzle-orm/cockroach-core';
import {
	bigint,
	boolean,
	foreignKey,
	getTableConfig,
	index,
	int,
	json,
	mediumint,
	MySqlDialect,
	mysqlTable,
	mysqlTableCreator,
	primaryKey,
	serial,
	smallint,
	text,
	timestamp,
	tinyint,
	unique,
} from 'drizzle-orm/mysql-core';
import { drizzle } from 'drizzle-orm/mysql2';
import { expect, test } from 'vitest';

const db = drizzle.mock();

test('table config: unsigned ints', async () => {
	const unsignedInts = mysqlTable('cities1', {
		bigint: bigint({ mode: 'number', unsigned: true }),
		int: int({ unsigned: true }),
		smallint: smallint({ unsigned: true }),
		mediumint: mediumint({ unsigned: true }),
		tinyint: tinyint({ unsigned: true }),
	});

	const tableConfig = getTableConfig(unsignedInts);

	const bigintColumn = tableConfig.columns.find((c) => c.name === 'bigint')!;
	const intColumn = tableConfig.columns.find((c) => c.name === 'int')!;
	const smallintColumn = tableConfig.columns.find((c) => c.name === 'smallint')!;
	const mediumintColumn = tableConfig.columns.find((c) => c.name === 'mediumint')!;
	const tinyintColumn = tableConfig.columns.find((c) => c.name === 'tinyint')!;

	expect(bigintColumn.getSQLType()).toBe('bigint unsigned');
	expect(intColumn.getSQLType()).toBe('int unsigned');
	expect(smallintColumn.getSQLType()).toBe('smallint unsigned');
	expect(mediumintColumn.getSQLType()).toBe('mediumint unsigned');
	expect(tinyintColumn.getSQLType()).toBe('tinyint unsigned');
});

test('table config: signed ints', async () => {
	const unsignedInts = mysqlTable('cities1', {
		bigint: bigint('bigint', { mode: 'number' }),
		int: int('int'),
		smallint: smallint('smallint'),
		mediumint: mediumint('mediumint'),
		tinyint: tinyint('tinyint'),
	});

	const tableConfig = getTableConfig(unsignedInts);

	const bigintColumn = tableConfig.columns.find((c) => c.name === 'bigint')!;
	const intColumn = tableConfig.columns.find((c) => c.name === 'int')!;
	const smallintColumn = tableConfig.columns.find((c) => c.name === 'smallint')!;
	const mediumintColumn = tableConfig.columns.find((c) => c.name === 'mediumint')!;
	const tinyintColumn = tableConfig.columns.find((c) => c.name === 'tinyint')!;

	expect(bigintColumn.getSQLType()).toBe('bigint');
	expect(intColumn.getSQLType()).toBe('int');
	expect(smallintColumn.getSQLType()).toBe('smallint');
	expect(mediumintColumn.getSQLType()).toBe('mediumint');
	expect(tinyintColumn.getSQLType()).toBe('tinyint');
});

test('table config: foreign keys name', async () => {
	const table = mysqlTable('cities', {
		id: serial().primaryKey(),
		name: text().notNull(),
		state: text(),
	}, (t) => [foreignKey({ foreignColumns: [t.id], columns: [t.id], name: 'custom_fk' })]);

	const tableConfig = getTableConfig(table);

	expect(tableConfig.foreignKeys).toHaveLength(1);
	expect(tableConfig.foreignKeys[0]!.getName()).toBe('custom_fk');
});

test('table config: primary keys name', async () => {
	const table = mysqlTable('cities', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		state: text('state'),
	}, (t) => [primaryKey({ columns: [t.id, t.name] })]);

	const tableConfig = getTableConfig(table);

	expect(tableConfig.primaryKeys).toHaveLength(1);
});

test('table configs: unique third param', async () => {
	const cities1Table = mysqlTable('cities1', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		state: text('state'),
	}, (t) => [unique('custom_name').on(t.name, t.state), unique('custom_name1').on(t.name, t.state)]);

	const tableConfig = getTableConfig(cities1Table);

	expect(tableConfig.uniqueConstraints).toHaveLength(2);

	expect(tableConfig.uniqueConstraints[0]?.name).toBe('custom_name');
	expect(tableConfig.uniqueConstraints[0]?.columns.map((t) => t.name)).toEqual(['name', 'state']);

	expect(tableConfig.uniqueConstraints[1]?.name).toBe('custom_name1');
	expect(tableConfig.uniqueConstraints[1]?.columns.map((t) => t.name)).toEqual(['name', 'state']);
});

test('table configs: unique in column', async () => {
	const cities1Table = mysqlTable('cities1', {
		id: serial('id').primaryKey(),
		name: text('name').notNull().unique(),
		state: text('state').unique('custom'),
		field: text('field').unique('custom_field'),
	});

	const tableConfig = getTableConfig(cities1Table);

	const columnName = tableConfig.columns.find((it) => it.name === 'name');
	expect(columnName?.uniqueName).toBe(undefined);
	expect(columnName?.isUnique).toBeTruthy();

	const columnState = tableConfig.columns.find((it) => it.name === 'state');
	expect(columnState?.uniqueName).toBe('custom');
	expect(columnState?.isUnique).toBeTruthy();

	const columnField = tableConfig.columns.find((it) => it.name === 'field');
	expect(columnField?.uniqueName).toBe('custom_field');
	expect(columnField?.isUnique).toBeTruthy();
});

test('prefixed', () => {
	const mysqlTable = mysqlTableCreator((name) => `prefixed_${name}`);

	const users = mysqlTable('users', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	});

	const dialect = new MySqlDialect();
	// await db.execute(`);
	expect(dialect.sqlToQuery(sql`drop table if exists ${users}`)).toStrictEqual({
		sql: 'drop table if exists `prefixed_users`',
		params: [],
	});

	expect(dialect.sqlToQuery(sql`create table ${users} (id serial primary key, name text not null)`)).toStrictEqual({
		sql: 'create table `prefixed_users` (id serial primary key, name text not null)',
		params: [],
	});
});

test.concurrent('define constraints as array', async () => {
	const table = mysqlTable('name', {
		id: int(),
	}, (t) => [
		index('name').on(t.id),
		primaryKey({ columns: [t.id] }),
	]);

	const { indexes, primaryKeys } = getTableConfig(table);

	expect(indexes.length).toBe(1);
	expect(primaryKeys.length).toBe(1);
});

test('define constraints as array inside third param', async () => {
	const table = mysqlTable('name', {
		id: int(),
	}, (t) => [
		[index('name').on(t.id), primaryKey({ columns: [t.id] })],
	]);

	const { indexes, primaryKeys } = getTableConfig(table);

	expect(indexes.length).toBe(1);
	expect(primaryKeys.length).toBe(1);
});

test.concurrent('build query', async () => {
	const table = mysqlTable('table', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		verified: boolean('verified').notNull().default(false),
		jsonb: json('jsonb').$type<string[]>(),
		createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
	});

	const query = db.select({ id: table.id, name: table.name }).from(table)
		.groupBy(table.id, table.name)
		.toSQL();

	expect(query).toEqual({
		sql: `select \`id\`, \`name\` from \`table\` group by \`table\`.\`id\`, \`table\`.\`name\``,
		params: [],
	});
});

test.concurrent('Query check: Insert all defaults in 1 row', async () => {
	const users = mysqlTable('users', {
		id: serial('id').primaryKey(),
		name: text('name').default('Dan'),
		state: text('state'),
	});

	const query = db
		.insert(users)
		.values({})
		.toSQL();

	expect(query).toEqual({
		sql: 'insert into `users` (`id`, `name`, `state`) values (default, default, default)',
		params: [],
	});
});

test.concurrent('Query check: Insert all defaults in multiple rows', async () => {
	const users = mysqlTable('table', {
		id: serial('id').primaryKey(),
		name: text('name').default('Dan'),
		state: text('state').default('UA'),
	});

	const query = db
		.insert(users)
		.values([{}, {}])
		.toSQL();

	expect(query).toEqual({
		sql: 'insert into `table` (`id`, `name`, `state`) values (default, default, default), (default, default, default)',
		params: [],
	});
});

test.concurrent('build query insert with onDuplicate', async () => {
	const users = mysqlTable('users', {
		id: serial().primaryKey(),
		name: text().default('Dan'),
		verified: boolean().default(false),
		jsonb: jsonb(),
	});

	const query = db.insert(users)
		.values({ name: 'John', jsonb: ['foo', 'bar'] })
		.onDuplicateKeyUpdate({ set: { name: 'John1' } })
		.toSQL();

	expect(query).toEqual({
		sql:
			'insert into `users` (`id`, `name`, `verified`, `jsonb`) values (default, ?, default, ?) on duplicate key update `name` = ?',
		params: ['John', '["foo","bar"]', 'John1'],
	});
});
