import {
	alias,
	type AnyMsSqlColumn,
	bigint,
	binary,
	bit,
	char,
	customType,
	date,
	datetime,
	datetime2,
	datetimeoffset,
	decimal,
	float,
	int,
	mssqlSchema,
	mssqlTable,
	mssqlView,
	numeric,
	primaryKey,
	real,
	time,
	varbinary,
	varchar,
} from 'drizzle-orm/mssql-core';

import { eq, getTableColumns, ne, sql } from 'drizzle-orm';

export const usersTable = mssqlTable('users', {
	id: int('id').primaryKey().notNull(),
	name: varchar('name', { length: 100 }).notNull(),
	verified: bit('verified').notNull().default(false),
	invitedBy: int('invited_by').references((): AnyMsSqlColumn => usersTable.id),
});

export const groupsTable = mssqlTable('groups', {
	id: int('id').primaryKey().notNull(),
	name: varchar('name', { length: 100 }).notNull(),
	description: varchar('description', { length: 100 }),
});

export const usersToGroupsTable = mssqlTable(
	'users_to_groups',
	{
		id: int('id').primaryKey().identity().notNull(),
		userId: int('user_id').notNull().references(() => usersTable.id),
		groupId: int('group_id').notNull().references(() => groupsTable.id),
	},
	(t) => [
		primaryKey({ name: 'pk_1', columns: [t.userId, t.groupId] }),
	],
);

export const postsTable = mssqlTable('posts', {
	id: int('id').primaryKey().identity().notNull(),
	content: varchar('content', { length: 100 }).notNull(),
	ownerId: int('owner_id').references(() => usersTable.id),
	createdAt: datetime('created_at')
		.notNull().default(sql`current_timestamp`),
});

export const commentsTable = mssqlTable('comments', {
	id: int('id').primaryKey().identity().notNull(),
	content: varchar('content', { length: 100 }).notNull(),
	creator: int('creator').references(() => usersTable.id),
	postId: int('post_id').references(() => postsTable.id),
	createdAt: datetime('created_at')
		.notNull().default(sql`current_timestamp`),
});

export const commentLikesTable = mssqlTable('comment_likes', {
	id: int('id').primaryKey().identity().notNull(),
	creator: int('creator').references(() => usersTable.id),
	commentId: int('comment_id').references(() => commentsTable.id),
	createdAt: datetime('created_at')
		.notNull().default(sql`current_timestamp`),
});

/**
 * The `counter` subquery deliberately aliases the source table, so the view exercises a correlated
 * expression alongside plain columns - relational queries selecting from a view have to keep both
 * working. `mapWith` collapses 0 to null so the mapper's own null handling is covered too.
 */
export const usersView = mssqlView('rqb_users_view').as((qb) =>
	qb.select({
		...getTableColumns(usersTable),
		postContent: postsTable.content,
		createdAt: postsTable.createdAt,
		counter: sql<string | number>`(select count(*) from ${usersTable} as ${alias(usersTable, 'count_source')} where ${
			ne(usersTable.id, 2)
		})`
			.mapWith((data) => {
				return data === '0' || data === 0 ? null : Number(data);
			}).as('count'),
	})
		.from(usersTable).leftJoin(postsTable, eq(usersTable.id, postsTable.ownerId))
);

export const rqbSchema = mssqlSchema('rqb_test_schema');

export const schemaUsers = rqbSchema.table('users', {
	id: int('id').primaryKey().notNull(),
	name: varchar('name', { length: 100 }).notNull(),
	verified: bit('verified').notNull().default(false),
	invitedBy: int('invited_by').references((): AnyMsSqlColumn => schemaUsers.id),
});

export const schemaPosts = rqbSchema.table('posts', {
	id: int('id').primaryKey().identity().notNull(),
	content: varchar('content', { length: 100 }).notNull(),
	ownerId: int('owner_id').references(() => schemaUsers.id),
	createdAt: datetime('created_at')
		.notNull().default(sql`current_timestamp`),
});

export const schemaGroups = rqbSchema.table('groups', {
	id: int('id').primaryKey().notNull(),
	name: varchar('name', { length: 100 }).notNull(),
	description: varchar('description', { length: 100 }),
});

