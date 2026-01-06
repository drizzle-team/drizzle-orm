import 'dotenv/config';

import { Client } from '@planetscale/database';
import { DrizzleError, sql, TransactionRollbackError } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import { drizzle, type PlanetScaleDatabase } from 'drizzle-orm/planetscale-serverless';
import { beforeAll, beforeEach, expect, expectTypeOf, test } from 'vitest';
import relations from './mysql.relations';
import {
	allTypesTable,
	commentsTable,
	customTypesTable,
	groupsTable,
	postsTable,
	usersTable,
	usersToGroupsTable,
} from './mysql.schema';

const ENABLE_LOGGING = false;

let db: PlanetScaleDatabase<never, typeof relations>;

beforeAll(async () => {
	db = drizzle(
		{
			client: new Client({
				url: process.env['PLANETSCALE_CONNECTION_STRING']!,
			}),
			relations,
			logger: ENABLE_LOGGING,
			casing: 'snake_case',
		},
	);

	await Promise.all([
		db.execute(sql`drop table if exists \`users\``),
		db.execute(sql`drop table if exists \`groups\``),
		db.execute(sql`drop table if exists \`users_to_groups\``),
		db.execute(sql`drop table if exists \`posts\``),
		db.execute(sql`drop table if exists \`comments\``),
		db.execute(sql`drop table if exists \`comment_likes\``),
		db.execute(sql`drop table if exists \`all_types\``),
		db.execute(sql`drop table if exists \`custom_types\``),
	]);
	await Promise.all([
		db.execute(
			sql`
				CREATE TABLE IF NOT EXISTS \`users\` (
					  \`id\` bigint PRIMARY KEY AUTO_INCREMENT NOT NULL,
					  \`name\` text NOT NULL,
					  \`verified\` boolean DEFAULT false NOT NULL,
					  \`invited_by\` bigint
				);
			`,
		),
		db.execute(
			sql`
				CREATE TABLE IF NOT EXISTS \`groups\` (
					\`id\` bigint PRIMARY KEY AUTO_INCREMENT NOT NULL,
					\`name\` text NOT NULL,
					\`description\` text
				);
			`,
		),
		db.execute(
			sql`
				CREATE TABLE IF NOT EXISTS \`users_to_groups\` (
					\`id\` serial PRIMARY KEY AUTO_INCREMENT NOT NULL,
					\`user_id\` bigint,
					\`group_id\` bigint
				);
			`,
		),
		db.execute(
			sql`
				CREATE TABLE IF NOT EXISTS \`posts\` (
					\`id\` bigint PRIMARY KEY AUTO_INCREMENT NOT NULL,
					\`content\` text NOT NULL,
					\`owner_id\` bigint,
					\`created_at\` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
				);
			`,
		),
		db.execute(
			sql`
				CREATE TABLE IF NOT EXISTS \`comments\` (
					\`id\` bigint PRIMARY KEY AUTO_INCREMENT NOT NULL,
					\`content\` text NOT NULL,
					\`creator\` bigint,
					\`post_id\` bigint,
					\`created_at\` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
				);
			`,
		),
		db.execute(
			sql`
				CREATE TABLE IF NOT EXISTS \`comment_likes\` (
					\`id\` bigint PRIMARY KEY AUTO_INCREMENT NOT NULL,
					\`creator\` bigint,
					\`comment_id\` bigint,
					\`created_at\` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
				);
			`,
		),
	]);
});

beforeEach(async () => {
	await Promise.all([
		db.delete(usersTable),
		db.delete(postsTable),
		db.delete(commentsTable),
		db.delete(groupsTable),
		db.delete(usersToGroupsTable),
		db.execute(sql`delete from \`comment_likes\``),
	]);
	await Promise.all([
		db.execute(sql`ALTER TABLE \`users\` AUTO_INCREMENT = 1`),
		db.execute(sql`ALTER TABLE \`groups\` AUTO_INCREMENT = 1`),
		db.execute(sql`ALTER TABLE \`users_to_groups\` AUTO_INCREMENT = 1`),
		db.execute(sql`ALTER TABLE \`posts\` AUTO_INCREMENT = 1`),
		db.execute(sql`ALTER TABLE \`comments\` AUTO_INCREMENT = 1`),
		db.execute(sql`ALTER TABLE \`comment_likes\` AUTO_INCREMENT = 1`),
	]);
});

test('[Find Many] Get users with posts', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		with: {
			posts: true,
		},
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
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
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		posts: [{ id: 2, ownerId: 2, content: 'Post2', createdAt: usersWithPosts[1]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts[2]).toEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: null,
		posts: [{ id: 3, ownerId: 3, content: 'Post3', createdAt: usersWithPosts[2]?.posts[0]?.createdAt }],
	});
});

test('[Find Many] Get users with posts + limit posts', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		with: {
			posts: {
				limit: 1,
			},
		},
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
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
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		posts: [{ id: 4, ownerId: 2, content: 'Post2', createdAt: usersWithPosts[1]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts[2]).toEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: null,
		posts: [{ id: 6, ownerId: 3, content: 'Post3', createdAt: usersWithPosts[2]?.posts[0]?.createdAt }],
	});
});

test('[Find Many] Get users with posts + limit posts and users', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		limit: 2,
		with: {
			posts: {
				limit: 1,
			},
		},
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
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
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		posts: [{ id: 4, ownerId: 2, content: 'Post2', createdAt: usersWithPosts[1]?.posts[0]?.createdAt }],
	});
});

test('[Find Many] Get users with posts + custom fields', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		with: {
			posts: true,
		},
		extras: ({
			lowerName: ({ name }) => sql<string>`lower(${name})`.as('name_lower'),
		}),
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
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
		verified: false,
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
		verified: false,
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
		verified: false,
		invitedBy: null,
		posts: [{ id: 6, ownerId: 3, content: 'Post3', createdAt: usersWithPosts[2]?.posts[0]?.createdAt }, {
			id: 7,
			ownerId: 3,
			content: 'Post3.1',
			createdAt: usersWithPosts[2]?.posts[1]?.createdAt,
		}],
	});
});

test('[Find Many] Get users with posts + custom fields + limits', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		limit: 1,
		with: {
			posts: {
				limit: 1,
			},
		},
		extras: ({
			lowerName: (usersTable, { sql }) => sql<string>`lower(${usersTable.name})`.as('name_lower'),
		}),
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
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
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
});

