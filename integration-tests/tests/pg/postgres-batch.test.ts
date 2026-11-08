import { defineRelations, DrizzleQueryError, eq, sql } from 'drizzle-orm';
import { relations as oldRels } from 'drizzle-orm/_relations';
import { type AnyPgColumn, integer, pgTable, primaryKey, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { drizzle, type PostgresDatabase, type PostgresQueryResult } from 'drizzle-orm/postgres';
import { Client as ClientNodePostgres } from 'pg';
import { describe, expect, expectTypeOf, test as base } from 'vitest';
import { _push, preparePostgres, recreateDatabases, testDatabase } from './instrumentation';

export const usersTable = pgTable('users', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	verified: integer('verified').notNull().default(0),
	invitedBy: integer('invited_by').references((): AnyPgColumn => usersTable.id),
});
export const usersConfig = oldRels(usersTable, ({ one, many }) => ({
	invitee: one(usersTable, {
		fields: [usersTable.invitedBy],
		references: [usersTable.id],
	}),
	usersToGroups: many(usersToGroupsTable),
	posts: many(postsTable),
}));

export const groupsTable = pgTable('groups', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	description: text('description'),
});
export const groupsConfig = oldRels(groupsTable, ({ many }) => ({
	usersToGroups: many(usersToGroupsTable),
}));

export const usersToGroupsTable = pgTable(
	'users_to_groups',
	{
		id: serial('id'),
		userId: integer('user_id').notNull().references(() => usersTable.id),
		groupId: integer('group_id').notNull().references(() => groupsTable.id),
	},
	(t) => [primaryKey({ columns: [t.userId, t.groupId] })],
);
export const usersToGroupsConfig = oldRels(usersToGroupsTable, ({ one }) => ({
	group: one(groupsTable, {
		fields: [usersToGroupsTable.groupId],
		references: [groupsTable.id],
	}),
	user: one(usersTable, {
		fields: [usersToGroupsTable.userId],
		references: [usersTable.id],
	}),
}));

export const postsTable = pgTable('posts', {
	id: serial('id').primaryKey(),
	content: text('content').notNull(),
	ownerId: integer('owner_id').references(() => usersTable.id),
	createdAt: timestamp('created_at').notNull().defaultNow(),
});
export const postsConfig = oldRels(postsTable, ({ one, many }) => ({
	author: one(usersTable, {
		fields: [postsTable.ownerId],
		references: [usersTable.id],
	}),
	comments: many(commentsTable),
}));

