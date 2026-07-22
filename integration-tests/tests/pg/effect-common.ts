import { assert, expect, expectTypeOf, it, Vitest } from '@effect/vitest';
import {
	and,
	asc,
	eq,
	getColumns,
	gt,
	gte,
	inArray,
	lt,
	makeDefaultQueryMapper,
	makeDefaultRqbMapper,
	makeJitQueryMapper,
	makeJitRqbMapper,
	max,
	sql,
} from 'drizzle-orm';
import { EffectCache, type EffectCacheShape } from 'drizzle-orm/cache/core/cache-effect';
import { EffectLogger, type EffectLoggerShape, QueryEffectHKTBase } from 'drizzle-orm/effect-core';
import {
	alias,
	boolean,
	customType,
	except,
	getMaterializedViewConfig,
	integer,
	jsonb,
	numeric,
	PgDialect,
	pgSchema,
	pgTable,
	pgView,
	primaryKey,
	serial,
	text,
	timestamp,
	union,
} from 'drizzle-orm/pg-core';
import type { PgEffectDatabase } from 'drizzle-orm/pg-core/effect/db';
import { PgEffectSession } from 'drizzle-orm/pg-core/effect/session';
import {
	EmptyRelations,
	ExtractTablesFromSchema,
	ExtractTablesWithRelations,
	RelationsBuilder,
	RelationsBuilderConfig,
	Schema,
} from 'drizzle-orm/relations';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Predicate from 'effect/Predicate';
import * as Ref from 'effect/Ref';
import * as Result from 'effect/Result';
import { SqlClient } from 'effect/unstable/sql/SqlClient';
import { SqlError } from 'effect/unstable/sql/SqlError';
import { type AllTypes, allTypesData, allTypesRelations, makeAllTypes } from './all-types';
import { assertAllTypesUnions } from './all-types-unions';
import { relations } from './relations';
import { rqbPost, rqbUser } from './schema';
import { normalizeDataWithDbCodecs } from './utils';

export class DB extends Context.Service<DB, PgEffectDatabase<any, any, typeof relations>>()('CommonEffectPgDB') {}

let _diff!: (_: {}, schema: Record<string, unknown>, renames: []) => Promise<{ sqlStatements: string[] }>;
const getDiff = async () => {
	return _diff ??= (await import('../../../drizzle-kit/tests/postgres/mocks' as string)).diff;
};

export const push = (db: PgEffectDatabase<any, any, any>, schema: Record<string, any>) =>
	Effect.gen(function*() {
		const diff = yield* Effect.promise(() => getDiff());

		const { sqlStatements } = yield* Effect.promise(() => diff({}, schema, []));

		yield* db.transaction((tx) =>
			Effect.gen(function*() {
				for (const s of sqlStatements) {
					yield* tx.execute(s);
				}
			})
		);
	});

