import {
	alias,
	type AnyMySqlColumn,
	bigint,
	binary,
	blob,
	boolean,
	char,
	customType,
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
	id: serial().primaryKey(),
	name: text().notNull(),
	verified: boolean().notNull().default(false),
	invitedBy: bigint({ mode: 'number' }).references(
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
	id: serial().primaryKey(),
	name: text().notNull(),
	description: text(),
});
export const groupsConfig = relations(groupsTable, ({ many }) => ({
	usersToGroups: many(usersToGroupsTable),
}));

export const usersToGroupsTable = mysqlTable(
	'users_to_groups',
	{
		id: serial().primaryKey(),
		userId: bigint({ mode: 'number' }).notNull().references(
			() => usersTable.id,
		),
		groupId: bigint({ mode: 'number' }).notNull().references(
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

export const postsTable = mysqlTable('posts', {
	id: serial().primaryKey(),
	content: text().notNull(),
	ownerId: bigint({ mode: 'number' }).references(
		() => usersTable.id,
	),
	createdAt: timestamp()
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
	id: serial().primaryKey(),
	content: text().notNull(),
	creator: bigint({ mode: 'number' }).references(
		() => usersTable.id,
	),
	postId: bigint({ mode: 'number' }).references(() => postsTable.id),
	createdAt: timestamp()
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
	id: serial().primaryKey(),
	creator: bigint({ mode: 'number' }).references(
		() => usersTable.id,
	),
	commentId: bigint({ mode: 'number' }).references(
		() => commentsTable.id,
	),
	createdAt: timestamp()
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
	id: serial().primaryKey(),
	name: text().notNull(),
	verified: boolean().notNull().default(false),
	invitedBy: bigint({ mode: 'number' }).references(
		(): AnyMySqlColumn => schemaUsers.id,
	),
});

export const schemaPosts = rqbSchema.table('posts', {
	id: serial().primaryKey(),
	content: text().notNull(),
	ownerId: bigint({ mode: 'number' }).references(
		() => schemaUsers.id,
	),
	createdAt: timestamp()
		.notNull()
		.defaultNow(),
});

export const schemaGroups = rqbSchema.table('groups', {
	id: serial().primaryKey(),
	name: text().notNull(),
	description: text(),
});

export const schemaUsersToGroups = rqbSchema.table(
	'users_to_groups',
	{
		id: serial().primaryKey(),
		userId: bigint({ mode: 'number' }).notNull().references(
			() => schemaUsers.id,
		),
		groupId: bigint({ mode: 'number' }).notNull().references(
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

export const allTypesTable = mysqlTable('all_types', {
	serial: serial(),
	blob: blob({
		mode: 'buffer',
	}),
	blobStr: blob({
		mode: 'string',
	}),
	bigint53: bigint({
		mode: 'number',
	}),
	bigint64: bigint({
		mode: 'bigint',
	}),
	bigintString: bigint({
		mode: 'string',
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
	decimalNum: decimal({
		scale: 30,
		mode: 'number',
	}),
	decimalBig: decimal({
		scale: 30,
		mode: 'bigint',
	}),
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
	varchar: varchar({
		length: 255,
	}),
	year: year(),
	enum: mysqlEnum(['enV1', 'enV2']),
});

export const students = mysqlTable('students', {
	studentId: serial('student_id').primaryKey().notNull(),
	name: text().notNull(),
});

export const courseOfferings = mysqlTable('course_offerings', {
	courseId: int('course_id').notNull(),
	semester: varchar({ length: 10 }).notNull(),
});

export const studentGrades = mysqlTable('student_grades', {
	studentId: int('student_id').notNull(),
	courseId: int('course_id').notNull(),
	semester: varchar({ length: 10 }).notNull(),
	grade: char({ length: 2 }),
});

const customBigInt = customType<{
	data: bigint;
	driverData: bigint;
	driverOutput: string;
	jsonData: string;
}>({
	dataType: () => 'bigint',
	fromDriver: BigInt,
});

const customBytes = customType<{
	data: Buffer;
	driverData: Buffer;
	driverOutput: Buffer | Uint8Array;
	jsonData: string;
}>({
	dataType: () => 'blob',
	fromDriver: (value) => {
		return Buffer.isBuffer(value) ? value : Buffer.from(value);
	},
	fromJson: (value) => {
		return Buffer.from(value, 'hex');
	},
	forJsonSelect: (identifier, sql) => {
		return sql`hex(${identifier})`;
	},
});

const customTimestamp = customType<{
	data: Date;
	driverData: string;
	jsonData: string;
}>({
	dataType: () => 'timestamp',
	fromDriver: (value: string) => {
		return new Date(value + '+0000');
	},
	toDriver: (value: Date) => {
		return value.toISOString().slice(0, 19).replace('T', ' ');
	},
});

const customInt = customType<{
	data: number;
	driverData: number;
}>({
	dataType: () => 'int',
});

export const customTypesTable = mysqlTable('custom_types', {
	id: int('id'),
	big: customBigInt(),
	bytes: customBytes(),
	time: customTimestamp(),
	int: customInt(),
});
