// Test: insert queries
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

// Simple insert
export const insertOne = db.insert(users).values({ id: 1, name: 'test', email: 'test@test.com' });

// Insert with returning
export const insertReturning = db.insert(users).values({ id: 1, name: 'test', email: 'test@test.com' }).returning();

// Insert into table with modifiers (uses defaults)
export const insertModifiers = db.insert(table5ColsModifiers).values({ id: 1, name: 'test', email: 'test@test.com' });

// Insert into large table
export const insertLarge = db.insert(table10Cols).values({
	id: 1,
	uuid: '123e4567-e89b-12d3-a456-426614174000',
	name: 'test',
	email: 'test@test.com',
});
