import { bigint, boolean, primaryKey, serial, singlestoreTable, text, timestamp } from 'drizzle-orm/singlestore-core';

import { relations } from 'drizzle-orm';

export const usersTable = singlestoreTable('users', {
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

export const groupsTable = singlestoreTable('groups', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	description: text('description'),
});
export const groupsConfig = relations(groupsTable, ({ many }) => ({
	usersToGroups: many(usersToGroupsTable),
}));

export const usersToGroupsTable = singlestoreTable(
	'users_to_groups',
	{
		id: serial('id').primaryKey(),
		userId: bigint('user_id', { mode: 'number' }).notNull(),
		groupId: bigint('group_id', { mode: 'number' }).notNull(),
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

export const postsTable = singlestoreTable('posts', {
	id: serial('id').primaryKey(),
	content: text('content').notNull(),
	ownerId: bigint('owner_id', { mode: 'number' }),
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

export const commentsTable = singlestoreTable('comments', {
	id: serial('id').primaryKey(),
	content: text('content').notNull(),
	creator: bigint('creator', { mode: 'number' }),
	postId: bigint('post_id', { mode: 'number' }),
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

export const commentLikesTable = singlestoreTable('comment_likes', {
	id: serial('id').primaryKey(),
	creator: bigint('creator', { mode: 'number' }),
	commentId: bigint('comment_id', { mode: 'number' }),
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
