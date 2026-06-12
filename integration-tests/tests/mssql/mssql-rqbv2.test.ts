import SchemaBuilder from '@pothos/core';
import DrizzlePlugin, { type DrizzleClient } from '@pothos/plugin-drizzle';
import { defineRelations, sql } from 'drizzle-orm';
import { getTableConfig, int, mssqlSchema, varchar } from 'drizzle-orm/mssql-core';
import type { NodeMsSqlDatabase } from 'drizzle-orm/node-mssql';
import { drizzle } from 'drizzle-orm/node-mssql';
import type { graphql as graphqlFn } from 'graphql';
import { createRequire } from 'node:module';
import { expect, expectTypeOf } from 'vitest';
import { test } from './instrumentation';
import * as schema from './mssql.schema';

const require = createRequire(import.meta.url);
const { graphql } = require('graphql') as { graphql: typeof graphqlFn };
const drizzleOrm = require('drizzle-orm') as typeof import('drizzle-orm');
const nodeMssql = require('drizzle-orm/node-mssql') as typeof import('drizzle-orm/node-mssql');

const rqbv2Schema = mssqlSchema('rqbv2_schema');

const scopedUsers = rqbv2Schema.table('users', {
	id: int('id').primaryKey().notNull(),
	name: varchar('name', { length: 100 }).notNull(),
});

const scopedPosts = rqbv2Schema.table('posts', {
	id: int('id').primaryKey().notNull(),
	content: varchar('content', { length: 100 }).notNull(),
	ownerId: int('owner_id').notNull(),
});

const scopedUserView = rqbv2Schema.view('users_view', {
	id: int('id').primaryKey().notNull(),
	name: varchar('name', { length: 100 }).notNull(),
}).existing();

const scopedSchema = {
	scopedPosts,
	scopedUsers,
	scopedUserView,
};

const scopedRelations = defineRelations(
	scopedSchema,
	({ many, one, scopedPosts, scopedUsers, scopedUserView }) => ({
		scopedUsers: {
			posts: many.scopedPosts({
				from: scopedUsers.id,
				to: scopedPosts.ownerId,
			}),
		},
		scopedUserView: {
			posts: many.scopedPosts({
				from: scopedUserView.id,
				to: scopedPosts.ownerId,
			}),
		},
		scopedPosts: {
			owner: one.scopedUsers({
				from: scopedPosts.ownerId,
				to: scopedUsers.id,
			}),
			ownerView: one.scopedUserView({
				from: scopedPosts.ownerId,
				to: scopedUserView.id,
			}),
		},
	}),
);