test('[Find Many] Get users with posts + orderBy', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: '1' },
		{ ownerId: 1, content: '2' },
		{ ownerId: 1, content: '3' },
		{ ownerId: 2, content: '4' },
		{ ownerId: 2, content: '5' },
		{ ownerId: 3, content: '6' },
		{ ownerId: 3, content: '7' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
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
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[]>();

	expect(usersWithPosts.length).eq(3);
	expect(usersWithPosts[0]?.posts.length).eq(2);
	expect(usersWithPosts[1]?.posts.length).eq(2);
	expect(usersWithPosts[2]?.posts.length).eq(3);

	expect(usersWithPosts[2]).toEqual({
		id: 1,
		name: 'Dan',
		verified: false,
		invitedBy: null,
		posts: [
			{
				id: 3,
				ownerId: 1,
				content: '3',
				createdAt: usersWithPosts[2]?.posts[2]?.createdAt,
			},
			{
				id: 2,
				ownerId: 1,
				content: '2',
				createdAt: usersWithPosts[2]?.posts[1]?.createdAt,
			},
			{
				id: 1,
				ownerId: 1,
				content: '1',
				createdAt: usersWithPosts[2]?.posts[0]?.createdAt,
			},
		],
	});
	expect(usersWithPosts[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		posts: [{
			id: 5,
			ownerId: 2,
			content: '5',
			createdAt: usersWithPosts[1]?.posts[1]?.createdAt,
		}, { id: 4, ownerId: 2, content: '4', createdAt: usersWithPosts[1]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts[0]).toEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: null,
		posts: [{
			id: 7,
			ownerId: 3,
			content: '7',
			createdAt: usersWithPosts[0]?.posts[1]?.createdAt,
		}, { id: 6, ownerId: 3, content: '6', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
});

test('[Find Many] Get users with posts + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
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
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
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
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
});

test('[Find Many] Get users with posts + where + partial', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
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
	});

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

test('[Find Many] Get users with posts + where + partial. Did not select posts id, but used it in where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
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
	});

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

test('[Find Many] Get users with posts + where + partial(true + false)', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
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
	});

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

test('[Find Many] Get users with posts + where + partial(false)', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
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
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		verified: boolean;
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
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
});

test('[Find Many] Get users with posts in transaction', async () => {
	let usersWithPosts: {
		id: number;
		name: string;
		verified: boolean;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[] = [];

	await db.transaction(async (tx) => {
		await tx.insert(usersTable).values([
			{ id: 1, name: 'Dan' },
			{ id: 2, name: 'Andrew' },
			{ id: 3, name: 'Alex' },
		]);

		await tx.insert(postsTable).values([
			{ ownerId: 1, content: 'Post1' },
			{ ownerId: 1, content: 'Post1.1' },
			{ ownerId: 2, content: 'Post2' },
			{ ownerId: 3, content: 'Post3' },
		]);

		usersWithPosts = await tx.query.usersTable.findMany({
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
		});
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
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
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
});

test('[Find Many] Get users with posts in rollbacked transaction', async () => {
	let usersWithPosts: {
		id: number;
		name: string;
		verified: boolean;
		invitedBy: number | null;
		posts: {
			id: number;
			content: string;
			ownerId: number | null;
			createdAt: Date;
		}[];
	}[] = [];

	await expect(db.transaction(async (tx) => {
		await tx.insert(usersTable).values([
			{ id: 1, name: 'Dan' },
			{ id: 2, name: 'Andrew' },
			{ id: 3, name: 'Alex' },
		]);

		await tx.insert(postsTable).values([
			{ ownerId: 1, content: 'Post1' },
			{ ownerId: 1, content: 'Post1.1' },
			{ ownerId: 2, content: 'Post2' },
			{ ownerId: 3, content: 'Post3' },
		]);

		tx.rollback();

		usersWithPosts = await tx.query.usersTable.findMany({
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
		});
	})).rejects.toThrowError(new TransactionRollbackError());

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
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

test('[Find Many] Get only custom fields', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ id: 1, ownerId: 1, content: 'Post1' },
		{ id: 2, ownerId: 1, content: 'Post1.2' },
		{ id: 3, ownerId: 1, content: 'Post1.3' },
		{ id: 4, ownerId: 2, content: 'Post2' },
		{ id: 5, ownerId: 2, content: 'Post2.1' },
		{ id: 6, ownerId: 3, content: 'Post3' },
		{ id: 7, ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
		columns: {},
		with: {
			posts: {
				columns: {},
				extras: ({
					lowerName: ({ content }) => sql<string>`lower(${content})`.as('content_lower'),
				}),
			},
		},
		extras: ({
			lowerName: ({ name }) => sql<string>`lower(${name})`.as('name_lower'),
		}),
	});

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

test('[Find Many] Get only custom fields + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
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
					lowerName: ({ content }) => sql<string>`lower(${content})`.as('content_lower'),
				}),
			},
		},
		where: {
			id: 1,
		},
		extras: ({
			lowerName: ({ name }) => sql<string>`lower(${name})`.as('name_lower'),
		}),
	});

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

test('[Find Many] Get only custom fields + where + limit', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
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
					lowerName: ({ content }) => sql<string>`lower(${content})`.as('content_lower'),
				}),
			},
		},
		where: {
			id: 1,
		},
		extras: ({
			lowerName: ({ name }) => sql<string>`lower(${name})`.as('name_lower'),
		}),
	});

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

test('[Find Many] Get only custom fields + where + orderBy', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findMany({
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
					lowerName: ({ content }) => sql<string>`lower(${content})`.as('content_lower'),
				}),
			},
		},
		where: {
			id: 1,
		},
		extras: ({
			lowerName: ({ name }) => sql<string>`lower(${name})`.as('name_lower'),
		}),
	});

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

test('[Find One] Get only custom fields', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findFirst({
		columns: {},
		with: {
			posts: {
				columns: {},
				extras: ({
					lowerName: ({ content }) => sql<string>`lower(${content})`.as('content_lower'),
				}),
			},
		},
		extras: ({
			lowerName: ({ name }) => sql<string>`lower(${name})`.as('name_lower'),
		}),
	});

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

test('[Find One] Get only custom fields + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findFirst({
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
					lowerName: ({ content }) => sql<string>`lower(${content})`.as('content_lower'),
				}),
			},
		},
		where: {
			id: 1,
		},
		extras: ({
			lowerName: ({ name }) => sql<string>`lower(${name})`.as('name_lower'),
		}),
	});

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

test('[Find One] Get only custom fields + where + limit', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findFirst({
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
					lowerName: ({ content }) => sql<string>`lower(${content})`.as('content_lower'),
				}),
			},
		},
		where: {
			id: 1,
		},
		extras: ({
			lowerName: ({ name }) => sql<string>`lower(${name})`.as('name_lower'),
		}),
	});

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

test('[Find One] Get only custom fields + where + orderBy', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findFirst({
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
					lowerName: ({ content }) => sql<string>`lower(${content})`.as('content_lower'),
				}),
			},
		},
		where: {
			id: 1,
		},
		extras: ({
			lowerName: ({ name }) => sql<string>`lower(${name})`.as('name_lower'),
		}),
	});

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

test('[Find Many] Get select {}', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await expect(async () =>
		await db.query.usersTable.findMany({
			columns: {},
		})
	).rejects.toThrow(DrizzleError);
});

