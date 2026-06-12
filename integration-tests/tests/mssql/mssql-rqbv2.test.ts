import { defineRelations, sql } from 'drizzle-orm';
import type { NodeMsSqlDatabase } from 'drizzle-orm/node-mssql';
import { drizzle } from 'drizzle-orm/node-mssql';
import { expect, expectTypeOf } from 'vitest';
import { test } from './instrumentation';
import * as schema from './mssql.schema';

const relations = defineRelations(
	schema,
	({ commentsTable, many, one, postsTable, usersTable }) => ({
		usersTable: {
			posts: many.postsTable({
				from: usersTable.id,
				to: postsTable.ownerId,
			}),
		},
		postsTable: {
			author: one.usersTable({
				from: postsTable.ownerId,
				to: usersTable.id,
			}),
			comments: many.commentsTable({
				from: postsTable.id,
				to: commentsTable.postId,
			}),
		},
		commentsTable: {
			author: one.usersTable({
				from: commentsTable.creator,
				to: usersTable.id,
			}),
			post: one.postsTable({
				from: commentsTable.postId,
				to: postsTable.id,
			}),
		},
	}),
);

test.beforeEach(async ({ client }) => {
	await client.query(`drop table if exists [comment_likes]`);
	await client.query(`drop table if exists [comments]`);
	await client.query(`drop table if exists [posts]`);
	await client.query(`drop table if exists [users_to_groups]`);
	await client.query(`drop table if exists [groups]`);
	await client.query(`drop table if exists [users]`);

	await client.query(`
		create table [users] (
			[id] int primary key not null,
			[name] varchar(100) not null,
			[verified] bit not null default 0,
			[invited_by] int null foreign key references [users]([id])
		)
	`);
	await client.query(`
		create table [posts] (
			[id] int identity primary key,
			[content] varchar(100) not null,
			[owner_id] int null foreign key references [users]([id]),
			[created_at] datetime not null default current_timestamp
		)
	`);
	await client.query(`
		create table [comments] (
			[id] int identity primary key,
			[content] varchar(100) not null,
			[creator] int null foreign key references [users]([id]),
			[post_id] int null foreign key references [posts]([id]),
			[created_at] datetime not null default current_timestamp
		)
	`);
});

async function seed(db: NodeMsSqlDatabase<typeof schema, typeof relations>) {
	await db.insert(schema.usersTable).values([
		{ id: 1, name: 'Dan', verified: true },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);

	await db.insert(schema.postsTable).values([
		{ content: 'Post1', ownerId: 1 },
		{ content: 'Post1.2', ownerId: 1 },
		{ content: 'Post2', ownerId: 2 },
	]);

	await db.insert(schema.commentsTable).values([
		{ content: 'Comment1', creator: 2, postId: 1 },
		{ content: 'Comment2', creator: 1, postId: 1 },
		{ content: 'Comment3', creator: 3, postId: 3 },
	]);
}

test('RQBv2 findMany resolves nested MSSQL relations', async ({ client }) => {
	const db = drizzle({ client, schema, relations });
	await seed(db);

	const result = await db.query.usersTable.findMany({
		columns: {
			id: true,
			name: true,
		},
		where: {
			posts: {
				content: {
					like: 'Post%',
				},
			},
		},
		orderBy: {
			id: 'asc',
		},
		with: {
			posts: {
				columns: {
					id: true,
					content: true,
					createdAt: true,
				},
				orderBy: {
					id: 'asc',
				},
				with: {
					comments: {
						columns: {
							content: true,
						},
						orderBy: {
							id: 'asc',
						},
					},
				},
			},
		},
	});

	expectTypeOf(result).toEqualTypeOf<{
		id: number;
		name: string;
		posts: {
			id: number;
			content: string;
			createdAt: Date;
			comments: {
				content: string;
			}[];
		}[];
	}[]>();

	expect(result).toHaveLength(2);
	expect(result[0]).toMatchObject({
		id: 1,
		name: 'Dan',
		posts: [
			{
				id: 1,
				content: 'Post1',
				comments: [{ content: 'Comment1' }, { content: 'Comment2' }],
			},
			{
				id: 2,
				content: 'Post1.2',
				comments: [],
			},
		],
	});
	expect(result[0]!.posts[0]!.createdAt).toBeInstanceOf(Date);
	expect(result[1]).toMatchObject({
		id: 2,
		name: 'Andrew',
		posts: [
			{
				id: 3,
				content: 'Post2',
				comments: [{ content: 'Comment3' }],
			},
		],
	});
});

test('RQBv2 findFirst resolves a single MSSQL relation and extras', async ({ client }) => {
	const db = drizzle({ client, schema, relations });
	await seed(db);

	const result = await db.query.postsTable.findFirst({
		columns: {
			id: true,
		},
		where: {
			author: {
				name: 'Dan',
			},
		},
		orderBy: {
			id: 'asc',
		},
		extras: {
			lowerContent: ({ content }, { sql }) => sql<string>`lower(${content})`,
		},
		with: {
			author: {
				columns: {
					name: true,
				},
			},
		},
	});

	expectTypeOf(result).toEqualTypeOf<
		{
			id: number;
			lowerContent: string;
			author: {
				name: string;
			} | null;
		} | undefined
	>();

	expect(result).toEqual({
		id: 1,
		lowerContent: 'post1',
		author: {
			name: 'Dan',
		},
	});
});

test('V1 _query still works on MSSQL', async ({ client }) => {
	const db = drizzle({ client, schema, relations });
	await seed(db);

	const result = await db._query.usersTable.findMany({
		columns: {
			id: true,
			name: true,
		},
		limit: 1,
		with: {
			posts: {
				columns: {
					content: true,
				},
			},
		},
	});

	expect(result).toHaveLength(1);
	expect(result[0]).toMatchObject({
		id: 1,
		name: 'Dan',
	});
	expect(result[0]!.posts.map((post) => post.content).sort()).toEqual(['Post1', 'Post1.2']);
});