export const commentsTable = pgTable('comments', {
	id: serial('id').primaryKey(),
	content: text('content').notNull(),
	creator: integer('creator').references(() => usersTable.id),
	postId: integer('post_id').references(() => postsTable.id),
	createdAt: timestamp('created_at').notNull().defaultNow(),
});
export const commentsConfig = oldRels(commentsTable, ({ one, many }) => ({
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

export const commentLikesTable = pgTable('comment_likes', {
	id: serial('id').primaryKey(),
	creator: integer('creator').references(() => usersTable.id),
	commentId: integer('comment_id').references(() => commentsTable.id),
	createdAt: timestamp('created_at').notNull().defaultNow(),
});
export const commentLikesConfig = oldRels(commentLikesTable, ({ one }) => ({
	comment: one(commentsTable, {
		fields: [commentLikesTable.commentId],
		references: [commentsTable.id],
	}),
	author: one(usersTable, {
		fields: [commentLikesTable.creator],
		references: [usersTable.id],
	}),
}));

export const schema = {
	usersTable,
	postsTable,
	commentsTable,
	commentLikesTable,
	usersToGroupsTable,
	groupsTable,
	commentLikesConfig,
	commentsConfig,
	postsConfig,
	usersToGroupsConfig,
	groupsConfig,
	usersConfig,
};

export const relations = defineRelations(schema);

const DATABASE = testDatabase('db2');

/** A connection string to the suite's database */
const databaseUrl = (database: string) => {
	const url = new URL(process.env['PG_CONNECTION_STRING']!);
	url.pathname = `/${database}`;
	return url.toString();
};

const test = base.extend<{ db: PostgresDatabase<typeof relations> }>({
	db: [
		// oxlint-disable-next-line no-empty-pattern
		async ({}, use) => {
			await recreateDatabases([DATABASE]);
			const { client, query } = await preparePostgres(DATABASE);
			await _push(query, schema);

			const db = drizzle({ client, relations });
			await use(db);
		},
		{ scope: 'file' },
	],
});

const expectQueryError = (error: unknown, query: string, code: string) => {
	expect(error).toBeInstanceOf(DrizzleQueryError);
	expect((error as DrizzleQueryError).query).toBe(query);
	expect((error as DrizzleQueryError).cause).toMatchObject({ code });
};

type Settled<T> = PromiseFulfilledResult<T> | { status: 'rejected'; reason: DrizzleQueryError };

const orphanPost = { id: 1, content: 'orphan', ownerId: 9999 };

describe('batch', () => {
	test.beforeEach(async ({ db }) => {
		await db.execute(
			`truncate table users, groups, users_to_groups, posts, comments, comment_likes RESTART IDENTITY CASCADE;`,
		);
	});

	test('batch api example', async ({ db }) => {
		const batchResponse = await db.batch([
			db.insert(usersTable).values({ id: 1, name: 'John' }).returning({
				id: usersTable.id,
				invitedBy: usersTable.invitedBy,
			}),
			db.insert(usersTable).values({ id: 2, name: 'Dan' }),
			db.select().from(usersTable),
		]);

		expectTypeOf(batchResponse).toEqualTypeOf<[
			{
				id: number;
				invitedBy: number | null;
			}[],
			PostgresQueryResult<never>,
			{
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			}[],
		]>();

		expect(batchResponse.length).eq(3);

		expect(batchResponse[0]).toEqual([{
			id: 1,
			invitedBy: null,
		}]);

		expect(batchResponse[1]).toMatchObject({ rows: [], rowCount: 1 });

		expect(batchResponse[2]).toEqual([
			{ id: 1, name: 'John', verified: 0, invitedBy: null },
			{ id: 2, name: 'Dan', verified: 0, invitedBy: null },
		]);
	});

	// batch api only relational many
	test('insert + findMany', async ({ db }) => {
		const batchResponse = await db.batch([
			db.insert(usersTable).values({ id: 1, name: 'John' }).returning({ id: usersTable.id }),
			db.insert(usersTable).values({ id: 2, name: 'Dan' }),
			db.query.usersTable.findMany({}),
		]);

		expectTypeOf(batchResponse).toEqualTypeOf<[
			{
				id: number;
			}[],
			PostgresQueryResult<never>,
			{
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			}[],
		]>();

		expect(batchResponse.length).eq(3);

		expect(batchResponse[0]).toEqual([{
			id: 1,
		}]);

		expect(batchResponse[1]).toMatchObject({ rows: [], rowCount: 1 });

		expect(batchResponse[2]).toEqual([
			{ id: 1, name: 'John', verified: 0, invitedBy: null },
			{ id: 2, name: 'Dan', verified: 0, invitedBy: null },
		]);
	});

	// batch api relational many + one
	test('insert + findMany + findFirst', async ({ db }) => {
		const batchResponse = await db.batch([
			db.insert(usersTable).values({ id: 1, name: 'John' }).returning({ id: usersTable.id }),
			db.insert(usersTable).values({ id: 2, name: 'Dan' }),
			db.query.usersTable.findMany({}),
			db.query.usersTable.findFirst({}),
		]);

		expectTypeOf(batchResponse).toEqualTypeOf<[
			{
				id: number;
			}[],
			PostgresQueryResult<never>,
			{
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			}[],
			{
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			} | undefined,
		]>();

		expect(batchResponse.length).eq(4);

		expect(batchResponse[0]).toEqual([{
			id: 1,
		}]);

		expect(batchResponse[1]).toMatchObject({ rows: [], rowCount: 1 });

		expect(batchResponse[2]).toEqual([
			{ id: 1, name: 'John', verified: 0, invitedBy: null },
			{ id: 2, name: 'Dan', verified: 0, invitedBy: null },
		]);

		expect(batchResponse[3]).toEqual(
			{ id: 1, name: 'John', verified: 0, invitedBy: null },
		);
	});

	test('insert + db.execute', async ({ db }) => {
		const batchResponse = await db.batch([
			db.insert(usersTable).values({ id: 1, name: 'John' }).returning({ id: usersTable.id }),
			db.execute(sql`insert into users (id, name) values (2, 'Dan')`),
		]);

		expectTypeOf(batchResponse).toEqualTypeOf<[
			{
				id: number;
			}[],
			PostgresQueryResult<Record<string, unknown>>,
		]>();

		expect(batchResponse.length).eq(2);

		expect(batchResponse[0]).toEqual([{
			id: 1,
		}]);

		expect(batchResponse[1]).toMatchObject({ rows: [], rowCount: 1 });
	});

	// batch api combined rqb + raw call
	test('insert + findManyWith + db.all', async ({ db }) => {
		const batchResponse = await db.batch([
			db.insert(usersTable).values({ id: 1, name: 'John' }).returning({ id: usersTable.id }),
			db.insert(usersTable).values({ id: 2, name: 'Dan' }),
			db.query.usersTable.findMany({}),
			db.execute<typeof usersTable.$inferSelect>(sql`select * from users`),
		]);

		expectTypeOf(batchResponse).toEqualTypeOf<[
			{
				id: number;
			}[],
			PostgresQueryResult<never>,
			{
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			}[],
			PostgresQueryResult<{
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			}>,
		]>();

		expect(batchResponse.length).eq(4);

		expect(batchResponse[0]).toEqual([{
			id: 1,
		}]);

		expect(batchResponse[1]).toMatchObject({ rows: [], rowCount: 1 });

		expect(batchResponse[2]).toEqual([
			{ id: 1, name: 'John', verified: 0, invitedBy: null },
			{ id: 2, name: 'Dan', verified: 0, invitedBy: null },
		]);

		expect(batchResponse[3]).toMatchObject({
			rows: [
				{ id: 1, name: 'John', verified: 0, invited_by: null },
				{ id: 2, name: 'Dan', verified: 0, invited_by: null },
			],
		});
	});

	// batch api for insert + update + select
	test('insert + update + select + select partial', async ({ db }) => {
		const batchResponse = await db.batch([
			db.insert(usersTable).values({ id: 1, name: 'John' }).returning({ id: usersTable.id }),
			db.update(usersTable).set({ name: 'Dan' }).where(eq(usersTable.id, 1)),
			db.query.usersTable.findMany({}),
			db.select().from(usersTable).where(eq(usersTable.id, 1)),
			db.select({ id: usersTable.id, invitedBy: usersTable.invitedBy }).from(usersTable),
		]);

		expectTypeOf(batchResponse).toEqualTypeOf<[
			{
				id: number;
			}[],
			PostgresQueryResult<never>,
			{
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			}[],
			{
				id: number;
				name: string;
				verified: number;
				invitedBy: number | null;
			}[],
			{
				id: number;
				invitedBy: number | null;
			}[],
		]>();

		expect(batchResponse.length).eq(5);

		expect(batchResponse[0]).toEqual([{
			id: 1,
		}]);

		expect(batchResponse[1]).toMatchObject({ rows: [], rowCount: 1 });

		expect(batchResponse[2]).toEqual([
			{ id: 1, name: 'Dan', verified: 0, invitedBy: null },
		]);

		expect(batchResponse[3]).toEqual([
			{ id: 1, name: 'Dan', verified: 0, invitedBy: null },
		]);

		expect(batchResponse[4]).toEqual([
			{ id: 1, invitedBy: null },
		]);
	});

	// batch api for insert + delete + select
	test('insert + delete + select + select partial', async ({ db }) => {
		const batchResponse = await db.batch([
			db.insert(usersTable).values({ id: 1, name: 'John' }).returning({ id: usersTable.id }),
			db.insert(usersTable).values({ id: 2, name: 'Dan' }),
			db.delete(usersTable).where(eq(usersTable.id, 1)).returning({
				id: usersTable.id,
				invitedBy: usersTable.invitedBy,
			}),
			db.query.usersTable.findFirst({
				columns: {
					id: true,
					invitedBy: true,
				},
			}),
		]);

		expectTypeOf(batchResponse).toEqualTypeOf<[
			{
				id: number;
			}[],
			PostgresQueryResult<never>,
			{
				id: number;
				invitedBy: number | null;
			}[],
			{
				id: number;
				invitedBy: number | null;
			} | undefined,
		]>();

		expect(batchResponse.length).eq(4);

		expect(batchResponse[0]).toEqual([{
			id: 1,
		}]);

		expect(batchResponse[1]).toMatchObject({ rows: [], rowCount: 1 });

		expect(batchResponse[2]).toEqual([
			{ id: 1, invitedBy: null },
		]);

		expect(batchResponse[3]).toEqual(
			{ id: 2, invitedBy: null },
		);
	});

	test('select raw', async ({ db }) => {
		await db.insert(usersTable).values([{ id: 1, name: 'John' }, { id: 2, name: 'Dan' }]);
		const batchResponse = await db.batch([
			db.execute<{
				id: number;
				name: string;
				verified: number;
				invited_by: number | null;
			}>(sql`select * from users`),
			db.execute<{
				id: number;
				name: string;
				verified: number;
				invited_by: number | null;
			}>(sql`select * from users where id = 1`),
		]);

		expectTypeOf(batchResponse).toEqualTypeOf<[
			PostgresQueryResult<{
				id: number;
				name: string;
				verified: number;
				invited_by: number | null;
			}>,
			PostgresQueryResult<{
				id: number;
				name: string;
				verified: number;
				invited_by: number | null;
			}>,
		]>();

		expect(batchResponse.length).eq(2);

		expect(batchResponse[0]).toMatchObject({
			rows: [
				{ id: 1, name: 'John', verified: 0, invited_by: null },
				{ id: 2, name: 'Dan', verified: 0, invited_by: null },
			],
		});

		expect(batchResponse[1]).toMatchObject({
			rows: [
				{ id: 1, name: 'John', verified: 0, invited_by: null },
			],
		});
	});

	test('rolls the whole set back on error', async ({ db }) => {
		await db.insert(usersTable).values({ id: 1, name: 'Survivor' });

		const failing = db.insert(postsTable).values(orphanPost);
		const error = await db.batch([
			db.insert(usersTable).values({ id: 2, name: 'Doomed' }),
			failing,
			// runs in the already-aborted transaction and fails too - must not be the one reported
			db.select().from(usersTable),
		]).catch((e) => e);
		expectQueryError(error, failing.toSQL().sql, '23503');

		expect(await db.select({ name: usersTable.name }).from(usersTable)).toEqual([{ name: 'Survivor' }]);
	});

	test('rollback covers DDL', async ({ db }) => {
		await db.execute(sql`drop table if exists pg_batch_ddl`);

		const error = await db.batch([
			db.execute(sql`create table pg_batch_ddl (id integer primary key)`),
			db.execute(sql`insert into pg_batch_ddl values (1)`),
			db.execute(sql`insert into pg_batch_ddl values (1) -- dup`),
		]).catch((e) => e);
		expectQueryError(error, 'insert into pg_batch_ddl values (1) -- dup', '23505');

		const present = await db.execute<{ present: boolean }>(
			sql`select to_regclass('public.pg_batch_ddl') is not null as present`,
		);
		expect(present.rows[0]!.present).toBe(false);
	});

	test('honours transaction options', async ({ db }) => {
		await db.insert(usersTable).values({ id: 1, name: 'ReadMe' });

		const res = await db.batch(
			[
				db.select({ name: usersTable.name }).from(usersTable),
				db.execute<{ iso: string; ro: string; def: string }>(
					sql`select current_setting('transaction_isolation') as iso, current_setting('transaction_read_only') as ro, current_setting('transaction_deferrable') as def`,
				),
			],
			{ isolation: 'serializable', readOnly: true, deferrable: true },
		);
		expect(res[0]).toEqual([{ name: 'ReadMe' }]);
		expect(res[1].rows).toEqual([{ iso: 'serializable', ro: 'on', def: 'on' }]);

		const failing = db.insert(usersTable).values({ id: 2, name: 'Nope' });
		const error = await db.batch([failing], { readOnly: true }).catch((e) => e);
		expectQueryError(error, failing.toSQL().sql, '25006');
	});

	test('runs on an exported snapshot', async ({ db }) => {
		await db.insert(usersTable).values({ id: 1, name: 'Before' });

		const exporter = new ClientNodePostgres({ connectionString: databaseUrl(DATABASE) });
		await exporter.connect();
		try {
			await exporter.query('begin isolation level repeatable read');
			const snapshot = (await exporter.query<{ s: string }>('select pg_export_snapshot() as s')).rows[0]!.s;
			// committed after the export: invisible to the snapshot
			await db.insert(usersTable).values({ id: 2, name: 'After' });

			const res = await db.batch([
				db.select({ name: usersTable.name }).from(usersTable).orderBy(usersTable.id),
				db.execute<{ iso: string }>(sql`select current_setting('transaction_isolation') as iso`),
			], { snapshot, isolation: 'repeatable read' });
			expect(res[0]).toEqual([{ name: 'Before' }]);
			expect(res[1].rows).toEqual([{ iso: 'repeatable read' }]);

			// read committed can't import a snapshot - an error that belongs to no query
			const error = await db.batch(
				[db.select().from(usersTable)],
				// @ts-expect-error - `snapshot` needs `isolation: 'repeatable read' | 'serializable'`
				{ snapshot, isolation: 'read committed' },
			).catch((e) => e);
			expect(error).not.toBeInstanceOf(DrizzleQueryError);
			expect(error).toMatchObject({ code: '0A000' });

			await exporter.query('commit');
		} finally {
			await exporter.end();
		}

		expect(await db.select({ name: usersTable.name }).from(usersTable).orderBy(usersTable.id)).toEqual([
			{ name: 'Before' },
			{ name: 'After' },
		]);
	});

	test('an error that belongs to no query (COMMIT) is not remapped', async ({ db }) => {
		await db.execute(sql`drop table if exists pg_batch_deferred`);
		await db.execute(sql`create table pg_batch_deferred (
			id integer primary key,
			ref integer references pg_batch_deferred (id) deferrable initially deferred
		)`);
		try {
			// every statement succeeds; the deferred FK is only checked, and fails, at COMMIT
			const error = await db.batch([
				db.execute(sql`insert into pg_batch_deferred values (1, 9999)`),
				db.execute(sql`select 1`),
			]).catch((e) => e);
			expect(error).not.toBeInstanceOf(DrizzleQueryError);
			expect(error).toMatchObject({ code: '23503' });
		} finally {
			await db.execute(sql`drop table if exists pg_batch_deferred`);
		}
	});
});

describe('pipeline', () => {
	test.beforeEach(async ({ db }) => {
		await db.execute(
			`truncate table users, groups, users_to_groups, posts, comments, comment_likes RESTART IDENTITY CASCADE;`,
		);
	});

	test('api example', async ({ db }) => {
		await db.insert(usersTable).values([{ id: 1, name: 'John' }, { id: 2, name: 'Dan' }]);

		const response = await db.pipeline([
			db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).orderBy(usersTable.id),
			db.insert(usersTable).values({ id: 3, name: 'Jane' }).returning({ id: usersTable.id }),
			db.update(usersTable).set({ verified: 1 }).where(eq(usersTable.id, 1)),
			db.query.usersTable.findFirst({ columns: { id: true, name: true }, where: { id: 2 } }),
			db.execute<{ one: number }>(sql`select 1 as one`),
		]);

		expectTypeOf(response).toEqualTypeOf<[
			Settled<{ id: number; name: string }[]>,
			Settled<{ id: number }[]>,
			Settled<PostgresQueryResult<never>>,
			Settled<{ id: number; name: string } | undefined>,
			Settled<PostgresQueryResult<{ one: number }>>,
		]>();

		expect(response.length).eq(5);
		expect(response[0]).toEqual({
			status: 'fulfilled',
			value: [{ id: 1, name: 'John' }, { id: 2, name: 'Dan' }],
		});
		expect(response[1]).toEqual({ status: 'fulfilled', value: [{ id: 3 }] });
		expect(response[2]).toMatchObject({ status: 'fulfilled', value: { rows: [], rowCount: 1 } });
		expect(response[3]).toEqual({ status: 'fulfilled', value: { id: 2, name: 'Dan' } });
		expect(response[4]).toMatchObject({ status: 'fulfilled', value: { rows: [{ one: 1 }] } });

		expect(
			await db.select({ id: usersTable.id, verified: usersTable.verified }).from(usersTable).orderBy(usersTable.id),
		).toEqual([
			{ id: 1, verified: 1 },
			{ id: 2, verified: 0 },
			{ id: 3, verified: 0 },
		]);
	});

	test('never rejects: every query runs, failures come back as rejected entries', async ({ db }) => {
		const failing = db.insert(postsTable).values(orphanPost);
		const response = await db.pipeline([
			db.insert(usersTable).values({ id: 1, name: 'Survivor' }),
			failing,
			db.insert(usersTable).values({ id: 2, name: 'After' }).returning({ id: usersTable.id }),
			db.execute(sql`select 1/0`),
		]);

		expect(response.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled', 'rejected']);
		if (response[1].status === 'rejected') expectTypeOf(response[1].reason).toEqualTypeOf<DrizzleQueryError>();
		expectQueryError(response[1].status === 'rejected' && response[1].reason, failing.toSQL().sql, '23503');
		expect(response[2]).toEqual({ status: 'fulfilled', value: [{ id: 2 }] });
		expectQueryError(response[3].status === 'rejected' && response[3].reason, 'select 1/0', '22012');

		// no transaction: nothing is rolled back
		expect(await db.select({ name: usersTable.name }).from(usersTable).orderBy(usersTable.id)).toEqual([
			{ name: 'Survivor' },
			{ name: 'After' },
		]);
	});

	test('settles exactly like parallel', async ({ db }) => {
		const set = () =>
			[
				db.select({ id: usersTable.id }).from(usersTable).orderBy(usersTable.id),
				db.insert(postsTable).values(orphanPost),
				db.execute<{ one: number }>(sql`select 1 as one`),
				db.execute(sql`select 1/0`),
			] as const;
		await db.insert(usersTable).values({ id: 1, name: 'John' });

		const piped = await db.pipeline(set());
		const fanned = await db.parallel(set());
		expectTypeOf(piped).toEqualTypeOf(fanned);

		// same statuses and values; errors compared by what they name
		const strip = (response: typeof piped) =>
			response.map((r) =>
				r.status === 'fulfilled'
					? r
					: { status: r.status, query: r.reason.query, code: (r.reason.cause as { code?: string }).code }
			);
		expect(strip(piped)).toMatchObject(strip(fanned) as any);
		expect(strip(fanned)).toMatchObject(strip(piped) as any);
		expect(piped.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled', 'rejected']);
		for (const r of [...piped, ...fanned]) {
			if (r.status === 'rejected') expect(r.reason).toBeInstanceOf(DrizzleQueryError);
		}
	});
});

describe('parallel', () => {
	test.beforeEach(async ({ db }) => {
		await db.execute(
			`truncate table users, groups, users_to_groups, posts, comments, comment_likes RESTART IDENTITY CASCADE;`,
		);
	});

	test('api example', async ({ db }) => {
		await db.insert(usersTable).values([{ id: 1, name: 'John' }, { id: 2, name: 'Dan' }]);

		const response = await db.parallel([
			db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).orderBy(usersTable.id),
			db.insert(usersTable).values({ id: 3, name: 'Jane' }).returning({ id: usersTable.id }),
			db.update(usersTable).set({ verified: 1 }).where(eq(usersTable.id, 1)),
			db.query.usersTable.findFirst({ columns: { id: true, name: true }, where: { id: 2 } }),
			db.execute<{ one: number }>(sql`select 1 as one`),
		]);

		expectTypeOf(response).toEqualTypeOf<[
			Settled<{ id: number; name: string }[]>,
			Settled<{ id: number }[]>,
			Settled<PostgresQueryResult<never>>,
			Settled<{ id: number; name: string } | undefined>,
			Settled<PostgresQueryResult<{ one: number }>>,
		]>();

		expect(response.length).eq(5);
		expect(response[0]).toEqual({
			status: 'fulfilled',
			value: [{ id: 1, name: 'John' }, { id: 2, name: 'Dan' }],
		});
		expect(response[1]).toEqual({ status: 'fulfilled', value: [{ id: 3 }] });
		expect(response[2]).toMatchObject({ status: 'fulfilled', value: { rows: [], rowCount: 1 } });
		expect(response[3]).toEqual({ status: 'fulfilled', value: { id: 2, name: 'Dan' } });
		expect(response[4]).toMatchObject({ status: 'fulfilled', value: { rows: [{ one: 1 }] } });

		expect(
			await db.select({ id: usersTable.id, verified: usersTable.verified }).from(usersTable).orderBy(usersTable.id),
		).toEqual([
			{ id: 1, verified: 1 },
			{ id: 2, verified: 0 },
			{ id: 3, verified: 0 },
		]);
	});

	test('never rejects: failures come back as rejected entries, the rest still commit', async ({ db }) => {
		const failing = db.insert(postsTable).values(orphanPost);
		const response = await db.parallel([
			failing,
			db.execute(sql`select pg_sleep(0.2)`),
			db.insert(usersTable).values({ id: 1, name: 'Survivor' }).returning({ id: usersTable.id }),
			db.execute(sql`select 1/0`),
		]);

		expect(response.map((r) => r.status)).toEqual(['rejected', 'fulfilled', 'fulfilled', 'rejected']);
		if (response[0].status === 'rejected') expectTypeOf(response[0].reason).toEqualTypeOf<DrizzleQueryError>();
		expectQueryError(response[0].status === 'rejected' && response[0].reason, failing.toSQL().sql, '23503');
		expect(response[2]).toEqual({ status: 'fulfilled', value: [{ id: 1 }] });
		expectQueryError(response[3].status === 'rejected' && response[3].reason, 'select 1/0', '22012');

		expect(await db.select({ name: usersTable.name }).from(usersTable)).toEqual([{ name: 'Survivor' }]);
	});
});
