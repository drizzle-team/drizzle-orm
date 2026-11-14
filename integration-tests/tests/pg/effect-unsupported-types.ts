// Redefinitions of shared Effect tests for drivers that can't decode `timestamp` values without losing data: those
// drivers throw on non-null `timestamp`s, the copies below use nullable `timestamp` columns filled with `null`, which
// never reaches a decoder. Drivers skip the originals by the exported names and register the copies via `addTests`.
import { expect, Vitest } from '@effect/vitest';
import { asc, desc, eq, sql } from 'drizzle-orm';
import {
	bigint,
	boolean,
	integer,
	jsonb,
	numeric,
	pgTable,
	primaryKey,
	serial,
	text,
	time,
	timestamp,
} from 'drizzle-orm/pg-core';
import * as Effect from 'effect/Effect';
import { SqlClient } from 'effect/sql/SqlClient';
import { withUpstashCache } from '~/upstash-cache';
import {
	allTypesRelations,
	type AllTypesReplacements,
	assertAllTypesWithReplacements,
	makeAllTypes,
} from './all-types';
import { DB, push, type RunCommonEffectPgTestsOptions } from './effect-common';

// nullable copies of `./schema`'s relational query tables - inserts go through them, queries through the relations
const rqbUserNullable = pgTable('user_rqb_test', {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	createdAt: timestamp('created_at', { mode: 'date', precision: 3 }),
});
const rqbPostNullable = pgTable('post_rqb_test', {
	id: serial().primaryKey().notNull(),
	userId: integer('user_id').notNull(),
	content: text(),
	createdAt: timestamp('created_at', { mode: 'date', precision: 3 }),
});

/** Shared tests whose fixtures hold `timestamp` values, redefined by {@link nullTimestampTests} */
export const nullTimestampSkips = [
	'Mappers: insert returning all + select + update returning + delete returning',
	'Mappers: relational',
	'Mappers: select - nothing to decode - null',
	'Mappers: select - nothing to decode - text',
	'Mappers: select complex selections',
	'Jit mappers: - insert returning all + select + update returning + delete returning',
	'Jit mappers: - relational',
	'Jit mappers: - select - nothing to decode - null',
	'Jit mappers: - select - nothing to decode - text',
	'Jit mappers: - select complex selections',
	'RQB v2 simple find first - multiple rows',
	'RQB v2 simple find first - placeholders',
	'RQB v2 simple find first - with relation',
	'RQB v2 simple find many - multiple rows',
	'RQB v2 simple find many - placeholders',
	'RQB v2 simple find many - with relation',
	'RQB v2 transaction find first - multiple rows',
	'RQB v2 transaction find first - placeholders',
	'RQB v2 transaction find first - with relation',
	'RQB v2 transaction find many - multiple rows',
	'RQB v2 transaction find many - placeholders',
	'RQB v2 transaction find many - with relation',
	'update with returning all fields',
	'delete with returning all fields',
	'select distinct ordered by cast columns',
];

