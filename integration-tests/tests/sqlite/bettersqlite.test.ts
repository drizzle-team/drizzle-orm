import 'dotenv/config';
import Database from 'better-sqlite3';
import { defineRelations, DrizzleError, eq, sql, TransactionRollbackError } from 'drizzle-orm';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import { alias } from 'drizzle-orm/sqlite-core';
import { beforeAll, beforeEach, expect, expectTypeOf, test } from 'vitest';
import relations from './sqlite.relations';
import {
	allTypesTable,
	commentsTable,
	courseOfferings,
	customTypesTable,
	groupsTable,
	postsTable,
	studentGrades,
	students,
	usersTable,
	usersToGroupsTable,
} from './sqlite.schema';

const ENABLE_LOGGING = false;

let db: BetterSQLite3Database<never, typeof relations>;

beforeAll(() => {
	const dbPath = process.env['SQLITE_DB_PATH'] ?? ':memory:';

	db = drizzle({ client: new Database(dbPath), relations, logger: ENABLE_LOGGING, casing: 'snake_case' });
});

beforeEach(() => {
	db.run(sql`drop table if exists \`groups\``);
	db.run(sql`drop table if exists \`users\``);
	db.run(sql`drop view if exists \`users_view\``);
	db.run(sql`drop table if exists \`users_to_groups\``);
	db.run(sql`drop table if exists \`posts\``);
	db.run(sql`drop table if exists \`comments\``);
	db.run(sql`drop table if exists \`comment_likes\``);
	db.run(sql`drop table if exists \`all_types\``);
	db.run(sql`drop table if exists \`custom_types\``);
	db.run(sql`drop table if exists \`course_offerings\``);
	db.run(sql`drop table if exists \`student_grades\``);
	db.run(sql`drop table if exists \`students\``);

	db.run(
		sql`
			CREATE TABLE \`users\` (
			    \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			    \`name\` text NOT NULL,
			    \`verified\` integer DEFAULT 0 NOT NULL,
			    \`invited_by\` integer
			);
		`,
	);
	db.run(
		sql`
			CREATE TABLE \`groups\` (
			    \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			    \`name\` text NOT NULL,
			    \`description\` text
			);
		`,
	);
	db.run(
		sql`
			CREATE TABLE \`users_to_groups\` (
			    \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			    \`user_id\` integer NOT NULL,
			    \`group_id\` integer NOT NULL
			);
		`,
	);
	db.run(
		sql`
			CREATE TABLE \`posts\` (
			    \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			    \`content\` text NOT NULL,
			    \`owner_id\` integer,
			    \`created_at\` integer DEFAULT current_timestamp NOT NULL
			);
		`,
	);
	db.run(
		sql`
			CREATE VIEW \`users_view\` AS select \`users\`.\`id\`, \`users\`.\`name\`, \`users\`.\`verified\`, \`users\`.\`invited_by\`, \`posts\`.\`content\`, \`posts\`.\`created_at\`, (select count(*) from \`users\` as \`count_source\` where \`users\`.\`id\` <> 2) as \`count\` from \`users\` left join \`posts\` on \`users\`.\`id\` = \`posts\`.\`owner_id\`;
		`,
	);
	db.run(
		sql`
			CREATE TABLE \`comments\` (
			    \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			    \`content\` text NOT NULL,
			    \`creator\` integer,
			    \`post_id\` integer,
			    \`created_at\` integer DEFAULT current_timestamp NOT NULL
			);
		`,
	);
	db.run(
		sql`
			CREATE TABLE \`comment_likes\` (
			    \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			    \`creator\` integer,
			    \`comment_id\` integer,
			    \`created_at\` integer DEFAULT current_timestamp NOT NULL
			);
		`,
	);
	db.run(
		sql`
			CREATE TABLE \`course_offerings\` (
				\`course_id\` integer NOT NULL,
				\`semester\` text NOT NULL,
				CONSTRAINT \`course_offerings_pkey\` PRIMARY KEY(\`course_id\`,\`semester\`)
			)	
		`,
	);
	db.run(
		sql`
			CREATE TABLE \`student_grades\` (
				\`student_id\` integer NOT NULL,
				\`course_id\` integer NOT NULL,
				\`semester\` text NOT NULL,
				\`grade\` text,
				CONSTRAINT \`student_grades_pkey\` PRIMARY KEY(\`student_id\`,\`course_id\`,\`semester\`)
			);
		`,
	);
	db.run(
		sql`
			CREATE TABLE \`students\` (
				\`student_id\` integer PRIMARY KEY NOT NULL,
				\`name\` text NOT NULL
			);
		`,
	);
});

test('[Find Many] Get users with posts', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]).run();

	const usersWithPosts = db.query.usersTable.findMany({
		with: {
			posts: true,
		},
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	usersWithPosts.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(usersWithPosts.length).eq(3);
	expect(usersWithPosts[0]?.posts.length).eq(1);
	expect(usersWithPosts[1]?.posts.length).eq(1);
	expect(usersWithPosts[2]?.posts.length).eq(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		posts: [{ id: 2, ownerId: 2, content: 'Post2', createdAt: usersWithPosts[1]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts[2]).toEqual({
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: null,
		posts: [{ id: 3, ownerId: 3, content: 'Post3', createdAt: usersWithPosts[2]?.posts[0]?.createdAt }],
	});
});

test('[Find Many] Get users with posts + limit posts', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]).run();

	const usersWithPosts = db.query.usersTable.findMany({
		with: {
			posts: {
				limit: 1,
			},
		},
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	usersWithPosts.sort((a, b) => (a.id > b.id) ? 1 : -1);
	usersWithPosts[0]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);
	usersWithPosts[1]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);
	usersWithPosts[2]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(usersWithPosts.length).eq(3);
	expect(usersWithPosts[0]?.posts.length).eq(1);
	expect(usersWithPosts[1]?.posts.length).eq(1);
	expect(usersWithPosts[2]?.posts.length).eq(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		posts: [{ id: 4, ownerId: 2, content: 'Post2', createdAt: usersWithPosts[1]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts[2]).toEqual({
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: null,
		posts: [{ id: 6, ownerId: 3, content: 'Post3', createdAt: usersWithPosts[2]?.posts[0]?.createdAt }],
	});
});

test('[Find Many] Get users with posts + limit posts and users', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]).run();

	const usersWithPosts = db.query.usersTable.findMany({
		limit: 2,
		with: {
			posts: {
				limit: 1,
			},
		},
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	usersWithPosts.sort((a, b) => (a.id > b.id) ? 1 : -1);
	usersWithPosts[0]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);
	usersWithPosts[1]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(usersWithPosts.length).eq(2);
	expect(usersWithPosts[0]?.posts.length).eq(1);
	expect(usersWithPosts[1]?.posts.length).eq(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		posts: [{ id: 4, ownerId: 2, content: 'Post2', createdAt: usersWithPosts[1]?.posts[0]?.createdAt }],
	});
});

test('[Find Many] Get users with posts + custom fields', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]).run();

	const usersWithPosts = db.query.usersTable.findMany({
		with: {
			posts: true,
		},
		extras: ({
			lowerName: ({ name }, { sql }) => sql<string>`lower(${name})`.as('name_lower'),
		}),
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		lowerName: string;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	usersWithPosts.sort((a, b) => (a.id > b.id) ? 1 : -1);
	usersWithPosts[0]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);
	usersWithPosts[1]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);
	usersWithPosts[2]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(usersWithPosts.length).toEqual(3);
	expect(usersWithPosts[0]?.posts.length).toEqual(3);
	expect(usersWithPosts[1]?.posts.length).toEqual(2);
	expect(usersWithPosts[2]?.posts.length).toEqual(2);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		lowerName: 'dan',
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }, {
			id: 2,
			ownerId: 1,
			content: 'Post1.2',
			createdAt: usersWithPosts[0]?.posts[1]?.createdAt,
		}, { id: 3, ownerId: 1, content: 'Post1.3', createdAt: usersWithPosts[0]?.posts[2]?.createdAt }],
	});
	expect(usersWithPosts[1]).toEqual({
		id: 2,
		name: 'Andrew',
		lowerName: 'andrew',
		verified: 0,
		invitedBy: null,
		posts: [{ id: 4, ownerId: 2, content: 'Post2', createdAt: usersWithPosts[1]?.posts[0]?.createdAt }, {
			id: 5,
			ownerId: 2,
			content: 'Post2.1',
			createdAt: usersWithPosts[1]?.posts[1]?.createdAt,
		}],
	});
	expect(usersWithPosts[2]).toEqual({
		id: 3,
		name: 'Alex',
		lowerName: 'alex',
		verified: 0,
		invitedBy: null,
		posts: [{ id: 6, ownerId: 3, content: 'Post3', createdAt: usersWithPosts[2]?.posts[0]?.createdAt }, {
			id: 7,
			ownerId: 3,
			content: 'Post3.1',
			createdAt: usersWithPosts[2]?.posts[1]?.createdAt,
		}],
	});
});

test('[Find Many] Get users with posts + custom fields + limits', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]).run();

	const usersWithPosts = db.query.usersTable.findMany({
		limit: 1,
		with: {
			posts: {
				limit: 1,
			},
		},
		extras: ({
			lowerName: (usersTable, { sql }) => sql<string>`lower(${usersTable.name})`.as('name_lower'),
		}),
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		lowerName: string;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	expect(usersWithPosts.length).toEqual(1);
	expect(usersWithPosts[0]?.posts.length).toEqual(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		name: 'Dan',
		lowerName: 'dan',
		verified: 0,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
});

test('[Find Many] Get users with posts + orderBy', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: '1' },
		{ ownerId: 1, content: '2' },
		{ ownerId: 1, content: '3' },
		{ ownerId: 2, content: '4' },
		{ ownerId: 2, content: '5' },
		{ ownerId: 3, content: '6' },
		{ ownerId: 3, content: '7' },
	]).run();

	const usersWithPosts = db.query.usersTable.findMany({
		with: {
			posts: {
				orderBy: {
					content: 'desc',
				},
			},
		},
		orderBy: {
			id: 'desc',
		},
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	expect(usersWithPosts[0]).toEqual({
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: null,
		posts: expect.anything(),
	});

	expect(usersWithPosts[0]!.posts).toEqual([
		{ id: 7, ownerId: 3, content: '7', createdAt: expect.any(Date) },
		{ id: 6, ownerId: 3, content: '6', createdAt: expect.any(Date) },
	]);

	expect(usersWithPosts[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		posts: expect.anything(),
	});

	expect(usersWithPosts[1]!.posts).toEqual([
		{ id: 5, ownerId: 2, content: '5', createdAt: expect.any(Date) },
		{ id: 4, ownerId: 2, content: '4', createdAt: expect.any(Date) },
	]);

	expect(usersWithPosts[2]).toEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		posts: expect.anything(),
	});

	expect(usersWithPosts[2]!.posts).toEqual([
		{ id: 3, ownerId: 1, content: '3', createdAt: expect.any(Date) },
		{ id: 2, ownerId: 1, content: '2', createdAt: expect.any(Date) },
		{ id: 1, ownerId: 1, content: '1', createdAt: expect.any(Date) },
	]);
});

test('[Find Many] Get users with posts + where', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]).run();

	const usersWithPosts = db.query.usersTable.findMany({
		where: {
			id: 1,
		},
		with: {
			posts: {
				where: {
					id: 1,
				},
			},
		},
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	expect(usersWithPosts.length).eq(1);
	expect(usersWithPosts[0]?.posts.length).eq(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
});

test('[Find Many] Get users with posts + where + partial', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]).run();

	const usersWithPosts = db.query.usersTable.findMany({
		columns: {
			id: true,
			name: true,
		},
		with: {
			posts: {
				columns: {
					id: true,
					content: true,
				},
				where: {
					id: 1,
				},
			},
		},
		where: {
			id: 1,
		},
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		posts: {
			id: number;
			content: string;
		}[];
	}[]>();

	expect(usersWithPosts.length).eq(1);
	expect(usersWithPosts[0]?.posts.length).eq(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		name: 'Dan',
		posts: [{ id: 1, content: 'Post1' }],
	});
});

test('[Find Many] Get users with posts + where + partial. Did not select posts id, but used it in where', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]).run();

	const usersWithPosts = db.query.usersTable.findMany({
		columns: {
			id: true,
			name: true,
		},
		with: {
			posts: {
				columns: {
					id: true,
					content: true,
				},
				where: {
					id: 1,
				},
			},
		},
		where: {
			id: 1,
		},
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		posts: {
			id: number;
			content: string;
		}[];
	}[]>();

	expect(usersWithPosts.length).eq(1);
	expect(usersWithPosts[0]?.posts.length).eq(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		name: 'Dan',
		posts: [{ id: 1, content: 'Post1' }],
	});
});

test('[Find Many] Get users with posts + where + partial(true + false)', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]).run();

	const usersWithPosts = db.query.usersTable.findMany({
		columns: {
			id: true,
			name: false,
		},
		with: {
			posts: {
				columns: {
					id: true,
					content: false,
				},
				where: {
					id: 1,
				},
			},
		},
		where: {
			id: 1,
		},
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		posts: {
			id: number;
		}[];
	}[]>();

	expect(usersWithPosts.length).eq(1);
	expect(usersWithPosts[0]?.posts.length).eq(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		posts: [{ id: 1 }],
	});
});

test('[Find Many] Get users with posts + where + partial(false)', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]).run();

	const usersWithPosts = db.query.usersTable.findMany({
		columns: {
			name: false,
		},
		with: {
			posts: {
				columns: {
					content: false,
				},
				where: {
					id: 1,
				},
			},
		},
		where: {
			id: 1,
		},
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		verified: number;
		invitedBy: number | null;
		posts: {
			id: number;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	expect(usersWithPosts.length).eq(1);
	expect(usersWithPosts[0]?.posts.length).eq(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		verified: 0,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
});

test('[Find Many] Get users with posts in transaction', () => {
	let usersWithPosts: {
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[] = [];

	db.transaction((tx) => {
		tx.insert(usersTable).values([
			{ id: 1, name: 'Dan' },
			{ id: 2, name: 'Andrew' },
			{ id: 3, name: 'Alex' },
		]).run();

		tx.insert(postsTable).values([
			{ ownerId: 1, content: 'Post1' },
			{ ownerId: 1, content: 'Post1.1' },
			{ ownerId: 2, content: 'Post2' },
			{ ownerId: 3, content: 'Post3' },
		]).run();

		usersWithPosts = tx.query.usersTable.findMany({
			where: {
				id: 1,
			},
			with: {
				posts: {
					where: {
						id: 1,
					},
				},
			},
		}).sync();
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	expect(usersWithPosts.length).eq(1);
	expect(usersWithPosts[0]?.posts.length).eq(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
});

test('[Find Many] Get users with posts in rollbacked transaction', () => {
	let usersWithPosts: {
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[] = [];

	expect(() =>
		db.transaction((tx) => {
			tx.insert(usersTable).values([
				{ id: 1, name: 'Dan' },
				{ id: 2, name: 'Andrew' },
				{ id: 3, name: 'Alex' },
			]).run();

			tx.insert(postsTable).values([
				{ ownerId: 1, content: 'Post1' },
				{ ownerId: 1, content: 'Post1.1' },
				{ ownerId: 2, content: 'Post2' },
				{ ownerId: 3, content: 'Post3' },
			]).run();

			tx.rollback();

			usersWithPosts = tx.query.usersTable.findMany({
				where: {
					id: 1,
				},
				with: {
					posts: {
						where: {
							id: 1,
						},
					},
				},
			}).sync();
		})
	).toThrow(TransactionRollbackError);

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	expect(usersWithPosts.length).eq(0);
});

test('[Find Many] Get only custom fields', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ id: 1, ownerId: 1, content: 'Post1' },
		{ id: 2, ownerId: 1, content: 'Post1.2' },
		{ id: 3, ownerId: 1, content: 'Post1.3' },
		{ id: 4, ownerId: 2, content: 'Post2' },
		{ id: 5, ownerId: 2, content: 'Post2.1' },
		{ id: 6, ownerId: 3, content: 'Post3' },
		{ id: 7, ownerId: 3, content: 'Post3.1' },
	]).run();

	const usersWithPosts = db.query.usersTable.findMany({
		columns: {},
		with: {
			posts: {
				columns: {},
				extras: ({
					lowerName: ({ content }, { sql }) => sql<string>`lower(${content})`.as('content_lower'),
				}),
			},
		},
		extras: ({
			lowerName: ({ name }, { sql }) => sql<string>`lower(${name})`.as('name_lower'),
		}),
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		lowerName: string;
		posts: {
			lowerName: string;
		}[];
	}[]>();

	expect(usersWithPosts.length).toEqual(3);
	expect(usersWithPosts[0]?.posts.length).toEqual(3);
	expect(usersWithPosts[1]?.posts.length).toEqual(2);
	expect(usersWithPosts[2]?.posts.length).toEqual(2);

	expect(usersWithPosts[0]?.lowerName).toEqual('dan');
	expect(usersWithPosts[1]?.lowerName).toEqual('andrew');
	expect(usersWithPosts[2]?.lowerName).toEqual('alex');

	expect(usersWithPosts[0]?.posts).toContainEqual({
		lowerName: 'post1',
	});

	expect(usersWithPosts[0]?.posts).toContainEqual({
		lowerName: 'post1.2',
	});

	expect(usersWithPosts[0]?.posts).toContainEqual({
		lowerName: 'post1.3',
	});

	expect(usersWithPosts[1]?.posts).toContainEqual({
		lowerName: 'post2',
	});

	expect(usersWithPosts[1]?.posts).toContainEqual({
		lowerName: 'post2.1',
	});

	expect(usersWithPosts[2]?.posts).toContainEqual({
		lowerName: 'post3',
	});

	expect(usersWithPosts[2]?.posts).toContainEqual({
		lowerName: 'post3.1',
	});
});

test('[Find Many] Get only custom fields + where', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]).run();

	const usersWithPosts = db.query.usersTable.findMany({
		columns: {},
		with: {
			posts: {
				columns: {},
				where: {
					id: {
						gte: 2,
					},
				},
				extras: ({
					lowerName: ({ content }, { sql }) => sql<string>`lower(${content})`.as('content_lower'),
				}),
			},
		},
		where: {
			id: 1,
		},
		extras: ({
			lowerName: ({ name }, { sql }) => sql<string>`lower(${name})`.as('name_lower'),
		}),
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		lowerName: string;
		posts: {
			lowerName: string;
		}[];
	}[]>();

	expect(usersWithPosts.length).toEqual(1);
	expect(usersWithPosts[0]?.posts.length).toEqual(2);

	expect(usersWithPosts).toContainEqual({
		lowerName: 'dan',
		posts: [{ lowerName: 'post1.2' }, { lowerName: 'post1.3' }],
	});
});

test('[Find Many] Get only custom fields + where + limit', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]).run();

	const usersWithPosts = db.query.usersTable.findMany({
		columns: {},
		with: {
			posts: {
				columns: {},
				where: {
					id: {
						gte: 2,
					},
				},
				limit: 1,
				extras: ({
					lowerName: ({ content }, { sql }) => sql<string>`lower(${content})`.as('content_lower'),
				}),
			},
		},
		where: {
			id: 1,
		},
		extras: ({
			lowerName: ({ name }, { sql }) => sql<string>`lower(${name})`.as('name_lower'),
		}),
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		lowerName: string;
		posts: {
			lowerName: string;
		}[];
	}[]>();

	expect(usersWithPosts.length).toEqual(1);
	expect(usersWithPosts[0]?.posts.length).toEqual(1);

	expect(usersWithPosts).toContainEqual({
		lowerName: 'dan',
		posts: [{ lowerName: 'post1.2' }],
	});
});

test('[Find Many] Get only custom fields + where + orderBy', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]).run();

	const usersWithPosts = db.query.usersTable.findMany({
		columns: {},
		with: {
			posts: {
				columns: {},
				where: {
					id: {
						gte: 2,
					},
				},
				orderBy: {
					id: 'desc',
				},
				extras: ({
					lowerName: ({ content }, { sql }) => sql<string>`lower(${content})`.as('content_lower'),
				}),
			},
		},
		where: {
			id: 1,
		},
		extras: ({
			lowerName: ({ name }, { sql }) => sql<string>`lower(${name})`.as('name_lower'),
		}),
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		lowerName: string;
		posts: {
			lowerName: string;
		}[];
	}[]>();

	expect(usersWithPosts.length).toEqual(1);
	expect(usersWithPosts[0]?.posts.length).toEqual(2);

	expect(usersWithPosts).toContainEqual({
		lowerName: 'dan',
		posts: [{ lowerName: 'post1.3' }, { lowerName: 'post1.2' }],
	});
});

