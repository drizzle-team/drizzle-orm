import { eq, getTableColumns, ne, sql } from 'drizzle-orm';
import {
	alias,
	bigint,
	boolean,
	char,
	type CockroachColumn,
	cockroachEnum,
	customType,
	date,
	doublePrecision,
	inet,
	int4,
	interval,
	jsonb,
	numeric,
	primaryKey,
	real,
	smallint,
	snakeCase,
	text,
	time,
	timestamp,
	uuid,
	varchar,
} from 'drizzle-orm/cockroach-core';

export const usersTable = snakeCase.table('users', {
	id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	invitedBy: int4('invited_by').references((): CockroachColumn => usersTable.id),
});

export const schemaV1 = snakeCase.schema('schemaV1');

export const usersV1 = schemaV1.table('usersV1', {
	id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	invitedBy: int4('invited_by'),
});

export const usersTableV1 = schemaV1.table('users_table_V1', {
	id: int4('id').primaryKey().generatedByDefaultAsIdentity(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	invitedBy: int4('invited_by'),
});

export const groupsTable = snakeCase.table('groups', {
	id: int4().primaryKey().generatedByDefaultAsIdentity(),
	name: text().notNull(),
	description: text(),
});

export const usersToGroupsTable = snakeCase.table('users_to_groups', {
	id: int4().primaryKey().generatedByDefaultAsIdentity(),
	userId: int4().notNull().references(() => usersTable.id),
	groupId: int4().notNull().references(() => groupsTable.id),
}, (t) => [
	primaryKey({ columns: [t.groupId, t.userId] }),
]);

export const postsTable = snakeCase.table('posts', {
	id: int4().primaryKey().generatedByDefaultAsIdentity(),
	content: text().notNull(),
	ownerId: int4().references(() => usersTable.id),
	createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const usersView = snakeCase.view('users_view').as((qb) =>
	qb.select({
		...getTableColumns(usersTable),
		postContent: postsTable.content,
		createdAt: postsTable.createdAt,
		counter: sql<string | bigint | number>`(select count(*) from ${usersTable} as ${
			alias(usersTable, 'count_source')
		} where ${ne(usersTable.id, 2)})`
			.mapWith((data) => {
				return data === '0' || data === 0 || data === 0n ? null : Number(data);
			}).as('count'),
	})
		.from(usersTable).leftJoin(postsTable, eq(usersTable.id, postsTable.ownerId))
);

export const commentsTable = snakeCase.table('comments', {
	id: int4().primaryKey().generatedByDefaultAsIdentity(),
	content: text().notNull(),
	creator: int4().references(() => usersTable.id),
	postId: int4().references(() => postsTable.id),
	createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const commentLikesTable = snakeCase.table('comment_likes', {
	id: int4().primaryKey().generatedByDefaultAsIdentity(),
	creator: int4().references(() => usersTable.id),
	commentId: int4().references(() => commentsTable.id),
	createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const rqbSchema = snakeCase.schema('rqb_test_schema');

export const schemaUsers = rqbSchema.table('users', {
	id: int4().primaryKey().generatedByDefaultAsIdentity(),
	name: text().notNull(),
	verified: boolean().notNull().default(false),
	invitedBy: int4().references((): CockroachColumn => schemaUsers.id),
});

export const schemaPosts = rqbSchema.table('posts', {
	id: int4().primaryKey().generatedByDefaultAsIdentity(),
	content: text().notNull(),
	ownerId: int4().references(() => schemaUsers.id),
	createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const schemaGroups = rqbSchema.table('groups', {
	id: int4().primaryKey().generatedByDefaultAsIdentity(),
	name: text().notNull(),
	description: text(),
});

export const schemaUsersToGroups = rqbSchema.table('users_to_groups', {
	id: int4().primaryKey().generatedByDefaultAsIdentity(),
	userId: int4().notNull().references(() => schemaUsers.id),
	groupId: int4().notNull().references(() => schemaGroups.id),
}, (t) => [
	primaryKey({ columns: [t.groupId, t.userId] }),
]);

export const schemaUsersView = rqbSchema.view('users_sch_view').as((qb) =>
	qb.select({
		...getTableColumns(schemaUsers),
		postContent: schemaPosts.content,
		createdAt: schemaPosts.createdAt,
		counter: sql<string | bigint | number>`(select count(*) from ${schemaUsers} as ${
			alias(schemaUsers, 'count_source')
		} where ${ne(schemaUsers.id, 2)})`
			.mapWith((data) => {
				return data === '0' || data === 0 || data === 0n ? null : Number(data);
			}).as('count'),
	})
		.from(schemaUsers).leftJoin(schemaPosts, eq(schemaUsers.id, schemaPosts.ownerId))
);

export const en = cockroachEnum('en', ['enVal1', 'enVal2']);

export const allTypesTable = snakeCase.table('all_types', {
	serial: int4(),
	bigserial53: bigint({
		mode: 'number',
	}),
	bigserial64: bigint({
		mode: 'bigint',
	}),
	int: int4(),
	bigint53: bigint({
		mode: 'number',
	}),
	bigint64: bigint({
		mode: 'bigint',
	}),
	bool: boolean(),
	char: char(),
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
	jsonb: jsonb(),
	numeric: numeric(),
	numericNum: numeric({
		mode: 'number',
	}),
	numericBig: numeric({
		mode: 'bigint',
	}),
	real: real(),
	smallint: smallint(),
	smallserial: smallint(),
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
	arrint: int4().array(),
	arrbigint53: bigint({
		mode: 'number',
	}).array(),
	arrbigint64: bigint({
		mode: 'bigint',
	}).array(),
	arrbool: boolean().array(),
	arrchar: char().array(),
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
	arrnumeric: numeric().array(),
	arrnumericNum: numeric({
		mode: 'number',
	}).array(),
	arrnumericBig: numeric({
		mode: 'bigint',
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

export const students = snakeCase.table('students', {
	studentId: int4('student_id').primaryKey().generatedByDefaultAsIdentity(),
	name: text().notNull(),
});

export const courseOfferings = snakeCase.table('course_offerings', {
	courseId: int4('course_id').notNull(),
	semester: varchar({ length: 10 }).notNull(),
});

export const studentGrades = snakeCase.table('student_grades', {
	studentId: int4('student_id').notNull(),
	courseId: int4('course_id').notNull(),
	semester: varchar({ length: 10 }).notNull(),
	grade: char({ length: 2 }),
});

const customBigInt = customType<{
	data: bigint;
	driverData: bigint;
	driverOutput: string;
	jsonData: string;
}>({
	dataType: () => 'int8',
	fromDriver: BigInt,
	fromJson: BigInt,
	forJsonSelect: (identifier, sql, arrayDimensions) =>
		sql`${identifier}::text${sql.raw('[]'.repeat(arrayDimensions ?? 0))}`,
});

const customTimestamp = customType<{
	data: Date;
	driverData: string;
	jsonData: string;
}>({
	codec: 'timestamp',
	dataType: () => 'timestamp(3)',
	toDriver: (value: Date) => {
		return value.toISOString();
	},
});

const customInt = customType<{
	data: number;
	driverData: number;
}>({
	dataType: () => 'int4',
	fromDriver: Number,
	fromJson: Number,
});

export const customTypesTable = snakeCase.table('custom_types', {
	id: int4('id'),
	big: customBigInt(),
	bigArr: customBigInt().array(),
	time: customTimestamp(),
	timeArr: customTimestamp().array(),
	int: customInt(),
	intArr: customInt().array(),
});
