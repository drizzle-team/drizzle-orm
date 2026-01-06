// Test: type inference
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
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

// Infer from users table
export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

// Infer from table with modifiers
export type Table5Select = InferSelectModel<typeof table5ColsModifiers>;
export type Table5Insert = InferInsertModel<typeof table5ColsModifiers>;

// Infer from large table
export type Table10Select = InferSelectModel<typeof table10Cols>;
export type Table10Insert = InferInsertModel<typeof table10Cols>;