test('[Find One] Get only custom fields', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]).run();

	const usersWithPosts = db.query.usersTable.findFirst({
		columns: {},
		with: {
			posts: {
				columns: {},
				extras: ({
					lowerName: ({ content }, { sql }) => sql<string>`lower(${content})`.as('content_lower'),
				}),
			},
		},
		extras: ({
			lowerName: ({ name }, { sql }) => sql<string>`lower(${name})`.as('name_lower'),
		}),
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			lowerName: string;
			posts: {
				lowerName: string;
			}[];
		} | undefined
	>();

	expect(usersWithPosts?.posts.length).toEqual(3);

	expect(usersWithPosts?.lowerName).toEqual('dan');

	expect(usersWithPosts?.posts).toContainEqual({
		lowerName: 'post1',
	});

	expect(usersWithPosts?.posts).toContainEqual({
		lowerName: 'post1.2',
	});

	expect(usersWithPosts?.posts).toContainEqual({
		lowerName: 'post1.3',
	});
});

test('[Find One] Get only custom fields + where', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]).run();

	const usersWithPosts = db.query.usersTable.findFirst({
		columns: {},
		with: {
			posts: {
				columns: {},
				where: {
					id: {
						gte: 2,
					},
				},
				extras: ({
					lowerName: ({ content }, { sql }) => sql<string>`lower(${content})`.as('content_lower'),
				}),
			},
		},
		where: {
			id: 1,
		},
		extras: ({
			lowerName: ({ name }, { sql }) => sql<string>`lower(${name})`.as('name_lower'),
		}),
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			lowerName: string;
			posts: {
				lowerName: string;
			}[];
		} | undefined
	>();

	expect(usersWithPosts?.posts.length).toEqual(2);

	expect(usersWithPosts).toEqual({
		lowerName: 'dan',
		posts: [{ lowerName: 'post1.2' }, { lowerName: 'post1.3' }],
	});
});

test('[Find One] Get only custom fields + where + limit', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]).run();

	const usersWithPosts = db.query.usersTable.findFirst({
		columns: {},
		with: {
			posts: {
				columns: {},
				where: {
					id: {
						gte: 2,
					},
				},
				limit: 1,
				extras: ({
					lowerName: ({ content }, { sql }) => sql<string>`lower(${content})`.as('content_lower'),
				}),
			},
		},
		where: {
			id: 1,
		},
		extras: ({
			lowerName: ({ name }, { sql }) => sql<string>`lower(${name})`.as('name_lower'),
		}),
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			lowerName: string;
			posts: {
				lowerName: string;
			}[];
		} | undefined
	>();

	expect(usersWithPosts?.posts.length).toEqual(1);

	expect(usersWithPosts).toEqual({
		lowerName: 'dan',
		posts: [{ lowerName: 'post1.2' }],
	});
});

test('[Find One] Get only custom fields + where + orderBy', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]).run();

	const usersWithPosts = db.query.usersTable.findFirst({
		columns: {},
		with: {
			posts: {
				columns: {},
				where: {
					id: {
						gte: 2,
					},
				},
				orderBy: {
					id: 'desc',
				},
				extras: ({
					lowerName: ({ content }, { sql }) => sql<string>`lower(${content})`.as('content_lower'),
				}),
			},
		},
		where: {
			id: 1,
		},
		extras: ({
			lowerName: ({ name }, { sql }) => sql<string>`lower(${name})`.as('name_lower'),
		}),
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			lowerName: string;
			posts: {
				lowerName: string;
			}[];
		} | undefined
	>();

	expect(usersWithPosts?.posts.length).toEqual(2);

	expect(usersWithPosts).toEqual({
		lowerName: 'dan',
		posts: [{ lowerName: 'post1.3' }, { lowerName: 'post1.2' }],
	});
});

test('[Find Many] Get select {}', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	expect(() =>
		db.query.usersTable.findMany({
			columns: {},
		}).sync()
	).toThrow(DrizzleError);
});

test('[Find One] Get select {}', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	expect(() =>
		db.query.usersTable.findFirst({
			columns: {},
		}).sync()
	).toThrow(DrizzleError);
});

test('[Find Many] Get deep select {}', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]).run();

	expect(() =>
		db.query.usersTable.findMany({
			columns: {},
			with: {
				posts: {
					columns: {},
				},
			},
		}).sync()
	).toThrow(DrizzleError);
});

test('[Find One] Get deep select {}', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]).run();

	expect(() =>
		db.query.usersTable.findFirst({
			columns: {},
			with: {
				posts: {
					columns: {},
				},
			},
		}).sync()
	).toThrow(DrizzleError);
});

test('[Find Many] Get users with posts + prepared limit', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]).run();

	const prepared = db.query.usersTable.findMany({
		with: {
			posts: {
				limit: sql.placeholder('limit'),
			},
		},
	}).prepare();

	const usersWithPosts = prepared.execute({ limit: 1 }).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	expect(usersWithPosts.length).eq(3);
	expect(usersWithPosts[0]?.posts.length).eq(1);
	expect(usersWithPosts[1]?.posts.length).eq(1);
	expect(usersWithPosts[2]?.posts.length).eq(1);

	expect(usersWithPosts).toContainEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts).toContainEqual({
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		posts: [{ id: 4, ownerId: 2, content: 'Post2', createdAt: usersWithPosts[1]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts).toContainEqual({
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: null,
		posts: [{ id: 6, ownerId: 3, content: 'Post3', createdAt: usersWithPosts[2]?.posts[0]?.createdAt }],
	});
});

test('[Find Many] Get users with posts + prepared limit + offset', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]).run();

	const prepared = db.query.usersTable.findMany({
		limit: sql.placeholder('uLimit'),
		offset: sql.placeholder('uOffset'),
		with: {
			posts: {
				limit: sql.placeholder('pLimit'),
			},
		},
	}).prepare();

	const usersWithPosts = prepared.execute({ pLimit: 1, uLimit: 3, uOffset: 1 }).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	expect(usersWithPosts.length).eq(2);
	expect(usersWithPosts[0]?.posts.length).eq(1);
	expect(usersWithPosts[1]?.posts.length).eq(1);

	expect(usersWithPosts).toContainEqual({
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		posts: [{ id: 4, ownerId: 2, content: 'Post2', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts).toContainEqual({
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: null,
		posts: [{ id: 6, ownerId: 3, content: 'Post3', createdAt: usersWithPosts[1]?.posts[0]?.createdAt }],
	});
});

test('[Find Many] Get users with posts + prepared where', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]).run();

	const prepared = db.query.usersTable.findMany({
		where: {
			id: {
				eq: sql.placeholder('id'),
			},
		},
		with: {
			posts: {
				where: {
					id: 1,
				},
			},
		},
	}).prepare();

	const usersWithPosts = prepared.execute({ id: 1 }).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	expect(usersWithPosts.length).eq(1);
	expect(usersWithPosts[0]?.posts.length).eq(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
});

test('[Find Many] Get users with posts + prepared + limit + offset + where', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]).run();

	const prepared = db.query.usersTable.findMany({
		limit: sql.placeholder('uLimit'),
		offset: sql.placeholder('uOffset'),
		where: {
			id: {
				OR: [
					{ eq: sql.placeholder('id') },
					3,
				],
			},
		},
		with: {
			posts: {
				where: {
					id: {
						eq: sql.placeholder('pid'),
					},
				},
				limit: sql.placeholder('pLimit'),
			},
		},
	}).prepare();

	const usersWithPosts = prepared.execute({ pLimit: 1, uLimit: 3, uOffset: 1, id: 2, pid: 6 }).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	expect(usersWithPosts.length).eq(1);
	expect(usersWithPosts[0]?.posts.length).eq(1);

	expect(usersWithPosts).toContainEqual({
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: null,
		posts: [{ id: 6, ownerId: 3, content: 'Post3', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
});

test('[Find One] Get users with posts', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]).run();

	const usersWithPosts = db.query.usersTable.findFirst({
		with: {
			posts: true,
		},
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			posts: {
				id: number;
				content: string;
				ownerId: number | null;
				createdAt: Date;
			}[];
		} | undefined
	>();

	expect(usersWithPosts!.posts.length).eq(1);

	expect(usersWithPosts).toEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts?.posts[0]?.createdAt }],
	});
});

test('[Find One] Get users with posts + limit posts', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]).run();

	const usersWithPosts = db.query.usersTable.findFirst({
		with: {
			posts: {
				limit: 1,
			},
		},
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			posts: {
				id: number;
				content: string;
				ownerId: number | null;
				createdAt: Date;
			}[];
		} | undefined
	>();

	expect(usersWithPosts!.posts.length).eq(1);

	expect(usersWithPosts).toEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts?.posts[0]?.createdAt }],
	});
});

test('[Find One] Get users with posts no results found', () => {
	const usersWithPosts = db.query.usersTable.findFirst({
		with: {
			posts: {
				limit: 1,
			},
		},
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			posts: {
				id: number;
				content: string;
				ownerId: number | null;
				createdAt: Date;
			}[];
		} | undefined
	>();

	expect(usersWithPosts).toBeUndefined();
});

test('[Find One] Get users with posts + limit posts and users', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]).run();

	const usersWithPosts = db.query.usersTable.findFirst({
		with: {
			posts: {
				limit: 1,
			},
		},
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			posts: {
				id: number;
				content: string;
				ownerId: number | null;
				createdAt: Date;
			}[];
		} | undefined
	>();

	expect(usersWithPosts!.posts.length).eq(1);

	expect(usersWithPosts).toEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts?.posts[0]?.createdAt }],
	});
});

test('[Find One] Get users with posts + custom fields', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]).run();

	const usersWithPosts = db.query.usersTable.findFirst({
		with: {
			posts: true,
		},
		extras: ({
			lowerName: ({ name }, { sql }) => sql<string>`lower(${name})`.as('name_lower'),
		}),
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			lowerName: string;
			posts: {
				id: number;
				content: string;
				ownerId: number | null;
				createdAt: Date;
			}[];
		} | undefined
	>();

	expect(usersWithPosts!.posts.length).toEqual(3);

	expect(usersWithPosts?.lowerName).toEqual('dan');
	expect(usersWithPosts?.id).toEqual(1);
	expect(usersWithPosts?.verified).toEqual(0);
	expect(usersWithPosts?.invitedBy).toEqual(null);
	expect(usersWithPosts?.name).toEqual('Dan');

	expect(usersWithPosts?.posts).toContainEqual({
		id: 1,
		ownerId: 1,
		content: 'Post1',
		createdAt: usersWithPosts?.posts[0]?.createdAt,
	});

	expect(usersWithPosts?.posts).toContainEqual({
		id: 2,
		ownerId: 1,
		content: 'Post1.2',
		createdAt: usersWithPosts?.posts[1]?.createdAt,
	});

	expect(usersWithPosts?.posts).toContainEqual({
		id: 3,
		ownerId: 1,
		content: 'Post1.3',
		createdAt: usersWithPosts?.posts[2]?.createdAt,
	});
});

test('[Find One] Get users with posts + custom fields + limits', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]).run();

	const usersWithPosts = db.query.usersTable.findFirst({
		with: {
			posts: {
				limit: 1,
			},
		},
		extras: ({
			lowerName: (usersTable, { sql }) => sql<string>`lower(${usersTable.name})`.as('name_lower'),
		}),
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			lowerName: string;
			posts: {
				id: number;
				content: string;
				ownerId: number | null;
				createdAt: Date;
			}[];
		} | undefined
	>();

	expect(usersWithPosts!.posts.length).toEqual(1);

	expect(usersWithPosts).toEqual({
		id: 1,
		name: 'Dan',
		lowerName: 'dan',
		verified: 0,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts?.posts[0]?.createdAt }],
	});
});

test.skip('[Find One] Get users with posts + orderBy', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: '1' },
		{ ownerId: 1, content: '2' },
		{ ownerId: 1, content: '3' },
		{ ownerId: 2, content: '4' },
		{ ownerId: 2, content: '5' },
		{ ownerId: 3, content: '6' },
		{ ownerId: 3, content: '7' },
	]).run();

	const usersWithPosts = db.query.usersTable.findFirst({
		with: {
			posts: {
				orderBy: {
					id: 'asc',
				},
			},
		},
		orderBy: {
			id: 'desc',
		},
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			posts: {
				id: number;
				content: string;
				ownerId: number | null;
				createdAt: Date;
			}[];
		} | undefined
	>();

	expect(usersWithPosts!.posts.length).eq(2);

	expect(usersWithPosts).toEqual({
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: null,
		posts: [{
			id: 7,
			ownerId: 3,
			content: '7',
			createdAt: usersWithPosts?.posts[1]?.createdAt,
		}, { id: 6, ownerId: 3, content: '6', createdAt: usersWithPosts?.posts[0]?.createdAt }],
	});
});

test('[Find One] Get users with posts + where', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]).run();

	const usersWithPosts = db.query.usersTable.findFirst({
		where: {
			id: 1,
		},
		with: {
			posts: {
				where: {
					id: 1,
				},
			},
		},
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			posts: {
				id: number;
				content: string;
				ownerId: number | null;
				createdAt: Date;
			}[];
		} | undefined
	>();

	expect(usersWithPosts!.posts.length).eq(1);

	expect(usersWithPosts).toEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts?.posts[0]?.createdAt }],
	});
});

test('[Find One] Get users with posts + where + partial', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]).run();

	const usersWithPosts = db.query.usersTable.findFirst({
		columns: {
			id: true,
			name: true,
		},
		with: {
			posts: {
				columns: {
					id: true,
					content: true,
				},
				where: {
					id: 1,
				},
			},
		},
		where: {
			id: 1,
		},
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			name: string;
			posts: {
				id: number;
				content: string;
			}[];
		} | undefined
	>();

	expect(usersWithPosts!.posts.length).eq(1);

	expect(usersWithPosts).toEqual({
		id: 1,
		name: 'Dan',
		posts: [{ id: 1, content: 'Post1' }],
	});
});

test('[Find One] Get users with posts + where + partial. Did not select posts id, but used it in where', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]).run();

	const usersWithPosts = db.query.usersTable.findFirst({
		columns: {
			id: true,
			name: true,
		},
		with: {
			posts: {
				columns: {
					id: true,
					content: true,
				},
				where: {
					id: 1,
				},
			},
		},
		where: {
			id: 1,
		},
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			name: string;
			posts: {
				id: number;
				content: string;
			}[];
		} | undefined
	>();

	expect(usersWithPosts!.posts.length).eq(1);

	expect(usersWithPosts).toEqual({
		id: 1,
		name: 'Dan',
		posts: [{ id: 1, content: 'Post1' }],
	});
});

test('[Find One] Get users with posts + where + partial(true + false)', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]).run();

	const usersWithPosts = db.query.usersTable.findFirst({
		columns: {
			id: true,
			name: false,
		},
		with: {
			posts: {
				columns: {
					id: true,
					content: false,
				},
				where: {
					id: 1,
				},
			},
		},
		where: {
			id: 1,
		},
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			posts: {
				id: number;
			}[];
		} | undefined
	>();

	expect(usersWithPosts!.posts.length).eq(1);

	expect(usersWithPosts).toEqual({
		id: 1,
		posts: [{ id: 1 }],
	});
});

test('[Find One] Get users with posts + where + partial(false)', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]).run();

	const usersWithPosts = db.query.usersTable.findFirst({
		columns: {
			name: false,
		},
		with: {
			posts: {
				columns: {
					content: false,
				},
				where: {
					id: 1,
				},
			},
		},
		where: {
			id: 1,
		},
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			verified: number;
			invitedBy: number | null;
			posts: {
				id: number;
				ownerId: number | null;
				createdAt: Date;
			}[];
		} | undefined
	>();

	expect(usersWithPosts!.posts.length).eq(1);

	expect(usersWithPosts).toEqual({
		id: 1,
		verified: 0,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, createdAt: usersWithPosts?.posts[0]?.createdAt }],
	});
});

test('Get user with invitee', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]).run();

	const usersWithInvitee = db.query.usersTable.findMany({
		with: {
			invitee: true,
		},
	}).sync();

	expectTypeOf(usersWithInvitee).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			invitee: {
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			} | null;
		}[]
	>();

	usersWithInvitee.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(usersWithInvitee.length).eq(4);
	expect(usersWithInvitee[0]?.invitee).toBeNull();
	expect(usersWithInvitee[1]?.invitee).toBeNull();
	expect(usersWithInvitee[2]?.invitee).not.toBeNull();
	expect(usersWithInvitee[3]?.invitee).not.toBeNull();

	expect(usersWithInvitee[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[2]).toEqual({
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: 0, invitedBy: null },
	});
	expect(usersWithInvitee[3]).toEqual({
		id: 4,
		name: 'John',
		verified: 0,
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', verified: 0, invitedBy: null },
	});
});

test('Get user + limit with invitee', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew', invitedBy: 1 },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]).run();

	const usersWithInvitee = db.query.usersTable.findMany({
		with: {
			invitee: true,
		},
		limit: 2,
	}).sync();

	expectTypeOf(usersWithInvitee).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			invitee: {
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			} | null;
		}[]
	>();

	usersWithInvitee.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(usersWithInvitee.length).eq(2);
	expect(usersWithInvitee[0]?.invitee).toBeNull();
	expect(usersWithInvitee[1]?.invitee).not.toBeNull();

	expect(usersWithInvitee[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: 0, invitedBy: null },
	});
});

test('Get user with invitee and custom fields', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]).run();

	const usersWithInvitee = db.query.usersTable.findMany({
		extras: ({ lower: (users, { sql }) => sql<string>`lower(${users.name})`.as('lower_name') }),
		with: {
			invitee: {
				extras: ({ lower: (invitee, { sql }) => sql<string>`lower(${invitee.name})`.as('lower_name') }),
			},
		},
	}).sync();

	expectTypeOf(usersWithInvitee).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			lower: string;
			invitedBy: number | null;
			invitee: {
				id: number;
				name: string;
				verified: number;
				lower: string;
				invitedBy: number | null;
			} | null;
		}[]
	>();

	usersWithInvitee.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(usersWithInvitee.length).eq(4);
	expect(usersWithInvitee[0]?.invitee).toBeNull();
	expect(usersWithInvitee[1]?.invitee).toBeNull();
	expect(usersWithInvitee[2]?.invitee).not.toBeNull();
	expect(usersWithInvitee[3]?.invitee).not.toBeNull();

	expect(usersWithInvitee[0]).toEqual({
		id: 1,
		name: 'Dan',
		lower: 'dan',
		verified: 0,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[1]).toEqual({
		id: 2,
		name: 'Andrew',
		lower: 'andrew',
		verified: 0,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[2]).toEqual({
		id: 3,
		name: 'Alex',
		lower: 'alex',
		verified: 0,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', lower: 'dan', verified: 0, invitedBy: null },
	});
	expect(usersWithInvitee[3]).toEqual({
		id: 4,
		name: 'John',
		lower: 'john',
		verified: 0,
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', lower: 'andrew', verified: 0, invitedBy: null },
	});
});

test('Get user with invitee and custom fields + limits', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]).run();

	const usersWithInvitee = db.query.usersTable.findMany({
		extras: ({ lower: (users, { sql }) => sql<string>`lower(${users.name})`.as('lower_name') }),
		limit: 3,
		with: {
			invitee: {
				extras: ({ lower: (invitee, { sql }) => sql<string>`lower(${invitee.name})`.as('lower_name') }),
			},
		},
	}).sync();

	expectTypeOf(usersWithInvitee).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			lower: string;
			invitedBy: number | null;
			invitee: {
				id: number;
				name: string;
				verified: number;
				lower: string;
				invitedBy: number | null;
			} | null;
		}[]
	>();

	usersWithInvitee.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(usersWithInvitee.length).eq(3);
	expect(usersWithInvitee[0]?.invitee).toBeNull();
	expect(usersWithInvitee[1]?.invitee).toBeNull();
	expect(usersWithInvitee[2]?.invitee).not.toBeNull();

	expect(usersWithInvitee[0]).toEqual({
		id: 1,
		name: 'Dan',
		lower: 'dan',
		verified: 0,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[1]).toEqual({
		id: 2,
		name: 'Andrew',
		lower: 'andrew',
		verified: 0,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[2]).toEqual({
		id: 3,
		name: 'Alex',
		lower: 'alex',
		verified: 0,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', lower: 'dan', verified: 0, invitedBy: null },
	});
});

test('Get user with invitee + order by', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]).run();

	const usersWithInvitee = db.query.usersTable.findMany({
		orderBy: {
			id: 'desc',
		},
		with: {
			invitee: true,
		},
	}).sync();

	expectTypeOf(usersWithInvitee).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			invitee: {
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			} | null;
		}[]
	>();

	expect(usersWithInvitee.length).eq(4);
	expect(usersWithInvitee[3]?.invitee).toBeNull();
	expect(usersWithInvitee[2]?.invitee).toBeNull();
	expect(usersWithInvitee[1]?.invitee).not.toBeNull();
	expect(usersWithInvitee[0]?.invitee).not.toBeNull();

	expect(usersWithInvitee[3]).toEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[2]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[1]).toEqual({
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: 0, invitedBy: null },
	});
	expect(usersWithInvitee[0]).toEqual({
		id: 4,
		name: 'John',
		verified: 0,
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', verified: 0, invitedBy: null },
	});
});