test('[Find One] Get select {}', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await expect(async () =>
		await db.query.usersTable.findFirst({
			columns: {},
		})
	).rejects.toThrow(DrizzleError);
});

test('[Find Many] Get deep select {}', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	await expect(async () =>
		await db.query.usersTable.findMany({
			columns: {},
			with: {
				posts: {
					columns: {},
				},
			},
		})
	).rejects.toThrow(DrizzleError);
});

test('[Find One] Get deep select {}', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	await expect(async () =>
		await db.query.usersTable.findFirst({
			columns: {},
			with: {
				posts: {
					columns: {},
				},
			},
		})
	).rejects.toThrow(DrizzleError);
});

test('[Find Many] Get users with posts + prepared limit', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const prepared = db.query.usersTable.findMany({
		with: {
			posts: {
				limit: sql.placeholder('limit'),
			},
		},
	}).prepare();

	const usersWithPosts = await prepared.execute({ limit: 1 });

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
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
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts).toContainEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		posts: [{ id: 4, ownerId: 2, content: 'Post2', createdAt: usersWithPosts[1]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts).toContainEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: null,
		posts: [{ id: 6, ownerId: 3, content: 'Post3', createdAt: usersWithPosts[2]?.posts[0]?.createdAt }],
	});
});

test('[Find Many] Get users with posts + prepared limit + offset', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const prepared = db.query.usersTable.findMany({
		limit: sql.placeholder('uLimit'),
		offset: sql.placeholder('uOffset'),
		with: {
			posts: {
				limit: sql.placeholder('pLimit'),
			},
		},
	}).prepare();

	const usersWithPosts = await prepared.execute({ pLimit: 1, uLimit: 3, uOffset: 1 });

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
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
		verified: false,
		invitedBy: null,
		posts: [{ id: 4, ownerId: 2, content: 'Post2', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
	expect(usersWithPosts).toContainEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: null,
		posts: [{ id: 6, ownerId: 3, content: 'Post3', createdAt: usersWithPosts[1]?.posts[0]?.createdAt }],
	});
});

test('[Find Many] Get users with posts + prepared where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

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

	const usersWithPosts = await prepared.execute({ id: 1 });

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
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
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
});

test('[Find Many] Get users with posts + prepared + limit + offset + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const prepared = db.query.usersTable.findMany({
		limit: sql.placeholder('uLimit'),
		offset: sql.placeholder('uOffset'),
		where: {
			id: {
				OR: [
					{
						eq: sql.placeholder('id'),
					},
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

	const usersWithPosts = await prepared.execute({ pLimit: 1, uLimit: 3, uOffset: 1, id: 2, pid: 6 });

	expectTypeOf(usersWithPosts).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
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
		verified: false,
		invitedBy: null,
		posts: [{ id: 6, ownerId: 3, content: 'Post3', createdAt: usersWithPosts[0]?.posts[0]?.createdAt }],
	});
});

test('[Find One] Get users with posts', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const usersWithPosts = await db.query.usersTable.findFirst({
		with: {
			posts: true,
		},
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
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
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts?.posts[0]?.createdAt }],
	});
});

test('[Find One] Get users with posts + limit posts', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findFirst({
		with: {
			posts: {
				limit: 1,
			},
		},
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
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
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts?.posts[0]?.createdAt }],
	});
});

test('[Find One] Get users with posts no results found', async () => {
	const usersWithPosts = await db.query.usersTable.findFirst({
		with: {
			posts: {
				limit: 1,
			},
		},
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
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

test('[Find One] Get users with posts + limit posts and users', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findFirst({
		with: {
			posts: {
				limit: 1,
			},
		},
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
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
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts?.posts[0]?.createdAt }],
	});
});

test('[Find One] Get users with posts + custom fields', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findFirst({
		with: {
			posts: true,
		},
		extras: ({
			lowerName: ({ name }) => sql<string>`lower(${name})`.as('name_lower'),
		}),
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
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
	expect(usersWithPosts?.verified).toEqual(false);
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

test('[Find One] Get users with posts + custom fields + limits', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.2' },
		{ ownerId: 1, content: 'Post1.3' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const usersWithPosts = await db.query.usersTable.findFirst({
		with: {
			posts: {
				limit: 1,
			},
		},
		extras: ({
			lowerName: (usersTable, { sql }) => sql<string>`lower(${usersTable.name})`.as('name_lower'),
		}),
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
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
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts?.posts[0]?.createdAt }],
	});
});

test('[Find One] Get users with posts + orderBy', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: '1' },
		{ ownerId: 1, content: '2' },
		{ ownerId: 1, content: '3' },
		{ ownerId: 2, content: '4' },
		{ ownerId: 2, content: '5' },
		{ ownerId: 3, content: '6' },
		{ ownerId: 3, content: '7' },
	]);

	const usersWithPosts = await db.query.usersTable.findFirst({
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
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
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
		verified: false,
		invitedBy: null,
		posts: [{
			id: 7,
			ownerId: 3,
			content: '7',
			createdAt: usersWithPosts?.posts[1]?.createdAt,
		}, { id: 6, ownerId: 3, content: '6', createdAt: usersWithPosts?.posts[0]?.createdAt }],
	});
});

test('[Find One] Get users with posts + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const usersWithPosts = await db.query.usersTable.findFirst({
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
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
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
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: usersWithPosts?.posts[0]?.createdAt }],
	});
});

test('[Find One] Get users with posts + where + partial', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const usersWithPosts = await db.query.usersTable.findFirst({
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
	});

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

test('[Find One] Get users with posts + where + partial. Did not select posts id, but used it in where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const usersWithPosts = await db.query.usersTable.findFirst({
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
	});

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

test('[Find One] Get users with posts + where + partial(true + false)', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const usersWithPosts = await db.query.usersTable.findFirst({
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
	});

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

test('[Find One] Get users with posts + where + partial(false)', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const usersWithPosts = await db.query.usersTable.findFirst({
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
	});

	expectTypeOf(usersWithPosts).toEqualTypeOf<
		{
			id: number;
			verified: boolean;
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
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 1, createdAt: usersWithPosts?.posts[0]?.createdAt }],
	});
});

test('Get user with invitee', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	const usersWithInvitee = await db.query.usersTable.findMany({
		with: {
			invitee: true,
		},
	});

	expectTypeOf(usersWithInvitee).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			invitee: {
				id: number;
				name: string;
				verified: boolean;
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
		verified: false,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[2]).toEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
	});
	expect(usersWithInvitee[3]).toEqual({
		id: 4,
		name: 'John',
		verified: false,
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', verified: false, invitedBy: null },
	});
});

test('Get user + limit with invitee', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew', invitedBy: 1 },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	const usersWithInvitee = await db.query.usersTable.findMany({
		with: {
			invitee: true,
		},
		limit: 2,
	});

	expectTypeOf(usersWithInvitee).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			invitee: {
				id: number;
				name: string;
				verified: boolean;
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
		verified: false,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
	});
});