export interface RunCommonEffectPgTestsOptions {
	testLayer: Layer.Layer<DB | SqlClient, SqlError, never>;
	PgDrizzle: {
		make: (config?: any) => Effect.Effect<PgEffectDatabase<QueryEffectHKTBase, any, EmptyRelations>, never, any>;
		makeWithDefaults: (
			config?: any,
		) => Effect.Effect<PgEffectDatabase<QueryEffectHKTBase, any, EmptyRelations>, never, any>;
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
		PgEffectDatabase<QueryEffectHKTBase, any, ExtractTablesWithRelations<TConfig, TTables>>,
		never,
		any
	>;
	usedSchema: string;
	skipTests?: string[];
	addTests?: (it: Vitest.MethodsNonLive<DB | SqlClient>) => void;
}

const failureMessage = (failure: unknown): string => {
	const seen = new Set<unknown>();
	const messages: string[] = [];

	let e: any = failure;
	while (e && typeof e === 'object' && !seen.has(e)) {
		seen.add(e);
		messages.push(typeof e.message === 'string' ? e.message : String(e));
		e = e.cause;
	}
	if (typeof e === 'string') messages.push(e);

	return messages.join(' | ');
};

export const runCommonEffectPgTests = (opts: RunCommonEffectPgTestsOptions): void => {
	const { testLayer, usedSchema, PgDrizzle, createDB, addTests, skipTests = [] } = opts;

	it.layer(testLayer)('common', (it) => {
		// Run setup before each test.
		const _effect = it.effect;
		const effect: typeof it.effect = Object.assign(
			(testName: string, fn: () => Effect.Effect<any, any, any>, timeout?: number) =>
				_effect(testName, () =>
					Effect.andThen(
						Effect.gen(function*() {
							const db = yield* DB;

							yield* db.execute(sql`DROP SCHEMA IF EXISTS ${sql.identifier(usedSchema)} CASCADE`);
							yield* db.execute(sql`DROP SCHEMA IF EXISTS ${sql.identifier(`${usedSchema}_custom`)} CASCADE`);
							yield* db.execute(sql`DROP SCHEMA IF EXISTS ${sql.identifier('drizzle')} CASCADE`);
							yield* db.execute(sql`DROP SCHEMA IF EXISTS ${sql.identifier('drzl_migrations_init')} CASCADE`);
							yield* db.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(usedSchema)};`);
							yield* db.execute(sql`SET search_path TO ${sql.identifier(usedSchema)};`);
							yield* db.execute(sql`SET TIME ZONE 'UTC';`);
						}),
						fn(),
					), timeout),
			it.effect,
		);
		Object.assign(it, { effect });

		it.beforeEach(({ task, skip }) => {
			if (skipTests.includes(task.name)) skip();
		});

		it.effect('all types', () =>
			Effect.gen(function*() {
				const { en, allTypesTable } = makeAllTypes('all_types_48_ef', 'en_48_ef');

				const db = yield* DB;
				yield* push(db, { en, allTypesTable });

				yield* db.insert(allTypesTable).values(allTypesData);

				const rawRes = yield* db.select().from(allTypesTable);

				expectTypeOf(rawRes).toEqualTypeOf<AllTypes[]>();
				expect(rawRes).toStrictEqual([allTypesData]);
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

		it.effect('transaction', () =>
			Effect.gen(function*() {
				const db = yield* DB;

				const users = pgTable('users_transactions', {
					id: serial('id').primaryKey(),
					balance: integer('balance').notNull(),
				});
				const products = pgTable('products_transactions', {
					id: serial('id').primaryKey(),
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

				const users = pgTable('users_transactions_rollback', {
					id: serial('id').primaryKey(),
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

				const users = pgTable('users_nested_transactions', {
					id: serial('id').primaryKey(),
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

				const users = pgTable('users_nested_transactions_rollback', {
					id: serial('id').primaryKey(),
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

		it.effect('mySchema :: materialized view', () =>
			Effect.gen(function*() {
				const mySchema = pgSchema(`${usedSchema}_custom`);

				const users = mySchema.table('users_100', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
					cityId: integer('city_id').notNull(),
				});

				const cities = mySchema.table('cities_100', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { mySchema, users, cities });

				const newYorkers1 = mySchema.materializedView('new_yorkers')
					.as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));

				const newYorkers2 = mySchema.materializedView('new_yorkers', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
					cityId: integer('city_id').notNull(),
				}).as(sql`select * from ${users} where ${eq(users.cityId, 1)}`);

				const newYorkers3 = mySchema.materializedView('new_yorkers', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
					cityId: integer('city_id').notNull(),
				}).existing();

				yield* db.execute(
					sql`create materialized view ${newYorkers1} as ${getMaterializedViewConfig(newYorkers1).query}`,
				);

				yield* db.insert(cities).values([{ name: 'New York' }, { name: 'Paris' }]);

				yield* db.insert(users).values([
					{ name: 'John', cityId: 1 },
					{ name: 'Jane', cityId: 1 },
					{ name: 'Jack', cityId: 2 },
				]);

				{
					const result = yield* db.select().from(newYorkers1);
					expect(result).toEqual([]);
				}

				yield* db.refreshMaterializedView(newYorkers1);

				{
					const result = yield* db.select().from(newYorkers1);
					expect(result).toEqual([
						{ id: 1, name: 'John', cityId: 1 },
						{ id: 2, name: 'Jane', cityId: 1 },
					]);
				}

				{
					const result = yield* db.select().from(newYorkers2);
					expect(result).toEqual([
						{ id: 1, name: 'John', cityId: 1 },
						{ id: 2, name: 'Jane', cityId: 1 },
					]);
				}

				{
					const result = yield* db.select().from(newYorkers3);
					expect(result).toEqual([
						{ id: 1, name: 'John', cityId: 1 },
						{ id: 2, name: 'Jane', cityId: 1 },
					]);
				}

				{
					const result = yield* db.select({ name: newYorkers1.name }).from(newYorkers1);
					expect(result).toEqual([
						{ name: 'John' },
						{ name: 'Jane' },
					]);
				}
			}));

		it.effect('update ... from with join', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const states = pgTable('states_30', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
				});
				const cities = pgTable('cities_30', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
					stateId: integer('state_id').references(() => states.id),
				});
				const users = pgTable('users_30', {
					id: serial('id').primaryKey(),
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
					cities_30: {
						id: 2,
						name: 'Seattle',
						stateId: 2,
					},
					states_30: {
						id: 2,
						name: 'Washington',
					},
				}]);
				expect(result2).toStrictEqual([{
					id: 3,
					name: 'Jack',
					cityId: 3,
					cities_30: {
						id: 3,
						name: 'London',
						stateId: null,
					},
					states_30: null,
				}]);
			}));

		it.effect('insert into ... select', () =>
			Effect.gen(function*() {
				const notifications = pgTable('notifications_31', {
					id: serial('id').primaryKey(),
					sentAt: timestamp('sent_at').notNull().defaultNow(),
					message: text('message').notNull(),
				});
				const users = pgTable('users_31', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
				});
				const userNotications = pgTable('user_notifications_31', {
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
				const countTestTable = pgTable('count_test_33', {
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
				const countTestTable = pgTable('count_test_34', {
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
				const countTestTable = pgTable('count_test_35', {
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
				const countTestTable = pgTable('count_test_36', {
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
				const countTestTable = pgTable('count_test_37', {
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
				const countTestTable = pgTable('count_test_38', {
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
				const usersDistinctTable = pgTable('users_distinct_101', {
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
				const users1 = yield* db.selectDistinct().from(usersDistinctTable).orderBy(
					usersDistinctTable.id,
					usersDistinctTable.name,
				);
				const users2 = yield* db.selectDistinctOn([usersDistinctTable.id]).from(usersDistinctTable).orderBy(
					usersDistinctTable.id,
				);
				const users3 = yield* db.selectDistinctOn([usersDistinctTable.name], { name: usersDistinctTable.name }).from(
					usersDistinctTable,
				).orderBy(usersDistinctTable.name);
				const users4 = yield* db.selectDistinctOn([usersDistinctTable.id, usersDistinctTable.age]).from(
					usersDistinctTable,
				).orderBy(usersDistinctTable.id, usersDistinctTable.age);

				expect(users1).toEqual([
					{ id: 1, name: 'Jane', age: 24 },
					{ id: 1, name: 'Jane', age: 26 },
					{ id: 1, name: 'John', age: 24 },
					{ id: 2, name: 'John', age: 25 },
				]);

				expect(users2).toHaveLength(2);
				expect(users2[0]?.id).toBe(1);
				expect(users2[1]?.id).toBe(2);

				expect(users3).toHaveLength(2);
				expect(users3[0]?.name).toBe('Jane');
				expect(users3[1]?.name).toBe('John');

				expect(users4).toEqual([
					{ id: 1, name: 'John', age: 24 },
					{ id: 1, name: 'Jane', age: 26 },
					{ id: 2, name: 'John', age: 25 },
				]);
			}));

		it.effect('update with returning all fields', () =>
			Effect.gen(function*() {
				const users = pgTable('users_9', {
					id: serial('id' as string).primaryKey(),
					name: text('name').notNull(),
					verified: boolean('verified').notNull().default(false),
					jsonb: jsonb('jsonb').$type<string[]>(),
					createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
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
				const users = pgTable('users_10', {
					id: serial('id' as string).primaryKey(),
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
				const users = pgTable('users_11', {
					id: serial('id' as string).primaryKey(),
					name: text('name').notNull(),
					verified: boolean('verified').notNull().default(false),
					jsonb: jsonb('jsonb').$type<string[]>(),
					createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
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
				const users = pgTable('users_12', {
					id: serial('id' as string).primaryKey(),
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
				const users = pgTable('users_19', {
					id: serial('id' as string).primaryKey(),
					name: text('name').notNull(),
					verified: boolean('verified').notNull().default(false),
					jsonb: jsonb('jsonb').$type<string[]>(),
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
				const users = pgTable('users_20', {
					id: serial('id' as string).primaryKey(),
					name: text('name').notNull(),
					verified: boolean('verified').notNull().default(false),
					jsonb: jsonb('jsonb').$type<string[]>(),
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
				const users = pgTable('users_20', {
					id: serial('id' as string).primaryKey(),
					name: text('name').notNull(),
					verified: boolean('verified').notNull().default(false),
					jsonb: jsonb('jsonb').$type<string[]>(),
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
				const usersTable = pgTable('users_35', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
					verified: boolean('verified').notNull().default(false),
				});

				const db = yield* DB;
				yield* push(db, { usersTable });

				const stmt = db
					.insert(usersTable)
					.values({
						verified: true,
						name: sql.placeholder('name'),
					})
					.prepare('stmt2');

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
				const usersTable = pgTable('users_36', {
					id: serial('id').primaryKey(),
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
					.prepare('stmt3');
				const result = yield* stmt.execute({ id: 1 });

				expect(result).toEqual([{ id: 1, name: 'John' }]);
			}));

		it.effect('prepared statement with placeholder in .limit', () =>
			Effect.gen(function*() {
				const usersTable = pgTable('users_37', {
					id: serial('id').primaryKey(),
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
					.prepare('stmt_limit');

				const result = yield* stmt.execute({ id: 1, limit: 1 });

				expect(result).toEqual([{ id: 1, name: 'John' }]);
				expect(result).toHaveLength(1);
			}));

		it.effect('prepared statement with placeholder in .offset', () =>
			Effect.gen(function*() {
				const usersTable = pgTable('users_38', {
					id: serial('id').primaryKey(),
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
					.prepare('stmt_offset');

				const result = yield* stmt.execute({ offset: 1 });

				expect(result).toEqual([{ id: 2, name: 'John1' }]);
			}));

		it.effect('prepared statement built using $dynamic', () =>
			Effect.gen(function*() {
				const usersTable = pgTable('users_39', {
					id: serial('id').primaryKey(),
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
				withLimitOffset(stmt).prepare('stmt_limit');

				const result = yield* stmt.execute({ limit: 1, offset: 1 });

				expect(result).toEqual([{ id: 2, name: 'John1' }]);
				expect(result).toHaveLength(1);
			}));

		it.effect('with ... select', () =>
			Effect.gen(function*() {
				const orders = pgTable('orders_55', {
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
						productUnits: sql<number>`sum(${orders.quantity})::int`,
						productSales: sql<number>`sum(${orders.amount})::int`,
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
						productUnits: sql<number>`sum(${orders.quantity})::int`,
						productSales: sql<number>`sum(${orders.amount})::int`,
					})
					.from(orders)
					.where(inArray(orders.region, db.select({ region: topRegions.region }).from(topRegions)))
					.groupBy(orders.region, orders.product)
					.orderBy(orders.region, orders.product);
				const result3 = yield* db
					.with(regionalSales, topRegions)
					.selectDistinctOn([orders.region], {
						region: orders.region,
						productUnits: sql<number>`sum(${orders.quantity})::int`,
						productSales: sql<number>`sum(${orders.amount})::int`,
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
				const products = pgTable('products_56', {
					id: serial('id').primaryKey(),
					price: numeric('price').notNull(),
					cheap: boolean('cheap').notNull().default(false),
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
				const users = pgTable('users_57', {
					username: text('username').notNull(),
					admin: boolean('admin').notNull().default(false),
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
				const orders = pgTable('orders_58', {
					id: serial('id').primaryKey(),
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
				const users = pgTable('users_29', {
					id: serial('id' as string).primaryKey(),
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
				const users = pgTable('prefixed_users_30', {
					id: serial('id').primaryKey(),
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
				const users = pgTable('prefixed_users_31', {
					id: serial('id').primaryKey(),
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
				const cities2Table = pgTable('cities_1', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
				});

				const users2Table = pgTable('users2_1', {
					id: serial('id').primaryKey(),
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

				expect(result).toHaveLength(1);

				expect(result).toEqual([
					{ id: 1, name: 'New York' },
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
				const cities2Table = pgTable('cities_2', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
				});

				const users2Table = pgTable('users2_2', {
					id: serial('id').primaryKey(),
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

				const db = yield* PgDrizzle.make({ relations }).pipe(
					Effect.provide(customLoggerLayer),
					Effect.provide(PgDrizzle.DefaultServices),
				);

				const users = pgTable('users_custom_logger', {
					id: serial('id').primaryKey(),
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

				const db = yield* PgDrizzle.make({ relations }).pipe(
					Effect.provide(customCacheLayer),
					Effect.provide(PgDrizzle.DefaultServices),
				);

				const users = pgTable('users_custom_cache', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
				});

				yield* push(db, { users });
				yield* db.insert(users).values({ name: 'John' });
				yield* db.select().from(users).$withCache();

				const ops = yield* Ref.get(cacheOperations);
				expect(ops.some((o) => o.op === 'mutate')).toBe(true);
				expect(ops.some((o) => o.op === 'get')).toBe(true);
			}));

		it.effect('makeWithDefaults - convenience function that includes DefaultServices', () =>
			Effect.gen(function*() {
				const db = yield* PgDrizzle.makeWithDefaults({ relations });

				const users = pgTable('users_make_with_defaults', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
				});

				yield* push(db, { users });
				yield* db.insert(users).values({ name: 'Alice' });
				const result = yield* db.select().from(users);

				expect(result).toEqual([{ id: 1, name: 'Alice' }]);
			}));

		it.effect(
			'all types ~codecs~',
			() =>
				Effect.gen(function*() {
					const { en, allTypesTable } = makeAllTypes('all_types_cdc_ef', 'en_48');

					const db = yield* DB;
					yield* push(db, {
						en,
						allTypesTable,
					});

					yield* db.insert(allTypesTable).values(allTypesData);
					const session = (<any> db).session as PgEffectSession;

					const queryRes = yield* session.objects<AllTypes>(db.select().from(allTypesTable).getSQL()).pipe(
						Effect.map((e) =>
							normalizeDataWithDbCodecs({
								db,
								columns: getColumns(allTypesTable),
								data: e,
								mode: 'query',
							})[0]
						),
					);

					const relDb = yield* createDB({ allTypesTable }, allTypesRelations);

					const { relationRes, rootRes } = yield* session.objects<AllTypes & { self: AllTypes[] }>(
						relDb.query.allTypesTable.findFirst({
							with: {
								self: true,
							},
						}).getSQL(),
					).pipe(Effect.map((e) => {
						const { self: relationRaw, ...rootRaw } = e[0]!;

						return {
							relationRes: normalizeDataWithDbCodecs({
								db,
								columns: getColumns(allTypesTable),
								data: relationRaw,
								mode: 'json',
							})[0]!,
							rootRes: normalizeDataWithDbCodecs({
								db,
								columns: getColumns(allTypesTable),
								data: [rootRaw],
								mode: 'query',
							})[0]!,
						};
					}));

					expect(queryRes).toStrictEqual(allTypesData);
					expect(relationRes).toStrictEqual(allTypesData);
					expect(rootRes).toStrictEqual(allTypesData);

					const context = yield* Effect.context<never>();
					yield* Effect.promise(() =>
						assertAllTypesUnions(relDb as any, allTypesTable, (query) => Effect.runPromiseWith(context)(query))
					);
				}),
		);

		it.effect('Mappers: - correct mappers enabled', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const jitDb = yield* createDB({}, () => ({}), true);

				const dialect: PgDialect = (<any> db).dialect;
				const jitDialect: PgDialect = (<any> jitDb).dialect;

				expect(dialect.mapperGenerators.relationalRows === makeDefaultRqbMapper).toStrictEqual(true);
				expect(dialect.mapperGenerators.rows === makeDefaultQueryMapper).toStrictEqual(true);
				expect(jitDialect.mapperGenerators.relationalRows === makeJitRqbMapper).toStrictEqual(true);
				expect(jitDialect.mapperGenerators.rows === makeJitQueryMapper).toStrictEqual(true);
			}));

		it.effect("No nullification on non-joined table's all-null object", () =>
			Effect.gen(function*() {
				const users = pgTable('nullify1_users', (t) => ({
					id: t.serial('id').primaryKey(),
					name: t.text('name').notNull(),
					bio: t.text('bio'),
					city: t.text('city'),
				}));

				const db = yield* DB;
				yield* push(db, { users });

				yield* db.insert(users).values({ name: 'John' });

				const res = yield* db.select({ id: users.id, meta: { bio: users.bio, city: users.city } }).from(users);

				expect(res).toStrictEqual([{ id: 1, meta: { bio: null, city: null } }]);
			}));

		it.effect('Cross-table group never nullified', () =>
			Effect.gen(function*() {
				const cities = pgTable('nullify2_cities', (t) => ({
					id: t.serial('id').primaryKey(),
					name: t.text('name').notNull(),
				}));
				const users = pgTable('nullify2_users', (t) => ({
					id: t.serial('id').primaryKey(),
					name: t.text('name').notNull(),
					bio: t.text('bio'),
					cityId: t.integer('city_id').references(() => cities.id),
				}));

				const db = yield* DB;
				yield* push(db, { cities, users });

				yield* db.insert(cities).values([{ name: 'Paris' }]);
				yield* db.insert(users).values([{ name: 'John', cityId: 1 }, { name: 'Jane' }]);

				const res = yield* db
					.select({ id: users.id, g: { user: users.name, cityId: cities.id, cityName: cities.name } })
					.from(users)
					.leftJoin(cities, eq(users.cityId, cities.id))
					.orderBy(users.id);

				expect(res).toStrictEqual([
					{ id: 1, g: { user: 'John', cityId: 1, cityName: 'Paris' } },
					{ id: 2, g: { user: 'Jane', cityId: null, cityName: null } },
				]);

				const onlyJoinedSideNotNull = yield* db
					.select({ id: users.id, g: { bio: users.bio, cityId: cities.id } })
					.from(users)
					.leftJoin(cities, eq(users.cityId, cities.id))
					.orderBy(users.id);

				expect(onlyJoinedSideNotNull).toStrictEqual([
					{ id: 1, g: { bio: null, cityId: 1 } },
					{ id: 2, g: { bio: null, cityId: null } },
				]);
			}));

		it.effect('SQL field groups are never nullified', () =>
			Effect.gen(function*() {
				const cities = pgTable('nullify3_cities', (t) => ({
					id: t.serial('id').primaryKey(),
					name: t.text('name').notNull(),
				}));
				const users = pgTable('nullify3_users', (t) => ({
					id: t.serial('id').primaryKey(),
					name: t.text('name').notNull(),
					cityId: t.integer('city_id').references(() => cities.id),
				}));

				const db = yield* DB;
				yield* push(db, { cities, users });

				yield* db.insert(cities).values([{ name: 'Paris' }]);
				yield* db.insert(users).values([{ name: 'John', cityId: 1 }, { name: 'Jane' }]);

				const res = yield* db
					.select({
						id: users.id,
						calc: { user: sql<string>`upper(${users.name})`, city: sql<string | null>`upper(${cities.name})` },
					})
					.from(users)
					.leftJoin(cities, eq(users.cityId, cities.id))
					.orderBy(users.id);

				expect(res).toStrictEqual([
					{ id: 1, calc: { user: 'JOHN', city: 'PARIS' } },
					{ id: 2, calc: { user: 'JANE', city: null } },
				]);
			}));

		it.effect('Nullify all-null group from from nullable join', () =>
			Effect.gen(function*() {
				const cities = pgTable('nullify4_cities', (t) => ({
					id: t.serial('id').primaryKey(),
					name: t.text('name').notNull(),
					state: t.text('state'),
					zip: t.text('zip'),
				}));
				const users = pgTable('nullify4_users', (t) => ({
					id: t.serial('id').primaryKey(),
					name: t.text('name').notNull(),
					cityId: t.integer('city_id').references(() => cities.id),
				}));

				const db = yield* DB;
				yield* push(db, { cities, users });

				yield* db.insert(cities).values([
					{ name: 'Paris', state: 'IDF', zip: '75' },
					{ name: 'London' },
				]);
				yield* db.insert(users).values([
					{ name: 'John', cityId: 1 },
					{ name: 'Jane', cityId: 2 },
					{ name: 'Jack' },
				]);

				const res = yield* db
					.select({ name: users.name, c: { state: cities.state, zip: cities.zip } })
					.from(users)
					.leftJoin(cities, eq(users.cityId, cities.id))
					.orderBy(users.id);

				expect(res).toStrictEqual([
					{ name: 'John', c: { state: 'IDF', zip: '75' } },
					{ name: 'Jane', c: null },
					{ name: 'Jack', c: null },
				]);
			}));

		it.effect("Don't disregard added SQL field during join nullification", () =>
			Effect.gen(function*() {
				const cities = pgTable('nullify5_cities', (t) => ({
					id: t.serial('id').primaryKey(),
					name: t.text('name').notNull(),
					state: t.text('state'),
				}));
				const users = pgTable('nullify5_users', (t) => ({
					id: t.serial('id').primaryKey(),
					name: t.text('name').notNull(),
					cityId: t.integer('city_id').references(() => cities.id),
				}));

				const db = yield* DB;
				yield* push(db, { cities, users });

				yield* db.insert(cities).values([{ name: 'Paris', state: 'IDF' }, { name: 'London' }]);
				yield* db.insert(users).values([{ name: 'John', cityId: 1 }, { name: 'Jane', cityId: 2 }]);

				const res = yield* db
					.select({
						name: users.name,
						c: { state: cities.state, cityUpper: sql<string>`upper(${cities.name})` },
					})
					.from(users)
					.leftJoin(cities, eq(users.cityId, cities.id))
					.orderBy(users.id);

				// Jane's city (London) matched but has no `state`; the added `cityUpper` sql field is non-null, so
				// the all-null rule keeps the object rather than nullifying it on the lone column.
				expect(res).toStrictEqual([
					{ name: 'John', c: { state: 'IDF', cityUpper: 'PARIS' } },
					{ name: 'Jane', c: { state: null, cityUpper: 'LONDON' } },
				]);
			}));

		it.effect("No nullification on non-joined table's all-null object - jit", () =>
			Effect.gen(function*() {
				const users = pgTable('nullify1_users_jit', (t) => ({
					id: t.serial('id').primaryKey(),
					name: t.text('name').notNull(),
					bio: t.text('bio'),
					city: t.text('city'),
				}));

				const db = yield* createDB({}, () => ({}), true);
				yield* push(db, { users });

				yield* db.insert(users).values({ name: 'John' });

				const res = yield* db.select({ id: users.id, meta: { bio: users.bio, city: users.city } }).from(users);

				expect(res).toStrictEqual([{ id: 1, meta: { bio: null, city: null } }]);
			}));

		it.effect('Cross-table group never nullified - jit', () =>
			Effect.gen(function*() {
				const cities = pgTable('nullify2_cities_jit', (t) => ({
					id: t.serial('id').primaryKey(),
					name: t.text('name').notNull(),
				}));
				const users = pgTable('nullify2_users_jit', (t) => ({
					id: t.serial('id').primaryKey(),
					name: t.text('name').notNull(),
					bio: t.text('bio'),
					cityId: t.integer('city_id').references(() => cities.id),
				}));

				const db = yield* createDB({}, () => ({}), true);
				yield* push(db, { cities, users });

				yield* db.insert(cities).values([{ name: 'Paris' }]);
				yield* db.insert(users).values([{ name: 'John', cityId: 1 }, { name: 'Jane' }]);

				const res = yield* db
					.select({ id: users.id, g: { user: users.name, cityId: cities.id, cityName: cities.name } })
					.from(users)
					.leftJoin(cities, eq(users.cityId, cities.id))
					.orderBy(users.id);

				expect(res).toStrictEqual([
					{ id: 1, g: { user: 'John', cityId: 1, cityName: 'Paris' } },
					{ id: 2, g: { user: 'Jane', cityId: null, cityName: null } },
				]);

				const onlyJoinedSideNotNull = yield* db
					.select({ id: users.id, g: { bio: users.bio, cityId: cities.id } })
					.from(users)
					.leftJoin(cities, eq(users.cityId, cities.id))
					.orderBy(users.id);

				expect(onlyJoinedSideNotNull).toStrictEqual([
					{ id: 1, g: { bio: null, cityId: 1 } },
					{ id: 2, g: { bio: null, cityId: null } },
				]);
			}));

		it.effect('SQL field groups are never nullified - jit', () =>
			Effect.gen(function*() {
				const cities = pgTable('nullify3_cities_jit', (t) => ({
					id: t.serial('id').primaryKey(),
					name: t.text('name').notNull(),
				}));
				const users = pgTable('nullify3_users_jit', (t) => ({
					id: t.serial('id').primaryKey(),
					name: t.text('name').notNull(),
					cityId: t.integer('city_id').references(() => cities.id),
				}));

				const db = yield* createDB({}, () => ({}), true);
				yield* push(db, { cities, users });

				yield* db.insert(cities).values([{ name: 'Paris' }]);
				yield* db.insert(users).values([{ name: 'John', cityId: 1 }, { name: 'Jane' }]);

				const res = yield* db
					.select({
						id: users.id,
						calc: { user: sql<string>`upper(${users.name})`, city: sql<string | null>`upper(${cities.name})` },
					})
					.from(users)
					.leftJoin(cities, eq(users.cityId, cities.id))
					.orderBy(users.id);

				expect(res).toStrictEqual([
					{ id: 1, calc: { user: 'JOHN', city: 'PARIS' } },
					{ id: 2, calc: { user: 'JANE', city: null } },
				]);
			}));

		it.effect('Nullify all-null group from from nullable join - jit', () =>
			Effect.gen(function*() {
				const cities = pgTable('nullify4_cities_jit', (t) => ({
					id: t.serial('id').primaryKey(),
					name: t.text('name').notNull(),
					state: t.text('state'),
					zip: t.text('zip'),
				}));
				const users = pgTable('nullify4_users_jit', (t) => ({
					id: t.serial('id').primaryKey(),
					name: t.text('name').notNull(),
					cityId: t.integer('city_id').references(() => cities.id),
				}));

				const db = yield* createDB({}, () => ({}), true);
				yield* push(db, { cities, users });

				yield* db.insert(cities).values([
					{ name: 'Paris', state: 'IDF', zip: '75' },
					{ name: 'London' },
				]);
				yield* db.insert(users).values([
					{ name: 'John', cityId: 1 },
					{ name: 'Jane', cityId: 2 },
					{ name: 'Jack' },
				]);

				const res = yield* db
					.select({ name: users.name, c: { state: cities.state, zip: cities.zip } })
					.from(users)
					.leftJoin(cities, eq(users.cityId, cities.id))
					.orderBy(users.id);

				expect(res).toStrictEqual([
					{ name: 'John', c: { state: 'IDF', zip: '75' } },
					{ name: 'Jane', c: null },
					{ name: 'Jack', c: null },
				]);
			}));

		it.effect("Don't disregard added SQL field during join nullification - jit", () =>
			Effect.gen(function*() {
				const cities = pgTable('nullify5_cities_jit', (t) => ({
					id: t.serial('id').primaryKey(),
					name: t.text('name').notNull(),
					state: t.text('state'),
				}));
				const users = pgTable('nullify5_users_jit', (t) => ({
					id: t.serial('id').primaryKey(),
					name: t.text('name').notNull(),
					cityId: t.integer('city_id').references(() => cities.id),
				}));

				const db = yield* createDB({}, () => ({}), true);
				yield* push(db, { cities, users });

				yield* db.insert(cities).values([{ name: 'Paris', state: 'IDF' }, { name: 'London' }]);
				yield* db.insert(users).values([{ name: 'John', cityId: 1 }, { name: 'Jane', cityId: 2 }]);

				const res = yield* db
					.select({
						name: users.name,
						c: { state: cities.state, cityUpper: sql<string>`upper(${cities.name})` },
					})
					.from(users)
					.leftJoin(cities, eq(users.cityId, cities.id))
					.orderBy(users.id);

				// Jane's city (London) matched but has no `state`; the added `cityUpper` sql field is non-null, so
				// the all-null rule keeps the object rather than nullifying it on the lone column.
				expect(res).toStrictEqual([
					{ name: 'John', c: { state: 'IDF', cityUpper: 'PARIS' } },
					{ name: 'Jane', c: { state: null, cityUpper: 'LONDON' } },
				]);
			}));
		const mappersDate = new Date('2026-04-02T00:00:00.000Z');

		it.effect('Mappers: simple select - no rows', () =>
			Effect.gen(function*() {
				const users = pgTable('mappers_users_1', (t) => ({
					id: t.bigint('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.timestamp('created_at', {
						withTimezone: true,
						mode: 'date',
					}).notNull(),
					isBanned: t.boolean('is_banned'),
				}));

				const db = yield* DB;
				yield* push(db, { users });

				const result = yield* db.select().from(users);

				expect(result).toStrictEqual([]);
			}));

		it.effect('Mappers: select - nothing to decode - text', () =>
			Effect.gen(function*() {
				const users = pgTable('mappers_users_2', (t) => ({
					id: t.bigint('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.timestamp('created_at', {
						withTimezone: true,
						mode: 'date',
					}).notNull(),
					isBanned: t.boolean('is_banned'),
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
				const users = pgTable('mappers_users_3', (t) => ({
					id: t.bigint('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.timestamp('created_at', {
						withTimezone: true,
						mode: 'date',
					}).notNull(),
					isBanned: t.boolean('is_banned'),
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
				const users = pgTable('mappers_users_4', (t) => ({
					id: t.bigint('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.timestamp('created_at', {
						withTimezone: true,
						mode: 'date',
					}).notNull(),
					isBanned: t.boolean('is_banned'),
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
				const users = pgTable('mappers_users_5', (t) => ({
					id: t.bigint('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.timestamp('created_at', {
						withTimezone: true,
						mode: 'date',
					}).notNull(),
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
				const users = pgTable('mappers_users_6', (t) => ({
					id: t.bigint('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.timestamp('created_at', {
						withTimezone: true,
						mode: 'date',
					}).notNull(),
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

		it.effect('Jit mappers: - simple select - no rows', () =>
			Effect.gen(function*() {
				const users = pgTable('jit_mappers_users_1', (t) => ({
					id: t.bigint('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.timestamp('created_at', {
						withTimezone: true,
						mode: 'date',
					}).notNull(),
					isBanned: t.boolean('is_banned'),
				}));

				const db = yield* createDB({}, () => ({}), true);
				yield* push(db, { users });

				const result = yield* db.select().from(users);

				expect(result).toStrictEqual([]);
			}));

		it.effect('Jit mappers: - select - nothing to decode - text', () =>
			Effect.gen(function*() {
				const users = pgTable('jit_mappers_users_2', (t) => ({
					id: t.bigint('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.timestamp('created_at', {
						withTimezone: true,
						mode: 'date',
					}).notNull(),
					isBanned: t.boolean('is_banned'),
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

		it.effect('Jit mappers: - select - nothing to decode - null', () =>
			Effect.gen(function*() {
				const users = pgTable('jit_mappers_users_3', (t) => ({
					id: t.bigint('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.timestamp('created_at', {
						withTimezone: true,
						mode: 'date',
					}).notNull(),
					isBanned: t.boolean('is_banned'),
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

		it.effect('Jit mappers: - insert returning all + select + update returning + delete returning', () =>
			Effect.gen(function*() {
				const users = pgTable('jit_mappers_users_4', (t) => ({
					id: t.bigint('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.timestamp('created_at', {
						withTimezone: true,
						mode: 'date',
					}).notNull(),
					isBanned: t.boolean('is_banned'),
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

		it.effect('Jit mappers: - select complex selections', () =>
			Effect.gen(function*() {
				const users = pgTable('jit_mappers_users_5', (t) => ({
					id: t.bigint('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.timestamp('created_at', {
						withTimezone: true,
						mode: 'date',
					}).notNull(),
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

		it.effect('Jit mappers: - relational', () =>
			Effect.gen(function*() {
				const users = pgTable('jit_mappers_users_6', (t) => ({
					id: t.bigint('id', { mode: 'number' }).primaryKey(),
					name: t.text('name').notNull(),
					createdAt: t.timestamp('created_at', {
						withTimezone: true,
						mode: 'date',
					}).notNull(),
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

		it.effect('Column as decoder applies codecs', () =>
			Effect.gen(function*() {
				let customCast = false;
				let customMap = false;

				const codecBypass = customType<{
					data: Date;
					driverData: string;
					jsonData: string;
				}>({
					codec: 'timestamptz',
					dataType: () => 'timestamptz(3)',
					forJsonSelect: (identifier, sql, arrayDimensions) => {
						customCast = true;
						return sql`${identifier}::text${arrayDimensions ? sql.raw('[]'.repeat(arrayDimensions)) : undefined}`;
					},
					fromJson: (v) => {
						customMap = true;
						return new Date(v);
					},
					toDriver: (v) => v.toISOString(),
				});

				const users = pgTable('users_823', (t) => ({
					id: t.integer().primaryKey(),
					name: t.text().notNull(),
					createdAt: t.timestamp('created_at').notNull(),
					createdAtStr: t.timestamp('created_at_str', { mode: 'string' }).notNull(),
					arrCreatedAt: t.timestamp('arr_created_at').notNull().array(),
					arrCreatedAtStr: t.timestamp('arr_created_at_str', { mode: 'string' }).notNull().array(),
					cus: codecBypass('custom').notNull(),
					arrCus: codecBypass('arr_custom').notNull().array(),
				}));

				const usersView = pgView('users_823_v').as((qb) =>
					qb.select({
						...getColumns(users),
						max: max(users.createdAt).as('max'),
						maxStr: max(users.createdAtStr).as('max_str'),
						arrMax: max(users.arrCreatedAt).as('arr_max'),
						arrMaxStr: max(users.arrCreatedAtStr).as('arr_max_str'),
						sq: qb.select({ createdAt: users.createdAt }).from(users).as('sq'),
					}).from(users).groupBy(users.id)
				);

				const db = yield* createDB({ users, usersView }, (r) => ({
					users: {
						self: r.one.users({
							from: r.users.id,
							to: r.users.id,
						}),
					},
					usersView: {
						self: r.one.usersView({
							from: r.usersView.id,
							to: r.usersView.id,
						}),
					},
				}));
				yield* push(db, { users, usersView });

				const exDateStr = '1970-01-16 16:45:46.351';
				const exDate = new Date(exDateStr);

				yield* db.insert(users).values({
					id: 1,
					name: 'First',
					createdAt: exDate,
					createdAtStr: exDateStr,
					arrCreatedAt: [exDate],
					arrCreatedAtStr: [exDateStr],
					cus: exDate,
					arrCus: [exDate],
				});

				const res = yield* db.select({
					...getColumns(users),
					max: max(users.createdAt).as('max'),
					maxStr: max(users.createdAtStr).as('max_str'),
					arrMax: max(users.arrCreatedAt).as('arr_max'),
					arrMaxStr: max(users.arrCreatedAtStr).as('arr_max_str'),
					sq: db.select({ createdAt: users.createdAt }).from(users).as('sq'),
				}).from(users).groupBy(users.id);

				const viewRes = yield* db.select().from(usersView);

				const nested = yield* db.query.users.findFirst({
					with: {
						self: {
							extras: {
								max: () => sql`select max(${users.createdAt}) from ${users}`.mapWith(users.createdAt),
								maxStr: () => sql`select max(${users.createdAtStr}) from ${users}`.mapWith(users.createdAtStr),
								arrMax: () => sql`select max(${users.arrCreatedAt}) from ${users}`.mapWith(users.arrCreatedAt),
								arrMaxStr: () => sql`select max(${users.arrCreatedAtStr}) from ${users}`.mapWith(users.arrCreatedAtStr),
							},
						},
					},
					extras: {
						max: () => sql`select max(${users.createdAt}) from ${users}`.mapWith(users.createdAt),
						maxStr: () => sql`select max(${users.createdAtStr}) from ${users}`.mapWith(users.createdAtStr),
						arrMax: () => sql`select max(${users.arrCreatedAt}) from ${users}`.mapWith(users.arrCreatedAt),
						arrMaxStr: () => sql`select max(${users.arrCreatedAtStr}) from ${users}`.mapWith(users.arrCreatedAtStr),
					},
				});

				const viewNested = yield* db.query.usersView.findFirst({
					columns: {
						sq: false, // TODO: re-enable when supported in RQBv2
					},
					with: {
						self: {
							columns: {
								sq: false, // TODO: re-enable when supported in RQBv2
							},
						},
					},
				});

				expect(res).toStrictEqual([
					{
						id: 1,
						name: 'First',
						createdAt: exDate,
						createdAtStr: exDateStr,
						arrCreatedAt: [exDate],
						arrCreatedAtStr: [exDateStr],
						max: exDate,
						maxStr: exDateStr,
						arrMax: [exDate],
						arrMaxStr: [exDateStr],
						sq: exDate,
						cus: exDate,
						arrCus: [exDate],
					},
				]);
				expect(viewRes).toStrictEqual([
					{
						id: 1,
						name: 'First',
						createdAt: exDate,
						createdAtStr: exDateStr,
						arrCreatedAt: [exDate],
						arrCreatedAtStr: [exDateStr],
						max: exDate,
						maxStr: exDateStr,
						arrMax: [exDate],
						arrMaxStr: [exDateStr],
						sq: exDate,
						cus: exDate,
						arrCus: [exDate],
					},
				]);

				expect(customCast).toBeTruthy();
				expect(customMap).toBeTruthy();

				expect(nested).toStrictEqual(
					{
						id: 1,
						name: 'First',
						createdAt: exDate,
						createdAtStr: exDateStr,
						arrCreatedAt: [exDate],
						arrCreatedAtStr: [exDateStr],
						max: exDate,
						maxStr: exDateStr,
						arrMax: [exDate],
						arrMaxStr: [exDateStr],
						cus: exDate,
						arrCus: [exDate],
						self: {
							id: 1,
							name: 'First',
							createdAt: exDate,
							createdAtStr: exDateStr,
							arrCreatedAt: [exDate],
							arrCreatedAtStr: [exDateStr],
							max: exDate,
							maxStr: exDateStr,
							arrMax: [exDate],
							arrMaxStr: [exDateStr],
							cus: exDate,
							arrCus: [exDate],
						},
					},
				);
				expect(viewNested).toStrictEqual(
					{
						id: 1,
						name: 'First',
						createdAt: exDate,
						createdAtStr: exDateStr,
						arrCreatedAt: [exDate],
						arrCreatedAtStr: [exDateStr],
						max: exDate,
						maxStr: exDateStr,
						arrMax: [exDate],
						arrMaxStr: [exDateStr],
						cus: exDate,
						arrCus: [exDate],
						self: {
							id: 1,
							name: 'First',
							createdAt: exDate,
							createdAtStr: exDateStr,
							arrCreatedAt: [exDate],
							arrCreatedAtStr: [exDateStr],
							max: exDate,
							maxStr: exDateStr,
							arrMax: [exDate],
							arrMaxStr: [exDateStr],
							cus: exDate,
							arrCus: [exDate],
						},
					},
				);
			}));

		it.effect('Column as decoder applies codecs - Jit mappers', () =>
			Effect.gen(function*() {
				let customCast = false;
				let customMap = false;

				const codecBypass = customType<{
					data: Date;
					driverData: string;
					jsonData: string;
				}>({
					codec: 'timestamptz',
					dataType: () => 'timestamptz(3)',
					forJsonSelect: (identifier, sql, arrayDimensions) => {
						customCast = true;
						return sql`${identifier}::text${arrayDimensions ? sql.raw('[]'.repeat(arrayDimensions)) : undefined}`;
					},
					fromJson: (v) => {
						customMap = true;
						return new Date(v);
					},
					toDriver: (v) => v.toISOString(),
				});

				const users = pgTable('users_823_jit', (t) => ({
					id: t.integer().primaryKey(),
					name: t.text().notNull(),
					createdAt: t.timestamp('created_at').notNull(),
					createdAtStr: t.timestamp('created_at_str', { mode: 'string' }).notNull(),
					arrCreatedAt: t.timestamp('arr_created_at').notNull().array(),
					arrCreatedAtStr: t.timestamp('arr_created_at_str', { mode: 'string' }).notNull().array(),
					cus: codecBypass('custom').notNull(),
					arrCus: codecBypass('arr_custom').notNull().array(),
				}));

				const usersView = pgView('users_823_v_jit').as((qb) =>
					qb.select({
						...getColumns(users),
						max: max(users.createdAt).as('max'),
						maxStr: max(users.createdAtStr).as('max_str'),
						arrMax: max(users.arrCreatedAt).as('arr_max'),
						arrMaxStr: max(users.arrCreatedAtStr).as('arr_max_str'),
						sq: qb.select({ createdAt: users.createdAt }).from(users).as('sq'),
					}).from(users).groupBy(users.id)
				);

				const db = yield* createDB({ users, usersView }, (r) => ({
					users: {
						self: r.one.users({
							from: r.users.id,
							to: r.users.id,
						}),
					},
					usersView: {
						self: r.one.usersView({
							from: r.usersView.id,
							to: r.usersView.id,
						}),
					},
				}), true);
				yield* push(db, { users, usersView });

				const exDateStr = '1970-01-16 16:45:46.351';
				const exDate = new Date(exDateStr);

				yield* db.insert(users).values({
					id: 1,
					name: 'First',
					createdAt: exDate,
					createdAtStr: exDateStr,
					arrCreatedAt: [exDate],
					arrCreatedAtStr: [exDateStr],
					cus: exDate,
					arrCus: [exDate],
				});

				const res = yield* db.select({
					...getColumns(users),
					max: max(users.createdAt).as('max'),
					maxStr: max(users.createdAtStr).as('max_str'),
					arrMax: max(users.arrCreatedAt).as('arr_max'),
					arrMaxStr: max(users.arrCreatedAtStr).as('arr_max_str'),
					sq: db.select({ createdAt: users.createdAt }).from(users).as('sq'),
				}).from(users).groupBy(users.id);

				const viewRes = yield* db.select().from(usersView);

				const nested = yield* db.query.users.findFirst({
					with: {
						self: {
							extras: {
								max: () => sql`select max(${users.createdAt}) from ${users}`.mapWith(users.createdAt),
								maxStr: () => sql`select max(${users.createdAtStr}) from ${users}`.mapWith(users.createdAtStr),
								arrMax: () => sql`select max(${users.arrCreatedAt}) from ${users}`.mapWith(users.arrCreatedAt),
								arrMaxStr: () => sql`select max(${users.arrCreatedAtStr}) from ${users}`.mapWith(users.arrCreatedAtStr),
							},
						},
					},
					extras: {
						max: () => sql`select max(${users.createdAt}) from ${users}`.mapWith(users.createdAt),
						maxStr: () => sql`select max(${users.createdAtStr}) from ${users}`.mapWith(users.createdAtStr),
						arrMax: () => sql`select max(${users.arrCreatedAt}) from ${users}`.mapWith(users.arrCreatedAt),
						arrMaxStr: () => sql`select max(${users.arrCreatedAtStr}) from ${users}`.mapWith(users.arrCreatedAtStr),
					},
				});

				const viewNested = yield* db.query.usersView.findFirst({
					columns: {
						sq: false, // TODO: re-enable when supported in RQBv2
					},
					with: {
						self: {
							columns: {
								sq: false, // TODO: re-enable when supported in RQBv2
							},
						},
					},
				});

				expect(res).toStrictEqual([
					{
						id: 1,
						name: 'First',
						createdAt: exDate,
						createdAtStr: exDateStr,
						arrCreatedAt: [exDate],
						arrCreatedAtStr: [exDateStr],
						max: exDate,
						maxStr: exDateStr,
						arrMax: [exDate],
						arrMaxStr: [exDateStr],
						sq: exDate,
						cus: exDate,
						arrCus: [exDate],
					},
				]);
				expect(viewRes).toStrictEqual([
					{
						id: 1,
						name: 'First',
						createdAt: exDate,
						createdAtStr: exDateStr,
						arrCreatedAt: [exDate],
						arrCreatedAtStr: [exDateStr],
						max: exDate,
						maxStr: exDateStr,
						arrMax: [exDate],
						arrMaxStr: [exDateStr],
						sq: exDate,
						cus: exDate,
						arrCus: [exDate],
					},
				]);

				expect(customCast).toBeTruthy();
				expect(customMap).toBeTruthy();

				expect(nested).toStrictEqual(
					{
						id: 1,
						name: 'First',
						createdAt: exDate,
						createdAtStr: exDateStr,
						arrCreatedAt: [exDate],
						arrCreatedAtStr: [exDateStr],
						max: exDate,
						maxStr: exDateStr,
						arrMax: [exDate],
						arrMaxStr: [exDateStr],
						cus: exDate,
						arrCus: [exDate],
						self: {
							id: 1,
							name: 'First',
							createdAt: exDate,
							createdAtStr: exDateStr,
							arrCreatedAt: [exDate],
							arrCreatedAtStr: [exDateStr],
							max: exDate,
							maxStr: exDateStr,
							arrMax: [exDate],
							arrMaxStr: [exDateStr],
							cus: exDate,
							arrCus: [exDate],
						},
					},
				);
				expect(viewNested).toStrictEqual(
					{
						id: 1,
						name: 'First',
						createdAt: exDate,
						createdAtStr: exDateStr,
						arrCreatedAt: [exDate],
						arrCreatedAtStr: [exDateStr],
						max: exDate,
						maxStr: exDateStr,
						arrMax: [exDate],
						arrMaxStr: [exDateStr],
						cus: exDate,
						arrCus: [exDate],
						self: {
							id: 1,
							name: 'First',
							createdAt: exDate,
							createdAtStr: exDateStr,
							arrCreatedAt: [exDate],
							arrCreatedAtStr: [exDateStr],
							max: exDate,
							maxStr: exDateStr,
							arrMax: [exDate],
							arrMaxStr: [exDateStr],
							cus: exDate,
							arrCus: [exDate],
						},
					},
				);
			}));

		it.effect('db.execute modes', () =>
			Effect.gen(function*() {
				const db = yield* DB;

				const users = pgTable('users_execute_modes_1', (t) => ({
					id: t.integer().primaryKey(),
					name: t.text().notNull(),
				}));

				yield* push(db, { users });

				yield* db.insert(users).values([
					{
						id: 1,
						name: 'First',
					},
					{
						id: 2,
						name: 'Second',
					},
				]);

				const rObj = yield* db.execute<{ id: number; name: string }>(
					sql`select ${users.id}, ${users.name} from ${users} order by ${users.id}`,
					'objects',
				);
				const rArr = yield* db.execute<[number, string]>(
					sql`select ${users.id}, ${users.name} from ${users} order by ${users.id}`,
					'arrays',
				);

				expectTypeOf(rObj).toEqualTypeOf<{ id: number; name: string }[]>();
				expectTypeOf(rArr).toEqualTypeOf<[number, string][]>();

				expect(rObj).toStrictEqual([
					{
						id: 1,
						name: 'First',
					},
					{
						id: 2,
						name: 'Second',
					},
				]);
				expect(rArr).toStrictEqual([[1, 'First'], [2, 'Second']]);
			}));

		it.effect('insert with explicit column list', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const table = pgTable('column_selection', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
					verified: boolean('verified').notNull().default(false),
					note: text('note'),
				});

				yield* push(db, { table });

				yield* db.insert(table, 'name').values([{ name: 'John' }, { name: 'Jane' }]);
				yield* db.insert(table, 'name', 'note').values({ name: 'Jack' });
				yield* db.insert(table, 'note', 'name').values({ name: 'Jill', note: 'hi' });

				const result = yield* db.select().from(table).orderBy(table.id);
				expect(result).toEqual([
					{ id: 1, name: 'John', verified: false, note: null },
					{ id: 2, name: 'Jane', verified: false, note: null },
					{ id: 3, name: 'Jack', verified: false, note: null },
					{ id: 4, name: 'Jill', verified: false, note: 'hi' },
				]);
			}));

		it.effect('insert with explicit column list - select', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const src = pgTable('column_selection_select_src', {
					id: integer('id').primaryKey(),
					name: text('name').notNull(),
				});
				const dst = pgTable('column_selection_select_dst', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
					verified: boolean('verified').notNull().default(false),
				});

				yield* push(db, { src, dst });

				yield* db.insert(src).values([{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]);

				yield* db.insert(dst, 'name').select(db.select({ name: src.name }).from(src).orderBy(src.id));

				const result = yield* db.select().from(dst).orderBy(dst.id);
				expect(result).toEqual([
					{ id: 1, name: 'John', verified: false },
					{ id: 2, name: 'Jane', verified: false },
				]);
			}));

		it.effect('insert with explicit column list - on conflict', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const table = pgTable('column_selection_conflict', {
					id: integer('id').primaryKey(),
					name: text('name').notNull(),
					note: text('note'),
				});

				yield* push(db, { table });

				yield* db.insert(table, 'id', 'name').values({ id: 1, name: 'John' });
				yield* db
					.insert(table, 'id', 'name')
					.values({ id: 1, name: 'Jane' })
					.onConflictDoUpdate({ target: table.id, set: { name: 'Updated' } });

				const result = yield* db.select().from(table);
				expect(result).toEqual([{ id: 1, name: 'Updated', note: null }]);
			}));

		it.effect('transaction with options (set isolationLevel)', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const users = pgTable('users_tx_cfg_iso_ef', {
					id: serial('id').primaryKey(),
					balance: integer('balance').notNull(),
				});
				const products = pgTable('products_tx_cfg_iso_ef', {
					id: serial('id').primaryKey(),
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
					}), { isolationLevel: 'serializable' });

				expect(yield* db.select().from(users)).toEqual([{ id: 1, balance: 90 }]);
			}));

		it.effect('transaction with options (accessMode read only)', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const users = pgTable('users_tx_cfg_ro_ef', {
					id: serial('id').primaryKey(),
					balance: integer('balance').notNull(),
				});

				yield* push(db, { users });
				yield* db.insert(users).values({ balance: 100 });

				const res = yield* db.transaction((tx) => tx.insert(users).values({ balance: 200 }), {
					accessMode: 'read only',
				}).pipe(Effect.result);

				assert(Result.isFailure(res));
				expect(failureMessage(res.failure)).toContain('read-only transaction');

				const read = yield* db.transaction((tx) => tx.select().from(users), { accessMode: 'read only' });
				expect(read).toEqual([{ id: 1, balance: 100 }]);
			}));

		it.effect('transaction with options (deferrable)', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const users = pgTable('users_tx_cfg_deferrable_ef', {
					id: serial('id').primaryKey(),
					balance: integer('balance').notNull(),
				});

				yield* push(db, { users });
				yield* db.insert(users).values({ balance: 100 });

				const read = yield* db.transaction((tx) => tx.select().from(users), {
					isolationLevel: 'serializable',
					accessMode: 'read only',
					deferrable: true,
				});
				expect(read).toEqual([{ id: 1, balance: 100 }]);

				const notDeferrable = yield* db.transaction((tx) => tx.select().from(users), {
					isolationLevel: 'serializable',
					accessMode: 'read only',
					deferrable: false,
				});
				expect(notDeferrable).toEqual([{ id: 1, balance: 100 }]);
			}));

		it.effect('transaction with an empty options object', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const users = pgTable('users_tx_cfg_empty_ef', {
					id: serial('id').primaryKey(),
					balance: integer('balance').notNull(),
				});

				yield* push(db, { users });
				yield* db.insert(users).values({ balance: 100 });

				const read = yield* db.transaction((tx) => tx.select().from(users), {});
				expect(read).toEqual([{ id: 1, balance: 100 }]);
			}));

		it.effect('transaction snapshot: rejects a malformed id', () =>
			Effect.gen(function*() {
				const db = yield* DB;

				const res = yield* db.transaction(() => Effect.void, {
					isolationLevel: 'repeatable read',
					snapshot: 'not-a-snapshot',
				}).pipe(Effect.result);

				assert(Result.isFailure(res));
				expect(failureMessage(res.failure)).toContain('invalid snapshot identifier: "not-a-snapshot"');
			}));

		it.effect('transaction snapshot: does not let the id inject SQL', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const table = pgTable('tx_snapshot_injection_ef', { id: integer('id').primaryKey() });

				yield* push(db, { table });

				const payload = `x'; drop table tx_snapshot_injection_ef; --`;
				const res = yield* db.transaction(() => Effect.void, {
					isolationLevel: 'repeatable read',
					snapshot: payload,
				}).pipe(Effect.result);

				assert(Result.isFailure(res));
				expect(failureMessage(res.failure)).toContain(`invalid snapshot identifier: "${payload}"`);

				expect(yield* db.select().from(table)).toEqual([]);
			}));

		addTests?.(it);
	});
};

export { relations } from './relations';
export { rqbPost, rqbUser } from './schema';