/** Copies of {@link nullTimestampSkips} with nullable `timestamp` columns holding `null` */
export const nullTimestampTests = (
	it: Vitest.MethodsNonLive<DB | SqlClient>,
	createDB: RunCommonEffectPgTestsOptions['createDB'],
) => {
	it.effect('Mappers: insert returning all + select + update returning + delete returning (null timestamps)', () =>
		Effect.gen(function*() {
			const users = pgTable('mappers_users_4', (t) => ({
				id: t.bigint('id', { mode: 'number' }).primaryKey(),
				name: t.text('name').notNull(),
				createdAt: t.timestamp('created_at', {
					withTimezone: true,
					mode: 'date',
				}),
				isBanned: t.boolean('is_banned'),
			}));

			const db = yield* DB;
			yield* push(db, { users });

			const inserted = yield* db.insert(users).values([{
				id: 1,
				name: 'First',
				createdAt: null,
			}, {
				id: 2,
				name: 'Second',
				createdAt: null,
				isBanned: true,
			}, {
				id: 3,
				name: 'Third',
				createdAt: null,
			}]).returning();

			const selected = yield* db.select().from(users);

			const updated = yield* db.update(users).set({
				isBanned: false,
			}).where(eq(users.id, 2)).returning();

			const deleted = yield* db.delete(users).returning();

			expect(inserted).toStrictEqual([{
				id: 1,
				name: 'First',
				createdAt: null,
				isBanned: null,
			}, {
				id: 2,
				name: 'Second',
				createdAt: null,
				isBanned: true,
			}, {
				id: 3,
				name: 'Third',
				createdAt: null,
				isBanned: null,
			}]);
			expect(selected).toStrictEqual([{
				id: 1,
				name: 'First',
				createdAt: null,
				isBanned: null,
			}, {
				id: 2,
				name: 'Second',
				createdAt: null,
				isBanned: true,
			}, {
				id: 3,
				name: 'Third',
				createdAt: null,
				isBanned: null,
			}]);
			expect(updated).toStrictEqual([{
				id: 2,
				name: 'Second',
				createdAt: null,
				isBanned: false,
			}]);
			expect(deleted).toStrictEqual(expect.arrayContaining([{
				id: 1,
				name: 'First',
				createdAt: null,
				isBanned: null,
			}, {
				id: 2,
				name: 'Second',
				createdAt: null,
				isBanned: false,
			}, {
				id: 3,
				name: 'Third',
				createdAt: null,
				isBanned: null,
			}]));
		}));
	it.effect('Mappers: relational (null timestamps)', () =>
		Effect.gen(function*() {
			const users = pgTable('mappers_users_6', (t) => ({
				id: t.bigint('id', { mode: 'number' }).primaryKey(),
				name: t.text('name').notNull(),
				createdAt: t.timestamp('created_at', {
					withTimezone: true,
					mode: 'date',
				}),
				isBanned: t.boolean('is_banned'),
			}));

			const posts = pgTable('mappers_posts_2', (t) => ({
				id: t.integer('id').primaryKey(),
				authorId: t.bigint('author_id', { mode: 'number' }).references(() => users.id),
				content: t.text('content'),
			}));

			const db = yield* createDB(
				{ users, posts },
				(r) => ({
					users: {
						post: r.one.posts({
							from: r.users.id,
							to: r.posts.authorId,
						}),
						posts: r.one.posts({
							from: r.users.id,
							to: r.posts.authorId,
						}),
					},
					posts: {
						author: r.one.users({
							from: r.posts.authorId,
							to: r.users.id,
						}),
						authors: r.many.users({
							from: r.posts.authorId,
							to: r.users.id,
						}),
					},
				}),
				false,
			);
			yield* push(db, { users, posts });

			const empty1 = yield* db.query.users.findFirst();
			const empty2 = yield* db.query.users.findMany();

			expect(empty1).toStrictEqual(undefined);
			expect(empty2).toStrictEqual([]);

			yield* db.insert(users).values([{
				id: 1,
				name: 'First',
				createdAt: null,
			}, {
				id: 2,
				name: 'Second',
				createdAt: null,
				isBanned: true,
			}, {
				id: 3,
				name: 'Third',
				createdAt: null,
			}]).returning();
			yield* db.insert(posts).values({
				id: 1,
				authorId: 1,
				content: 'p1',
			});

			const simple1 = yield* db.query.users.findFirst();
			const simple2 = yield* db.query.users.findMany();

			expect(simple1).toStrictEqual(
				{
					createdAt: null,
					id: 1,
					isBanned: null,
					name: 'First',
				},
			);
			expect(simple2).toStrictEqual([
				{
					createdAt: null,
					id: 1,
					isBanned: null,
					name: 'First',
				},
				{
					createdAt: null,
					id: 2,
					isBanned: true,
					name: 'Second',
				},
				{
					createdAt: null,
					id: 3,
					isBanned: null,
					name: 'Third',
				},
			]);

			const extra1 = yield* db.query.users.findFirst({
				extras: {
					sql: sql`SELECT 1`.mapWith(Number),
					sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
				},
			});
			const extra2 = yield* db.query.users.findMany({
				extras: {
					sql: sql`SELECT 1`.mapWith(Number),
					sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
				},
			});

			expect(extra1).toStrictEqual(
				{
					createdAt: null,
					id: 1,
					isBanned: null,
					name: 'First',
					sql: 1,
					sqlWrapper: 2,
				},
			);
			expect(extra2).toStrictEqual([
				{
					createdAt: null,
					id: 1,
					isBanned: null,
					name: 'First',
					sql: 1,
					sqlWrapper: 2,
				},
				{
					createdAt: null,
					id: 2,
					isBanned: true,
					name: 'Second',
					sql: 1,
					sqlWrapper: 2,
				},
				{
					createdAt: null,
					id: 3,
					isBanned: null,
					name: 'Third',
					sql: 1,
					sqlWrapper: 2,
				},
			]);

			const nested1 = yield* db.query.users.findFirst({
				with: {
					post: {
						with: {
							author: {
								extras: {
									sql: sql`SELECT 1`.mapWith(Number),
									sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
								},
								where: {
									RAW: sql`false`,
								},
							},
							authors: {
								extras: {
									sql: sql`SELECT 1`.mapWith(Number),
									sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
								},
								where: {
									RAW: sql`false`,
								},
							},
						},
						extras: {
							sql: sql`SELECT 1`.mapWith(Number),
							sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
						},
					},
					posts: {
						with: {
							author: {
								extras: {
									sql: sql`SELECT 1`.mapWith(Number),
									sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
								},
							},
							authors: {
								extras: {
									sql: sql`SELECT 1`.mapWith(Number),
									sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
								},
							},
						},
						extras: {
							sql: sql`SELECT 1`.mapWith(Number),
							sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
						},
					},
				},
				extras: {
					sql: sql`SELECT 1`.mapWith(Number),
					sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
				},
			});
			const nested2 = yield* db.query.users.findMany({
				with: {
					post: {
						with: {
							author: {
								extras: {
									sql: sql`SELECT 1`.mapWith(Number),
									sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
								},
								where: {
									RAW: sql`false`,
								},
							},
							authors: {
								extras: {
									sql: sql`SELECT 1`.mapWith(Number),
									sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
								},
								where: {
									RAW: sql`false`,
								},
							},
						},
						extras: {
							sql: sql`SELECT 1`.mapWith(Number),
							sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
						},
					},
					posts: {
						with: {
							author: {
								extras: {
									sql: sql`SELECT 1`.mapWith(Number),
									sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
								},
							},
							authors: {
								extras: {
									sql: sql`SELECT 1`.mapWith(Number),
									sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
								},
							},
						},
						extras: {
							sql: sql`SELECT 1`.mapWith(Number),
							sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
						},
					},
				},
				extras: {
					sql: sql`SELECT 1`.mapWith(Number),
					sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
				},
			});

			expect(nested1).toStrictEqual(
				{
					createdAt: null,
					id: 1,
					isBanned: null,
					name: 'First',
					post: {
						author: null,
						authorId: 1,
						authors: [],
						content: 'p1',
						id: 1,
						sql: 1,
						sqlWrapper: 2,
					},
					posts: {
						author: {
							createdAt: null,
							id: 1,
							isBanned: null,
							name: 'First',
							sql: 1,
							sqlWrapper: 2,
						},
						authorId: 1,
						authors: [
							{
								createdAt: null,
								id: 1,
								isBanned: null,
								name: 'First',
								sql: 1,
								sqlWrapper: 2,
							},
						],
						content: 'p1',
						id: 1,
						sql: 1,
						sqlWrapper: 2,
					},
					sql: 1,
					sqlWrapper: 2,
				},
			);
			expect(nested2).toStrictEqual([
				{
					createdAt: null,
					id: 1,
					isBanned: null,
					name: 'First',
					post: {
						author: null,
						authorId: 1,
						authors: [],
						content: 'p1',
						id: 1,
						sql: 1,
						sqlWrapper: 2,
					},
					posts: {
						author: {
							createdAt: null,
							id: 1,
							isBanned: null,
							name: 'First',
							sql: 1,
							sqlWrapper: 2,
						},
						authorId: 1,
						authors: [
							{
								createdAt: null,
								id: 1,
								isBanned: null,
								name: 'First',
								sql: 1,
								sqlWrapper: 2,
							},
						],
						content: 'p1',
						id: 1,
						sql: 1,
						sqlWrapper: 2,
					},
					sql: 1,
					sqlWrapper: 2,
				},
				{
					createdAt: null,
					id: 2,
					isBanned: true,
					name: 'Second',
					post: null,
					posts: null,
					sql: 1,
					sqlWrapper: 2,
				},
				{
					createdAt: null,
					id: 3,
					isBanned: null,
					name: 'Third',
					post: null,
					posts: null,
					sql: 1,
					sqlWrapper: 2,
				},
			]);
		}));
	it.effect('Mappers: select - nothing to decode - null (null timestamps)', () =>
		Effect.gen(function*() {
			const users = pgTable('mappers_users_3', (t) => ({
				id: t.bigint('id', { mode: 'number' }).primaryKey(),
				name: t.text('name').notNull(),
				createdAt: t.timestamp('created_at', {
					withTimezone: true,
					mode: 'date',
				}),
				isBanned: t.boolean('is_banned'),
			}));

			const db = yield* DB;
			yield* push(db, { users });

			yield* db.insert(users).values([{
				id: 1,
				name: 'First',
				createdAt: null,
			}]).returning();

			const selected = yield* db.select({ isBanned: users.isBanned }).from(users);

			expect(selected).toStrictEqual([{ isBanned: null }]);
		}));
	it.effect('Mappers: select - nothing to decode - text (null timestamps)', () =>
		Effect.gen(function*() {
			const users = pgTable('mappers_users_2', (t) => ({
				id: t.bigint('id', { mode: 'number' }).primaryKey(),
				name: t.text('name').notNull(),
				createdAt: t.timestamp('created_at', {
					withTimezone: true,
					mode: 'date',
				}),
				isBanned: t.boolean('is_banned'),
			}));

			const db = yield* DB;
			yield* push(db, { users });

			yield* db.insert(users).values([{
				id: 1,
				name: 'First',
				createdAt: null,
			}]).returning();

			const selected = yield* db.select({ name: users.name }).from(users);

			expect(selected).toStrictEqual([{ name: 'First' }]);
		}));
	it.effect('Mappers: select complex selections (null timestamps)', () =>
		Effect.gen(function*() {
			const users = pgTable('mappers_users_5', (t) => ({
				id: t.bigint('id', { mode: 'number' }).primaryKey(),
				name: t.text('name').notNull(),
				createdAt: t.timestamp('created_at', {
					withTimezone: true,
					mode: 'date',
				}),
				isBanned: t.boolean('is_banned'),
			}));

			const posts = pgTable('mappers_posts_1', (t) => ({
				id: t.integer('id').primaryKey(),
				authorId: t.bigint('author_id', { mode: 'number' }).references(() => users.id),
				content: t.text('content'),
			}));

			const db = yield* DB;
			yield* push(db, { users, posts });

			yield* db.insert(users).values([{
				id: 1,
				name: 'First',
				createdAt: null,
			}, {
				id: 2,
				name: 'Second',
				createdAt: null,
				isBanned: true,
			}, {
				id: 3,
				name: 'Third',
				createdAt: null,
			}]).returning();
			yield* db.insert(posts).values({
				id: 1,
				authorId: 1,
				content: 'p1',
			});

			const selected1 = yield* db.select({ user: users, post: posts }).from(users).leftJoin(
				posts,
				eq(users.id, posts.authorId),
			);
			const selected2 = yield* db.select({ user: users, post: posts }).from(users).innerJoin(
				posts,
				eq(users.id, posts.authorId),
			);
			const selected3 = yield* db.select({
				userId: users.id,
				postId: posts.id,
				name: users.name,
				isBanned: users.isBanned,
				content: posts.content,
				createdAt: users.createdAt,
			}).from(users).leftJoin(
				posts,
				eq(users.id, posts.authorId),
			);
			const selected4 = yield* db.select({
				userId: users.id,
				postId: posts.id,
				name: users.name,
				isBanned: users.isBanned,
				content: posts.content,
				createdAt: users.createdAt,
			}).from(users).innerJoin(
				posts,
				eq(users.id, posts.authorId),
			);

			expect(selected1).toStrictEqual([{
				user: {
					id: 1,
					name: 'First',
					createdAt: null,
					isBanned: null,
				},
				post: {
					id: 1,
					authorId: 1,
					content: 'p1',
				},
			}, {
				user: {
					id: 2,
					name: 'Second',
					createdAt: null,
					isBanned: true,
				},
				post: null,
			}, {
				user: {
					id: 3,
					name: 'Third',
					createdAt: null,
					isBanned: null,
				},
				post: null,
			}]);
			expect(selected2).toStrictEqual([{
				user: {
					id: 1,
					name: 'First',
					createdAt: null,
					isBanned: null,
				},
				post: {
					id: 1,
					authorId: 1,
					content: 'p1',
				},
			}]);
			expect(selected3).toStrictEqual([
				{
					content: 'p1',
					createdAt: null,
					isBanned: null,
					name: 'First',
					postId: 1,
					userId: 1,
				},
				{
					content: null,
					createdAt: null,
					isBanned: true,
					name: 'Second',
					postId: null,
					userId: 2,
				},
				{
					content: null,
					createdAt: null,
					isBanned: null,
					name: 'Third',
					postId: null,
					userId: 3,
				},
			]);
			expect(selected4).toStrictEqual([
				{
					content: 'p1',
					createdAt: null,
					isBanned: null,
					name: 'First',
					postId: 1,
					userId: 1,
				},
			]);
		}));
	it.effect('Jit mappers: - insert returning all + select + update returning + delete returning (null timestamps)', () =>
		Effect.gen(function*() {
			const users = pgTable('jit_mappers_users_4', (t) => ({
				id: t.bigint('id', { mode: 'number' }).primaryKey(),
				name: t.text('name').notNull(),
				createdAt: t.timestamp('created_at', {
					withTimezone: true,
					mode: 'date',
				}),
				isBanned: t.boolean('is_banned'),
			}));

			const db = yield* createDB({}, () => ({}), true);
			yield* push(db, { users });

			const inserted = yield* db.insert(users).values([{
				id: 1,
				name: 'First',
				createdAt: null,
			}, {
				id: 2,
				name: 'Second',
				createdAt: null,
				isBanned: true,
			}, {
				id: 3,
				name: 'Third',
				createdAt: null,
			}]).returning();

			const selected = yield* db.select().from(users);

			const updated = yield* db.update(users).set({
				isBanned: false,
			}).where(eq(users.id, 2)).returning();

			const deleted = yield* db.delete(users).returning();

			expect(inserted).toStrictEqual([{
				id: 1,
				name: 'First',
				createdAt: null,
				isBanned: null,
			}, {
				id: 2,
				name: 'Second',
				createdAt: null,
				isBanned: true,
			}, {
				id: 3,
				name: 'Third',
				createdAt: null,
				isBanned: null,
			}]);
			expect(selected).toStrictEqual([{
				id: 1,
				name: 'First',
				createdAt: null,
				isBanned: null,
			}, {
				id: 2,
				name: 'Second',
				createdAt: null,
				isBanned: true,
			}, {
				id: 3,
				name: 'Third',
				createdAt: null,
				isBanned: null,
			}]);
			expect(updated).toStrictEqual([{
				id: 2,
				name: 'Second',
				createdAt: null,
				isBanned: false,
			}]);
			expect(deleted).toStrictEqual(expect.arrayContaining([{
				id: 1,
				name: 'First',
				createdAt: null,
				isBanned: null,
			}, {
				id: 2,
				name: 'Second',
				createdAt: null,
				isBanned: false,
			}, {
				id: 3,
				name: 'Third',
				createdAt: null,
				isBanned: null,
			}]));
		}));
	it.effect('Jit mappers: - relational (null timestamps)', () =>
		Effect.gen(function*() {
			const users = pgTable('jit_mappers_users_6', (t) => ({
				id: t.bigint('id', { mode: 'number' }).primaryKey(),
				name: t.text('name').notNull(),
				createdAt: t.timestamp('created_at', {
					withTimezone: true,
					mode: 'date',
				}),
				isBanned: t.boolean('is_banned'),
			}));

			const posts = pgTable('jit_mappers_posts_2', (t) => ({
				id: t.integer('id').primaryKey(),
				authorId: t.bigint('author_id', { mode: 'number' }).references(() => users.id),
				content: t.text('content'),
			}));

			const db = yield* createDB(
				{ users, posts },
				(r) => ({
					users: {
						post: r.one.posts({
							from: r.users.id,
							to: r.posts.authorId,
						}),
						posts: r.one.posts({
							from: r.users.id,
							to: r.posts.authorId,
						}),
					},
					posts: {
						author: r.one.users({
							from: r.posts.authorId,
							to: r.users.id,
						}),
						authors: r.many.users({
							from: r.posts.authorId,
							to: r.users.id,
						}),
					},
				}),
				true,
			);
			yield* push(db, { users, posts });

			const empty1 = yield* db.query.users.findFirst();
			const empty2 = yield* db.query.users.findMany();

			expect(empty1).toStrictEqual(undefined);
			expect(empty2).toStrictEqual([]);

			yield* db.insert(users).values([{
				id: 1,
				name: 'First',
				createdAt: null,
			}, {
				id: 2,
				name: 'Second',
				createdAt: null,
				isBanned: true,
			}, {
				id: 3,
				name: 'Third',
				createdAt: null,
			}]).returning();
			yield* db.insert(posts).values({
				id: 1,
				authorId: 1,
				content: 'p1',
			});

			const simple1 = yield* db.query.users.findFirst();
			const simple2 = yield* db.query.users.findMany();

			expect(simple1).toStrictEqual(
				{
					createdAt: null,
					id: 1,
					isBanned: null,
					name: 'First',
				},
			);
			expect(simple2).toStrictEqual([
				{
					createdAt: null,
					id: 1,
					isBanned: null,
					name: 'First',
				},
				{
					createdAt: null,
					id: 2,
					isBanned: true,
					name: 'Second',
				},
				{
					createdAt: null,
					id: 3,
					isBanned: null,
					name: 'Third',
				},
			]);

			const extra1 = yield* db.query.users.findFirst({
				extras: {
					sql: sql`SELECT 1`.mapWith(Number),
					sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
				},
			});
			const extra2 = yield* db.query.users.findMany({
				extras: {
					sql: sql`SELECT 1`.mapWith(Number),
					sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
				},
			});

			expect(extra1).toStrictEqual(
				{
					createdAt: null,
					id: 1,
					isBanned: null,
					name: 'First',
					sql: 1,
					sqlWrapper: 2,
				},
			);
			expect(extra2).toStrictEqual([
				{
					createdAt: null,
					id: 1,
					isBanned: null,
					name: 'First',
					sql: 1,
					sqlWrapper: 2,
				},
				{
					createdAt: null,
					id: 2,
					isBanned: true,
					name: 'Second',
					sql: 1,
					sqlWrapper: 2,
				},
				{
					createdAt: null,
					id: 3,
					isBanned: null,
					name: 'Third',
					sql: 1,
					sqlWrapper: 2,
				},
			]);

			const nested1 = yield* db.query.users.findFirst({
				with: {
					post: {
						with: {
							author: {
								extras: {
									sql: sql`SELECT 1`.mapWith(Number),
									sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
								},
								where: {
									RAW: sql`false`,
								},
							},
							authors: {
								extras: {
									sql: sql`SELECT 1`.mapWith(Number),
									sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
								},
								where: {
									RAW: sql`false`,
								},
							},
						},
						extras: {
							sql: sql`SELECT 1`.mapWith(Number),
							sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
						},
					},
					posts: {
						with: {
							author: {
								extras: {
									sql: sql`SELECT 1`.mapWith(Number),
									sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
								},
							},
							authors: {
								extras: {
									sql: sql`SELECT 1`.mapWith(Number),
									sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
								},
							},
						},
						extras: {
							sql: sql`SELECT 1`.mapWith(Number),
							sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
						},
					},
				},
				extras: {
					sql: sql`SELECT 1`.mapWith(Number),
					sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
				},
			});
			const nested2 = yield* db.query.users.findMany({
				with: {
					post: {
						with: {
							author: {
								extras: {
									sql: sql`SELECT 1`.mapWith(Number),
									sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
								},
								where: {
									RAW: sql`false`,
								},
							},
							authors: {
								extras: {
									sql: sql`SELECT 1`.mapWith(Number),
									sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
								},
								where: {
									RAW: sql`false`,
								},
							},
						},
						extras: {
							sql: sql`SELECT 1`.mapWith(Number),
							sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
						},
					},
					posts: {
						with: {
							author: {
								extras: {
									sql: sql`SELECT 1`.mapWith(Number),
									sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
								},
							},
							authors: {
								extras: {
									sql: sql`SELECT 1`.mapWith(Number),
									sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
								},
							},
						},
						extras: {
							sql: sql`SELECT 1`.mapWith(Number),
							sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
						},
					},
				},
				extras: {
					sql: sql`SELECT 1`.mapWith(Number),
					sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
				},
			});

			expect(nested1).toStrictEqual(
				{
					createdAt: null,
					id: 1,
					isBanned: null,
					name: 'First',
					post: {
						author: null,
						authorId: 1,
						authors: [],
						content: 'p1',
						id: 1,
						sql: 1,
						sqlWrapper: 2,
					},
					posts: {
						author: {
							createdAt: null,
							id: 1,
							isBanned: null,
							name: 'First',
							sql: 1,
							sqlWrapper: 2,
						},
						authorId: 1,
						authors: [
							{
								createdAt: null,
								id: 1,
								isBanned: null,
								name: 'First',
								sql: 1,
								sqlWrapper: 2,
							},
						],
						content: 'p1',
						id: 1,
						sql: 1,
						sqlWrapper: 2,
					},
					sql: 1,
					sqlWrapper: 2,
				},
			);
			expect(nested2).toStrictEqual([
				{
					createdAt: null,
					id: 1,
					isBanned: null,
					name: 'First',
					post: {
						author: null,
						authorId: 1,
						authors: [],
						content: 'p1',
						id: 1,
						sql: 1,
						sqlWrapper: 2,
					},
					posts: {
						author: {
							createdAt: null,
							id: 1,
							isBanned: null,
							name: 'First',
							sql: 1,
							sqlWrapper: 2,
						},
						authorId: 1,
						authors: [
							{
								createdAt: null,
								id: 1,
								isBanned: null,
								name: 'First',
								sql: 1,
								sqlWrapper: 2,
							},
						],
						content: 'p1',
						id: 1,
						sql: 1,
						sqlWrapper: 2,
					},
					sql: 1,
					sqlWrapper: 2,
				},
				{
					createdAt: null,
					id: 2,
					isBanned: true,
					name: 'Second',
					post: null,
					posts: null,
					sql: 1,
					sqlWrapper: 2,
				},
				{
					createdAt: null,
					id: 3,
					isBanned: null,
					name: 'Third',
					post: null,
					posts: null,
					sql: 1,
					sqlWrapper: 2,
				},
			]);
		}));
	it.effect('Jit mappers: - select - nothing to decode - null (null timestamps)', () =>
		Effect.gen(function*() {
			const users = pgTable('jit_mappers_users_3', (t) => ({
				id: t.bigint('id', { mode: 'number' }).primaryKey(),
				name: t.text('name').notNull(),
				createdAt: t.timestamp('created_at', {
					withTimezone: true,
					mode: 'date',
				}),
				isBanned: t.boolean('is_banned'),
			}));

			const db = yield* createDB({}, () => ({}), true);
			yield* push(db, { users });

			yield* db.insert(users).values([{
				id: 1,
				name: 'First',
				createdAt: null,
			}]).returning();

			const selected = yield* db.select({ isBanned: users.isBanned }).from(users);

			expect(selected).toStrictEqual([{ isBanned: null }]);
		}));
	it.effect('Jit mappers: - select - nothing to decode - text (null timestamps)', () =>
		Effect.gen(function*() {
			const users = pgTable('jit_mappers_users_2', (t) => ({
				id: t.bigint('id', { mode: 'number' }).primaryKey(),
				name: t.text('name').notNull(),
				createdAt: t.timestamp('created_at', {
					withTimezone: true,
					mode: 'date',
				}),
				isBanned: t.boolean('is_banned'),
			}));

			const db = yield* createDB({}, () => ({}), true);
			yield* push(db, { users });

			yield* db.insert(users).values([{
				id: 1,
				name: 'First',
				createdAt: null,
			}]).returning();

			const selected = yield* db.select({ name: users.name }).from(users);

			expect(selected).toStrictEqual([{ name: 'First' }]);
		}));
	it.effect('Jit mappers: - select complex selections (null timestamps)', () =>
		Effect.gen(function*() {
			const users = pgTable('jit_mappers_users_5', (t) => ({
				id: t.bigint('id', { mode: 'number' }).primaryKey(),
				name: t.text('name').notNull(),
				createdAt: t.timestamp('created_at', {
					withTimezone: true,
					mode: 'date',
				}),
				isBanned: t.boolean('is_banned'),
			}));

			const posts = pgTable('jit_mappers_posts_1', (t) => ({
				id: t.integer('id').primaryKey(),
				authorId: t.bigint('author_id', { mode: 'number' }).references(() => users.id),
				content: t.text('content'),
			}));

			const db = yield* createDB({}, () => ({}), true);
			yield* push(db, { users, posts });

			yield* db.insert(users).values([{
				id: 1,
				name: 'First',
				createdAt: null,
			}, {
				id: 2,
				name: 'Second',
				createdAt: null,
				isBanned: true,
			}, {
				id: 3,
				name: 'Third',
				createdAt: null,
			}]).returning();
			yield* db.insert(posts).values({
				id: 1,
				authorId: 1,
				content: 'p1',
			});

			const selected1 = yield* db.select({ user: users, post: posts }).from(users).leftJoin(
				posts,
				eq(users.id, posts.authorId),
			);
			const selected2 = yield* db.select({ user: users, post: posts }).from(users).innerJoin(
				posts,
				eq(users.id, posts.authorId),
			);
			const selected3 = yield* db.select({
				userId: users.id,
				postId: posts.id,
				name: users.name,
				isBanned: users.isBanned,
				content: posts.content,
				createdAt: users.createdAt,
			}).from(users).leftJoin(
				posts,
				eq(users.id, posts.authorId),
			);
			const selected4 = yield* db.select({
				userId: users.id,
				postId: posts.id,
				name: users.name,
				isBanned: users.isBanned,
				content: posts.content,
				createdAt: users.createdAt,
			}).from(users).innerJoin(
				posts,
				eq(users.id, posts.authorId),
			);

			expect(selected1).toStrictEqual([{
				user: {
					id: 1,
					name: 'First',
					createdAt: null,
					isBanned: null,
				},
				post: {
					id: 1,
					authorId: 1,
					content: 'p1',
				},
			}, {
				user: {
					id: 2,
					name: 'Second',
					createdAt: null,
					isBanned: true,
				},
				post: null,
			}, {
				user: {
					id: 3,
					name: 'Third',
					createdAt: null,
					isBanned: null,
				},
				post: null,
			}]);
			expect(selected2).toStrictEqual([{
				user: {
					id: 1,
					name: 'First',
					createdAt: null,
					isBanned: null,
				},
				post: {
					id: 1,
					authorId: 1,
					content: 'p1',
				},
			}]);
			expect(selected3).toStrictEqual([
				{
					content: 'p1',
					createdAt: null,
					isBanned: null,
					name: 'First',
					postId: 1,
					userId: 1,
				},
				{
					content: null,
					createdAt: null,
					isBanned: true,
					name: 'Second',
					postId: null,
					userId: 2,
				},
				{
					content: null,
					createdAt: null,
					isBanned: null,
					name: 'Third',
					postId: null,
					userId: 3,
				},
			]);
			expect(selected4).toStrictEqual([
				{
					content: 'p1',
					createdAt: null,
					isBanned: null,
					name: 'First',
					postId: 1,
					userId: 1,
				},
			]);
		}));
	it.effect('RQB v2 simple find first - multiple rows (null timestamps)', () =>
		Effect.gen(function*() {
			const db = yield* DB;
			yield* push(db, { rqbUserNullable });

			const date = null;

			yield* db.insert(rqbUserNullable).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			const result = yield* db.query.rqbUser.findFirst({
				orderBy: {
					id: 'desc',
				},
			});

			expect(result).toStrictEqual({
				id: 2,
				createdAt: date,
				name: 'Second',
			});
		}));
	it.effect('RQB v2 simple find first - placeholders (null timestamps)', () =>
		Effect.gen(function*() {
			const db = yield* DB;
			yield* push(db, { rqbUserNullable });

			const date = null;

			yield* db.insert(rqbUserNullable).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			const query = db.query.rqbUser.findFirst({
				where: {
					id: {
						eq: sql.placeholder('filter'),
					},
				},
				orderBy: {
					id: 'asc',
				},
			}).prepare('rqb_v2_find_first_placeholders');

			const result = yield* query.execute({
				filter: 2,
			});

			expect(result).toStrictEqual({
				id: 2,
				createdAt: date,
				name: 'Second',
			});
		}));
	it.effect('RQB v2 simple find first - with relation (null timestamps)', () =>
		Effect.gen(function*() {
			const db = yield* DB;

			yield* push(db, { rqbUserNullable, rqbPostNullable });

			const date = null;

			yield* db.insert(rqbUserNullable).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			yield* db.insert(rqbPostNullable).values([{
				id: 1,
				userId: 1,
				createdAt: date,
				content: null,
			}, {
				id: 2,
				userId: 1,
				createdAt: date,
				content: 'Has message this time',
			}]);

			const result = yield* db.query.rqbUser.findFirst({
				with: {
					posts: {
						orderBy: {
							id: 'asc',
						},
					},
				},
				orderBy: {
					id: 'asc',
				},
			});

			expect(result).toStrictEqual({
				id: 1,
				createdAt: date,
				name: 'First',
				posts: [{
					id: 1,
					userId: 1,
					createdAt: date,
					content: null,
				}, {
					id: 2,
					userId: 1,
					createdAt: date,
					content: 'Has message this time',
				}],
			});
		}));
	it.effect('RQB v2 simple find many - multiple rows (null timestamps)', () =>
		Effect.gen(function*() {
			const db = yield* DB;
			yield* push(db, { rqbUserNullable });

			const date = null;

			yield* db.insert(rqbUserNullable).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			const result = yield* db.query.rqbUser.findMany({
				orderBy: {
					id: 'desc',
				},
			});

			expect(result).toStrictEqual([{
				id: 2,
				createdAt: date,
				name: 'Second',
			}, {
				id: 1,
				createdAt: date,
				name: 'First',
			}]);
		}));
	it.effect('RQB v2 simple find many - placeholders (null timestamps)', () =>
		Effect.gen(function*() {
			const db = yield* DB;
			yield* push(db, { rqbUserNullable });

			const date = null;

			yield* db.insert(rqbUserNullable).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			const query = db.query.rqbUser.findMany({
				where: {
					id: {
						eq: sql.placeholder('filter'),
					},
				},
				orderBy: {
					id: 'asc',
				},
			}).prepare('rqb_v2_find_many_placeholders');

			const result = yield* query.execute({
				filter: 2,
			});

			expect(result).toStrictEqual([{
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);
		}));
	it.effect('RQB v2 simple find many - with relation (null timestamps)', () =>
		Effect.gen(function*() {
			const db = yield* DB;
			yield* push(db, { rqbUserNullable, rqbPostNullable });

			const date = null;

			yield* db.insert(rqbUserNullable).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			yield* db.insert(rqbPostNullable).values([{
				id: 1,
				userId: 1,
				createdAt: date,
				content: null,
			}, {
				id: 2,
				userId: 1,
				createdAt: date,
				content: 'Has message this time',
			}]);

			const result = yield* db.query.rqbPost.findMany({
				with: {
					author: true,
				},
				orderBy: {
					id: 'asc',
				},
			});

			expect(result).toStrictEqual([{
				id: 1,
				userId: 1,
				createdAt: date,
				content: null,
				author: {
					id: 1,
					createdAt: date,
					name: 'First',
				},
			}, {
				id: 2,
				userId: 1,
				createdAt: date,
				content: 'Has message this time',
				author: {
					id: 1,
					createdAt: date,
					name: 'First',
				},
			}]);
		}));
	it.effect('RQB v2 transaction find first - multiple rows (null timestamps)', () =>
		Effect.gen(function*() {
			const db = yield* DB;
			yield* push(db, { rqbUserNullable });

			const date = null;

			yield* db.insert(rqbUserNullable).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			const result = yield* db.transaction((db) =>
				Effect.gen(function*() {
					const result = yield* db.query.rqbUser.findFirst({
						orderBy: {
							id: 'desc',
						},
					});

					expect(result).toStrictEqual({
						id: 2,
						createdAt: date,
						name: 'Second',
					});

					return result;
				})
			);

			expect(result).toStrictEqual({
				id: 2,
				createdAt: date,
				name: 'Second',
			});
		}));
	it.effect('RQB v2 transaction find first - placeholders (null timestamps)', () =>
		Effect.gen(function*() {
			const db = yield* DB;
			yield* push(db, { rqbUserNullable });

			const date = null;

			yield* db.insert(rqbUserNullable).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			const result = yield* db.transaction((db) =>
				Effect.gen(function*() {
					const query = db.query.rqbUser.findFirst({
						where: {
							id: {
								eq: sql.placeholder('filter'),
							},
						},
						orderBy: {
							id: 'asc',
						},
					}).prepare('rqb_v2_find_first_tx_placeholders');

					const result = yield* query.execute({
						filter: 2,
					});

					expect(result).toStrictEqual({
						id: 2,
						createdAt: date,
						name: 'Second',
					});

					return result;
				})
			);

			expect(result).toStrictEqual({
				id: 2,
				createdAt: date,
				name: 'Second',
			});
		}));
	it.effect('RQB v2 transaction find first - with relation (null timestamps)', () =>
		Effect.gen(function*() {
			const db = yield* DB;

			yield* push(db, { rqbUserNullable, rqbPostNullable });
			const date = null;

			yield* db.insert(rqbUserNullable).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			yield* db.insert(rqbPostNullable).values([{
				id: 1,
				userId: 1,
				createdAt: date,
				content: null,
			}, {
				id: 2,
				userId: 1,
				createdAt: date,
				content: 'Has message this time',
			}]);

			const result = yield* db.transaction((db) =>
				Effect.gen(function*() {
					const result = yield* db.query.rqbUser.findFirst({
						with: {
							posts: {
								orderBy: {
									id: 'asc',
								},
							},
						},
						orderBy: {
							id: 'asc',
						},
					});

					expect(result).toStrictEqual({
						id: 1,
						createdAt: date,
						name: 'First',
						posts: [{
							id: 1,
							userId: 1,
							createdAt: date,
							content: null,
						}, {
							id: 2,
							userId: 1,
							createdAt: date,
							content: 'Has message this time',
						}],
					});

					return result;
				})
			);

			expect(result).toStrictEqual({
				id: 1,
				createdAt: date,
				name: 'First',
				posts: [{
					id: 1,
					userId: 1,
					createdAt: date,
					content: null,
				}, {
					id: 2,
					userId: 1,
					createdAt: date,
					content: 'Has message this time',
				}],
			});
		}));
	it.effect('RQB v2 transaction find many - multiple rows (null timestamps)', () =>
		Effect.gen(function*() {
			const db = yield* DB;
			yield* push(db, { rqbUserNullable });

			const date = null;

			yield* db.insert(rqbUserNullable).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			const result = yield* db.transaction((db) =>
				Effect.gen(function*() {
					const result = yield* db.query.rqbUser.findMany({
						orderBy: {
							id: 'desc',
						},
					});

					expect(result).toStrictEqual([{
						id: 2,
						createdAt: date,
						name: 'Second',
					}, {
						id: 1,
						createdAt: date,
						name: 'First',
					}]);

					return result;
				})
			);

			expect(result).toStrictEqual([{
				id: 2,
				createdAt: date,
				name: 'Second',
			}, {
				id: 1,
				createdAt: date,
				name: 'First',
			}]);
		}));
	it.effect('RQB v2 transaction find many - placeholders (null timestamps)', () =>
		Effect.gen(function*() {
			const db = yield* DB;
			yield* push(db, { rqbUserNullable });

			const date = null;
			yield* db.insert(rqbUserNullable).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			const result = yield* db.transaction((db) =>
				Effect.gen(function*() {
					const query = db.query.rqbUser.findMany({
						where: {
							id: {
								eq: sql.placeholder('filter'),
							},
						},
						orderBy: {
							id: 'asc',
						},
					}).prepare('rqb_v2_find_many_placeholders_10');

					const result = yield* query.execute({
						filter: 2,
					});

					expect(result).toStrictEqual([{
						id: 2,
						createdAt: date,
						name: 'Second',
					}]);

					return result;
				})
			);
			expect(result).toStrictEqual([{
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);
		}));
	it.effect('RQB v2 transaction find many - with relation (null timestamps)', () =>
		Effect.gen(function*() {
			const db = yield* DB;

			yield* push(db, { rqbUserNullable, rqbPostNullable });
			const date = null;

			yield* db.insert(rqbUserNullable).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			yield* db.insert(rqbPostNullable).values([{
				id: 1,
				userId: 1,
				createdAt: date,
				content: null,
			}, {
				id: 2,
				userId: 1,
				createdAt: date,
				content: 'Has message this time',
			}]);

			const result = yield* db.transaction((db) =>
				Effect.gen(function*() {
					const result = yield* db.query.rqbPost.findMany({
						with: {
							author: true,
						},
						orderBy: {
							id: 'asc',
						},
					});

					expect(result).toStrictEqual([{
						id: 1,
						userId: 1,
						createdAt: date,
						content: null,
						author: {
							id: 1,
							createdAt: date,
							name: 'First',
						},
					}, {
						id: 2,
						userId: 1,
						createdAt: date,
						content: 'Has message this time',
						author: {
							id: 1,
							createdAt: date,
							name: 'First',
						},
					}]);

					return result;
				})
			);

			expect(result).toStrictEqual([{
				id: 1,
				userId: 1,
				createdAt: date,
				content: null,
				author: {
					id: 1,
					createdAt: date,
					name: 'First',
				},
			}, {
				id: 2,
				userId: 1,
				createdAt: date,
				content: 'Has message this time',
				author: {
					id: 1,
					createdAt: date,
					name: 'First',
				},
			}]);
		}));
	it.effect('update with returning all fields (null timestamps)', () =>
		Effect.gen(function*() {
			const users = pgTable('users_9', {
				id: serial('id' as string).primaryKey(),
				name: text('name').notNull(),
				verified: boolean('verified').notNull().default(false),
				jsonb: jsonb('jsonb').$type<string[]>(),
				createdAt: timestamp('created_at', { withTimezone: true }),
			});

			const db = yield* DB;
			yield* push(db, { users });

			yield* db.insert(users).values({ name: 'John' });
			const usersResult = yield* db
				.update(users)
				.set({ name: 'Jane' })
				.where(eq(users.name, 'John'))
				.returning();

			expect(usersResult).toEqual([
				{ id: 1, name: 'Jane', verified: false, jsonb: null, createdAt: null },
			]);
		}));
	it.effect('delete with returning all fields (null timestamps)', () =>
		Effect.gen(function*() {
			const users = pgTable('users_11', {
				id: serial('id' as string).primaryKey(),
				name: text('name').notNull(),
				verified: boolean('verified').notNull().default(false),
				jsonb: jsonb('jsonb').$type<string[]>(),
				createdAt: timestamp('created_at', { withTimezone: true }),
			});

			const db = yield* DB;
			yield* push(db, { users });

			yield* db.insert(users).values({ name: 'John' });
			const usersResult = yield* db.delete(users).where(eq(users.name, 'John')).returning();

			expect(usersResult).toEqual([
				{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: null },
			]);
		}));

	it.effect('select distinct ordered by cast columns (null timestamps)', () =>
		Effect.gen(function*() {
			const table = pgTable('distinct_cast_order', {
				id: integer('id').notNull(),
				createdAt: timestamp('created_at', { mode: 'date', precision: 3 }),
				amount: numeric('amount', { mode: 'number' }).notNull(),
			});

			const db = yield* DB;
			yield* push(db, { table });

			yield* db.insert(table).values([
				{ id: 1, createdAt: null, amount: 9 },
				{ id: 2, createdAt: null, amount: 100 },
				{ id: 2, createdAt: null, amount: 100 },
				{ id: 3, createdAt: null, amount: 10 },
			]);

			const byAmount = yield* db
				.selectDistinct({ id: table.id, createdAt: table.createdAt, amount: table.amount })
				.from(table)
				.orderBy(desc(table.amount));

			expect(byAmount).toEqual([
				{ id: 2, createdAt: null, amount: 100 },
				{ id: 3, createdAt: null, amount: 10 },
				{ id: 1, createdAt: null, amount: 9 },
			]);
		}));
};

/** Shared all-types tests, redefined by {@link allTypesWithReplacementsTests} */
export const allTypesWithReplacementsSkips = [
	'all types',
	'all types - upstash',
	'all types ~codecs~',
	'all types ~codecs~ - upstash',
];

/**
 * All-types round trips with values replaced - `null`s for column types a driver throws on, decodable values for values
 * it can't return. Unions, bounds and temporal bounds of the original tests aren't repeated
 */
export const allTypesWithReplacementsTests = (
	it: Vitest.MethodsNonLive<DB | SqlClient>,
	createDB: RunCommonEffectPgTestsOptions['createDB'],
	replacements: AllTypesReplacements,
) => {
	it.effect('all types (with replacements)', () =>
		Effect.gen(function*() {
			const { en, allTypesTable } = makeAllTypes('all_types_replaced_ef', 'en_replaced_ef');
			const db = yield* createDB({ allTypesTable }, allTypesRelations as any);
			yield* push(db, { en, allTypesTable });

			const context = yield* Effect.context<never>();
			const run = (query: any) => Effect.runPromiseWith(context)(query);
			yield* Effect.promise(() =>
				assertAllTypesWithReplacements(db as any, allTypesTable as any, replacements, { run, rqb: true })
			);
		}));

	it.effect('all types (with replacements) - upstash', () =>
		withUpstashCache((cache, run) =>
			Effect.gen(function*() {
				const { en, allTypesTable } = makeAllTypes('all_types_replaced_upstash_ef', 'en_replaced_upstash_ef');
				const db = yield* createDB({ allTypesTable }, allTypesRelations as any, false, cache);
				yield* push(db, { en, allTypesTable });

				yield* Effect.promise(() =>
					cache.expectHits(
						'all types',
						() => assertAllTypesWithReplacements(db as any, allTypesTable as any, replacements, { run, rqb: true }),
					)
				);
			})
		));
};
