import { boolean, dsqlTable, integer, text, timestamp, uuid } from 'drizzle-orm/dsql-core';

export const usersTable = dsqlTable('rqb_users', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	email: text('email'),
	invitedBy: uuid('invited_by'),
});

export const postsTable = dsqlTable('rqb_posts', {
	id: uuid('id').primaryKey().defaultRandom(),
	content: text('content').notNull(),
	ownerId: uuid('owner_id').notNull(),
});

export const commentsTable = dsqlTable('rqb_comments', {
	id: uuid('id').primaryKey().defaultRandom(),
	text: text('text').notNull(),
	postId: uuid('post_id').notNull(),
	authorId: uuid('author_id').notNull(),
});

export const groupsTable = dsqlTable('rqb_groups', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
});

export const usersToGroupsTable = dsqlTable('rqb_users_to_groups', {
	userId: uuid('user_id').notNull(),
	groupId: uuid('group_id').notNull(),
});
