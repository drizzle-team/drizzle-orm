import { relations } from '~/relations.ts';
import { foreignKey, int, sqliteTable, text } from '~/sqlite-core/index.ts';

export const users = sqliteTable('users', {
	id: int('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	cityId: int('city_id').references(() => cities.id).notNull(),
	homeCityId: int('home_city_id').references(() => cities.id),
	createdAt: int('created_at', { mode: 'timestamp_ms' }).notNull(),
});
export const usersConfig = relations(users, ({ one, many }) => ({
	city: one(cities, { relationName: 'UsersInCity', fields: [users.cityId], references: [cities.id] }),
	homeCity: one(cities, { fields: [users.homeCityId], references: [cities.id] }),
	posts: many(posts),
	comments: many(comments),
}));

export const cities = sqliteTable('cities', {
	id: int('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
});
export const citiesConfig = relations(cities, ({ many }) => ({
	users: many(users, { relationName: 'UsersInCity' }),
}));

export const posts = sqliteTable('posts', {
	id: int('id').primaryKey({ autoIncrement: true }),
	title: text('title').notNull(),
	authorId: int('author_id').references(() => users.id),
});
export const postsConfig = relations(posts, ({ one, many }) => ({
	author: one(users, { fields: [posts.authorId], references: [users.id] }),
	comments: many(comments),
}));

export const comments = sqliteTable('comments', {
	id: int('id').primaryKey({ autoIncrement: true }),
	postId: int('post_id').references(() => posts.id).notNull(),
	authorId: int('author_id').references(() => users.id),
	text: text('text').notNull(),
});
export const commentsConfig = relations(comments, ({ one }) => ({
	post: one(posts, { fields: [comments.postId], references: [posts.id] }),
	author: one(users, { fields: [comments.authorId], references: [users.id] }),
}));

export const books = sqliteTable('books', {
	id: int('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
});
export const booksConfig = relations(books, ({ many }) => ({
	authors: many(bookAuthors),
}));

export const bookAuthors = sqliteTable('book_authors', {
	bookId: int('book_id').references(() => books.id).notNull(),
	authorId: int('author_id').references(() => users.id).notNull(),
	role: text('role').notNull(),
});
export const bookAuthorsConfig = relations(bookAuthors, ({ one }) => ({
	book: one(books, { fields: [bookAuthors.bookId], references: [books.id] }),
	author: one(users, { fields: [bookAuthors.authorId], references: [users.id] }),
}));

export const node = sqliteTable('node', {
	id: int('id').primaryKey({ autoIncrement: true }),
	parentId: int('parent_id'),
	leftId: int('left_id'),
	rightId: int('right_id'),
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
