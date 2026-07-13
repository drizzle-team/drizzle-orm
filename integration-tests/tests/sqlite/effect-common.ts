import { assert, expect, expectTypeOf, it, vi, Vitest } from '@effect/vitest';
import {
	and,
	asc,
	eq,
	gt,
	gte,
	inArray,
	lt,
	makeDefaultQueryMapper,
	makeDefaultRqbMapper,
	makeJitQueryMapper,
	makeJitRqbMapper,
	sql,
} from 'drizzle-orm';
import { EffectCache, type EffectCacheShape } from 'drizzle-orm/cache/core/cache-effect';
import { EffectLogger, type EffectLoggerShape, QueryEffectHKTBase } from 'drizzle-orm/effect-core';
import {
	EmptyRelations,
	ExtractTablesFromSchema,
	ExtractTablesWithRelations,
	RelationsBuilder,
	RelationsBuilderConfig,
	Schema,
} from 'drizzle-orm/relations';
import {
	alias,
	blob,
	except,
	integer,
	numeric,
	primaryKey,
	real,
	SQLiteDialect,
	sqliteTable,
	text,
	union,
} from 'drizzle-orm/sqlite-core';
import type { SQLiteEffectDatabase } from 'drizzle-orm/sqlite-core/effect/db';
import { ConfigError } from 'effect/Config';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Predicate from 'effect/Predicate';
import * as Ref from 'effect/Ref';
import * as Result from 'effect/Result';
import { SqlClient } from 'effect/unstable/sql/SqlClient';
import { SqlError } from 'effect/unstable/sql/SqlError';
import { TestCache } from './instrumentation';
import relations from './relations';
import { rqbPost, rqbUser } from './schema';

export class DB
	extends Context.Service<DB, SQLiteEffectDatabase<any, any, typeof relations>>()('CommonEffectSQLiteDB')
{}

let _diff!: (_: {}, schema: Record<string, unknown>, renames: []) => Promise<{ sqlStatements: string[] }>;
const getDiff = async () => {
	return _diff ??= (await import('../../../drizzle-kit/tests/sqlite/mocks' as string)).diff;
};

export const push = (db: SQLiteEffectDatabase<any, any, any>, schema: Record<string, any>) =>
	Effect.gen(function*() {
		const diff = yield* Effect.promise(() => getDiff());

		const { sqlStatements: deleteStatements } = yield* Effect.promise(() => diff(schema, {}, []));
		const { sqlStatements: createStatements } = yield* Effect.promise(() => diff({}, schema, []));

		for (const s of deleteStatements) {
			yield* db.run(s.replace('`', 'IF EXISTS `'));
		}
		for (const s of createStatements) {
			yield* db.run(s);
		}
	});

export interface RunCommonEffectSQLiteTestsOptions {
	testLayer: Layer.Layer<DB | SqlClient, SqlError | ConfigError, never>;
	SQLiteDrizzle: {
		make: (config?: any) => Effect.Effect<SQLiteEffectDatabase<QueryEffectHKTBase, any, EmptyRelations>, never, any>;
		makeWithDefaults: (
			config?: any,
		) => Effect.Effect<SQLiteEffectDatabase<QueryEffectHKTBase, any, EmptyRelations>, never, any>;
		DefaultServices: Layer.Layer<any, never, any>;
	};
	createDB: <
		TSchema extends Record<string, any>,
		TConfig extends RelationsBuilderConfig<TTables>,
		TTables extends Schema = ExtractTablesFromSchema<TSchema>,
	>(
		schema: TSchema,
		relations: (helpers: RelationsBuilder<TTables>) => TConfig,
		useJitMappers?: boolean,
	) => Effect.Effect<
		SQLiteEffectDatabase<QueryEffectHKTBase, any, ExtractTablesWithRelations<TConfig, TTables>>,
		never,
		any
	>;
	skipTests?: string[];
	addTests?: (it: Vitest.MethodsNonLive<DB | SqlClient>) => void;
}

