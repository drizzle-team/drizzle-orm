import { type AnyMsSqlColumn, bit, datetime, int, mssqlTable, primaryKey, varchar } from 'drizzle-orm/mssql-core';

import { relations, sql } from 'drizzle-orm';

export const usersTable = mssqlTable('users', {
	id: int('id').primaryKey().notNull(),
	name: varchar('name', { length: 100 }).notNull(),
	verified: bit('verified').notNull().default(false),
	invitedBy: int('invited_by').references((): AnyMsSqlColumn => usersTable.id),
});
export const usersConfig = relations(usersTable, ({ one, many }) => ({
	invitee: one(usersTable, {
		fields: [usersTable.invitedBy],
		references: [usersTable.id],
	}),
	usersToGroups: many(usersToGroupsTable),
	posts: many(postsTable),
}));

export const groupsTable = mssqlTable('groups', {
	id: int('id').primaryKey().identity().notNull(),
	name: varchar('name', { length: 100 }).notNull(),
	description: varchar('description', { length: 100 }),
});
export const groupsConfig = relations(groupsTable, ({ many }) => ({
	usersToGroups: many(usersToGroupsTable),
}));

export const usersToGroupsTable = mssqlTable(
	'users_to_groups',
	{
		id: int('id').primaryKey().identity().notNull(),
		userId: int('user_id').notNull().references(
			() => usersTable.id,
		),
		groupId: int('group_id').notNull().references(
			() => groupsTable.id,
		),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.userId, t.groupId] }),
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

export const postsTable = mssqlTable('posts', {
	id: int('id').primaryKey().identity().notNull(),
	content: varchar('content', { length: 100 }).notNull(),
	ownerId: int('owner_id').references(
		() => usersTable.id,
	),
	createdAt: datetime('created_at')
		.notNull().default(sql`current_timestamp`),
});
export const postsConfig = relations(postsTable, ({ one, many }) => ({
	author: one(usersTable, {
		fields: [postsTable.ownerId],
		references: [usersTable.id],
	}),
	comments: many(commentsTable),
}));

export const commentsTable = mssqlTable('comments', {
	id: int('id').primaryKey().identity().notNull(),
	content: varchar('content', { length: 100 }).notNull(),
	creator: int('creator').references(
		() => usersTable.id,
	),
	postId: int('post_id').references(() => postsTable.id),
	createdAt: datetime('created_at')
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

export const commentLikesTable = mssqlTable('comment_likes', {
	id: int('id').primaryKey().identity().notNull(),
	creator: int('creator').references(
		() => usersTable.id,
	),
	commentId: int('comment_id').references(
		() => commentsTable.id,
	),
	createdAt: datetime('created_at')
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
