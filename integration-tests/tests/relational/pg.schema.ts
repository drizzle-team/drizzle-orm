import {
	boolean,
	integer,
	type PgColumn,
	pgSchema,
	pgTable,
	primaryKey,
	serial,
	text,
	timestamp,
} from 'drizzle-orm/pg-core';
import { s3BucketName as bucket } from '../create-docker-s3';

import { relations } from 'drizzle-orm';
import { s3File } from 'drizzle-orm/extensions/s3-file/pg';

export const usersTable = pgTable('users', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	invitedBy: integer('invited_by').references((): PgColumn => usersTable.id),
});

export const schemaV1 = pgSchema('schemaV1');

export const usersV1 = schemaV1.table('usersV1', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	invitedBy: integer('invited_by'),
});

export const usersTableV1 = schemaV1.table('users_table_V1', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	invitedBy: integer('invited_by'),
});

export const usersConfig = relations(usersTable, ({ one, many }) => ({
	invitee: one(usersTable, { fields: [usersTable.invitedBy], references: [usersTable.id] }),
	usersToGroups: many(usersToGroupsTable),
	posts: many(postsTable),
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

export const s3Table = pgTable('s3files', {
	id: integer('id').primaryKey(),
	file: s3File('file', { mode: 'buffer' }),
	fileArr: s3File('file_arr', { mode: 'buffer' }).array(),
	fileMtx: s3File('file_mtx', { mode: 'buffer' }).array().array(),
	defaultFnFile: s3File('file_default_fn', { mode: 'buffer' }).$default(() => ({
		bucket,
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
