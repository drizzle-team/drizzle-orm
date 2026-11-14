// The schema every unified-pg bench queries.
import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
	id: serial().primaryKey(),
	name: text().notNull(),
	email: text(),
	createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const posts = pgTable('posts', {
	id: serial().primaryKey(),
	authorId: integer('author_id').notNull(),
	title: text().notNull(),
	body: text(),
});