const relations = defineRelations(
	schema,
	({ commentsTable, groupsTable, many, one, postsTable, usersTable, usersToGroupsTable }) => ({
		usersTable: {
			posts: many.postsTable({
				from: usersTable.id,
				to: postsTable.ownerId,
			}),
			groups: many.groupsTable({
				from: usersTable.id.through(usersToGroupsTable.userId),
				to: groupsTable.id.through(usersToGroupsTable.groupId),
			}),
		},
		groupsTable: {
			users: many.usersTable({
				from: groupsTable.id.through(usersToGroupsTable.groupId),
				to: usersTable.id.through(usersToGroupsTable.userId),
			}),
		},
		usersToGroupsTable: {
			user: one.usersTable({
				from: usersToGroupsTable.userId,
				to: usersTable.id,
			}),
			group: one.groupsTable({
				from: usersToGroupsTable.groupId,
				to: groupsTable.id,
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
	await client.query(`if object_id(N'[rqbv2_schema].[posts]', N'U') is not null drop table [rqbv2_schema].[posts]`);
	await client.query(
		`if object_id(N'[rqbv2_schema].[users_view]', N'V') is not null drop view [rqbv2_schema].[users_view]`,
	);
	await client.query(`if object_id(N'[rqbv2_schema].[users]', N'U') is not null drop table [rqbv2_schema].[users]`);
	await client.query(`if schema_id(N'rqbv2_schema') is not null exec(N'drop schema [rqbv2_schema]')`);
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
		create table [groups] (
			[id] int primary key not null,
			[name] varchar(100) not null,
			[description] varchar(100) null
		)
	`);
	await client.query(`
		create table [users_to_groups] (
			[id] int identity primary key,
			[user_id] int not null foreign key references [users]([id]),
			[group_id] int not null foreign key references [groups]([id]),
			constraint [uq_users_to_groups] unique ([user_id], [group_id])
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

async function seedGroups(db: NodeMsSqlDatabase<typeof schema, typeof relations>) {
	await db.insert(schema.groupsTable).values([
		{ id: 1, name: 'Admins' },
		{ id: 2, name: 'Guests' },
	]);

	await db.insert(schema.usersToGroupsTable).values([
		{ userId: 1, groupId: 1 },
		{ userId: 1, groupId: 2 },
		{ userId: 2, groupId: 2 },
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

test('RQBv2 resolves MSSQL through relations', async ({ client }) => {
	const db = drizzle({ client, schema, relations });
	await seed(db);
	await seedGroups(db);

	const result = await db.query.usersTable.findMany({
		columns: {
			id: true,
			name: true,
		},
		orderBy: {
			id: 'asc',
		},
		with: {
			groups: {
				columns: {
					id: true,
					name: true,
				},
				orderBy: {
					id: 'asc',
				},
			},
		},
	});

	expect(result).toEqual([
		{
			id: 1,
			name: 'Dan',
			groups: [
				{ id: 1, name: 'Admins' },
				{ id: 2, name: 'Guests' },
			],
		},
		{
			id: 2,
			name: 'Andrew',
			groups: [{ id: 2, name: 'Guests' }],
		},
		{
			id: 3,
			name: 'Alex',
			groups: [],
		},
	]);
});

test('RQBv2 prepared MSSQL query resolves placeholders', async ({ client }) => {
	const db = drizzle({ client, schema, relations });
	await seed(db);

	const prepared = db.query.postsTable.findMany({
		columns: {
			id: true,
			content: true,
		},
		where: {
			ownerId: sql.placeholder('ownerId'),
		},
		orderBy: {
			id: 'asc',
		},
		limit: sql.placeholder('limit'),
	}).prepare();

	const result = await prepared.execute({
		limit: 2,
		ownerId: 1,
	});

	expect(result).toEqual([
		{ id: 1, content: 'Post1' },
		{ id: 2, content: 'Post1.2' },
	]);
});

test('RQBv2 resolves schema-qualified view relations', async ({ client }) => {
	const db = drizzle({ client, schema: scopedSchema, relations: scopedRelations });

	await client.query(`create schema [rqbv2_schema]`);
	await client.query(`
		create table [rqbv2_schema].[users] (
			[id] int primary key not null,
			[name] varchar(100) not null
		)
	`);
	await client.query(`
		create table [rqbv2_schema].[posts] (
			[id] int primary key not null,
			[content] varchar(100) not null,
			[owner_id] int not null foreign key references [rqbv2_schema].[users]([id])
		)
	`);
	await client.query(`
		create view [rqbv2_schema].[users_view] as
		select [id], [name] from [rqbv2_schema].[users] where [id] < 3
	`);

	await db.insert(scopedUsers).values([
		{ id: 1, name: 'Dan' },
		{ id: 2, name: 'Andrew' },
		{ id: 3, name: 'Alex' },
	]);
	await db.insert(scopedPosts).values([
		{ id: 1, content: 'Post1', ownerId: 1 },
		{ id: 2, content: 'Post1.2', ownerId: 1 },
		{ id: 3, content: 'Post2', ownerId: 2 },
		{ id: 4, content: 'Post3', ownerId: 3 },
	]);

	const result = await db.query.scopedUserView.findMany({
		columns: {
			id: true,
			name: true,
		},
		orderBy: {
			id: 'asc',
		},
		with: {
			posts: {
				columns: {
					id: true,
					content: true,
				},
				orderBy: {
					id: 'asc',
				},
			},
		},
	});

	expect(result).toEqual([
		{
			id: 1,
			name: 'Dan',
			posts: [
				{ id: 1, content: 'Post1' },
				{ id: 2, content: 'Post1.2' },
			],
		},
		{
			id: 2,
			name: 'Andrew',
			posts: [{ id: 3, content: 'Post2' }],
		},
	]);
});

test('Pothos plugin resolves an MSSQL RQBv2 relation field', async ({ client }) => {
	const seedDb = drizzle({ client, schema, relations });
	await seed(seedDb);

	const pothosRelations = drizzleOrm.defineRelations(
		schema,
		({ many, one, postsTable, usersTable }) => ({
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
			},
		}),
	);
	const db = nodeMssql.drizzle({ client, schema, relations: pothosRelations });

	interface PothosTypes {
		DrizzleRelations: typeof pothosRelations;
	}

	const builder = new SchemaBuilder<PothosTypes>({
		plugins: [DrizzlePlugin],
		drizzle: {
			client: {
				_: db._,
				query: db.query,
				$count: () => drizzleOrm.sql<number>`0`,
			} satisfies DrizzleClient,
			getTableConfig,
			relations: pothosRelations,
		},
	});

	const PostRef = builder.drizzleObject('postsTable', {
		name: 'RQBv2Post',
		select: {
			columns: {
				id: true,
				content: true,
			},
		},
		fields: (t) => ({
			id: t.exposeInt('id'),
			content: t.exposeString('content'),
		}),
	});

	builder.drizzleObject('usersTable', {
		name: 'RQBv2User',
		fields: (t) => ({
			id: t.exposeInt('id'),
			name: t.exposeString('name'),
			posts: t.relatedField('posts', {
				type: [PostRef],
				select: () => ({
					with: {
						posts: {
							columns: {
								id: true,
								content: true,
							},
							orderBy: {
								id: 'asc',
							},
						},
					},
				}),
				resolve: (user) => user.posts,
			}),
		}),
	});

	builder.queryType({
		fields: (t) => ({
			users: t.drizzleField({
				type: ['usersTable'],
				resolve: (query) =>
					db.query.usersTable.findMany(query({
						orderBy: {
							id: 'asc',
						},
					})),
			}),
		}),
	});

	const result = await graphql({
		schema: builder.toSchema(),
		source: `{
			users {
				id
				name
				posts {
					id
					content
				}
			}
		}`,
		contextValue: {},
	});

	expect(result.errors).toBeUndefined();
	expect(result.data).toEqual({
		users: [
			{
				id: 1,
				name: 'Dan',
				posts: [
					{ id: 1, content: 'Post1' },
					{ id: 2, content: 'Post1.2' },
				],
			},
			{
				id: 2,
				name: 'Andrew',
				posts: [{ id: 3, content: 'Post2' }],
			},
			{
				id: 3,
				name: 'Alex',
				posts: [],
			},
		],
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