test('Get user with invitee + where', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]).run();

	const usersWithInvitee = db.query.usersTable.findMany({
		where: {
			id: {
				OR: [3, 4],
			},
		},
		with: {
			invitee: true,
		},
	}).sync();

	expectTypeOf(usersWithInvitee).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			invitee: {
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			} | null;
		}[]
	>();

	expect(usersWithInvitee.length).eq(2);
	expect(usersWithInvitee[0]?.invitee).not.toBeNull();
	expect(usersWithInvitee[1]?.invitee).not.toBeNull();

	expect(usersWithInvitee).toContainEqual({
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: 0, invitedBy: null },
	});
	expect(usersWithInvitee).toContainEqual({
		id: 4,
		name: 'John',
		verified: 0,
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', verified: 0, invitedBy: null },
	});
});

test('Get user with invitee + where + partial', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]).run();

	const usersWithInvitee = db.query.usersTable.findMany({
		where: {
			id: {
				OR: [3, 4],
			},
		},
		columns: {
			id: true,
			name: true,
		},
		with: {
			invitee: {
				columns: {
					id: true,
					name: true,
				},
			},
		},
	}).sync();

	expectTypeOf(usersWithInvitee).toEqualTypeOf<
		{
			id: number;
			name: string;
			invitee: {
				id: number;
				name: string;
			} | null;
		}[]
	>();

	expect(usersWithInvitee.length).eq(2);
	expect(usersWithInvitee[0]?.invitee).not.toBeNull();
	expect(usersWithInvitee[1]?.invitee).not.toBeNull();

	expect(usersWithInvitee).toContainEqual({
		id: 3,
		name: 'Alex',
		invitee: { id: 1, name: 'Dan' },
	});
	expect(usersWithInvitee).toContainEqual({
		id: 4,
		name: 'John',
		invitee: { id: 2, name: 'Andrew' },
	});
});

test('Get user with invitee + where + partial.  Did not select users id, but used it in where', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]).run();

	const usersWithInvitee = db.query.usersTable.findMany({
		where: {
			id: {
				OR: [3, 4],
			},
		},
		columns: {
			name: true,
		},
		with: {
			invitee: {
				columns: {
					id: true,
					name: true,
				},
			},
		},
	}).sync();

	expectTypeOf(usersWithInvitee).toEqualTypeOf<
		{
			name: string;
			invitee: {
				id: number;
				name: string;
			} | null;
		}[]
	>();

	expect(usersWithInvitee.length).eq(2);
	expect(usersWithInvitee[0]?.invitee).not.toBeNull();
	expect(usersWithInvitee[1]?.invitee).not.toBeNull();

	expect(usersWithInvitee).toContainEqual({
		name: 'Alex',
		invitee: { id: 1, name: 'Dan' },
	});
	expect(usersWithInvitee).toContainEqual({
		name: 'John',
		invitee: { id: 2, name: 'Andrew' },
	});
});

test('Get user with invitee + where + partial(true+false)', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]).run();

	const usersWithInvitee = db.query.usersTable.findMany({
		where: {
			id: {
				OR: [3, 4],
			},
		},
		columns: {
			id: true,
			name: true,
			verified: false,
		},
		with: {
			invitee: {
				columns: {
					id: true,
					name: true,
					verified: false,
				},
			},
		},
	}).sync();

	expectTypeOf(usersWithInvitee).toEqualTypeOf<
		{
			id: number;
			name: string;
			invitee: {
				id: number;
				name: string;
			} | null;
		}[]
	>();

	expect(usersWithInvitee.length).eq(2);
	expect(usersWithInvitee[0]?.invitee).not.toBeNull();
	expect(usersWithInvitee[1]?.invitee).not.toBeNull();

	expect(usersWithInvitee).toContainEqual({
		id: 3,
		name: 'Alex',
		invitee: { id: 1, name: 'Dan' },
	});
	expect(usersWithInvitee).toContainEqual({
		id: 4,
		name: 'John',
		invitee: { id: 2, name: 'Andrew' },
	});
});

test('Get user with invitee + where + partial(false)', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]).run();

	const usersWithInvitee = db.query.usersTable.findMany({
		where: {
			id: {
				OR: [3, 4],
			},
		},
		columns: {
			verified: false,
		},
		with: {
			invitee: {
				columns: {
					name: false,
				},
			},
		},
	}).sync();

	expectTypeOf(usersWithInvitee).toEqualTypeOf<
		{
			id: number;
			name: string;
			invitedBy: number | null;
			invitee: {
				id: number;
				verified: number;
				invitedBy: number | null;
			} | null;
		}[]
	>();

	expect(usersWithInvitee.length).eq(2);
	expect(usersWithInvitee[0]?.invitee).not.toBeNull();
	expect(usersWithInvitee[1]?.invitee).not.toBeNull();

	expect(usersWithInvitee).toContainEqual({
		id: 3,
		name: 'Alex',
		invitedBy: 1,
		invitee: { id: 1, verified: 0, invitedBy: null },
	});
	expect(usersWithInvitee).toContainEqual({
		id: 4,
		name: 'John',
		invitedBy: 2,
		invitee: { id: 2, verified: 0, invitedBy: null },
	});
});

test('Get user with invitee and posts', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]).run();

	const response = db.query.usersTable.findMany({
		with: {
			invitee: true,
			posts: true,
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			posts: { id: number; ownerId: number | null; content: string; createdAt: Date }[];
			invitee: {
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			} | null;
		}[]
	>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).eq(4);

	expect(response[0]?.invitee).toBeNull();
	expect(response[1]?.invitee).toBeNull();
	expect(response[2]?.invitee).not.toBeNull();
	expect(response[3]?.invitee).not.toBeNull();

	expect(response[0]?.posts.length).eq(1);
	expect(response[1]?.posts.length).eq(1);
	expect(response[2]?.posts.length).eq(1);

	expect(response).toContainEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: response[0]?.posts[0]?.createdAt }],
	});
	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 2, ownerId: 2, content: 'Post2', createdAt: response[1]?.posts[0]?.createdAt }],
	});
	expect(response).toContainEqual({
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: 0, invitedBy: null },
		posts: [{ id: 3, ownerId: 3, content: 'Post3', createdAt: response[2]?.posts[0]?.createdAt }],
	});
	expect(response).toContainEqual({
		id: 4,
		name: 'John',
		verified: 0,
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', verified: 0, invitedBy: null },
		posts: [],
	});
});

test('Get user with invitee and posts + limit posts and users', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]).run();

	const response = db.query.usersTable.findMany({
		limit: 3,
		with: {
			invitee: true,
			posts: {
				limit: 1,
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			posts: { id: number; ownerId: number | null; content: string; createdAt: Date }[];
			invitee: {
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			} | null;
		}[]
	>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).eq(3);

	expect(response[0]?.invitee).toBeNull();
	expect(response[1]?.invitee).toBeNull();
	expect(response[2]?.invitee).not.toBeNull();

	expect(response[0]?.posts.length).eq(1);
	expect(response[1]?.posts.length).eq(1);
	expect(response[2]?.posts.length).eq(1);

	expect(response).toContainEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: response[0]?.posts[0]?.createdAt }],
	});
	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 3, ownerId: 2, content: 'Post2', createdAt: response[1]?.posts[0]?.createdAt }],
	});
	expect(response).toContainEqual({
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: 0, invitedBy: null },
		posts: [{ id: 5, ownerId: 3, content: 'Post3', createdAt: response[2]?.posts[0]?.createdAt }],
	});
});

test('Get user with invitee and posts + limits + custom fields in each', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]).run();

	const response = db.query.usersTable.findMany({
		limit: 3,
		extras: ({ lower: (users, { sql }) => sql<string>`lower(${users.name})`.as('lower_name') }),
		with: {
			invitee: {
				extras: ({ lower: (users, { sql }) => sql<string>`lower(${users.name})`.as('lower_invitee_name') }),
			},
			posts: {
				limit: 1,
				extras: ({ lower: (posts, { sql }) => sql<string>`lower(${posts.content})`.as('lower_content') }),
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			lower: string;
			invitedBy: number | null;
			posts: { id: number; lower: string; ownerId: number | null; content: string; createdAt: Date }[];
			invitee: {
				id: number;
				name: string;
				lower: string;
				verified: number;
				invitedBy: number | null;
			} | null;
		}[]
	>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).eq(3);

	expect(response[0]?.invitee).toBeNull();
	expect(response[1]?.invitee).toBeNull();
	expect(response[2]?.invitee).not.toBeNull();

	expect(response[0]?.posts.length).eq(1);
	expect(response[1]?.posts.length).eq(1);
	expect(response[2]?.posts.length).eq(1);

	expect(response).toContainEqual({
		id: 1,
		name: 'Dan',
		lower: 'dan',
		verified: 0,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', lower: 'post1', createdAt: response[0]?.posts[0]?.createdAt }],
	});
	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		lower: 'andrew',
		verified: 0,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 3, ownerId: 2, content: 'Post2', lower: 'post2', createdAt: response[1]?.posts[0]?.createdAt }],
	});
	expect(response).toContainEqual({
		id: 3,
		name: 'Alex',
		lower: 'alex',
		verified: 0,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', lower: 'dan', verified: 0, invitedBy: null },
		posts: [{ id: 5, ownerId: 3, content: 'Post3', lower: 'post3', createdAt: response[2]?.posts[0]?.createdAt }],
	});
});

test('Get user with invitee and posts + custom fields in each', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]).run();

	const response = db.query.usersTable.findMany({
		extras: ({ lower: (users, { sql }) => sql<string>`lower(${users.name})`.as('lower_name') }),
		with: {
			invitee: {
				extras: ({ lower: (users, { sql }) => sql<string>`lower(${users.name})`.as('lower_name') }),
			},
			posts: {
				extras: ({ lower: (posts, { sql }) => sql<string>`lower(${posts.content})`.as('lower_name') }),
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			lower: string;
			invitedBy: number | null;
			posts: { id: number; lower: string; ownerId: number | null; content: string; createdAt: Date }[];
			invitee: {
				id: number;
				name: string;
				lower: string;
				verified: number;
				invitedBy: number | null;
			} | null;
		}[]
	>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	response[0]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);
	response[1]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);
	response[2]?.posts.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).eq(4);

	expect(response[0]?.invitee).toBeNull();
	expect(response[1]?.invitee).toBeNull();
	expect(response[2]?.invitee).not.toBeNull();
	expect(response[3]?.invitee).not.toBeNull();

	expect(response[0]?.posts.length).eq(2);
	expect(response[1]?.posts.length).eq(2);
	expect(response[2]?.posts.length).eq(2);
	expect(response[3]?.posts.length).eq(0);

	expect(response).toContainEqual({
		id: 1,
		name: 'Dan',
		lower: 'dan',
		verified: 0,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', lower: 'post1', createdAt: response[0]?.posts[0]?.createdAt }, {
			id: 2,
			ownerId: 1,
			content: 'Post1.1',
			lower: 'post1.1',
			createdAt: response[0]?.posts[1]?.createdAt,
		}],
	});
	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		lower: 'andrew',
		verified: 0,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 3, ownerId: 2, content: 'Post2', lower: 'post2', createdAt: response[1]?.posts[0]?.createdAt }, {
			id: 4,
			ownerId: 2,
			content: 'Post2.1',
			lower: 'post2.1',
			createdAt: response[1]?.posts[1]?.createdAt,
		}],
	});
	expect(response).toContainEqual({
		id: 3,
		name: 'Alex',
		lower: 'alex',
		verified: 0,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', lower: 'dan', verified: 0, invitedBy: null },
		posts: [{ id: 5, ownerId: 3, content: 'Post3', lower: 'post3', createdAt: response[2]?.posts[0]?.createdAt }, {
			id: 6,
			ownerId: 3,
			content: 'Post3.1',
			lower: 'post3.1',
			createdAt: response[2]?.posts[1]?.createdAt,
		}],
	});
	expect(response).toContainEqual({
		id: 4,
		name: 'John',
		lower: 'john',
		verified: 0,
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', lower: 'andrew', verified: 0, invitedBy: null },
		posts: [],
	});
});

test.skip('Get user with invitee and posts + orderBy', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
	]).run();

	const response = db.query.usersTable.findMany({
		orderBy: {
			id: 'desc',
		},
		with: {
			invitee: true,
			posts: {
				orderBy: {
					id: 'desc',
				},
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			posts: { id: number; ownerId: number | null; content: string; createdAt: Date }[];
			invitee: {
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			} | null;
		}[]
	>();

	expect(response.length).eq(4);

	expect(response[3]?.invitee).toBeNull();
	expect(response[2]?.invitee).toBeNull();
	expect(response[1]?.invitee).not.toBeNull();
	expect(response[0]?.invitee).not.toBeNull();

	expect(response[0]?.posts.length).eq(0);
	expect(response[1]?.posts.length).eq(1);
	expect(response[2]?.posts.length).eq(2);
	expect(response[3]?.posts.length).eq(2);

	expect(response[3]).toEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 2, ownerId: 1, content: 'Post1.1', createdAt: response[3]?.posts[0]?.createdAt }, {
			id: 1,
			ownerId: 1,
			content: 'Post1',
			createdAt: response[3]?.posts[1]?.createdAt,
		}],
	});
	expect(response[2]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 4, ownerId: 2, content: 'Post2.1', createdAt: response[2]?.posts[0]?.createdAt }, {
			id: 3,
			ownerId: 2,
			content: 'Post2',
			createdAt: response[2]?.posts[1]?.createdAt,
		}],
	});
	expect(response[1]).toEqual({
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: 0, invitedBy: null },
		posts: [{
			id: 5,
			ownerId: 3,
			content: 'Post3',
			createdAt: response[3]?.posts[1]?.createdAt,
		}],
	});
	expect(response[0]).toEqual({
		id: 4,
		name: 'John',
		verified: 0,
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', verified: 0, invitedBy: null },
		posts: [],
	});
});

test('Get user with invitee and posts + where', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]).run();

	const response = db.query.usersTable.findMany({
		where: {
			id: {
				OR: [2, 3],
			},
		},
		with: {
			invitee: true,
			posts: {
				where: {
					ownerId: 2,
				},
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			posts: { id: number; ownerId: number | null; content: string; createdAt: Date }[];
			invitee: {
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			} | null;
		}[]
	>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).eq(2);

	expect(response[0]?.invitee).toBeNull();
	expect(response[1]?.invitee).not.toBeNull();

	expect(response[0]?.posts.length).eq(1);
	expect(response[1]?.posts.length).eq(0);

	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 2, ownerId: 2, content: 'Post2', createdAt: response[0]?.posts[0]?.createdAt }],
	});
	expect(response).toContainEqual({
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: 0, invitedBy: null },
		posts: [],
	});
});

test('Get user with invitee and posts + limit posts and users + where', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]).run();

	const response = db.query.usersTable.findMany({
		where: {
			id: {
				OR: [3, 4],
			},
		},
		limit: 1,
		with: {
			invitee: true,
			posts: {
				where: {
					ownerId: 3,
				},
				limit: 1,
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			posts: { id: number; ownerId: number | null; content: string; createdAt: Date }[];
			invitee: {
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			} | null;
		}[]
	>();

	expect(response.length).eq(1);

	expect(response[0]?.invitee).not.toBeNull();
	expect(response[0]?.posts.length).eq(1);

	expect(response).toContainEqual({
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: 0, invitedBy: null },
		posts: [{ id: 5, ownerId: 3, content: 'Post3', createdAt: response[0]?.posts[0]?.createdAt }],
	});
});

test('Get user with invitee and posts + orderBy + where + custom', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
	]).run();

	const response = db.query.usersTable.findMany({
		orderBy: {
			id: 'desc',
		},
		where: {
			id: {
				OR: [3, 4],
			},
		},
		extras: ({
			lower: (usersTable) => sql<string>`lower(${usersTable.name})`.as('lower_name'),
		}),
		with: {
			invitee: true,
			posts: {
				where: {
					ownerId: 3,
				},
				orderBy: {
					id: 'desc',
				},
				extras: ({
					lower: (postsTable) => sql<string>`lower(${postsTable.content})`.as('lower_name'),
				}),
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			lower: string;
			posts: { id: number; lower: string; ownerId: number | null; content: string; createdAt: Date }[];
			invitee: {
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			} | null;
		}[]
	>();

	expect(response.length).eq(2);

	expect(response[1]?.invitee).not.toBeNull();
	expect(response[0]?.invitee).not.toBeNull();

	expect(response[0]?.posts.length).eq(0);
	expect(response[1]?.posts.length).eq(1);

	expect(response[1]).toEqual({
		id: 3,
		name: 'Alex',
		lower: 'alex',
		verified: 0,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: 0, invitedBy: null },
		posts: [{
			id: 5,
			ownerId: 3,
			content: 'Post3',
			lower: 'post3',
			createdAt: response[1]?.posts[0]?.createdAt,
		}],
	});
	expect(response[0]).toEqual({
		id: 4,
		name: 'John',
		lower: 'john',
		verified: 0,
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', verified: 0, invitedBy: null },
		posts: [],
	});
});

test('Get user with invitee and posts + orderBy + where + partial + custom', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]).run();

	db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
	]).run();

	const response = db.query.usersTable.findMany({
		orderBy: {
			id: 'desc',
		},
		where: {
			id: {
				OR: [3, 4],
			},
		},
		extras: ({
			lower: (usersTable) => sql<string>`lower(${usersTable.name})`.as('lower_name'),
		}),
		columns: {
			id: true,
			name: true,
		},
		with: {
			invitee: {
				columns: {
					id: true,
					name: true,
				},
				extras: ({
					lower: (usersTable) => sql<string>`lower(${usersTable.name})`.as('lower_name'),
				}),
			},
			posts: {
				columns: {
					id: true,
					content: true,
				},
				where: {
					ownerId: 3,
				},
				orderBy: {
					id: 'desc',
				},
				extras: ({
					lower: (postsTable) => sql<string>`lower(${postsTable.content})`.as('lower_name'),
				}),
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			lower: string;
			posts: { id: number; lower: string; content: string }[];
			invitee: {
				id: number;
				name: string;
				lower: string;
			} | null;
		}[]
	>();

	expect(response.length).eq(2);

	expect(response[1]?.invitee).not.toBeNull();
	expect(response[0]?.invitee).not.toBeNull();

	expect(response[0]?.posts.length).eq(0);
	expect(response[1]?.posts.length).eq(1);

	expect(response[1]).toEqual({
		id: 3,
		name: 'Alex',
		lower: 'alex',
		invitee: { id: 1, name: 'Dan', lower: 'dan' },
		posts: [{
			id: 5,
			content: 'Post3',
			lower: 'post3',
		}],
	});
	expect(response[0]).toEqual({
		id: 4,
		name: 'John',
		lower: 'john',
		invitee: { id: 2, name: 'Andrew', lower: 'andrew' },
		posts: [],
	});
});

test('Get user with posts and posts with comments', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ id: 1, ownerId: 1, content: 'Post1' },
		{ id: 2, ownerId: 2, content: 'Post2' },
		{ id: 3, ownerId: 3, content: 'Post3' },
	]).run();

	db.insert(commentsTable).values([
		{ postId: 1, content: 'Comment1', creator: 2 },
		{ postId: 2, content: 'Comment2', creator: 2 },
		{ postId: 3, content: 'Comment3', creator: 3 },
	]).run();

	const response = db.query.usersTable.findMany({
		with: {
			posts: {
				with: {
					comments: true,
				},
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			posts: {
				id: number;
				content: string;
				ownerId: number | null;
				createdAt: Date;
				comments: {
					id: number;
					content: string;
					createdAt: Date;
					creator: number | null;
					postId: number | null;
				}[];
			}[];
		}[]
	>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).eq(3);
	expect(response[0]?.posts.length).eq(1);
	expect(response[1]?.posts.length).eq(1);
	expect(response[2]?.posts.length).eq(1);

	expect(response[0]?.posts[0]?.comments.length).eq(1);
	expect(response[1]?.posts[0]?.comments.length).eq(1);
	expect(response[2]?.posts[0]?.comments.length).eq(1);

	expect(response[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		posts: [{
			id: 1,
			ownerId: 1,
			content: 'Post1',
			createdAt: response[0]?.posts[0]?.createdAt,
			comments: [
				{
					id: 1,
					content: 'Comment1',
					creator: 2,
					postId: 1,
					createdAt: response[0]?.posts[0]?.comments[0]?.createdAt,
				},
			],
		}],
	});
	expect(response[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		posts: [{
			id: 2,
			ownerId: 2,
			content: 'Post2',
			createdAt: response[1]?.posts[0]?.createdAt,
			comments: [
				{
					id: 2,
					content: 'Comment2',
					creator: 2,
					postId: 2,
					createdAt: response[1]?.posts[0]?.comments[0]?.createdAt,
				},
			],
		}],
	});
	// expect(response[2]).toEqual({
	// 	id: 3,
	// 	name: 'Alex',
	// 	verified: 0,
	// 	invitedBy: null,
	// 	posts: [{
	// 		id: 3,
	// 		ownerId: 3,
	// 		content: 'Post3',
	// 		createdAt: response[2]?.posts[0]?.createdAt,
	// 		comments: [
	// 			{
	// 				id: ,
	// 				content: 'Comment3',
	// 				creator: 3,
	// 				postId: 3,
	// 				createdAt: response[2]?.posts[0]?.comments[0]?.createdAt,
	// 			},
	// 		],
	// 	}],
	// });
});

