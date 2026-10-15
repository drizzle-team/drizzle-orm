import { D1Client } from '@effect/sql-d1';
import { D1Database, D1DatabaseAPI } from '@miniflare/d1';
import { createSQLiteDB } from '@miniflare/shared';
import {
	defineRelations,
	eq,
	ExtractTablesFromSchema,
	RelationsBuilder,
	RelationsBuilderConfig,
	Schema,
} from 'drizzle-orm';
import * as SQLiteDrizzle from 'drizzle-orm/effect-d1';
import { alias, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { expect } from 'vitest';
import { DB, push, runCommonEffectSQLiteTests } from './effect-common';
import relations from './relations';

const D1ClientLive = D1Client.layer({
	db: new D1Database(new D1DatabaseAPI(await createSQLiteDB(':memory:'))) as any, // Old d1 version, has no `withSession`
});

const dbEffect = SQLiteDrizzle.make({ relations }).pipe(Effect.provide(SQLiteDrizzle.DefaultServices));
const DBLive = Layer.effect(
	DB,
	Effect.gen(function*() {
		const db = yield* dbEffect;

		return db;
	}),
);

const createDB = <
	TSchema extends Record<string, any>,
	TConfig extends RelationsBuilderConfig<TTables>,
	TTables extends Schema = ExtractTablesFromSchema<TSchema>,
>(
	schema: TSchema,
	relations: (helpers: RelationsBuilder<TTables>) => TConfig,
	// CF Workers don't support `new Function(...)`
	_useJitMappers?: boolean,
) =>
	SQLiteDrizzle.make({ relations: defineRelations(schema, relations) }).pipe(
		Effect.provide(SQLiteDrizzle.DefaultServices),
	);

const TestLive = Layer.merge(D1ClientLive, DBLive.pipe(Layer.provide(D1ClientLive)));

runCommonEffectSQLiteTests({
	testLayer: TestLive,
	SQLiteDrizzle: SQLiteDrizzle,
	createDB,
	skipTests: [
		// Transactions are not supported in D1
		'RQB v2 transaction find first - no rows',
		'RQB v2 transaction find first - multiple rows',
		'RQB v2 transaction find first - with relation',
		'RQB v2 transaction find first - placeholders',
		'RQB v2 transaction find many - no rows',
		'RQB v2 transaction find many - multiple rows',
		'RQB v2 transaction find many - with relation',
		'RQB v2 transaction find many - placeholders',
		'transaction',
		'transaction rollback',
		'nested transaction',
		'nested transaction rollback',

		// D1 returns broken results when joins have columns with same names even in array mode
		// Altered tests with aliases are made in place of these
		'partial join with alias',
		'full join with alias',
		'select from alias',
		'Mappers: select complex selections',

		// Cloudflare workers environment doesn't support 'new Function(...)'
		'Mappers: correct mappers enabled',
		'Jit mappers: simple select - no rows',
		'Jit mappers: select - nothing to decode - text',
		'Jit mappers: select - nothing to decode - null',
		'Jit mappers: insert returning all + select + update returning + delete returning',
		'Jit mappers: select complex selections',
		'Jit mappers: relational',
		// Driver has no migrator to test:
		// transactions aren't supported by D1 and batch isn't exposed by Effect
		// Recommended way to apply migrations is via `drizzle-kit generate` + `wrangler d1 migrations apply dbname`
	],
	addTests: (it) => {
		// Bypass broken D1 joins by aliasing duplicate column names
		it.effect('partial join with alias - D1 aliasing', () =>
			Effect.gen(function*() {
				const users = sqliteTable('users_29', {
					id: integer('id' as string).primaryKey(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { users });

				const customerAlias = alias(users, 'customer');

				yield* db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
				const result = yield* db
					.select({
						user: {
							id: users.id.as('user_id'),
							name: users.name.as('user_name'),
						},
						customer: {
							id: customerAlias.id,
							name: customerAlias.name,
						},
					})
					.from(users)
					.leftJoin(customerAlias, eq(customerAlias.id, 11))
					.where(eq(users.id, 10));

				expect(result).toEqual([
					{
						user: { id: 10, name: 'Ivan' },
						customer: { id: 11, name: 'Hans' },
					},
				]);
			}));

		it.effect('full join with alias - D1 aliasing', () =>
			Effect.gen(function*() {
				const users = sqliteTable('prefixed_users_30', {
					id: integer('id').primaryKey(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { users });

				const customers = alias(users, 'customer');

				yield* db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
				const result = yield* db
					.select({
						prefixed_users_30: users,
						customer: {
							id: customers.id.as('customer_id'),
							name: customers.name.as('customer_name'),
						},
					})
					.from(users)
					.leftJoin(customers, eq(customers.id, 11))
					.where(eq(users.id, 10));

				expect(result).toEqual([{
					prefixed_users_30: {
						id: 10,
						name: 'Ivan',
					},
					customer: {
						id: 11,
						name: 'Hans',
					},
				}]);
			}));

		it.effect('select from alias - D1 aliasing', () =>
			Effect.gen(function*() {
				const users = sqliteTable('prefixed_users_31', {
					id: integer('id').primaryKey(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { users });

				const user = alias(users, 'user');
				const customers = alias(users, 'customer');

				yield* db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
				const result = yield* db
					.select({
						user,
						customer: {
							id: customers.id.as('customer_id'),
							name: customers.name.as('customer_name'),
						},
					})
					.from(user)
					.leftJoin(customers, eq(customers.id, 11))
					.where(eq(user.id, 10));

				expect(result).toEqual([{
					user: {
						id: 10,
						name: 'Ivan',
					},
					customer: {
						id: 11,
						name: 'Hans',
					},
				}]);
			}));

		it.effect('Mappers: select complex selections - D1 aliasing', () =>
			Effect.gen(function*() {
				const mappersDate = new Date('2026-04-02T00:00:00.000Z');

				const users = sqliteTable('mappers_users_5', (t) => ({
					id: t.numeric('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.integer('created_at', {
						mode: 'timestamp_ms',
					}).notNull(),
					isBanned: t.integer('is_banned', { mode: 'boolean' }),
				}));

				const posts = sqliteTable('mappers_posts_1', (t) => ({
					id: t.integer('id').primaryKey(),
					authorId: t.numeric('author_id', { mode: 'number' }).references(() => users.id),
					content: t.text('content'),
				}));

				const db = yield* DB;
				yield* push(db, { users, posts });

				yield* db.insert(users).values([{
					id: 1,
					name: 'First',
					createdAt: mappersDate,
				}, {
					id: 2,
					name: 'Second',
					createdAt: mappersDate,
					isBanned: true,
				}, {
					id: 3,
					name: 'Third',
					createdAt: mappersDate,
				}]).returning();
				yield* db.insert(posts).values({
					id: 1,
					authorId: 1,
					content: 'p1',
				});

				const selected1 = yield* db.select({
					user: {
						id: users.id.as('user_id'),
						name: users.name,
						createdAt: users.createdAt,
						isBanned: users.isBanned,
					},
					post: posts,
				}).from(users).leftJoin(
					posts,
					eq(users.id, posts.authorId),
				);
				const selected2 = yield* db.select({
					user: users,
					post: {
						id: posts.id.as('post_id'),
						authorId: posts.authorId,
						content: posts.content,
					},
				}).from(users).innerJoin(
					posts,
					eq(users.id, posts.authorId),
				);
				const selected3 = yield* db.select({
					userId: users.id.as('user_id'),
					postId: posts.id.as('post_id'),
					name: users.name,
					isBanned: users.isBanned,
					content: posts.content,
					createdAt: users.createdAt,
				}).from(users).leftJoin(
					posts,
					eq(users.id, posts.authorId),
				);
				const selected4 = yield* db.select({
					userId: users.id.as('user_id'),
					postId: posts.id.as('post_id'),
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
						createdAt: mappersDate,
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
						createdAt: mappersDate,
						isBanned: true,
					},
					post: null,
				}, {
					user: {
						id: 3,
						name: 'Third',
						createdAt: mappersDate,
						isBanned: null,
					},
					post: null,
				}]);
				expect(selected2).toStrictEqual([{
					user: {
						id: 1,
						name: 'First',
						createdAt: mappersDate,
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
						createdAt: mappersDate,
						isBanned: null,
						name: 'First',
						postId: 1,
						userId: 1,
					},
					{
						content: null,
						createdAt: mappersDate,
						isBanned: true,
						name: 'Second',
						postId: null,
						userId: 2,
					},
					{
						content: null,
						createdAt: mappersDate,
						isBanned: null,
						name: 'Third',
						postId: null,
						userId: 3,
					},
				]);
				expect(selected4).toStrictEqual([
					{
						content: 'p1',
						createdAt: mappersDate,
						isBanned: null,
						name: 'First',
						postId: 1,
						userId: 1,
					},
				]);
			}));
	},
});
