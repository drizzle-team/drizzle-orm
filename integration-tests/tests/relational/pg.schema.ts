import { boolean, integer, type PgColumn, pgTable, primaryKey, serial, text, timestamp } from 'drizzle-orm/pg-core';

import { eq, relations } from 'drizzle-orm';

export const usersTable = pgTable('users', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	invitedBy: integer('invited_by').references((): PgColumn => usersTable.id),
});

export const usersConfig = relations(usersTable, ({ one, many }) => ({
	invitee: one(usersTable, { fields: [usersTable.invitedBy], references: [usersTable.id] }),
	usersToGroups: many(usersToGroupsTable),
	posts: many(postsTable),
	notes: many(notes, {
		where: eq(notes.notableType, 'user'),
	}),
}));

export const groupsTable = pgTable('groups', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	description: text('description'),
});

export const groupsConfig = relations(groupsTable, ({ many }) => ({
	usersToGroups: many(usersToGroupsTable),
}));

export const usersToGroupsTable = pgTable('users_to_groups', {
	id: serial('id').primaryKey(),
	userId: integer('user_id').notNull().references(() => usersTable.id),
	groupId: integer('group_id').notNull().references(() => groupsTable.id),
}, (t) => ({
	pk: primaryKey(t.groupId, t.userId),
}));

export const usersToGroupsConfig = relations(usersToGroupsTable, ({ one }) => ({
	group: one(groupsTable, { fields: [usersToGroupsTable.groupId], references: [groupsTable.id] }),
	user: one(usersTable, { fields: [usersToGroupsTable.userId], references: [usersTable.id] }),
}));

export const postsTable = pgTable('posts', {
	id: serial('id').primaryKey(),
	content: text('content').notNull(),
	ownerId: integer('owner_id').references(() => usersTable.id),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const postsConfig = relations(postsTable, ({ one, many }) => ({
	author: one(usersTable, { fields: [postsTable.ownerId], references: [usersTable.id] }),
	comments: many(commentsTable),
	notes: many(notes, {
		where: eq(notes.notableType, 'post'),
	}),
}));

export const commentsTable = pgTable('comments', {
	id: serial('id').primaryKey(),
	content: text('content').notNull(),
	creator: integer('creator').references(() => usersTable.id),
	postId: integer('post_id').references(() => postsTable.id),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const commentsConfig = relations(commentsTable, ({ one, many }) => ({
	post: one(postsTable, { fields: [commentsTable.postId], references: [postsTable.id] }),
	author: one(usersTable, { fields: [commentsTable.creator], references: [usersTable.id] }),
	likes: many(commentLikesTable),
	notes: many(notes, {
		where: eq(notes.notableType, 'comment'),
	}),
}));

export const commentLikesTable = pgTable('comment_likes', {
	id: serial('id').primaryKey(),
	creator: integer('creator').references(() => usersTable.id),
	commentId: integer('comment_id').references(() => commentsTable.id),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const commentLikesConfig = relations(commentLikesTable, ({ one }) => ({
	comment: one(commentsTable, { fields: [commentLikesTable.commentId], references: [commentsTable.id] }),
	author: one(usersTable, { fields: [commentLikesTable.creator], references: [usersTable.id] }),
}));
export const notes = pgTable('notes', {
	id: serial('id').primaryKey(),
	content: text('content').notNull(),
	notableId: integer('notable_id').notNull(),
	notableType: text('notable_type', { enum: ['user', 'post', 'comment'] }).notNull(),
});

export const notesConfig = relations(notes, ({ one }) => ({
	user: one(usersTable, {
		fields: [notes.notableId],
		references: [usersTable.id],
	}),
	post: one(postsTable, {
		fields: [notes.notableId],
		references: [postsTable.id],
	}),
	comment: one(commentsTable, {
		fields: [notes.notableId],
		references: [commentsTable.id],
		where: eq(commentsTable.content, 'comment'), // only a comment that says "comment" will work
	}),
}));