test('Get user with posts and posts with comments and comments with owner', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ id: 1, ownerId: 1, content: 'Post1' },
		{ id: 2, ownerId: 2, content: 'Post2' },
		{ id: 3, ownerId: 3, content: 'Post3' },
	]).run();

	db.insert(commentsTable).values([
		{ postId: 1, content: 'Comment1', creator: 2 },
		{ postId: 2, content: 'Comment2', creator: 2 },
		{ postId: 3, content: 'Comment3', creator: 3 },
	]).run();

	const response = db.query.usersTable.findMany({
		with: {
			posts: {
				with: {
					comments: {
						with: {
							author: true,
						},
					},
				},
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
			comments: {
				id: number;
				content: string;
				createdAt: Date;
				creator: number | null;
				postId: number | null;
				author: {
					id: number;
					name: string;
					verified: number;
					invitedBy: number | null;
				};
			}[];
		}[];
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).eq(3);
	expect(response[0]?.posts.length).eq(1);
	expect(response[1]?.posts.length).eq(1);
	expect(response[2]?.posts.length).eq(1);

	expect(response[0]?.posts[0]?.comments.length).eq(1);
	expect(response[1]?.posts[0]?.comments.length).eq(1);
	expect(response[2]?.posts[0]?.comments.length).eq(1);

	expect(response[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		posts: [{
			id: 1,
			ownerId: 1,
			content: 'Post1',
			createdAt: response[0]?.posts[0]?.createdAt,
			comments: [
				{
					id: 1,
					content: 'Comment1',
					creator: 2,
					author: {
						id: 2,
						name: 'Andrew',
						verified: 0,
						invitedBy: null,
					},
					postId: 1,
					createdAt: response[0]?.posts[0]?.comments[0]?.createdAt,
				},
			],
		}],
	});
	expect(response[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		posts: [{
			id: 2,
			ownerId: 2,
			content: 'Post2',
			createdAt: response[1]?.posts[0]?.createdAt,
			comments: [
				{
					id: 2,
					content: 'Comment2',
					creator: 2,
					author: {
						id: 2,
						name: 'Andrew',
						verified: 0,
						invitedBy: null,
					},
					postId: 2,
					createdAt: response[1]?.posts[0]?.comments[0]?.createdAt,
				},
			],
		}],
	});
});

test('Get user with posts and posts with comments and comments with owner where exists', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(postsTable).values([
		{ id: 1, ownerId: 1, content: 'Post1' },
		{ id: 2, ownerId: 2, content: 'Post2' },
		{ id: 3, ownerId: 3, content: 'Post3' },
	]).run();

	db.insert(commentsTable).values([
		{ postId: 1, content: 'Comment1', creator: 2 },
		{ postId: 2, content: 'Comment2', creator: 2 },
		{ postId: 3, content: 'Comment3', creator: 3 },
	]).run();

	const response = db.query.usersTable.findMany({
		with: {
			posts: {
				with: {
					comments: {
						with: {
							author: true,
						},
					},
				},
			},
		},
		where: {
			RAW: ({ id }, { exists }) => exists(db.select({ one: sql`1` }).from(alias(usersTable, 'alias')).where(eq(id, 1))),
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
			comments: {
				id: number;
				content: string;
				createdAt: Date;
				creator: number | null;
				postId: number | null;
				author: {
					id: number;
					name: string;
					verified: number;
					invitedBy: number | null;
				};
			}[];
		}[];
	}[]>();

	expect(response.length).eq(1);
	expect(response[0]?.posts.length).eq(1);

	expect(response[0]?.posts[0]?.comments.length).eq(1);

	expect(response[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		posts: [{
			id: 1,
			ownerId: 1,
			content: 'Post1',
			createdAt: response[0]?.posts[0]?.createdAt,
			comments: [
				{
					id: 1,
					content: 'Comment1',
					creator: 2,
					author: {
						id: 2,
						name: 'Andrew',
						verified: 0,
						invitedBy: null,
					},
					postId: 1,
					createdAt: response[0]?.posts[0]?.comments[0]?.createdAt,
				},
			],
		}],
	});
});

test('[Find Many] Get users with groups', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]).run();

	db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]).run();

	const response = db.query.usersTable.findMany({
		with: {
			usersToGroups: {
				columns: {},
				with: {
					group: true,
				},
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		usersToGroups: {
			group: {
				id: number;
				name: string;
				description: string | null;
			};
		}[];
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).toEqual(3);

	expect(response[0]?.usersToGroups.length).toEqual(1);
	expect(response[1]?.usersToGroups.length).toEqual(1);
	expect(response[2]?.usersToGroups.length).toEqual(2);

	expect(response).toContainEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 1,
				name: 'Group1',
				description: null,
			},
		}],
	});

	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 2,
				name: 'Group2',
				description: null,
			},
		}],
	});

	expect(response).toContainEqual({
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: null,
		usersToGroups: expect.arrayContaining([{
			group: {
				id: 2,
				name: 'Group2',
				description: null,
			},
		}, {
			group: {
				id: 3,
				name: 'Group3',
				description: null,
			},
		}]),
	});
});

test('[Find Many] Get groups with users', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]).run();

	db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]).run();

	const response = db.query.groupsTable.findMany({
		with: {
			usersToGroups: {
				columns: {},
				with: {
					user: true,
				},
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		description: string | null;
		usersToGroups: {
			user: {
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			};
		}[];
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).toEqual(3);

	expect(response[0]?.usersToGroups.length).toEqual(1);
	expect(response[1]?.usersToGroups.length).toEqual(2);
	expect(response[2]?.usersToGroups.length).toEqual(1);

	expect(response).toContainEqual({
		id: 1,
		name: 'Group1',
		description: null,
		usersToGroups: [{
			user: {
				id: 1,
				name: 'Dan',
				verified: 0,
				invitedBy: null,
			},
		}],
	});

	expect(response).toContainEqual({
		id: 2,
		name: 'Group2',
		description: null,
		usersToGroups: [{
			user: {
				id: 2,
				name: 'Andrew',
				verified: 0,
				invitedBy: null,
			},
		}, {
			user: {
				id: 3,
				name: 'Alex',
				verified: 0,
				invitedBy: null,
			},
		}],
	});

	expect(response).toContainEqual({
		id: 3,
		name: 'Group3',
		description: null,
		usersToGroups: [{
			user: {
				id: 3,
				name: 'Alex',
				verified: 0,
				invitedBy: null,
			},
		}],
	});
});

test('[Find Many] Get users with groups + limit', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]).run();

	db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 2, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]).run();

	const response = db.query.usersTable.findMany({
		limit: 2,
		with: {
			usersToGroups: {
				limit: 1,
				columns: {},
				with: {
					group: true,
				},
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		usersToGroups: {
			group: {
				id: number;
				name: string;
				description: string | null;
			};
		}[];
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).toEqual(2);

	expect(response[0]?.usersToGroups.length).toEqual(1);
	expect(response[1]?.usersToGroups.length).toEqual(1);

	expect(response).toContainEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 1,
				name: 'Group1',
				description: null,
			},
		}],
	});

	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 2,
				name: 'Group2',
				description: null,
			},
		}],
	});
});

test('[Find Many] Get groups with users + limit', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]).run();

	db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]).run();

	const response = db.query.groupsTable.findMany({
		limit: 2,
		with: {
			usersToGroups: {
				limit: 1,
				columns: {},
				with: {
					user: true,
				},
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		description: string | null;
		usersToGroups: {
			user: {
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			};
		}[];
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).toEqual(2);

	expect(response[0]?.usersToGroups.length).toEqual(1);
	expect(response[1]?.usersToGroups.length).toEqual(1);

	expect(response).toContainEqual({
		id: 1,
		name: 'Group1',
		description: null,
		usersToGroups: [{
			user: {
				id: 1,
				name: 'Dan',
				verified: 0,
				invitedBy: null,
			},
		}],
	});

	expect(response).toContainEqual({
		id: 2,
		name: 'Group2',
		description: null,
		usersToGroups: [{
			user: {
				id: 2,
				name: 'Andrew',
				verified: 0,
				invitedBy: null,
			},
		}],
	});
});

test('[Find Many] Get users with groups + limit + where', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]).run();

	db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 2, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]).run();

	const response = db.query.usersTable.findMany({
		limit: 1,
		where: {
			id: {
				OR: [1, 2],
			},
		},
		with: {
			usersToGroups: {
				where: {
					groupId: 1,
				},
				columns: {},
				with: {
					group: true,
				},
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		usersToGroups: {
			group: {
				id: number;
				name: string;
				description: string | null;
			};
		}[];
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).toEqual(1);

	expect(response[0]?.usersToGroups.length).toEqual(1);

	expect(response).toContainEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 1,
				name: 'Group1',
				description: null,
			},
		}],
	});
});

test('[Find Many] Get groups with users + limit + where', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]).run();

	db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]).run();

	const response = db.query.groupsTable.findMany({
		limit: 1,
		where: {
			id: {
				gt: 1,
			},
		},
		with: {
			usersToGroups: {
				where: {
					userId: 2,
				},
				limit: 1,
				columns: {},
				with: {
					user: true,
				},
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		description: string | null;
		usersToGroups: {
			user: {
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			};
		}[];
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).toEqual(1);

	expect(response[0]?.usersToGroups.length).toEqual(1);

	expect(response).toContainEqual({
		id: 2,
		name: 'Group2',
		description: null,
		usersToGroups: [{
			user: {
				id: 2,
				name: 'Andrew',
				verified: 0,
				invitedBy: null,
			},
		}],
	});
});

test('[Find Many] Get users with groups + where', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]).run();

	db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 2, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]).run();

	const response = db.query.usersTable.findMany({
		where: {
			id: {
				OR: [1, 2],
			},
		},
		with: {
			usersToGroups: {
				where: {
					groupId: 2,
				},
				columns: {},
				with: {
					group: true,
				},
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		usersToGroups: {
			group: {
				id: number;
				name: string;
				description: string | null;
			};
		}[];
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).toEqual(2);

	expect(response[0]?.usersToGroups.length).toEqual(0);
	expect(response[1]?.usersToGroups.length).toEqual(1);

	expect(response).toContainEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		usersToGroups: [],
	});

	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 2,
				name: 'Group2',
				description: null,
			},
		}],
	});
});

test('[Find Many] Get groups with users + where', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]).run();

	db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]).run();

	const response = db.query.groupsTable.findMany({
		where: {
			id: {
				gt: 1,
			},
		},
		with: {
			usersToGroups: {
				where: {
					userId: 2,
				},
				columns: {},
				with: {
					user: true,
				},
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		description: string | null;
		usersToGroups: {
			user: {
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			};
		}[];
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).toEqual(2);

	expect(response[0]?.usersToGroups.length).toEqual(1);
	expect(response[1]?.usersToGroups.length).toEqual(0);

	expect(response).toContainEqual({
		id: 2,
		name: 'Group2',
		description: null,
		usersToGroups: [{
			user: {
				id: 2,
				name: 'Andrew',
				verified: 0,
				invitedBy: null,
			},
		}],
	});

	expect(response).toContainEqual({
		id: 3,
		name: 'Group3',
		description: null,
		usersToGroups: [],
	});
});

test('[Find Many] Get users with groups + orderBy', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]).run();

	db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]).run();

	const response = db.query.usersTable.findMany({
		orderBy: {
			id: 'desc',
		},
		with: {
			usersToGroups: {
				orderBy: {
					groupId: 'desc',
				},
				columns: {},
				with: {
					group: true,
				},
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		usersToGroups: {
			group: {
				id: number;
				name: string;
				description: string | null;
			};
		}[];
	}[]>();

	expect(response.length).toEqual(3);

	expect(response[0]?.usersToGroups.length).toEqual(2);
	expect(response[1]?.usersToGroups.length).toEqual(1);
	expect(response[2]?.usersToGroups.length).toEqual(1);

	expect(response[2]).toEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 1,
				name: 'Group1',
				description: null,
			},
		}],
	});

	expect(response[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 2,
				name: 'Group2',
				description: null,
			},
		}],
	});

	expect(response[0]).toEqual({
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 3,
				name: 'Group3',
				description: null,
			},
		}, {
			group: {
				id: 2,
				name: 'Group2',
				description: null,
			},
		}],
	});
});

test('[Find Many] Get groups with users + orderBy', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]).run();

	db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]).run();

	const response = db.query.groupsTable.findMany({
		orderBy: {
			id: 'desc',
		},
		with: {
			usersToGroups: {
				orderBy: {
					userId: 'desc',
				},
				columns: {},
				with: {
					user: true,
				},
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		description: string | null;
		usersToGroups: {
			user: {
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			};
		}[];
	}[]>();

	expect(response.length).toEqual(3);

	expect(response[0]?.usersToGroups.length).toEqual(1);
	expect(response[1]?.usersToGroups.length).toEqual(2);
	expect(response[2]?.usersToGroups.length).toEqual(1);

	expect(response[2]).toEqual({
		id: 1,
		name: 'Group1',
		description: null,
		usersToGroups: [{
			user: {
				id: 1,
				name: 'Dan',
				verified: 0,
				invitedBy: null,
			},
		}],
	});

	expect(response[1]).toEqual({
		id: 2,
		name: 'Group2',
		description: null,
		usersToGroups: [{
			user: {
				id: 3,
				name: 'Alex',
				verified: 0,
				invitedBy: null,
			},
		}, {
			user: {
				id: 2,
				name: 'Andrew',
				verified: 0,
				invitedBy: null,
			},
		}],
	});

	expect(response[0]).toEqual({
		id: 3,
		name: 'Group3',
		description: null,
		usersToGroups: [{
			user: {
				id: 3,
				name: 'Alex',
				verified: 0,
				invitedBy: null,
			},
		}],
	});
});

test('[Find Many] Get users with groups + orderBy + limit', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]).run();

	db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]).run();

	const response = db.query.usersTable.findMany({
		orderBy: {
			id: 'desc',
		},
		limit: 2,
		with: {
			usersToGroups: {
				limit: 1,
				orderBy: {
					groupId: 'desc',
				},
				columns: {},
				with: {
					group: true,
				},
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		usersToGroups: {
			group: {
				id: number;
				name: string;
				description: string | null;
			};
		}[];
	}[]>();

	expect(response.length).toEqual(2);

	expect(response[0]?.usersToGroups.length).toEqual(1);
	expect(response[1]?.usersToGroups.length).toEqual(1);

	expect(response[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 2,
				name: 'Group2',
				description: null,
			},
		}],
	});

	expect(response[0]).toEqual({
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 3,
				name: 'Group3',
				description: null,
			},
		}],
	});
});

test('[Find One] Get users with groups', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]).run();

	db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]).run();

	const response = db.query.usersTable.findFirst({
		with: {
			usersToGroups: {
				columns: {},
				with: {
					group: true,
				},
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			usersToGroups: {
				group: {
					id: number;
					name: string;
					description: string | null;
				};
			}[];
		} | undefined
	>();

	expect(response?.usersToGroups.length).toEqual(1);

	expect(response).toEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 1,
				name: 'Group1',
				description: null,
			},
		}],
	});
});

test('[Find One] Get groups with users', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]).run();

	db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]).run();

	const response = db.query.groupsTable.findFirst({
		with: {
			usersToGroups: {
				columns: {},
				with: {
					user: true,
				},
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			description: string | null;
			usersToGroups: {
				user: {
					id: number;
					name: string;
					verified: number;
					invitedBy: number | null;
				};
			}[];
		} | undefined
	>();

	expect(response?.usersToGroups.length).toEqual(1);

	expect(response).toEqual({
		id: 1,
		name: 'Group1',
		description: null,
		usersToGroups: [{
			user: {
				id: 1,
				name: 'Dan',
				verified: 0,
				invitedBy: null,
			},
		}],
	});
});

test('[Find One] Get users with groups + limit', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]).run();

	db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 2, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]).run();

	const response = db.query.usersTable.findFirst({
		with: {
			usersToGroups: {
				limit: 1,
				columns: {},
				with: {
					group: true,
				},
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			usersToGroups: {
				group: {
					id: number;
					name: string;
					description: string | null;
				};
			}[];
		} | undefined
	>();

	expect(response?.usersToGroups.length).toEqual(1);

	expect(response).toEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 1,
				name: 'Group1',
				description: null,
			},
		}],
	});
});

test('[Find One] Get groups with users + limit', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]).run();

	db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]).run();

	const response = db.query.groupsTable.findFirst({
		with: {
			usersToGroups: {
				limit: 1,
				columns: {},
				with: {
					user: true,
				},
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			description: string | null;
			usersToGroups: {
				user: {
					id: number;
					name: string;
					verified: number;
					invitedBy: number | null;
				};
			}[];
		} | undefined
	>();

	expect(response?.usersToGroups.length).toEqual(1);

	expect(response).toEqual({
		id: 1,
		name: 'Group1',
		description: null,
		usersToGroups: [{
			user: {
				id: 1,
				name: 'Dan',
				verified: 0,
				invitedBy: null,
			},
		}],
	});
});

test('[Find One] Get users with groups + limit + where', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]).run();

	db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 2, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]).run();

	const response = db.query.usersTable.findFirst({
		where: {
			id: {
				OR: [1, 2],
			},
		},
		with: {
			usersToGroups: {
				where: {
					groupId: 1,
				},
				columns: {},
				with: {
					group: true,
				},
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			usersToGroups: {
				group: {
					id: number;
					name: string;
					description: string | null;
				};
			}[];
		} | undefined
	>();

	expect(response?.usersToGroups.length).toEqual(1);

	expect(response).toEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 1,
				name: 'Group1',
				description: null,
			},
		}],
	});
});

test('[Find One] Get groups with users + limit + where', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]).run();

	db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]).run();

	const response = db.query.groupsTable.findFirst({
		where: {
			id: {
				gt: 1,
			},
		},
		with: {
			usersToGroups: {
				where: {
					userId: 2,
				},
				limit: 1,
				columns: {},
				with: {
					user: true,
				},
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			description: string | null;
			usersToGroups: {
				user: {
					id: number;
					name: string;
					verified: number;
					invitedBy: number | null;
				};
			}[];
		} | undefined
	>();

	expect(response?.usersToGroups.length).toEqual(1);

	expect(response).toEqual({
		id: 2,
		name: 'Group2',
		description: null,
		usersToGroups: [{
			user: {
				id: 2,
				name: 'Andrew',
				verified: 0,
				invitedBy: null,
			},
		}],
	});
});

test('[Find One] Get users with groups + where', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]).run();

	db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 2, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]).run();

	const response = db.query.usersTable.findFirst({
		where: {
			id: {
				OR: [1, 2],
			},
		},
		with: {
			usersToGroups: {
				where: {
					groupId: 2,
				},
				columns: {},
				with: {
					group: true,
				},
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			usersToGroups: {
				group: {
					id: number;
					name: string;
					description: string | null;
				};
			}[];
		} | undefined
	>();

	expect(response?.usersToGroups.length).toEqual(0);

	expect(response).toEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		usersToGroups: [],
	});
});

test('[Find One] Get groups with users + where', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]).run();

	db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]).run();

	const response = db.query.groupsTable.findFirst({
		where: {
			id: {
				gt: 1,
			},
		},
		with: {
			usersToGroups: {
				where: {
					userId: 2,
				},
				columns: {},
				with: {
					user: true,
				},
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			description: string | null;
			usersToGroups: {
				user: {
					id: number;
					name: string;
					verified: number;
					invitedBy: number | null;
				};
			}[];
		} | undefined
	>();

	expect(response?.usersToGroups.length).toEqual(1);

	expect(response).toEqual({
		id: 2,
		name: 'Group2',
		description: null,
		usersToGroups: [{
			user: {
				id: 2,
				name: 'Andrew',
				verified: 0,
				invitedBy: null,
			},
		}],
	});
});

test('[Find One] Get users with groups + orderBy', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]).run();

	db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]).run();

	const response = db.query.usersTable.findFirst({
		orderBy: {
			id: 'desc',
		},
		with: {
			usersToGroups: {
				orderBy: {
					groupId: 'desc',
				},
				columns: {},
				with: {
					group: true,
				},
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			usersToGroups: {
				group: {
					id: number;
					name: string;
					description: string | null;
				};
			}[];
		} | undefined
	>();

	expect(response?.usersToGroups.length).toEqual(2);

	expect(response).toEqual({
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 3,
				name: 'Group3',
				description: null,
			},
		}, {
			group: {
				id: 2,
				name: 'Group2',
				description: null,
			},
		}],
	});
});

