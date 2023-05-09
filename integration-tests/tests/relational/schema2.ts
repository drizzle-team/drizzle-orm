import { relations } from 'drizzle-orm';
import { integer, pgSchema, serial, text } from 'drizzle-orm/pg-core';

export const drizzleSchema = pgSchema('drizzle');

export const users = drizzleSchema.table('users', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
});
export const usersRelations = relations(users, ({ many }) => ({
	posts: many(posts),
	comments: many(comments),
}));

export const posts = drizzleSchema.table('posts', {
	id: serial('id').primaryKey(),
	authorId: integer('author_id').references(() => users.id),
	title: text('title').notNull(),
	content: text('content').notNull(),
});
export const postsRelations = relations(posts, ({ one, many }) => ({
	author: one(users, { fields: [posts.authorId], references: [users.id] }),
	comments: many(comments),
}));

export const comments = drizzleSchema.table('comments', {
	id: serial('id').primaryKey(),
	postId: integer('post_id').references(() => posts.id).notNull(),
	authorId: integer('author_id').references(() => users.id).notNull(),
	content: text('content').notNull(),
});
export const commentsRelations = relations(comments, ({ one }) => ({
	post: one(posts, { fields: [comments.postId], references: [posts.id] }),
	author: one(users, { fields: [comments.authorId], references: [users.id] }),
}));
