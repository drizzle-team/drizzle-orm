import { boolean, integer, snakeCase, text, timestamptz } from 'drizzle-orm/gel-core';

export const usersTable = snakeCase.table('users', {
	id: integer('custom_id').unique().generatedByDefaultAsIdentity({
		name: 'default::users_id',
		minValue: 0,
		startWith: 1,
		increment: 1,
	}),
	name: text().notNull(),
	verified: boolean().notNull().default(false),
	invitedBy: integer(),
});

export const groupsTable = snakeCase.table('groups', {
	id: integer('custom_id').unique().generatedByDefaultAsIdentity({
		name: 'default::groups_id',
		minValue: 0,
		startWith: 1,
		increment: 1,
	}),
	name: text().notNull(),
	description: text(),
});

export const usersToGroupsTable = snakeCase.table('users_to_groups', {
	id: integer('custom_id').unique().generatedByDefaultAsIdentity({
		name: 'default::users_to_groups_id',
		minValue: 0,
		startWith: 1,
		increment: 1,
	}),
	userId: integer().notNull(),
	groupId: integer().notNull(),
});

export const postsTable = snakeCase.table('posts', {
	id: integer('custom_id').unique().generatedByDefaultAsIdentity({
		name: 'default::posts_id',
		minValue: 0,
		startWith: 1,
		increment: 1,
	}),
	content: text().notNull(),
	ownerId: integer(),
	createdAt: timestamptz().notNull().defaultNow(),
});

export const commentsTable = snakeCase.table('comments', {
	id: integer('custom_id').unique().generatedByDefaultAsIdentity({
		name: 'default::comments_id',
		minValue: 0,
		startWith: 1,
		increment: 1,
	}),
	content: text().notNull(),
	creator: integer(),
	postId: integer(),
	createdAt: timestamptz().notNull().defaultNow(),
});

export const commentLikesTable = snakeCase.table('comment_likes', {
	id: integer('custom_id').unique().generatedByDefaultAsIdentity({
		name: 'default::comments_likes_id',
		minValue: 0,
		startWith: 1,
		increment: 1,
	}),
	creator: integer(),
	commentId: integer(),
	createdAt: timestamptz().notNull().defaultNow(),
});

export const rqbSchema = snakeCase.schema('rqb_test_schema');

export const schemaUsers = rqbSchema.table('users', {
	id: integer('custom_id').unique().generatedByDefaultAsIdentity({
		name: 'rqb_test_schema::users_id',
		minValue: 0,
		startWith: 1,
		increment: 1,
	}),
	name: text().notNull(),
	verified: boolean().notNull().default(false),
	invitedBy: integer(),
});

export const schemaPosts = rqbSchema.table('posts', {
	id: integer('custom_id').unique().generatedByDefaultAsIdentity({
		name: 'rqb_test_schema::posts_id',
		minValue: 0,
		startWith: 1,
		increment: 1,
	}),
	content: text().notNull(),
	ownerId: integer(),
	createdAt: timestamptz().notNull().defaultNow(),
});

export const schemaGroups = rqbSchema.table('groups', {
	id: integer('custom_id').unique().generatedByDefaultAsIdentity({
		name: 'rqb_test_schema::groups_id',
		minValue: 0,
		startWith: 1,
		increment: 1,
	}),
	name: text().notNull(),
	description: text(),
});

export const schemaUsersToGroups = rqbSchema.table('users_to_groups', {
	id: integer('custom_id').unique().generatedByDefaultAsIdentity({
		name: 'rqb_test_schema::users_to_groups_id',
		minValue: 0,
		startWith: 1,
		increment: 1,
	}),
	userId: integer().notNull(),
	groupId: integer().notNull(),
});
