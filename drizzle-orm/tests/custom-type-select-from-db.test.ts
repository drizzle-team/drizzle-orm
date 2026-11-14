import { expect, test } from 'vitest';

import { drizzle as drizzlePg } from '~/node-postgres';
import { drizzle as drizzleSqlite } from '~/better-sqlite3';
import { drizzle as drizzleMysql } from '~/mysql2';
import { customType as gelCustomType, GelDialect, gelTable } from '~/gel-core';
import { customType as mysqlCustomType, MySqlDialect, mysqlTable, text as mysqlText } from '~/mysql-core';
import { customType as pgCustomType, PgDialect, pgTable, text } from '~/pg-core';
import { relations } from '~/relations';
import { customType as singleStoreCustomType, SingleStoreDialect, singlestoreTable } from '~/singlestore-core';
import { sql } from '~/sql/sql';
import { customType as sqliteCustomType, SQLiteSyncDialect, sqliteTable, text as sqliteText } from '~/sqlite-core';

const upper = <T extends { data: string; driverData: string }>(
	customType: (params: {
		dataType: () => string;
		fromDriver: (value: string) => string;
		selectFromDb: (column: any) => any;
	}) => (name: string) => any,
) =>
	customType({
		dataType: () => 'text',
		fromDriver: (value: string) => value,
		selectFromDb: (column) => sql`upper(${column})`,
	});

test('custom selectFromDb renders for every dialect family', () => {
	const pgType = upper(pgCustomType as any);
	const pgUsers = pgTable('pg_users', { value: pgType('value') });
	expect(new PgDialect().sqlToQuery((pgUsers.value as any).sqlForSelect(sql`${pgUsers.value}`)!).sql)
		.toBe('upper("pg_users"."value")');

	const mysqlType = upper(mysqlCustomType as any);
	const mysqlUsers = mysqlTable('mysql_users', { value: mysqlType('value') });
	expect(new MySqlDialect().sqlToQuery((mysqlUsers.value as any).sqlForSelect(sql`${mysqlUsers.value}`)!).sql)
		.toBe('upper(`mysql_users`.`value`)');

	const sqliteType = upper(sqliteCustomType as any);
	const sqliteUsers = sqliteTable('sqlite_users', { value: sqliteType('value') });
	expect(new SQLiteSyncDialect().sqlToQuery((sqliteUsers.value as any).sqlForSelect(sql`${sqliteUsers.value}`)!).sql)
		.toBe('upper("sqlite_users"."value")');

	const singleStoreType = upper(singleStoreCustomType as any);
	const singleStoreUsers = singlestoreTable('singlestore_users', { value: singleStoreType('value') });
	expect(new SingleStoreDialect().sqlToQuery((singleStoreUsers.value as any).sqlForSelect(sql`${singleStoreUsers.value}`)!).sql)
		.toBe('upper(`singlestore_users`.`value`)');

	const gelType = upper(gelCustomType as any);
	const gelUsers = gelTable('gel_users', { value: gelType('value') });
	expect(new GelDialect().sqlToQuery((gelUsers.value as any).sqlForSelect(sql`${gelUsers.value}`)!).sql)
		.toContain('upper(');
});

test('postgres default select and returning apply selectFromDb and preserve decoding', () => {
	const wrapped = pgCustomType<{ data: string; driverData: string }>({
		dataType: () => 'text',
		fromDriver: (value) => value.toLowerCase(),
		selectFromDb: (column) => sql`upper(${column})`,
	});
	const users = pgTable('users', {
		id: text('id').primaryKey(),
		value: wrapped('value'),
	});
	const db = drizzlePg.mock();

	expect(db.select().from(users).toSQL().sql)
		.toBe('select "id", upper("value") as "value" from "users"');
	expect(db.insert(users).values({ id: '1', value: 'hello' }).returning().toSQL().sql)
		.toContain('returning "id", upper("value") as "value"');
	expect(users.value.mapFromDriverValue('HELLO')).toBe('hello');
});

test('sqlite default select and returning apply selectFromDb', () => {
	const wrapped = sqliteCustomType<{ data: string; driverData: string }>({
		dataType: () => 'text',
		fromDriver: (value) => value.toLowerCase(),
		selectFromDb: (column) => sql`upper(${column})`,
	});
	const users = sqliteTable('sqlite_users_test', {
		id: sqliteText('id').primaryKey(),
		value: wrapped('value'),
	});
	const db = drizzleSqlite.mock();

	expect(db.select().from(users).toSQL().sql)
		.toBe('select "id", upper("value") as "value" from "sqlite_users_test"');
	expect(db.insert(users).values({ id: '1', value: 'hello' }).returning().toSQL().sql)
		.toContain('returning "id", upper("value") as "value"');
});

test('mysql default select applies selectFromDb', () => {
	const wrapped = mysqlCustomType<{ data: string; driverData: string }>({
		dataType: () => 'text',
		fromDriver: (value) => value.toLowerCase(),
		selectFromDb: (column) => sql`upper(${column})`,
	});
	const users = mysqlTable('mysql_users_test', {
		id: mysqlText('id').primaryKey(),
		value: wrapped('value'),
	});
	const db = drizzleMysql.mock();

	expect(db.select().from(users).toSQL().sql)
		.toBe('select `id`, upper(`value`) as `value` from `mysql_users_test`');
});

test('postgres relational nested selection applies selectFromDb', () => {
	const wrapped = pgCustomType<{ data: string; driverData: string }>({
		dataType: () => 'text',
		selectFromDb: (column) => sql`upper(${column})`,
	});
	const users = pgTable('users_rel', {
		id: text('id').primaryKey(),
	});
	const profiles = pgTable('profiles_rel', {
		id: text('id').primaryKey(),
		userId: text('user_id').notNull(),
		displayName: wrapped('display_name'),
	});
	const usersRelations = relations(users, ({ one }) => ({
		profile: one(profiles, {
			fields: [users.id],
			references: [profiles.userId],
		}),
	}));
	const profilesRelations = relations(profiles, ({ one }) => ({
		user: one(users, {
			fields: [profiles.userId],
			references: [users.id],
		}),
	}));
	const db = drizzlePg.mock({
		schema: { users, profiles, usersRelations, profilesRelations },
	});

	const query = db.query.users.findMany({ with: { profile: true } }).toSQL().sql;
	expect(query).toContain('upper(');
	expect(query).toContain('display_name');
});

test('sqlite relational nested selection applies selectFromDb', () => {
	const wrapped = sqliteCustomType<{ data: string; driverData: string }>({
		dataType: () => 'text',
		selectFromDb: (column) => sql`upper(${column})`,
	});
	const users = sqliteTable('users_rel_sqlite', {
		id: sqliteText('id').primaryKey(),
	});
	const profiles = sqliteTable('profiles_rel_sqlite', {
		id: sqliteText('id').primaryKey(),
		userId: sqliteText('user_id').notNull(),
		displayName: wrapped('display_name'),
	});
	const usersRelations = relations(users, ({ one }) => ({
		profile: one(profiles, {
			fields: [users.id],
			references: [profiles.userId],
		}),
	}));
	const profilesRelations = relations(profiles, ({ one }) => ({
		user: one(users, {
			fields: [profiles.userId],
			references: [users.id],
		}),
	}));
	const db = drizzleSqlite.mock({
		schema: { users, profiles, usersRelations, profilesRelations },
	});

	const query = db.query.users.findMany({ with: { profile: true } }).toSQL().sql;
	expect(query).toContain('upper(');
	expect(query).toContain('display_name');
});
