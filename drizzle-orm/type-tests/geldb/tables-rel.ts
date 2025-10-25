import { relations } from '~/_relations.ts';
import { foreignKey, gelTable, integer, text, timestamptz } from '~/gel-core/index.ts';

export const users = gelTable('users', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	cityId: integer('city_id').references(() => cities.id).notNull(),
	homeCityId: integer('home_city_id').references(() => cities.id),
	createdAt: timestamptz('created_at').notNull(),
});
export const usersConfig = relations(users, ({ one, many }) => ({
	city: one(cities, { relationName: 'UsersInCity', fields: [users.cityId], references: [cities.id] }),
	homeCity: one(cities, { fields: [users.homeCityId], references: [cities.id] }),
	posts: many(posts),
	comments: many(comments),
}));

export const cities = gelTable('cities', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
});
export const citiesConfig = relations(cities, ({ many }) => ({
	users: many(users, { relationName: 'UsersInCity' }),
}));

export const posts = gelTable('posts', {
	id: integer('id').primaryKey(),
	title: text('title').notNull(),
	authorId: integer('author_id').references(() => users.id),
});
export const postsConfig = relations(posts, ({ one, many }) => ({
	author: one(users, { fields: [posts.authorId], references: [users.id] }),
	comments: many(comments),
}));

export const comments = gelTable('comments', {
	id: integer('id').primaryKey(),
	postId: integer('post_id').references(() => posts.id).notNull(),
	authorId: integer('author_id').references(() => users.id),
	text: text('text').notNull(),
});
export const commentsConfig = relations(comments, ({ one }) => ({
	post: one(posts, { fields: [comments.postId], references: [posts.id] }),
	author: one(users, { fields: [comments.authorId], references: [users.id] }),
}));

export const books = gelTable('books', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
});
export const booksConfig = relations(books, ({ many }) => ({
	authors: many(bookAuthors),
}));

export const bookAuthors = gelTable('book_authors', {
	bookId: integer('book_id').references(() => books.id).notNull(),
	authorId: integer('author_id').references(() => users.id).notNull(),
	role: text('role').notNull(),
});
export const bookAuthorsConfig = relations(bookAuthors, ({ one }) => ({
	book: one(books, { fields: [bookAuthors.bookId], references: [books.id] }),
	author: one(users, { fields: [bookAuthors.authorId], references: [users.id] }),
}));

export const node = gelTable('node', {
	id: integer('id').primaryKey(),
	parentId: integer('parent_id'),
	leftId: integer('left_id'),
	rightId: integer('right_id'),
}, (node) => [
	foreignKey({ columns: [node.parentId], foreignColumns: [node.id] }),
	foreignKey({ columns: [node.leftId], foreignColumns: [node.id] }),
	foreignKey({ columns: [node.rightId], foreignColumns: [node.id] }),
]);
export const nodeRelations = relations(node, ({ one }) => ({
	parent: one(node, { fields: [node.parentId], references: [node.id] }),
	left: one(node, { fields: [node.leftId], references: [node.id] }),
	right: one(node, { fields: [node.rightId], references: [node.id] }),
}));
