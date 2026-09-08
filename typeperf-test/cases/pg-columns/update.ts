// Test: update queries
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

// Simple update
export const updateOne = db.update(users).set({ name: 'updated' }).where(eq(users.id, 1));

// Update with returning
export const updateReturning = db.update(users).set({ name: 'updated' }).where(eq(users.id, 1)).returning();

// Update table with modifiers
export const updateModifiers = db.update(table5ColsModifiers).set({ name: 'updated' }).where(
	eq(table5ColsModifiers.id, 1),
);

// Update large table
export const updateLarge = db.update(table10Cols).set({ name: 'updated', email: 'new@test.com' }).where(
	eq(table10Cols.id, 1),
);
