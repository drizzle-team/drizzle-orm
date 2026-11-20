// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { postponed } from '@drizzle/test-utils';
import { and, defineRelations, eq, exists, inArray, not, sql } from 'drizzle-orm';
import type { AnyPgColumn, PgColumnBuilder } from 'drizzle-orm/pg-core';
import {
	bigint,
	customType,
	decimal,
	index,
	integer,
	jsonb,
	numeric,
	pgEnum,
	pgTable,
	QueryBuilder,
	serial,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
} from 'drizzle-orm/pg-core';
import { describe, expect, expectTypeOf } from 'vitest';
import type { Test } from './instrumentation';

export function tests(test: Test) {
	describe('common', () => {
		test.concurrent('RQB v2 simple find first - no rows', async ({ push, createDB }) => {
			const users = pgTable('rqb_users_1', {
				id: serial().primaryKey().notNull(),
				name: text().notNull(),
				createdAt: timestamp('created_at', {
					mode: 'date',
					precision: 3,
				}).notNull(),
			});

			await push({ users });
			const db = createDB({ users });

			const result = await db.query.users.findFirst();

			expect(result).toStrictEqual(undefined);
		});

		test.concurrent('RQB v2 simple find first - multiple rows', async ({ push, createDB }) => {
			const users = pgTable('rqb_users_2', {
				id: serial().primaryKey().notNull(),
				name: text().notNull(),
				createdAt: timestamp('created_at', {
					mode: 'date',
					precision: 3,
				}).notNull(),
			});

			await push({ users });
			const db = createDB({ users });

			const date = new Date(120000);

			await db.insert(users).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			const result = await db.query.users.findFirst({
				orderBy: {
					id: 'desc',
				},
			});

			expect(result).toStrictEqual({
				id: 2,
				createdAt: date,
				name: 'Second',
			});
		});

		test.concurrent('RQB v2 simple find first - with relation', async ({ push, createDB }) => {
			const users = pgTable('rqb_users_3', {
				id: serial().primaryKey().notNull(),
				name: text().notNull(),
				createdAt: timestamp('created_at', {
					mode: 'date',
					precision: 3,
				}).notNull(),
			});

			const posts = pgTable('rqb_posts_3', {
				id: serial().primaryKey().notNull(),
				userId: integer('user_id').notNull(),
				content: text(),
				createdAt: timestamp('created_at', {
					mode: 'date',
					precision: 3,
				}).notNull(),
			});

			await push({ users, posts });
			const db = createDB({ users, posts }, (r) => ({
				users: {
					posts: r.many.posts({
						from: r.users.id,
						to: r.posts.userId,
					}),
				},
				posts: {
					author: r.one.users({
						from: r.posts.userId,
						to: r.users.id,
					}),
				},
			}));

			const date = new Date(120000);

			await db.insert(users).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			await db.insert(posts).values([{
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

			const result = await db.query.users.findFirst({
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
		});

		test.concurrent('RQB v2 simple find first - placeholders', async ({ push, createDB }) => {
			const users = pgTable('rqb_users_4', {
				id: serial().primaryKey().notNull(),
				name: text().notNull(),
				createdAt: timestamp('created_at', {
					mode: 'date',
					precision: 3,
				}).notNull(),
			});

			await push({ users });
			const db = createDB({ users });

			const date = new Date(120000);

			await db.insert(users).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			const query = db.query.users.findFirst({
				where: {
					id: {
						eq: sql.placeholder('filter'),
					},
				},
				orderBy: {
					id: 'asc',
				},
			}).prepare('rqb_v2_find_first_placeholders');

			const result = await query.execute({
				filter: 2,
			});

			expect(result).toStrictEqual({
				id: 2,
				createdAt: date,
				name: 'Second',
			});
		});

		// https://github.com/drizzle-team/drizzle-orm/issues/5172
		test.concurrent('RQB v2 simple find first - result type', async ({ push, createDB }) => {
			const user = pgTable('users', {
				id: text('id').primaryKey(),
				email: text('email').notNull().unique(),
				password: text('password').notNull(),
			});

			const userSession = pgTable('user_sessions', {
				id: text('id').primaryKey(),
				userId: text('user_id')
					.notNull()
					.references(() => user.id),
				expiresAt: timestamp('expires_at', {
					withTimezone: true,
					mode: 'date',
				}).notNull(),
			});

			const schema = { user, userSession };
			const db = createDB(schema, (r) => ({
				user: {
					sessions: r.many.userSession(),
				},
				userSession: {
					user: r.one.user({
						from: r.userSession.userId,
						to: r.user.id,
						optional: false,
					}),
				},
			}));

			const query = db.query.userSession.findFirst({
				where: { id: '' },
				with: { user: true },
			});

			expectTypeOf(query).resolves.toEqualTypeOf<
				{
					id: string;
					userId: string;
					expiresAt: Date;
					user: {
						id: string;
						email: string;
						password: string;
					};
				} | undefined
			>();
		});

		// https://github.com/drizzle-team/drizzle-orm/issues/5172
		test.concurrent('RQB v2 simple find first - result type', async ({ push, createDB }) => {
			const user = pgTable('users', {
				id: text('id').primaryKey(),
				email: text('email').notNull().unique(),
				password: text('password').notNull(),
			});

			const userSession = pgTable('user_sessions', {
				id: text('id').primaryKey(),
				userId: text('user_id')
					.notNull()
					.references(() => user.id),
				expiresAt: timestamp('expires_at', {
					withTimezone: true,
					mode: 'date',
				}).notNull(),
			});

			const schema = { user, userSession };
			const db = createDB(schema, (r) => ({
				user: {
					sessions: r.many.userSession(),
				},
				userSession: {
					user: r.one.user({
						from: r.userSession.userId,
						to: r.user.id,
						optional: false,
					}),
				},
			}));

			const query = db.query.userSession.findFirst({
				where: { id: '' },
				with: { user: true },
			});

			expectTypeOf(query).resolves.toEqualTypeOf<
				{
					id: string;
					userId: string;
					expiresAt: Date;
					user: {
						id: string;
						email: string;
						password: string;
					};
				} | undefined
			>();
		});

		test.concurrent('RQB v2 simple find many - no rows', async ({ push, createDB }) => {
			const users = pgTable('rqb_users_5', {
				id: serial().primaryKey().notNull(),
				name: text().notNull(),
				createdAt: timestamp('created_at', {
					mode: 'date',
					precision: 3,
				}).notNull(),
			});

			await push({ users });
			const db = createDB({ users });

			const result = await db.query.users.findMany();

			expect(result).toStrictEqual([]);
		});

		test.concurrent('RQB v2 simple find many - multiple rows', async ({ push, createDB }) => {
			const users = pgTable('rqb_users_6', {
				id: serial().primaryKey().notNull(),
				name: text().notNull(),
				createdAt: timestamp('created_at', {
					mode: 'date',
					precision: 3,
				}).notNull(),
			});

			await push({ users });
			const db = createDB({ users });

			const date = new Date(120000);

			await db.insert(users).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			const result = await db.query.users.findMany({
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
		});

		test.concurrent('RQB v2 simple find many - with relation', async ({ push, createDB }) => {
			const users = pgTable('rqb_users_7', {
				id: serial().primaryKey().notNull(),
				name: text().notNull(),
				createdAt: timestamp('created_at', {
					mode: 'date',
					precision: 3,
				}).notNull(),
			});

			const posts = pgTable('rqb_posts_7', {
				id: serial().primaryKey().notNull(),
				userId: integer('user_id').notNull(),
				content: text(),
				createdAt: timestamp('created_at', {
					mode: 'date',
					precision: 3,
				}).notNull(),
			});

			await push({ users, posts });
			const db = createDB({ users, posts }, (r) => ({
				posts: {
					author: r.one.users({
						from: r.posts.userId,
						to: r.users.id,
					}),
				},
			}));

			const date = new Date(120000);

			await db.insert(users).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			await db.insert(posts).values([{
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

			const result = await db.query.posts.findMany({
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
		});

		test.concurrent('RQB v2 simple find many - placeholders', async ({ push, createDB }) => {
			const users = pgTable('rqb_users_8', {
				id: serial().primaryKey().notNull(),
				name: text().notNull(),
				createdAt: timestamp('created_at', {
					mode: 'date',
					precision: 3,
				}).notNull(),
			});

			await push({ users });
			const db = createDB({ users });

			const date = new Date(120000);

			await db.insert(users).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			const query = db.query.users.findMany({
				where: {
					id: {
						eq: sql.placeholder('filter'),
					},
				},
				orderBy: {
					id: 'asc',
				},
			}).prepare('rqb_v2_find_many_placeholders');

			const result = await query.execute({
				filter: 2,
			});

			expect(result).toStrictEqual([{
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);
		});

		test.concurrent('RQB v2 transaction find first - no rows', async ({ push, createDB }) => {
			const users = pgTable('rqb_users_9', {
				id: serial().primaryKey().notNull(),
				name: text().notNull(),
				createdAt: timestamp('created_at', {
					mode: 'date',
					precision: 3,
				}).notNull(),
			});

			await push({ users });
			const db = createDB({ users });

			await db.transaction(async (db) => {
				const result = await db.query.users.findFirst();

				expect(result).toStrictEqual(undefined);
			});
		});

		test.concurrent('RQB v2 transaction find first - multiple rows', async ({ push, createDB }) => {
			const users = pgTable('rqb_users_10', {
				id: serial().primaryKey().notNull(),
				name: text().notNull(),
				createdAt: timestamp('created_at', {
					mode: 'date',
					precision: 3,
				}).notNull(),
			});

			await push({ users });
			const db = createDB({ users });

			const date = new Date(120000);

			await db.insert(users).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			await db.transaction(async (db) => {
				const result = await db.query.users.findFirst({
					orderBy: {
						id: 'desc',
					},
				});

				expect(result).toStrictEqual({
					id: 2,
					createdAt: date,
					name: 'Second',
				});
			});
		});

		test.concurrent('RQB v2 transaction find first - with relation', async ({ push, createDB }) => {
			const users = pgTable('rqb_users_11', {
				id: serial().primaryKey().notNull(),
				name: text().notNull(),
				createdAt: timestamp('created_at', {
					mode: 'date',
					precision: 3,
				}).notNull(),
			});

			const posts = pgTable('rqb_posts_11', {
				id: serial().primaryKey().notNull(),
				userId: integer('user_id').notNull(),
				content: text(),
				createdAt: timestamp('created_at', {
					mode: 'date',
					precision: 3,
				}).notNull(),
			});

			await push({ users, posts });
			const db = createDB({ users, posts }, (r) => ({
				users: {
					posts: r.many.posts({
						from: r.users.id,
						to: r.posts.userId,
					}),
				},
			}));

			const date = new Date(120000);

			await db.insert(users).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			await db.insert(posts).values([{
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

			await db.transaction(async (db) => {
				const result = await db.query.users.findFirst({
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
			});
		});

		test.concurrent('RQB v2 transaction find first - placeholders', async ({ push, createDB }) => {
			const users = pgTable('rqb_users_12', {
				id: serial().primaryKey().notNull(),
				name: text().notNull(),
				createdAt: timestamp('created_at', {
					mode: 'date',
					precision: 3,
				}).notNull(),
			});

			await push({ users });
			const db = createDB({ users });

			const date = new Date(120000);

			await db.insert(users).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			await db.transaction(async (db) => {
				const query = db.query.users.findFirst({
					where: {
						id: {
							eq: sql.placeholder('filter'),
						},
					},
					orderBy: {
						id: 'asc',
					},
				}).prepare('rqb_v2_find_first_tx_placeholders');

				const result = await query.execute({
					filter: 2,
				});

				expect(result).toStrictEqual({
					id: 2,
					createdAt: date,
					name: 'Second',
				});
			});
		});

		test.concurrent('RQB v2 transaction find many - no rows', async ({ push, createDB }) => {
			const users = pgTable('rqb_users_13', {
				id: serial().primaryKey().notNull(),
				name: text().notNull(),
				createdAt: timestamp('created_at', {
					mode: 'date',
					precision: 3,
				}).notNull(),
			});

			await push({ users });
			const db = createDB({ users });

			await db.transaction(async (db) => {
				const result = await db.query.users.findMany();

				expect(result).toStrictEqual([]);
			});
		});

		test.concurrent('RQB v2 transaction find many - multiple rows', async ({ push, createDB }) => {
			const users = pgTable('rqb_users_14', {
				id: serial().primaryKey().notNull(),
				name: text().notNull(),
				createdAt: timestamp('created_at', {
					mode: 'date',
					precision: 3,
				}).notNull(),
			});

			await push({ users });
			const db = createDB({ users });

			const date = new Date(120000);

			await db.insert(users).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			await db.transaction(async (db) => {
				const result = await db.query.users.findMany({
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
			});
		});

		test.concurrent('RQB v2 transaction find many - with relation', async ({ push, createDB }) => {
			const users = pgTable('rqb_users_15', {
				id: serial().primaryKey().notNull(),
				name: text().notNull(),
				createdAt: timestamp('created_at', {
					mode: 'date',
					precision: 3,
				}).notNull(),
			});

			const posts = pgTable('rqb_posts_15', {
				id: serial().primaryKey().notNull(),
				userId: integer('user_id').notNull(),
				content: text(),
				createdAt: timestamp('created_at', {
					mode: 'date',
					precision: 3,
				}).notNull(),
			});

			await push({ users, posts });
			const db = createDB({ users, posts }, (r) => ({
				posts: {
					author: r.one.users({
						from: r.posts.userId,
						to: r.users.id,
					}),
				},
			}));

			const date = new Date(120000);

			await db.insert(users).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			await db.insert(posts).values([{
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

			await db.transaction(async (db) => {
				const result = await db.query.posts.findMany({
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
			});
		});

		test.concurrent('RQB v2 transaction find many - placeholders', async ({ push, createDB }) => {
			const users = pgTable('rqb_users_16', {
				id: serial().primaryKey().notNull(),
				name: text().notNull(),
				createdAt: timestamp('created_at', {
					mode: 'date',
					precision: 3,
				}).notNull(),
			});

			await push({ users });
			const db = createDB({ users });

			const date = new Date(120000);

			await db.insert(users).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			await db.transaction(async (db) => {
				const query = db.query.users.findMany({
					where: {
						id: {
							eq: sql.placeholder('filter'),
						},
					},
					orderBy: {
						id: 'asc',
					},
				}).prepare('rqb_v2_find_many_placeholders_10');

				const result = await query.execute({
					filter: 2,
				});

				expect(result).toStrictEqual([{
					id: 2,
					createdAt: date,
					name: 'Second',
				}]);
			});
		});

		// https://github.com/drizzle-team/drizzle-orm/issues/4358
		test.concurrent('RQB v2 find many - table creation func', async ({ push, createDB }) => {
			const createUserTable = <T extends Record<string, PgColumnBuilder<any>>>(
				{ customColumns, tableName }: { customColumns: T; tableName: string },
			) =>
				pgTable(tableName, {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
					email: text('email').notNull().unique(),
					createdAt: timestamp('created_at').defaultNow().notNull(),
					...customColumns,
				});
			const users = createUserTable(
				{
					tableName: 'rqb_users_17',
					customColumns: {
						test: text('test').notNull(),
					},
				},
			);

			const orders = pgTable('rqb_orders_17', {
				id: serial('id').primaryKey(),
				userId: integer('user_id').references(() => users.id).notNull(),
				amount: integer('amount').notNull(),
				status: text('status').notNull(),
				createdAt: timestamp('created_at').defaultNow().notNull(),
			});

			await push({ users, orders });
			const db = createDB({ users, orders }, (r) => ({
				orders: {
					user: r.one.users({
						from: [r.orders.userId],
						to: [r.users.id],
					}),
				},
			}));

			await db.insert(users).values([{ id: 1, email: 'a', name: 'b', test: 'c' }, {
				id: 2,
				email: 'aa',
				name: 'bb',
				test: 'cc',
			}]);
			await db.insert(orders).values([{ userId: 1, amount: 11, status: 'delivered' }, {
				userId: 2,
				amount: 22,
				status: 'delivered',
			}]);

			const ordersWithUser = await db.query.orders.findMany({
				with: {
					user: {
						columns: {
							id: true,
							// This fails type checking. `id` column works, but not `test`
							test: true,
						},
					},
				},
			});

			for (const order of ordersWithUser) {
				expect(order.user!.id).toBeDefined();
				expect(order.user!.test).toBeDefined();
			}
		});

		// https://github.com/drizzle-team/drizzle-orm/issues/4169
		// https://github.com/drizzle-team/drizzle-orm/issues/3493
		test.concurrent(
			'RQB v2 find many - $count',
			async ({ push, createDB }) => {
				const users = pgTable('rqb_users_18', {
					id: serial('id').primaryKey(),
				});

				const statusEnum = pgEnum('status', [
					'IN_PROGRESS',
					'CANCELED',
					'CLOSED',
				]);

				const orders = pgTable('rqb_orders_18', {
					id: serial('id').primaryKey(),
					userId: integer('user_id').references(() => users.id).notNull(),
					status: statusEnum('status'),
				});

				await push({ users, orders, statusEnum });
				const db = createDB({ users, orders }, (r) => ({
					orders: {
						user: r.one.users({
							from: [r.orders.userId],
							to: [r.users.id],
						}),
					},
				}));

				await db.insert(users).values([{ id: 1 }, { id: 2 }]);
				await db.insert(orders).values([{ userId: 1, status: 'CANCELED' }, { userId: 2, status: 'IN_PROGRESS' }]);

				const recordsQuery = db.query.users.findMany({
					extras: {
						activeOrders: (users) =>
							db
								.$count(
									orders,
									and(
										eq(orders.userId, users.id),
										not(
											inArray(orders.status, ['CANCELED', 'CLOSED']),
										),
									),
								)
								.as('activeOrders'),
						allOrders: db.$count(orders),
					},
				});

				const expectedResult = [{ id: 1, activeOrders: 0, allOrders: 2 }, { id: 2, activeOrders: 1, allOrders: 2 }];
				const result = await recordsQuery;
				expect(result).toStrictEqual(expectedResult);
				expect(recordsQuery.toSQL()).toStrictEqual({
					sql:
						'select "d0"."id" as "id", ((select count(*) from "rqb_orders_18" where (("rqb_orders_18"."user_id" = "d0"."id") and (not ("rqb_orders_18"."status" in ($1, $2)))))) as "activeOrders", ((select count(*) from "rqb_orders_18")) as "allOrders" from "rqb_users_18" as "d0"',
					params: ['CANCELED', 'CLOSED'],
				});
			},
		);

		// https://github.com/drizzle-team/drizzle-orm/issues/4696
		// postgresjs returns strings for itemCount but other drivers return numbers
		test.skipIf(postponed).concurrent(
			'RQB v2 find many - extras',
			async ({ push, createDB }) => {
				const orderItemTable = pgTable('rqb_order_item_19', {
					id: integer('id').primaryKey(),
					orderId: integer().references(() => orderTable.id),
				});

				const orderTable = pgTable('rqb_order_19', {
					id: integer('id').primaryKey(),
				});

				await push({ orderItemTable, orderTable });
				const db = createDB({ orderItemTable, orderTable });

				await db.insert(orderTable).values([{ id: 1 }, { id: 2 }]);
				await db.insert(orderItemTable).values([{ id: 1, orderId: 1 }, { id: 2, orderId: 1 }]);

				const query = db.query.orderTable.findMany({
					extras: {
						itemCount: (t) =>
							sql`(select count(*) from ${orderItemTable} where ${orderItemTable.orderId} = ${t.id})`.as('itemCount'),
					},
				});

				expect(query.toSQL()).toStrictEqual({
					sql:
						`select "d0"."id" as "id", ((select count(*) from "rqb_order_item_19" where "rqb_order_item_19"."orderId" = "d0"."id")) as "itemCount" from "rqb_order_19" as "d0"`,
					params: [],
				});

				const expectedResult = [{ id: 1, itemCount: 2 }, { id: 2, itemCount: 0 }];
				const result = await query;
				expect(result).toStrictEqual(expectedResult);
			},
		);

		// https://github.com/drizzle-team/drizzle-orm/issues/4494
		test.concurrent('RQB v2 find first 100 columns in table', async ({ push, createDB }) => {
			const columns: Record<string, PgColumnBuilder<any>> = {};
			const columnCount = 101;
			for (let i = 0; i < columnCount; i++) {
				columns[`col${i}`] = numeric({ precision: 20, scale: 2 });
			}

			const prices = pgTable('prices', {
				id: integer().primaryKey(),
				...columns,
			});

			const entity = pgTable('entity', {
				id: serial('id').primaryKey(),
				priceId: integer('price_id').references(() => prices.id),
			});

			await push({ prices, entity });
			const db = createDB({ prices, entity }, (r) => ({
				entity: {
					price: r.one.prices({
						from: [r.entity.priceId],
						to: [r.prices.id],
					}),
				},
			}));

			await db.execute('insert into prices(id, col0, col1, col2) values (1, 23,24,25);');
			await db.insert(entity).values([{ id: 1, priceId: 1 }]);
			const query = db.query.entity.findFirst({
				with: {
					price: {},
				},
			});
			await query;
		});

		// https://github.com/drizzle-team/drizzle-orm/issues/5350
		test.concurrent('RQB v2 defineRelations error', () => {
			const users = pgTable('users', { id: integer().primaryKey() });
			const posts = pgTable('posts', { id: integer().primaryKey(), userId: integer() });
			const blogs = pgTable('blogs', { id: integer().primaryKey() });

			const throwFunc1 = () => {
				defineRelations({ users, posts, blogs }, (r) => ({
					users: {
						posts: r.many.posts({
							from: r.users.id,
							to: r.blogs.id,
						}),
					},
				}));
			};
			expect(throwFunc1).toThrowError(
				/.+all "to" columns must belong to table "posts", found column of table "blogs"$/,
			);

			const throwFunc2 = () => {
				defineRelations({ users, posts, blogs }, (r) => ({
					users: {
						posts: r.many.posts({
							from: r.blogs.id,
							to: r.posts.userId,
						}),
					},
				}));
			};
			expect(throwFunc2).toThrowError(
				/.+all "from" columns must belong to table "users", found column of table "blogs"$/,
			);
		});

		test.concurrent('RQB v2 defineRelations partial ".through" error', () => {
			const users = pgTable('users', { id: integer().primaryKey() });
			const groups = pgTable('groups', { id: integer().primaryKey() });
			const usersToGroups = pgTable('users_to_groups', { userId: integer(), groupId: integer() });

			const throughOnFromOnly = () => {
				defineRelations({ users, groups, usersToGroups }, (r) => ({
					users: {
						groups: r.many.groups({
							from: r.users.id.through(r.usersToGroups.userId),
							to: r.groups.id,
						}),
					},
				}));
			};
			expect(throughOnFromOnly).toThrowError(
				/.+".through\(column\)" must be used either on all columns in "from" and "to" or not defined on any of them$/,
			);

			const throughOnToOnly = () => {
				defineRelations({ users, groups, usersToGroups }, (r) => ({
					users: {
						groups: r.many.groups({
							from: r.users.id,
							to: r.groups.id.through(r.usersToGroups.groupId),
						}),
					},
				}));
			};
			expect(throughOnToOnly).toThrowError(
				/.+".through\(column\)" must be used either on all columns in "from" and "to" or not defined on any of them$/,
			);

			const throughOnSomeColumns = () => {
				const composite = pgTable('composite', { a: integer(), b: integer() });
				const compositeJoin = pgTable('composite_join', { a: integer(), b: integer() });

				defineRelations({ users, composite, compositeJoin }, (r) => ({
					users: {
						composite: r.many.composite({
							from: [r.users.id.through(r.compositeJoin.a), r.users.id],
							to: [r.composite.a.through(r.compositeJoin.a), r.composite.b.through(r.compositeJoin.b)],
						}),
					},
				}));
			};
			expect(throughOnSomeColumns).toThrowError(
				/.+".through\(column\)" must be used either on all columns in "from" and "to" or not defined on any of them$/,
			);
		});

		test.concurrent('RQB v2 subquery alias collision error', ({ createDB }) => {
			const users = pgTable('rqb_alias_users', { id: integer().primaryKey(), name: text() });
			const posts = pgTable('rqb_alias_posts', { id: integer().primaryKey(), authorId: integer() });

			const qb = new QueryBuilder();
			const first = qb.select({ id: users.id, name: users.name }).from(users).as('user_source');
			const second = qb.select({ id: users.id }).from(users).as('user_source');

			const db = createDB({ first, second, posts }, (r) => ({
				posts: {
					author: r.one.first({ from: r.posts.authorId, to: r.first.id }),
					owner: r.one.second({ from: r.posts.authorId, to: r.second.id }),
				},
			}));

			const throwFunc = () =>
				db.query.posts.findMany({ columns: { id: true }, with: { author: true, owner: true } }).toSQL();

			expect(throwFunc).toThrowError(
				/^Different subqueries with the same alias "user_source" are used in a single relational query.+$/,
			);
		});

		// https://github.com/drizzle-team/drizzle-orm/issues/4509
		test.concurrent.concurrent('Issue #4509', async ({ push, createDB }) => {
			const tasks = pgTable(
				'tasks',
				{
					id: integer().notNull().primaryKey(),
					parentId: integer().references((): AnyPgColumn => tasks.id, {
						onDelete: 'cascade',
					}),
					title: text().notNull(),
				},
			);

			await push({ tasks });
			const db = createDB({ tasks }, (r) => ({
				tasks: {
					parent: r.one.tasks({
						from: r.tasks.parentId,
						to: r.tasks.id,
					}),
					subtasks: r.many.tasks(),
				},
			}));

			await db.insert(tasks).values([{ title: '1', id: 1, parentId: null }, { title: '2', id: 2, parentId: 1 }, {
				title: '3',
				id: 3,
				parentId: null,
			}]);

			const result = await db.query.tasks
				.findMany({
					where: { parentId: { isNull: true } },
					with: { subtasks: true },
				});
			expect(result).toStrictEqual([
				{
					id: 1,
					parentId: null,
					subtasks: [
						{
							id: 2,
							parentId: 1,
							title: '2',
						},
					],
					title: '1',
				},
				{
					id: 3,
					parentId: null,
					subtasks: [],
					title: '3',
				},
			]);
		});
	});

	// https://github.com/drizzle-team/drizzle-orm/issues/5760
	test.concurrent('issue 5760. bigint precision', async ({ createDB, push }) => {
		const users = pgTable('users', {
			id: bigint({ mode: 'bigint' }).primaryKey(),
		});

		const posts = pgTable('posts', {
			id: bigint({ mode: 'bigint' }).primaryKey(),
			title: text().notNull(),
			author: bigint({ mode: 'bigint' })
				.notNull()
				.references(() => users.id, { onDelete: 'cascade' }),
		});

		const schema = { users, posts };
		const db = createDB(schema, (r) => ({
			users: {
				posts: r.many.posts(),
			},
			posts: {
				authorRel: r.one.users({
					from: r.posts.author,
					to: r.users.id,
				}),
			},
		}));

		await db.execute(sql`DROP TABLE IF EXISTS ${posts};`);
		await db.execute(sql`DROP TABLE IF EXISTS ${users};`);

		await push(schema);

		await db.insert(users).values({ id: 1000000000000000001n });
		await db.insert(posts).values([{ id: 1000000000000000002n, title: 'foo', author: 1000000000000000001n }, {
			id: 1000000000000000003n,
			title: 'bar',
			author: 1000000000000000001n,
		}]);

		const res = await db.query.users.findMany({ with: { posts: true } });
		expect(res).toStrictEqual([
			{
				id: 1000000000000000001n,
				posts: [
					{
						author: 1000000000000000001n,
						id: 1000000000000000002n,
						title: 'foo',
					},
					{
						author: 1000000000000000001n,
						id: 1000000000000000003n,
						title: 'bar',
					},
				],
			},
		]);
	});

	// https://github.com/drizzle-team/drizzle-orm/issues/4169
	test.concurrent('issue #4169', async ({ createDB }) => {
		const candidates = pgTable(
			'candidates',
			{
				id: uuid().defaultRandom().primaryKey(),
				createdOn: timestamp('created_on', { mode: 'date' }).notNull().defaultNow(),
				email: text().notNull(),
				firstName: text('first_name').notNull(),
				lastName: text('last_name').notNull(),
				phone: text('phone').notNull(),
				profileLink: text('profile_link'),
			},
			(table) => [
				index('created_on_candidates_idx').on(table.createdOn),
				uniqueIndex('email_candidates_idx').on(table.email),
			],
		);

		const candicacyStatusEnum = pgEnum('candidacy_status', [
			'IN_PROGRESS',
			'CANCELED',
			'CLOSED',
		]);

		const jobCandidacies = pgTable('job_candidacy', {
			id: uuid().defaultRandom().primaryKey(),
			createdOn: timestamp('created_on', { mode: 'date' }).notNull().defaultNow(),
			candidateId: uuid('candidate_id')
				.notNull()
				.references(() => candidates.id),
			status: candicacyStatusEnum().notNull(),
		});

		const db = createDB({ candidates, jobCandidacies }, (r) => ({
			candidates: {
				jobCandidacies: r.many.jobCandidacies(),
			},
			jobCandidacies: {
				candidate: r.one.candidates({
					from: r.jobCandidacies.candidateId,
					to: r.candidates.id,
				}),
			},
		}));

		const recordsQuery = db.query.candidates.findMany({
			// `created_on` would be selected through the driver's own cast codec - not what's tested here
			columns: { createdOn: false },
			extras: {
				activeJobs: db
					.$count(
						jobCandidacies,
						and(
							eq(jobCandidacies.candidateId, candidates.id),
							not(
								inArray(jobCandidacies.status, [
									'CANCELED',
									'CLOSED',
								]),
							),
						),
					)
					.as('activeJobs'),
			},
		}).toSQL();

		expect(recordsQuery).toStrictEqual({
			params: [
				'CANCELED',
				'CLOSED',
			],
			sql:
				'select "d0"."id" as "id", "d0"."email" as "email", "d0"."first_name" as "firstName", "d0"."last_name" as "lastName", "d0"."phone" as "phone", "d0"."profile_link" as "profileLink", ((select count(*) from "job_candidacy" where (("job_candidacy"."candidate_id" = "candidates"."id") and (not ("job_candidacy"."status" in ($1, $2)))))) as "activeJobs" from "candidates" as "d0"',
		});
	});

	// https://github.com/drizzle-team/drizzle-orm/issues/3943
	test.concurrent('issue No3943', async ({ createDB, push }) => {
		const parent = pgTable('parent', {
			id: serial().primaryKey(),
			parentVal: decimal(),
		});
		const child = pgTable('child', {
			parentId: serial().references(() => parent.id),
			childVal: decimal(),
		});

		const db = createDB({ parent, child }, (r) => ({
			child: {
				parent: r.one.parent({
					from: r.child.parentId,
					to: r.parent.id,
				}),
			},
			parent: {
				child: r.many.child(),
			},
		}));

		await push({ parent, child });

		const [parentRes] = await db.insert(parent).values({ parentVal: '12.34' }).returning();
		await db.insert(child).values({ parentId: parentRes?.id, childVal: '56.78' });
		const res = await db.query.child.findFirst({ with: { parent: true } });

		expect(res).toStrictEqual({
			childVal: '56.78',
			parent: {
				id: 1,
				parentVal: '12.34',
			},
			parentId: 1,
		});
	});

	// https://github.com/drizzle-team/drizzle-orm/issues/3400
	test.concurrent('issue 3400', async ({ createDB, push }) => {
		const users = pgTable('users', {
			id: varchar('id', { length: 191 }).notNull().primaryKey(),
			createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
				.default(sql`CURRENT_TIMESTAMP(3)`)
				.notNull(),
		});

		const posts = pgTable('posts', {
			id: varchar('id', { length: 191 }).notNull().primaryKey(),
			createdAt: timestamp('created_at', { precision: 3, mode: 'string' })
				.default(sql`CURRENT_TIMESTAMP(3)`)
				.notNull(),
			authorId: varchar('author_id', { length: 191 }).notNull(),
		});

		const db = createDB({ users, posts }, (r) => ({
			posts: {
				author: r.one.users({
					from: [r.posts.authorId],
					to: [r.users.id],
				}),
			},
		}));

		await db.execute(sql`DROP TABLE IF EXISTS ${posts};`);
		await db.execute(sql`DROP TABLE IF EXISTS ${users};`);
		await push({ users, posts });

		await db.insert(users).values({
			id: 'user_123',
		});

		await db.insert(posts).values([
			{
				id: 'post_123',
				authorId: 'user_123',
			},
		]);

		const user = await db.query.users.findFirst({});
		const post = await db.query.posts.findFirst({});
		const nested = await db.query.posts.findFirst({
			with: {
				author: true,
			},
		});

		const timestampFormat = (s: string) => (s.includes('T') ? 'ISO' : 'SQL');
		expect(timestampFormat(user!.createdAt)).toBe('SQL');
		expect(timestampFormat(post!.createdAt)).toBe('SQL');
		expect(timestampFormat(nested!.createdAt)).toBe('SQL');
		expect(timestampFormat(nested!.author!.createdAt)).toBe('SQL');

		await db.execute(sql`DROP TABLE IF EXISTS ${posts};`);
		await db.execute(sql`DROP TABLE IF EXISTS ${users};`);
	});

	// https://github.com/drizzle-team/drizzle-orm/issues/2279
	test.concurrent('Issue No2279', async ({ createDB, push }) => {
		const corrupt_jsonb_demo = pgTable('corrupt_jsonb_demo', {
			id: serial('id').primaryKey(),
			data: jsonb('data').$type<{ [key: string]: any }>().notNull(),
		});

		const db = createDB({ corrupt_jsonb_demo });

		await push({ corrupt_jsonb_demo });

		await db.execute(sql`INSERT INTO corrupt_jsonb_demo (data) VALUES ('{"a": 1}');`);

		const [res] = await db.select().from(corrupt_jsonb_demo);
		await db
			.update(corrupt_jsonb_demo)
			.set({
				data: res?.data,
			})
			.where(eq(corrupt_jsonb_demo.id, res!.id));

		const res2 = await db.select().from(corrupt_jsonb_demo);

		expect(res2).toStrictEqual([{ id: 1, data: { a: 1 } }]);
	});

	// https://github.com/drizzle-team/drizzle-orm/issues/6580
	test.concurrent('issue 6580. correlated exists with root table column from RAW callback', async ({ createDB, push }) => {
		const rootTable = pgTable('root_table_6580_callback', {
			id: uuid().primaryKey(),
			relatedId: uuid('related_id').notNull(),
		});
		const accountTable = pgTable('account_table_6580_callback', {
			id: uuid().primaryKey(),
			rootId: uuid('root_id').notNull(),
			provider: text().notNull(),
		});

		await push({ rootTable, accountTable });
		const db = createDB({ rootTable, accountTable });

		const rootId = '550e8400-e29b-41d4-a716-446655440000';
		await db.insert(rootTable).values([
			{ id: rootId, relatedId: rootId },
			{ id: '550e8400-e29b-41d4-a716-446655440001', relatedId: rootId },
		]);
		await db.insert(accountTable).values({
			id: '550e8400-e29b-41d4-a716-446655440002',
			rootId,
			provider: 'github',
		});

		const result = await db.query.rootTable.findFirst({
			where: {
				id: rootId,
				RAW: (root) =>
					exists(
						db.select({ id: accountTable.id }).from(accountTable).where(
							and(eq(accountTable.provider, 'github'), eq(accountTable.rootId, root.id)),
						),
					),
			},
		});

		expect(result).toStrictEqual({ id: rootId, relatedId: rootId });
	});

	// Nothing of one relational query may leak into the next one of the same shape: each shape below is run several
	// times, with other values each time
	test.concurrent('RQB v2 one shape run again with other values', async ({ createDB, push }) => {
		const owners = pgTable('rqb_shape_owners', {
			id: integer().primaryKey().notNull(),
			name: text().notNull(),
			score: integer().notNull(),
			tags: text().array().notNull(),
			meta: jsonb().$type<{ k: number; group: number; list: number[] }>().notNull(),
			createdAt: timestamp('created_at', { mode: 'date', precision: 3 }).notNull(),
		});
		const items = pgTable('rqb_shape_items', {
			id: integer().primaryKey().notNull(),
			ownerId: integer('owner_id').notNull(),
			label: text().notNull(),
		});

		await push({ owners, items });
		const db = createDB({ owners, items }, (r) => ({
			owners: { items: r.many.items({ from: r.owners.id, to: r.items.ownerId }) },
			items: { owner: r.one.owners({ from: r.items.ownerId, to: r.owners.id }) },
		}));

		const ownerRows = [1, 2, 3, 4, 5, 6].map((i) => ({
			id: i,
			name: `owner${i}`,
			score: i * 10,
			tags: [`t${i}`, i % 2 ? 'odd' : 'even'],
			meta: { k: i, group: i % 3, list: [i, i + 1] },
			createdAt: new Date(1e12 + i * 1000),
		}));
		const itemRows = ownerRows.flatMap((owner) =>
			[1, 2, 3].map((j) => ({ id: owner.id * 10 + j, ownerId: owner.id, label: `l${j}` }))
		);
		await db.insert(owners).values(ownerRows);
		await db.insert(items).values(itemRows);

		const byId = { id: 'asc' } as const;
		for (let round = 0; round < 3; ++round) {
			for (const i of [1, 2, 3, 4, 5, 6]) {
				const owner = ownerRows[i - 1]!;
				const parity = i % 2 ? 'odd' : 'even';

				expect(await db.query.owners.findFirst({ where: { id: i } })).toStrictEqual(owner);
				expect(await db.query.owners.findFirst({ where: { name: `owner${i}` } })).toStrictEqual(owner);

				expect(await db.query.owners.findMany({ where: { score: { gt: i * 10, lte: i * 10 + 20 } }, orderBy: byId }))
					.toStrictEqual(ownerRows.filter((row) => row.score > i * 10 && row.score <= i * 10 + 20));

				expect(await db.query.owners.findMany({ where: { name: { like: `%${i}` } } })).toStrictEqual([owner]);

				expect(await db.query.owners.findMany({ where: { id: { in: [i, 7 - i] } }, orderBy: byId }))
					.toStrictEqual(ownerRows.filter((row) => row.id === i || row.id === 7 - i));

				expect(await db.query.owners.findMany({ where: { createdAt: { gt: owner.createdAt } }, orderBy: byId }))
					.toStrictEqual(ownerRows.filter((row) => row.id > i));

				// an array and a JSON value are one param each, whatever is inside
				expect(await db.query.owners.findMany({ where: { tags: { arrayContains: [`t${i}`] } } }))
					.toStrictEqual([owner]);
				expect(await db.query.owners.findMany({ where: { tags: { arrayContains: [parity, `t${i}`] } } }))
					.toStrictEqual([owner]);
				expect(await db.query.owners.findMany({ where: { tags: { arrayOverlaps: [parity] } }, orderBy: byId }))
					.toStrictEqual(ownerRows.filter((row) => row.id % 2 === i % 2));
				expect(await db.query.owners.findMany({ where: { tags: { eq: owner.tags } } })).toStrictEqual([owner]);
				expect(await db.query.owners.findMany({ where: { meta: { eq: owner.meta } } })).toStrictEqual([owner]);

				expect(await db.query.owners.findMany({ orderBy: byId, limit: i, offset: 6 - i }))
					.toStrictEqual(ownerRows.slice(6 - i, 6));

				expect(
					await db.query.owners.findMany({
						where: { OR: [{ id: i }, { AND: [{ score: { gte: 50 } }, { NOT: { name: `owner${i}` } }] }] },
						orderBy: byId,
					}),
				).toStrictEqual(ownerRows.filter((row) => row.id === i || (row.score >= 50 && row.id !== i)));

				const label = `l${(i % 3) + 1}`;
				expect(
					await db.query.owners.findFirst({
						where: { id: i },
						columns: { id: true, name: true },
						with: { items: { where: { label: { ne: label } }, orderBy: byId, limit: (i % 2) + 1 } },
					}),
				).toStrictEqual({
					id: i,
					name: owner.name,
					items: itemRows.filter((row) => row.ownerId === i && row.label !== label).slice(0, (i % 2) + 1),
				});

				expect(await db.query.owners.findMany({ where: { items: { id: i * 10 + 1 } } })).toStrictEqual([owner]);

				expect(
					await db.query.items.findFirst({ where: { id: i * 10 + 2 }, with: { owner: { columns: { name: true } } } }),
				)
					.toStrictEqual({ id: i * 10 + 2, ownerId: i, label: 'l2', owner: { name: owner.name } });
			}
		}
	});

	// Values that decide the query, not only its params. Each sequence was once answered with the query of the
	// value before it, so every one is run from each of its values first, and then again
	test.concurrent('RQB v2 values that change the query, in sequences', async ({ createDB, push }) => {
		// SQL around the value for some values, the value itself for the rest
		const lowered = customType<{ data: string }>({
			dataType: () => 'text',
			toDriver: (value) => (value.startsWith('raw:') ? sql`lower(${value.slice(4)})` : value),
		});
		const rows = pgTable('rqb_sequence_rows', {
			id: integer().primaryKey().notNull(),
			slug: lowered().notNull(),
			bio: text(),
			meta: jsonb().$type<unknown>().notNull(),
			tags: text().array().notNull(),
		});

		await push({ rows });
		const db = createDB({ rows }, () => ({}));

		const data = [
			{ id: 1, slug: 's1', bio: null, meta: { a: { b: [1] } }, tags: ['a'] },
			{ id: 2, slug: 's2', bio: 'b2', meta: { a: { b: [2] } }, tags: ['b'] },
			{ id: 3, slug: 's3', bio: null, meta: [1, 'a'], tags: ['a', 'b'] },
			{ id: 4, slug: 's4', bio: 'b4', meta: [1, 'a', 2, 'b'], tags: ['c', 'd'] },
			{ id: 5, slug: 's5', bio: null, meta: [1, 2], tags: ['a', 'c'] },
			{ id: 6, slug: 's6', bio: 'b6', meta: [3, 4], tags: ['d', 'c'] },
		];
		await db.insert(rows).values(data);

		const ids = async (config: Record<string, unknown>) => {
			const found = await db.query.rows.findMany(
				{ columns: { id: true }, orderBy: { id: 'asc' }, ...config } as any,
			);
			return (found as { id: number }[]).map((row) => row.id);
		};
		const idsWhere = (keep: (row: typeof data[number]) => boolean) => data.filter(keep).map((row) => row.id);

		/** Runs `check` over the values starting from each of them in turn, twice around */
		const everyOrder = async <T>(values: T[], check: (value: T) => Promise<void>) => {
			for (let first = 0; first < values.length; ++first) {
				for (let i = 0; i < values.length * 2; ++i) await check(values[(first + i) % values.length]!);
			}
		};

		// a custom type that gives SQL for some values
		const slugOf = (value: string) => (value.startsWith('raw:') ? value.slice(4).toLowerCase() : value);
		await everyOrder(['s1', 'raw:S2', 's3', 'raw:S4', 'missing', 'raw:MISSING'], async (value) => {
			const slug = slugOf(value);
			expect(await ids({ where: { slug: value } }), value).toStrictEqual(idsWhere((row) => row.slug === slug));
			expect(await ids({ where: { slug: { ne: value } } }), value)
				.toStrictEqual(idsWhere((row) => row.slug !== slug));
			expect(await ids({ where: { slug: { in: [value, 'raw:S6'] } } }), value)
				.toStrictEqual(idsWhere((row) => row.slug === slug || row.slug === 's6'));
			expect(await ids({ where: { id: { gt: 1 }, slug: value }, limit: 5 }), value)
				.toStrictEqual(idsWhere((row) => row.id > 1 && row.slug === slug));
		});

		// `isNull` / `isNotNull` given a number or a string: a falsy one means no filter
		await everyOrder<unknown>([1, 0, 2, 0, 'x', ''], async (value) => {
			expect(await ids({ where: { bio: { isNull: value } } }), String(value))
				.toStrictEqual(idsWhere((row) => !value || row.bio === null));
			expect(await ids({ where: { id: { lte: 5 }, bio: { isNotNull: value } } }), String(value))
				.toStrictEqual(idsWhere((row) => row.id <= 5 && (!value || row.bio !== null)));
		});

		// JSON values that differ deep inside, and JSON arrays of other lengths and element types
		await everyOrder(data, async (row) => {
			expect(await ids({ where: { meta: { eq: row.meta } } }), JSON.stringify(row.meta)).toStrictEqual([row.id]);
			expect(await ids({ where: { meta: { ne: row.meta }, id: { gt: 0 } } }), JSON.stringify(row.meta))
				.toStrictEqual(idsWhere((other) => other.id !== row.id));
		});

		// array values of other lengths and contents
		await everyOrder(data, async (row) => {
			expect(await ids({ where: { tags: { eq: row.tags } } }), row.tags.join()).toStrictEqual([row.id]);
			expect(await ids({ where: { tags: { arrayContains: row.tags } } }), row.tags.join())
				.toStrictEqual(idsWhere((other) => row.tags.every((tag) => other.tags.includes(tag))));
			expect(await ids({ where: { tags: { arrayOverlaps: row.tags } } }), row.tags.join())
				.toStrictEqual(idsWhere((other) => row.tags.some((tag) => other.tags.includes(tag))));
		});

		// lists of every length, short and long
		for (const length of [1, 2, 3, 2, 33, 40, 200, 1, 33]) {
			const list = new Array(length).fill(0).map((_, i) => i + 1);
			expect(await ids({ where: { id: { in: list } } }), `in ${length}`)
				.toStrictEqual(idsWhere((row) => row.id <= length));
			expect(await ids({ where: { id: { notIn: list } } }), `notIn ${length}`)
				.toStrictEqual(idsWhere((row) => row.id > length));
		}

		// `limit` and `offset`, zero among them
		await everyOrder([0, 3, 0, 6, 1], async (value) => {
			expect(await ids({ limit: value }), `limit ${value}`).toStrictEqual(data.slice(0, value).map((row) => row.id));
			expect(await ids({ limit: 2, offset: value }), `offset ${value}`)
				.toStrictEqual(data.slice(value, value + 2).map((row) => row.id));
		});

		// the same filter with its keys in another order
		for (const i of [1, 2, 3, 4, 5, 6, 1]) {
			const expected = idsWhere((row) => row.id >= i && row.slug !== `s${i}`).slice(0, 3);
			expect(await ids({ where: { id: { gte: i }, slug: { ne: `s${i}` } }, limit: 3 })).toStrictEqual(expected);
			expect(await ids({ limit: 3, where: { slug: { ne: `s${i}` }, id: { gte: i } } })).toStrictEqual(expected);
		}
	});
}