test('Get user with invitee and custom fields', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	const usersWithInvitee = await db.query.usersTable.findMany({
		extras: ({ lower: (users, { sql }) => sql<string>`lower(${users.name})`.as('lower_name') }),
		with: {
			invitee: {
				extras: ({ lower: (invitee, { sql }) => sql<string>`lower(${invitee.name})`.as('lower_name') }),
			},
		},
	});

	expectTypeOf(usersWithInvitee).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			lower: string;
			invitedBy: number | null;
			invitee: {
				id: number;
				name: string;
				verified: boolean;
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
		verified: false,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[1]).toEqual({
		id: 2,
		name: 'Andrew',
		lower: 'andrew',
		verified: false,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[2]).toEqual({
		id: 3,
		name: 'Alex',
		lower: 'alex',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', lower: 'dan', verified: false, invitedBy: null },
	});
	expect(usersWithInvitee[3]).toEqual({
		id: 4,
		name: 'John',
		lower: 'john',
		verified: false,
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', lower: 'andrew', verified: false, invitedBy: null },
	});
});

test('Get user with invitee and custom fields + limits', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	const usersWithInvitee = await db.query.usersTable.findMany({
		extras: ({ lower: (users, { sql }) => sql<string>`lower(${users.name})`.as('lower_name') }),
		limit: 3,
		with: {
			invitee: {
				extras: ({ lower: (invitee, { sql }) => sql<string>`lower(${invitee.name})`.as('lower_name') }),
			},
		},
	});

	expectTypeOf(usersWithInvitee).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			lower: string;
			invitedBy: number | null;
			invitee: {
				id: number;
				name: string;
				verified: boolean;
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
		verified: false,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[1]).toEqual({
		id: 2,
		name: 'Andrew',
		lower: 'andrew',
		verified: false,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[2]).toEqual({
		id: 3,
		name: 'Alex',
		lower: 'alex',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', lower: 'dan', verified: false, invitedBy: null },
	});
});

test('Get user with invitee + order by', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	const usersWithInvitee = await db.query.usersTable.findMany({
		orderBy: {
			id: 'desc',
		},
		with: {
			invitee: true,
		},
	});

	expectTypeOf(usersWithInvitee).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			invitee: {
				id: number;
				name: string;
				verified: boolean;
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
		verified: false,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[2]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		invitee: null,
	});
	expect(usersWithInvitee[1]).toEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
	});
	expect(usersWithInvitee[0]).toEqual({
		id: 4,
		name: 'John',
		verified: false,
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', verified: false, invitedBy: null },
	});
});

test('Get user with invitee + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	const usersWithInvitee = await db.query.usersTable.findMany({
		where: {
			id: {
				OR: [3, 4],
			},
		},
		with: {
			invitee: true,
		},
	});

	expectTypeOf(usersWithInvitee).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			invitee: {
				id: number;
				name: string;
				verified: boolean;
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
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
	});
	expect(usersWithInvitee).toContainEqual({
		id: 4,
		name: 'John',
		verified: false,
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', verified: false, invitedBy: null },
	});
});

test('Get user with invitee + where + partial', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	const usersWithInvitee = await db.query.usersTable.findMany({
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
	});

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

test('Get user with invitee + where + partial.  Did not select users id, but used it in where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	const usersWithInvitee = await db.query.usersTable.findMany({
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
	});

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

test('Get user with invitee + where + partial(true+false)', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	const usersWithInvitee = await db.query.usersTable.findMany({
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
	});

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

test('Get user with invitee + where + partial(false)', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	const usersWithInvitee = await db.query.usersTable.findMany({
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
	});

	expectTypeOf(usersWithInvitee).toEqualTypeOf<
		{
			id: number;
			name: string;
			invitedBy: number | null;
			invitee: {
				id: number;
				verified: boolean;
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
		invitee: { id: 1, verified: false, invitedBy: null },
	});
	expect(usersWithInvitee).toContainEqual({
		id: 4,
		name: 'John',
		invitedBy: 2,
		invitee: { id: 2, verified: false, invitedBy: null },
	});
});

test('Get user with invitee and posts', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const response = await db.query.usersTable.findMany({
		with: {
			invitee: true,
			posts: true,
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			posts: { id: number; ownerId: number | null; content: string; createdAt: Date }[];
			invitee: {
				id: number;
				name: string;
				verified: boolean;
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
		verified: false,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: response[0]?.posts[0]?.createdAt }],
	});
	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 2, ownerId: 2, content: 'Post2', createdAt: response[1]?.posts[0]?.createdAt }],
	});
	expect(response).toContainEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
		posts: [{ id: 3, ownerId: 3, content: 'Post3', createdAt: response[2]?.posts[0]?.createdAt }],
	});
	expect(response).toContainEqual({
		id: 4,
		name: 'John',
		verified: false,
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', verified: false, invitedBy: null },
		posts: [],
	});
});

test('Get user with invitee and posts + limit posts and users', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const response = await db.query.usersTable.findMany({
		limit: 3,
		with: {
			invitee: true,
			posts: {
				limit: 1,
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			posts: { id: number; ownerId: number | null; content: string; createdAt: Date }[];
			invitee: {
				id: number;
				name: string;
				verified: boolean;
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
		verified: false,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', createdAt: response[0]?.posts[0]?.createdAt }],
	});
	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 3, ownerId: 2, content: 'Post2', createdAt: response[1]?.posts[0]?.createdAt }],
	});
	expect(response).toContainEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
		posts: [{ id: 5, ownerId: 3, content: 'Post3', createdAt: response[2]?.posts[0]?.createdAt }],
	});
});

test('Get user with invitee and posts + limits + custom fields in each', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const response = await db.query.usersTable.findMany({
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
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			lower: string;
			invitedBy: number | null;
			posts: { id: number; lower: string; ownerId: number | null; content: string; createdAt: Date }[];
			invitee: {
				id: number;
				name: string;
				lower: string;
				verified: boolean;
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
		verified: false,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 1, ownerId: 1, content: 'Post1', lower: 'post1', createdAt: response[0]?.posts[0]?.createdAt }],
	});
	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		lower: 'andrew',
		verified: false,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 3, ownerId: 2, content: 'Post2', lower: 'post2', createdAt: response[1]?.posts[0]?.createdAt }],
	});
	expect(response).toContainEqual({
		id: 3,
		name: 'Alex',
		lower: 'alex',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', lower: 'dan', verified: false, invitedBy: null },
		posts: [{ id: 5, ownerId: 3, content: 'Post3', lower: 'post3', createdAt: response[2]?.posts[0]?.createdAt }],
	});
});

