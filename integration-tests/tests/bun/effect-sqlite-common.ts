/// <reference types="bun-types" />

import { afterAll, beforeAll, describe, expect, expectTypeOf, test } from 'bun:test';
import { assert } from 'chai';
import {
	and,
	asc,
	count,
	eq,
	getTableName,
	gt,
	gte,
	inArray,
	is,
	lt,
	makeDefaultQueryMapper,
	makeDefaultRqbMapper,
	makeJitQueryMapper,
	makeJitRqbMapper,
	SQL,
	sql,
} from 'drizzle-orm';
import { EffectLogger, type EffectLoggerShape, QueryEffectHKTBase } from 'drizzle-orm/effect-core';
import {
	EmptyRelations,
	ExtractTablesFromSchema,
	ExtractTablesWithRelations,
	RelationsBuilder,
	RelationsBuilderConfig,
	Schema,
} from 'drizzle-orm/relations';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import {
	alias,
	blob,
	customType,
	except,
	getTableConfig,
	getViewConfig,
	integer,
	numeric,
	primaryKey,
	real,
	SQLiteDialect,
	SQLiteTable,
	sqliteTable,
	SQLiteView,
	text,
	union,
} from 'drizzle-orm/sqlite-core';
import type { SQLiteEffectDatabase } from 'drizzle-orm/sqlite-core/effect/db';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Layer from 'effect/Layer';
import * as Predicate from 'effect/Predicate';
import * as Result from 'effect/Result';
import * as Scope from 'effect/Scope';
import { SqlClient } from 'effect/sql/SqlClient';
import { SqlError } from 'effect/sql/SqlError';
import { jsonRows, parseStoredJson } from '~/json-values';
import type { AllTypes } from '../sqlite/all-types';
import {
	allTypesData,
	allTypesInput,
	assertAllTypesBounds,
	assertAllTypesTemporalBounds,
	assertAllTypesUnions,
	makeAllTypes,
} from '../sqlite/all-types';
import relations from '../sqlite/relations';
import { rqbPost, rqbUser } from '../sqlite/schema';

export class DB
	extends Context.Service<DB, SQLiteEffectDatabase<any, any, typeof relations>>()('CommonEffectSQLiteDB')
{}

/**
 * Minimal replica of drizzle-kit's `diff`, just enough for `push` to create and
 * drop `SQLiteTable`s and `SQLiteView`s. drizzle-kit's mocks can't be imported
 * under `bun test` (its `drizzle-orm` dependency fails to resolve), so we render
 * the DDL directly from the drizzle table/view metadata instead.
 */
const dialect = new SQLiteDialect();
const sqlToString = (chunk: SQL) => dialect.sqlToQuery(chunk.inlineParams()).sql;
const { escapeName } = dialect;

const buildColumn = (column: AnySQLiteColumn): string => {
	const parts = [escapeName(column.name), column.getSQLType()];

	if (column.primary) {
		parts.push('PRIMARY KEY');
		if ((column as { autoIncrement?: boolean }).autoIncrement) parts.push('AUTOINCREMENT');
	}
	if (column.notNull) parts.push('NOT NULL');
	if (column.default !== undefined) {
		const value = sqlToString(sql`${column.default}`);
		parts.push(`DEFAULT ${value}`);
	}
	if (column.isUnique) parts.push('UNIQUE');
	if (column.generated) {
		const { as, mode } = column.generated;
		const expr = typeof as === 'function' ? as() : as;
		parts.push(`GENERATED ALWAYS AS (${sqlToString(expr as SQL)}) ${mode === 'stored' ? 'STORED' : 'VIRTUAL'}`);
	}

	return parts.join(' ');
};

const buildCreateTable = (table: SQLiteTable): string => {
	const config = getTableConfig(table);
	const defs = config.columns.map(buildColumn);

	for (const pk of config.primaryKeys) {
		defs.push(`PRIMARY KEY (${pk.columns.map((c) => escapeName(c.name)).join(', ')})`);
	}
	for (const uq of config.uniqueConstraints) {
		defs.push(`UNIQUE (${uq.columns.map((c) => escapeName(c.name)).join(', ')})`);
	}
	for (const fk of config.foreignKeys) {
		const ref = fk.reference();
		const cols = ref.columns.map((c) => escapeName(c.name)).join(', ');
		const fcols = ref.foreignColumns.map((c) => escapeName(c.name)).join(', ');
		let clause = `FOREIGN KEY (${cols}) REFERENCES ${escapeName(getTableConfig(ref.foreignTable).name)} (${fcols})`;
		if (fk.onUpdate) clause += ` ON UPDATE ${fk.onUpdate}`;
		if (fk.onDelete) clause += ` ON DELETE ${fk.onDelete}`;
		defs.push(clause);
	}
	for (const check of config.checks) {
		defs.push(`CONSTRAINT ${escapeName(check.name)} CHECK (${sqlToString(check.value)})`);
	}

	return `CREATE TABLE ${escapeName(config.name)} (${defs.join(', ')})`;
};

const buildCreateView = (view: SQLiteView): string => {
	const { name, query } = getViewConfig(view);
	return `CREATE VIEW ${escapeName(name)} AS ${sqlToString(query!)}`;
};

export const push = (db: SQLiteEffectDatabase<any, any, any>, schema: Record<string, any>) =>
	Effect.gen(function*() {
		const tables: SQLiteTable[] = [];
		const views: SQLiteView[] = [];
		for (const value of Object.values(schema)) {
			if (is(value, SQLiteTable)) tables.push(value);
			else if (is(value, SQLiteView)) views.push(value);
		}

		for (const view of views) {
			yield* db.run(sql.raw(`DROP VIEW IF EXISTS ${escapeName(getViewConfig(view).name)}`));
		}
		for (const table of tables) {
			yield* db.run(sql.raw(`DROP TABLE IF EXISTS ${escapeName(getTableConfig(table).name)}`));
		}
		for (const table of tables) {
			yield* db.run(sql.raw(buildCreateTable(table)));
		}
		for (const view of views) {
			yield* db.run(sql.raw(buildCreateView(view)));
		}
	});

export interface EffectBunIt {
	effect: ((name: string, body: () => Effect.Effect<unknown, unknown, DB | SqlClient>) => void) & {
		skip: (name: string, body: () => Effect.Effect<unknown, unknown, DB | SqlClient>) => void;
	};
}

export interface RunCommonEffectSQLiteTestsOptions {
	testLayer: Layer.Layer<DB | SqlClient, SqlError, never>;
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
	addTests?: (it: EffectBunIt) => void;
}

