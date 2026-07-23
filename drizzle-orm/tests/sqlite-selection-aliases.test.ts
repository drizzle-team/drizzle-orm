import { expect, test } from 'vitest';
import { eq } from '~/sql/index.ts';
import { QueryBuilder } from '~/sqlite-core/query-builders/query-builder.ts';
import { integer, sqliteTable, text } from '~/sqlite-core/index.ts';

const users = sqliteTable('users', {
	id: integer().primaryKey(),
	name: text().notNull(),
});

const posts = sqliteTable('posts', {
	id: integer().primaryKey(),
	userId: integer()
		.notNull()
		.references(() => users.id),
	title: text().notNull(),
});

test('join select remaps duplicate column names with distinct AS aliases', () => {
	const qb = new QueryBuilder();
	const { sql: sqlText } = qb
		.select({
			userId: users.id,
			postId: posts.id,
			postTitle: posts.title,
		})
		.from(posts)
		.innerJoin(users, eq(users.id, posts.userId))
		.toSQL();

	// D1 batch returns object rows; without these aliases both ids collapse to one key.
	expect(sqlText).toContain('"users"."id" as "userId"');
	expect(sqlText).toContain('"posts"."id" as "postId"');
	expect(sqlText).toContain('"posts"."title" as "postTitle"');
});
