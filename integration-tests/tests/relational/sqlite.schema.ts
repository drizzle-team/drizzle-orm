import {
	alias,
	type AnySQLiteColumn,
	blob,
	integer,
	numeric,
	primaryKey,
	real,
	sqliteTable,
	sqliteView,
	text,
} from 'drizzle-orm/sqlite-core';

import { eq, getTableColumns, ne, sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm/_relations';

export const usersTable = sqliteTable('users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	verified: integer('verified').notNull().default(0),
	invitedBy: integer('invited_by').references((): AnySQLiteColumn => usersTable.id),
});
export const usersConfig = relations(usersTable, ({ one, many }) => ({
	invitee: one(usersTable, {
		fields: [usersTable.invitedBy],
		references: [usersTable.id],
	}),
	usersToGroups: many(usersToGroupsTable),
	posts: many(postsTable),
}));

export const groupsTable = sqliteTable('groups', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	description: text('description'),
});
export const groupsConfig = relations(groupsTable, ({ many }) => ({
	usersToGroups: many(usersToGroupsTable),
}));

export const usersToGroupsTable = sqliteTable(
	'users_to_groups',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id', { mode: 'number' }).notNull().references(
			() => usersTable.id,
		),
		groupId: integer('group_id', { mode: 'number' }).notNull().references(
			() => groupsTable.id,
		),
	},
	(t) => ({
		pk: primaryKey(t.userId, t.groupId),
	}),
);
export const usersToGroupsConfig = relations(usersToGroupsTable, ({ one }) => ({
	group: one(groupsTable, {
		fields: [usersToGroupsTable.groupId],
		references: [groupsTable.id],
	}),
	user: one(usersTable, {
		fields: [usersToGroupsTable.userId],
		references: [usersTable.id],
	}),
}));

export const postsTable = sqliteTable('posts', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	content: text('content').notNull(),
	ownerId: integer('owner_id', { mode: 'number' }).references(
		() => usersTable.id,
	),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull().default(sql`current_timestamp`),
});
export const postsConfig = relations(postsTable, ({ one, many }) => ({
	author: one(usersTable, {
		fields: [postsTable.ownerId],
		references: [usersTable.id],
	}),
	comments: many(commentsTable),
}));

export const usersView = sqliteView('users_view').as((qb) =>
	qb.select({
		...getTableColumns(usersTable),
		postContent: postsTable.content,
		createdAt: postsTable.createdAt,
		counter: sql<string>`(select count(*) from ${usersTable} as ${alias(usersTable, 'count_source')} where ${
			ne(usersTable.id, 2)
		})`
			.mapWith((data) => {
				return data === '0' || data === 0 ? null : Number(data);
			}).as('count'),
	})
		.from(usersTable).leftJoin(postsTable, eq(usersTable.id, postsTable.ownerId))
);

export const commentsTable = sqliteTable('comments', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	content: text('content').notNull(),
	creator: integer('creator', { mode: 'number' }).references(
		() => usersTable.id,
	),
	postId: integer('post_id', { mode: 'number' }).references(() => postsTable.id),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull().default(sql`current_timestamp`),
});
export const commentsConfig = relations(commentsTable, ({ one, many }) => ({
	post: one(postsTable, {
		fields: [commentsTable.postId],
		references: [postsTable.id],
	}),
	author: one(usersTable, {
		fields: [commentsTable.creator],
		references: [usersTable.id],
	}),
	likes: many(commentLikesTable),
}));

export const commentLikesTable = sqliteTable('comment_likes', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	creator: integer('creator', { mode: 'number' }).references(
		() => usersTable.id,
	),
	commentId: integer('comment_id', { mode: 'number' }).references(
		() => commentsTable.id,
	),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull().default(sql`current_timestamp`),
});
export const commentLikesConfig = relations(commentLikesTable, ({ one }) => ({
	comment: one(commentsTable, {
		fields: [commentLikesTable.commentId],
		references: [commentsTable.id],
	}),
	author: one(usersTable, {
		fields: [commentLikesTable.creator],
		references: [usersTable.id],
	}),
}));

export const allTypes = sqliteTable('all_types', {
	int: integer({
		mode: 'number',
	}),
	bool: integer({
		mode: 'boolean',
	}),
	time: integer({
		mode: 'timestamp',
	}),
	timeMs: integer({
		mode: 'timestamp_ms',
	}),
	bigint: blob({
		mode: 'bigint',
	}),
	buffer: blob({
		mode: 'buffer',
	}),
	json: blob({
		mode: 'json',
	}),
	numeric: numeric(),
	real: real(),
	text: text({
		mode: 'text',
	}),
	jsonText: text({
		mode: 'json',
	}),
});
