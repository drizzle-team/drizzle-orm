import { type AnySQLiteColumn, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { defaultBucket } from '../create-docker-s3';

import { relations, sql } from 'drizzle-orm';
import { s3File } from 'drizzle-orm/extensions/s3-file/sqlite';

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

export const exampleS3Files = [
	Buffer.from('examplefile-zero', 'ascii'),
	Buffer.from('examplefile-first', 'ascii'),
	Buffer.from('examplefile-second', 'ascii'),
	Buffer.from('examplefile-third', 'ascii'),
	Buffer.from('examplefile-fourth', 'ascii'),
	Buffer.from('examplefile-fifth', 'ascii'),
	Buffer.from('examplefile-sixth', 'ascii'),
	Buffer.from('examplefile-seventh', 'ascii'),
	Buffer.from('examplefile-eigth', 'ascii'),
	Buffer.from('examplefile-ninth', 'ascii'),
] as const;

export const s3Table = sqliteTable('s3files', {
	id: integer('id').primaryKey(),
	file: s3File('file', { mode: 'buffer' }),
	defaultFnFile: s3File('file_default_fn', { mode: 'buffer' }).$default(() => ({
		bucket: defaultBucket,
		key: 'default-key',
		data: exampleS3Files[0]!,
	})),
	f64: s3File('f64', {
		mode: 'base64',
	}),
	f16: s3File('f16', {
		mode: 'hex',
	}),
	fInt8: s3File('f_int8', {
		mode: 'uint8array',
	}),
	common: integer('common').default(1),
});

export const s3TableConfig = relations(s3Table, ({ one, many }) => ({
	oneSelf: one(s3Table, { fields: [s3Table.id], references: [s3Table.id] }),
	manySelfReverse: one(s3Table, { fields: [s3Table.common], references: [s3Table.common], relationName: 'data' }),
	manySelf: many(s3Table, { relationName: 'data' }),
	nullSelf: one(s3Table, { fields: [s3Table.f16], references: [s3Table.f64], relationName: 'null' }),
	emptySelf: many(s3Table, { relationName: 'null' }),
}));
