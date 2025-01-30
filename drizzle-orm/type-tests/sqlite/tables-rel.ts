import { eq, sql } from '~/index';
import { relations } from '~/relations.ts';
import { integer, sqliteTable, text } from '~/sqlite-core';

export const users = sqliteTable('users', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	cityId: integer('city_id').references(() => cities.id).notNull(),
	homeCityId: integer('home_city_id').references(() => cities.id),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
export const usersConfig = relations(users, ({ one, many }) => ({
	city: one(cities, { relationName: 'UsersInCity', fields: [users.cityId], references: [cities.id] }),
	homeCity: one(cities, { fields: [users.homeCityId], references: [cities.id] }),
	posts: many(posts),
	comments: many(comments),
	notes: many(notes, { where: eq(notes.notableType, 'User') }),
}));

export const cities = sqliteTable('cities', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
});
export const citiesConfig = relations(cities, ({ many }) => ({
	users: many(users, { relationName: 'UsersInCity' }),
}));

export const posts = sqliteTable('posts', {
	id: integer('id').primaryKey(),
	title: text('title').notNull(),
	authorId: integer('author_id').references(() => users.id),
});
export const postsConfig = relations(posts, ({ one, many }) => ({
	author: one(users, { fields: [posts.authorId], references: [users.id] }),
	comments: many(comments),
	notes: many(notes, { where: eq(notes.notableType, 'Post') }),
}));

export const comments = sqliteTable('comments', {
	id: integer('id').primaryKey(),
	postId: integer('post_id').references(() => posts.id).notNull(),
	authorId: integer('author_id').references(() => users.id),
	text: text('text').notNull(),
});
export const commentsConfig = relations(comments, ({ one, many }) => ({
	post: one(posts, { fields: [comments.postId], references: [posts.id] }),
	author: one(users, { fields: [comments.authorId], references: [users.id] }),
	notes: many(notes, { where: eq(notes.notableType, 'Comment') }),
}));

export const books = sqliteTable('books', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
});
export const booksConfig = relations(books, ({ many }) => ({
	authors: many(bookAuthors),
}));

export const bookAuthors = sqliteTable('book_authors', {
	bookId: integer('book_id').references(() => books.id).notNull(),
	authorId: integer('author_id').references(() => users.id).notNull(),
	role: text('role').notNull(),
});
export const bookAuthorsConfig = relations(bookAuthors, ({ one }) => ({
	book: one(books, { fields: [bookAuthors.bookId], references: [books.id] }),
	author: one(users, { fields: [bookAuthors.authorId], references: [users.id] }),
}));

export const node = sqliteTable('node', {
	id: integer('id').primaryKey(),
	parentId: integer('parent_id'),
	leftId: integer('left_id'),
	rightId: integer('right_id'),
});
export const nodeRelations = relations(node, ({ one }) => ({
	parent: one(node, { fields: [node.parentId], references: [node.id] }),
	left: one(node, { fields: [node.leftId], references: [node.id] }),
	right: one(node, { fields: [node.rightId], references: [node.id] }),
}));

export const notes = sqliteTable('note', {
	id: integer('id').primaryKey(),
	text: text('text').notNull(),
	notableId: integer('notable_id').notNull(),
	notableType: text('notable_type', { enum: ['User', 'Post', 'Comment'] }).notNull(),
});

export const noteRelations = relations(notes, ({ one }) => ({
	// users should be inferred as User | null due to the where
	users: one(users, { fields: [notes.notableId], references: [users.id], where: sql`` }),
	posts: one(posts, { fields: [notes.notableId], references: [posts.id] }),
	comments: one(comments, { fields: [notes.notableId], references: [comments.id] }),
}));