export const schemaUsersToGroups = rqbSchema.table(
	'users_to_groups',
	{
		id: int('id').primaryKey().identity().notNull(),
		userId: int('user_id').notNull().references(() => schemaUsers.id),
		groupId: int('group_id').notNull().references(() => schemaGroups.id),
	},
	(t) => [
		primaryKey({ name: 'pk_schema_1', columns: [t.userId, t.groupId] }),
	],
);

export const schemaUsersView = rqbSchema.view('users_sch_view').as((qb) =>
	qb.select({
		...getTableColumns(schemaUsers),
		postContent: schemaPosts.content,
		createdAt: schemaPosts.createdAt,
		counter: sql<string | number>`(select count(*) from ${schemaUsers} as ${alias(schemaUsers, 'count_source')} where ${
			ne(schemaUsers.id, 2)
		})`
			.mapWith((data) => {
				return data === '0' || data === 0 ? null : Number(data);
			}).as('count'),
	})
		.from(schemaUsers).leftJoin(schemaPosts, eq(schemaUsers.id, schemaPosts.ownerId))
);

/** Backs the composite-key `.through` relation: the junction carries both `courseId` and `semester`. */
export const students = mssqlTable('students', {
	studentId: int('student_id').primaryKey().identity().notNull(),
	name: varchar('name', { length: 100 }).notNull(),
});

export const courseOfferings = mssqlTable('course_offerings', {
	courseId: int('course_id').notNull(),
	semester: varchar('semester', { length: 10 }).notNull(),
});

export const studentGrades = mssqlTable('student_grades', {
	studentId: int('student_id').notNull(),
	courseId: int('course_id').notNull(),
	semester: varchar('semester', { length: 10 }).notNull(),
	grade: char('grade', { length: 2 }),
});

const customBigInt = customType<{
	data: bigint;
	driverData: bigint;
	driverOutput: string;
	jsonData: string;
}>({
	dataType: () => 'bigint',
	fromDriver: BigInt,
	fromJson: BigInt,
	forJsonSelect: (identifier, sql) => sql`cast(${identifier} as varchar(32))`,
});

const customBigIntViaCodec = customType<{
	data: bigint;
	driverData: bigint;
	driverOutput: string;
	jsonData: string;
}>({
	codec: 'bigint',
	dataType: () => 'bigint',
	fromDriver: BigInt,
});

export const allTypesTable = mssqlTable('all_types_rqb', {
	id: int('id').primaryKey().notNull(),
	cInt: int('c_int'),
	cBigint: bigint('c_bigint', { mode: 'bigint' }),
	cBigintNum: bigint('c_bigint_num', { mode: 'number' }),
	cDecimal: decimal('c_decimal', { precision: 38, scale: 9 }),
	cNumeric: numeric('c_numeric', { precision: 38, scale: 9 }),
	cFloat: float('c_float'),
	cReal: real('c_real'),
	cBit: bit('c_bit'),
	cVarchar: varchar('c_varchar', { length: 50 }),
	cDate: date('c_date', { mode: 'date' }),
	cDateStr: date('c_date_s', { mode: 'string' }),
	cDatetime: datetime('c_datetime', { mode: 'date' }),
	cDatetimeStr: datetime('c_datetime_s', { mode: 'string' }),
	cDatetime2: datetime2('c_datetime2', { mode: 'date', precision: 3 }),
	cDatetime2Str: datetime2('c_datetime2_s', { mode: 'string', precision: 3 }),
	cDto: datetimeoffset('c_dto', { mode: 'date', precision: 3 }),
	cDtoStr: datetimeoffset('c_dto_s', { mode: 'string', precision: 3 }),
	cTime: time('c_time', { mode: 'date' }),
	cTimeStr: time('c_time_s', { mode: 'string' }),
	cBinary: binary('c_binary', { length: 5 }),
	cVarbinary: varbinary('c_varbinary', { length: 50 }),
	cCustomBigint: customBigInt('c_custom_bigint'),
	cCustomBigintCodec: customBigIntViaCodec('c_custom_bigint_codec'),
});
