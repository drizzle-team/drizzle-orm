import { int as mysqlInt, mysqlTable } from 'drizzle-orm/mysql-core';
import { integer as pgInt, pgTable } from 'drizzle-orm/pg-core';
import { integer as sqliteInt, sqliteTable } from 'drizzle-orm/sqlite-core';

export const sqlite = {
	User: sqliteTable('test', {
		id: sqliteInt('id').primaryKey().notNull(),
	}),
};

export const pg = {
	User: pgTable('test', {
		id: pgInt('id').primaryKey().notNull(),
	}),
};

export const mysql = {
	User: mysqlTable('test', {
		id: mysqlInt('id').primaryKey().notNull(),
	}),
};
