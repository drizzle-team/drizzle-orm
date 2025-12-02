import { sql } from 'drizzle-orm';
import { bit, datetime, int, mssqlTableCreator, nvarchar, varchar } from 'drizzle-orm/mssql-core';

const tablePrefix = 'drizzle_tests_';
const mssqlTable = mssqlTableCreator((name) => `${tablePrefix}${name}`);

export const usersTable = mssqlTable('userstest', {
	id: int('id').identity().primaryKey(),
	name: varchar('name', { length: 30 }).notNull(),
	verified: bit('verified').notNull().default(false),
	jsonb: nvarchar('jsonb', { length: 300, mode: 'json' }).$type<string[]>(),
	createdAt: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const users2Table = mssqlTable('users2', {
	id: int('id').primaryKey(),
	name: varchar('name', { length: 30 }).notNull(),
	cityId: int('city_id').default(sql`null`).references(() => citiesTable.id),
});

export const citiesTable = mssqlTable('cities', {
	id: int('id').primaryKey(),
	name: varchar('name', { length: 30 }).notNull(),
});
