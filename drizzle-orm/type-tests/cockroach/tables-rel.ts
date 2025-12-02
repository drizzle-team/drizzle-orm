import { relations } from '~/_relations.ts';
import { cockroachTable, foreignKey, int4, text, timestamp } from '~/cockroach-core/index.ts';

export const users = cockroachTable('users', {
	id: int4('id').primaryKey(),
	name: text('name').notNull(),
	cityId: int4('city_id').references(() => cities.id).notNull(),
	homeCityId: int4('home_city_id').references(() => cities.id),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});
export const usersConfig = relations(users, ({ one, many }) => ({
	city: one(cities, { relationName: 'UsersInCity', fields: [users.cityId], references: [cities.id] }),
	homeCity: one(cities, { fields: [users.homeCityId], references: [cities.id] }),
	posts: many(posts),
	comments: many(comments),
}));

export const cities = cockroachTable('cities', {
	id: int4('id').primaryKey(),
	name: text('name').notNull(),
});
export const citiesConfig = relations(cities, ({ many }) => ({
	users: many(users, { relationName: 'UsersInCity' }),
}));

export const posts = cockroachTable('posts', {
	id: int4('id').primaryKey(),
	title: text('title').notNull(),
	authorId: int4('author_id').references(() => users.id),
});
export const postsConfig = relations(posts, ({ one, many }) => ({
	author: one(users, { fields: [posts.authorId], references: [users.id] }),
	comments: many(comments),
}));

export const comments = cockroachTable('comments', {
	id: int4('id').primaryKey(),
	postId: int4('post_id').references(() => posts.id).notNull(),
	authorId: int4('author_id').references(() => users.id),
	text: text('text').notNull(),
});
export const commentsConfig = relations(comments, ({ one }) => ({
	post: one(posts, { fields: [comments.postId], references: [posts.id] }),
	author: one(users, { fields: [comments.authorId], references: [users.id] }),
}));

export const books = cockroachTable('books', {
	id: int4('id').primaryKey(),
	name: text('name').notNull(),
});
export const booksConfig = relations(books, ({ many }) => ({
	authors: many(bookAuthors),
}));

export const bookAuthors = cockroachTable('book_authors', {
	bookId: int4('book_id').references(() => books.id).notNull(),
	authorId: int4('author_id').references(() => users.id).notNull(),
	role: text('role').notNull(),
});
export const bookAuthorsConfig = relations(bookAuthors, ({ one }) => ({
	book: one(books, { fields: [bookAuthors.bookId], references: [books.id] }),
	author: one(users, { fields: [bookAuthors.authorId], references: [users.id] }),
}));

export const node = cockroachTable('node', {
	id: int4('id').primaryKey(),
	parentId: int4('parent_id'),
	leftId: int4('left_id'),
	rightId: int4('right_id'),
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
