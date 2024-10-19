import { eq, sql } from '~/index';
import { foreignKey, integer, pgTable, serial, text, timestamp } from '~/pg-core/index.ts';
import { relations } from '~/relations.ts';

export const users = pgTable('users', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	cityId: integer('city_id').references(() => cities.id).notNull(),
	homeCityId: integer('home_city_id').references(() => cities.id),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});
export const usersConfig = relations(users, ({ one, many }) => ({
	city: one(cities, { relationName: 'UsersInCity', fields: [users.cityId], references: [cities.id] }),
	homeCity: one(cities, { fields: [users.homeCityId], references: [cities.id] }),
	posts: many(posts),
	comments: many(comments),
	notes: many(notes, { where: eq(notes.notableType, 'User') }),
}));

export const cities = pgTable('cities', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
});
export const citiesConfig = relations(cities, ({ many }) => ({
	users: many(users, { relationName: 'UsersInCity' }),
}));

export const posts = pgTable('posts', {
	id: serial('id').primaryKey(),
	title: text('title').notNull(),
	authorId: integer('author_id').references(() => users.id),
});
export const postsConfig = relations(posts, ({ one, many }) => ({
	author: one(users, { fields: [posts.authorId], references: [users.id] }),
	comments: many(comments),
	notes: many(notes, { where: eq(notes.notableType, 'Post') }),
}));

export const comments = pgTable('comments', {
	id: serial('id').primaryKey(),
	postId: integer('post_id').references(() => posts.id).notNull(),
	authorId: integer('author_id').references(() => users.id),
	text: text('text').notNull(),
});
export const commentsConfig = relations(comments, ({ one, many }) => ({
	post: one(posts, { fields: [comments.postId], references: [posts.id] }),
	author: one(users, { fields: [comments.authorId], references: [users.id] }),
	notes: many(notes, { where: eq(notes.notableType, 'Comment') }),
}));

export const books = pgTable('books', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
});
export const booksConfig = relations(books, ({ many }) => ({
	authors: many(bookAuthors),
}));

export const bookAuthors = pgTable('book_authors', {
	bookId: integer('book_id').references(() => books.id).notNull(),
	authorId: integer('author_id').references(() => users.id).notNull(),
	role: text('role').notNull(),
});
export const bookAuthorsConfig = relations(bookAuthors, ({ one }) => ({
	book: one(books, { fields: [bookAuthors.bookId], references: [books.id] }),
	author: one(users, { fields: [bookAuthors.authorId], references: [users.id] }),
}));

export const node = pgTable('node', {
	id: serial('id').primaryKey(),
	parentId: integer('parent_id'),
	leftId: integer('left_id'),
	rightId: integer('right_id'),
}, (node) => ({
	fk1: foreignKey({ columns: [node.parentId], foreignColumns: [node.id] }),
	fk2: foreignKey({ columns: [node.leftId], foreignColumns: [node.id] }),
	fk3: foreignKey({ columns: [node.rightId], foreignColumns: [node.id] }),
}));
export const nodeRelations = relations(node, ({ one }) => ({
	parent: one(node, { fields: [node.parentId], references: [node.id] }),
	left: one(node, { fields: [node.leftId], references: [node.id] }),
	right: one(node, { fields: [node.rightId], references: [node.id] }),
}));

export const notes = pgTable('note', {
	id: serial('id').primaryKey(),
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