test('Get user with invitee and posts + custom fields in each', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const response = await db.query.usersTable.findMany({
		extras: ({ lower: (users, { sql }) => sql<string>`lower(${users.name})`.as('lower_name') }),
		with: {
			invitee: {
				extras: ({ lower: (users, { sql }) => sql<string>`lower(${users.name})`.as('lower_name') }),
			},
			posts: {
				extras: ({ lower: (posts, { sql }) => sql<string>`lower(${posts.content})`.as('lower_name') }),
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			lower: string;
			invitedBy: number | null;
			posts: { id: number; lower: string; ownerId: number | null; content: string; createdAt: Date }[];
			invitee: {
				id: number;
				name: string;
				lower: string;
				verified: boolean;
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
		verified: false,
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
		verified: false,
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
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', lower: 'dan', verified: false, invitedBy: null },
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
		verified: false,
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', lower: 'andrew', verified: false, invitedBy: null },
		posts: [],
	});
});

test('Get user with invitee and posts + orderBy', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const response = await db.query.usersTable.findMany({
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
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			posts: { id: number; ownerId: number | null; content: string; createdAt: Date }[];
			invitee: {
				id: number;
				name: string;
				verified: boolean;
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
		verified: false,
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
		verified: false,
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
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
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
		verified: false,
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', verified: false, invitedBy: null },
		posts: [],
	});
});

test('Get user with invitee and posts + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const response = await db.query.usersTable.findMany({
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
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			posts: { id: number; ownerId: number | null; content: string; createdAt: Date }[];
			invitee: {
				id: number;
				name: string;
				verified: boolean;
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
		verified: false,
		invitedBy: null,
		invitee: null,
		posts: [{ id: 2, ownerId: 2, content: 'Post2', createdAt: response[0]?.posts[0]?.createdAt }],
	});
	expect(response).toContainEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
		posts: [],
	});
});

test('Get user with invitee and posts + limit posts and users + where', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
		{ ownerId: 3, content: 'Post3.1' },
	]);

	const response = await db.query.usersTable.findMany({
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
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			posts: { id: number; ownerId: number | null; content: string; createdAt: Date }[];
			invitee: {
				id: number;
				name: string;
				verified: boolean;
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
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
		posts: [{ id: 5, ownerId: 3, content: 'Post3', createdAt: response[0]?.posts[0]?.createdAt }],
	});
});

test('Get user with invitee and posts + orderBy + where + custom', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const response = await db.query.usersTable.findMany({
		orderBy: {
			id: 'desc',
		},
		where: {
			id: { OR: [3, 4] },
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
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
			invitedBy: number | null;
			lower: string;
			posts: { id: number; lower: string; ownerId: number | null; content: string; createdAt: Date }[];
			invitee: {
				id: number;
				name: string;
				verified: boolean;
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
		verified: false,
		invitedBy: 1,
		invitee: { id: 1, name: 'Dan', verified: false, invitedBy: null },
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
		verified: false,
		invitedBy: 2,
		invitee: { id: 2, name: 'Andrew', verified: false, invitedBy: null },
		posts: [],
	});
});

test('Get user with invitee and posts + orderBy + where + partial + custom', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex', invitedBy: 1 },
		{ id: 4, name: 'John', invitedBy: 2 },
	]);

	await db.insert(postsTable).values([
		{ ownerId: 1, content: 'Post1' },
		{ ownerId: 1, content: 'Post1.1' },
		{ ownerId: 2, content: 'Post2' },
		{ ownerId: 2, content: 'Post2.1' },
		{ ownerId: 3, content: 'Post3' },
	]);

	const response = await db.query.usersTable.findMany({
		orderBy: {
			id: 'desc',
		},
		where: {
			id: { OR: [3, 4] },
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
	});

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

test('Get user with posts and posts with comments', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ id: 1, ownerId: 1, content: 'Post1' },
		{ id: 2, ownerId: 2, content: 'Post2' },
		{ id: 3, ownerId: 3, content: 'Post3' },
	]);

	await db.insert(commentsTable).values([
		{ postId: 1, content: 'Comment1', creator: 2 },
		{ postId: 2, content: 'Comment2', creator: 2 },
		{ postId: 3, content: 'Comment3', creator: 3 },
	]);

	const response = await db.query.usersTable.findMany({
		with: {
			posts: {
				with: {
					comments: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
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
		verified: false,
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
		verified: false,
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
	// 	verified: false,
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

test('Get user with posts and posts with comments and comments with owner', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ id: 1, ownerId: 1, content: 'Post1' },
		{ id: 2, ownerId: 2, content: 'Post2' },
		{ id: 3, ownerId: 3, content: 'Post3' },
	]);

	await db.insert(commentsTable).values([
		{ postId: 1, content: 'Comment1', creator: 2 },
		{ postId: 2, content: 'Comment2', creator: 2 },
		{ postId: 3, content: 'Comment3', creator: 3 },
	]);

	const response = await db.query.usersTable.findMany({
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
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
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
					verified: boolean;
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
		verified: false,
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
						verified: false,
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
		verified: false,
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
						verified: false,
						invitedBy: null,
					},
					postId: 2,
					createdAt: response[1]?.posts[0]?.comments[0]?.createdAt,
				},
			],
		}],
	});
});

test('Get user with posts and posts with comments and comments with owner where exists', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(postsTable).values([
		{ id: 1, ownerId: 1, content: 'Post1' },
		{ id: 2, ownerId: 2, content: 'Post2' },
		{ id: 3, ownerId: 3, content: 'Post3' },
	]);

	await db.insert(commentsTable).values([
		{ postId: 1, content: 'Comment1', creator: 2 },
		{ postId: 2, content: 'Comment2', creator: 2 },
		{ postId: 3, content: 'Comment3', creator: 3 },
	]);

	const response = await db.query.usersTable.findMany({
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
			RAW: (table, { exists, eq }) =>
				exists(db.select({ one: sql`1` }).from(alias(usersTable, 'alias')).where(eq(sql`1`, table.id))),
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
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
					verified: boolean;
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
		verified: false,
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
						verified: false,
						invitedBy: null,
					},
					postId: 1,
					createdAt: response[0]?.posts[0]?.comments[0]?.createdAt,
				},
			],
		}],
	});
});

