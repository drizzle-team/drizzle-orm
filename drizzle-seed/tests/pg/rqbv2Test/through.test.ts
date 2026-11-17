import { PGlite } from '@electric-sql/pglite';
import type { SQL } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/pglite';
import type { AnyRelations } from 'drizzle-orm/relations';
import { defineRelations } from 'drizzle-orm/relations';
import { expect, test } from 'vitest';
import { getSchemaInfo } from '../../../src/common.ts';
import { seed } from '../../../src/index.ts';
import { mapPgColumns } from '../../../src/pg-core/index.ts';

const relationShapes = (schema: { [key: string]: PgTable }, relations: AnyRelations) =>
	getSchemaInfo(schema, schema, mapPgColumns, relations).relations
		.map(({ table, columns, refTable, refColumns }) => ({ table, columns, refTable, refColumns }))
		.sort((rel1, rel2) =>
			`${rel1.table}.${rel1.columns.join(',')}`.localeCompare(`${rel2.table}.${rel2.columns.join(',')}`)
		);

const createDb = async (ddl: SQL[], relations: AnyRelations) => {
	const client = new PGlite();
	const db = drizzle({ client, relations });
	for (const query of ddl) await db.execute(query);

	return db;
};

const usersToGroupsSchema = () => {
	const users = pgTable('users', { id: integer('id').primaryKey(), name: text('name') });
	const groups = pgTable('groups', { id: integer('id').primaryKey(), title: text('title') });
	const usersToGroups = pgTable('users_to_groups', {
		userId: integer('user_id').notNull(),
		groupId: integer('group_id').notNull(),
	});

	return { users, groups, usersToGroups };
};

const usersToGroupsDdl = [
	sql`create table users (id integer primary key, name text)`,
	sql`create table groups (id integer primary key, title text)`,
	sql`create table users_to_groups (user_id integer not null, group_id integer not null)`,
];

test('many.through declared on both sides yields the two junction relations once', async () => {
	const schema = usersToGroupsSchema();
	const relations = defineRelations(schema, (r) => ({
		users: {
			groups: r.many.groups({
				from: r.users.id.through(r.usersToGroups.userId),
				to: r.groups.id.through(r.usersToGroups.groupId),
			}),
		},
		groups: {
			users: r.many.users({
				from: r.groups.id.through(r.usersToGroups.groupId),
				to: r.users.id.through(r.usersToGroups.userId),
			}),
		},
	}));

	expect(relationShapes(schema, relations)).toEqual([
		{ table: 'usersToGroups', columns: ['groupId'], refTable: 'groups', refColumns: ['id'] },
		{ table: 'usersToGroups', columns: ['userId'], refTable: 'users', refColumns: ['id'] },
	]);

	const db = await createDb(usersToGroupsDdl, relations);
	await seed(db, schema, { count: 8 });

	const userIds = new Set((await db.select().from(schema.users)).map((row) => row.id));
	const groupIds = new Set((await db.select().from(schema.groups)).map((row) => row.id));
	const junctionRows = await db.select().from(schema.usersToGroups);

	expect(junctionRows.length).toBe(8);
	expect(junctionRows.every((row) => userIds.has(row.userId) && groupIds.has(row.groupId))).toBe(true);
});

test('one() carrying a through produces the junction relations and no direct users to groups relation', async () => {
	const schema = usersToGroupsSchema();
	const relations = defineRelations(schema, (r) => ({
		users: {
			group: r.one.groups({
				from: r.users.id.through(r.usersToGroups.userId),
				to: r.groups.id.through(r.usersToGroups.groupId),
			}),
		},
	}));

	const shapes = relationShapes(schema, relations);

	expect(shapes).toEqual([
		{ table: 'usersToGroups', columns: ['groupId'], refTable: 'groups', refColumns: ['id'] },
		{ table: 'usersToGroups', columns: ['userId'], refTable: 'users', refColumns: ['id'] },
	]);
	expect(shapes.some((rel) => rel.table === 'users' || rel.refTable === 'usersToGroups')).toBe(false);

	const db = await createDb(usersToGroupsDdl, relations);
	await seed(db, schema, { count: 6 });

	const userIds = new Set((await db.select().from(schema.users)).map((row) => row.id));
	const groupIds = new Set((await db.select().from(schema.groups)).map((row) => row.id));
	const junctionRows = await db.select().from(schema.usersToGroups);

	expect(junctionRows.every((row) => userIds.has(row.userId) && groupIds.has(row.groupId))).toBe(true);
});

