import { eq, getTableColumns, ne, sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm/_relations';
import {
	alias,
	bigint,
	bigserial,
	boolean,
	char,
	cidr,
	date,
	doublePrecision,
	inet,
	integer,
	interval,
	json,
	jsonb,
	line,
	macaddr,
	macaddr8,
	numeric,
	type PgColumn,
	pgEnum,
	pgSchema,
	pgTable,
	pgView,
	point,
	primaryKey,
	real,
	serial,
	smallint,
	smallserial,
	text,
	time,
	timestamp,
	uuid,
	varchar,
} from 'drizzle-orm/pg-core';

export const usersTable = pgTable('users', {
	id: serial().primaryKey(),
	name: text().notNull(),
	verified: boolean().notNull().default(false),
	invitedBy: integer().references((): PgColumn => usersTable.id),
});

export const usersConfig = relations(usersTable, ({ one, many }) => ({
	invitee: one(usersTable, { fields: [usersTable.invitedBy], references: [usersTable.id] }),
	usersToGroups: many(usersToGroupsTable),
	posts: many(postsTable),
}));

export const groupsTable = pgTable('groups', {
	id: serial().primaryKey(),
	name: text().notNull(),
	description: text(),
});

export const groupsConfig = relations(groupsTable, ({ many }) => ({
	usersToGroups: many(usersToGroupsTable),
}));

export const usersToGroupsTable = pgTable('users_to_groups', {
	id: serial().primaryKey(),
	userId: integer().notNull().references(() => usersTable.id),
	groupId: integer().notNull().references(() => groupsTable.id),
}, (t) => ({
	pk: primaryKey(t.groupId, t.userId),
}));

export const usersToGroupsConfig = relations(usersToGroupsTable, ({ one }) => ({
	group: one(groupsTable, { fields: [usersToGroupsTable.groupId], references: [groupsTable.id] }),
	user: one(usersTable, { fields: [usersToGroupsTable.userId], references: [usersTable.id] }),
}));

export const postsTable = pgTable('posts', {
	id: serial().primaryKey(),
	content: text().notNull(),
	ownerId: integer().references(() => usersTable.id),
	createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const postsConfig = relations(postsTable, ({ one, many }) => ({
	author: one(usersTable, { fields: [postsTable.ownerId], references: [usersTable.id] }),
	comments: many(commentsTable),
}));

export const usersView = pgView('users_view').as((qb) =>
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

export const commentsTable = pgTable('comments', {
	id: serial().primaryKey(),
	content: text().notNull(),
	creator: integer().references(() => usersTable.id),
	postId: integer().references(() => postsTable.id),
	createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const commentsConfig = relations(commentsTable, ({ one, many }) => ({
	post: one(postsTable, { fields: [commentsTable.postId], references: [postsTable.id] }),
	author: one(usersTable, { fields: [commentsTable.creator], references: [usersTable.id] }),
	likes: many(commentLikesTable),
}));

export const commentLikesTable = pgTable('comment_likes', {
	id: serial().primaryKey(),
	creator: integer().references(() => usersTable.id),
	commentId: integer().references(() => commentsTable.id),
	createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const commentLikesConfig = relations(commentLikesTable, ({ one }) => ({
	comment: one(commentsTable, { fields: [commentLikesTable.commentId], references: [commentsTable.id] }),
	author: one(usersTable, { fields: [commentLikesTable.creator], references: [usersTable.id] }),
}));

export const rqbSchema = pgSchema('rqb_test_schema');

export const schemaUsers = rqbSchema.table('users', {
	id: serial().primaryKey(),
	name: text().notNull(),
	verified: boolean().notNull().default(false),
	invitedBy: integer().references((): PgColumn => schemaUsers.id),
});

export const schemaPosts = rqbSchema.table('posts', {
	id: serial().primaryKey(),
	content: text().notNull(),
	ownerId: integer().references(() => schemaUsers.id),
	createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const schemaGroups = rqbSchema.table('groups', {
	id: serial().primaryKey(),
	name: text().notNull(),
	description: text(),
});

export const schemaUsersToGroups = rqbSchema.table('users_to_groups', {
	id: serial().primaryKey(),
	userId: integer().notNull().references(() => schemaUsers.id),
	groupId: integer().notNull().references(() => schemaGroups.id),
}, (t) => ({
	pk: primaryKey(t.groupId, t.userId),
}));

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

export const en = pgEnum('en', ['enVal1', 'enVal2']);

export const allTypesTable = pgTable('all_types', {
	serial: serial(),
	bigserial53: bigserial({
		mode: 'number',
	}),
	bigserial64: bigserial({
		mode: 'bigint',
	}),
	int: integer(),
	bigint53: bigint({
		mode: 'number',
	}),
	bigint64: bigint({
		mode: 'bigint',
	}),
	bool: boolean(),
	char: char(),
	cidr: cidr(),
	date: date({
		mode: 'date',
	}),
	dateStr: date({
		mode: 'string',
	}),
	double: doublePrecision(),
	enum: en(),
	inet: inet(),
	interval: interval(),
	json: json(),
	jsonb: jsonb(),
	line: line({
		mode: 'abc',
	}),
	lineTuple: line({
		mode: 'tuple',
	}),
	macaddr: macaddr(),
	macaddr8: macaddr8(),
	numeric: numeric(),
	point: point({
		mode: 'xy',
	}),
	pointTuple: point({
		mode: 'tuple',
	}),
	real: real(),
	smallint: smallint(),
	smallserial: smallserial(),
	text: text(),
	time: time(),
	timestamp: timestamp({
		mode: 'date',
	}),
	timestampTz: timestamp({
		mode: 'date',
		withTimezone: true,
	}),
	timestampStr: timestamp({
		mode: 'string',
	}),
	timestampTzStr: timestamp({
		mode: 'string',
		withTimezone: true,
	}),
	uuid: uuid(),
	varchar: varchar(),
	arrint: integer().array(),
	arrbigint53: bigint({
		mode: 'number',
	}).array(),
	arrbigint64: bigint({
		mode: 'bigint',
	}).array(),
	arrbool: boolean().array(),
	arrchar: char().array(),
	arrcidr: cidr().array(),
	arrdate: date({
		mode: 'date',
	}).array(),
	arrdateStr: date({
		mode: 'string',
	}).array(),
	arrdouble: doublePrecision().array(),
	arrenum: en().array(),
	arrinet: inet().array(),
	arrinterval: interval().array(),
	arrjson: json().array(),
	arrjsonb: jsonb().array(),
	arrline: line({
		mode: 'abc',
	}).array(),
	arrlineTuple: line({
		mode: 'tuple',
	}).array(),
	arrmacaddr: macaddr().array(),
	arrmacaddr8: macaddr8().array(),
	arrnumeric: numeric().array(),
	arrpoint: point({
		mode: 'xy',
	}).array(),
	arrpointTuple: point({
		mode: 'tuple',
	}).array(),
	arrreal: real().array(),
	arrsmallint: smallint().array(),
	arrtext: text().array(),
	arrtime: time().array(),
	arrtimestamp: timestamp({
		mode: 'date',
	}).array(),
	arrtimestampTz: timestamp({
		mode: 'date',
		withTimezone: true,
	}).array(),
	arrtimestampStr: timestamp({
		mode: 'string',
	}).array(),
	arrtimestampTzStr: timestamp({
		mode: 'string',
		withTimezone: true,
	}).array(),
	arruuid: uuid().array(),
	arrvarchar: varchar().array(),
});

export const students = pgTable('students', {
	studentId: serial('student_id').primaryKey().notNull(),
	name: text().notNull(),
});

export const courseOfferings = pgTable('course_offerings', {
	courseId: integer('course_id').notNull(),
	semester: varchar({ length: 10 }).notNull(),
});

export const studentGrades = pgTable('student_grades', {
	studentId: integer('student_id').notNull(),
	courseId: integer('course_id').notNull(),
	semester: varchar({ length: 10 }).notNull(),
	grade: char({ length: 2 }),
});