test('[Find One] Get groups with users + orderBy', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]).run();

	db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]).run();

	const response = db.query.groupsTable.findFirst({
		orderBy: {
			id: 'desc',
		},
		with: {
			usersToGroups: {
				orderBy: {
					userId: 'desc',
				},
				columns: {},
				with: {
					user: true,
				},
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			description: string | null;
			usersToGroups: {
				user: {
					id: number;
					name: string;
					verified: number;
					invitedBy: number | null;
				};
			}[];
		} | undefined
	>();

	expect(response?.usersToGroups.length).toEqual(1);

	expect(response).toEqual({
		id: 3,
		name: 'Group3',
		description: null,
		usersToGroups: [{
			user: {
				id: 3,
				name: 'Alex',
				verified: 0,
				invitedBy: null,
			},
		}],
	});
});

test('[Find One] Get users with groups + orderBy + limit', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]).run();

	db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]).run();

	const response = db.query.usersTable.findFirst({
		orderBy: {
			id: 'desc',
		},
		with: {
			usersToGroups: {
				limit: 1,
				orderBy: {
					groupId: 'desc',
				},
				columns: {},
				with: {
					group: true,
				},
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			usersToGroups: {
				group: {
					id: number;
					name: string;
					description: string | null;
				};
			}[];
		} | undefined
	>();

	expect(response?.usersToGroups.length).toEqual(1);

	expect(response).toEqual({
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 3,
				name: 'Group3',
				description: null,
			},
		}],
	});
});

test('Get groups with users + orderBy + limit', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]).run();

	db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]).run();

	const response = db.query.groupsTable.findMany({
		orderBy: {
			id: 'desc',
		},
		limit: 2,
		with: {
			usersToGroups: {
				limit: 1,
				orderBy: {
					userId: 'desc',
				},
				columns: {},
				with: {
					user: true,
				},
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			description: string | null;
			usersToGroups: {
				user: {
					id: number;
					name: string;
					verified: number;
					invitedBy: number | null;
				};
			}[];
		}[]
	>();

	expect(response.length).toEqual(2);

	expect(response[0]?.usersToGroups.length).toEqual(1);
	expect(response[1]?.usersToGroups.length).toEqual(1);

	expect(response[1]).toEqual({
		id: 2,
		name: 'Group2',
		description: null,
		usersToGroups: [{
			user: {
				id: 3,
				name: 'Alex',
				verified: 0,
				invitedBy: null,
			},
		}],
	});

	expect(response[0]).toEqual({
		id: 3,
		name: 'Group3',
		description: null,
		usersToGroups: [{
			user: {
				id: 3,
				name: 'Alex',
				verified: 0,
				invitedBy: null,
			},
		}],
	});
});

test('Get users with groups + custom', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]).run();

	db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]).run();

	const response = db.query.usersTable.findMany({
		extras: ({
			lower: (usersTable) => sql<string>`lower(${usersTable.name})`.as('lower_name'),
		}),
		with: {
			usersToGroups: {
				columns: {},
				with: {
					group: {
						extras: ({
							lower: (groupsTable, { sql }) => sql<string>`lower(${groupsTable.name})`.as('lower_name'),
						}),
					},
				},
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			lower: string;
			usersToGroups: {
				group: {
					id: number;
					name: string;
					description: string | null;
					lower: string;
				};
			}[];
		}[]
	>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	response[0]?.usersToGroups.sort((a, b) => (a.group.id > b.group.id) ? 1 : -1);
	response[1]?.usersToGroups.sort((a, b) => (a.group.id > b.group.id) ? 1 : -1);
	response[2]?.usersToGroups.sort((a, b) => (a.group.id > b.group.id) ? 1 : -1);

	expect(response.length).toEqual(3);

	expect(response[0]?.usersToGroups.length).toEqual(1);
	expect(response[1]?.usersToGroups.length).toEqual(1);
	expect(response[2]?.usersToGroups.length).toEqual(2);

	expect(response).toContainEqual({
		id: 1,
		name: 'Dan',
		lower: 'dan',
		verified: 0,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 1,
				name: 'Group1',
				lower: 'group1',
				description: null,
			},
		}],
	});

	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		lower: 'andrew',
		verified: 0,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 2,
				name: 'Group2',
				lower: 'group2',
				description: null,
			},
		}],
	});

	expect(response).toContainEqual({
		id: 3,
		name: 'Alex',
		lower: 'alex',
		verified: 0,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 2,
				name: 'Group2',
				lower: 'group2',
				description: null,
			},
		}, {
			group: {
				id: 3,
				name: 'Group3',
				lower: 'group3',
				description: null,
			},
		}],
	});
});

test('Get groups with users + custom', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]).run();

	db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]).run();

	const response = db.query.groupsTable.findMany({
		extras: ({
			lower: (table) => sql<string>`lower(${table.name})`.as('lower_name'),
		}),
		with: {
			usersToGroups: {
				columns: {},
				with: {
					user: {
						extras: ({
							lower: (table) => sql<string>`lower(${table.name})`.as('lower_name'),
						}),
					},
				},
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			description: string | null;
			lower: string;
			usersToGroups: {
				user: {
					id: number;
					name: string;
					verified: number;
					invitedBy: number | null;
					lower: string;
				};
			}[];
		}[]
	>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response.length).toEqual(3);

	expect(response[0]?.usersToGroups.length).toEqual(1);
	expect(response[1]?.usersToGroups.length).toEqual(2);
	expect(response[2]?.usersToGroups.length).toEqual(1);

	expect(response).toContainEqual({
		id: 1,
		name: 'Group1',
		lower: 'group1',
		description: null,
		usersToGroups: [{
			user: {
				id: 1,
				name: 'Dan',
				lower: 'dan',
				verified: 0,
				invitedBy: null,
			},
		}],
	});

	expect(response).toContainEqual({
		id: 2,
		name: 'Group2',
		lower: 'group2',
		description: null,
		usersToGroups: [{
			user: {
				id: 2,
				name: 'Andrew',
				lower: 'andrew',
				verified: 0,
				invitedBy: null,
			},
		}, {
			user: {
				id: 3,
				name: 'Alex',
				lower: 'alex',
				verified: 0,
				invitedBy: null,
			},
		}],
	});

	expect(response).toContainEqual({
		id: 3,
		name: 'Group3',
		lower: 'group3',
		description: null,
		usersToGroups: [{
			user: {
				id: 3,
				name: 'Alex',
				lower: 'alex',
				verified: 0,
				invitedBy: null,
			},
		}],
	});
});

test('async api', async () => {
	await db.insert(usersTable).values([{ id: 1, name: 'Dan' }]);
	const users = await db.query.usersTable.findMany();
	expect(users).toEqual([{ id: 1, name: 'Dan', verified: 0, invitedBy: null }]);
});

test('async api - sync()', () => {
	db.insert(usersTable).values([{ id: 1, name: 'Dan' }]).run();
	const users = db.query.usersTable.findMany().sync();
	expect(users).toEqual([{ id: 1, name: 'Dan', verified: 0, invitedBy: null }]);
});

test('async api - prepare', async () => {
	const insertStmt = db.insert(usersTable).values([{ id: 1, name: 'Dan' }]).prepare();
	await insertStmt.execute();
	const queryStmt = db.query.usersTable.findMany().prepare();
	const users = await queryStmt.execute();
	expect(users).toEqual([{ id: 1, name: 'Dan', verified: 0, invitedBy: null }]);
});

test('async api - sync() + prepare', () => {
	const insertStmt = db.insert(usersTable).values([{ id: 1, name: 'Dan' }]).prepare();
	insertStmt.execute().sync();
	const queryStmt = db.query.usersTable.findMany().prepare();
	const users = queryStmt.execute().sync();
	expect(users).toEqual([{ id: 1, name: 'Dan', verified: 0, invitedBy: null }]);
});

test('Force optional on where on non-optional relation query', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	const usersWithInvitee = await db.query.usersTable.findMany({
		with: {
			inviteeRequired: {
				where: {
					id: 1,
				},
			},
		},
	});

	expectTypeOf(usersWithInvitee).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			inviteeRequired: {
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			} | null;
		}[]
	>();

	usersWithInvitee.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(usersWithInvitee.length).eq(4);
	expect(usersWithInvitee[0]?.inviteeRequired).toBeNull();
	expect(usersWithInvitee[1]?.inviteeRequired).toBeNull();
	expect(usersWithInvitee[2]?.inviteeRequired).not.toBeNull();
	expect(usersWithInvitee[3]?.inviteeRequired).toBeNull();

	expect(usersWithInvitee[0]).toEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		inviteeRequired: null,
	});
	expect(usersWithInvitee[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		inviteeRequired: null,
	});
	expect(usersWithInvitee[2]).toEqual({
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: 1,
		inviteeRequired: { id: 1, name: 'Dan', verified: 0, invitedBy: null },
	});
	expect(usersWithInvitee[3]).toEqual({
		id: 4,
		name: 'John',
		verified: 0,
		invitedBy: 2,
		inviteeRequired: null,
	});
});

