import { describe, expect, it } from 'vitest';
import { relations } from '~/relations.ts';
import { SQLiteRelationalQuery } from '~/sqlite-core/query-builders/query.ts';
import { integer, sqliteTable, text } from '~/sqlite-core/index.ts';
import { extractUsedTable } from '~/sqlite-core/utils.ts';
import { drizzle } from '~/sqlite-proxy/index.ts';

const users = sqliteTable('users', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
});

const posts = sqliteTable('posts', {
	id: integer('id').primaryKey(),
	title: text('title').notNull(),
	userId: integer('user_id').notNull(),
});

const comments = sqliteTable('comments', {
	id: integer('id').primaryKey(),
	body: text('body').notNull(),
	postId: integer('post_id').notNull(),
});

const usersRelations = relations(users, ({ many }) => ({
	posts: many(posts),
}));

const postsRelations = relations(posts, ({ one, many }) => ({
	user: one(users, { fields: [posts.userId], references: [users.id] }),
	comments: many(comments),
}));

const commentsRelations = relations(comments, ({ one }) => ({
	post: one(posts, { fields: [comments.postId], references: [posts.id] }),
}));

const schema = { users, posts, comments, usersRelations, postsRelations, commentsRelations };

// sqlite-proxy driver — zero native deps; the callback never runs because we
// only build queries and inspect their metadata.
const db = drizzle(async () => ({ rows: [] }), { schema });

describe('expo-sqlite useLiveQuery — table discovery helpers', () => {
	it('getReferencedTables returns only the root table when no `with` is passed', () => {
		const q = db.query.users.findMany();
		expect(q).toBeInstanceOf(SQLiteRelationalQuery);
		expect((q as unknown as SQLiteRelationalQuery<'async', unknown>).getReferencedTables().sort()).toEqual(['users']);
	});

	it('getReferencedTables returns the root table and every table reached through `with`', () => {
		const q = db.query.users.findMany({ with: { posts: true } });
		expect((q as unknown as SQLiteRelationalQuery<'async', unknown>).getReferencedTables().sort()).toEqual([
			'posts',
			'users',
		]);
	});

	it('getReferencedTables walks nested `with` relations', () => {
		const q = db.query.users.findMany({ with: { posts: { with: { comments: true } } } });
		expect((q as unknown as SQLiteRelationalQuery<'async', unknown>).getReferencedTables().sort()).toEqual([
			'comments',
			'posts',
			'users',
		]);
	});

	it('getReferencedTables ignores relations whose value is a falsy flag', () => {
		const q = db.query.users.findMany({ with: { posts: false as unknown as true } });
		expect((q as unknown as SQLiteRelationalQuery<'async', unknown>).getReferencedTables().sort()).toEqual(['users']);
	});

	it('extractUsedTable returns the base name of a joined SQLite table', () => {
		expect(extractUsedTable(posts)).toEqual(['posts']);
		expect(extractUsedTable(comments)).toEqual(['comments']);
	});
});