export const runCommonEffectSQLiteTests = (opts: RunCommonEffectSQLiteTestsOptions): void => {
	const { testLayer, addTests, skipTests = [], SQLiteDrizzle, createDB } = opts;

	const scope = Effect.runSync(Scope.make());
	const contextEffect = Layer.buildWithMemoMap(testLayer, Effect.runSync(Layer.makeMemoMap), scope).pipe(
		Effect.orDie,
		Effect.cached,
		Effect.runSync,
	);

	const run = (body: () => Effect.Effect<unknown, unknown, DB | SqlClient>) =>
		Effect.runPromise(
			Effect.flatMap(contextEffect, (context) => Effect.suspend(body).pipe(Effect.scoped, Effect.provide(context))),
		);

	const it: EffectBunIt = {
		effect: Object.assign(
			(name: string, body: () => Effect.Effect<unknown, unknown, DB | SqlClient>) => {
				if (skipTests.includes(name)) return test.skip(name, () => {});
				return test(name, () => run(body));
			},
			{
				skip: (name: string, _body: () => Effect.Effect<unknown, unknown, DB | SqlClient>) => test.skip(name, () => {}),
			},
		),
	};

	describe('common', () => {
		beforeAll(() => Effect.runPromise(Effect.asVoid(contextEffect)));
		afterAll(() => Effect.runPromise(Scope.close(scope, Exit.void)));

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
				const allTypesTable = makeAllTypes('all_types');

				const db = yield* DB;
				yield* push(db, { allTypesTable });

				yield* db.insert(allTypesTable).values(allTypesInput);

				const rawRes = yield* db.select().from(allTypesTable);

				expectTypeOf(rawRes).toEqualTypeOf<AllTypes[]>();
				expect(rawRes).toStrictEqual([allTypesData]);

				const context = yield* Effect.context<never>();
				const run = (query: any) => Effect.runPromiseWith(context)(query);

				yield* Effect.promise(() => assertAllTypesUnions(db as any, allTypesTable, run));
				yield* Effect.promise(() => assertAllTypesBounds(db as any, { run }));
				yield* Effect.promise(() => assertAllTypesTemporalBounds(db as any, { run }));
			}));

		it.effect('all types ~json~', () =>
			Effect.gen(function*() {
				const table = sqliteTable('all_types_json', {
					id: integer('id').primaryKey(),
					jsonText: text('jsonText', { mode: 'json' }),
					jsonBlob: blob('jsonBlob', { mode: 'json' }),
				});

				const db = yield* DB;
				yield* db.run(sql`drop table if exists ${table}`);
				yield* push(db, { table });

				const { input, output } = jsonRows(['jsonText', 'jsonBlob']);

				yield* db.insert(table).values(input);

				// json text as the database stores it, read without decoding
				const stored = yield* db.select({
					id: table.id,
					jsonText: sql<string>`cast(${table.jsonText} as text)`,
					jsonBlob: sql<string>`cast(${table.jsonBlob} as text)`,
				}).from(table).orderBy(table.id);

				expect(yield* db.select().from(table).orderBy(table.id)).toStrictEqual(output);
				expect(parseStoredJson(stored)).toStrictEqual(output);
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

		it.effect('Mappers: - correct mappers enabled', () =>
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

		const jsonObjectUsers = [{
			id: 1,
			name: 'First',
			bio: null,
			createdAt: mappersDate,
			meta: { tags: ['a', 'b'] },
		}, {
			id: 2,
			name: 'Second',
			bio: 'About',
			createdAt: mappersDate,
			meta: null,
		}];

		const jsonObjectPosts = [
			{ id: 1, authorId: 1, title: 'P1' },
			{ id: 2, authorId: 1, title: 'P2' },
			{ id: 3, authorId: null, title: 'Orphan' },
		];

		for (const jit of [false, true]) {
			it.effect(`Mappers: simple select - no rows${jit ? ' - Jit mappers' : ''}`, () =>
				Effect.gen(function*() {
					const users = sqliteTable((jit ? 'jit_mappers_users_1' : 'mappers_users_1') as 'mappers_users_1', (t) => ({
						id: t.numeric('id', { mode: 'number' }).primaryKey(),
						name: t.text('name').notNull(),
						createdAt: t.integer('created_at', {
							mode: 'timestamp_ms',
						}).notNull(),
						isBanned: t.integer('is_banned', { mode: 'boolean' }),
					}));

					const db = yield* createDB({}, () => ({}), jit);
					yield* push(db, { users });

					const result = yield* db.select().from(users);

					expect(result).toStrictEqual([]);
				}));

			it.effect(`Mappers: select - nothing to decode - text${jit ? ' - Jit mappers' : ''}`, () =>
				Effect.gen(function*() {
					const users = sqliteTable((jit ? 'jit_mappers_users_2' : 'mappers_users_2') as 'mappers_users_2', (t) => ({
						id: t.numeric('id', { mode: 'number' }).primaryKey(),
						name: t.text('name').notNull(),
						createdAt: t.integer('created_at', {
							mode: 'timestamp_ms',
						}).notNull(),
						isBanned: t.integer('is_banned', { mode: 'boolean' }),
					}));

					const db = yield* createDB({}, () => ({}), jit);
					yield* push(db, { users });

					yield* db.insert(users).values([{
						id: 1,
						name: 'First',
						createdAt: mappersDate,
					}]).returning();

					const selected = yield* db.select({ name: users.name }).from(users);

					expect(selected).toStrictEqual([{ name: 'First' }]);
				}));

			it.effect(`Mappers: select - nothing to decode - null${jit ? ' - Jit mappers' : ''}`, () =>
				Effect.gen(function*() {
					const users = sqliteTable((jit ? 'jit_mappers_users_3' : 'mappers_users_3') as 'mappers_users_3', (t) => ({
						id: t.numeric('id', { mode: 'number' }).primaryKey(),
						name: t.text('name').notNull(),
						createdAt: t.integer('created_at', {
							mode: 'timestamp_ms',
						}).notNull(),
						isBanned: t.integer('is_banned', { mode: 'boolean' }),
					}));

					const db = yield* createDB({}, () => ({}), jit);
					yield* push(db, { users });

					yield* db.insert(users).values([{
						id: 1,
						name: 'First',
						createdAt: mappersDate,
					}]).returning();

					const selected = yield* db.select({ isBanned: users.isBanned }).from(users);

					expect(selected).toStrictEqual([{ isBanned: null }]);
				}));

			it.effect(`Mappers: insert returning all + select + update returning + delete returning${jit ? ' - Jit mappers' : ''}`, () =>
				Effect.gen(function*() {
					const users = sqliteTable((jit ? 'jit_mappers_users_4' : 'mappers_users_4') as 'mappers_users_4', (t) => ({
						id: t.numeric('id', { mode: 'number' }).primaryKey(),
						name: t.text('name').notNull(),
						createdAt: t.integer('created_at', {
							mode: 'timestamp_ms',
						}).notNull(),
						isBanned: t.integer('is_banned', { mode: 'boolean' }),
					}));

					const db = yield* createDB({}, () => ({}), jit);
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

			it.effect(`Mappers: select complex selections${jit ? ' - Jit mappers' : ''}`, () =>
				Effect.gen(function*() {
					const users = sqliteTable((jit ? 'jit_mappers_users_5' : 'mappers_users_5') as 'mappers_users_5', (t) => ({
						id: t.numeric('id', { mode: 'number' }).primaryKey(),
						name: t.text('name').notNull(),
						createdAt: t.integer('created_at', {
							mode: 'timestamp_ms',
						}).notNull(),
						isBanned: t.integer('is_banned', { mode: 'boolean' }),
					}));

					const posts = sqliteTable((jit ? 'jit_mappers_posts_1' : 'mappers_posts_1') as 'mappers_posts_1', (t) => ({
						id: t.integer('id').primaryKey(),
						authorId: t.numeric('author_id', { mode: 'number' }).references(() => users.id),
						content: t.text('content'),
					}));

					const db = yield* createDB({}, () => ({}), jit);
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

			it.effect(`Mappers: relational${jit ? ' - Jit mappers' : ''}`, () =>
				Effect.gen(function*() {
					const users = sqliteTable((jit ? 'jit_mappers_users_6' : 'mappers_users_6') as 'mappers_users_6', (t) => ({
						id: t.numeric('id', { mode: 'number' }).primaryKey(),
						name: t.text('name').notNull(),
						createdAt: t.integer('created_at', {
							mode: 'timestamp_ms',
						}).notNull(),
						isBanned: t.integer('is_banned', { mode: 'boolean' }),
					}));

					const posts = sqliteTable((jit ? 'jit_mappers_posts_2' : 'mappers_posts_2') as 'mappers_posts_2', (t) => ({
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
						jit,
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

			it.effect(`Mappers - JsonObject: field kinds${jit ? ' - Jit mappers' : ''}`, () =>
				Effect.gen(function*() {
					const users = sqliteTable((jit ? 'jo_kinds_users_jit' : 'jo_kinds_users') as 'jo_kinds_users', (t) => ({
						id: t.integer('id').primaryKey(),
						name: t.text('name').notNull(),
						bio: t.text('bio'),
						createdAt: t.integer('created_at', { mode: 'timestamp_ms' }).notNull(),
						meta: t.text('meta', { mode: 'json' }).$type<{ tags: string[] }>(),
					}));
					const posts = sqliteTable((jit ? 'jo_kinds_posts_jit' : 'jo_kinds_posts') as 'jo_kinds_posts', (t) => ({
						id: t.integer('id').primaryKey(),
						authorId: t.integer('author_id'),
						title: t.text('title').notNull(),
					}));

					const db = yield* createDB({ users, posts }, () => ({}), jit);
					yield* push(db, { users, posts });
					yield* db.insert(users).values(jsonObjectUsers);
					yield* db.insert(posts).values(jsonObjectPosts);

					const res = yield* db.select({
						id: users.id,
						object: sql.jsonObject({
							id: users.id,
							name: users.name,
							bio: users.bio,
							createdAt: users.createdAt,
							meta: users.meta,
							upperName: sql<string>`upper(${users.name})`.as('upper_name'),
							doubleId: sql`${users.id} * 2`.mapWith(Number),
							mappedCreatedAt: sql`${users.createdAt}`.mapWith(users.createdAt),
							postCount: db.select({ count: count().as('count') }).from(posts).where(eq(posts.authorId, users.id)).as(
								'post_count',
							),
							nested: sql.jsonObject({
								createdAt: users.createdAt,
								deeper: sql.jsonObject({ name: users.name, meta: users.meta }),
							}),
						}),
						aliased: sql.jsonObject({ name: users.name, createdAt: users.createdAt }).as('aliased'),
						table: sql.jsonObject(users),
					}).from(users).orderBy(users.id);

					expectTypeOf(res).toEqualTypeOf<{
						id: number;
						object: {
							id: number;
							name: string;
							bio: string | null;
							createdAt: Date;
							meta: { tags: string[] } | null;
							upperName: string;
							doubleId: number;
							mappedCreatedAt: Date;
							postCount: number | null;
							nested: {
								createdAt: Date;
								deeper: { name: string; meta: { tags: string[] } | null };
							};
						};
						aliased: { name: string; createdAt: Date };
						table: {
							id: number;
							name: string;
							bio: string | null;
							createdAt: Date;
							meta: { tags: string[] } | null;
						};
					}[]>();

					expect(res).toStrictEqual([{
						id: 1,
						object: {
							id: 1,
							name: 'First',
							bio: null,
							createdAt: mappersDate,
							meta: { tags: ['a', 'b'] },
							upperName: 'FIRST',
							doubleId: 2,
							mappedCreatedAt: mappersDate,
							postCount: 2,
							nested: {
								createdAt: mappersDate,
								deeper: { name: 'First', meta: { tags: ['a', 'b'] } },
							},
						},
						aliased: { name: 'First', createdAt: mappersDate },
						table: jsonObjectUsers[0]!,
					}, {
						id: 2,
						object: {
							id: 2,
							name: 'Second',
							bio: 'About',
							createdAt: mappersDate,
							meta: null,
							upperName: 'SECOND',
							doubleId: 4,
							mappedCreatedAt: mappersDate,
							postCount: 0,
							nested: {
								createdAt: mappersDate,
								deeper: { name: 'Second', meta: null },
							},
						},
						aliased: { name: 'Second', createdAt: mappersDate },
						table: jsonObjectUsers[1]!,
					}]);

					const empty = yield* db.select({
						empty: sql.jsonObject({}),
						nested: sql.jsonObject({ empty: sql.jsonObject({}) }),
						inArray: sql.jsonArray(sql.jsonObject({})),
					}).from(users).where(eq(users.id, 1));

					expectTypeOf(empty).toEqualTypeOf<{ empty: {}; nested: { empty: {} }; inArray: {}[] }[]>();
					expect(empty).toStrictEqual([{ empty: {}, nested: { empty: {} }, inArray: [{}] }]);

					// Aggregates in objects are computed over the query's groups
					const aggregated = yield* db.select({
						id: users.id,
						stats: sql.jsonObject({ count: count(posts.id), titles: sql.jsonArray(posts.title) }),
					}).from(users).leftJoin(posts, eq(posts.authorId, users.id)).groupBy(users.id).orderBy(users.id);

					expectTypeOf(aggregated).toEqualTypeOf<
						{ id: number; stats: { count: number; titles: (string | null)[] } }[]
					>();
					// Order of aggregated elements is up to the database
					expect(aggregated.map((row) => ({ ...row, stats: { ...row.stats, titles: [...row.stats.titles].sort() } })))
						.toStrictEqual([
							{ id: 1, stats: { count: 2, titles: ['P1', 'P2'] } },
							{ id: 2, stats: { count: 0, titles: [null] } },
						]);

					// Legacy custom column JSON api, used both directly and as a decoder of an expression
					const customText = customType<{ data: string; driverData: string; jsonData: string }>({
						dataType: () => 'text',
						forJsonSelect: (identifier, sql) => sql`upper(${identifier})`,
						fromJson: (value) => `json:${value}`,
					});
					const customs = sqliteTable((jit ? 'jo_kinds_custom_jit' : 'jo_kinds_custom') as 'jo_kinds_custom', {
						value: customText('value').notNull(),
					});

					yield* push(db, { customs });
					yield* db.insert(customs).values({ value: 'nick' });

					const customRes = yield* db.select({
						plain: customs.value,
						object: sql.jsonObject({
							direct: customs.value,
							mapped: sql`${customs.value}`.mapWith(customs.value),
						}),
					}).from(customs);

					expectTypeOf(customRes).toEqualTypeOf<{ plain: string; object: { direct: string; mapped: string } }[]>();
					expect(customRes).toStrictEqual([{ plain: 'nick', object: { direct: 'json:NICK', mapped: 'json:NICK' } }]);
				}));

			it.effect(`Mappers - JsonObject: join nullability${jit ? ' - Jit mappers' : ''}`, () =>
				Effect.gen(function*() {
					const users = sqliteTable((jit ? 'jo_joins_users_jit' : 'jo_joins_users') as 'jo_joins_users', (t) => ({
						id: t.integer('id').primaryKey(),
						name: t.text('name').notNull(),
						bio: t.text('bio'),
						createdAt: t.integer('created_at', { mode: 'timestamp_ms' }).notNull(),
						meta: t.text('meta', { mode: 'json' }).$type<{ tags: string[] }>(),
					}));
					const posts = sqliteTable((jit ? 'jo_joins_posts_jit' : 'jo_joins_posts') as 'jo_joins_posts', (t) => ({
						id: t.integer('id').primaryKey(),
						authorId: t.integer('author_id'),
						title: t.text('title').notNull(),
					}));

					const db = yield* createDB({ users, posts }, () => ({}), jit);
					yield* push(db, { users, posts });
					yield* db.insert(users).values(jsonObjectUsers);
					yield* db.insert(posts).values(jsonObjectPosts);

					const left = yield* db.select({
						post: sql.jsonObject({ id: posts.id, title: posts.title }),
						author: sql.jsonObject({ id: users.id, name: users.name, bio: users.bio }),
						aliased: sql.jsonObject({ name: users.name, createdAt: users.createdAt }).as('aliased'),
					}).from(posts).leftJoin(users, eq(users.id, posts.authorId)).orderBy(posts.id);

					expectTypeOf(left).toEqualTypeOf<{
						post: { id: number; title: string };
						author: { id: number | null; name: string | null; bio: string | null };
						aliased: { name: string | null; createdAt: Date | null };
					}[]>();

					expect(left).toStrictEqual([{
						post: { id: 1, title: 'P1' },
						author: { id: 1, name: 'First', bio: null },
						aliased: { name: 'First', createdAt: mappersDate },
					}, {
						post: { id: 2, title: 'P2' },
						author: { id: 1, name: 'First', bio: null },
						aliased: { name: 'First', createdAt: mappersDate },
					}, {
						post: { id: 3, title: 'Orphan' },
						author: { id: null, name: null, bio: null },
						aliased: { name: null, createdAt: null },
					}]);

					const right = yield* db.select({
						post: sql.jsonObject({ id: posts.id, title: posts.title }),
						author: sql.jsonObject({ id: users.id, name: users.name }),
					}).from(posts).rightJoin(users, eq(users.id, posts.authorId)).orderBy(users.id, posts.id);

					expectTypeOf(right).toEqualTypeOf<{
						post: { id: number | null; title: string | null };
						author: { id: number; name: string };
					}[]>();

					expect(right).toStrictEqual([{
						post: { id: 1, title: 'P1' },
						author: { id: 1, name: 'First' },
					}, {
						post: { id: 2, title: 'P2' },
						author: { id: 1, name: 'First' },
					}, {
						post: { id: null, title: null },
						author: { id: 2, name: 'Second' },
					}]);

					const inner = yield* db.select({
						post: sql.jsonObject({ title: posts.title }),
						author: sql.jsonObject({ name: users.name }),
					}).from(posts).innerJoin(users, eq(users.id, posts.authorId)).orderBy(posts.id);

					expectTypeOf(inner).toEqualTypeOf<{
						post: { title: string };
						author: { name: string };
					}[]>();

					expect(inner).toStrictEqual([
						{ post: { title: 'P1' }, author: { name: 'First' } },
						{ post: { title: 'P2' }, author: { name: 'First' } },
					]);

					const full = yield* db.select({
						post: sql.jsonObject({ title: posts.title }),
						author: sql.jsonObject({ name: users.name }),
					}).from(posts).fullJoin(users, eq(users.id, posts.authorId)).orderBy(posts.id, users.id);

					expectTypeOf(full).toEqualTypeOf<{
						post: { title: string | null };
						author: { name: string | null };
					}[]>();

					expect(full).toStrictEqual([
						{ post: { title: null }, author: { name: 'Second' } },
						{ post: { title: 'P1' }, author: { name: 'First' } },
						{ post: { title: 'P2' }, author: { name: 'First' } },
						{ post: { title: 'Orphan' }, author: { name: null } },
					]);
				}));

			it.effect(`Mappers - JsonObject: automatic selection${jit ? ' - Jit mappers' : ''}`, () =>
				Effect.gen(function*() {
					const users = sqliteTable((jit ? 'jo_auto_users_jit' : 'jo_auto_users') as 'jo_auto_users', (t) => ({
						id: t.integer('id').primaryKey(),
						name: t.text('name').notNull(),
						bio: t.text('bio'),
						createdAt: t.integer('created_at', { mode: 'timestamp_ms' }).notNull(),
						meta: t.text('meta', { mode: 'json' }).$type<{ tags: string[] }>(),
					}));
					const posts = sqliteTable((jit ? 'jo_auto_posts_jit' : 'jo_auto_posts') as 'jo_auto_posts', (t) => ({
						id: t.integer('id').primaryKey(),
						authorId: t.integer('author_id'),
						title: t.text('title').notNull(),
					}));

					const db = yield* createDB({ users, posts }, () => ({}), jit);
					yield* push(db, { users, posts });
					yield* db.insert(users).values(jsonObjectUsers);
					yield* db.insert(posts).values(jsonObjectPosts);

					const sq = db.select({
						id: users.id,
						profile: sql.jsonObject({ name: users.name, createdAt: users.createdAt, meta: users.meta }).as('profile'),
					}).from(users).as('sq');

					const fromSubquery = yield* db.select().from(sq).orderBy(sq.id);

					expectTypeOf(fromSubquery).toEqualTypeOf<{
						id: number;
						profile: { name: string; createdAt: Date; meta: { tags: string[] } | null };
					}[]>();

					expect(fromSubquery).toStrictEqual([
						{ id: 1, profile: { name: 'First', createdAt: mappersDate, meta: { tags: ['a', 'b'] } } },
						{ id: 2, profile: { name: 'Second', createdAt: mappersDate, meta: null } },
					]);

					const joined = yield* db.select().from(posts).leftJoin(sq, eq(sq.id, posts.authorId)).orderBy(posts.id);

					expectTypeOf(joined).toEqualTypeOf<{
						jo_auto_posts: { id: number; authorId: number | null; title: string };
						sq: {
							id: number;
							profile: { name: string; createdAt: Date; meta: { tags: string[] } | null };
						} | null;
					}[]>();

					expect(joined).toStrictEqual([{
						[getTableName(posts)]: jsonObjectPosts[0]!,
						sq: { id: 1, profile: { name: 'First', createdAt: mappersDate, meta: { tags: ['a', 'b'] } } },
					}, {
						[getTableName(posts)]: jsonObjectPosts[1]!,
						sq: { id: 1, profile: { name: 'First', createdAt: mappersDate, meta: { tags: ['a', 'b'] } } },
					}, {
						[getTableName(posts)]: jsonObjectPosts[2]!,
						sq: null,
					}]);
				}));

			it.effect(`Mappers - JsonObject: selection from subquery${jit ? ' - Jit mappers' : ''}`, () =>
				Effect.gen(function*() {
					const users = sqliteTable((jit ? 'jo_sq_users_jit' : 'jo_sq_users') as 'jo_sq_users', (t) => ({
						id: t.integer('id').primaryKey(),
						name: t.text('name').notNull(),
						bio: t.text('bio'),
						createdAt: t.integer('created_at', { mode: 'timestamp_ms' }).notNull(),
						meta: t.text('meta', { mode: 'json' }).$type<{ tags: string[] }>(),
					}));
					const posts = sqliteTable((jit ? 'jo_sq_posts_jit' : 'jo_sq_posts') as 'jo_sq_posts', (t) => ({
						id: t.integer('id').primaryKey(),
						authorId: t.integer('author_id'),
						title: t.text('title').notNull(),
					}));

					const db = yield* createDB({ users, posts }, () => ({}), jit);
					yield* push(db, { users, posts });
					yield* db.insert(users).values(jsonObjectUsers);
					yield* db.insert(posts).values(jsonObjectPosts);

					const sq = db.select({
						id: posts.id,
						title: posts.title,
						author: sql.jsonObject({ id: users.id, name: users.name, createdAt: users.createdAt }).as('author'),
					}).from(posts).leftJoin(users, eq(users.id, posts.authorId)).as('sq');

					const res = yield* db.select({
						title: sq.title,
						author: sq.author,
						wrapped: sql.jsonObject({ title: sq.title, author: sq.author }),
					}).from(sq).orderBy(sq.id);

					expectTypeOf(res).toEqualTypeOf<{
						title: string;
						author: { id: number | null; name: string | null; createdAt: Date | null };
						wrapped: {
							title: string;
							author: { id: number | null; name: string | null; createdAt: Date | null };
						};
					}[]>();

					const first = { id: 1, name: 'First', createdAt: mappersDate };
					const none = { id: null, name: null, createdAt: null };
					expect(res).toStrictEqual([
						{ title: 'P1', author: first, wrapped: { title: 'P1', author: first } },
						{ title: 'P2', author: first, wrapped: { title: 'P2', author: first } },
						{ title: 'Orphan', author: none, wrapped: { title: 'Orphan', author: none } },
					]);

					const unaliased = db.select({ object: sql.jsonObject({ id: users.id }) }).from(users).as('unaliased');
					expect(() => unaliased.object).toThrowError(
						'You tried to reference "object" field from a subquery, which is an un-aliased JSON object field. Please add an alias to the field using ".as(\'alias\')" method.',
					);
				}));

			it.effect(`Mappers - JsonObject: selection from $with subquery${jit ? ' - Jit mappers' : ''}`, () =>
				Effect.gen(function*() {
					const users = sqliteTable((jit ? 'jo_with_users_jit' : 'jo_with_users') as 'jo_with_users', (t) => ({
						id: t.integer('id').primaryKey(),
						name: t.text('name').notNull(),
						bio: t.text('bio'),
						createdAt: t.integer('created_at', { mode: 'timestamp_ms' }).notNull(),
						meta: t.text('meta', { mode: 'json' }).$type<{ tags: string[] }>(),
					}));
					const posts = sqliteTable((jit ? 'jo_with_posts_jit' : 'jo_with_posts') as 'jo_with_posts', (t) => ({
						id: t.integer('id').primaryKey(),
						authorId: t.integer('author_id'),
						title: t.text('title').notNull(),
					}));

					const db = yield* createDB({ users, posts }, () => ({}), jit);
					yield* push(db, { users, posts });
					yield* db.insert(users).values(jsonObjectUsers);
					yield* db.insert(posts).values(jsonObjectPosts);

					const w = db.$with('w').as(
						db.select({
							id: users.id,
							profile: sql.jsonObject({ name: users.name, meta: users.meta }).as('profile'),
						}).from(users),
					);

					const all = yield* db.with(w).select().from(w).orderBy(w.id);

					expectTypeOf(all).toEqualTypeOf<{
						id: number;
						profile: { name: string; meta: { tags: string[] } | null };
					}[]>();

					expect(all).toStrictEqual([
						{ id: 1, profile: { name: 'First', meta: { tags: ['a', 'b'] } } },
						{ id: 2, profile: { name: 'Second', meta: null } },
					]);

					const joined = yield* db.with(w).select({
						title: posts.title,
						profile: w.profile,
						wrapped: sql.jsonObject({ title: posts.title, profile: w.profile }),
					}).from(posts).leftJoin(w, eq(w.id, posts.authorId)).orderBy(posts.id);

					expectTypeOf(joined).toEqualTypeOf<{
						title: string;
						profile: { name: string; meta: { tags: string[] } | null } | null;
						wrapped: {
							title: string;
							profile: { name: string; meta: { tags: string[] } | null } | null;
						};
					}[]>();

					const first = { name: 'First', meta: { tags: ['a', 'b'] } };
					expect(joined).toStrictEqual([
						{ title: 'P1', profile: first, wrapped: { title: 'P1', profile: first } },
						{ title: 'P2', profile: first, wrapped: { title: 'P2', profile: first } },
						{ title: 'Orphan', profile: null, wrapped: { title: 'Orphan', profile: null } },
					]);
				}));

			it.effect(`Mappers - JsonObject: joined subquery${jit ? ' - Jit mappers' : ''}`, () =>
				Effect.gen(function*() {
					const users = sqliteTable(
						(jit ? 'jo_joined_sq_users_jit' : 'jo_joined_sq_users') as 'jo_joined_sq_users',
						(t) => ({
							id: t.integer('id').primaryKey(),
							name: t.text('name').notNull(),
							bio: t.text('bio'),
							createdAt: t.integer('created_at', { mode: 'timestamp_ms' }).notNull(),
							meta: t.text('meta', { mode: 'json' }).$type<{ tags: string[] }>(),
						}),
					);
					const posts = sqliteTable(
						(jit ? 'jo_joined_sq_posts_jit' : 'jo_joined_sq_posts') as 'jo_joined_sq_posts',
						(t) => ({
							id: t.integer('id').primaryKey(),
							authorId: t.integer('author_id'),
							title: t.text('title').notNull(),
						}),
					);

					const db = yield* createDB({ users, posts }, () => ({}), jit);
					yield* push(db, { users, posts });
					yield* db.insert(users).values(jsonObjectUsers);
					yield* db.insert(posts).values(jsonObjectPosts);

					const first = { id: 1, name: 'First', createdAt: mappersDate };

					const sq = db.select({
						id: users.id,
						author: sql.jsonObject({ id: users.id, name: users.name, createdAt: users.createdAt }).as('author'),
					}).from(users).as('sq');

					const left = yield* db.select({
						title: posts.title,
						author: sq.author,
						wrapped: sql.jsonObject({ title: posts.title, author: sq.author }),
					}).from(posts).leftJoin(sq, eq(sq.id, posts.authorId)).orderBy(posts.id);

					expectTypeOf(left).toEqualTypeOf<{
						title: string;
						author: { id: number; name: string; createdAt: Date } | null;
						wrapped: { title: string; author: { id: number; name: string; createdAt: Date } | null };
					}[]>();

					expect(left).toStrictEqual([
						{ title: 'P1', author: first, wrapped: { title: 'P1', author: first } },
						{ title: 'P2', author: first, wrapped: { title: 'P2', author: first } },
						{ title: 'Orphan', author: null, wrapped: { title: 'Orphan', author: null } },
					]);

					const inner = yield* db.select({
						title: posts.title,
						author: sq.author,
					}).from(posts).innerJoin(sq, eq(sq.id, posts.authorId)).orderBy(posts.id);

					expectTypeOf(inner).toEqualTypeOf<{
						title: string;
						author: { id: number; name: string; createdAt: Date };
					}[]>();

					expect(inner).toStrictEqual([
						{ title: 'P1', author: first },
						{ title: 'P2', author: first },
					]);

					const authorOf = db.select({
						author: sql.jsonObject({ id: users.id, name: users.name, createdAt: users.createdAt }).as('author'),
					}).from(users).where(eq(users.id, posts.authorId)).as('author');

					const scalar = yield* db.select({
						title: posts.title,
						author: authorOf,
						// JSON of correlated subquery embedded into JSON
						wrapped: sql.jsonObject({ author: authorOf }),
					}).from(posts).orderBy(posts.id);

					expectTypeOf(scalar).toEqualTypeOf<{
						title: string;
						author: { id: number; name: string; createdAt: Date } | null;
						wrapped: { author: { id: number; name: string; createdAt: Date } | null };
					}[]>();

					expect(scalar).toStrictEqual([
						{ title: 'P1', author: first, wrapped: { author: first } },
						{ title: 'P2', author: first, wrapped: { author: first } },
						{ title: 'Orphan', author: null, wrapped: { author: null } },
					]);

					// Objects of joined subqueries are `null` as a whole when the join has no match
					const nestedSq = db.select({
						id: posts.id,
						object: sql.jsonObject({ title: posts.title, author: sq.author }).as('object'),
					}).from(posts).leftJoin(sq, eq(sq.id, posts.authorId)).as('nested_sq');

					const nested = yield* db.select({ post: nestedSq.object }).from(nestedSq).orderBy(nestedSq.id);

					expectTypeOf(nested).toEqualTypeOf<{
						post: { title: string; author: { id: number; name: string; createdAt: Date } | null };
					}[]>();

					expect(nested).toStrictEqual([
						{ post: { title: 'P1', author: first } },
						{ post: { title: 'P2', author: first } },
						{ post: { title: 'Orphan', author: null } },
					]);

					const reselectedSq = db.select({
						id: posts.id,
						author: sq.author,
					}).from(posts).leftJoin(sq, eq(sq.id, posts.authorId)).as('reselected_sq');

					const reselected = yield* db.select().from(reselectedSq).orderBy(reselectedSq.id);

					expectTypeOf(reselected).toEqualTypeOf<{
						id: number;
						author: { id: number; name: string; createdAt: Date } | null;
					}[]>();

					expect(reselected).toStrictEqual([
						{ id: 1, author: first },
						{ id: 2, author: first },
						{ id: 3, author: null },
					]);

					const stats = yield* db.select({
						id: users.id,
						wrapped: sql.jsonObject({
							stats: db.select({ stats: sql.jsonObject({ count: count() }).as('stats') }).from(posts).where(
								eq(posts.authorId, users.id),
							).as('stats'),
						}),
					}).from(users).orderBy(users.id);

					expectTypeOf(stats).toEqualTypeOf<{ id: number; wrapped: { stats: { count: number } | null } }[]>();

					expect(stats).toStrictEqual([
						{ id: 1, wrapped: { stats: { count: 2 } } },
						{ id: 2, wrapped: { stats: { count: 0 } } },
					]);

					// Arrays in objects: aggregated by correlated subqueries, selected from subqueries and from joined subqueries
					const correlatedArrays = yield* db.select({
						id: users.id,
						object: sql.jsonObject({
							titles: db.select({ titles: sql.jsonArray(posts.title).as('titles') }).from(posts).where(
								eq(posts.authorId, users.id),
							).as('titles'),
						}),
					}).from(users).orderBy(users.id);

					expectTypeOf(correlatedArrays).toEqualTypeOf<{ id: number; object: { titles: string[] | null } }[]>();
					// Order of aggregated elements is up to the database
					expect(
						correlatedArrays.map((row) => ({
							id: row.id,
							object: { titles: row.object.titles && [...row.object.titles].sort() },
						})),
					)
						.toStrictEqual([
							{ id: 1, object: { titles: ['P1', 'P2'] } },
							{ id: 2, object: { titles: [] } },
						]);

					const titlesSq = db.select({
						id: users.id,
						titles: sql.jsonArray(posts.title).as('titles'),
					}).from(users).leftJoin(posts, eq(posts.authorId, users.id)).groupBy(users.id).as('titles_sq');

					const storedArrays = yield* db.select({
						id: titlesSq.id,
						object: sql.jsonObject({ titles: titlesSq.titles }),
					}).from(titlesSq).orderBy(titlesSq.id);

					expectTypeOf(storedArrays).toEqualTypeOf<{ id: number; object: { titles: (string | null)[] } }[]>();
					// Order of aggregated elements is up to the database
					expect(storedArrays.map((row) => ({ id: row.id, object: { titles: [...row.object.titles].sort() } })))
						.toStrictEqual([
							{ id: 1, object: { titles: ['P1', 'P2'] } },
							{ id: 2, object: { titles: [null] } },
						]);

					// Arrays of joined subqueries are `null` as a whole when the join has no match
					const authorTitles = db.select({
						authorId: posts.authorId,
						array: sql.jsonArray(posts.title).as('array'),
					}).from(posts).groupBy(posts.authorId).as('author_titles');

					const joinedArrays = yield* db.select({
						id: users.id,
						object: sql.jsonObject({ titles: authorTitles.array }),
					}).from(users).leftJoin(authorTitles, eq(authorTitles.authorId, users.id)).orderBy(users.id);

					expectTypeOf(joinedArrays).toEqualTypeOf<{ id: number; object: { titles: string[] | null } }[]>();
					expect(
						joinedArrays.map((row) => ({
							id: row.id,
							object: { titles: row.object.titles && [...row.object.titles].sort() },
						})),
					)
						.toStrictEqual([
							{ id: 1, object: { titles: ['P1', 'P2'] } },
							{ id: 2, object: { titles: null } },
						]);
				}));

			it.effect(`Mappers - JsonArray: field kinds${jit ? ' - Jit mappers' : ''}`, () =>
				Effect.gen(function*() {
					const users = sqliteTable((jit ? 'ja_kinds_users_jit' : 'ja_kinds_users') as 'ja_kinds_users', (t) => ({
						id: t.integer('id').primaryKey(),
						name: t.text('name').notNull(),
						bio: t.text('bio'),
						createdAt: t.integer('created_at', { mode: 'timestamp_ms' }).notNull(),
						meta: t.text('meta', { mode: 'json' }).$type<{ tags: string[] }>(),
					}));
					const posts = sqliteTable((jit ? 'ja_kinds_posts_jit' : 'ja_kinds_posts') as 'ja_kinds_posts', (t) => ({
						id: t.integer('id').primaryKey(),
						authorId: t.integer('author_id'),
						title: t.text('title').notNull(),
					}));

					const db = yield* createDB({ users, posts }, () => ({}), jit);
					yield* push(db, { users, posts });
					yield* db.insert(users).values(jsonObjectUsers);
					yield* db.insert(posts).values(jsonObjectPosts);

					const res = yield* db.select({
						ids: sql.jsonArray(users.id),
						bios: sql.jsonArray(users.bio),
						createdAts: sql.jsonArray(users.createdAt),
						metas: sql.jsonArray(users.meta),
						doubled: sql.jsonArray(sql`${users.id} * 2`.mapWith(Number)),
						mapped: sql.jsonArray(sql`${users.createdAt}`.mapWith(users.createdAt)).as('mapped'),
						objects: sql.jsonArray(sql.jsonObject({
							id: users.id,
							createdAt: users.createdAt,
							nested: sql.jsonObject({ meta: users.meta }),
						})),
						aliased: sql.jsonArray(users.name).as('aliased'),
					}).from(users);

					expectTypeOf(res).toEqualTypeOf<{
						ids: number[];
						bios: (string | null)[];
						createdAts: Date[];
						metas: ({ tags: string[] } | null)[];
						doubled: number[];
						mapped: Date[];
						objects: { id: number; createdAt: Date; nested: { meta: { tags: string[] } | null } }[];
						aliased: string[];
					}[]>();

					expect(res).toStrictEqual([{
						ids: [1, 2],
						bios: [null, 'About'],
						createdAts: [mappersDate, mappersDate],
						metas: [{ tags: ['a', 'b'] }, null],
						doubled: [2, 4],
						mapped: [mappersDate, mappersDate],
						objects: [
							{ id: 1, createdAt: mappersDate, nested: { meta: { tags: ['a', 'b'] } } },
							{ id: 2, createdAt: mappersDate, nested: { meta: null } },
						],
						aliased: ['First', 'Second'],
					}]);

					// Rows of groups without joined matches aggregate to `null` elements
					const grouped = yield* db.select({
						id: users.id,
						titles: sql.jsonArray(posts.title),
					}).from(users).leftJoin(posts, eq(posts.authorId, users.id)).groupBy(users.id).orderBy(users.id);

					expectTypeOf(grouped).toEqualTypeOf<{ id: number; titles: (string | null)[] }[]>();
					// Order of aggregated elements is up to the database
					expect(grouped.map((row) => ({ ...row, titles: [...row.titles].sort() }))).toStrictEqual([
						{ id: 1, titles: ['P1', 'P2'] },
						{ id: 2, titles: [null] },
					]);

					const empty = yield* db.select({ ids: sql.jsonArray(users.id) }).from(users).where(eq(users.id, 0));

					expectTypeOf(empty).toEqualTypeOf<{ ids: number[] }[]>();
					expect(empty).toStrictEqual([{ ids: [] }]);

					// Legacy custom column JSON api, used both directly and as a decoder of an expression
					const customText = customType<{ data: string; driverData: string; jsonData: string }>({
						dataType: () => 'text',
						forJsonSelect: (identifier, sql) => sql`upper(${identifier})`,
						fromJson: (value) => `json:${value}`,
					});
					const customs = sqliteTable((jit ? 'ja_kinds_custom_jit' : 'ja_kinds_custom') as 'ja_kinds_custom', {
						value: customText('value').notNull(),
					});

					yield* push(db, { customs });
					yield* db.insert(customs).values({ value: 'nick' });

					const customRes = yield* db.select({
						direct: sql.jsonArray(customs.value),
						mapped: sql.jsonArray(sql`${customs.value}`.mapWith(customs.value)).as('mapped'),
					}).from(customs);

					expectTypeOf(customRes).toEqualTypeOf<{ direct: string[]; mapped: string[] }[]>();
					expect(customRes).toStrictEqual([{ direct: ['json:NICK'], mapped: ['json:NICK'] }]);
				}));

			it.effect(`Mappers - JsonArray: subqueries${jit ? ' - Jit mappers' : ''}`, () =>
				Effect.gen(function*() {
					const users = sqliteTable((jit ? 'ja_sq_users_jit' : 'ja_sq_users') as 'ja_sq_users', (t) => ({
						id: t.integer('id').primaryKey(),
						name: t.text('name').notNull(),
						bio: t.text('bio'),
						createdAt: t.integer('created_at', { mode: 'timestamp_ms' }).notNull(),
						meta: t.text('meta', { mode: 'json' }).$type<{ tags: string[] }>(),
					}));
					const posts = sqliteTable((jit ? 'ja_sq_posts_jit' : 'ja_sq_posts') as 'ja_sq_posts', (t) => ({
						id: t.integer('id').primaryKey(),
						authorId: t.integer('author_id'),
						title: t.text('title').notNull(),
					}));

					const db = yield* createDB({ users, posts }, () => ({}), jit);
					yield* push(db, { users, posts });
					yield* db.insert(users).values(jsonObjectUsers);
					yield* db.insert(posts).values(jsonObjectPosts);

					const scalar = yield* db.select({
						id: users.id,
						posts: db.select({
							posts: sql.jsonArray(sql.jsonObject({ id: posts.id, title: posts.title })).as('posts'),
						}).from(posts).where(eq(posts.authorId, users.id)).as('posts'),
					}).from(users).orderBy(users.id);

					expectTypeOf(scalar).toEqualTypeOf<{
						id: number;
						posts: { id: number; title: string }[] | null;
					}[]>();

					// Order of aggregated elements is up to the database
					expect(scalar.map((row) => ({ id: row.id, posts: row.posts && [...row.posts].sort((a, b) => a.id - b.id) })))
						.toStrictEqual([{
							id: 1,
							posts: [{ id: 1, title: 'P1' }, { id: 2, title: 'P2' }],
						}, {
							id: 2,
							posts: [],
						}]);

					const sq = db.select({
						id: users.id,
						titles: sql.jsonArray(posts.title).as('titles'),
					}).from(users).leftJoin(posts, eq(posts.authorId, users.id)).groupBy(users.id).as('sq');

					const fromSubquery = yield* db.select({
						id: sq.id,
						titles: sq.titles,
					}).from(sq).orderBy(sq.id);

					expectTypeOf(fromSubquery).toEqualTypeOf<{ id: number; titles: (string | null)[] }[]>();

					// Order of aggregated elements is up to the database
					expect(fromSubquery.map((row) => ({ id: row.id, titles: [...row.titles].sort() }))).toStrictEqual([
						{ id: 1, titles: ['P1', 'P2'] },
						{ id: 2, titles: [null] },
					]);

					const nested = yield* db.select({ all: sql.jsonArray(sq.titles) }).from(sq).where(eq(sq.id, 1));

					expectTypeOf(nested).toEqualTypeOf<{ all: (string | null)[][] }[]>();
					expect(nested.map((row) => ({ all: row.all.map((titles) => [...titles].sort()) }))).toStrictEqual([{
						all: [['P1', 'P2']],
					}]);

					// Arrays of joined subqueries are `null` as a whole when the join has no match
					const titles = db.select({
						authorId: posts.authorId,
						array: sql.jsonArray(posts.title).as('array'),
					}).from(posts).groupBy(posts.authorId).as('titles');

					const joinedTitles = yield* db.select({
						id: users.id,
						titles: titles.array,
					}).from(users).leftJoin(titles, eq(titles.authorId, users.id)).orderBy(users.id);

					expectTypeOf(joinedTitles).toEqualTypeOf<{ id: number; titles: string[] | null }[]>();

					// Order of aggregated elements is up to the database
					expect(joinedTitles.map((row) => ({ id: row.id, titles: row.titles && [...row.titles].sort() })))
						.toStrictEqual([
							{ id: 1, titles: ['P1', 'P2'] },
							{ id: 2, titles: null },
						]);

					const reselectedTitlesSq = db.select({
						id: users.id,
						titles: titles.array,
					}).from(users).leftJoin(titles, eq(titles.authorId, users.id)).as('reselected_titles');

					const reselectedTitles = yield* db.select().from(reselectedTitlesSq).orderBy(reselectedTitlesSq.id);

					expectTypeOf(reselectedTitles).toEqualTypeOf<{ id: number; titles: string[] | null }[]>();
					expect(reselectedTitles.map((row) => ({ id: row.id, titles: row.titles && [...row.titles].sort() })))
						.toStrictEqual([
							{ id: 1, titles: ['P1', 'P2'] },
							{ id: 2, titles: null },
						]);

					const unaliased = db.select({ titles: sql.jsonArray(users.name) }).from(users).as('unaliased');
					expect(() => unaliased.titles).toThrowError(
						'You tried to reference "titles" field from a subquery, which is an un-aliased JSON array field. Please add an alias to the field using ".as(\'alias\')" method.',
					);
				}));
		}

		// https://github.com/drizzle-team/drizzle-orm/issues/5001
		// https://github.com/drizzle-team/drizzle-orm/issues/5309
		it.effect('insert with explicit column list', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const table = sqliteTable('column_selection', {
					id: integer('id').primaryKey({ autoIncrement: true }),
					name: text('name').notNull(),
					verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
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

		// https://github.com/drizzle-team/drizzle-orm/issues/5001
		// https://github.com/drizzle-team/drizzle-orm/issues/5309
		it.effect('insert with explicit column list - select', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const src = sqliteTable('column_selection_select_src', {
					id: integer('id').primaryKey(),
					name: text('name').notNull(),
				});
				const dst = sqliteTable('column_selection_select_dst', {
					id: integer('id').primaryKey({ autoIncrement: true }),
					name: text('name').notNull(),
					verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
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

		// https://github.com/drizzle-team/drizzle-orm/issues/5001
		// https://github.com/drizzle-team/drizzle-orm/issues/5309
		it.effect('insert with explicit column list - on conflict', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const table = sqliteTable('column_selection_conflict', {
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

		it.effect('Default value priority', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const exTbl = sqliteTable('no_default_override', (t) => ({
					id: t.integer().primaryKey(),
					defSql: t.integer().default(sql`1`),
					defNum: t.integer().default(1),
					defFn: t.integer().$defaultFn(() => 1),
					defUpdFn: t.integer().$onUpdateFn(() => 1),
					defMix1: t.integer().default(1).$defaultFn(() => 2).$onUpdateFn(() => 3),
					defMix2: t.integer().$defaultFn(() => 2).$onUpdateFn(() => 3),
					defMix3: t.integer().default(1).$defaultFn(() => 2),
					defMix4: t.integer().default(sql`1`).$onUpdateFn(() => 3),
				}));

				yield* push(db, { exTbl });

				yield* db.insert(exTbl).values({ id: 1 });

				const res = yield* db.select().from(exTbl);

				expect(res).toStrictEqual([{
					id: 1,
					defSql: 1,
					defNum: 1,
					defFn: 1,
					defUpdFn: 1,
					defMix1: 2,
					defMix2: 2,
					defMix3: 2,
					defMix4: 1,
				}]);
			}));

		// https://github.com/drizzle-team/drizzle-orm/issues/5939
		it.effect('Query error params', () =>
			Effect.gen(function*() {
				const query = sql`select * from params_in_errors_missing where id = ${'S3CRET'}`;

				for (const paramsInErrors of [undefined, false, true]) {
					const db = yield* SQLiteDrizzle.make({ paramsInErrors }).pipe(Effect.provide(SQLiteDrizzle.DefaultServices));

					for (
						const effect of [
							db.get(query),
							db.all(query),
							db.run(query),
							db.values(query),
						]
					) {
						const error: any = yield* effect.pipe(Effect.flip);

						expect(error._tag).toBe('EffectDrizzleQueryError');
						expect(error.params).toStrictEqual(paramsInErrors ? ['S3CRET'] : undefined);
						expect(error.message).toBe(
							paramsInErrors ? `Failed query: ${error.query}\nparams: S3CRET` : `Failed query: ${error.query}`,
						);
					}
				}
			}));

		// https://github.com/drizzle-team/drizzle-orm/issues/5939
		it.effect('Query error params - transaction', () =>
			Effect.gen(function*() {
				const query = sql`select * from params_in_errors_missing where id = ${'S3CRET'}`;

				for (const paramsInErrors of [undefined, false, true]) {
					const db = yield* SQLiteDrizzle.make({ paramsInErrors }).pipe(Effect.provide(SQLiteDrizzle.DefaultServices));

					for (
						const effect of [
							db.transaction((tx) => tx.get(query)),
							db.transaction((tx) => tx.all(query)),
							db.transaction((tx) => tx.run(query)),
							db.transaction((tx) => tx.values(query)),
						]
					) {
						const error: any = yield* effect.pipe(Effect.flip);

						expect(error._tag).toBe('EffectDrizzleQueryError');
						expect(error.params).toStrictEqual(paramsInErrors ? ['S3CRET'] : undefined);
						expect(error.message).toBe(
							paramsInErrors ? `Failed query: ${error.query}\nparams: S3CRET` : `Failed query: ${error.query}`,
						);
					}
				}
			}));

		addTests?.(it);
	});
};
