import {
	alias,
	type AnySQLiteColumn,
	blob,
	customType,
	integer,
	numeric,
	primaryKey,
	real,
	sqliteTable,
	sqliteView,
	text,
} from 'drizzle-orm/sqlite-core';

import { eq, getTableColumns, ne, sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm/_relations';

export const usersTable = sqliteTable('users', {
	id: integer().primaryKey({ autoIncrement: true }),
	name: text().notNull(),
	verified: integer().notNull().default(0),
	invitedBy: integer().references((): AnySQLiteColumn => usersTable.id),
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
	id: integer().primaryKey({ autoIncrement: true }),
	name: text().notNull(),
	description: text(),
});
export const groupsConfig = relations(groupsTable, ({ many }) => ({
	usersToGroups: many(usersToGroupsTable),
}));

export const usersToGroupsTable = sqliteTable(
	'users_to_groups',
	{
		id: integer().primaryKey({ autoIncrement: true }),
		userId: integer({ mode: 'number' }).notNull().references(
			() => usersTable.id,
		),
		groupId: integer({ mode: 'number' }).notNull().references(
			() => groupsTable.id,
		),
	},
	(t) => [primaryKey({ columns: [t.userId, t.groupId] })],
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
	id: integer().primaryKey({ autoIncrement: true }),
	content: text().notNull(),
	ownerId: integer({ mode: 'number' }).references(
		() => usersTable.id,
	),
	createdAt: integer({ mode: 'timestamp_ms' })
		.notNull().default(sql`current_timestamp`),
});
export const postsConfig = relations(postsTable, ({ one, many }) => ({
	author: one(usersTable, {
		fields: [postsTable.ownerId],
		references: [usersTable.id],
	}),
	comments: many(commentsTable),
}));

export const usersView = sqliteView('users_view').as((qb) =>
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

export const commentsTable = sqliteTable('comments', {
	id: integer().primaryKey({ autoIncrement: true }),
	content: text().notNull(),
	creator: integer({ mode: 'number' }).references(
		() => usersTable.id,
	),
	postId: integer({ mode: 'number' }).references(() => postsTable.id),
	createdAt: integer({ mode: 'timestamp_ms' })
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
	id: integer().primaryKey({ autoIncrement: true }),
	creator: integer({ mode: 'number' }).references(
		() => usersTable.id,
	),
	commentId: integer({ mode: 'number' }).references(
		() => commentsTable.id,
	),
	createdAt: integer({ mode: 'timestamp_ms' })
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

export const allTypesTable = sqliteTable('all_types', {
	int: integer({
		mode: 'number',
	}),
	bool: integer({
		mode: 'boolean',
	}),
	time: integer({
		mode: 'timestamp',
	}),
	timeMs: integer({
		mode: 'timestamp_ms',
	}),
	bigint: blob({
		mode: 'bigint',
	}),
	buffer: blob({
		mode: 'buffer',
	}),
	json: blob({
		mode: 'json',
	}),
	numeric: numeric(),
	numericNum: numeric({
		mode: 'number',
	}),
	numericBig: numeric({
		mode: 'bigint',
	}),
	real: real(),
	text: text({
		mode: 'text',
	}),
	jsonText: text({
		mode: 'json',
	}),
});

export const students = sqliteTable('students', {
	studentId: integer('student_id').primaryKey().notNull(),
	name: text().notNull(),
});

export const courseOfferings = sqliteTable('course_offerings', {
	courseId: integer('course_id').notNull(),
	semester: text().notNull(),
});

export const studentGrades = sqliteTable('student_grades', {
	studentId: integer('student_id').notNull(),
	courseId: integer('course_id').notNull(),
	semester: text().notNull(),
	grade: text(),
});

const customBigInt = customType<{
	data: bigint;
	driverData: Buffer;
	jsonData: string;
}>({
	dataType: () => 'blob',
	fromDriver: (value) => {
		return BigInt(value.toString());
	},
	fromJson: (value) => {
		return BigInt(Buffer.from(value, 'hex').toString());
	},
	toDriver: (value) => Buffer.from(value.toString()),
});

const customBytes = customType<{
	data: Buffer;
	driverData: Buffer;
	jsonData: string;
}>({
	dataType: () => 'blob',
	fromJson: (value) => {
		return Buffer.from(value, 'hex');
	},
	forJsonSelect: (identifier, sql) => {
		return sql`hex(${identifier})`;
	},
});

const customTimestamp = customType<{
	data: Date;
	driverData: number;
	jsonData: number;
}>({
	dataType: () => 'integer',
	fromDriver: (value: number) => {
		return new Date(value);
	},
	toDriver: (value: Date) => {
		return value.getTime();
	},
});

const customInt = customType<{
	data: number;
	driverData: number;
}>({
	dataType: () => 'integer',
});

export const customTypesTable = sqliteTable('custom_types', {
	id: integer('id'),
	big: customBigInt(),
	bytes: customBytes(),
	time: customTimestamp(),
	int: customInt(),
});
