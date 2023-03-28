import { integer, sqliteTable } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
	id: integer('id').primaryKey(),
	name: integer('name').notNull(),
	email: integer('email').notNull(),
});

export const posts = sqliteTable('posts', {
	id: integer('id').primaryKey(),
	title: integer('title').notNull(),
	body: integer('body').notNull(),
	authorId: integer('author_id').notNull().references(() => users.id),
});