test('through declared on one side only still yields both junction relations', async () => {
	const schema = usersToGroupsSchema();
	const relations = defineRelations(schema, (r) => ({
		users: {
			groups: r.many.groups({
				from: r.users.id.through(r.usersToGroups.userId),
				to: r.groups.id.through(r.usersToGroups.groupId),
			}),
		},
	}));

	expect(relationShapes(schema, relations)).toEqual([
		{ table: 'usersToGroups', columns: ['groupId'], refTable: 'groups', refColumns: ['id'] },
		{ table: 'usersToGroups', columns: ['userId'], refTable: 'users', refColumns: ['id'] },
	]);

	const db = await createDb(usersToGroupsDdl, relations);
	await seed(db, schema, { count: 5 });

	const groupIds = new Set((await db.select().from(schema.groups)).map((row) => row.id));
	const junctionRows = await db.select().from(schema.usersToGroups);

	expect(junctionRows.every((row) => groupIds.has(row.groupId))).toBe(true);
});

test('asymmetric composite through keeps each half whole', async () => {
	const students = pgTable('students', { id: integer('id').primaryKey(), name: text('name') });
	const courseOfferings = pgTable('course_offerings', {
		id: integer('id').notNull(),
		semester: text('semester').notNull(),
		title: text('title'),
	}, (t) => [primaryKey({ columns: [t.id, t.semester] })]);
	const studentGrades = pgTable('student_grades', {
		studentId: integer('student_id').notNull(),
		courseId: integer('course_id').notNull(),
		semester: text('semester').notNull(),
		grade: integer('grade'),
	});

	const schema = { students, courseOfferings, studentGrades };
	const relations = defineRelations(schema, (r) => ({
		students: {
			offerings: r.many.courseOfferings({
				from: r.students.id.through(r.studentGrades.studentId),
				to: [
					r.courseOfferings.id.through(r.studentGrades.courseId),
					r.courseOfferings.semester.through(r.studentGrades.semester),
				],
			}),
		},
	}));

	expect(relationShapes(schema, relations)).toEqual([
		{
			table: 'studentGrades',
			columns: ['courseId', 'semester'],
			refTable: 'courseOfferings',
			refColumns: ['id', 'semester'],
		},
		{ table: 'studentGrades', columns: ['studentId'], refTable: 'students', refColumns: ['id'] },
	]);

	const db = await createDb([
		sql`create table students (id integer primary key, name text)`,
		sql`create table course_offerings (id integer not null, semester text not null, title text, primary key (id, semester))`,
		sql`create table student_grades (student_id integer not null, course_id integer not null, semester text not null, grade integer)`,
	], relations);
	await seed(db, schema, { count: 7 });

	const studentIds = new Set((await db.select().from(students)).map((row) => row.id));
	const offeringKeys = new Set((await db.select().from(courseOfferings)).map((row) => `${row.id}|${row.semester}`));
	const gradeRows = await db.select().from(studentGrades);

	expect(gradeRows.length).toBe(7);
	expect(gradeRows.every((row) => studentIds.has(row.studentId))).toBe(true);
	// the composite half has to be copied as one tuple, not column by column out of two different offerings
	expect(gradeRows.every((row) => offeringKeys.has(`${row.courseId}|${row.semester}`))).toBe(true);
});

