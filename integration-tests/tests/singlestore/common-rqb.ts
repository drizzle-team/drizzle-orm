/* eslint-disable @typescript-eslint/no-unused-vars */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import type { Test } from './instrumentation';
import { rqbPost, rqbUser } from './schema';

export function tests(test: Test) {
	const connDict: Record<string, any> = {};

	describe('common', () => {
		test.beforeEach(async ({ db, client, push }) => {
			const connKey = `${client.config.user}:${client.config.password}@${client.config.host}:${client.config.port}`;
			if (connDict[connKey] === undefined) {
				connDict[connKey] = false;

				await Promise.all([
					db.execute(sql`drop table if exists ${rqbUser};`),
					db.execute(sql`drop table if exists ${rqbPost};`),
				]);

				await Promise.all([
					push({ rqbUser }),
					push({ rqbPost }),
				]);
			}

			await Promise.all([
				db.execute(sql`truncate table ${rqbUser};`),
				db.execute(sql`truncate table ${rqbPost};`),
			]);
		});

		test.concurrent('RQB v2 simple find first - no rows', async ({ db }) => {
			const result = await db.query.rqbUser.findFirst();

			expect(result).toStrictEqual(undefined);
		});

		test.concurrent('RQB v2 simple find first - multiple rows', async ({ db }) => {
			const date = new Date(120000);

			await db.insert(rqbUser).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			const result = await db.query.rqbUser.findFirst({
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

		test.concurrent('RQB v2 simple find first - with relation', async ({ db }) => {
			const date = new Date(120000);

			await db.insert(rqbUser).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			await db.insert(rqbPost).values([{
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

			const result = await db.query.rqbUser.findFirst({
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

		test.concurrent('RQB v2 simple find first - placeholders', async ({ db }) => {
			const date = new Date(120000);

			await db.insert(rqbUser).values([{
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
			}).prepare();

			const result = await query.execute({
				filter: 2,
			});

			expect(result).toStrictEqual({
				id: 2,
				createdAt: date,
				name: 'Second',
			});
		});

		test.concurrent('RQB v2 simple find many - no rows', async ({ db }) => {
			const result = await db.query.rqbUser.findMany();

			expect(result).toStrictEqual([]);
		});

		test.concurrent('RQB v2 simple find many - multiple rows', async ({ db }) => {
			const date = new Date(120000);

			await db.insert(rqbUser).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			const result = await db.query.rqbUser.findMany({
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

		test.concurrent('RQB v2 simple find many - with relation', async ({ db }) => {
			const date = new Date(120000);

			await db.insert(rqbUser).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			await db.insert(rqbPost).values([{
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

			const result = await db.query.rqbPost.findMany({
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

		test.concurrent('RQB v2 simple find many - placeholders', async ({ db }) => {
			const date = new Date(120000);

			await db.insert(rqbUser).values([{
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
			}).prepare();

			const result = await query.execute({
				filter: 2,
			});

			expect(result).toStrictEqual([{
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);
		});

		test.concurrent('RQB v2 transaction find first - no rows', async ({ db }) => {
			await db.transaction(async (db) => {
				const result = await db.query.rqbUser.findFirst();

				expect(result).toStrictEqual(undefined);
			});
		});

		test.concurrent('RQB v2 transaction find first - multiple rows', async ({ db }) => {
			const date = new Date(120000);

			await db.insert(rqbUser).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			await db.transaction(async (db) => {
				const result = await db.query.rqbUser.findFirst({
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

		test.concurrent('RQB v2 transaction find first - with relation', async ({ db }) => {
			const date = new Date(120000);

			await db.insert(rqbUser).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			await db.insert(rqbPost).values([{
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
				const result = await db.query.rqbUser.findFirst({
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

		test.concurrent('RQB v2 transaction find first - placeholders', async ({ db }) => {
			const date = new Date(120000);

			await db.insert(rqbUser).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			await db.transaction(async (db) => {
				const query = db.query.rqbUser.findFirst({
					where: {
						id: {
							eq: sql.placeholder('filter'),
						},
					},
					orderBy: {
						id: 'asc',
					},
				}).prepare();

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

		test.concurrent('RQB v2 transaction find many - no rows', async ({ db }) => {
			await db.transaction(async (db) => {
				const result = await db.query.rqbUser.findMany();

				expect(result).toStrictEqual([]);
			});
		});

		test.concurrent('RQB v2 transaction find many - multiple rows', async ({ db }) => {
			const date = new Date(120000);

			await db.insert(rqbUser).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			await db.transaction(async (db) => {
				const result = await db.query.rqbUser.findMany({
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

		test.concurrent('RQB v2 transaction find many - with relation', async ({ db }) => {
			const date = new Date(120000);

			await db.insert(rqbUser).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			await db.insert(rqbPost).values([{
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
				const result = await db.query.rqbPost.findMany({
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

		test.concurrent('RQB v2 transaction find many - placeholders', async ({ db }) => {
			const date = new Date(120000);

			await db.insert(rqbUser).values([{
				id: 1,
				createdAt: date,
				name: 'First',
			}, {
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);

			await db.transaction(async (db) => {
				const query = db.query.rqbUser.findMany({
					where: {
						id: {
							eq: sql.placeholder('filter'),
						},
					},
					orderBy: {
						id: 'asc',
					},
				}).prepare();

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
	});
}
