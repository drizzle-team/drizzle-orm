import { relations } from 'drizzle-orm/_relations';
import {
	bigint,
	binary,
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
	primaryKey,
	real,
	serial,
	singlestoreEnum,
	singlestoreSchema,
	singlestoreTable,
	smallint,
	text,
	time,
	timestamp,
	tinyint,
	varbinary,
	varchar,
	vector,
	year,
} from 'drizzle-orm/singlestore-core';

export const usersTable = singlestoreTable('users', {
	id: serial().primaryKey(),
	name: text().notNull(),
	verified: boolean().notNull().default(false),
	invitedBy: bigint({ mode: 'number' }),
});

const schemaV1 = singlestoreSchema('schemaV1');

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

export const groupsTable = singlestoreTable('groups', {
	id: serial().primaryKey(),
	name: text().notNull(),
	description: text(),
});
export const groupsConfig = relations(groupsTable, ({ many }) => ({
	usersToGroups: many(usersToGroupsTable),
}));

export const usersToGroupsTable = singlestoreTable(
	'users_to_groups',
	{
		id: serial().primaryKey(),
		userId: bigint({ mode: 'number' }).notNull(),
		groupId: bigint({ mode: 'number' }).notNull(),
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

export const postsTable = singlestoreTable('posts', {
	id: serial().primaryKey(),
	content: text().notNull(),
	ownerId: bigint({ mode: 'number' }),
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

export const commentsTable = singlestoreTable('comments', {
	id: serial().primaryKey(),
	content: text().notNull(),
	creator: bigint({ mode: 'number' }),
	postId: bigint({ mode: 'number' }),
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

export const commentLikesTable = singlestoreTable('comment_likes', {
	id: serial().primaryKey(),
	creator: bigint({ mode: 'number' }),
	commentId: bigint({ mode: 'number' }),
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

export const rqbSchema = singlestoreSchema('rqb_test_schema');

export const schemaUsers = rqbSchema.table('users', {
	id: serial().primaryKey(),
	name: text().notNull(),
	verified: boolean().notNull().default(false),
	invitedBy: bigint({ mode: 'number' }),
});

export const schemaPosts = rqbSchema.table('posts', {
	id: serial().primaryKey(),
	content: text().notNull(),
	ownerId: bigint({ mode: 'number' }),
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
		userId: bigint({ mode: 'number' }).notNull(),
		groupId: bigint({ mode: 'number' }).notNull(),
	},
	(t) => ({
		pk: primaryKey(t.userId, t.groupId),
	}),
);

export const allTypesTable = singlestoreTable('all_types', {
	serial: serial('scol'),
	bigint53: bigint('bigint53', {
		mode: 'number',
	}),
	bigint64: bigint('bigint64', {
		mode: 'bigint',
	}),
	bigintString: bigint('bigint_string', {
		mode: 'string',
	}),
	binary: binary('binary'),
	boolean: boolean('boolean'),
	char: char('char'),
	date: date('date', {
		mode: 'date',
	}),
	dateStr: date('date_str', {
		mode: 'string',
	}),
	datetime: datetime('datetime', {
		mode: 'date',
	}),
	datetimeStr: datetime('datetime_str', {
		mode: 'string',
	}),
	decimal: decimal('decimal'),
	decimalNum: decimal('decimal_num', {
		scale: 30,
		mode: 'number',
	}),
	decimalBig: decimal('decimal_big', {
		scale: 30,
		mode: 'bigint',
	}),
	double: double('double'),
	float: float('float'),
	int: int('int'),
	json: json('json'),
	medInt: mediumint('med_int'),
	smallInt: smallint('small_int'),
	real: real('real'),
	text: text('text'),
	time: time('time'),
	timestamp: timestamp('timestamp', {
		mode: 'date',
	}),
	timestampStr: timestamp('timestamp_str', {
		mode: 'string',
	}),
	tinyInt: tinyint('tiny_int'),
	varbin: varbinary('varbin', {
		length: 16,
	}),
	varchar: varchar('varchar', {
		length: 255,
	}),
	year: year('year'),
	enum: singlestoreEnum('enum', ['enV1', 'enV2']),
	vectorI8: vector('vec_i8', {
		dimensions: 5,
		elementType: 'I8',
	}),
	vectorI16: vector('vec_i16', {
		dimensions: 5,
		elementType: 'I16',
	}),
	vectorI32: vector('vec_i32', {
		dimensions: 5,
		elementType: 'I32',
	}),
	vectorI64: vector('vec_i64', {
		dimensions: 5,
		elementType: 'I64',
	}),
	vectorF32: vector('vec_f32', {
		dimensions: 5,
		elementType: 'F32',
	}),
	vectorF64: vector('vec_f64', {
		dimensions: 5,
		elementType: 'F64',
	}),
});

export const students = singlestoreTable('students', {
	studentId: serial('student_id').primaryKey().notNull(),
	name: text().notNull(),
});

export const courseOfferings = singlestoreTable('course_offerings', {
	courseId: int('course_id').notNull(),
	semester: varchar({ length: 10 }).notNull(),
});

export const studentGrades = singlestoreTable('student_grades', {
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

export const customTypesTable = singlestoreTable('custom_types', {
	id: int('id'),
	big: customBigInt(),
	bytes: customBytes(),
	time: customTimestamp(),
	int: customInt(),
});
