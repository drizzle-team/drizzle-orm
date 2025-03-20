import {
	type AnyMySqlColumn,
	bigint,
	boolean,
	mysqlSchema,
	mysqlTable,
	primaryKey,
	serial,
	text,
	timestamp,
} from 'drizzle-orm/mysql-core';

import { relations } from 'drizzle-orm';

export const usersTable = mysqlTable('users', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	invitedBy: bigint('invited_by', { mode: 'number' }).references(
		(): AnyMySqlColumn => usersTable.id,
	),
});

const schemaV1 = mysqlSchema('schemaV1');

export const usersV1 = schemaV1.table('usersV1', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	invitedBy: bigint('invited_by', { mode: 'number' }),
});

export const usersTableV1 = schemaV1.table('users_table_V1', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	invitedBy: bigint('invited_by', { mode: 'number' }),
});

export const usersConfig = relations(usersTable, ({ one, many }) => ({
	invitee: one(usersTable, {
		fields: [usersTable.invitedBy],
		references: [usersTable.id],
	}),
	usersToGroups: many(usersToGroupsTable),
	posts: many(postsTable),
	comments: many(commentsTable),
}));

export const groupsTable = mysqlTable('groups', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	description: text('description'),
});
export const groupsConfig = relations(groupsTable, ({ many }) => ({
	usersToGroups: many(usersToGroupsTable),
}));

export const usersToGroupsTable = mysqlTable(
	'users_to_groups',
	{
		id: serial('id').primaryKey(),
		userId: bigint('user_id', { mode: 'number' }).notNull().references(
			() => usersTable.id,
		),
		groupId: bigint('group_id', { mode: 'number' }).notNull().references(
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

export const postsTable = mysqlTable('posts', {
	id: serial('id').primaryKey(),
	content: text('content').notNull(),
	ownerId: bigint('owner_id', { mode: 'number' }).references(
		() => usersTable.id,
	),
	createdAt: timestamp('created_at')
		.notNull()
		.defaultNow(),
});
export const postsConfig = relations(postsTable, ({ one, many }) => ({
	author: one(usersTable, {
		fields: [postsTable.ownerId],
		references: [usersTable.id],
	}),
	comments: many(commentsTable),
}));

export const commentsTable = mysqlTable('comments', {
	id: serial('id').primaryKey(),
	content: text('content').notNull(),
	creator: bigint('creator', { mode: 'number' }).references(
		() => usersTable.id,
	),
	postId: bigint('post_id', { mode: 'number' }).references(() => postsTable.id),
	createdAt: timestamp('created_at')
		.notNull()
		.defaultNow(),
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

export const commentLikesTable = mysqlTable('comment_likes', {
	id: serial('id').primaryKey(),
	creator: bigint('creator', { mode: 'number' }).references(
		() => usersTable.id,
	),
	commentId: bigint('comment_id', { mode: 'number' }).references(
		() => commentsTable.id,
	),
	createdAt: timestamp('created_at')
		.notNull()
		.defaultNow(),
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
