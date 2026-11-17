import { eq, getTableColumns, ne, sql } from 'drizzle-orm';
import {
	alias,
	bigint,
	boolean,
	bytea,
	char,
	customType,
	date,
	doublePrecision,
	integer,
	interval,
	json,
	jsonb,
	numeric,
	type PgColumn,
	primaryKey,
	QueryBuilder,
	real,
	smallint,
	snakeCase,
	text,
	time,
	timestamp,
	uuid,
	varchar,
} from 'drizzle-orm/pg-core';

export const usersTable = snakeCase.table('users', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	invitedBy: integer('invited_by'),
});

export const schemaV1 = snakeCase.schema('schemaV1');

export const usersV1 = schemaV1.table('usersV1', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	invitedBy: integer('invited_by'),
});

export const usersTableV1 = schemaV1.table('users_table_V1', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	invitedBy: integer('invited_by'),
});

export const groupsTable = snakeCase.table('groups', {
	id: integer().primaryKey(),
	name: text().notNull(),
	description: text(),
});

export const usersToGroupsTable = snakeCase.table('users_to_groups', {
	id: integer().primaryKey(),
	userId: integer().notNull(),
	groupId: integer().notNull(),
}, (t) => ({
	pk: primaryKey(t.groupId, t.userId),
}));

export const postsTable = snakeCase.table('posts', {
	id: integer().primaryKey(),
	content: text().notNull(),
	ownerId: integer(),
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

export const usersSubquery = new QueryBuilder().select({
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
	.from(usersTable).leftJoin(postsTable, eq(usersTable.id, postsTable.ownerId)).as('users_sq');

export const commentsTable = snakeCase.table('comments', {
	id: integer().primaryKey(),
	content: text().notNull(),
	creator: integer(),
	postId: integer(),
	createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const commentLikesTable = snakeCase.table('comment_likes', {
	id: integer().primaryKey(),
	creator: integer(),
	commentId: integer(),
	createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const rqbSchema = snakeCase.schema('rqb_test_schema');

export const schemaUsers = rqbSchema.table('users', {
	id: integer().primaryKey(),
	name: text().notNull(),
	verified: boolean().notNull().default(false),
	invitedBy: integer(),
});

export const schemaPosts = rqbSchema.table('posts', {
	id: integer().primaryKey(),
	content: text().notNull(),
	ownerId: integer(),
	createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const schemaGroups = rqbSchema.table('groups', {
	id: integer().primaryKey(),
	name: text().notNull(),
	description: text(),
});

export const schemaUsersToGroups = rqbSchema.table('users_to_groups', {
	id: integer().primaryKey(),
	userId: integer().notNull(),
	groupId: integer().notNull(),
}, (t) => ({
	pk: primaryKey(t.groupId, t.userId),
}));

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

export const allTypesTable = snakeCase.table('all_types', {
	serial: integer().notNull(),
	bigserial53: bigint({
		mode: 'number',
	}).notNull(),
	bigserial64: bigint({
		mode: 'bigint',
	}).notNull(),
	int: integer(),
	bigint53: bigint({
		mode: 'number',
	}),
	bigint64: bigint({
		mode: 'bigint',
	}),
	bigintString: bigint({
		mode: 'string',
	}),
	bool: boolean(),
	bytea: bytea(),
	char: char(),
	date: date({
		mode: 'date',
	}),
	dateStr: date({
		mode: 'string',
	}),
	double: doublePrecision(),
	interval: interval(),
	json: json(),
	jsonb: jsonb(),
	numeric: numeric({
		precision: 38,
		scale: 0,
	}),
	numericNum: numeric({
		mode: 'number',
		precision: 38,
		scale: 0,
	}),
	numericBig: numeric({
		mode: 'bigint',
		precision: 38,
		scale: 0,
	}),
	real: real(),
	smallint: smallint(),
	smallserial: smallint().notNull(),
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
});

export type AllTypes = {
	serial: number;
	bigserial53: number;
	bigserial64: bigint;
	int: number | null;
	bigint53: number | null;
	bigint64: bigint | null;
	bigintString: string | null;
	bool: boolean | null;
	bytea: Buffer | null;
	char: string | null;
	date: Date | null;
	dateStr: string | null;
	double: number | null;
	interval: string | null;
	json: unknown;
	jsonb: unknown;
	numeric: string | null;
	numericNum: number | null;
	numericBig: bigint | null;
	real: number | null;
	smallint: number | null;
	smallserial: number;
	text: string | null;
	time: string | null;
	timestamp: Date | null;
	timestampTz: Date | null;
	timestampStr: string | null;
	timestampTzStr: string | null;
	uuid: string | null;
	varchar: string | null;
};

export const students = snakeCase.table('students', {
	studentId: integer('student_id').primaryKey().notNull(),
	name: text().notNull(),
});

export const courseOfferings = snakeCase.table('course_offerings', {
	courseId: integer('course_id').notNull(),
	semester: varchar({ length: 10 }).notNull(),
});

export const studentGrades = snakeCase.table('student_grades', {
	studentId: integer('student_id').notNull(),
	courseId: integer('course_id').notNull(),
	semester: varchar({ length: 10 }).notNull(),
	grade: char({ length: 2 }),
});

const customBigInt = customType<{
	data: bigint;
	driverData: bigint;
	driverOutput: string;
	jsonData: string;
}>({
	codec: 'bigint',
	dataType: () => 'bigint',
	fromDriver: BigInt,
	fromJson: BigInt,
});

const customBytes = customType<{
	data: Buffer;
	driverData: Buffer;
	jsonData: string;
}>({
	codec: 'bytea',
	dataType: () => 'bytea',
	fromJson: (value) => {
		return Buffer.from(value.slice(2, value.length), 'hex');
	},
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
	codec: 'integer',
	dataType: () => 'integer',
});

export const customTypesTable = snakeCase.table('custom_types', {
	id: integer('id').notNull(),
	big: customBigInt(),
	bytes: customBytes(),
	time: customTimestamp(),
	int: customInt(),
});