test('[Find Many] Get users with groups', async () => {
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
			usersToGroups: {
				columns: {},
				with: {
					group: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
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
		verified: false,
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
		verified: false,
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
		verified: false,
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

test('[Find Many] Get groups with users', async () => {
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
			usersToGroups: {
				columns: {},
				with: {
					user: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		description: string | null;
		usersToGroups: {
			user: {
				id: number;
				name: string;
				verified: boolean;
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
				verified: false,
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
				verified: false,
				invitedBy: null,
			},
		}, {
			user: {
				id: 3,
				name: 'Alex',
				verified: false,
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
				verified: false,
				invitedBy: null,
			},
		}],
	});
});

test('[Find Many] Get users with groups + limit', async () => {
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
			usersToGroups: {
				limit: 1,
				columns: {},
				with: {
					group: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
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
		verified: false,
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
		verified: false,
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

test('[Find Many] Get groups with users + limit', async () => {
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
			usersToGroups: {
				limit: 1,
				columns: {},
				with: {
					user: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		description: string | null;
		usersToGroups: {
			user: {
				id: number;
				name: string;
				verified: boolean;
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
				verified: false,
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
				verified: false,
				invitedBy: null,
			},
		}],
	});
});

test('[Find Many] Get users with groups + limit + where', async () => {
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
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
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
		verified: false,
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

test('[Find Many] Get groups with users + limit + where', async () => {
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
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		description: string | null;
		usersToGroups: {
			user: {
				id: number;
				name: string;
				verified: boolean;
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
				verified: false,
				invitedBy: null,
			},
		}],
	});
});

test('[Find Many] Get users with groups + where', async () => {
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
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
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
		verified: false,
		invitedBy: null,
		usersToGroups: [],
	});

	expect(response).toContainEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
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

test('[Find Many] Get groups with users + where', async () => {
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
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		description: string | null;
		usersToGroups: {
			user: {
				id: number;
				name: string;
				verified: boolean;
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
				verified: false,
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

test('[Find Many] Get users with groups + orderBy', async () => {
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
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
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
		verified: false,
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
		verified: false,
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
		verified: false,
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

test('[Find Many] Get groups with users + orderBy', async () => {
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
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		description: string | null;
		usersToGroups: {
			user: {
				id: number;
				name: string;
				verified: boolean;
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
				verified: false,
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
				verified: false,
				invitedBy: null,
			},
		}, {
			user: {
				id: 2,
				name: 'Andrew',
				verified: false,
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
				verified: false,
				invitedBy: null,
			},
		}],
	});
});

test('[Find Many] Get users with groups + orderBy + limit', async () => {
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
	});

	expectTypeOf(response).toEqualTypeOf<{
		id: number;
		name: string;
		verified: boolean;
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
		verified: false,
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
		verified: false,
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

test('[Find One] Get users with groups', async () => {
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
			usersToGroups: {
				columns: {},
				with: {
					group: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
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
		verified: false,
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

test('[Find One] Get groups with users', async () => {
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
			usersToGroups: {
				columns: {},
				with: {
					user: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			description: string | null;
			usersToGroups: {
				user: {
					id: number;
					name: string;
					verified: boolean;
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
				verified: false,
				invitedBy: null,
			},
		}],
	});
});

test('[Find One] Get users with groups + limit', async () => {
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
			usersToGroups: {
				limit: 1,
				columns: {},
				with: {
					group: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
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
		verified: false,
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

test('[Find One] Get groups with users + limit', async () => {
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
			usersToGroups: {
				limit: 1,
				columns: {},
				with: {
					user: true,
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			description: string | null;
			usersToGroups: {
				user: {
					id: number;
					name: string;
					verified: boolean;
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
				verified: false,
				invitedBy: null,
			},
		}],
	});
});

test('[Find One] Get users with groups + limit + where', async () => {
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
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
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
		verified: false,
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

test('[Find One] Get groups with users + limit + where', async () => {
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
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			description: string | null;
			usersToGroups: {
				user: {
					id: number;
					name: string;
					verified: boolean;
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
				verified: false,
				invitedBy: null,
			},
		}],
	});
});

test('[Find One] Get users with groups + where', async () => {
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
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
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
		verified: false,
		invitedBy: null,
		usersToGroups: [],
	});
});

test('[Find One] Get groups with users + where', async () => {
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
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			description: string | null;
			usersToGroups: {
				user: {
					id: number;
					name: string;
					verified: boolean;
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
				verified: false,
				invitedBy: null,
			},
		}],
	});
});

test('[Find One] Get users with groups + orderBy', async () => {
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
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
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
		verified: false,
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

test('[Find One] Get groups with users + orderBy', async () => {
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
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			description: string | null;
			usersToGroups: {
				user: {
					id: number;
					name: string;
					verified: boolean;
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
				verified: false,
				invitedBy: null,
			},
		}],
	});
});

test('[Find One] Get users with groups + orderBy + limit', async () => {
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
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
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
		verified: false,
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

test('Get groups with users + orderBy + limit', async () => {
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
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			description: string | null;
			usersToGroups: {
				user: {
					id: number;
					name: string;
					verified: boolean;
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
				verified: false,
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
				verified: false,
				invitedBy: null,
			},
		}],
	});
});

test('Get users with groups + custom', async () => {
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
			lower: (usersTable) => sql<string>`lower(${usersTable.name})`.as('lower_name'),
		}),
		with: {
			usersToGroups: {
				columns: {},
				with: {
					group: {
						extras: ({
							lower: (groupsTable) => sql<string>`lower(${groupsTable.name})`.as('lower_name'),
						}),
					},
				},
			},
		},
	});

	expectTypeOf(response).toEqualTypeOf<
		{
			id: number;
			name: string;
			verified: boolean;
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

	expect(response.length).toEqual(3);

	expect(response[0]?.usersToGroups.length).toEqual(1);
	expect(response[1]?.usersToGroups.length).toEqual(1);
	expect(response[2]?.usersToGroups.length).toEqual(2);

	expect(response).toContainEqual({
		id: 1,
		name: 'Dan',
		lower: 'dan',
		verified: false,
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
		verified: false,
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
		verified: false,
		invitedBy: null,
		usersToGroups: [{
			group: {
				id: 3,
				name: 'Group3',
				lower: 'group3',
				description: null,
			},
		}, {
			group: {
				id: 2,
				name: 'Group2',
				lower: 'group2',
				description: null,
			},
		}],
	});
});

test('Get groups with users + custom', async () => {
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
			usersToGroups: {
				columns: {},
				with: {
					user: {
						extras: ({
							lower: (table, { sql }) => sql<string>`lower(${table.name})`.as('lower_name'),
						}),
					},
				},
			},
		},
	});

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
					verified: boolean;
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
				verified: false,
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
				verified: false,
				invitedBy: null,
			},
		}, {
			user: {
				id: 3,
				name: 'Alex',
				lower: 'alex',
				verified: false,
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
				verified: false,
				invitedBy: null,
			},
		}],
	});
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
			verified: boolean;
			invitedBy: number | null;
			inviteeRequired: {
				id: number;
				name: string;
				verified: boolean;
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
		verified: false,
		invitedBy: null,
		inviteeRequired: null,
	});
	expect(usersWithInvitee[1]).toEqual({
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		inviteeRequired: null,
	});
	expect(usersWithInvitee[2]).toEqual({
		id: 3,
		name: 'Alex',
		verified: false,
		invitedBy: 1,
		inviteeRequired: { id: 1, name: 'Dan', verified: false, invitedBy: null },
	});
	expect(usersWithInvitee[3]).toEqual({
		id: 4,
		name: 'John',
		verified: false,
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
		verified: boolean;
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
		verified: false,
		invitedBy: null,
		groups: [{
			id: 1,
			name: 'Group1',
			description: null,
		}],
	}, {
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		groups: [{
			id: 2,
			name: 'Group2',
			description: null,
		}],
	}, {
		id: 3,
		name: 'Alex',
		verified: false,
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
			verified: boolean;
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
			verified: false,
			invitedBy: null,
		}],
	}, {
		id: 2,
		name: 'Group2',
		description: null,
		users: [{
			id: 2,
			name: 'Andrew',
			verified: false,
			invitedBy: null,
		}, {
			id: 3,
			name: 'Alex',
			verified: false,
			invitedBy: null,
		}],
	}, {
		id: 3,
		name: 'Group3',
		description: null,
		users: [{
			id: 3,
			name: 'Alex',
			verified: false,
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
		verified: boolean;
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
		verified: false,
		invitedBy: null,
		groups: [{
			id: 1,
			name: 'Group1',
			description: null,
		}],
	}, {
		id: 2,
		name: 'Andrew',
		verified: false,
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
			verified: boolean;
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
			verified: false,
			invitedBy: null,
		}],
	}, {
		id: 2,
		name: 'Group2',
		description: null,
		users: [{
			id: 2,
			name: 'Andrew',
			verified: false,
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
		verified: boolean;
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
		verified: false,
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
			verified: boolean;
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
			verified: false,
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
		verified: boolean;
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
		verified: false,
		invitedBy: null,
		groups: [],
	}, {
		id: 2,
		name: 'Andrew',
		verified: false,
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
			verified: boolean;
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
			verified: false,
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
		verified: boolean;
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
		verified: false,
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
		verified: false,
		invitedBy: null,
		groups: [{
			id: 2,
			name: 'Group2',
			description: null,
		}],
	}, {
		id: 1,
		name: 'Dan',
		verified: false,
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
			verified: boolean;
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
			verified: false,
			invitedBy: null,
		}],
	}, {
		id: 2,
		name: 'Group2',
		description: null,
		users: [{
			id: 3,
			name: 'Alex',
			verified: false,
			invitedBy: null,
		}, {
			id: 2,
			name: 'Andrew',
			verified: false,
			invitedBy: null,
		}],
	}, {
		id: 1,
		name: 'Group1',
		description: null,
		users: [{
			id: 1,
			name: 'Dan',
			verified: false,
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
		verified: boolean;
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
		verified: false,
		invitedBy: null,
		groups: [{
			id: 3,
			name: 'Group3',
			description: null,
		}],
	}, {
		id: 2,
		name: 'Andrew',
		verified: false,
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
			verified: boolean;
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
		verified: false,
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
				verified: boolean;
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
			verified: false,
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
			verified: boolean;
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
		verified: false,
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
				verified: boolean;
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
			verified: false,
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
			verified: boolean;
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
		verified: false,
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
				verified: boolean;
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
			verified: false,
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
			verified: boolean;
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
		verified: false,
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
				verified: boolean;
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
			verified: false,
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
			verified: boolean;
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
		verified: false,
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
				verified: boolean;
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
			verified: false,
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
			verified: boolean;
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
		verified: false,
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
				verified: boolean;
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
			verified: false,
			invitedBy: null,
		}],
	}, {
		id: 2,
		name: 'Group2',
		description: null,
		users: [{
			id: 3,
			name: 'Alex',
			verified: false,
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
			verified: boolean;
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
		verified: false,
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
		verified: false,
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
		verified: false,
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
				verified: boolean;
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
			verified: false,
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
			verified: false,
			invitedBy: null,
		}, {
			id: 3,
			name: 'Alex',
			lower: 'alex',
			verified: false,
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
			verified: false,
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
		verified: boolean;
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
		verified: false,
		invitedBy: null,
		group: null,
	}, {
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		group: {
			id: 3,
			name: 'Group3',
			description: null,
		},
	}, {
		id: 3,
		name: 'Alex',
		verified: false,
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
			verified: boolean;
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
			verified: false,
			invitedBy: null,
		},
	}, {
		id: 3,
		name: 'Group3',
		description: null,
		user: {
			id: 3,
			name: 'Alex',
			verified: false,
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
		verified: boolean;
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
		verified: false,
		invitedBy: null,
		groupsFiltered: [],
	}, {
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		groupsFiltered: [{
			id: 2,
			name: 'Group2',
			description: null,
		}],
	}, {
		id: 3,
		name: 'Alex',
		verified: false,
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
			verified: boolean;
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
			verified: false,
			invitedBy: null,
		}, {
			id: 3,
			name: 'Alex',
			verified: false,
			invitedBy: null,
		}],
	}, {
		id: 3,
		name: 'Group3',
		description: null,
		usersFiltered: [{
			id: 3,
			name: 'Alex',
			verified: false,
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
		verified: boolean;
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
		verified: false,
		invitedBy: null,
		groupsFiltered: [],
	}, {
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		groupsFiltered: [{
			id: 2,
			name: 'Group2',
			description: null,
		}],
	}, {
		id: 3,
		name: 'Alex',
		verified: false,
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
			verified: boolean;
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
			verified: false,
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
		verified: boolean;
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
		verified: false,
		invitedBy: null,
		postsFiltered: [],
	}, {
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		postsFiltered: [
			{ ownerId: 2, content: 'Post2.1' },
			{ ownerId: 2, content: 'Post2.2' },
			{ ownerId: 2, content: 'Post2.3' },
		],
	}, {
		id: 3,
		name: 'Alex',
		verified: false,
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
		verified: boolean;
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
		verified: false,
		invitedBy: null,
		postsFiltered: [],
	}, {
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
		postsFiltered: [
			{ ownerId: 2, content: 'Post2.2' },
		],
	}, {
		id: 3,
		name: 'Alex',
		verified: false,
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

test('[Find Many] Get users + filter users by posts', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	const date1 = new Date(5000);
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
		verified: boolean;
		invitedBy: number | null;
	}[]>();

	expect(usersWithPosts).toEqual([{
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
	}]);
});

test('[Find Many] Get users with posts + filter users by posts', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	const date1 = new Date(5000);
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
		verified: boolean;
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
		verified: false,
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
		verified: boolean;
		invitedBy: number | null;
	}[]>();

	expect(usersWithPosts).toEqual([{
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
	}, {
		id: 3,
		name: 'Alex',
		verified: false,
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
		verified: boolean;
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
		verified: false,
		invitedBy: null,
		posts: [{ id: 1, ownerId: 2, content: 'Post2', createdAt: date2 }],
	}, {
		id: 3,
		name: 'Alex',
		verified: false,
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
		verified: boolean;
		invitedBy: number | null;
	}[]>();

	expect(usersWithPosts).toEqual([{
		id: 1,
		name: 'Dan',
		verified: false,
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
		verified: boolean;
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
		verified: false,
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

	const date1 = new Date(5000);
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
		verified: boolean;
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
			verified: false,
			invitedBy: null,
			posts: [],
		},
		{
			id: 2,
			name: 'Andrew',
			verified: false,
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
			verified: false,
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

	const date1 = new Date(5000);
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
		verified: boolean;
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
			verified: false,
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
		verified: boolean;
		invitedBy: number | null;
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response).toStrictEqual([{
		id: 2,
		name: 'Andrew',
		verified: false,
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
		verified: boolean;
		invitedBy: number | null;
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response).toStrictEqual([{
		id: 2,
		name: 'Andrew',
		verified: false,
		invitedBy: null,
	}, {
		id: 3,
		name: 'Alex',
		verified: false,
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
		verified: boolean;
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
		verified: false,
		invitedBy: null,
		groups: [{
			id: 2,
			name: 'Group2',
			description: null,
		}],
	}, {
		id: 3,
		name: 'Alex',
		verified: false,
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
		verified: boolean;
		invitedBy: number | null;
	}[]>();

	response.sort((a, b) => (a.id > b.id) ? 1 : -1);

	expect(response).toStrictEqual([{
		id: 1,
		name: 'Dan',
		verified: false,
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
		verified: boolean;
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
		verified: false,
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
		verified: boolean;
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
		verified: false,
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
		verified: boolean;
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
		verified: false,
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
		verified: boolean;
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
			verified: false,
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
			verified: false,
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

test('[Find Many] Shortcut form placeholders in filters - eq', async () => {
	await db.insert(usersTable).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	const date1 = new Date(45000);
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

	const posts = await query.execute({
		id: 1,
	});

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

	const date1 = new Date(45000);
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

	const posts = await query.execute({
		id1: 1,
		id2: 2,
	});

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

	const date1 = new Date(45000);
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

	const posts = await query.execute({
		id1: 1,
		id2: 2,
	});

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

	const date1 = new Date(45000);
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

	const posts = await query.execute({
		id: 3,
	});

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

	const date1 = new Date(45000);
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
		verified: boolean;
		invitedBy: number | null;
	}[]>();

	expect(users).toEqual([
		{
			id: 1,
			name: 'Dan',
			verified: false,
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

	const date1 = new Date(45000);
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
		verified: boolean;
		invitedBy: number | null;
	}[]>();

	expect(users).toEqual([
		{
			id: 1,
			name: 'Dan',
			verified: false,
			invitedBy: null,
		},
		{
			id: 2,
			name: 'Andrew',
			verified: false,
			invitedBy: null,
		},
		{
			id: 3,
			name: 'Alex',
			verified: false,
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

	const date1 = new Date(45000);
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
		verified: boolean;
		invitedBy: number | null;
	}[]>();

	expect(users).toEqual([
		{
			id: 3,
			name: 'Alex',
			verified: false,
			invitedBy: null,
		},
	]);
});

test('alltypes', async () => {
	await db.execute(sql`
		CREATE TABLE \`all_types\` (
				\`serial\` serial AUTO_INCREMENT,
				\`blob\` blob,
				\`blob_str\` blob,
				\`bigint53\` bigint,
				\`bigint64\` bigint,
				\`bigint_string\` bigint,
				\`binary\` binary,
				\`boolean\` boolean,
				\`char\` char,
				\`date\` date,
				\`date_str\` date,
				\`datetime\` datetime,
				\`datetime_str\` datetime,
				\`decimal\` decimal,
				\`decimal_num\` decimal(30),
				\`decimal_big\` decimal(30),
				\`double\` double,
				\`float\` float,
				\`int\` int,
				\`json\` json,
				\`med_int\` mediumint,
				\`small_int\` smallint,
				\`real\` real,
				\`text\` text,
				\`time\` time,
				\`timestamp\` timestamp,
				\`timestamp_str\` timestamp,
				\`tiny_int\` tinyint,
				\`varbin\` varbinary(16),
				\`varchar\` varchar(255),
				\`year\` year,
				\`enum\` enum('enV1','enV2')
			);
	`);

	await db.insert(usersTable).values({
		id: 1,
		name: 'First',
	});

	await db.insert(allTypesTable).values({
		serial: 1,
		blob: Buffer.from('BYTES'),
		blobStr: 'BYTES',
		bigint53: 9007199254740991,
		bigint64: 5044565289845416380n,
		bigintString: '5044565289845416380',
		binary: '1',
		boolean: true,
		char: 'c',
		date: new Date(1741743161623),
		dateStr: new Date(1741743161623).toISOString().slice(0, 19).replace('T', ' '),
		datetime: new Date(1741743161623),
		datetimeStr: new Date(1741743161623).toISOString().slice(0, 19).replace('T', ' '),
		decimal: '47521',
		decimalNum: 9007199254740991,
		decimalBig: 5044565289845416380n,
		double: 15.35325689124218,
		enum: 'enV1',
		float: 1.048596,
		real: 1.048596,
		text: 'C4-',
		int: 621,
		json: {
			str: 'strval',
			arr: ['str', 10],
		},
		medInt: 560,
		smallInt: 14,
		time: '04:13:22',
		timestamp: new Date(1741743161623),
		timestampStr: new Date(1741743161623).toISOString().slice(0, 19).replace('T', ' '),
		tinyInt: 7,
		varbin: '1010110101001101',
		varchar: 'VCHAR',
		year: 2025,
	});

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
			serial: 1,
			blob: Buffer.from('BYTES'),
			blobStr: 'BYTES',
			bigint53: 9007199254740991,
			bigint64: 5044565289845416380n,
			bigintString: '5044565289845416380',
			binary: '1',
			boolean: true,
			char: 'c',
			date: new Date('2025-03-12T00:00:00.000Z'),
			dateStr: '2025-03-12',
			datetime: new Date('2025-03-12T01:32:42.000Z'),
			datetimeStr: '2025-03-12 01:32:41',
			decimal: '47521',
			decimalNum: 9007199254740991,
			decimalBig: 5044565289845416380n,
			double: 15.35325689124218,
			float: 1.0486,
			int: 621,
			json: { arr: ['str', 10], str: 'strval' },
			medInt: 560,
			smallInt: 14,
			real: 1.048596,
			text: 'C4-',
			time: '04:13:22',
			timestamp: new Date('2025-03-12T01:32:42.000Z'),
			timestampStr: '2025-03-12 01:32:41',
			tinyInt: 7,
			varbin: '1010110101001101',
			varchar: 'VCHAR',
			year: 2025,
			enum: 'enV1',
		},
	];

	expect(rawRes).toStrictEqual(expectedRes);
});

test('custom types', async () => {
	await db.execute(sql`
		CREATE TABLE \`custom_types\` (
			\`id\` int,
			\`big\` bigint,
			\`bytes\` blob,
			\`time\` timestamp,
			\`int\` int
		);
	`);

	await db.insert(customTypesTable).values({
		id: 1,
		big: 5044565289845416380n,
		bytes: Buffer.from('BYTES'),
		time: new Date(1741743161000),
		int: 250,
	});

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
			time: new Date(1741743161000),
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
