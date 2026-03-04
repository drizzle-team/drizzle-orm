// Test: select queries
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { boolean, integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

const users = pgTable('users', {
	id: integer().primaryKey(),
	name: text().notNull(),
	email: text().notNull(),
	active: boolean().default(true),
	createdAt: timestamp().defaultNow(),
});

const table5ColsModifiers = pgTable('table_5_cols_modifiers', {
	id: integer().primaryKey(),
	name: text().notNull(),
	email: text().notNull(),
	active: boolean().default(true),
	createdAt: timestamp().defaultNow(),
});

const table10Cols = pgTable('table_10_cols', {
	id: integer().primaryKey(),
	uuid: uuid().notNull(),
	name: text().notNull(),
	email: varchar({ length: 255 }).notNull(),
	bio: text(),
	active: boolean().default(true),
	role: text().default('user'),
	createdAt: timestamp().defaultNow(),
	updatedAt: timestamp(),
	deletedAt: timestamp(),
});

const db = drizzle({ connection: 'postgres://...' });

// Simple select
export const selectAll = db.select().from(users);

// Select with where
export const selectWhere = db.select().from(users).where(eq(users.id, 1));

// Select from larger table
export const selectLarge = db.select().from(table10Cols).where(eq(table10Cols.id, 1));

// Select specific columns
export const selectCols = db.select({ id: users.id, name: users.name }).from(users);

// Select from table with modifiers
export const selectModifiers = db.select().from(table5ColsModifiers);