test('[Find Many .through] Get users with groups', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findMany({
		with: {
			groups: true,
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		groups: {
			id: number;
			name: string;
			description: string | null;
		}[];
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);
	for (const e of response) {
		e.groups.sort((a, b) => (a.id > b.id) ? 1 : -1);
	}

	expect(response).toStrictEqual([{
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		groups: [{
			id: 1,
			name: 'Group1',
			description: null,
		}],
	}, {
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		groups: [{
			id: 2,
			name: 'Group2',
			description: null,
		}],
	}, {
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: null,
		groups: [
			{
				id: 2,
				name: 'Group2',
				description: null,
			},
			{
				id: 3,
				name: 'Group3',
				description: null,
			},
		],
	}]);
});

test('[Find Many .through] Get groups with users', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findMany({
		with: {
			users: true,
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		description: string | null;
		users: {
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
		}[];
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);
	for (const e of response) {
		e.users.sort((a, b) => (a.id > b.id) ? 1 : -1);
	}

	expect(response).toStrictEqual([{
		id: 1,
		name: 'Group1',
		description: null,
		users: [{
			id: 1,
			name: 'Dan',
			verified: 0,
			invitedBy: null,
		}],
	}, {
		id: 2,
		name: 'Group2',
		description: null,
		users: [{
			id: 2,
			name: 'Andrew',
			verified: 0,
			invitedBy: null,
		}, {
			id: 3,
			name: 'Alex',
			verified: 0,
			invitedBy: null,
		}],
	}, {
		id: 3,
		name: 'Group3',
		description: null,
		users: [{
			id: 3,
			name: 'Alex',
			verified: 0,
			invitedBy: null,
		}],
	}]);
});

test('[Find Many .through] Get users with groups + limit', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 2, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findMany({
		limit: 2,
		with: {
			groups: {
				limit: 1,
				orderBy: {
					id: 'asc',
				},
			},
		},
		orderBy: {
			id: 'asc',
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		groups: {
			id: number;
			name: string;
			description: string | null;
		}[];
	}[]>();

	expect(response).toStrictEqual([{
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		groups: [{
			id: 1,
			name: 'Group1',
			description: null,
		}],
	}, {
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		groups: [{
			id: 2,
			name: 'Group2',
			description: null,
		}],
	}]);
});

test('[Find Many .through] Get groups with users + limit', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findMany({
		limit: 2,
		with: {
			users: {
				limit: 1,
				orderBy: {
					id: 'asc',
				},
			},
		},
		orderBy: {
			id: 'asc',
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		description: string | null;
		users: {
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
		}[];
	}[]>();

	expect(response).toStrictEqual([{
		id: 1,
		name: 'Group1',
		description: null,
		users: [{
			id: 1,
			name: 'Dan',
			verified: 0,
			invitedBy: null,
		}],
	}, {
		id: 2,
		name: 'Group2',
		description: null,
		users: [{
			id: 2,
			name: 'Andrew',
			verified: 0,
			invitedBy: null,
		}],
	}]);
});

test('[Find Many .through] Get users with groups + limit + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 2, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findMany({
		limit: 1,
		where: {
			id: {
				OR: [1, 2],
			},
		},
		with: {
			groups: {
				where: {
					id: 1,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		groups: {
			id: number;
			name: string;
			description: string | null;
		}[];
	}[]>();

	expect(response).toStrictEqual([{
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		groups: [{
			id: 1,
			name: 'Group1',
			description: null,
		}],
	}]);
});

test('[Find Many .through] Get groups with users + limit + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findMany({
		limit: 1,
		where: {
			id: { gt: 1 },
		},
		with: {
			users: {
				where: {
					id: 2,
				},
				limit: 1,
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		description: string | null;
		users: {
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
		}[];
	}[]>();

	expect(response).toStrictEqual([{
		id: 2,
		name: 'Group2',
		description: null,
		users: [{
			id: 2,
			name: 'Andrew',
			verified: 0,
			invitedBy: null,
		}],
	}]);
});

test('[Find Many .through] Get users with groups + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 2, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findMany({
		where: {
			id: {
				OR: [1, 2],
			},
		},
		with: {
			groups: {
				where: {
					id: 2,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		groups: {
			id: number;
			name: string;
			description: string | null;
		}[];
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response).toStrictEqual([{
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		groups: [],
	}, {
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		groups: [{
			id: 2,
			name: 'Group2',
			description: null,
		}],
	}]);
});

test('[Find Many .through] Get groups with users + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findMany({
		where: {
			id: { gt: 1 },
		},
		with: {
			users: {
				where: {
					id: 2,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		description: string | null;
		users: {
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
		}[];
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response).toStrictEqual([{
		id: 2,
		name: 'Group2',
		description: null,
		users: [{
			id: 2,
			name: 'Andrew',
			verified: 0,
			invitedBy: null,
		}],
	}, {
		id: 3,
		name: 'Group3',
		description: null,
		users: [],
	}]);
});

test('[Find Many .through] Get users with groups + orderBy', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findMany({
		orderBy: {
			id: 'desc',
		},
		with: {
			groups: {
				orderBy: {
					id: 'desc',
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		groups: {
			id: number;
			name: string;
			description: string | null;
		}[];
	}[]>();

	expect(response).toStrictEqual([{
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: null,
		groups: [{
			id: 3,
			name: 'Group3',
			description: null,
		}, {
			id: 2,
			name: 'Group2',
			description: null,
		}],
	}, {
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		groups: [{
			id: 2,
			name: 'Group2',
			description: null,
		}],
	}, {
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		groups: [{
			id: 1,
			name: 'Group1',
			description: null,
		}],
	}]);
});

test('[Find Many .through] Get groups with users + orderBy', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findMany({
		orderBy: {
			id: 'desc',
		},
		with: {
			users: {
				orderBy: {
					id: 'desc',
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		description: string | null;
		users: {
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
		}[];
	}[]>();

	expect(response).toStrictEqual([{
		id: 3,
		name: 'Group3',
		description: null,
		users: [{
			id: 3,
			name: 'Alex',
			verified: 0,
			invitedBy: null,
		}],
	}, {
		id: 2,
		name: 'Group2',
		description: null,
		users: [{
			id: 3,
			name: 'Alex',
			verified: 0,
			invitedBy: null,
		}, {
			id: 2,
			name: 'Andrew',
			verified: 0,
			invitedBy: null,
		}],
	}, {
		id: 1,
		name: 'Group1',
		description: null,
		users: [{
			id: 1,
			name: 'Dan',
			verified: 0,
			invitedBy: null,
		}],
	}]);
});

test('[Find Many .through] Get users with groups + orderBy + limit', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findMany({
		orderBy: {
			id: 'desc',
		},
		limit: 2,
		with: {
			groups: {
				limit: 1,
				orderBy: {
					id: 'desc',
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		groups: {
			id: number;
			name: string;
			description: string | null;
		}[];
	}[]>();

	expect(response).toStrictEqual([{
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: null,
		groups: [{
			id: 3,
			name: 'Group3',
			description: null,
		}],
	}, {
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		groups: [{
			id: 2,
			name: 'Group2',
			description: null,
		}],
	}]);
});

test('[Find One .through] Get users with groups', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findFirst({
		with: {
			groups: true,
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			groups: {
				id: number;
				name: string;
				description: string | null;
			}[];
		} | undefined
	>();

	expect(response).toStrictEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		groups: [{
			id: 1,
			name: 'Group1',
			description: null,
		}],
	});
});

test('[Find One .through] Get groups with users', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findFirst({
		with: {
			users: true,
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			description: string | null;
			users: {
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			}[];
		} | undefined
	>();

	expect(response).toStrictEqual({
		id: 1,
		name: 'Group1',
		description: null,
		users: [{
			id: 1,
			name: 'Dan',
			verified: 0,
			invitedBy: null,
		}],
	});
});

test('[Find One .through] Get users with groups + limit', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 2, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findFirst({
		with: {
			groups: {
				limit: 1,
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			groups: {
				id: number;
				name: string;
				description: string | null;
			}[];
		} | undefined
	>();

	expect(response).toStrictEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		groups: [{
			id: 1,
			name: 'Group1',
			description: null,
		}],
	});
});

test('[Find One .through] Get groups with users + limit', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findFirst({
		with: {
			users: {
				limit: 1,
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			description: string | null;
			users: {
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			}[];
		} | undefined
	>();

	expect(response).toEqual({
		id: 1,
		name: 'Group1',
		description: null,
		users: [{
			id: 1,
			name: 'Dan',
			verified: 0,
			invitedBy: null,
		}],
	});
});

test('[Find One .through] Get users with groups + limit + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 2, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findFirst({
		where: {
			id: {
				OR: [1, 2],
			},
		},
		with: {
			groups: {
				where: {
					id: 1,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			groups: {
				id: number;
				name: string;
				description: string | null;
			}[];
		} | undefined
	>();

	expect(response).toEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		groups: [{
			id: 1,
			name: 'Group1',
			description: null,
		}],
	});
});

test('[Find One .through] Get groups with users + limit + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findFirst({
		where: {
			id: { gt: 1 },
		},
		with: {
			users: {
				where: {
					id: 2,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			description: string | null;
			users: {
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			}[];
		} | undefined
	>();

	expect(response).toStrictEqual({
		id: 2,
		name: 'Group2',
		description: null,
		users: [{
			id: 2,
			name: 'Andrew',
			verified: 0,
			invitedBy: null,
		}],
	});
});

test('[Find One .through] Get users with groups + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 2, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findFirst({
		where: {
			id: {
				OR: [1, 2],
			},
		},
		with: {
			groups: {
				where: {
					id: 2,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			groups: {
				id: number;
				name: string;
				description: string | null;
			}[];
		} | undefined
	>();

	expect(response).toEqual({
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		groups: [],
	});
});

test('[Find One .through] Get groups with users + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findFirst({
		where: {
			id: { gt: 1 },
		},
		with: {
			users: {
				where: {
					id: 2,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			description: string | null;
			users: {
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			}[];
		} | undefined
	>();

	expect(response).toEqual({
		id: 2,
		name: 'Group2',
		description: null,
		users: [{
			id: 2,
			name: 'Andrew',
			verified: 0,
			invitedBy: null,
		}],
	});
});

test('[Find One .through] Get users with groups + orderBy', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findFirst({
		orderBy: {
			id: 'desc',
		},
		with: {
			groups: {
				orderBy: {
					id: 'desc',
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			groups: {
				id: number;
				name: string;
				description: string | null;
			}[];
		} | undefined
	>();

	expect(response).toStrictEqual({
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: null,
		groups: [{
			id: 3,
			name: 'Group3',
			description: null,
		}, {
			id: 2,
			name: 'Group2',
			description: null,
		}],
	});
});

test('[Find One .through] Get groups with users + orderBy', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findFirst({
		orderBy: {
			id: 'desc',
		},
		with: {
			users: {
				orderBy: {
					id: 'desc',
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			description: string | null;
			users: {
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			}[];
		} | undefined
	>();

	expect(response).toEqual({
		id: 3,
		name: 'Group3',
		description: null,
		users: [{
			id: 3,
			name: 'Alex',
			verified: 0,
			invitedBy: null,
		}],
	});
});

test('[Find One .through] Get users with groups + orderBy + limit', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findFirst({
		orderBy: {
			id: 'desc',
		},
		with: {
			groups: {
				limit: 1,
				orderBy: {
					id: 'desc',
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			groups: {
				id: number;
				name: string;
				description: string | null;
			}[];
		} | undefined
	>();

	expect(response).toEqual({
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: null,
		groups: [{
			id: 3,
			name: 'Group3',
			description: null,
		}],
	});
});

test('[Find Many .through] Get groups with users + orderBy + limit', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findMany({
		orderBy: {
			id: 'desc',
		},
		limit: 2,
		with: {
			users: {
				limit: 1,
				orderBy: {
					id: 'desc',
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			description: string | null;
			users: {
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			}[];
		}[]
	>();

	expect(response).toStrictEqual([{
		id: 3,
		name: 'Group3',
		description: null,
		users: [{
			id: 3,
			name: 'Alex',
			verified: 0,
			invitedBy: null,
		}],
	}, {
		id: 2,
		name: 'Group2',
		description: null,
		users: [{
			id: 3,
			name: 'Alex',
			verified: 0,
			invitedBy: null,
		}],
	}]);
});

test('[Find Many .through] Get users with groups + custom', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findMany({
		extras: ({
			lower: ({ name }) => sql<string>`lower(${name})`.as('lower_name'),
		}),
		with: {
			groups: {
				orderBy: {
					id: 'asc',
				},
				extras: ({
					lower: ({ name }) => sql<string>`lower(${name})`.as('lower_name'),
				}),
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			lower: string;
			groups: {
				id: number;
				name: string;
				description: string | null;
				lower: string;
			}[];
		}[]
	>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);
	for (const e of response) {
		e.groups.sort((a, b) => (a.id > b.id) ? 1 : -1);
	}

	expect(response).toStrictEqual([{
		id: 1,
		name: 'Dan',
		lower: 'dan',
		verified: 0,
		invitedBy: null,
		groups: [{
			id: 1,
			name: 'Group1',
			lower: 'group1',
			description: null,
		}],
	}, {
		id: 2,
		name: 'Andrew',
		lower: 'andrew',
		verified: 0,
		invitedBy: null,
		groups: [{
			id: 2,
			name: 'Group2',
			lower: 'group2',
			description: null,
		}],
	}, {
		id: 3,
		name: 'Alex',
		lower: 'alex',
		verified: 0,
		invitedBy: null,
		groups: [
			{
				id: 2,
				name: 'Group2',
				lower: 'group2',
				description: null,
			},
			{
				id: 3,
				name: 'Group3',
				lower: 'group3',
				description: null,
			},
		],
	}]);
});

test('[Find Many .through] Get groups with users + custom', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findMany({
		extras: ({
			lower: (table, { sql }) => sql<string>`lower(${table.name})`.as('lower_name'),
		}),
		with: {
			users: {
				extras: ({
					lower: (table, { sql }) => sql<string>`lower(${table.name})`.as('lower_name'),
				}),
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			description: string | null;
			lower: string;
			users: {
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
				lower: string;
			}[];
		}[]
	>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);
	for (const e of response) {
		e.users.sort((a, b) => (a.id > b.id) ? 1 : -1);
	}

	expect(response).toStrictEqual([{
		id: 1,
		name: 'Group1',
		lower: 'group1',
		description: null,
		users: [{
			id: 1,
			name: 'Dan',
			lower: 'dan',
			verified: 0,
			invitedBy: null,
		}],
	}, {
		id: 2,
		name: 'Group2',
		lower: 'group2',
		description: null,
		users: [{
			id: 2,
			name: 'Andrew',
			lower: 'andrew',
			verified: 0,
			invitedBy: null,
		}, {
			id: 3,
			name: 'Alex',
			lower: 'alex',
			verified: 0,
			invitedBy: null,
		}],
	}, {
		id: 3,
		name: 'Group3',
		lower: 'group3',
		description: null,
		users: [{
			id: 3,
			name: 'Alex',
			lower: 'alex',
			verified: 0,
			invitedBy: null,
		}],
	}]);
});

test('[Find Many .through] Get users with first group', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 3, name: 'Group3' },
		{ id: 2, name: 'Group2' },
		{ id: 1, name: 'Group1' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 3, groupId: 2 },
		{ userId: 2, groupId: 3 },
		{ userId: 2, groupId: 2 },
	]);

	const response = await db.query.usersTable.findMany({
		with: {
			group: true,
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		group: {
			id: number;
			name: string;
			description: string | null;
		} | null;
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response).toStrictEqual([{
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		group: null,
	}, {
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		group: {
			id: 3,
			name: 'Group3',
			description: null,
		},
	}, {
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: null,
		group: {
			id: 2,
			name: 'Group2',
			description: null,
		},
	}]);
});

test('[Find Many .through] Get groups with first user', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findMany({
		with: {
			user: true,
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		description: string | null;
		user: {
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
		} | null;
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);
	expect(response).toStrictEqual([{
		id: 1,
		name: 'Group1',
		description: null,
		user: null,
	}, {
		id: 2,
		name: 'Group2',
		description: null,
		user: {
			id: 2,
			name: 'Andrew',
			verified: 0,
			invitedBy: null,
		},
	}, {
		id: 3,
		name: 'Group3',
		description: null,
		user: {
			id: 3,
			name: 'Alex',
			verified: 0,
			invitedBy: null,
		},
	}]);
});

test('[Find Many .through] Get users with filtered groups', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findMany({
		with: {
			groupsFiltered: true,
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		groupsFiltered: {
			id: number;
			name: string;
			description: string | null;
		}[];
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);
	for (const e of response) {
		e.groupsFiltered.sort((a, b) => (a.id > b.id) ? 1 : -1);
	}

	expect(response).toStrictEqual([{
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		groupsFiltered: [],
	}, {
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		groupsFiltered: [{
			id: 2,
			name: 'Group2',
			description: null,
		}],
	}, {
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: null,
		groupsFiltered: [
			{
				id: 2,
				name: 'Group2',
				description: null,
			},
			{
				id: 3,
				name: 'Group3',
				description: null,
			},
		],
	}]);
});

test('[Find Many .through] Get groups with filtered users', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findMany({
		with: {
			usersFiltered: true,
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		description: string | null;
		usersFiltered: {
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
		}[];
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);
	for (const e of response) {
		e.usersFiltered.sort((a, b) => (a.id > b.id) ? 1 : -1);
	}

	expect(response).toStrictEqual([{
		id: 1,
		name: 'Group1',
		description: null,
		usersFiltered: [],
	}, {
		id: 2,
		name: 'Group2',
		description: null,
		usersFiltered: [{
			id: 2,
			name: 'Andrew',
			verified: 0,
			invitedBy: null,
		}, {
			id: 3,
			name: 'Alex',
			verified: 0,
			invitedBy: null,
		}],
	}, {
		id: 3,
		name: 'Group3',
		description: null,
		usersFiltered: [{
			id: 3,
			name: 'Alex',
			verified: 0,
			invitedBy: null,
		}],
	}]);
});

test('[Find Many .through] Get users with filtered groups + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersTable.findMany({
		with: {
			groupsFiltered: {
				where: {
					id: {
						lt: 3,
					},
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		groupsFiltered: {
			id: number;
			name: string;
			description: string | null;
		}[];
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);
	for (const e of response) {
		e.groupsFiltered.sort((a, b) => (a.id > b.id) ? 1 : -1);
	}

	expect(response).toStrictEqual([{
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		groupsFiltered: [],
	}, {
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		groupsFiltered: [{
			id: 2,
			name: 'Group2',
			description: null,
		}],
	}, {
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: null,
		groupsFiltered: [
			{
				id: 2,
				name: 'Group2',
				description: null,
			},
		],
	}]);
});

test('[Find Many .through] Get groups with filtered users + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findMany({
		with: {
			usersFiltered: {
				where: { id: { lt: 3 } },
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		description: string | null;
		usersFiltered: {
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
		}[];
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);
	for (const e of response) {
		e.usersFiltered.sort((a, b) => (a.id > b.id) ? 1 : -1);
	}

	expect(response).toStrictEqual([{
		id: 1,
		name: 'Group1',
		description: null,
		usersFiltered: [],
	}, {
		id: 2,
		name: 'Group2',
		description: null,
		usersFiltered: [{
			id: 2,
			name: 'Andrew',
			verified: 0,
			invitedBy: null,
		}],
	}, {
		id: 3,
		name: 'Group3',
		description: null,
		usersFiltered: [],
	}]);
});

test('[Find Many] Get users with filtered posts', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ id: 1, ownerId: 1, content: 'Post1.1' },
		{ id: 2, ownerId: 2, content: 'Post2.1' },
		{ id: 3, ownerId: 3, content: 'Post3.1' },
		{ id: 4, ownerId: 1, content: 'Post1.2' },
		{ id: 5, ownerId: 2, content: 'Post2.2' },
		{ id: 6, ownerId: 3, content: 'Post3.2' },
		{ id: 7, ownerId: 1, content: 'Post1.3' },
		{ id: 8, ownerId: 2, content: 'Post2.3' },
		{ id: 9, ownerId: 3, content: 'Post3.3' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		with: {
			postsFiltered: {
				columns: {
					ownerId: true,
					content: true,
				},
			},
		},
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		postsFiltered: {
			ownerId: number | null;
			content: string;
		}[];
	}[]>();

	usersWithPosts.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(usersWithPosts).toStrictEqual([{
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		postsFiltered: [],
	}, {
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		postsFiltered: [
			{ ownerId: 2, content: 'Post2.1' },
			{ ownerId: 2, content: 'Post2.2' },
			{ ownerId: 2, content: 'Post2.3' },
		],
	}, {
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: null,
		postsFiltered: [],
	}]);
});

test('[Find Many] Get posts with filtered authors', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ id: 1, ownerId: 1, content: 'Post1.1' },
		{ id: 2, ownerId: 2, content: 'Post2.1' },
		{ id: 3, ownerId: 3, content: 'Post3.1' },
		{ id: 4, ownerId: 1, content: 'Post1.2' },
		{ id: 5, ownerId: 2, content: 'Post2.2' },
		{ id: 6, ownerId: 3, content: 'Post3.2' },
	]);

	const posts = await db.query.postsTable.findMany({
		columns: {
			id: true,
			content: true,
		},
		with: {
			authorFiltered: {
				columns: {
					name: true,
					id: true,
				},
			},
		},
	});

	expectTypeOf(posts).toEqualTypeOf<{
		id: number;
		content: string;
		authorFiltered: {
			id: number;
			name: string;
		};
	}[]>();

	posts.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(posts).toStrictEqual([
		{ id: 1, content: 'Post1.1', authorFiltered: null },
		{
			id: 2,
			content: 'Post2.1',
			authorFiltered: {
				id: 2,
				name: 'Andrew',
			},
		},
		{ id: 3, content: 'Post3.1', authorFiltered: null },
		{ id: 4, content: 'Post1.2', authorFiltered: null },
		{
			id: 5,
			content: 'Post2.2',
			authorFiltered: {
				id: 2,
				name: 'Andrew',
			},
		},
		{ id: 6, content: 'Post3.2', authorFiltered: null },
	]);
});

test('[Find Many] Get users with filtered posts + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ id: 1, ownerId: 1, content: 'Post1.1' },
		{ id: 2, ownerId: 2, content: 'Post2.1' },
		{ id: 3, ownerId: 3, content: 'Post3.1' },
		{ id: 4, ownerId: 1, content: 'Post1.2' },
		{ id: 5, ownerId: 2, content: 'Post2.2' },
		{ id: 6, ownerId: 3, content: 'Post3.2' },
		{ id: 7, ownerId: 1, content: 'Post1.3' },
		{ id: 8, ownerId: 2, content: 'Post2.3' },
		{ id: 9, ownerId: 3, content: 'Post3.3' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		with: {
			postsFiltered: {
				columns: {
					ownerId: true,
					content: true,
				},
				where: {
					content: {
						like: '%.2',
					},
				},
			},
		},
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		postsFiltered: {
			ownerId: number | null;
			content: string;
		}[];
	}[]>();

	usersWithPosts.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(usersWithPosts).toStrictEqual([{
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		postsFiltered: [],
	}, {
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		postsFiltered: [
			{ ownerId: 2, content: 'Post2.2' },
		],
	}, {
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: null,
		postsFiltered: [],
	}]);
});

test('[Find Many] Get posts with filtered authors + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ id: 1, ownerId: 1, content: 'Post1.1' },
		{ id: 2, ownerId: 2, content: 'Post2.1' },
		{ id: 3, ownerId: 3, content: 'Post3.1' },
		{ id: 4, ownerId: 1, content: 'Post1.2' },
		{ id: 5, ownerId: 2, content: 'Post2.2' },
		{ id: 6, ownerId: 3, content: 'Post3.2' },
	]);

	const posts = await db.query.postsTable.findMany({
		columns: {
			id: true,
			content: true,
		},
		with: {
			authorAltFiltered: {
				columns: {
					name: true,
					id: true,
				},
				where: {
					id: 2,
				},
			},
		},
	});

	expectTypeOf(posts).toEqualTypeOf<{
		id: number;
		content: string;
		authorAltFiltered: {
			id: number;
			name: string;
		} | null;
	}[]>();

	posts.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(posts).toStrictEqual([
		{ id: 1, content: 'Post1.1', authorAltFiltered: null },
		{
			id: 2,
			content: 'Post2.1',
			authorAltFiltered: {
				id: 2,
				name: 'Andrew',
			},
		},
		{ id: 3, content: 'Post3.1', authorAltFiltered: null },
		{ id: 4, content: 'Post1.2', authorAltFiltered: null },
		{ id: 5, content: 'Post2.2', authorAltFiltered: null },
		{ id: 6, content: 'Post3.2', authorAltFiltered: null },
	]);
});

test('[Find Many] Get view users with posts', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	const date1 = new Date(0);
	const date2 = new Date(1000);
	const date3 = new Date(10000);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1', createdAt: date1 },
		{ ownerId: 2, content: 'Post2', createdAt: date2 },
		{ ownerId: 3, content: 'Post3', createdAt: date3 },
	]);

	const usersWithPosts = await db.query.usersView.findMany({
		with: {
			posts: true,
		},
		orderBy: {
			id: 'asc',
		},
		where: {
			id: {
				lt: 3,
			},
		},
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		counter: number | null;
		createdAt: Date | null;
		postContent: string | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	expect(usersWithPosts).toEqual([{
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		counter: 3,
		postContent: 'Post1',
		createdAt: date1,
		posts: [],
	}, {
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		counter: null,
		postContent: 'Post2',
		createdAt: date2,
		posts: [{ id: 2, ownerId: 2, content: 'Post2', createdAt: date2 }],
	}]);
});

test('[Find Many] Get view users with posts + filter by SQL.Aliased field', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	const date1 = new Date(0);
	const date2 = new Date(1000);
	const date3 = new Date(10000);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1', createdAt: date1 },
		{ ownerId: 2, content: 'Post2', createdAt: date2 },
		{ ownerId: 3, content: 'Post3', createdAt: date3 },
	]);

	const usersWithPosts = await db.query.usersView.findMany({
		columns: {
			id: true,
			name: true,
			verified: true,
			invitedBy: true,
			counter: true,
		},
		with: {
			posts: true,
		},
		orderBy: {
			id: 'desc',
		},
		where: {
			counter: {
				ne: 0,
			},
		},
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		counter: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	expect(usersWithPosts).toEqual([{
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: null,
		counter: 3,
		posts: [{ id: 3, ownerId: 3, content: 'Post3', createdAt: date3 }],
	}, {
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		counter: 3,
		posts: [],
	}]);
});

test('[Find Many] Get view users with posts + filter by joined field', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	const date1 = new Date(0);
	const date2 = new Date(1000);
	const date3 = new Date(10000);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1', createdAt: date1 },
		{ ownerId: 2, content: 'Post2', createdAt: date2 },
		{ ownerId: 3, content: 'Post3', createdAt: date3 },
	]);

	const usersWithPosts = await db.query.usersView.findMany({
		with: {
			posts: true,
		},
		orderBy: {
			id: 'asc',
		},
		where: {
			postContent: 'Post2',
		},
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		createdAt: Date | null;
		postContent: string | null;
		counter: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	expect(usersWithPosts).toEqual([{
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		counter: null,
		postContent: 'Post2',
		createdAt: date2,
		posts: [{ id: 2, ownerId: 2, content: 'Post2', createdAt: date2 }],
	}]);
});

test('[Find Many] Get posts with view users with posts', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	const date1 = new Date(0);
	const date2 = new Date(1000);
	const date3 = new Date(10000);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1', createdAt: date1 },
		{ ownerId: 2, content: 'Post2', createdAt: date2 },
		{ ownerId: 3, content: 'Post3', createdAt: date3 },
	]);

	const result = await db.query.postsTable.findMany({
		with: {
			viewAuthor: {
				with: {
					posts: true,
				},
			},
		},
		orderBy: {
			id: 'asc',
		},
	});

	expectTypeOf(result).toEqualTypeOf<{
		id: number;
		content: string;
		ownerId: number | null;
		createdAt: Date;
		viewAuthor: {
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			createdAt: Date | null;
			postContent: string | null;
			counter: number | null;
			posts: {
				id: number;
				content: string;
				ownerId: number | null;
				createdAt: Date;
			}[];
		};
	}[]>();

	expect(result).toEqual([
		{
			id: 1,
			ownerId: 1,
			content: 'Post1',
			createdAt: date1,
			viewAuthor: null,
		},
		{
			id: 2,
			ownerId: 2,
			content: 'Post2',
			createdAt: date2,
			viewAuthor: {
				id: 2,
				name: 'Andrew',
				verified: 0,
				invitedBy: null,
				counter: null,
				postContent: 'Post2',
				createdAt: date2,
				posts: [{ id: 2, ownerId: 2, content: 'Post2', createdAt: date2 }],
			},
		},
		{
			id: 3,
			ownerId: 3,
			content: 'Post3',
			createdAt: date3,
			viewAuthor: {
				id: 3,
				name: 'Alex',
				verified: 0,
				invitedBy: null,
				counter: 3,
				postContent: 'Post3',
				createdAt: date3,
				posts: [{ id: 3, ownerId: 3, content: 'Post3', createdAt: date3 }],
			},
		},
	]);
});

test('[Find Many] Get posts with view users + filter with posts', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	const date1 = new Date(0);
	const date2 = new Date(1000);
	const date3 = new Date(10000);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1', createdAt: date1 },
		{ ownerId: 2, content: 'Post2', createdAt: date2 },
		{ ownerId: 3, content: 'Post3', createdAt: date3 },
	]);

	const result = await db.query.postsTable.findMany({
		with: {
			viewAuthor: {
				with: {
					posts: true,
				},
				where: {
					id: {
						ne: 2,
					},
				},
			},
		},
		orderBy: {
			id: 'asc',
		},
	});

	expectTypeOf(result).toEqualTypeOf<{
		id: number;
		content: string;
		ownerId: number | null;
		createdAt: Date;
		viewAuthor: {
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			createdAt: Date | null;
			postContent: string | null;
			counter: number | null;
			posts: {
				id: number;
				content: string;
				ownerId: number | null;
				createdAt: Date;
			}[];
		} | null;
	}[]>();

	expect(result).toEqual([
		{
			id: 1,
			ownerId: 1,
			content: 'Post1',
			createdAt: date1,
			viewAuthor: null,
		},
		{
			id: 2,
			ownerId: 2,
			content: 'Post2',
			createdAt: date2,
			viewAuthor: null,
		},
		{
			id: 3,
			ownerId: 3,
			content: 'Post3',
			createdAt: date3,
			viewAuthor: {
				id: 3,
				name: 'Alex',
				verified: 0,
				invitedBy: null,
				counter: 3,
				postContent: 'Post3',
				createdAt: date3,
				posts: [{ id: 3, ownerId: 3, content: 'Post3', createdAt: date3 }],
			},
		},
	]);
});

test('[Find Many] Get posts with view users + filter by joined column with posts', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	const date1 = new Date(0);
	const date2 = new Date(1000);
	const date3 = new Date(10000);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1', createdAt: date1 },
		{ ownerId: 2, content: 'Post2', createdAt: date2 },
		{ ownerId: 3, content: 'Post3', createdAt: date3 },
	]);

	const result = await db.query.postsTable.findMany({
		with: {
			viewAuthor: {
				with: {
					posts: true,
				},
				where: {
					postContent: {
						notLike: '%2',
					},
				},
			},
		},
		orderBy: {
			id: 'asc',
		},
	});

	expectTypeOf(result).toEqualTypeOf<{
		id: number;
		content: string;
		ownerId: number | null;
		createdAt: Date;
		viewAuthor: {
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			createdAt: Date | null;
			postContent: string | null;
			counter: number | null;
			posts: {
				id: number;
				content: string;
				ownerId: number | null;
				createdAt: Date;
			}[];
		} | null;
	}[]>();

	expect(result).toEqual([
		{
			id: 1,
			ownerId: 1,
			content: 'Post1',
			createdAt: date1,
			viewAuthor: null,
		},
		{
			id: 2,
			ownerId: 2,
			content: 'Post2',
			createdAt: date2,
			viewAuthor: null,
		},
		{
			id: 3,
			ownerId: 3,
			content: 'Post3',
			createdAt: date3,
			viewAuthor: {
				id: 3,
				name: 'Alex',
				verified: 0,
				invitedBy: null,
				counter: 3,
				postContent: 'Post3',
				createdAt: date3,
				posts: [{ id: 3, ownerId: 3, content: 'Post3', createdAt: date3 }],
			},
		},
	]);
});
test('[Find Many] Get posts with view users + filter by SQL.Aliased with posts', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	const date1 = new Date(0);
	const date2 = new Date(1000);
	const date3 = new Date(10000);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1', createdAt: date1 },
		{ ownerId: 2, content: 'Post2', createdAt: date2 },
		{ ownerId: 3, content: 'Post3', createdAt: date3 },
	]);

	const result = await db.query.postsTable.findMany({
		with: {
			viewAuthor: {
				with: {
					posts: true,
				},
				where: {
					counter: {
						ne: 0,
					},
				},
			},
		},
		orderBy: {
			id: 'asc',
		},
	});

	expectTypeOf(result).toEqualTypeOf<{
		id: number;
		content: string;
		ownerId: number | null;
		createdAt: Date;
		viewAuthor: {
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			createdAt: Date | null;
			postContent: string | null;
			counter: number | null;
			posts: {
				id: number;
				content: string;
				ownerId: number | null;
				createdAt: Date;
			}[];
		} | null;
	}[]>();

	expect(result).toEqual([
		{
			id: 1,
			ownerId: 1,
			content: 'Post1',
			createdAt: date1,
			viewAuthor: null,
		},
		{
			id: 2,
			ownerId: 2,
			content: 'Post2',
			createdAt: date2,
			viewAuthor: null,
		},
		{
			id: 3,
			ownerId: 3,
			content: 'Post3',
			createdAt: date3,
			viewAuthor: {
				id: 3,
				name: 'Alex',
				verified: 0,
				invitedBy: null,
				counter: 3,
				postContent: 'Post3',
				createdAt: date3,
				posts: [{ id: 3, ownerId: 3, content: 'Post3', createdAt: date3 }],
			},
		},
	]);
});

test('[Find Many .through] Get view users with filtered groups + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.usersView.findMany({
		with: {
			groups: {
				where: {
					id: {
						lt: 3,
					},
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		createdAt: Date | null;
		postContent: string | null;
		counter: number | null;
		groups: {
			id: number;
			name: string;
			description: string | null;
		}[];
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);
	for (const e of response) {
		e.groups.sort((a, b) => (a.id > b.id) ? 1 : -1);
	}

	expect(response).toStrictEqual([{
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		createdAt: null,
		postContent: null,
		counter: 3,
		groups: [],
	}, {
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		createdAt: null,
		postContent: null,
		counter: null,
		groups: [{
			id: 2,
			name: 'Group2',
			description: null,
		}],
	}, {
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: null,
		createdAt: null,
		postContent: null,
		counter: 3,
		groups: [
			{
				id: 2,
				name: 'Group2',
				description: null,
			},
		],
	}]);
});

test('[Find Many .through] Get groups with filtered view users + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 2 },
	]);

	const response = await db.query.groupsTable.findMany({
		with: {
			usersView: {
				columns: {
					createdAt: false,
					postContent: false,
				},
				where: { id: { lt: 3 } },
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		description: string | null;
		usersView: {
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
			counter: number | null;
		}[];
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);
	for (const e of response) {
		e.usersView.sort((a, b) => (a.id > b.id) ? 1 : -1);
	}

	expect(response).toStrictEqual([{
		id: 1,
		name: 'Group1',
		description: null,
		usersView: [],
	}, {
		id: 2,
		name: 'Group2',
		description: null,
		usersView: [{
			id: 2,
			name: 'Andrew',
			verified: 0,
			invitedBy: null,
			counter: null,
		}],
	}, {
		id: 3,
		name: 'Group3',
		description: null,
		usersView: [],
	}]);
});

test('[Find Many] Get users + filter users by posts', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	const date1 = new Date(0);
	const date2 = new Date(1000);
	const date3 = new Date(10000);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1', createdAt: date1 },
		{ ownerId: 2, content: 'Post2', createdAt: date2 },
		{ ownerId: 3, content: 'Post3', createdAt: date3 },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		orderBy: {
			id: 'asc',
		},
		where: {
			posts: {
				content: {
					like: '%2',
				},
			},
		},
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
	}[]>();

	expect(usersWithPosts).toEqual([{
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
	}]);
});

test('[Find Many] Get users with posts + filter users by posts', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	const date1 = new Date(0);
	const date2 = new Date(1000);
	const date3 = new Date(10000);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1', createdAt: date1 },
		{ ownerId: 2, content: 'Post2', createdAt: date2 },
		{ ownerId: 3, content: 'Post3', createdAt: date3 },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		with: {
			posts: true,
		},
		orderBy: {
			id: 'asc',
		},
		where: {
			posts: {
				content: {
					like: '%2',
				},
			},
		},
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	expect(usersWithPosts).toEqual([{
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		posts: [{ id: 2, ownerId: 2, content: 'Post2', createdAt: date2 }],
	}]);
});

test('[Find Many] Get users filtered by existing posts', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	const date2 = new Date(1000);
	const date3 = new Date(10000);

	await db.insert(postsTable).values([
		{ ownerId: 2, content: 'Post2', createdAt: date2 },
		{ ownerId: 3, content: 'Post3', createdAt: date3 },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		orderBy: {
			id: 'asc',
		},
		where: {
			posts: true,
		},
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
	}[]>();

	expect(usersWithPosts).toEqual([{
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
	}, {
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: null,
	}]);
});

test('[Find Many] Get users with posts + filter users by existing posts', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	const date2 = new Date(1000);
	const date3 = new Date(10000);

	await db.insert(postsTable).values([
		{ ownerId: 2, content: 'Post2', createdAt: date2 },
		{ ownerId: 3, content: 'Post3', createdAt: date3 },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		with: {
			posts: true,
		},
		orderBy: {
			id: 'asc',
		},
		where: {
			posts: true,
		},
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	expect(usersWithPosts).toEqual([{
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 2, content: 'Post2', createdAt: date2 }],
	}, {
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: null,
		posts: [{ id: 2, ownerId: 3, content: 'Post3', createdAt: date3 }],
	}]);
});

test('[Find Many] Get users filtered by nonexisting posts', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	const date2 = new Date(1000);
	const date3 = new Date(10000);

	await db.insert(postsTable).values([
		{ ownerId: 2, content: 'Post2', createdAt: date2 },
		{ ownerId: 3, content: 'Post3', createdAt: date3 },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		orderBy: {
			id: 'asc',
		},
		where: {
			posts: false,
		},
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
	}[]>();

	expect(usersWithPosts).toEqual([{
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
	}]);
});

test('[Find Many] Get users with posts + filter users by existing posts', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	const date2 = new Date(1000);
	const date3 = new Date(10000);

	await db.insert(postsTable).values([
		{ ownerId: 2, content: 'Post2', createdAt: date2 },
		{ ownerId: 3, content: 'Post3', createdAt: date3 },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		with: {
			posts: true,
		},
		orderBy: {
			id: 'asc',
		},
		where: {
			posts: false,
		},
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	expect(usersWithPosts).toEqual([{
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		posts: [],
	}]);
});

test('[Find Many] Get users with posts + filter posts by author', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	const date1 = new Date(0);
	const date2 = new Date(1000);
	const date3 = new Date(10000);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1U.1', createdAt: date1 },
		{ ownerId: 1, content: 'Post1U.2', createdAt: date1 },
		{ ownerId: 2, content: 'Post2U.1', createdAt: date2 },
		{ ownerId: 2, content: 'Post2U.2', createdAt: date2 },
		{ ownerId: 3, content: 'Post3U.1', createdAt: date3 },
		{ ownerId: 3, content: 'Post3U.2', createdAt: date3 },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		with: {
			posts: {
				where: {
					author: {
						id: 2,
					},
				},
			},
		},
		orderBy: {
			id: 'asc',
		},
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	expect(usersWithPosts).toEqual([
		{
			id: 1,
			name: 'Dan',
			verified: 0,
			invitedBy: null,
			posts: [],
		},
		{
			id: 2,
			name: 'Andrew',
			verified: 0,
			invitedBy: null,
			posts: [{
				id: 3,
				ownerId: 2,
				content: 'Post2U.1',
				createdAt: date2,
			}, {
				id: 4,
				ownerId: 2,
				content: 'Post2U.2',
				createdAt: date2,
			}],
		},
		{
			id: 3,
			name: 'Alex',
			verified: 0,
			invitedBy: null,
			posts: [],
		},
	]);
});

test('[Find Many] Get users filtered by own columns and posts with filtered posts by own columns and author', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	const date1 = new Date(0);
	const date2 = new Date(1000);
	const date3 = new Date(10000);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1U.1', createdAt: date1 },
		{ ownerId: 1, content: 'Post1U.2', createdAt: date1 },
		{ ownerId: 1, content: 'Message1U.1', createdAt: date1 },
		{ ownerId: 1, content: 'Message1U.2', createdAt: date1 },
		{ ownerId: 2, content: 'Post2U.1', createdAt: date2 },
		{ ownerId: 2, content: 'Post2U.2', createdAt: date2 },
		{ ownerId: 2, content: 'MessageU.1', createdAt: date2 },
		{ ownerId: 2, content: 'MessageU.2', createdAt: date2 },
		{ ownerId: 3, content: 'Post3U.1', createdAt: date3 },
		{ ownerId: 3, content: 'Post3U.2', createdAt: date3 },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		with: {
			posts: {
				where: {
					content: {
						like: '%2',
					},
					author: {
						id: 2,
					},
				},
			},
		},
		where: {
			id: {
				gt: 1,
			},
			posts: {
				content: {
					like: 'M%',
				},
			},
		},
		orderBy: {
			id: 'asc',
		},
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	expect(usersWithPosts).toEqual([
		{
			id: 2,
			name: 'Andrew',
			verified: 0,
			invitedBy: null,
			posts: [{
				id: 6,
				ownerId: 2,
				content: 'Post2U.2',
				createdAt: date2,
			}, {
				id: 8,
				ownerId: 2,
				content: 'MessageU.2',
				createdAt: date2,
			}],
		},
	]);
});

test('[Find Many .through] Get users filtered by groups', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 1 },
	]);

	const response = await db.query.usersTable.findMany({
		where: {
			groups: {
				name: 'Group2',
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response).toStrictEqual([{
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
	}]);
});

test('[Find Many .through] Get users filtered by existing groups', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 1 },
	]);

	const response = await db.query.usersTable.findMany({
		where: {
			groups: true,
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response).toStrictEqual([{
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
	}, {
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: null,
	}]);
});

test('[Find Many .through] Get users with existing groups', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 1 },
	]);

	const response = await db.query.usersTable.findMany({
		with: {
			groups: true,
		},
		where: {
			groups: true,
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		groups: {
			id: number;
			name: string;
			description: string | null;
		}[];
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);
	for (const e of response) {
		e.groups.sort((a, b) => (a.id > b.id) ? 1 : -1);
	}

	expect(response).toStrictEqual([{
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		groups: [{
			id: 2,
			name: 'Group2',
			description: null,
		}],
	}, {
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: null,
		groups: [{
			id: 1,
			name: 'Group1',
			description: null,
		}, {
			id: 3,
			name: 'Group3',
			description: null,
		}],
	}]);
});

test('[Find Many .through] Get users filtered by nonexisting groups', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 1 },
	]);

	const response = await db.query.usersTable.findMany({
		where: {
			groups: false,
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response).toStrictEqual([{
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
	}]);
});

