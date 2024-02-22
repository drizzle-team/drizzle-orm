import 'dotenv/config';
import Database from 'better-sqlite3';
import { desc, DrizzleError, eq, gt, gte, or, placeholder, sql, TransactionRollbackError } from 'drizzle-orm';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeAll, beforeEach, expect, expectTypeOf, test } from 'vitest';
import * as schemaTables from './sqlite.schema.ts';
import * as schema from './sqlite.view.schema.ts';

const { usersView, postsView, usersToGroupsView, groupsView } = schema;
const { usersTable, postsTable, commentsTable, usersToGroupsTable, groupsTable } = schemaTables;

const ENABLE_LOGGING = false;

/*
	Test cases:
	- querying nested relation without PK with additional fields
*/

let db: BetterSQLite3Database<typeof schema>;

beforeAll(() => {
	const dbPath = process.env['SQLITE_DB_PATH'] ?? ':memory:';

	db = drizzle(new Database(dbPath), { schema, logger: ENABLE_LOGGING });
});

beforeEach(() => {
	db.run(sql`drop table if exists \`groups\``);
	db.run(sql`drop table if exists \`users\``);
	db.run(sql`drop table if exists \`users_to_groups\``);
	db.run(sql`drop table if exists \`posts\``);
	db.run(sql`drop table if exists \`comments\``);
	db.run(sql`drop table if exists \`comment_likes\``);
	db.run(sql`drop view if exists \`users_view\``);
	db.run(sql`drop view if exists \`groups_view\``);
	db.run(sql`drop view if exists \`users_to_groups_view\``);
	db.run(sql`drop view if exists \`posts_view\``);
	db.run(sql`drop view if exists \`comments_view\``);
	db.run(sql`drop view if exists \`comment_likes_view\``);

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
		sql`CREATE VIEW \`users_view\` as select \`id\`, \`name\`, \`invited_by\` from \`users\``,
	);
	db.run(
		sql`CREATE VIEW \`groups_view\` as select \`id\`, \`name\`, \`description\` from \`groups\``,
	);
	db.run(
		sql`CREATE VIEW \`users_to_groups_view\` as select \`id\`, \`user_id\`, \`group_id\` from \`users_to_groups\``,
	);
	db.run(
		sql`CREATE VIEW \`posts_view\` as select \`id\`, \`content\`, \`owner_id\` from \`posts\``,
	);
	db.run(
		sql`CREATE VIEW \`comments_view\` as select \`id\`, \`content\`, \`creator\`, \`post_id\` from \`comments\``,
	);
	db.run(
		sql`CREATE VIEW \`comment_likes_view\` as select \`id\`, \`creator\`, \`comment_id\` from \`comment_likes\``,
	);
});