export const runCommonEffectSQLiteTests = (opts: RunCommonEffectSQLiteTestsOptions): void => {
	const { testLayer, SQLiteDrizzle, createDB, addTests, skipTests = [] } = opts;

	it.layer(testLayer)('common', (it) => {
		it.beforeEach(({ task, skip }) => {
			if (skipTests.includes(task.name)) skip();
		});

		it.effect('execute - all', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const res = yield* db.all<{ '1': 1 }>(sql`SELECT 1 as "1"`);

				expect(res).toStrictEqual([{ '1': 1 }]);
			}));

		it.effect('execute - get', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const res = yield* db.get<{ '1': 1 }>(sql`SELECT 1 as "1"`);

				expect(res).toStrictEqual({ '1': 1 });
			}));

		it.effect('execute - values', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const res = yield* db.values<[number]>(sql`SELECT 1 as "1"`);

				expect(res).toStrictEqual([[1]]);
			}));

		it.effect('all types', () =>
			Effect.gen(function*() {
				const allTypesTable = sqliteTable('all_types', {
					int: integer('int', {
						mode: 'number',
					}),
					bool: integer('bool', {
						mode: 'boolean',
					}),
					time: integer('time', {
						mode: 'timestamp',
					}),
					timeMs: integer('time_ms', {
						mode: 'timestamp_ms',
					}),
					bigint: blob('bigint', {
						mode: 'bigint',
					}),
					buffer: blob('buffer', {
						mode: 'buffer',
					}),
					json: blob('json', {
						mode: 'json',
					}),
					numeric: numeric('numeric'),
					numericNum: numeric('numeric_num', {
						mode: 'number',
					}),
					numericBig: numeric('numeric_big', {
						mode: 'bigint',
					}),
					real: real('real'),
					text: text('text', {
						mode: 'text',
					}),
					jsonText: text('json_text', {
						mode: 'json',
					}),
				});

				const db = yield* DB;
				yield* push(db, { allTypesTable });

				yield* db.insert(allTypesTable).values({
					int: 1,
					bool: true,
					bigint: 5044565289845416380n,
					buffer: Buffer.from([
						0x44,
						0x65,
						0x73,
						0x70,
						0x61,
						0x69,
						0x72,
						0x20,
						0x6f,
						0x20,
						0x64,
						0x65,
						0x73,
						0x70,
						0x61,
						0x69,
						0x72,
						0x2e,
						0x2e,
						0x2e,
					]),
					json: {
						str: 'strval',
						arr: ['str', 10],
					},
					jsonText: {
						str: 'strvalb',
						arr: ['strb', 11],
					},
					numeric: '475452353476',
					numericNum: 9007199254740991,
					numericBig: 5044565289845416380n,
					real: 1.048596,
					text: 'TEXT STRING',
					time: new Date(1741743161623),
					timeMs: new Date(1741743161623),
				});

				const rawRes = yield* db.select().from(allTypesTable);

				expect(typeof rawRes[0]?.numericBig).toStrictEqual('bigint');

				type ExpectedType = {
					int: number | null;
					bool: boolean | null;
					time: Date | null;
					timeMs: Date | null;
					bigint: bigint | null;
					buffer: Buffer | null;
					json: unknown;
					numeric: string | null;
					numericNum: number | null;
					numericBig: bigint | null;
					real: number | null;
					text: string | null;
					jsonText: unknown;
				}[];

				const expectedRes: ExpectedType = [
					{
						int: 1,
						bool: true,
						time: new Date('2025-03-12T01:32:41.000Z'),
						timeMs: new Date('2025-03-12T01:32:41.623Z'),
						bigint: 5044565289845416380n,
						buffer: Buffer.from([
							0x44,
							0x65,
							0x73,
							0x70,
							0x61,
							0x69,
							0x72,
							0x20,
							0x6f,
							0x20,
							0x64,
							0x65,
							0x73,
							0x70,
							0x61,
							0x69,
							0x72,
							0x2e,
							0x2e,
							0x2e,
						]),
						json: { str: 'strval', arr: ['str', 10] },
						numeric: '475452353476',
						numericNum: 9007199254740991,
						numericBig: 5044565289845416380n,
						real: 1.048596,
						text: 'TEXT STRING',
						jsonText: { str: 'strvalb', arr: ['strb', 11] },
					},
				];

				expectTypeOf(rawRes).toEqualTypeOf<ExpectedType>();
				expect(rawRes).toStrictEqual(expectedRes);
			}));

		it.effect('RQB v2 simple find first - no rows', () =>
			Effect.gen(function*() {
				const db = yield* DB;

				yield* push(db, { rqbUser });

				const result = yield* db.query.rqbUser.findFirst();

				expect(result).toStrictEqual(undefined);
			}));

		it.effect('RQB v2 simple find first - multiple rows', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser });

				const date = new Date(120000);

				yield* db.insert(rqbUser).values([{
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

		it.effect('RQB v2 simple find first - with relation', () =>
			Effect.gen(function*() {
				const db = yield* DB;

				yield* push(db, { rqbUser, rqbPost });

				const date = new Date(120000);

				yield* db.insert(rqbUser).values([{
					id: 1,
					createdAt: date,
					name: 'First',
				}, {
					id: 2,
					createdAt: date,
					name: 'Second',
				}]);

				yield* db.insert(rqbPost).values([{
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

		it.effect('RQB v2 simple find first - placeholders', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser });

				const date = new Date(120000);

				yield* db.insert(rqbUser).values([{
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

				const result = yield* query.execute({
					filter: 2,
				});

				expect(result).toStrictEqual({
					id: 2,
					createdAt: date,
					name: 'Second',
				});
			}));

		it.effect('RQB v2 simple find many - no rows', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser });

				const result = yield* db.query.rqbUser.findMany();

				expect(result).toStrictEqual([]);
			}));

		it.effect('RQB v2 simple find many - multiple rows', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser });

				const date = new Date(120000);

				yield* db.insert(rqbUser).values([{
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

		it.effect('RQB v2 simple find many - with relation', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser, rqbPost });

				const date = new Date(120000);

				yield* db.insert(rqbUser).values([{
					id: 1,
					createdAt: date,
					name: 'First',
				}, {
					id: 2,
					createdAt: date,
					name: 'Second',
				}]);

				yield* db.insert(rqbPost).values([{
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

		it.effect('RQB v2 simple find many - placeholders', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser });

				const date = new Date(120000);

				yield* db.insert(rqbUser).values([{
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

				const result = yield* query.execute({
					filter: 2,
				});

				expect(result).toStrictEqual([{
					id: 2,
					createdAt: date,
					name: 'Second',
				}]);
			}));

		it.effect('RQB v2 transaction find first - no rows', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser });

				const result = yield* db.transaction((db) =>
					Effect.gen(function*() {
						const result = yield* db.query.rqbUser.findFirst();

						expect(result).toStrictEqual(undefined);

						return result;
					})
				);

				expect(result).toStrictEqual(undefined);
			}));

		it.effect('RQB v2 transaction find first - multiple rows', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser });

				const date = new Date(120000);

				yield* db.insert(rqbUser).values([{
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

		it.effect('RQB v2 transaction find first - with relation', () =>
			Effect.gen(function*() {
				const db = yield* DB;

				yield* push(db, { rqbUser, rqbPost });
				const date = new Date(120000);

				yield* db.insert(rqbUser).values([{
					id: 1,
					createdAt: date,
					name: 'First',
				}, {
					id: 2,
					createdAt: date,
					name: 'Second',
				}]);

				yield* db.insert(rqbPost).values([{
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

		it.effect('RQB v2 transaction find first - placeholders', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser });

				const date = new Date(120000);

				yield* db.insert(rqbUser).values([{
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
						}).prepare();

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

		it.effect('RQB v2 transaction find many - no rows', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser });

				const result = yield* db.transaction((db) =>
					Effect.gen(function*() {
						const result = yield* db.query.rqbUser.findMany();

						expect(result).toStrictEqual([]);
						return result;
					})
				);

				expect(result).toStrictEqual([]);
			}));

		it.effect('RQB v2 transaction find many - multiple rows', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser });

				const date = new Date(120000);

				yield* db.insert(rqbUser).values([{
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

		it.effect('RQB v2 transaction find many - with relation', () =>
			Effect.gen(function*() {
				const db = yield* DB;

				yield* push(db, { rqbUser, rqbPost });
				const date = new Date(120000);

				yield* db.insert(rqbUser).values([{
					id: 1,
					createdAt: date,
					name: 'First',
				}, {
					id: 2,
					createdAt: date,
					name: 'Second',
				}]);

				yield* db.insert(rqbPost).values([{
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

		it.effect('RQB v2 transaction find many - placeholders', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser });

				const date = new Date(120000);
				yield* db.insert(rqbUser).values([{
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
						}).prepare();

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

		it.effect('transaction', () =>
			Effect.gen(function*() {
				const db = yield* DB;

				const users = sqliteTable('users_transactions', {
					id: integer('id').primaryKey(),
					balance: integer('balance').notNull(),
				});
				const products = sqliteTable('products_transactions', {
					id: integer('id').primaryKey(),
					price: integer('price').notNull(),
					stock: integer('stock').notNull(),
				});

				yield* push(db, { users, products });

				const [user] = yield* db.insert(users).values({ balance: 100 }).returning();
				const [product] = yield* db.insert(products).values({ price: 10, stock: 10 }).returning();

				yield* db.transaction((tx) =>
					Effect.gen(function*() {
						yield* tx.update(users).set({ balance: user!.balance - product!.price }).where(eq(users.id, user!.id));
						yield* tx.update(products).set({ stock: product!.stock - 1 }).where(eq(products.id, product!.id));

						// Regardless if `db` or `tx` is used, every query within the transaction effect is completed in transaction
						const nonTxRes = yield* db.select().from(users);
						expect(nonTxRes).toStrictEqual([{ id: 1, balance: 90 }]);
					})
				);

				const result = yield* db.select().from(users);

				expect(result).toEqual([{ id: 1, balance: 90 }]);
			}));

		it.effect('transaction rollback', () =>
			Effect.gen(function*() {
				const db = yield* DB;

				const users = sqliteTable('users_transactions_rollback', {
					id: integer('id').primaryKey(),
					balance: integer('balance').notNull(),
				});

				yield* push(db, { users });

				const res = yield* db.transaction((tx) =>
					Effect.gen(function*() {
						yield* tx.insert(users).values({ balance: 100 });
						yield* tx.rollback();
					})
				).pipe(Effect.result);

				assert(Result.isFailure(res));
				assert(Predicate.isTagged(res.failure, 'EffectTransactionRollbackError'));

				const result = yield* db.select().from(users);

				expect(result).toEqual([]);
			}));

		it.effect('nested transaction', () =>
			Effect.gen(function*() {
				const db = yield* DB;

				const users = sqliteTable('users_nested_transactions', {
					id: integer('id').primaryKey(),
					balance: integer('balance').notNull(),
				});

				yield* push(db, { users });

				yield* db.transaction((tx) =>
					Effect.gen(function*() {
						yield* tx.insert(users).values({ balance: 100 });

						yield* tx.transaction((tx) =>
							Effect.gen(function*() {
								yield* tx.update(users).set({ balance: 200 });
							})
						);
					})
				);

				const result = yield* db.select().from(users);

				expect(result).toEqual([{ id: 1, balance: 200 }]);
			}));

		it.effect('nested transaction rollback', () =>
			Effect.gen(function*() {
				const db = yield* DB;

				const users = sqliteTable('users_nested_transactions_rollback', {
					id: integer('id').primaryKey(),
					balance: integer('balance').notNull(),
				});

				yield* push(db, { users });

				yield* db.transaction((tx) =>
					Effect.gen(function*() {
						yield* tx.insert(users).values({ balance: 100 });

						const res = yield* tx.transaction((tx) =>
							Effect.gen(function*() {
								yield* tx.update(users).set({ balance: 200 });
								yield* tx.rollback();
							})
						).pipe(Effect.result);

						assert(Result.isFailure(res));
						assert(Predicate.isTagged(res.failure, 'EffectTransactionRollbackError'));
					})
				);

				const result = yield* db.select().from(users);

				expect(result).toEqual([{ id: 1, balance: 100 }]);
			}));

		it.effect('update ... from with join', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const states = sqliteTable('states_30', {
					id: integer('id').primaryKey(),
					name: text('name').notNull(),
				});
				const cities = sqliteTable('cities_30', {
					id: integer('id').primaryKey(),
					name: text('name').notNull(),
					stateId: integer('state_id').references(() => states.id),
				});
				const users = sqliteTable('users_30', {
					id: integer('id').primaryKey(),
					name: text('name').notNull(),
					cityId: integer('city_id').notNull().references(() => cities.id),
				});

				yield* push(db, { states, cities, users });

				yield* db.insert(states).values([
					{ name: 'New York' },
					{ name: 'Washington' },
				]);
				yield* db.insert(cities).values([
					{ name: 'New York City', stateId: 1 },
					{ name: 'Seattle', stateId: 2 },
					{ name: 'London' },
				]);
				yield* db.insert(users).values([
					{ name: 'John', cityId: 1 },
					{ name: 'Jane', cityId: 2 },
					{ name: 'Jack', cityId: 3 },
				]);

				const result1 = yield* db
					.update(users)
					.set({
						cityId: cities.id,
					})
					.from(cities)
					.leftJoin(states, eq(cities.stateId, states.id))
					.where(and(eq(cities.name, 'Seattle'), eq(users.name, 'John')))
					.returning();
				const result2 = yield* db
					.update(users)
					.set({
						cityId: cities.id,
					})
					.from(cities)
					.leftJoin(states, eq(cities.stateId, states.id))
					.where(and(eq(cities.name, 'London'), eq(users.name, 'Jack')))
					.returning();

				expect(result1).toStrictEqual([{
					id: 1,
					name: 'John',
					cityId: 2,
				}]);
				expect(result2).toStrictEqual([{
					id: 3,
					name: 'Jack',
					cityId: 3,
				}]);
			}));

		it.effect('insert into ... select', () =>
			Effect.gen(function*() {
				const notifications = sqliteTable('notifications_31', {
					id: integer('id').primaryKey(),
					sentAt: integer('sent_at', {
						mode: 'timestamp_ms',
					}).notNull().default(sql`(cast((julianday('now') - 2440587.5)*86400000 as integer))`),
					message: text('message').notNull(),
				});
				const users = sqliteTable('users_31', {
					id: integer('id').primaryKey(),
					name: text('name').notNull(),
				});
				const userNotications = sqliteTable('user_notifications_31', {
					userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
					notificationId: integer('notification_id').notNull().references(() => notifications.id, {
						onDelete: 'cascade',
					}),
				}, (t) => [primaryKey({ columns: [t.userId, t.notificationId] })]);

				const db = yield* DB;

				yield* push(db, { notifications, users, userNotications });

				const newNotification = (yield* db
					.insert(notifications)
					.values({ message: 'You are one of the 3 lucky winners!' })
					.returning({ id: notifications.id }))[0]!;

				yield* db.insert(users).values([
					{ name: 'Alice' },
					{ name: 'Bob' },
					{ name: 'Charlie' },
					{ name: 'David' },
					{ name: 'Eve' },
				]);

				const sentNotifications = yield* db
					.insert(userNotications)
					.select(
						db
							.select({
								userId: users.id,
								notificationId: sql`${newNotification!.id}`.as('notification_id'),
							})
							.from(users)
							.where(inArray(users.name, ['Alice', 'Charlie', 'Eve']))
							.orderBy(asc(users.id)),
					)
					.returning();

				expect(sentNotifications).toStrictEqual([
					{ userId: 1, notificationId: newNotification!.id },
					{ userId: 3, notificationId: newNotification!.id },
					{ userId: 5, notificationId: newNotification!.id },
				]);
			}));

		it.effect('$count separate', () =>
			Effect.gen(function*() {
				const countTestTable = sqliteTable('count_test_33', {
					id: integer('id').notNull(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { countTestTable });

				yield* db.insert(countTestTable).values([
					{ id: 1, name: 'First' },
					{ id: 2, name: 'Second' },
					{ id: 3, name: 'Third' },
					{ id: 4, name: 'Fourth' },
				]);

				const count = yield* db.$count(countTestTable);

				expect(count).toStrictEqual(4);
			}));

		it.effect('$count embedded', () =>
			Effect.gen(function*() {
				const countTestTable = sqliteTable('count_test_34', {
					id: integer('id').notNull(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { countTestTable });

				yield* db.insert(countTestTable).values([
					{ id: 1, name: 'First' },
					{ id: 2, name: 'Second' },
					{ id: 3, name: 'Third' },
					{ id: 4, name: 'Fourth' },
				]);

				const count = yield* db.select({
					count: db.$count(countTestTable),
				}).from(countTestTable);

				expect(count).toStrictEqual([
					{ count: 4 },
					{ count: 4 },
					{ count: 4 },
					{ count: 4 },
				]);
			}));

		it.effect('$count separate reuse', () =>
			Effect.gen(function*() {
				const countTestTable = sqliteTable('count_test_35', {
					id: integer('id').notNull(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { countTestTable });

				yield* db.insert(countTestTable).values([
					{ id: 1, name: 'First' },
					{ id: 2, name: 'Second' },
					{ id: 3, name: 'Third' },
					{ id: 4, name: 'Fourth' },
				]);

				const count = db.$count(countTestTable);

				const count1 = yield* count;

				yield* db.insert(countTestTable).values({ id: 5, name: 'fifth' });

				const count2 = yield* count;

				yield* db.insert(countTestTable).values({ id: 6, name: 'sixth' });

				const count3 = yield* count;

				expect(count1).toStrictEqual(4);
				expect(count2).toStrictEqual(5);
				expect(count3).toStrictEqual(6);
			}));

		it.effect('$count embedded reuse', () =>
			Effect.gen(function*() {
				const countTestTable = sqliteTable('count_test_36', {
					id: integer('id').notNull(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { countTestTable });

				yield* db.insert(countTestTable).values([
					{ id: 1, name: 'First' },
					{ id: 2, name: 'Second' },
					{ id: 3, name: 'Third' },
					{ id: 4, name: 'Fourth' },
				]);

				const count = db.select({
					count: db.$count(countTestTable),
				}).from(countTestTable);

				const count1 = yield* count;

				yield* db.insert(countTestTable).values({ id: 5, name: 'fifth' });

				const count2 = yield* count;

				yield* db.insert(countTestTable).values({ id: 6, name: 'sixth' });

				const count3 = yield* count;

				expect(count1).toStrictEqual([
					{ count: 4 },
					{ count: 4 },
					{ count: 4 },
					{ count: 4 },
				]);
				expect(count2).toStrictEqual([
					{ count: 5 },
					{ count: 5 },
					{ count: 5 },
					{ count: 5 },
					{ count: 5 },
				]);
				expect(count3).toStrictEqual([
					{ count: 6 },
					{ count: 6 },
					{ count: 6 },
					{ count: 6 },
					{ count: 6 },
					{ count: 6 },
				]);
			}));

		it.effect('$count separate with filters', () =>
			Effect.gen(function*() {
				const countTestTable = sqliteTable('count_test_37', {
					id: integer('id').notNull(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { countTestTable });

				yield* db.insert(countTestTable).values([
					{ id: 1, name: 'First' },
					{ id: 2, name: 'Second' },
					{ id: 3, name: 'Third' },
					{ id: 4, name: 'Fourth' },
				]);

				const count = yield* db.$count(countTestTable, gt(countTestTable.id, 1));
				expect(count).toStrictEqual(3);
			}));

		it.effect('$count embedded with filters', () =>
			Effect.gen(function*() {
				const countTestTable = sqliteTable('count_test_38', {
					id: integer('id').notNull(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { countTestTable });

				yield* db.insert(countTestTable).values([
					{ id: 1, name: 'First' },
					{ id: 2, name: 'Second' },
					{ id: 3, name: 'Third' },
					{ id: 4, name: 'Fourth' },
				]);

				const count = yield* db.select({
					count: db.$count(countTestTable, gt(countTestTable.id, 1)),
				}).from(countTestTable);

				expect(count).toStrictEqual([
					{ count: 3 },
					{ count: 3 },
					{ count: 3 },
					{ count: 3 },
				]);
			}));

		it.effect('select distinct', () =>
			Effect.gen(function*() {
				const usersDistinctTable = sqliteTable('users_distinct_101', {
					id: integer('id').notNull(),
					name: text('name').notNull(),
					age: integer('age').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { usersDistinctTable });

				yield* db.insert(usersDistinctTable).values([
					{ id: 1, name: 'John', age: 24 },
					{ id: 1, name: 'John', age: 24 },
					{ id: 2, name: 'John', age: 25 },
					{ id: 1, name: 'Jane', age: 24 },
					{ id: 1, name: 'Jane', age: 26 },
				]);
				const users = yield* db.selectDistinct().from(usersDistinctTable).orderBy(
					usersDistinctTable.id,
					usersDistinctTable.name,
				);

				expect(users).toEqual([
					{ id: 1, name: 'Jane', age: 24 },
					{ id: 1, name: 'Jane', age: 26 },
					{ id: 1, name: 'John', age: 24 },
					{ id: 2, name: 'John', age: 25 },
				]);
			}));

		it.effect('update with returning all fields', () =>
			Effect.gen(function*() {
				const users = sqliteTable('users_9', {
					id: integer('id' as string).primaryKey(),
					name: text('name').notNull(),
					verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
					jsonb: text('jsonb', { mode: 'json' }).$type<string[]>(),
					createdAt: integer('created_at', {
						mode: 'timestamp_ms',
					}).notNull().default(sql`(cast((julianday('now') - 2440587.5)*86400000 as integer))`),
				});

				const db = yield* DB;
				yield* push(db, { users });

				const now = Date.now();

				yield* db.insert(users).values({ name: 'John' });
				const usersResult = yield* db
					.update(users)
					.set({ name: 'Jane' })
					.where(eq(users.name, 'John'))
					.returning();

				expect(usersResult[0]!.createdAt).toBeInstanceOf(Date);
				expect(Math.abs(usersResult[0]!.createdAt.getTime() - now)).toBeLessThan(300);
				expect(usersResult).toEqual([
					{ id: 1, name: 'Jane', verified: false, jsonb: null, createdAt: usersResult[0]!.createdAt },
				]);
			}));

		it.effect('update with returning partial', () =>
			Effect.gen(function*() {
				const users = sqliteTable('users_10', {
					id: integer('id' as string).primaryKey(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { users });

				yield* db.insert(users).values({ name: 'John' });
				const usersResult = yield* db
					.update(users)
					.set({ name: 'Jane' })
					.where(eq(users.name, 'John'))
					.returning({
						id: users.id,
						name: users.name,
					});

				expect(usersResult).toEqual([{ id: 1, name: 'Jane' }]);
			}));

		it.effect('delete with returning all fields', () =>
			Effect.gen(function*() {
				const users = sqliteTable('users_11', {
					id: integer('id' as string).primaryKey(),
					name: text('name').notNull(),
					verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
					jsonb: text('jsonb', { mode: 'json' }).$type<string[]>(),
					createdAt: integer('created_at', {
						mode: 'timestamp_ms',
					}).notNull().default(sql`(cast((julianday('now') - 2440587.5)*86400000 as integer))`),
				});

				const db = yield* DB;
				yield* push(db, { users });

				const now = Date.now();

				yield* db.insert(users).values({ name: 'John' });
				const usersResult = yield* db.delete(users).where(eq(users.name, 'John')).returning();

				expect(usersResult[0]!.createdAt).toBeInstanceOf(Date);
				expect(Math.abs(usersResult[0]!.createdAt.getTime() - now)).toBeLessThan(300);
				expect(usersResult).toEqual([
					{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: usersResult[0]!.createdAt },
				]);
			}));

		it.effect('delete with returning partial', () =>
			Effect.gen(function*() {
				const users = sqliteTable('users_12', {
					id: integer('id' as string).primaryKey(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { users });

				yield* db.insert(users).values({ name: 'John' });
				const usersResult = yield* db.delete(users).where(eq(users.name, 'John')).returning({
					id: users.id,
					name: users.name,
				});

				expect(usersResult).toEqual([{ id: 1, name: 'John' }]);
			}));

		it.effect('insert many', () =>
			Effect.gen(function*() {
				const users = sqliteTable('users_19', {
					id: integer('id' as string).primaryKey(),
					name: text('name').notNull(),
					verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
					jsonb: text('jsonb', { mode: 'json' }).$type<string[]>(),
				});

				const db = yield* DB;
				yield* push(db, { users });

				yield* db
					.insert(users)
					.values([
						{ name: 'John' },
						{ name: 'Bruce', jsonb: ['foo', 'bar'] },
						{ name: 'Jane' },
						{ name: 'Austin', verified: true },
					]);
				const result = yield* db
					.select({
						id: users.id,
						name: users.name,
						jsonb: users.jsonb,
						verified: users.verified,
					})
					.from(users);

				expect(result).toEqual([
					{ id: 1, name: 'John', jsonb: null, verified: false },
					{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
					{ id: 3, name: 'Jane', jsonb: null, verified: false },
					{ id: 4, name: 'Austin', jsonb: null, verified: true },
				]);
			}));

		it.effect('insert with returning partial', () =>
			Effect.gen(function*() {
				const users = sqliteTable('users_20', {
					id: integer('id' as string).primaryKey(),
					name: text('name').notNull(),
					verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
					jsonb: text('jsonb', { mode: 'json' }).$type<string[]>(),
				});

				const db = yield* DB;
				yield* push(db, { users });

				const result = yield* db
					.insert(users)
					.values([
						{ name: 'John' },
						{ name: 'Bruce', jsonb: ['foo', 'bar'] },
						{ name: 'Jane' },
						{ name: 'Austin', verified: true },
					])
					.returning({
						id: users.id,
						name: users.name,
						jsonb: users.jsonb,
						verified: users.verified,
					});

				expect(result).toEqual([
					{ id: 1, name: 'John', jsonb: null, verified: false },
					{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
					{ id: 3, name: 'Jane', jsonb: null, verified: false },
					{ id: 4, name: 'Austin', jsonb: null, verified: true },
				]);
			}));

		it.effect('insert with returning all fields', () =>
			Effect.gen(function*() {
				const users = sqliteTable('users_20', {
					id: integer('id' as string).primaryKey(),
					name: text('name').notNull(),
					verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
					jsonb: text('jsonb', { mode: 'json' }).$type<string[]>(),
				});

				const db = yield* DB;
				yield* push(db, { users });

				const result = yield* db
					.insert(users)
					.values([
						{ name: 'John' },
						{ name: 'Bruce', jsonb: ['foo', 'bar'] },
						{ name: 'Jane' },
						{ name: 'Austin', verified: true },
					])
					.returning();

				expect(result).toEqual([
					{ id: 1, name: 'John', jsonb: null, verified: false },
					{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
					{ id: 3, name: 'Jane', jsonb: null, verified: false },
					{ id: 4, name: 'Austin', jsonb: null, verified: true },
				]);
			}));

		it.effect('prepared statement reuse', () =>
			Effect.gen(function*() {
				const usersTable = sqliteTable('users_35', {
					id: integer('id').primaryKey(),
					name: text('name').notNull(),
					verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
				});

				const db = yield* DB;
				yield* push(db, { usersTable });

				const stmt = db
					.insert(usersTable)
					.values({
						verified: true,
						name: sql.placeholder('name'),
					})
					.prepare();

				for (let i = 0; i < 10; i++) {
					yield* stmt.execute({ name: `John ${i}` });
				}

				const result = yield* db
					.select({
						id: usersTable.id,
						name: usersTable.name,
						verified: usersTable.verified,
					})
					.from(usersTable);

				expect(result).toEqual([
					{ id: 1, name: 'John 0', verified: true },
					{ id: 2, name: 'John 1', verified: true },
					{ id: 3, name: 'John 2', verified: true },
					{ id: 4, name: 'John 3', verified: true },
					{ id: 5, name: 'John 4', verified: true },
					{ id: 6, name: 'John 5', verified: true },
					{ id: 7, name: 'John 6', verified: true },
					{ id: 8, name: 'John 7', verified: true },
					{ id: 9, name: 'John 8', verified: true },
					{ id: 10, name: 'John 9', verified: true },
				]);
			}));

		it.effect('prepared statement with placeholder in .where', () =>
			Effect.gen(function*() {
				const usersTable = sqliteTable('users_36', {
					id: integer('id').primaryKey(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { usersTable });

				yield* db.insert(usersTable).values({ name: 'John' });
				const stmt = db
					.select({
						id: usersTable.id,
						name: usersTable.name,
					})
					.from(usersTable)
					.where(eq(usersTable.id, sql.placeholder('id')))
					.prepare();
				const result = yield* stmt.execute({ id: 1 });

				expect(result).toEqual([{ id: 1, name: 'John' }]);
			}));

		it.effect('prepared statement with placeholder in .limit', () =>
			Effect.gen(function*() {
				const usersTable = sqliteTable('users_37', {
					id: integer('id').primaryKey(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { usersTable });

				yield* db.insert(usersTable).values({ name: 'John' });
				const stmt = db
					.select({
						id: usersTable.id,
						name: usersTable.name,
					})
					.from(usersTable)
					.where(eq(usersTable.id, sql.placeholder('id')))
					.limit(sql.placeholder('limit'))
					.prepare();

				const result = yield* stmt.execute({ id: 1, limit: 1 });

				expect(result).toEqual([{ id: 1, name: 'John' }]);
				expect(result).toHaveLength(1);
			}));

		it.effect('prepared statement with placeholder in .offset', () =>
			Effect.gen(function*() {
				const usersTable = sqliteTable('users_38', {
					id: integer('id').primaryKey(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { usersTable });

				yield* db.insert(usersTable).values([{ name: 'John' }, { name: 'John1' }]);
				const stmt = db
					.select({
						id: usersTable.id,
						name: usersTable.name,
					})
					.from(usersTable)
					.offset(sql.placeholder('offset'))
					.limit(sql.placeholder('limit'))
					.prepare();

				const result = yield* stmt.execute({ offset: 1, limit: 1 });

				expect(result).toEqual([{ id: 2, name: 'John1' }]);
			}));

		it.effect('prepared statement built using $dynamic', () =>
			Effect.gen(function*() {
				const usersTable = sqliteTable('users_39', {
					id: integer('id').primaryKey(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { usersTable });

				function withLimitOffset(qb: any) {
					return qb.limit(sql.placeholder('limit')).offset(sql.placeholder('offset'));
				}

				yield* db.insert(usersTable).values([{ name: 'John' }, { name: 'John1' }]);
				const stmt = db
					.select({
						id: usersTable.id,
						name: usersTable.name,
					})
					.from(usersTable)
					.$dynamic();
				withLimitOffset(stmt).prepare();

				const result = yield* stmt.execute({ limit: 1, offset: 1 });

				expect(result).toEqual([{ id: 2, name: 'John1' }]);
				expect(result).toHaveLength(1);
			}));

		it.effect('with ... select', () =>
			Effect.gen(function*() {
				const orders = sqliteTable('orders_55', {
					region: text('region').notNull(),
					product: text('product').notNull(),
					amount: integer('amount').notNull(),
					quantity: integer('quantity').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { orders });

				yield* db.insert(orders).values([
					{ region: 'Europe', product: 'A', amount: 10, quantity: 1 },
					{ region: 'Europe', product: 'A', amount: 20, quantity: 2 },
					{ region: 'Europe', product: 'B', amount: 20, quantity: 2 },
					{ region: 'Europe', product: 'B', amount: 30, quantity: 3 },
					{ region: 'US', product: 'A', amount: 30, quantity: 3 },
					{ region: 'US', product: 'A', amount: 40, quantity: 4 },
					{ region: 'US', product: 'B', amount: 40, quantity: 4 },
					{ region: 'US', product: 'B', amount: 50, quantity: 5 },
				]);

				const regionalSales = db
					.$with('regional_sales')
					.as(
						db
							.select({
								region: orders.region,
								totalSales: sql<number>`sum(${orders.amount})`.as('total_sales'),
							})
							.from(orders)
							.groupBy(orders.region),
					);

				const topRegions = db
					.$with('top_regions')
					.as(
						db
							.select({
								region: regionalSales.region,
							})
							.from(regionalSales)
							.where(
								gt(
									regionalSales.totalSales,
									db.select({ sales: sql`sum(${regionalSales.totalSales})/10` }).from(regionalSales),
								),
							),
					);

				const result1 = yield* db
					.with(regionalSales, topRegions)
					.select({
						region: orders.region,
						product: orders.product,
						productUnits: sql<number>`sum(${orders.quantity})`.mapWith(Number),
						productSales: sql<number>`sum(${orders.amount})`.mapWith(Number),
					})
					.from(orders)
					.where(inArray(orders.region, db.select({ region: topRegions.region }).from(topRegions)))
					.groupBy(orders.region, orders.product)
					.orderBy(orders.region, orders.product);
				const result2 = yield* db
					.with(regionalSales, topRegions)
					.selectDistinct({
						region: orders.region,
						product: orders.product,
						productUnits: sql<number>`sum(${orders.quantity})`.mapWith(Number),
						productSales: sql<number>`sum(${orders.amount})`.mapWith(Number),
					})
					.from(orders)
					.where(inArray(orders.region, db.select({ region: topRegions.region }).from(topRegions)))
					.groupBy(orders.region, orders.product)
					.orderBy(orders.region, orders.product);
				const result3 = yield* db
					.with(regionalSales, topRegions)
					.selectDistinct({
						region: orders.region,
						productUnits: sql<number>`sum(${orders.quantity})`.mapWith(Number),
						productSales: sql<number>`sum(${orders.amount})`.mapWith(Number),
					})
					.from(orders)
					.where(inArray(orders.region, db.select({ region: topRegions.region }).from(topRegions)))
					.groupBy(orders.region)
					.orderBy(orders.region);

				expect(result1).toEqual([
					{
						region: 'Europe',
						product: 'A',
						productUnits: 3,
						productSales: 30,
					},
					{
						region: 'Europe',
						product: 'B',
						productUnits: 5,
						productSales: 50,
					},
					{
						region: 'US',
						product: 'A',
						productUnits: 7,
						productSales: 70,
					},
					{
						region: 'US',
						product: 'B',
						productUnits: 9,
						productSales: 90,
					},
				]);
				expect(result2).toEqual(result1);
				expect(result3).toEqual([
					{
						region: 'Europe',
						productUnits: 8,
						productSales: 80,
					},
					{
						region: 'US',
						productUnits: 16,
						productSales: 160,
					},
				]);
			}));

		it.effect('with ... update', () =>
			Effect.gen(function*() {
				const products = sqliteTable('products_56', {
					id: integer('id').primaryKey(),
					price: numeric('price').notNull(),
					cheap: integer('cheap', { mode: 'boolean' }).notNull().default(false),
				});

				const db = yield* DB;
				yield* push(db, { products });

				yield* db.insert(products).values([
					{ price: '10.99' },
					{ price: '25.85' },
					{ price: '32.99' },
					{ price: '2.50' },
					{ price: '4.59' },
				]);

				const averagePrice = db
					.$with('average_price')
					.as(
						db
							.select({
								value: sql`avg(${products.price})`.as('value'),
							})
							.from(products),
					);

				const result = yield* db
					.with(averagePrice)
					.update(products)
					.set({
						cheap: true,
					})
					.where(lt(products.price, sql`(select * from ${averagePrice})`))
					.returning({
						id: products.id,
					});

				expect(result).toEqual([
					{ id: 1 },
					{ id: 4 },
					{ id: 5 },
				]);
			}));

		it.effect('with ... insert', () =>
			Effect.gen(function*() {
				const users = sqliteTable('users_57', {
					username: text('username').notNull(),
					admin: integer('admin', { mode: 'boolean' }).notNull().default(false),
				});

				const db = yield* DB;
				yield* push(db, { users });

				const userCount = db
					.$with('user_count')
					.as(
						db
							.select({
								value: sql`count(*)`.as('value'),
							})
							.from(users),
					);

				const result = yield* db
					.with(userCount)
					.insert(users)
					.values([
						{ username: 'user1', admin: sql`((select * from ${userCount}) = 0)` },
					])
					.returning({
						admin: users.admin,
					});

				expect(result).toEqual([{ admin: true }]);
			}));

		it.effect('with ... delete', () =>
			Effect.gen(function*() {
				const orders = sqliteTable('orders_58', {
					id: integer('id').primaryKey(),
					region: text('region').notNull(),
					product: text('product').notNull(),
					amount: integer('amount').notNull(),
					quantity: integer('quantity').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { orders });

				yield* db.insert(orders).values([
					{ region: 'Europe', product: 'A', amount: 10, quantity: 1 },
					{ region: 'Europe', product: 'A', amount: 20, quantity: 2 },
					{ region: 'Europe', product: 'B', amount: 20, quantity: 2 },
					{ region: 'Europe', product: 'B', amount: 30, quantity: 3 },
					{ region: 'US', product: 'A', amount: 30, quantity: 3 },
					{ region: 'US', product: 'A', amount: 40, quantity: 4 },
					{ region: 'US', product: 'B', amount: 40, quantity: 4 },
					{ region: 'US', product: 'B', amount: 50, quantity: 5 },
				]);

				const averageAmount = db
					.$with('average_amount')
					.as(
						db
							.select({
								value: sql`avg(${orders.amount})`.as('value'),
							})
							.from(orders),
					);

				const result = yield* db
					.with(averageAmount)
					.delete(orders)
					.where(gt(orders.amount, sql`(select * from ${averageAmount})`))
					.returning({
						id: orders.id,
					});

				expect(result).toEqual([
					{ id: 6 },
					{ id: 7 },
					{ id: 8 },
				]);
			}));

		it.effect('partial join with alias', () =>
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
							id: users.id,
							name: users.name,
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

		it.effect('full join with alias', () =>
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
					.select()
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

		it.effect('select from alias', () =>
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
					.select()
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

		it.effect('set operations (mixed) from query builder with subquery', () =>
			Effect.gen(function*() {
				const cities2Table = sqliteTable('cities_1', {
					id: integer('id').primaryKey(),
					name: text('name').notNull(),
				});

				const users2Table = sqliteTable('users2_1', {
					id: integer('id').primaryKey(),
					name: text('name').notNull(),
					cityId: integer('city_id').references(() => cities2Table.id),
				});

				const db = yield* DB;
				yield* push(db, { cities2Table, users2Table });

				yield* db.insert(cities2Table).values([
					{ id: 1, name: 'New York' },
					{ id: 2, name: 'London' },
					{ id: 3, name: 'Tampa' },
				]);

				yield* db.insert(users2Table).values([
					{ id: 1, name: 'John', cityId: 1 },
					{ id: 2, name: 'Jane', cityId: 2 },
					{ id: 3, name: 'Jack', cityId: 3 },
					{ id: 4, name: 'Peter', cityId: 3 },
					{ id: 5, name: 'Ben', cityId: 2 },
					{ id: 6, name: 'Jill', cityId: 1 },
					{ id: 7, name: 'Mary', cityId: 2 },
					{ id: 8, name: 'Sally', cityId: 1 },
				]);

				const sq = db
					.select()
					.from(cities2Table).where(gt(cities2Table.id, 1)).as('sq');

				const result = yield* db
					.select()
					.from(cities2Table).except(
						({ unionAll }) =>
							unionAll(
								db.select().from(sq),
								db.select().from(cities2Table).where(eq(cities2Table.id, 2)),
							),
					);

				expect(result).toHaveLength(2);

				expect(result).toEqual([
					{ id: 1, name: 'New York' },
					{ id: 2, name: 'London' },
				]);

				let err: unknown;
				try {
					yield* db
						.select()
						.from(cities2Table).except(
							({ unionAll }) =>
								unionAll(
									db
										.select({ name: cities2Table.name, id: cities2Table.id })
										.from(cities2Table).where(gt(cities2Table.id, 1)),
									db.select().from(cities2Table).where(eq(cities2Table.id, 2)),
								),
						);
				} catch (error) {
					err = error;
				}

				expect(err).toBeInstanceOf(Error);
			}));

		it.effect('set operations (mixed all) as function', () =>
			Effect.gen(function*() {
				const cities2Table = sqliteTable('cities_2', {
					id: integer('id').primaryKey(),
					name: text('name').notNull(),
				});

				const users2Table = sqliteTable('users2_2', {
					id: integer('id').primaryKey(),
					name: text('name').notNull(),
					cityId: integer('city_id').references(() => cities2Table.id),
				});

				const db = yield* DB;
				yield* push(db, { cities2Table, users2Table });

				yield* db.insert(cities2Table).values([
					{ id: 1, name: 'New York' },
					{ id: 2, name: 'London' },
					{ id: 3, name: 'Tampa' },
				]);

				yield* db.insert(users2Table).values([
					{ id: 1, name: 'John', cityId: 1 },
					{ id: 2, name: 'Jane', cityId: 2 },
					{ id: 3, name: 'Jack', cityId: 3 },
					{ id: 4, name: 'Peter', cityId: 3 },
					{ id: 5, name: 'Ben', cityId: 2 },
					{ id: 6, name: 'Jill', cityId: 1 },
					{ id: 7, name: 'Mary', cityId: 2 },
					{ id: 8, name: 'Sally', cityId: 1 },
				]);

				const result = yield* union(
					db
						.select({ id: users2Table.id, name: users2Table.name })
						.from(users2Table).where(eq(users2Table.id, 1)),
					except(
						db
							.select({ id: users2Table.id, name: users2Table.name })
							.from(users2Table).where(gte(users2Table.id, 5)),
						db
							.select({ id: users2Table.id, name: users2Table.name })
							.from(users2Table).where(eq(users2Table.id, 7)),
					),
					db
						.select().from(cities2Table).where(gt(cities2Table.id, 1)),
				).orderBy(asc(sql`id`));

				expect(result).toHaveLength(6);

				expect(result).toEqual([
					{ id: 1, name: 'John' },
					{ id: 2, name: 'London' },
					{ id: 3, name: 'Tampa' },
					{ id: 5, name: 'Ben' },
					{ id: 6, name: 'Jill' },
					{ id: 8, name: 'Sally' },
				]);

				let err: unknown;
				try {
					yield* union(
						db
							.select({ id: users2Table.id, name: users2Table.name })
							.from(users2Table).where(eq(users2Table.id, 1)),
						except(
							db
								.select({ id: users2Table.id, name: users2Table.name })
								.from(users2Table).where(gte(users2Table.id, 5)),
							db
								.select({ name: users2Table.name, id: users2Table.id })
								.from(users2Table).where(eq(users2Table.id, 7)),
						),
						db
							.select().from(cities2Table).where(gt(cities2Table.id, 1)),
					);
				} catch (error) {
					err = error;
				}

				expect(err).toBeInstanceOf(Error);
			}));

		it.effect('custom EffectLogger override - user provided logger takes precedence over default', () =>
			Effect.gen(function*() {
				const loggedQueries: Array<{ query: string; params: unknown[] }> = [];

				const customLogger: EffectLoggerShape = {
					logQuery: (query: string, params: unknown[]) =>
						Effect.sync(() => {
							loggedQueries.push({ query, params });
						}),
				};
				const customLoggerLayer = Layer.succeed(EffectLogger, customLogger);

				const db = yield* SQLiteDrizzle.make({ relations }).pipe(
					Effect.provide(customLoggerLayer),
					Effect.provide(SQLiteDrizzle.DefaultServices),
				);

				const users = sqliteTable('users_custom_logger', {
					id: integer('id').primaryKey(),
					name: text('name').notNull(),
				});

				yield* push(db, { users });
				yield* db.insert(users).values({ name: 'John' });
				yield* db.select().from(users);

				expect(loggedQueries.length).toBeGreaterThanOrEqual(2);
				expect(loggedQueries.some((q) => q.query.toLowerCase().includes('insert'))).toBe(true);
				expect(loggedQueries.some((q) => q.query.toLowerCase().includes('select'))).toBe(true);
			}));

		it.effect('custom EffectCache override - user provided cache takes precedence over default', () =>
			Effect.gen(function*() {
				const cacheOperations = yield* Ref.make<Array<{ op: 'get' | 'put' | 'mutate'; key?: string }>>([]);

				const customCacheService: EffectCacheShape = {
					strategy: () => 'all' as const,
					get: (key: string, _tables: string[], _isTag: boolean, _isAutoInvalidate?: boolean) =>
						Effect.gen(function*() {
							yield* Ref.update(cacheOperations, (ops) => [...ops, { op: 'get' as const, key }]);
							// oxlint-disable-next-line no-useless-undefined
							return undefined;
						}),
					put: (key: string, _response: any, _tables: string[], _isTag: boolean, _config?: any) =>
						Effect.gen(function*() {
							yield* Ref.update(cacheOperations, (ops) => [...ops, { op: 'put' as const, key }]);
						}),
					onMutate: (_params: any) =>
						Effect.gen(function*() {
							yield* Ref.update(cacheOperations, (ops) => [...ops, { op: 'mutate' as const }]);
						}),
				};
				const customCacheLayer = Layer.succeed(EffectCache, customCacheService);

				const db = yield* SQLiteDrizzle.make({ relations }).pipe(
					Effect.provide(customCacheLayer),
					Effect.provide(SQLiteDrizzle.DefaultServices),
				);

				const users = sqliteTable('users_custom_cache', {
					id: integer('id').primaryKey(),
					name: text('name').notNull(),
				});

				yield* push(db, { users });
				yield* db.insert(users).values({ name: 'John' });
				yield* db.select().from(users).$withCache();

				const ops = yield* Ref.get(cacheOperations);
				expect(ops.some((o) => o.op === 'mutate')).toBe(true);
				expect(ops.some((o) => o.op === 'get')).toBe(true);
			}));

		it.effect('Cache: write + query all methods & verify data intergrity', () =>
			Effect.gen(function*() {
				const baseCache = new TestCache('explicit');

				using spyPut = vi.spyOn(baseCache, 'put');
				using spyGet = vi.spyOn(baseCache, 'get');
				using spyInvalidate = vi.spyOn(baseCache, 'onMutate');

				const customCacheLayer = EffectCache.layerFromDrizzle(baseCache);
				const db = yield* SQLiteDrizzle.make({ relations }).pipe(
					Effect.provide(customCacheLayer),
					Effect.provide(SQLiteDrizzle.DefaultServices),
				);

				const users = sqliteTable('users_custom_cache_2', {
					id: integer('id').primaryKey(),
					name: text('name').notNull(),
				});

				yield* push(db, { users });
				yield* db.insert(users).values({ name: 'John' });

				expect(spyPut).toHaveBeenCalledTimes(0);
				expect(spyGet).toHaveBeenCalledTimes(0);
				expect(spyInvalidate).toHaveBeenCalledTimes(1);

				spyPut.mockClear();
				spyGet.mockClear();
				spyInvalidate.mockClear();

				const qRaw = db.select().from(users).prepare();
				const qCache = db.select().from(users).$withCache({ config: { ex: 120 } }).prepare();

				const [_all, _get, _run, _values] = [
					yield* qRaw.all(),
					yield* qRaw.get(),
					yield* qRaw.run(),
					yield* qRaw.values(),
				];
				const [all, get, run, values] = [
					yield* qCache.all(),
					yield* qCache.get(),
					yield* qCache.run(),
					yield* qCache.values(),
				];

				expect(all).toStrictEqual(_all);
				expect(get).toStrictEqual(_get);
				expect(run).toStrictEqual(_run);
				expect(values).toStrictEqual(_values);

				expect(spyPut).toHaveBeenCalledTimes(4);
				expect(spyGet).toHaveBeenCalledTimes(4);
				expect(spyInvalidate).toHaveBeenCalledTimes(0);

				spyPut.mockClear();
				spyGet.mockClear();
				spyInvalidate.mockClear();
			}));

		it.effect('makeWithDefaults - convenience function that includes DefaultServices', () =>
			Effect.gen(function*() {
				const db = yield* SQLiteDrizzle.makeWithDefaults({ relations });

				const users = sqliteTable('users_make_with_defaults', {
					id: integer('id').primaryKey(),
					name: text('name').notNull(),
				});

				yield* push(db, { users });
				yield* db.insert(users).values({ name: 'Alice' });
				const result = yield* db.select().from(users);

				expect(result).toEqual([{ id: 1, name: 'Alice' }]);
			}));

		it.effect('Mappers: correct mappers enabled', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const jitDb = yield* createDB({}, () => ({}), true);

				const dialect: SQLiteDialect = (<any> db).dialect;
				const jitDialect: SQLiteDialect = (<any> jitDb).dialect;

				expect(dialect.mapperGenerators.relationalRows === makeDefaultRqbMapper).toStrictEqual(true);
				expect(dialect.mapperGenerators.rows === makeDefaultQueryMapper).toStrictEqual(true);
				expect(jitDialect.mapperGenerators.relationalRows === makeJitRqbMapper).toStrictEqual(true);
				expect(jitDialect.mapperGenerators.rows === makeJitQueryMapper).toStrictEqual(true);
			}));

		const mappersDate = new Date('2026-04-02T00:00:00.000Z');

		it.effect('Mappers: simple select - no rows', () =>
			Effect.gen(function*() {
				const users = sqliteTable('mappers_users_1', (t) => ({
					id: t.numeric('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.integer('created_at', {
						mode: 'timestamp_ms',
					}).notNull(),
					isBanned: t.integer('is_banned', { mode: 'boolean' }),
				}));

				const db = yield* DB;
				yield* push(db, { users });

				const result = yield* db.select().from(users);

				expect(result).toStrictEqual([]);
			}));

		it.effect('Mappers: select - nothing to decode - text', () =>
			Effect.gen(function*() {
				const users = sqliteTable('mappers_users_2', (t) => ({
					id: t.numeric('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.integer('created_at', {
						mode: 'timestamp_ms',
					}).notNull(),
					isBanned: t.integer('is_banned', { mode: 'boolean' }),
				}));

				const db = yield* DB;
				yield* push(db, { users });

				yield* db.insert(users).values([{
					id: 1,
					name: 'First',
					createdAt: mappersDate,
				}]).returning();

				const selected = yield* db.select({ name: users.name }).from(users);

				expect(selected).toStrictEqual([{ name: 'First' }]);
			}));

		it.effect('Mappers: select - nothing to decode - null', () =>
			Effect.gen(function*() {
				const users = sqliteTable('mappers_users_3', (t) => ({
					id: t.numeric('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.integer('created_at', {
						mode: 'timestamp_ms',
					}).notNull(),
					isBanned: t.integer('is_banned', { mode: 'boolean' }),
				}));

				const db = yield* DB;
				yield* push(db, { users });

				yield* db.insert(users).values([{
					id: 1,
					name: 'First',
					createdAt: mappersDate,
				}]).returning();

				const selected = yield* db.select({ isBanned: users.isBanned }).from(users);

				expect(selected).toStrictEqual([{ isBanned: null }]);
			}));

		it.effect('Mappers: insert returning all + select + update returning + delete returning', () =>
			Effect.gen(function*() {
				const users = sqliteTable('mappers_users_4', (t) => ({
					id: t.numeric('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.integer('created_at', {
						mode: 'timestamp_ms',
					}).notNull(),
					isBanned: t.integer('is_banned', { mode: 'boolean' }),
				}));

				const db = yield* DB;
				yield* push(db, { users });

				const inserted = yield* db.insert(users).values([{
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

				const selected = yield* db.select().from(users);

				const updated = yield* db.update(users).set({
					isBanned: false,
				}).where(eq(users.id, 2)).returning();

				const deleted = yield* db.delete(users).returning();

				expect(inserted).toStrictEqual([{
					id: 1,
					name: 'First',
					createdAt: mappersDate,
					isBanned: null,
				}, {
					id: 2,
					name: 'Second',
					createdAt: mappersDate,
					isBanned: true,
				}, {
					id: 3,
					name: 'Third',
					createdAt: mappersDate,
					isBanned: null,
				}]);
				expect(selected).toStrictEqual([{
					id: 1,
					name: 'First',
					createdAt: mappersDate,
					isBanned: null,
				}, {
					id: 2,
					name: 'Second',
					createdAt: mappersDate,
					isBanned: true,
				}, {
					id: 3,
					name: 'Third',
					createdAt: mappersDate,
					isBanned: null,
				}]);
				expect(updated).toStrictEqual([{
					id: 2,
					name: 'Second',
					createdAt: mappersDate,
					isBanned: false,
				}]);
				expect(deleted).toStrictEqual(expect.arrayContaining([{
					id: 1,
					name: 'First',
					createdAt: mappersDate,
					isBanned: null,
				}, {
					id: 2,
					name: 'Second',
					createdAt: mappersDate,
					isBanned: false,
				}, {
					id: 3,
					name: 'Third',
					createdAt: mappersDate,
					isBanned: null,
				}]));
			}));

		it.effect('Mappers: select complex selections', () =>
			Effect.gen(function*() {
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

		it.effect('Mappers: relational', () =>
			Effect.gen(function*() {
				const users = sqliteTable('mappers_users_6', (t) => ({
					id: t.numeric('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.integer('created_at', {
						mode: 'timestamp_ms',
					}).notNull(),
					isBanned: t.integer('is_banned', { mode: 'boolean' }),
				}));

				const posts = sqliteTable('mappers_posts_2', (t) => ({
					id: t.integer('id').primaryKey(),
					authorId: t.numeric('author_id', { mode: 'number' }).references(() => users.id),
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

				const simple1 = yield* db.query.users.findFirst();
				const simple2 = yield* db.query.users.findMany();

				expect(simple1).toStrictEqual(
					{
						createdAt: mappersDate,
						id: 1,
						isBanned: null,
						name: 'First',
					},
				);
				expect(simple2).toStrictEqual([
					{
						createdAt: mappersDate,
						id: 1,
						isBanned: null,
						name: 'First',
					},
					{
						createdAt: mappersDate,
						id: 2,
						isBanned: true,
						name: 'Second',
					},
					{
						createdAt: mappersDate,
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
						createdAt: mappersDate,
						id: 1,
						isBanned: null,
						name: 'First',
						sql: 1,
						sqlWrapper: 2,
					},
				);
				expect(extra2).toStrictEqual([
					{
						createdAt: mappersDate,
						id: 1,
						isBanned: null,
						name: 'First',
						sql: 1,
						sqlWrapper: 2,
					},
					{
						createdAt: mappersDate,
						id: 2,
						isBanned: true,
						name: 'Second',
						sql: 1,
						sqlWrapper: 2,
					},
					{
						createdAt: mappersDate,
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
						createdAt: mappersDate,
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
								createdAt: mappersDate,
								id: 1,
								isBanned: null,
								name: 'First',
								sql: 1,
								sqlWrapper: 2,
							},
							authorId: 1,
							authors: [
								{
									createdAt: mappersDate,
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
						createdAt: mappersDate,
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
								createdAt: mappersDate,
								id: 1,
								isBanned: null,
								name: 'First',
								sql: 1,
								sqlWrapper: 2,
							},
							authorId: 1,
							authors: [
								{
									createdAt: mappersDate,
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
						createdAt: mappersDate,
						id: 2,
						isBanned: true,
						name: 'Second',
						post: null,
						posts: null,
						sql: 1,
						sqlWrapper: 2,
					},
					{
						createdAt: mappersDate,
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

		it.effect('Jit mappers: simple select - no rows', () =>
			Effect.gen(function*() {
				const users = sqliteTable('jit_mappers_users_1', (t) => ({
					id: t.numeric('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.integer('created_at', {
						mode: 'timestamp_ms',
					}).notNull(),
					isBanned: t.integer('is_banned', { mode: 'boolean' }),
				}));

				const db = yield* createDB({}, () => ({}), true);
				yield* push(db, { users });

				const result = yield* db.select().from(users);

				expect(result).toStrictEqual([]);
			}));

		it.effect('Jit mappers: select - nothing to decode - text', () =>
			Effect.gen(function*() {
				const users = sqliteTable('jit_mappers_users_2', (t) => ({
					id: t.numeric('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.integer('created_at', {
						mode: 'timestamp_ms',
					}).notNull(),
					isBanned: t.integer('is_banned', { mode: 'boolean' }),
				}));

				const db = yield* createDB({}, () => ({}), true);
				yield* push(db, { users });

				yield* db.insert(users).values([{
					id: 1,
					name: 'First',
					createdAt: mappersDate,
				}]).returning();

				const selected = yield* db.select({ name: users.name }).from(users);

				expect(selected).toStrictEqual([{ name: 'First' }]);
			}));

		it.effect('Jit mappers: select - nothing to decode - null', () =>
			Effect.gen(function*() {
				const users = sqliteTable('jit_mappers_users_3', (t) => ({
					id: t.numeric('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.integer('created_at', {
						mode: 'timestamp_ms',
					}).notNull(),
					isBanned: t.integer('is_banned', { mode: 'boolean' }),
				}));

				const db = yield* createDB({}, () => ({}), true);
				yield* push(db, { users });

				yield* db.insert(users).values([{
					id: 1,
					name: 'First',
					createdAt: mappersDate,
				}]).returning();

				const selected = yield* db.select({ isBanned: users.isBanned }).from(users);

				expect(selected).toStrictEqual([{ isBanned: null }]);
			}));

		it.effect('Jit mappers: insert returning all + select + update returning + delete returning', () =>
			Effect.gen(function*() {
				const users = sqliteTable('jit_mappers_users_4', (t) => ({
					id: t.numeric('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.integer('created_at', {
						mode: 'timestamp_ms',
					}).notNull(),
					isBanned: t.integer('is_banned', { mode: 'boolean' }),
				}));

				const db = yield* createDB({}, () => ({}), true);
				yield* push(db, { users });

				const inserted = yield* db.insert(users).values([{
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

				const selected = yield* db.select().from(users);

				const updated = yield* db.update(users).set({
					isBanned: false,
				}).where(eq(users.id, 2)).returning();

				const deleted = yield* db.delete(users).returning();

				expect(inserted).toStrictEqual([{
					id: 1,
					name: 'First',
					createdAt: mappersDate,
					isBanned: null,
				}, {
					id: 2,
					name: 'Second',
					createdAt: mappersDate,
					isBanned: true,
				}, {
					id: 3,
					name: 'Third',
					createdAt: mappersDate,
					isBanned: null,
				}]);
				expect(selected).toStrictEqual([{
					id: 1,
					name: 'First',
					createdAt: mappersDate,
					isBanned: null,
				}, {
					id: 2,
					name: 'Second',
					createdAt: mappersDate,
					isBanned: true,
				}, {
					id: 3,
					name: 'Third',
					createdAt: mappersDate,
					isBanned: null,
				}]);
				expect(updated).toStrictEqual([{
					id: 2,
					name: 'Second',
					createdAt: mappersDate,
					isBanned: false,
				}]);
				expect(deleted).toStrictEqual(expect.arrayContaining([{
					id: 1,
					name: 'First',
					createdAt: mappersDate,
					isBanned: null,
				}, {
					id: 2,
					name: 'Second',
					createdAt: mappersDate,
					isBanned: false,
				}, {
					id: 3,
					name: 'Third',
					createdAt: mappersDate,
					isBanned: null,
				}]));
			}));

		it.effect('Jit mappers: select complex selections', () =>
			Effect.gen(function*() {
				const users = sqliteTable('jit_mappers_users_5', (t) => ({
					id: t.numeric('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.integer('created_at', {
						mode: 'timestamp_ms',
					}).notNull(),
					isBanned: t.integer('is_banned', { mode: 'boolean' }),
				}));

				const posts = sqliteTable('jit_mappers_posts_1', (t) => ({
					id: t.integer('id').primaryKey(),
					authorId: t.numeric('author_id', { mode: 'number' }).references(() => users.id),
					content: t.text('content'),
				}));

				const db = yield* createDB({}, () => ({}), true);
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

		it.effect('Jit mappers: relational', () =>
			Effect.gen(function*() {
				const users = sqliteTable('jit_mappers_users_6', (t) => ({
					id: t.numeric('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.integer('created_at', {
						mode: 'timestamp_ms',
					}).notNull(),
					isBanned: t.integer('is_banned', { mode: 'boolean' }),
				}));

				const posts = sqliteTable('jit_mappers_posts_2', (t) => ({
					id: t.integer('id').primaryKey(),
					authorId: t.numeric('author_id', { mode: 'number' }).references(() => users.id),
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

				const simple1 = yield* db.query.users.findFirst();
				const simple2 = yield* db.query.users.findMany();

				expect(simple1).toStrictEqual(
					{
						createdAt: mappersDate,
						id: 1,
						isBanned: null,
						name: 'First',
					},
				);
				expect(simple2).toStrictEqual([
					{
						createdAt: mappersDate,
						id: 1,
						isBanned: null,
						name: 'First',
					},
					{
						createdAt: mappersDate,
						id: 2,
						isBanned: true,
						name: 'Second',
					},
					{
						createdAt: mappersDate,
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
						createdAt: mappersDate,
						id: 1,
						isBanned: null,
						name: 'First',
						sql: 1,
						sqlWrapper: 2,
					},
				);
				expect(extra2).toStrictEqual([
					{
						createdAt: mappersDate,
						id: 1,
						isBanned: null,
						name: 'First',
						sql: 1,
						sqlWrapper: 2,
					},
					{
						createdAt: mappersDate,
						id: 2,
						isBanned: true,
						name: 'Second',
						sql: 1,
						sqlWrapper: 2,
					},
					{
						createdAt: mappersDate,
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
						createdAt: mappersDate,
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
								createdAt: mappersDate,
								id: 1,
								isBanned: null,
								name: 'First',
								sql: 1,
								sqlWrapper: 2,
							},
							authorId: 1,
							authors: [
								{
									createdAt: mappersDate,
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
						createdAt: mappersDate,
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
								createdAt: mappersDate,
								id: 1,
								isBanned: null,
								name: 'First',
								sql: 1,
								sqlWrapper: 2,
							},
							authorId: 1,
							authors: [
								{
									createdAt: mappersDate,
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
						createdAt: mappersDate,
						id: 2,
						isBanned: true,
						name: 'Second',
						post: null,
						posts: null,
						sql: 1,
						sqlWrapper: 2,
					},
					{
						createdAt: mappersDate,
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

		addTests?.(it);
	});
};