test('self many-to-many keeps both halves of the junction', async () => {
	const users = pgTable('users', { id: integer('id').primaryKey(), name: text('name') });
	const friendships = pgTable('friendships', {
		userId: integer('user_id').notNull(),
		friendId: integer('friend_id').notNull(),
	});

	const schema = { users, friendships };
	const relations = defineRelations(schema, (r) => ({
		users: {
			friends: r.many.users({
				from: r.users.id.through(r.friendships.userId),
				to: r.users.id.through(r.friendships.friendId),
			}),
		},
	}));

	expect(relationShapes(schema, relations)).toEqual([
		{ table: 'friendships', columns: ['friendId'], refTable: 'users', refColumns: ['id'] },
		{ table: 'friendships', columns: ['userId'], refTable: 'users', refColumns: ['id'] },
	]);

	const db = await createDb([
		sql`create table users (id integer primary key, name text)`,
		sql`create table friendships (user_id integer not null, friend_id integer not null)`,
	], relations);
	await seed(db, schema, { count: 9 });

	const userIds = new Set((await db.select().from(users)).map((row) => row.id));
	const friendshipRows = await db.select().from(friendships);

	expect(friendshipRows.length).toBe(9);
	expect(friendshipRows.every((row) => userIds.has(row.userId) && userIds.has(row.friendId))).toBe(true);
});

test('through whose junction table is not being seeded contributes no relations', async () => {
	const schema = usersToGroupsSchema();
	const relations = defineRelations(schema, (r) => ({
		users: {
			groups: r.many.groups({
				from: r.users.id.through(r.usersToGroups.userId),
				to: r.groups.id.through(r.usersToGroups.groupId),
			}),
		},
	}));

	const seededSchema = { users: schema.users, groups: schema.groups };

	expect(relationShapes(seededSchema, relations)).toEqual([]);

	const db = await createDb(usersToGroupsDdl, relations);
	await seed(db, seededSchema, { count: 4 });

	expect((await db.select().from(schema.users)).length).toBe(4);
	expect((await db.select().from(schema.groups)).length).toBe(4);
	expect((await db.select().from(schema.usersToGroups)).length).toBe(0);
});

test('junction with a composite primary key gets distinct pairs when filled near the pair space', async () => {
	const users = pgTable('users', { id: integer('id').primaryKey(), name: text('name') });
	const groups = pgTable('groups', { id: integer('id').primaryKey(), title: text('title') });
	const usersToGroups = pgTable('users_to_groups', {
		userId: integer('user_id').notNull(),
		groupId: integer('group_id').notNull(),
	}, (t) => [primaryKey({ columns: [t.userId, t.groupId] })]);

	const schema = { users, groups, usersToGroups };
	const relations = defineRelations(schema, (r) => ({
		users: {
			groups: r.many.groups({
				from: r.users.id.through(r.usersToGroups.userId),
				to: r.groups.id.through(r.usersToGroups.groupId),
			}),
		},
	}));

	const db = await createDb([
		sql`create table users (id integer primary key, name text)`,
		sql`create table groups (id integer primary key, title text)`,
		sql`create table users_to_groups (user_id integer not null, group_id integer not null, primary key (user_id, group_id))`,
	], relations);

	await seed(db, schema).refine(() => ({
		users: { count: 5 },
		groups: { count: 5 },
		usersToGroups: { count: 20 },
	}));

	const userIds = new Set((await db.select().from(users)).map((row) => row.id));
	const groupIds = new Set((await db.select().from(groups)).map((row) => row.id));
	const junctionRows = await db.select().from(usersToGroups);

	expect(junctionRows.length).toBe(20);
	expect(junctionRows.every((row) => userIds.has(row.userId) && groupIds.has(row.groupId))).toBe(true);
	expect(new Set(junctionRows.map((row) => `${row.userId}|${row.groupId}`)).size).toBe(20);
});
