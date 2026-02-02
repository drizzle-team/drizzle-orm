// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { and, eq, inArray, isNotNull, not, or, sql } from 'drizzle-orm';
import type { AnyPgColumn, PgColumnBuilder } from 'drizzle-orm/pg-core';
import { bigint, integer, numeric, pgEnum, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
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
		// postpone
		test.skipIf(Date.now() < +new Date('2026-02-10')).concurrent(
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
						activeOrders: db
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
					},
				});

				const expectedResult = [{ id: 1, activeOrders: 0 }, { id: 2, activeOrders: 1 }];
				const result = await recordsQuery;
				expect(result).toStrictEqual(expectedResult);
				expect(recordsQuery.toSQL()).toStrictEqual({
					sql:
						'select "d0"."id" as "id", ((select count(*) from "rqb_orders_18" where ("rqb_orders_18"."user_id" = "d0"."id" and not "rqb_orders_18"."status" in ($1, $2)))) as "activeOrders" from "rqb_users_18" as "d0"',
					params: ['CANCELED', 'CLOSED'],
					typings: ['none', 'none'],
				});
			},
		);

		// https://github.com/drizzle-team/drizzle-orm/issues/4696
		test.concurrent(
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
	});
}