test('[Find Many .through] Get users with nonexisting groups', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 1 },
	]);

	const response = await db.query.usersTable.findMany({
		with: {
			groups: true,
		},
		where: {
			groups: false,
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		groups: {
			id: number;
			name: string;
			description: string | null;
		}[];
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);
	for (const e of response) {
		e.groups.sort((a, b) => (a.id > b.id) ? 1 : -1);
	}

	expect(response).toStrictEqual([{
		id: 1,
		name: 'Dan',
		verified: 0,
		invitedBy: null,
		groups: [],
	}]);
});

test('[Find Many .through] Get users filtered by groups with groups', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 1 },
	]);

	const response = await db.query.usersTable.findMany({
		with: {
			groups: {
				orderBy: {
					id: 'asc',
				},
			},
		},
		where: {
			groups: {
				name: 'Group2',
			},
		},
		orderBy: {
			id: 'asc',
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		groups: {
			id: number;
			name: string;
			description: string | null;
		}[];
	}[]>();

	expect(response).toStrictEqual([{
		id: 2,
		name: 'Andrew',
		verified: 0,
		invitedBy: null,
		groups: [{
			id: 2,
			name: 'Group2',
			description: null,
		}],
	}]);
});

test('[Find Many .through] Get users filtered by groups with groups filtered by users', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 1 },
	]);

	const response = await db.query.usersTable.findMany({
		with: {
			groups: {
				orderBy: {
					id: 'asc',
				},
				where: {
					users: {
						id: 1,
					},
				},
			},
		},
		where: {
			groups: {
				name: 'Group3',
			},
		},
		orderBy: {
			id: 'asc',
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		groups: {
			id: number;
			name: string;
			description: string | null;
		}[];
	}[]>();

	expect(response).toStrictEqual([{
		id: 3,
		name: 'Alex',
		verified: 0,
		invitedBy: null,
		groups: [{
			id: 1,
			name: 'Group1',
			description: null,
		}],
	}]);
});

test('[Find Many .through] Get users filtered by users of groups with groups', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(groupsTable).values([
		{ id: 1, name: 'Group1' },
		{ id: 2, name: 'Group2' },
		{ id: 3, name: 'Group3' },
	]);

	await db.insert(usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 2, groupId: 2 },
		{ userId: 3, groupId: 3 },
		{ userId: 3, groupId: 1 },
	]);

	const response = await db.query.usersTable.findMany({
		with: {
			groups: {
				orderBy: {
					id: 'asc',
				},
			},
		},
		where: {
			groups: {
				users: {
					id: 3,
				},
			},
		},
		orderBy: {
			id: 'asc',
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
		groups: {
			id: number;
			name: string;
			description: string | null;
		}[];
	}[]>();

	expect(response).toStrictEqual([
		{
			id: 1,
			name: 'Dan',
			verified: 0,
			invitedBy: null,
			groups: [{
				id: 1,
				name: 'Group1',
				description: null,
			}],
		},
		{
			id: 3,
			name: 'Alex',
			verified: 0,
			invitedBy: null,
			groups: [{
				id: 1,
				name: 'Group1',
				description: null,
			}, {
				id: 3,
				name: 'Group3',
				description: null,
			}],
		},
	]);
});

test('[Find First] Relationless querying', async () => {
	const rels = defineRelations({
		usersTable,
	});

	const d1 = drizzle(':memory:', {
		relations: rels,
		casing: 'snake_case',
	});

	d1.run(sql`DROP TABLE IF EXISTS \`users\``);
	d1.run(
		sql`
			CREATE TABLE \`users\` (
			    \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			    \`name\` text NOT NULL,
			    \`verified\` integer DEFAULT 0 NOT NULL,
			    \`invited_by\` integer
			);
		`,
	);

	d1.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	const res = d1.query.usersTable.findFirst({
		where: {
			id: 2,
		},
	}).sync();

	expectTypeOf(res).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
		} | undefined
	>();

	expect(res).toStrictEqual(
		{
			id: 2,
			name: 'Andrew',
			verified: 0,
			invitedBy: null,
		},
	);
});

test('[Find Many] Relationless querying', async () => {
	const rels = defineRelations({
		usersTable,
	});

	const d1 = drizzle(':memory:', {
		relations: rels,
		casing: 'snake_case',
	});

	d1.run(sql`DROP TABLE IF EXISTS \`users\``);
	d1.run(
		sql`
			CREATE TABLE \`users\` (
			    \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
			    \`name\` text NOT NULL,
			    \`verified\` integer DEFAULT 0 NOT NULL,
			    \`invited_by\` integer
			);
		`,
	);

	d1.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	const res = d1.query.usersTable.findMany({
		where: {
			id: {
				lte: 2,
			},
		},
	}).sync();

	expectTypeOf(res).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: number;
			invitedBy: number | null;
		}[]
	>();

	expect(res).toStrictEqual(
		[{
			id: 1,
			name: 'Dan',
			verified: 0,
			invitedBy: null,
		}, {
			id: 2,
			name: 'Andrew',
			verified: 0,
			invitedBy: null,
		}],
	);
});

test('[Find Many] Shortcut form placeholders in filters - eq', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	const date1 = new Date(0);
	const date2 = new Date(1000);
	const date3 = new Date(10000);

	await db.insert(postsTable).values([
		{ id: 1, ownerId: 1, content: 'Post1U.1', createdAt: date1 },
		{ id: 2, ownerId: 1, content: 'Post1U.2', createdAt: date1 },
		{ id: 3, ownerId: 1, content: 'Message1U.1', createdAt: date1 },
		{ id: 4, ownerId: 1, content: 'Message1U.2', createdAt: date1 },
		{ id: 5, ownerId: 2, content: 'Post2U.1', createdAt: date2 },
		{ id: 6, ownerId: 2, content: 'Post2U.2', createdAt: date2 },
		{ id: 7, ownerId: 2, content: 'MessageU.1', createdAt: date2 },
		{ id: 8, ownerId: 2, content: 'MessageU.2', createdAt: date2 },
		{ id: 9, ownerId: 3, content: 'Post3U.1', createdAt: date3 },
		{ id: 10, ownerId: 3, content: 'Post3U.2', createdAt: date3 },
	]);

	const query = await db.query.postsTable.findMany({
		where: {
			ownerId: sql.placeholder('id'),
		},
		orderBy: {
			id: 'asc',
		},
	}).prepare();

	const posts = query.execute({
		id: 1,
	}).sync();

	expectTypeOf(posts).toEqualTypeOf<{
		id: number;
		content: string;
		ownerId: number | null;
		createdAt: Date;
	}[]>();

	expect(posts).toEqual([
		{ id: 1, ownerId: 1, content: 'Post1U.1', createdAt: date1 },
		{ id: 2, ownerId: 1, content: 'Post1U.2', createdAt: date1 },
		{ id: 3, ownerId: 1, content: 'Message1U.1', createdAt: date1 },
		{ id: 4, ownerId: 1, content: 'Message1U.2', createdAt: date1 },
	]);
});

test('[Find Many] Shortcut form placeholders in filters - or', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	const date1 = new Date(0);
	const date2 = new Date(1000);
	const date3 = new Date(10000);

	await db.insert(postsTable).values([
		{ id: 1, ownerId: 1, content: 'Post1U.1', createdAt: date1 },
		{ id: 2, ownerId: 1, content: 'Post1U.2', createdAt: date1 },
		{ id: 3, ownerId: 1, content: 'Message1U.1', createdAt: date1 },
		{ id: 4, ownerId: 1, content: 'Message1U.2', createdAt: date1 },
		{ id: 5, ownerId: 2, content: 'Post2U.1', createdAt: date2 },
		{ id: 6, ownerId: 2, content: 'Post2U.2', createdAt: date2 },
		{ id: 7, ownerId: 2, content: 'MessageU.1', createdAt: date2 },
		{ id: 8, ownerId: 2, content: 'MessageU.2', createdAt: date2 },
		{ id: 9, ownerId: 3, content: 'Post3U.1', createdAt: date3 },
		{ id: 10, ownerId: 3, content: 'Post3U.2', createdAt: date3 },
	]);

	const query = await db.query.postsTable.findMany({
		where: {
			OR: [{
				ownerId: sql.placeholder('id1'),
			}, {
				ownerId: sql.placeholder('id2'),
			}],
		},
		orderBy: {
			id: 'asc',
		},
	}).prepare();

	const posts = query.execute({
		id1: 1,
		id2: 2,
	}).sync();

	expectTypeOf(posts).toEqualTypeOf<{
		id: number;
		content: string;
		ownerId: number | null;
		createdAt: Date;
	}[]>();

	expect(posts).toEqual([
		{ id: 1, ownerId: 1, content: 'Post1U.1', createdAt: date1 },
		{ id: 2, ownerId: 1, content: 'Post1U.2', createdAt: date1 },
		{ id: 3, ownerId: 1, content: 'Message1U.1', createdAt: date1 },
		{ id: 4, ownerId: 1, content: 'Message1U.2', createdAt: date1 },
		{ id: 5, ownerId: 2, content: 'Post2U.1', createdAt: date2 },
		{ id: 6, ownerId: 2, content: 'Post2U.2', createdAt: date2 },
		{ id: 7, ownerId: 2, content: 'MessageU.1', createdAt: date2 },
		{ id: 8, ownerId: 2, content: 'MessageU.2', createdAt: date2 },
	]);
});