/*
	[Find Many] One relation users+posts
*/

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

	const usersWithPosts = db.query.usersView.findMany({
		with: {
			posts: true,
		},
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
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
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1' }],
	});
	expect(usersWithPosts[1]).toEqual({
		id: 2,
		name: 'Andrew',
		invitedBy: null,
		posts: [{ id: 2, ownerId: 2, content: 'Post2' }],
	});
	expect(usersWithPosts[2]).toEqual({
		id: 3,
		name: 'Alex',
		invitedBy: null,
		posts: [{ id: 3, ownerId: 3, content: 'Post3' }],
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

	const usersWithPosts = db.query.usersView.findMany({
		with: {
			posts: {
				limit: 1,
			},
		},
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
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
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1' }],
	});
	expect(usersWithPosts[1]).toEqual({
		id: 2,
		name: 'Andrew',
		invitedBy: null,
		posts: [{ id: 4, ownerId: 2, content: 'Post2' }],
	});
	expect(usersWithPosts[2]).toEqual({
		id: 3,
		name: 'Alex',
		invitedBy: null,
		posts: [{ id: 6, ownerId: 3, content: 'Post3' }],
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

	const usersWithPosts = db.query.usersView.findMany({
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
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
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
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1' }],
	});
	expect(usersWithPosts[1]).toEqual({
		id: 2,
		name: 'Andrew',
		invitedBy: null,
		posts: [{ id: 4, ownerId: 2, content: 'Post2' }],
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

	const usersWithPosts = db.query.usersView.findMany({
		with: {
			posts: true,
		},
		extras: ({ name }) => ({
			lowerName: sql<string>`lower(${name})`.as('name_lower'),
		}),
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		invitedBy: number | null;
		lowerName: string;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
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
		invitedBy: null,
		lowerName: 'dan',
		posts: [{ id: 1, ownerId: 1, content: 'Post1' }, {
			id: 2,
			ownerId: 1,
			content: 'Post1.2',
		}, { id: 3, ownerId: 1, content: 'Post1.3' }],
	});
	expect(usersWithPosts[1]).toEqual({
		id: 2,
		name: 'Andrew',
		lowerName: 'andrew',
		invitedBy: null,
		posts: [{ id: 4, ownerId: 2, content: 'Post2' }, {
			id: 5,
			ownerId: 2,
			content: 'Post2.1',
		}],
	});
	expect(usersWithPosts[2]).toEqual({
		id: 3,
		name: 'Alex',
		lowerName: 'alex',
		invitedBy: null,
		posts: [{ id: 6, ownerId: 3, content: 'Post3' }, {
			id: 7,
			ownerId: 3,
			content: 'Post3.1',
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

	const usersWithPosts = db.query.usersView.findMany({
		limit: 1,
		with: {
			posts: {
				limit: 1,
			},
		},
		extras: (usersView, { sql }) => ({
			lowerName: sql<string>`lower(${usersView.name})`.as('name_lower'),
		}),
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		invitedBy: number | null;
		lowerName: string;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
		}[];
	}[]>();

	expect(usersWithPosts.length).toEqual(1);
	expect(usersWithPosts[0]?.posts.length).toEqual(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		name: 'Dan',
		lowerName: 'dan',
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1' }],
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

	const usersWithPosts = db.query.usersView.findMany({
		with: {
			posts: {
				orderBy: (postsView, { desc }) => [desc(postsView.content)],
			},
		},
		orderBy: (usersView, { desc }) => [desc(usersView.id)],
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
		}[];
	}[]>();

	expect(usersWithPosts[0]).toEqual({
		id: 3,
		name: 'Alex',
		invitedBy: null,
		posts: expect.anything(),
	});

	expect(usersWithPosts[0]!.posts).toEqual([
		{ id: 7, ownerId: 3, content: '7' },
		{ id: 6, ownerId: 3, content: '6' },
	]);

	expect(usersWithPosts[1]).toEqual({
		id: 2,
		name: 'Andrew',
		invitedBy: null,
		posts: expect.anything(),
	});

	expect(usersWithPosts[1]!.posts).toEqual([
		{ id: 5, ownerId: 2, content: '5' },
		{ id: 4, ownerId: 2, content: '4' },
	]);

	expect(usersWithPosts[2]).toEqual({
		id: 1,
		name: 'Dan',
		invitedBy: null,
		posts: expect.anything(),
	});

	expect(usersWithPosts[2]!.posts).toEqual([
		{ id: 3, ownerId: 1, content: '3' },
		{ id: 2, ownerId: 1, content: '2' },
		{ id: 1, ownerId: 1, content: '1' },
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

	const usersWithPosts = db.query.usersView.findMany({
		where: (({ id }, { eq }) => eq(id, 1)),
		with: {
			posts: {
				where: (({ id }, { eq }) => eq(id, 1)),
			},
		},
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
		}[];
	}[]>();

	expect(usersWithPosts.length).eq(1);
	expect(usersWithPosts[0]?.posts.length).eq(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		name: 'Dan',
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1' }],
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

	const usersWithPosts = db.query.usersView.findMany({
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
				where: (({ id }, { eq }) => eq(id, 1)),
			},
		},
		where: (({ id }, { eq }) => eq(id, 1)),
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

	const usersWithPosts = db.query.usersView.findMany({
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
				where: (({ id }, { eq }) => eq(id, 1)),
			},
		},
		where: (({ id }, { eq }) => eq(id, 1)),
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

	const usersWithPosts = db.query.usersView.findMany({
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
				where: (({ id }, { eq }) => eq(id, 1)),
			},
		},
		where: (({ id }, { eq }) => eq(id, 1)),
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

	const usersWithPosts = db.query.usersView.findMany({
		columns: {
			name: false,
		},
		with: {
			posts: {
				columns: {
					content: false,
				},
				where: (({ id }, { eq }) => eq(id, 1)),
			},
		},
		where: (({ id }, { eq }) => eq(id, 1)),
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		invitedBy: number | null;
		posts: {
			id: number;
			ownerId: number | null;
		}[];
	}[]>();

	expect(usersWithPosts.length).eq(1);
	expect(usersWithPosts[0]?.posts.length).eq(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1 }],
	});
});

test('[Find Many] Get users with posts in transaction', () => {
	let usersWithPosts: {
		id: number;
		name: string;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
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

		usersWithPosts = tx.query.usersView.findMany({
			where: (({ id }, { eq }) => eq(id, 1)),
			with: {
				posts: {
					where: (({ id }, { eq }) => eq(id, 1)),
				},
			},
		}).sync();
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
		}[];
	}[]>();

	expect(usersWithPosts.length).eq(1);
	expect(usersWithPosts[0]?.posts.length).eq(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		name: 'Dan',
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1' }],
	});
});

test('[Find Many] Get users with posts in rollbacked transaction', () => {
	let usersWithPosts: {
		id: number;
		name: string;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
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

			usersWithPosts = tx.query.usersView.findMany({
				where: (({ id }, { eq }) => eq(id, 1)),
				with: {
					posts: {
						where: (({ id }, { eq }) => eq(id, 1)),
					},
				},
			}).sync();
		})
	).toThrow(TransactionRollbackError);

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
		}[];
	}[]>();

	expect(usersWithPosts.length).eq(0);
});

// select only custom
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

	const usersWithPosts = db.query.usersView.findMany({
		columns: {},
		with: {
			posts: {
				columns: {},
				extras: ({ content }) => ({
					lowerName: sql<string>`lower(${content})`.as('content_lower'),
				}),
			},
		},
		extras: ({ name }) => ({
			lowerName: sql<string>`lower(${name})`.as('name_lower'),
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

	const usersWithPosts = db.query.usersView.findMany({
		columns: {},
		with: {
			posts: {
				columns: {},
				where: gte(postsView.id, 2),
				extras: ({ content }) => ({
					lowerName: sql<string>`lower(${content})`.as('content_lower'),
				}),
			},
		},
		where: eq(usersView.id, 1),
		extras: ({ name }) => ({
			lowerName: sql<string>`lower(${name})`.as('name_lower'),
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

	const usersWithPosts = db.query.usersView.findMany({
		columns: {},
		with: {
			posts: {
				columns: {},
				where: gte(postsView.id, 2),
				limit: 1,
				extras: ({ content }) => ({
					lowerName: sql<string>`lower(${content})`.as('content_lower'),
				}),
			},
		},
		where: eq(usersView.id, 1),
		extras: ({ name }) => ({
			lowerName: sql<string>`lower(${name})`.as('name_lower'),
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

	const usersWithPosts = db.query.usersView.findMany({
		columns: {},
		with: {
			posts: {
				columns: {},
				where: gte(postsView.id, 2),
				orderBy: [desc(postsView.id)],
				extras: ({ content }) => ({
					lowerName: sql<string>`lower(${content})`.as('content_lower'),
				}),
			},
		},
		where: eq(usersView.id, 1),
		extras: ({ name }) => ({
			lowerName: sql<string>`lower(${name})`.as('name_lower'),
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

// select only custom find one
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

	const usersWithPosts = db.query.usersView.findFirst({
		columns: {},
		with: {
			posts: {
				columns: {},
				extras: ({ content }) => ({
					lowerName: sql<string>`lower(${content})`.as('content_lower'),
				}),
			},
		},
		extras: ({ name }) => ({
			lowerName: sql<string>`lower(${name})`.as('name_lower'),
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

	const usersWithPosts = db.query.usersView.findFirst({
		columns: {},
		with: {
			posts: {
				columns: {},
				where: gte(postsView.id, 2),
				extras: ({ content }) => ({
					lowerName: sql<string>`lower(${content})`.as('content_lower'),
				}),
			},
		},
		where: eq(usersView.id, 1),
		extras: ({ name }) => ({
			lowerName: sql<string>`lower(${name})`.as('name_lower'),
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

	const usersWithPosts = db.query.usersView.findFirst({
		columns: {},
		with: {
			posts: {
				columns: {},
				where: gte(postsView.id, 2),
				limit: 1,
				extras: ({ content }) => ({
					lowerName: sql<string>`lower(${content})`.as('content_lower'),
				}),
			},
		},
		where: eq(usersView.id, 1),
		extras: ({ name }) => ({
			lowerName: sql<string>`lower(${name})`.as('name_lower'),
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

	const usersWithPosts = db.query.usersView.findFirst({
		columns: {},
		with: {
			posts: {
				columns: {},
				where: gte(postsView.id, 2),
				orderBy: [desc(postsView.id)],
				extras: ({ content }) => ({
					lowerName: sql<string>`lower(${content})`.as('content_lower'),
				}),
			},
		},
		where: eq(usersView.id, 1),
		extras: ({ name }) => ({
			lowerName: sql<string>`lower(${name})`.as('name_lower'),
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

// columns {}
test('[Find Many] Get select {}', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	expect(() =>
		db.query.usersView.findMany({
			columns: {},
		}).sync()
	).toThrow(DrizzleError);
});

// columns {}
test('[Find One] Get select {}', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]).run();

	expect(() =>
		db.query.usersView.findFirst({
			columns: {},
		}).sync()
	).toThrow(DrizzleError);
});

// deep select {}
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
		db.query.usersView.findMany({
			columns: {},
			with: {
				posts: {
					columns: {},
				},
			},
		}).sync()
	).toThrow(DrizzleError);
});

// deep select {}
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
		db.query.usersView.findFirst({
			columns: {},
			with: {
				posts: {
					columns: {},
				},
			},
		}).sync()
	).toThrow(DrizzleError);
});

/*
	Prepared statements for users+posts
*/
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

	const prepared = db.query.usersView.findMany({
		with: {
			posts: {
				limit: placeholder('limit'),
			},
		},
	}).prepare();

	const usersWithPosts = prepared.execute({ limit: 1 }).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
		}[];
	}[]>();

	expect(usersWithPosts.length).eq(3);
	expect(usersWithPosts[0]?.posts.length).eq(1);
	expect(usersWithPosts[1]?.posts.length).eq(1);
	expect(usersWithPosts[2]?.posts.length).eq(1);

	expect(usersWithPosts).toContainEqual({
		id: 1,
		name: 'Dan',
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1' }],
	});
	expect(usersWithPosts).toContainEqual({
		id: 2,
		name: 'Andrew',
		invitedBy: null,
		posts: [{ id: 4, ownerId: 2, content: 'Post2' }],
	});
	expect(usersWithPosts).toContainEqual({
		id: 3,
		name: 'Alex',
		invitedBy: null,
		posts: [{ id: 6, ownerId: 3, content: 'Post3' }],
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

	const prepared = db.query.usersView.findMany({
		limit: placeholder('uLimit'),
		offset: placeholder('uOffset'),
		with: {
			posts: {
				limit: placeholder('pLimit'),
			},
		},
	}).prepare();

	const usersWithPosts = prepared.execute({ pLimit: 1, uLimit: 3, uOffset: 1 }).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
		}[];
	}[]>();

	expect(usersWithPosts.length).eq(2);
	expect(usersWithPosts[0]?.posts.length).eq(1);
	expect(usersWithPosts[1]?.posts.length).eq(1);

	expect(usersWithPosts).toContainEqual({
		id: 2,
		name: 'Andrew',
		invitedBy: null,
		posts: [{ id: 4, ownerId: 2, content: 'Post2' }],
	});
	expect(usersWithPosts).toContainEqual({
		id: 3,
		name: 'Alex',
		invitedBy: null,
		posts: [{ id: 6, ownerId: 3, content: 'Post3' }],
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

	const prepared = db.query.usersView.findMany({
		where: (({ id }, { eq }) => eq(id, placeholder('id'))),
		with: {
			posts: {
				where: (({ id }, { eq }) => eq(id, 1)),
			},
		},
	}).prepare();

	const usersWithPosts = prepared.execute({ id: 1 }).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
		}[];
	}[]>();

	expect(usersWithPosts.length).eq(1);
	expect(usersWithPosts[0]?.posts.length).eq(1);

	expect(usersWithPosts[0]).toEqual({
		id: 1,
		name: 'Dan',
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1' }],
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

	const prepared = db.query.usersView.findMany({
		limit: placeholder('uLimit'),
		offset: placeholder('uOffset'),
		where: (({ id }, { eq, or }) => or(eq(id, placeholder('id')), eq(id, 3))),
		with: {
			posts: {
				where: (({ id }, { eq }) => eq(id, placeholder('pid'))),
				limit: placeholder('pLimit'),
			},
		},
	}).prepare();

	const usersWithPosts = prepared.execute({ pLimit: 1, uLimit: 3, uOffset: 1, id: 2, pid: 6 }).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
		}[];
	}[]>();

	expect(usersWithPosts.length).eq(1);
	expect(usersWithPosts[0]?.posts.length).eq(1);

	expect(usersWithPosts).toContainEqual({
		id: 3,
		name: 'Alex',
		invitedBy: null,
		posts: [{ id: 6, ownerId: 3, content: 'Post3' }],
	});
});

/*
	[Find One] One relation users+posts
*/

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

	const usersWithPosts = db.query.usersView.findFirst({
		with: {
			posts: true,
		},
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			name: string;
			invitedBy: number | null;
			posts: {
				id: number;
				content: string;
				ownerId: number | null;
			}[];
		} | undefined
	>();

	expect(usersWithPosts!.posts.length).eq(1);

	expect(usersWithPosts).toEqual({
		id: 1,
		name: 'Dan',
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1' }],
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

	const usersWithPosts = db.query.usersView.findFirst({
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
			invitedBy: number | null;
			posts: {
				id: number;
				content: string;
				ownerId: number | null;
			}[];
		} | undefined
	>();

	expect(usersWithPosts!.posts.length).eq(1);

	expect(usersWithPosts).toEqual({
		id: 1,
		name: 'Dan',
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1' }],
	});
});

test('[Find One] Get users with posts no results found', () => {
	const usersWithPosts = db.query.usersView.findFirst({
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
			invitedBy: number | null;
			posts: {
				id: number;
				content: string;
				ownerId: number | null;
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

	const usersWithPosts = db.query.usersView.findFirst({
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
			invitedBy: number | null;
			posts: {
				id: number;
				content: string;
				ownerId: number | null;
			}[];
		} | undefined
	>();

	expect(usersWithPosts!.posts.length).eq(1);

	expect(usersWithPosts).toEqual({
		id: 1,
		name: 'Dan',
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1' }],
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

	const usersWithPosts = db.query.usersView.findFirst({
		with: {
			posts: true,
		},
		extras: ({ name }) => ({
			lowerName: sql<string>`lower(${name})`.as('name_lower'),
		}),
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			name: string;
			invitedBy: number | null;
			lowerName: string;
			posts: {
				id: number;
				content: string;
				ownerId: number | null;
			}[];
		} | undefined
	>();

	expect(usersWithPosts!.posts.length).toEqual(3);

	expect(usersWithPosts?.lowerName).toEqual('dan');
	expect(usersWithPosts?.id).toEqual(1);
	expect(usersWithPosts?.invitedBy).toEqual(null);
	expect(usersWithPosts?.name).toEqual('Dan');

	expect(usersWithPosts?.posts).toContainEqual({
		id: 1,
		ownerId: 1,
		content: 'Post1',
	});

	expect(usersWithPosts?.posts).toContainEqual({
		id: 2,
		ownerId: 1,
		content: 'Post1.2',
	});

	expect(usersWithPosts?.posts).toContainEqual({
		id: 3,
		ownerId: 1,
		content: 'Post1.3',
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

	const usersWithPosts = db.query.usersView.findFirst({
		with: {
			posts: {
				limit: 1,
			},
		},
		extras: (usersView, { sql }) => ({
			lowerName: sql<string>`lower(${usersView.name})`.as('name_lower'),
		}),
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			name: string;
			invitedBy: number | null;
			lowerName: string;
			posts: {
				id: number;
				content: string;
				ownerId: number | null;
			}[];
		} | undefined
	>();

	expect(usersWithPosts!.posts.length).toEqual(1);

	expect(usersWithPosts).toEqual({
		id: 1,
		name: 'Dan',
		lowerName: 'dan',
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1' }],
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

	const usersWithPosts = db.query.usersView.findFirst({
		with: {
			posts: {
				orderBy: (postsView, { desc }) => [desc(postsView.id)],
			},
		},
		orderBy: (usersView, { desc }) => [desc(usersView.id)],
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			name: string;
			invitedBy: number | null;
			posts: {
				id: number;
				content: string;
				ownerId: number | null;
			}[];
		} | undefined
	>();

	expect(usersWithPosts!.posts.length).eq(2);

	expect(usersWithPosts).toEqual({
		id: 3,
		name: 'Alex',
		invitedBy: null,
		posts: [{
			id: 7,
			ownerId: 3,
			content: '7',
		}, { id: 6, ownerId: 3, content: '6' }],
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

	const usersWithPosts = db.query.usersView.findFirst({
		where: (({ id }, { eq }) => eq(id, 1)),
		with: {
			posts: {
				where: (({ id }, { eq }) => eq(id, 1)),
			},
		},
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			name: string;
			invitedBy: number | null;
			posts: {
				id: number;
				content: string;
				ownerId: number | null;
			}[];
		} | undefined
	>();

	expect(usersWithPosts!.posts.length).eq(1);

	expect(usersWithPosts).toEqual({
		id: 1,
		name: 'Dan',
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1' }],
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

	const usersWithPosts = db.query.usersView.findFirst({
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
				where: (({ id }, { eq }) => eq(id, 1)),
			},
		},
		where: (({ id }, { eq }) => eq(id, 1)),
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

	const usersWithPosts = db.query.usersView.findFirst({
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
				where: (({ id }, { eq }) => eq(id, 1)),
			},
		},
		where: (({ id }, { eq }) => eq(id, 1)),
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

	const usersWithPosts = db.query.usersView.findFirst({
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
				where: (({ id }, { eq }) => eq(id, 1)),
			},
		},
		where: (({ id }, { eq }) => eq(id, 1)),
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

	const usersWithPosts = db.query.usersView.findFirst({
		columns: {
			name: false,
		},
		with: {
			posts: {
				columns: {
					content: false,
				},
				where: (({ id }, { eq }) => eq(id, 1)),
			},
		},
		where: (({ id }, { eq }) => eq(id, 1)),
	}).sync();

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			invitedBy: number | null;
			posts: {
				id: number;
				ownerId: number | null;
			}[];
		} | undefined
	>();

	expect(usersWithPosts!.posts.length).eq(1);

	expect(usersWithPosts).toEqual({
		id: 1,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1 }],
	});
});

/*
	One relation users+users. Self referencing
*/

test('Get user with invitee', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]).run();

	const usersWithInvitee = db.query.usersView.findMany({
		with: {
			invitee: true,
		},
	}).sync();

	expectTypeOf(usersWithInvitee).toEqualTypeOf<
		{
			id: number;
			name: string;
			invitedBy: number | null;
			invitee: {
				id: number;
				name: string;
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
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[1]).toEqual({
		id: 2,
		name: 'Andrew',
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[2]).toEqual({
		id: 3,
		name: 'Alex',
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', invitedBy: null },
	});
	expect(usersWithInvitee[3]).toEqual({
		id: 4,
		name: 'John',
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', invitedBy: null },
	});
});

test('Get user + limit with invitee', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew', invitedBy: 1 },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]).run();

	const usersWithInvitee = db.query.usersView.findMany({
		with: {
			invitee: true,
		},
		limit: 2,
	}).sync();

	expectTypeOf(usersWithInvitee).toEqualTypeOf<
		{
			id: number;
			name: string;
			invitedBy: number | null;
			invitee: {
				id: number;
				name: string;
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
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[1]).toEqual({
		id: 2,
		name: 'Andrew',
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', invitedBy: null },
	});
});

test('Get user with invitee and custom fields', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]).run();

	const usersWithInvitee = db.query.usersView.findMany({
		extras: (users, { sql }) => ({ lower: sql<string>`lower(${users.name})`.as('lower_name') }),
		with: {
			invitee: {
				extras: (invitee, { sql }) => ({ lower: sql<string>`lower(${invitee.name})`.as('lower_name') }),
			},
		},
	}).sync();

	expectTypeOf(usersWithInvitee).toEqualTypeOf<
		{
			id: number;
			name: string;
			lower: string;
			invitedBy: number | null;
			invitee: {
				id: number;
				name: string;
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
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[1]).toEqual({
		id: 2,
		name: 'Andrew',
		lower: 'andrew',
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[2]).toEqual({
		id: 3,
		name: 'Alex',
		lower: 'alex',
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', lower: 'dan', invitedBy: null },
	});
	expect(usersWithInvitee[3]).toEqual({
		id: 4,
		name: 'John',
		lower: 'john',
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', lower: 'andrew', invitedBy: null },
	});
});

test('Get user with invitee and custom fields + limits', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]).run();

	const usersWithInvitee = db.query.usersView.findMany({
		extras: (users, { sql }) => ({ lower: sql<string>`lower(${users.name})`.as('lower_name') }),
		limit: 3,
		with: {
			invitee: {
				extras: (invitee, { sql }) => ({ lower: sql<string>`lower(${invitee.name})`.as('lower_name') }),
			},
		},
	}).sync();

	expectTypeOf(usersWithInvitee).toEqualTypeOf<
		{
			id: number;
			name: string;
			lower: string;
			invitedBy: number | null;
			invitee: {
				id: number;
				name: string;
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
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[1]).toEqual({
		id: 2,
		name: 'Andrew',
		lower: 'andrew',
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[2]).toEqual({
		id: 3,
		name: 'Alex',
		lower: 'alex',
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', lower: 'dan', invitedBy: null },
	});
});

test('Get user with invitee + order by', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]).run();

	const usersWithInvitee = db.query.usersView.findMany({
		orderBy: (users, { desc }) => [desc(users.id)],
		with: {
			invitee: true,
		},
	}).sync();

	expectTypeOf(usersWithInvitee).toEqualTypeOf<
		{
			id: number;
			name: string;
			invitedBy: number | null;
			invitee: {
				id: number;
				name: string;
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
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[2]).toEqual({
		id: 2,
		name: 'Andrew',
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[1]).toEqual({
		id: 3,
		name: 'Alex',
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', invitedBy: null },
	});
	expect(usersWithInvitee[0]).toEqual({
		id: 4,
		name: 'John',
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', invitedBy: null },
	});
});

test('Get user with invitee + where', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]).run();

	const usersWithInvitee = db.query.usersView.findMany({
		where: (users, { eq, or }) => (or(eq(users.id, 3), eq(users.id, 4))),
		with: {
			invitee: true,
		},
	}).sync();

	expectTypeOf(usersWithInvitee).toEqualTypeOf<
		{
			id: number;
			name: string;
			invitedBy: number | null;
			invitee: {
				id: number;
				name: string;
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
		invitee: { id: 1, name: 'Dan', invitedBy: null },
	});
	expect(usersWithInvitee).toContainEqual({
		id: 4,
		name: 'John',
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', invitedBy: null },
	});
});

test('Get user with invitee + where + partial', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]).run();

	const usersWithInvitee = db.query.usersView.findMany({
		where: (users, { eq, or }) => (or(eq(users.id, 3), eq(users.id, 4))),
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

	const usersWithInvitee = db.query.usersView.findMany({
		where: (users, { eq, or }) => (or(eq(users.id, 3), eq(users.id, 4))),
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

	const usersWithInvitee = db.query.usersView.findMany({
		where: (users, { eq, or }) => (or(eq(users.id, 3), eq(users.id, 4))),
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

test('Get user with invitee + where + partial(false)', () => {
	db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]).run();

	const usersWithInvitee = db.query.usersView.findMany({
		where: (users, { eq, or }) => (or(eq(users.id, 3), eq(users.id, 4))),
		columns: {
			id: false,
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
			name: string;
			invitedBy: number | null;
			invitee: {
				id: number;
				invitedBy: number | null;
			} | null;
		}[]
	>();

	expect(usersWithInvitee.length).eq(2);
	expect(usersWithInvitee[0]?.invitee).not.toBeNull();
	expect(usersWithInvitee[1]?.invitee).not.toBeNull();

	expect(usersWithInvitee).toContainEqual({
		name: 'Alex',
		invitedBy: 1,
		invitee: { id: 1, invitedBy: null },
	});
	expect(usersWithInvitee).toContainEqual({
		name: 'John',
		invitedBy: 2,
		invitee: { id: 2, invitedBy: null },
	});
});

/*
	Two first-level relations users+users and users+posts
*/

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

	const response = db.query.usersView.findMany({
		with: {
			invitee: true,
			posts: true,
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			invitedBy: number | null;
			posts: { id: number; ownerId: number | null; content: string }[];
			invitee: {
				id: number;
				name: string;
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
		invitedBy: null,
		invitee: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1' }],
	});
	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		invitedBy: null,
		invitee: null,
		posts: [{ id: 2, ownerId: 2, content: 'Post2' }],
	});
	expect(response).toContainEqual({
		id: 3,
		name: 'Alex',
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', invitedBy: null },
		posts: [{ id: 3, ownerId: 3, content: 'Post3' }],
	});
	expect(response).toContainEqual({
		id: 4,
		name: 'John',
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', invitedBy: null },
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

	const response = db.query.usersView.findMany({
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
			invitedBy: number | null;
			posts: { id: number; ownerId: number | null; content: string }[];
			invitee: {
				id: number;
				name: string;
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
		invitedBy: null,
		invitee: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1' }],
	});
	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		invitedBy: null,
		invitee: null,
		posts: [{ id: 3, ownerId: 2, content: 'Post2' }],
	});
	expect(response).toContainEqual({
		id: 3,
		name: 'Alex',
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', invitedBy: null },
		posts: [{ id: 5, ownerId: 3, content: 'Post3' }],
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

	const response = db.query.usersView.findMany({
		limit: 3,
		extras: (users, { sql }) => ({ lower: sql<string>`lower(${users.name})`.as('lower_name') }),
		with: {
			invitee: {
				extras: (users, { sql }) => ({ lower: sql<string>`lower(${users.name})`.as('lower_invitee_name') }),
			},
			posts: {
				limit: 1,
				extras: (posts, { sql }) => ({ lower: sql<string>`lower(${posts.content})`.as('lower_content') }),
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			lower: string;
			invitedBy: number | null;
			posts: { id: number; lower: string; ownerId: number | null; content: string }[];
			invitee: {
				id: number;
				name: string;
				lower: string;
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
		invitedBy: null,
		invitee: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', lower: 'post1' }],
	});
	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		lower: 'andrew',
		invitedBy: null,
		invitee: null,
		posts: [{ id: 3, ownerId: 2, content: 'Post2', lower: 'post2' }],
	});
	expect(response).toContainEqual({
		id: 3,
		name: 'Alex',
		lower: 'alex',
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', lower: 'dan', invitedBy: null },
		posts: [{ id: 5, ownerId: 3, content: 'Post3', lower: 'post3' }],
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

	const response = db.query.usersView.findMany({
		extras: (users, { sql }) => ({ lower: sql<string>`lower(${users.name})`.as('lower_name') }),
		with: {
			invitee: {
				extras: (users, { sql }) => ({ lower: sql<string>`lower(${users.name})`.as('lower_name') }),
			},
			posts: {
				extras: (posts, { sql }) => ({ lower: sql<string>`lower(${posts.content})`.as('lower_name') }),
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			lower: string;
			invitedBy: number | null;
			posts: { id: number; lower: string; ownerId: number | null; content: string }[];
			invitee: {
				id: number;
				name: string;
				lower: string;
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
		invitedBy: null,
		invitee: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', lower: 'post1' }, {
			id: 2,
			ownerId: 1,
			content: 'Post1.1',
			lower: 'post1.1',
		}],
	});
	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		lower: 'andrew',
		invitedBy: null,
		invitee: null,
		posts: [{ id: 3, ownerId: 2, content: 'Post2', lower: 'post2' }, {
			id: 4,
			ownerId: 2,
			content: 'Post2.1',
			lower: 'post2.1',
		}],
	});
	expect(response).toContainEqual({
		id: 3,
		name: 'Alex',
		lower: 'alex',
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', lower: 'dan', invitedBy: null },
		posts: [{ id: 5, ownerId: 3, content: 'Post3', lower: 'post3' }, {
			id: 6,
			ownerId: 3,
			content: 'Post3.1',
			lower: 'post3.1',
		}],
	});
	expect(response).toContainEqual({
		id: 4,
		name: 'John',
		lower: 'john',
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', lower: 'andrew', invitedBy: null },
		posts: [],
	});
});

// TODO Check order
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

	const response = db.query.usersView.findMany({
		orderBy: (users, { desc }) => [desc(users.id)],
		with: {
			invitee: true,
			posts: {
				orderBy: (posts, { desc }) => [desc(posts.id)],
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			invitedBy: number | null;
			posts: { id: number; ownerId: number | null; content: string }[];
			invitee: {
				id: number;
				name: string;
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
		invitedBy: null,
		invitee: null,
		posts: [{ id: 2, ownerId: 1, content: 'Post1.1' }, {
			id: 1,
			ownerId: 1,
			content: 'Post1',
		}],
	});
	expect(response[2]).toEqual({
		id: 2,
		name: 'Andrew',
		invitedBy: null,
		invitee: null,
		posts: [{ id: 4, ownerId: 2, content: 'Post2.1' }, {
			id: 3,
			ownerId: 2,
			content: 'Post2',
		}],
	});
	expect(response[1]).toEqual({
		id: 3,
		name: 'Alex',
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', invitedBy: null },
		posts: [{
			id: 5,
			ownerId: 3,
			content: 'Post3',
		}],
	});
	expect(response[0]).toEqual({
		id: 4,
		name: 'John',

		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', invitedBy: null },
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

	const response = db.query.usersView.findMany({
		where: (users, { eq, or }) => (or(eq(users.id, 2), eq(users.id, 3))),
		with: {
			invitee: true,
			posts: {
				where: (posts, { eq }) => (eq(posts.ownerId, 2)),
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;

			invitedBy: number | null;
			posts: { id: number; ownerId: number | null; content: string }[];
			invitee: {
				id: number;
				name: string;

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

		invitedBy: null,
		invitee: null,
		posts: [{ id: 2, ownerId: 2, content: 'Post2' }],
	});
	expect(response).toContainEqual({
		id: 3,
		name: 'Alex',

		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', invitedBy: null },
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

	const response = db.query.usersView.findMany({
		where: (users, { eq, or }) => (or(eq(users.id, 3), eq(users.id, 4))),
		limit: 1,
		with: {
			invitee: true,
			posts: {
				where: (posts, { eq }) => (eq(posts.ownerId, 3)),
				limit: 1,
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;

			invitedBy: number | null;
			posts: { id: number; ownerId: number | null; content: string }[];
			invitee: {
				id: number;
				name: string;

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

		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', invitedBy: null },
		posts: [{ id: 5, ownerId: 3, content: 'Post3' }],
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

	const response = db.query.usersView.findMany({
		orderBy: [desc(usersView.id)],
		where: or(eq(usersView.id, 3), eq(usersTable.id, 4)),
		extras: {
			lower: sql<string>`lower(${usersView.name})`.as('lower_name'),
		},
		with: {
			invitee: true,
			posts: {
				where: eq(postsView.ownerId, 3),
				orderBy: [desc(postsView.id)],
				extras: {
					lower: sql<string>`lower(${postsView.content})`.as('lower_name'),
				},
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;

			invitedBy: number | null;
			lower: string;
			posts: { id: number; lower: string; ownerId: number | null; content: string }[];
			invitee: {
				id: number;
				name: string;

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

		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', invitedBy: null },
		posts: [{
			id: 5,
			ownerId: 3,
			content: 'Post3',
			lower: 'post3',
		}],
	});
	expect(response[0]).toEqual({
		id: 4,
		name: 'John',
		lower: 'john',

		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', invitedBy: null },
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

	const response = db.query.usersView.findMany({
		orderBy: [desc(usersView.id)],
		where: or(eq(usersView.id, 3), eq(usersView.id, 4)),
		extras: {
			lower: sql<string>`lower(${usersView.name})`.as('lower_name'),
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
				extras: {
					lower: sql<string>`lower(${usersView.name})`.as('lower_name'),
				},
			},
			posts: {
				columns: {
					id: true,
					content: true,
				},
				where: eq(postsView.ownerId, 3),
				orderBy: [desc(postsView.id)],
				extras: {
					lower: sql<string>`lower(${postsView.content})`.as('lower_name'),
				},
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

/*
	One two-level relation users+posts+comments
*/

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

	const response = db.query.usersView.findMany({
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

			invitedBy: number | null;
			posts: {
				id: number;
				content: string;
				ownerId: number | null;

				comments: {
					id: number;
					content: string;

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

		invitedBy: null,
		posts: [{
			id: 1,
			ownerId: 1,
			content: 'Post1',
			comments: [
				{
					id: 1,
					content: 'Comment1',
					creator: 2,
					postId: 1,
				},
			],
		}],
	});
	expect(response[1]).toEqual({
		id: 2,
		name: 'Andrew',

		invitedBy: null,
		posts: [{
			id: 2,
			ownerId: 2,
			content: 'Post2',
			comments: [
				{
					id: 2,
					content: 'Comment2',
					creator: 2,
					postId: 2,
				},
			],
		}],
	});
	// expect(response[2]).toEqual({
	// 	id: 3,
	// 	name: 'Alex',
	//
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

// Get user with limit posts and limit comments

// Get user with custom field + post + comment with custom field

// Get user with limit + posts orderBy + comment orderBy

// Get user with where + posts where + comment where

// Get user with where + posts partial where + comment where

// Get user with where + posts partial where + comment partial(false) where

// Get user with where partial(false) + posts partial where partial(false) + comment partial(false+true) where

// Get user with where + posts partial where + comment where. Didn't select field from where in posts

// Get user with where + posts partial where + comment where. Didn't select field from where for all

// Get with limit+offset in each

/*
	One two-level + One first-level relation users+posts+comments and users+users
*/

/*
	One three-level relation users+posts+comments+comment_owner
*/

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

	const response = db.query.usersView.findMany({
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

		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;

			comments: {
				id: number;
				content: string;

				creator: number | null;
				postId: number | null;
				author: {
					id: number;
					name: string;

					invitedBy: number | null;
				} | null;
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

		invitedBy: null,
		posts: [{
			id: 1,
			ownerId: 1,
			content: 'Post1',
			comments: [
				{
					id: 1,
					content: 'Comment1',
					creator: 2,
					author: {
						id: 2,
						name: 'Andrew',

						invitedBy: null,
					},
					postId: 1,
				},
			],
		}],
	});
	expect(response[1]).toEqual({
		id: 2,
		name: 'Andrew',

		invitedBy: null,
		posts: [{
			id: 2,
			ownerId: 2,
			content: 'Post2',
			comments: [
				{
					id: 2,
					content: 'Comment2',
					creator: 2,
					author: {
						id: 2,
						name: 'Andrew',

						invitedBy: null,
					},
					postId: 2,
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

	const response = db.query.usersView.findMany({
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
		where: (table, { exists, eq }) => exists(db.select({ one: sql`1` }).from(usersView).where(eq(sql`1`, table.id))),
	}).sync();

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;

		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;

			comments: {
				id: number;
				content: string;

				creator: number | null;
				postId: number | null;
				author: {
					id: number;
					name: string;

					invitedBy: number | null;
				} | null;
			}[];
		}[];
	}[]>();

	expect(response.length).eq(1);
	expect(response[0]?.posts.length).eq(1);

	expect(response[0]?.posts[0]?.comments.length).eq(1);

	expect(response[0]).toEqual({
		id: 1,
		name: 'Dan',

		invitedBy: null,
		posts: [{
			id: 1,
			ownerId: 1,
			content: 'Post1',
			comments: [
				{
					id: 1,
					content: 'Comment1',
					creator: 2,
					author: {
						id: 2,
						name: 'Andrew',

						invitedBy: null,
					},
					postId: 1,
				},
			],
		}],
	});
});

/*
	One three-level relation + 1 first-level relatioon
	1. users+posts+comments+comment_owner
	2. users+users
*/

/*
	One four-level relation users+posts+comments+coment_likes
*/

/*
	[Find Many] Many-to-many cases

	Users+users_to_groups+groups
*/

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

	const response = db.query.usersView.findMany({
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

	const response = db.query.groupsView.findMany({
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

				invitedBy: null,
			},
		}, {
			user: {
				id: 3,
				name: 'Alex',

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

	const response = db.query.usersView.findMany({
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

	const response = db.query.groupsView.findMany({
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

	const response = db.query.usersView.findMany({
		limit: 1,
		where: (_, { eq, or }) => or(eq(usersView.id, 1), eq(usersView.id, 2)),
		with: {
			usersToGroups: {
				where: eq(usersToGroupsView.groupId, 1),
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

	const response = db.query.groupsView.findMany({
		limit: 1,
		where: gt(groupsView.id, 1),
		with: {
			usersToGroups: {
				where: eq(usersToGroupsView.userId, 2),
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

	const response = db.query.usersView.findMany({
		where: (_, { eq, or }) => or(eq(usersView.id, 1), eq(usersView.id, 2)),
		with: {
			usersToGroups: {
				where: eq(usersToGroupsView.groupId, 2),
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

		invitedBy: null,
		usersToGroups: [],
	});

	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',

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

	const response = db.query.groupsView.findMany({
		where: gt(groupsView.id, 1),
		with: {
			usersToGroups: {
				where: eq(usersToGroupsView.userId, 2),
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

	const response = db.query.usersView.findMany({
		orderBy: (users, { desc }) => [desc(users.id)],
		with: {
			usersToGroups: {
				orderBy: [desc(usersToGroupsView.groupId)],
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

	const response = db.query.groupsView.findMany({
		orderBy: [desc(groupsView.id)],
		with: {
			usersToGroups: {
				orderBy: (utg, { desc }) => [desc(utg.userId)],
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

				invitedBy: null,
			},
		}, {
			user: {
				id: 2,
				name: 'Andrew',

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

	const response = db.query.usersView.findMany({
		orderBy: (users, { desc }) => [desc(users.id)],
		limit: 2,
		with: {
			usersToGroups: {
				limit: 1,
				orderBy: [desc(usersToGroupsView.groupId)],
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

/*
	[Find One] Many-to-many cases

	Users+users_to_groups+groups
*/

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

	const response = db.query.usersView.findFirst({
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

	const response = db.query.groupsView.findFirst({
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

	const response = db.query.usersView.findFirst({
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

	const response = db.query.groupsView.findFirst({
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

	const response = db.query.usersView.findFirst({
		where: (_, { eq, or }) => or(eq(usersView.id, 1), eq(usersView.id, 2)),
		with: {
			usersToGroups: {
				where: eq(usersToGroupsView.groupId, 1),
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

	const response = db.query.groupsView.findFirst({
		where: gt(groupsView.id, 1),
		with: {
			usersToGroups: {
				where: eq(usersToGroupsView.userId, 2),
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

	const response = db.query.usersView.findFirst({
		where: (_, { eq, or }) => or(eq(usersView.id, 1), eq(usersView.id, 2)),
		with: {
			usersToGroups: {
				where: eq(usersToGroupsView.groupId, 2),
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

	const response = db.query.groupsView.findFirst({
		where: gt(groupsView.id, 1),
		with: {
			usersToGroups: {
				where: eq(usersToGroupsView.userId, 2),
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

	const response = db.query.usersView.findFirst({
		orderBy: (users, { desc }) => [desc(users.id)],
		with: {
			usersToGroups: {
				orderBy: [desc(usersToGroupsView.groupId)],
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

	const response = db.query.groupsView.findFirst({
		orderBy: [desc(groupsView.id)],
		with: {
			usersToGroups: {
				orderBy: (utg, { desc }) => [desc(utg.userId)],
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

	const response = db.query.usersView.findFirst({
		orderBy: (users, { desc }) => [desc(users.id)],
		with: {
			usersToGroups: {
				limit: 1,
				orderBy: [desc(usersToGroupsView.groupId)],
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

	const response = db.query.groupsView.findMany({
		orderBy: [desc(groupsView.id)],
		limit: 2,
		with: {
			usersToGroups: {
				limit: 1,
				orderBy: (utg, { desc }) => [desc(utg.userId)],
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

	const response = db.query.usersView.findMany({
		extras: {
			lower: sql<string>`lower(${usersView.name})`.as('lower_name'),
		},
		with: {
			usersToGroups: {
				columns: {},
				with: {
					group: {
						extras: {
							lower: sql<string>`lower(${groupsView.name})`.as('lower_name'),
						},
					},
				},
			},
		},
	}).sync();

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;

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

	const response = db.query.groupsView.findMany({
		extras: (table, { sql }) => ({
			lower: sql<string>`lower(${table.name})`.as('lower_name'),
		}),
		with: {
			usersToGroups: {
				columns: {},
				with: {
					user: {
						extras: (table, { sql }) => ({
							lower: sql<string>`lower(${table.name})`.as('lower_name'),
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

				invitedBy: null,
			},
		}, {
			user: {
				id: 3,
				name: 'Alex',
				lower: 'alex',

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

				invitedBy: null,
			},
		}],
	});
});

test('async api', async () => {
	await db.insert(usersTable).values([{ id: 1, name: 'Dan' }]);
	const users = await db.query.usersView.findMany();
	expect(users).toEqual([{ id: 1, name: 'Dan', invitedBy: null }]);
});

test('async api - sync()', () => {
	db.insert(usersTable).values([{ id: 1, name: 'Dan' }]).run();
	const users = db.query.usersView.findMany().sync();
	expect(users).toEqual([{ id: 1, name: 'Dan', invitedBy: null }]);
});

test('async api - prepare', async () => {
	const insertStmt = db.insert(usersTable).values([{ id: 1, name: 'Dan' }]).prepare();
	await insertStmt.execute();
	const queryStmt = db.query.usersView.findMany().prepare();
	const users = await queryStmt.execute();
	expect(users).toEqual([{ id: 1, name: 'Dan', invitedBy: null }]);
});

test('async api - sync() + prepare', () => {
	const insertStmt = db.insert(usersTable).values([{ id: 1, name: 'Dan' }]).prepare();
	insertStmt.execute().sync();
	const queryStmt = db.query.usersView.findMany().prepare();
	const users = queryStmt.execute().sync();
	expect(users).toEqual([{ id: 1, name: 'Dan', invitedBy: null }]);
});

test('.toSQL()', () => {
	const query = db.query.usersView.findFirst().toSQL();

	expect(query).toHaveProperty('sql', expect.any(String));
	expect(query).toHaveProperty('params', expect.any(Array));
});

// + custom + where + orderby

// + custom + where + orderby + limit

// + partial

// + partial(false)

// + partial + orderBy + where (all not selected)

/*
	One four-level relation users+posts+comments+coment_likes
	+ users+users_to_groups+groups
*/

/*
	Really hard case
	1. users+posts+comments+coment_likes
	2. users+users_to_groups+groups
	3. users+users
*/
