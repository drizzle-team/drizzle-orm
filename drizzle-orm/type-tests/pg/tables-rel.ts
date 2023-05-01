import { type AnyPgColumn, integer, pgTable, pgTableConfig, serial, text } from '~/pg-core';

export const users = pgTable('users', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	cityId: integer('city_id').references(() => cities.id).notNull(),
	homeCityId: integer('home_city_id').references(() => cities.id),
});
export const usersConfig = pgTableConfig(users, ({ relations, one, many }) => [
	relations({
		city: one(cities, { relationName: 'UsersInCity', fields: [users.cityId], references: [cities.id] }),
		homeCity: one(cities, { fields: [users.homeCityId], references: [cities.id] }),
		posts: many(posts),
		comments: many(comments),
	}),
]);

export const cities = pgTable('cities', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
});
export const citiesConfig = pgTableConfig(cities, ({ relations, many }) => [
	relations({
		users: many(users, { relationName: 'UsersInCity' }),
	}),
]);

export const posts = pgTable('posts', {
	id: serial('id').primaryKey(),
	title: text('title').notNull(),
	authorId: integer('user_id').references(() => users.id).notNull(),
});
export const postsConfig = pgTableConfig(posts, ({ relations, one, many }) => [
	relations({
		author: one(users, { fields: [posts.authorId], references: [users.id] }),
		comments: many(comments),
	}),
]);

export const comments = pgTable('comments', {
	id: serial('id').primaryKey(),
	postId: integer('post_id').references(() => posts.id).notNull(),
	authorId: integer('author_id').references(() => users.id).notNull(),
	text: text('text').notNull(),
});
export const commentsConfig = pgTableConfig(comments, ({ relations, one }) => [
	relations({
		post: one(posts, { fields: [comments.postId], references: [posts.id] }),
		author: one(users, { fields: [comments.authorId], references: [users.id] }),
	}),
]);

export const books = pgTable('books', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
});
export const booksConfig = pgTableConfig(books, ({ relations, many }) => [
	relations({
		authors: many(bookAuthors),
	}),
]);

export const bookAuthors = pgTable('book_authors', {
	bookId: integer('book_id').references(() => books.id).notNull(),
	authorId: integer('author_id').references(() => users.id).notNull(),
	role: text('role').notNull(),
});
export const bookAuthorsConfig = pgTableConfig(bookAuthors, ({ relations, one }) => [
	relations({
		book: one(books, { fields: [bookAuthors.bookId], references: [books.id] }),
		author: one(users, { fields: [bookAuthors.authorId], references: [users.id] }),
	}),
]);

export const node = pgTable('node', {
	id: serial('id').primaryKey(),
	parentId: integer('parent_id').references((): AnyPgColumn => node.id),
	leftId: integer('left_id'),
	rightId: integer('right_id'),
});
export const nodeConfig = pgTableConfig(node, ({ foreignKey, relations, one }) => [
	foreignKey({ fields: [node.leftId], references: [node.id] }),
	foreignKey({ fields: [node.rightId], references: [node.id] }),
	relations({
		parent: one(node, { fields: [node.parentId], references: [node.id] }),
		left: one(node, { fields: [node.leftId], references: [node.id] }),
		right: one(node, { fields: [node.rightId], references: [node.id] }),
	}),
]);