test('[Find Many] Shortcut form placeholders in filters - column or', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	const date1 = new Date(0);
	const date2 = new Date(1000);
	const date3 = new Date(10000);

	await db.insert(postsTable).values([
		{ id: 1, ownerId: 1, content: 'Post1U.1', createdAt: date1 },
		{ id: 2, ownerId: 1, content: 'Post1U.2', createdAt: date1 },
		{ id: 3, ownerId: 1, content: 'Message1U.1', createdAt: date1 },
		{ id: 4, ownerId: 1, content: 'Message1U.2', createdAt: date1 },
		{ id: 5, ownerId: 2, content: 'Post2U.1', createdAt: date2 },
		{ id: 6, ownerId: 2, content: 'Post2U.2', createdAt: date2 },
		{ id: 7, ownerId: 2, content: 'MessageU.1', createdAt: date2 },
		{ id: 8, ownerId: 2, content: 'MessageU.2', createdAt: date2 },
		{ id: 9, ownerId: 3, content: 'Post3U.1', createdAt: date3 },
		{ id: 10, ownerId: 3, content: 'Post3U.2', createdAt: date3 },
	]);

	const query = await db.query.postsTable.findMany({
		where: {
			ownerId: {
				OR: [sql.placeholder('id1'), sql.placeholder('id2')],
			},
		},
		orderBy: {
			id: 'asc',
		},
	}).prepare();

	const posts = query.execute({
		id1: 1,
		id2: 2,
	}).sync();

	expectTypeOf(posts).toEqualTypeOf<{
		id: number;
		content: string;
		ownerId: number | null;
		createdAt: Date;
	}[]>();

	expect(posts).toEqual([
		{ id: 1, ownerId: 1, content: 'Post1U.1', createdAt: date1 },
		{ id: 2, ownerId: 1, content: 'Post1U.2', createdAt: date1 },
		{ id: 3, ownerId: 1, content: 'Message1U.1', createdAt: date1 },
		{ id: 4, ownerId: 1, content: 'Message1U.2', createdAt: date1 },
		{ id: 5, ownerId: 2, content: 'Post2U.1', createdAt: date2 },
		{ id: 6, ownerId: 2, content: 'Post2U.2', createdAt: date2 },
		{ id: 7, ownerId: 2, content: 'MessageU.1', createdAt: date2 },
		{ id: 8, ownerId: 2, content: 'MessageU.2', createdAt: date2 },
	]);
});

test('[Find Many] Shortcut form placeholders in filters - column not', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	const date1 = new Date(0);
	const date2 = new Date(1000);
	const date3 = new Date(10000);

	await db.insert(postsTable).values([
		{ id: 1, ownerId: 1, content: 'Post1U.1', createdAt: date1 },
		{ id: 2, ownerId: 1, content: 'Post1U.2', createdAt: date1 },
		{ id: 3, ownerId: 1, content: 'Message1U.1', createdAt: date1 },
		{ id: 4, ownerId: 1, content: 'Message1U.2', createdAt: date1 },
		{ id: 5, ownerId: 2, content: 'Post2U.1', createdAt: date2 },
		{ id: 6, ownerId: 2, content: 'Post2U.2', createdAt: date2 },
		{ id: 7, ownerId: 2, content: 'MessageU.1', createdAt: date2 },
		{ id: 8, ownerId: 2, content: 'MessageU.2', createdAt: date2 },
		{ id: 9, ownerId: 3, content: 'Post3U.1', createdAt: date3 },
		{ id: 10, ownerId: 3, content: 'Post3U.2', createdAt: date3 },
	]);

	const query = await db.query.postsTable.findMany({
		where: {
			ownerId: {
				NOT: sql.placeholder('id'),
			},
		},
		orderBy: {
			id: 'asc',
		},
	}).prepare();

	const posts = query.execute({
		id: 3,
	}).sync();

	expectTypeOf(posts).toEqualTypeOf<{
		id: number;
		content: string;
		ownerId: number | null;
		createdAt: Date;
	}[]>();

	expect(posts).toEqual([
		{ id: 1, ownerId: 1, content: 'Post1U.1', createdAt: date1 },
		{ id: 2, ownerId: 1, content: 'Post1U.2', createdAt: date1 },
		{ id: 3, ownerId: 1, content: 'Message1U.1', createdAt: date1 },
		{ id: 4, ownerId: 1, content: 'Message1U.2', createdAt: date1 },
		{ id: 5, ownerId: 2, content: 'Post2U.1', createdAt: date2 },
		{ id: 6, ownerId: 2, content: 'Post2U.2', createdAt: date2 },
		{ id: 7, ownerId: 2, content: 'MessageU.1', createdAt: date2 },
		{ id: 8, ownerId: 2, content: 'MessageU.2', createdAt: date2 },
	]);
});

test('[Find Many] Get users filtered by posts with AND', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	const date1 = new Date(0);
	const date2 = new Date(1000);
	const date3 = new Date(10000);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1U.1', createdAt: date1 },
		{ ownerId: 1, content: 'Post1U.2', createdAt: date1 },
		{ ownerId: 1, content: 'Message1U.1', createdAt: date1 },
		{ ownerId: 1, content: 'Message1U.2', createdAt: date1 },
		{ ownerId: 1, content: 'Message1U.3', createdAt: date1 },
		{ ownerId: 2, content: 'Post2U.1', createdAt: date2 },
		{ ownerId: 2, content: 'Post2U.2', createdAt: date2 },
		{ ownerId: 2, content: 'MessageU.1', createdAt: date2 },
		{ ownerId: 2, content: 'MessageU.2', createdAt: date2 },
		{ ownerId: 3, content: 'Post3U.1', createdAt: date3 },
		{ ownerId: 3, content: 'Post3U.2', createdAt: date3 },
	]);

	const users = await db.query.usersTable.findMany({
		where: {
			AND: [{
				posts: {
					content: {
						like: 'M%',
					},
				},
			}, {
				posts: {
					ownerId: {
						ne: 2,
					},
				},
			}],
		},
		orderBy: {
			id: 'asc',
		},
	});

	expectTypeOf(users).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
	}[]>();

	expect(users).toEqual([
		{
			id: 1,
			name: 'Dan',
			verified: 0,
			invitedBy: null,
		},
	]);
});

test('[Find Many] Get users filtered by posts with OR', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	const date1 = new Date(0);
	const date2 = new Date(1000);
	const date3 = new Date(10000);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1U.1', createdAt: date1 },
		{ ownerId: 1, content: 'Post1U.2', createdAt: date1 },
		{ ownerId: 1, content: 'Message1U.1', createdAt: date1 },
		{ ownerId: 1, content: 'Message1U.2', createdAt: date1 },
		{ ownerId: 1, content: 'Message1U.3', createdAt: date1 },
		{ ownerId: 2, content: 'Post2U.1', createdAt: date2 },
		{ ownerId: 2, content: 'Post2U.2', createdAt: date2 },
		{ ownerId: 2, content: 'MessageU.1', createdAt: date2 },
		{ ownerId: 2, content: 'MessageU.2', createdAt: date2 },
		{ ownerId: 3, content: 'Post3U.1', createdAt: date3 },
		{ ownerId: 3, content: 'Post3U.2', createdAt: date3 },
	]);

	const users = await db.query.usersTable.findMany({
		where: {
			OR: [{
				posts: {
					content: {
						like: 'M%',
					},
				},
			}, {
				posts: {
					ownerId: {
						eq: 3,
					},
				},
			}],
		},
		orderBy: {
			id: 'asc',
		},
	});

	expectTypeOf(users).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
	}[]>();

	expect(users).toEqual([
		{
			id: 1,
			name: 'Dan',
			verified: 0,
			invitedBy: null,
		},
		{
			id: 2,
			name: 'Andrew',
			verified: 0,
			invitedBy: null,
		},
		{
			id: 3,
			name: 'Alex',
			verified: 0,
			invitedBy: null,
		},
	]);
});

test('[Find Many] Get users filtered by posts with NOT', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	const date1 = new Date(0);
	const date2 = new Date(1000);
	const date3 = new Date(10000);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1U.1', createdAt: date1 },
		{ ownerId: 1, content: 'Post1U.2', createdAt: date1 },
		{ ownerId: 1, content: 'Message1U.1', createdAt: date1 },
		{ ownerId: 1, content: 'Message1U.2', createdAt: date1 },
		{ ownerId: 1, content: 'Message1U.3', createdAt: date1 },
		{ ownerId: 2, content: 'Post2U.1', createdAt: date2 },
		{ ownerId: 2, content: 'Post2U.2', createdAt: date2 },
		{ ownerId: 2, content: 'MessageU.1', createdAt: date2 },
		{ ownerId: 2, content: 'MessageU.2', createdAt: date2 },
		{ ownerId: 3, content: 'Post3U.1', createdAt: date3 },
		{ ownerId: 3, content: 'Post3U.2', createdAt: date3 },
	]);

	const users = await db.query.usersTable.findMany({
		where: {
			NOT: {
				posts: {
					content: {
						like: 'M%',
					},
				},
			},
		},
		orderBy: {
			id: 'asc',
		},
	});

	expectTypeOf(users).toEqualTypeOf<{
		id: number;
		name: string;
		verified: number;
		invitedBy: number | null;
	}[]>();

	expect(users).toEqual([
		{
			id: 3,
			name: 'Alex',
			verified: 0,
			invitedBy: null,
		},
	]);
});

test('[Find Many .through] Through with uneven relation column count', async () => {
	db.insert(students).values([{
		studentId: 1,
		name: 'First',
	}, {
		studentId: 2,
		name: 'Second',
	}, {
		studentId: 3,
		name: 'Third',
	}, {
		studentId: 4,
		name: 'Fourth',
	}]).run();

	db.insert(studentGrades).values([
		{
			studentId: 1,
			courseId: 1,
			semester: 's1',
			grade: '44',
		},
		{
			studentId: 1,
			courseId: 2,
			semester: 's2',
			grade: '35',
		},
		{
			studentId: 2,
			courseId: 1,
			semester: 's1',
			grade: '58',
		},
		{
			studentId: 2,
			courseId: 3,
			semester: 's2',
			grade: '72',
		},
		{
			studentId: 3,
			courseId: 4,
			semester: 's4',
			grade: '99',
		},
		{
			studentId: 3,
			courseId: 2,
			semester: 's3',
			grade: '85',
		},
		{
			studentId: 3,
			courseId: 1,
			semester: 's2',
			grade: '48',
		},
		{
			studentId: 4,
			courseId: 3,
			semester: 's1',
			grade: '63',
		},
		{
			studentId: 4,
			courseId: 4,
			semester: 's3',
			grade: '51',
		},
	]).run();

	db.insert(courseOfferings).values([{
		courseId: 1,
		semester: 's3',
	}, {
		courseId: 2,
		semester: 's4',
	}, {
		courseId: 4,
		semester: 's1',
	}, {
		courseId: 4,
		semester: 's3',
	}, {
		courseId: 1,
		semester: 's1',
	}, {
		courseId: 1,
		semester: 's2',
	}, {
		courseId: 2,
		semester: 's1',
	}, {
		courseId: 2,
		semester: 's2',
	}, {
		courseId: 2,
		semester: 's3',
	}, {
		courseId: 3,
		semester: 's3',
	}, {
		courseId: 3,
		semester: 's4',
	}, {
		courseId: 4,
		semester: 's4',
	}, {
		courseId: 3,
		semester: 's1',
	}]).run();

	const res = db.query.students.findMany({
		with: {
			courseOfferings: {
				orderBy: {
					courseId: 'asc',
					semester: 'asc',
				},
			},
		},
		orderBy: {
			studentId: 'asc',
		},
	}).sync();

	expectTypeOf(res).toEqualTypeOf<{
		studentId: number;
		name: string;
		courseOfferings: {
			courseId: number;
			semester: string;
		}[];
	}[]>();

	expect(res).toStrictEqual([
		{
			name: 'First',
			studentId: 1,
			courseOfferings: [
				{
					courseId: 1,
					semester: 's1',
				},
				{
					courseId: 2,
					semester: 's2',
				},
			],
		},
		{
			name: 'Second',
			studentId: 2,
			courseOfferings: [
				{
					courseId: 1,
					semester: 's1',
				},
			],
		},
		{
			name: 'Third',
			studentId: 3,
			courseOfferings: [
				{
					courseId: 1,
					semester: 's2',
				},
				{
					courseId: 2,
					semester: 's3',
				},
				{
					courseId: 4,
					semester: 's4',
				},
			],
		},
		{
			name: 'Fourth',
			studentId: 4,
			courseOfferings: [
				{
					courseId: 3,
					semester: 's1',
				},
				{
					courseId: 4,
					semester: 's3',
				},
			],
		},
	]);
});

test('[Find Many .through] Through with uneven relation column count - reverse', async () => {
	db.insert(students).values([{
		studentId: 1,
		name: 'First',
	}, {
		studentId: 2,
		name: 'Second',
	}, {
		studentId: 3,
		name: 'Third',
	}, {
		studentId: 4,
		name: 'Fourth',
	}]).run();

	db.insert(studentGrades).values([
		{
			studentId: 1,
			courseId: 1,
			semester: 's1',
			grade: '44',
		},
		{
			studentId: 1,
			courseId: 2,
			semester: 's2',
			grade: '35',
		},
		{
			studentId: 2,
			courseId: 1,
			semester: 's1',
			grade: '58',
		},
		{
			studentId: 2,
			courseId: 3,
			semester: 's2',
			grade: '72',
		},
		{
			studentId: 3,
			courseId: 4,
			semester: 's4',
			grade: '99',
		},
		{
			studentId: 3,
			courseId: 2,
			semester: 's3',
			grade: '85',
		},
		{
			studentId: 3,
			courseId: 1,
			semester: 's2',
			grade: '48',
		},
		{
			studentId: 4,
			courseId: 3,
			semester: 's1',
			grade: '63',
		},
		{
			studentId: 4,
			courseId: 4,
			semester: 's3',
			grade: '51',
		},
	]).run();

	db.insert(courseOfferings).values([{
		courseId: 1,
		semester: 's3',
	}, {
		courseId: 2,
		semester: 's4',
	}, {
		courseId: 4,
		semester: 's1',
	}, {
		courseId: 4,
		semester: 's3',
	}, {
		courseId: 1,
		semester: 's1',
	}, {
		courseId: 1,
		semester: 's2',
	}, {
		courseId: 2,
		semester: 's1',
	}, {
		courseId: 2,
		semester: 's2',
	}, {
		courseId: 2,
		semester: 's3',
	}, {
		courseId: 3,
		semester: 's3',
	}, {
		courseId: 3,
		semester: 's4',
	}, {
		courseId: 4,
		semester: 's4',
	}, {
		courseId: 3,
		semester: 's1',
	}]).run();

	const res = db.query.courseOfferings.findMany({
		with: {
			students: {
				orderBy: {
					studentId: 'asc',
				},
			},
		},
		orderBy: {
			courseId: 'asc',
			semester: 'asc',
		},
	}).sync();

	expectTypeOf(res).toEqualTypeOf<{
		courseId: number;
		semester: string;
		students: {
			studentId: number;
			name: string;
		}[];
	}[]>();

	expect(res).toStrictEqual([
		{
			courseId: 1,
			semester: 's1',
			students: [
				{
					name: 'First',
					studentId: 1,
				},
				{
					name: 'Second',
					studentId: 2,
				},
			],
		},
		{
			courseId: 1,
			semester: 's2',
			students: [
				{
					name: 'Third',
					studentId: 3,
				},
			],
		},
		{
			courseId: 1,
			semester: 's3',
			students: [],
		},
		{
			courseId: 2,
			semester: 's1',
			students: [],
		},
		{
			courseId: 2,
			semester: 's2',
			students: [
				{
					name: 'First',
					studentId: 1,
				},
			],
		},
		{
			courseId: 2,
			semester: 's3',
			students: [
				{
					name: 'Third',
					studentId: 3,
				},
			],
		},
		{
			courseId: 2,
			semester: 's4',
			students: [],
		},
		{
			courseId: 3,
			semester: 's1',
			students: [
				{
					name: 'Fourth',
					studentId: 4,
				},
			],
		},
		{
			courseId: 3,
			semester: 's3',
			students: [],
		},
		{
			courseId: 3,
			semester: 's4',
			students: [],
		},
		{
			courseId: 4,
			semester: 's1',
			students: [],
		},
		{
			courseId: 4,
			semester: 's3',
			students: [
				{
					name: 'Fourth',
					studentId: 4,
				},
			],
		},
		{
			courseId: 4,
			semester: 's4',
			students: [
				{
					name: 'Third',
					studentId: 3,
				},
			],
		},
	]);
});

test('alltypes', async () => {
	db.run(sql`
		CREATE TABLE \`all_types\`(
			\`int\` integer,
			\`bool\` integer,
			\`time\` integer,
			\`time_ms\` integer,
			\`bigint\` blob,
			\`buffer\` blob,
			\`json\` blob,
			\`numeric\` numeric,
			\`numeric_num\` numeric,
			\`numeric_big\` numeric,
			\`real\` real,
			\`text\` text,
			\`json_text\` text
			);
	`);

	db.insert(usersTable).values({
		id: 1,
		name: 'First',
	}).run();

	db.insert(allTypesTable).values({
		int: 1,
		bool: true,
		bigint: 5044565289845416380n,
		buffer: Buffer.from([
			0x44,
			0x65,
			0x73,
			0x70,
			0x61,
			0x69,
			0x72,
			0x20,
			0x6F,
			0x20,
			0x64,
			0x65,
			0x73,
			0x70,
			0x61,
			0x69,
			0x72,
			0x2E,
			0x2E,
			0x2E,
		]),
		json: {
			str: 'strval',
			arr: ['str', 10],
		},
		jsonText: {
			str: 'strvalb',
			arr: ['strb', 11],
		},
		numeric: '475452353476',
		numericNum: 9007199254740991,
		numericBig: 5044565289845416380n,
		real: 1.048596,
		text: 'TEXT STRING',
		time: new Date(1741743161623),
		timeMs: new Date(1741743161623),
	}).run();

	const rawRes = await db.select().from(allTypesTable);
	const relationRootRes = await db.query.allTypesTable.findMany();
	const { alltypes: nestedRelationRes } = (await db.query.usersTable.findFirst({
		with: {
			alltypes: true,
		},
	}))!;

	expectTypeOf(relationRootRes).toEqualTypeOf(rawRes);
	expectTypeOf(nestedRelationRes).toEqualTypeOf(rawRes);

	expect(nestedRelationRes).toStrictEqual(rawRes);
	expect(relationRootRes).toStrictEqual(rawRes);

	const expectedRes = [
		{
			int: 1,
			bool: true,
			time: new Date('2025-03-12T01:32:41.000Z'),
			timeMs: new Date('2025-03-12T01:32:41.623Z'),
			bigint: 5044565289845416380n,
			buffer: Buffer.from([
				0x44,
				0x65,
				0x73,
				0x70,
				0x61,
				0x69,
				0x72,
				0x20,
				0x6F,
				0x20,
				0x64,
				0x65,
				0x73,
				0x70,
				0x61,
				0x69,
				0x72,
				0x2E,
				0x2E,
				0x2E,
			]),
			json: { str: 'strval', arr: ['str', 10] },
			numeric: '475452353476',
			numericNum: 9007199254740991,
			numericBig: 5044565289845416380n,
			real: 1.048596,
			text: 'TEXT STRING',
			jsonText: { str: 'strvalb', arr: ['strb', 11] },
		},
	];

	expect(rawRes).toStrictEqual(expectedRes);
});

test('custom types', async () => {
	db.run(sql`
		CREATE TABLE \`custom_types\` (
			\`id\` integer,
			\`big\` blob,
			\`bytes\` blob,
			\`time\` integer,
			\`int\` integer
		);
	`);

	db.insert(customTypesTable).values({
		id: 1,
		big: 5044565289845416380n,
		bytes: Buffer.from('BYTES'),
		time: new Date(1741743161623),
		int: 250,
	}).run();

	const rawRes = await db.select().from(customTypesTable);
	const relationRootRes = await db.query.customTypesTable.findMany();
	const { self: nestedRelationRes } = (await db.query.customTypesTable.findFirst({
		with: {
			self: true,
		},
	}))!;

	type ExpectedType = {
		id: number | null;
		big: bigint | null;
		bytes: Buffer | null;
		time: Date | null;
		int: number | null;
	}[];

	expectTypeOf<ExpectedType>().toEqualTypeOf(rawRes);
	expectTypeOf(relationRootRes).toEqualTypeOf(rawRes);
	expectTypeOf(nestedRelationRes).toEqualTypeOf(rawRes);

	expect(nestedRelationRes).toStrictEqual(rawRes);
	expect(relationRootRes).toStrictEqual(rawRes);

	const expectedRes: ExpectedType = [
		{
			id: 1,
			big: 5044565289845416380n,
			bytes: Buffer.from('BYTES'),
			time: new Date(1741743161623),
			int: 250,
		},
	];

	expect(rawRes).toStrictEqual(expectedRes);
});

test('.toSQL()', () => {
	const query = db.query.usersTable.findFirst().toSQL();

	expect(query).toHaveProperty('sql', expect.any(String));
	expect(query).toHaveProperty('params', expect.any(Array));
});
