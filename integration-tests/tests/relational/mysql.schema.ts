import {
	alias,
	type AnyMySqlColumn,
	bigint,
	binary,
	boolean,
	char,
	date,
	datetime,
	decimal,
	double,
	float,
	int,
	json,
	mediumint,
	mysqlEnum,
	mysqlSchema,
	mysqlTable,
	mysqlView,
	primaryKey,
	real,
	serial,
	smallint,
	text,
	time,
	timestamp,
	tinyint,
	varbinary,
	varchar,
	year,
} from 'drizzle-orm/mysql-core';

import { eq, getTableColumns, ne, sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm/_relations';

export const usersTable = mysqlTable('users', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	invitedBy: bigint('invited_by', { mode: 'number' }).references(
		(): AnyMySqlColumn => usersTable.id,
	),
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

export const usersView = mysqlView('rqb_users_view').as((qb) =>
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

export const rqbSchema = mysqlSchema('rqb_test_schema');

export const schemaUsers = rqbSchema.table('users', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	invitedBy: bigint('invited_by', { mode: 'number' }).references(
		(): AnyMySqlColumn => schemaUsers.id,
	),
});

export const schemaPosts = rqbSchema.table('posts', {
	id: serial('id').primaryKey(),
	content: text('content').notNull(),
	ownerId: bigint('owner_id', { mode: 'number' }).references(
		() => schemaUsers.id,
	),
	createdAt: timestamp('created_at')
		.notNull()
		.defaultNow(),
});

export const schemaGroups = rqbSchema.table('groups', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	description: text('description'),
});

export const schemaUsersToGroups = rqbSchema.table(
	'users_to_groups',
	{
		id: serial('id').primaryKey(),
		userId: bigint('user_id', { mode: 'number' }).notNull().references(
			() => schemaUsers.id,
		),
		groupId: bigint('group_id', { mode: 'number' }).notNull().references(
			() => schemaGroups.id,
		),
	},
	(t) => ({
		pk: primaryKey(t.userId, t.groupId),
	}),
);

export const schemaUsersView = rqbSchema.view('users_sch_view').as((qb) =>
	qb.select({
		...getTableColumns(schemaUsers),
		postContent: schemaPosts.content,
		createdAt: schemaPosts.createdAt,
		counter: sql<string>`(select count(*) from ${schemaUsers} as ${alias(schemaUsers, 'count_source')} where ${
			ne(schemaUsers.id, 2)
		})`
			.mapWith((data) => {
				return data === '0' || data === 0 ? null : Number(data);
			}).as('count'),
	})
		.from(schemaUsers).leftJoin(schemaPosts, eq(schemaUsers.id, schemaPosts.ownerId))
);

export const allTypes = mysqlTable('all_types', {
	serial: serial(),
	bigint53: bigint({
		mode: 'number',
	}),
	bigint64: bigint({
		mode: 'bigint',
	}),
	binary: binary(),
	boolean: boolean(),
	char: char(),
	date: date({
		mode: 'date',
	}),
	dateStr: date({
		mode: 'string',
	}),
	datetime: datetime({
		mode: 'date',
	}),
	datetimeStr: datetime({
		mode: 'string',
	}),
	decimal: decimal(),
	double: double(),
	float: float(),
	int: int(),
	json: json(),
	medInt: mediumint(),
	smallInt: smallint(),
	real: real(),
	text: text(),
	time: time(),
	timestamp: timestamp({
		mode: 'date',
	}),
	timestampStr: timestamp({
		mode: 'string',
	}),
	tinyInt: tinyint(),
	varbin: varbinary({
		length: 16,
	}),
	varchar: varchar({}),
	year: year(),
	enum: mysqlEnum(['enV1', 'enV2']),
});
