import { relations } from 'drizzle-orm';

import { mysqlView } from 'drizzle-orm/mysql-core';
import {
	commentLikesTable,
	commentsTable,
	groupsTable,
	postsTable,
	usersTable,
	usersToGroupsTable,
} from './mysql.schema.ts';

export const usersView = mysqlView('users_view').as((qb) =>
	qb.select({
		id: usersTable.id,
		name: usersTable.name,
		invitedBy: usersTable.invitedBy,
	}).from(usersTable)
);

export const usersConfig = relations(usersView, ({ one, many }) => ({
	invitee: one(usersView, {
		fields: [usersView.invitedBy],
		references: [usersView.id],
	}),
	usersToGroups: many(usersToGroupsView),
	posts: many(postsView),
	comments: many(commentsView),
}));

export const groupsView = mysqlView('groups_view').as((qb) =>
	qb.select({
		id: groupsTable.id,
		name: groupsTable.name,
		description: groupsTable.description,
	}).from(groupsTable)
);

export const groupsConfig = relations(groupsView, ({ many }) => ({
	usersToGroups: many(usersToGroupsView),
}));

export const usersToGroupsView = mysqlView('users_to_groups_view').as((qb) =>
	qb.select({
		id: usersToGroupsTable.id,
		userId: usersToGroupsTable.userId,
		groupId: usersToGroupsTable.groupId,
	}).from(usersToGroupsTable)
);

export const usersToGroupsConfig = relations(usersToGroupsView, ({ one }) => ({
	group: one(groupsView, {
		fields: [usersToGroupsView.groupId],
		references: [groupsView.id],
	}),
	user: one(usersView, {
		fields: [usersToGroupsView.userId],
		references: [usersView.id],
	}),
}));

export const postsView = mysqlView('posts_view').as((qb) =>
	qb.select({
		id: postsTable.id,
		content: postsTable.content,
		ownerId: postsTable.ownerId,
	}).from(postsTable)
);

export const postsConfig = relations(postsView, ({ one, many }) => ({
	author: one(usersView, {
		fields: [postsView.ownerId],
		references: [usersView.id],
	}),
	comments: many(commentsView),
}));

export const commentsView = mysqlView('comments_view').as((qb) =>
	qb.select({
		id: commentsTable.id,
		content: commentsTable.content,
		postId: commentsTable.postId,
		creator: commentsTable.creator,
	}).from(commentsTable)
);

export const commentsConfig = relations(commentsView, ({ one, many }) => ({
	post: one(postsView, {
		fields: [commentsView.postId],
		references: [postsView.id],
	}),
	author: one(usersView, {
		fields: [commentsView.creator],
		references: [usersView.id],
	}),
	likes: many(commentLikesView),
}));

export const commentLikesView = mysqlView('comment_likes_view').as((qb) =>
	qb.select({
		id: commentLikesTable.id,
		commentId: commentLikesTable.commentId,
		creator: commentLikesTable.creator,
	}).from(commentLikesTable)
);

export const commentLikesConfig = relations(commentLikesView, ({ one }) => ({
	comment: one(commentsView, {
		fields: [commentLikesView.commentId],
		references: [commentsView.id],
	}),
	author: one(usersView, {
		fields: [commentLikesView.creator],
		references: [usersView.id],
	}),
}));
