import { PgliteClient } from '@effect/sql-pglite';
import { assert, expect } from '@effect/vitest';
import { postgis } from '@electric-sql/pglite-postgis';
import { vector } from '@electric-sql/pglite/vector';
import {
	defineRelations,
	ExtractTablesFromSchema,
	getColumns,
	RelationsBuilder,
	RelationsBuilderConfig,
	Schema,
	sql,
} from 'drizzle-orm';
import * as PgDrizzle from 'drizzle-orm/effect-pglite';
import { migrate } from 'drizzle-orm/effect-pglite/migrator';
import { getTableConfig, integer, pgTable, serial, text } from 'drizzle-orm/pg-core';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Predicate from 'effect/Predicate';
import * as Result from 'effect/Result';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { randomString } from '~/utils';
import { push } from './effect-common';
import { DB, runCommonEffectPgTests } from './effect-common';
import { relations } from './relations';
import { usersMigratorTable } from './schema';
import { normalizeDataWithDbCodecs } from './utils';

const PgClientLive = PgliteClient.layer({
	dataDir: 'memory://',
	extensions: {
		postgis,
		vector: vector as any, // works and should work without `as any`
	},
});

const dbEffect = PgDrizzle.make({ relations }).pipe(Effect.provide(PgDrizzle.DefaultServices));
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
	useJitMappers?: boolean,
) =>
	PgDrizzle.make({ relations: defineRelations(schema, relations), jit: useJitMappers }).pipe(
		Effect.provide(PgDrizzle.DefaultServices),
	);

const TestLive = Layer.merge(PgClientLive, DBLive.pipe(Layer.provide(PgClientLive)));
const usedSchema = 'effect_pg_test';

runCommonEffectPgTests({
	testLayer: TestLive,
	PgDrizzle: PgDrizzle,
	createDB,
	usedSchema,
	addTests: (it) => {
		it.effect('execute', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const res = yield* db.execute<{ '1': 1 }>(sql`SELECT 1 as "1"`);

				expect(res.rows).toStrictEqual([{ '1': 1 }]);
			}));

		it.effect('migrator : default migration strategy', () =>
			Effect.gen(function*() {
				const db = yield* DB;

				yield* migrate(db, { migrationsFolder: './drizzle2/pg' });

				yield* db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });

				const result = yield* db.select().from(usersMigratorTable);

				expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);
			}));

		it.effect('migrator : migrate with custom schema', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const customSchema = randomString();

				yield* migrate(db, { migrationsFolder: './drizzle2/pg', migrationsSchema: customSchema });

				// test if the custom migrations table was created
				const res = yield* db.execute<{ count: number }>(
					sql`select count(*) as ${sql.identifier('count')} from ${sql.identifier(customSchema)}.${
						sql.identifier('__drizzle_migrations')
					} limit 1;`,
				);
				expect((res.rows[0]?.count ?? 0) > 0).toBeTruthy();

				// test if the migrated table are working as expected
				yield* db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
				const result = yield* db.select().from(usersMigratorTable);
				expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

				yield* db.execute(sql`DROP SCHEMA ${sql.identifier(customSchema)} CASCADE;`);
			}));

		it.effect('migrator : migrate with custom table', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const customTable = randomString();

				yield* migrate(db, { migrationsFolder: './drizzle2/pg', migrationsTable: customTable });

				// test if the custom migrations table was created
				const res = yield* db.execute<{ count: number }>(
					sql`select count(*) as ${sql.identifier('count')} from ${sql.identifier('drizzle')}.${
						sql.identifier(customTable)
					} limit 1;`,
				);
				expect((res.rows[0]?.count ?? 0) > 0).toBeTruthy();

				// test if the migrated table are working as expected
				yield* db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
				const result = yield* db.select().from(usersMigratorTable);
				expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);
			}));

		it.effect('migrator : migrate with custom table and custom schema', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const customTable = randomString();
				const customSchema = randomString();

				yield* migrate(db, {
					migrationsFolder: './drizzle2/pg',
					migrationsTable: customTable,
					migrationsSchema: customSchema,
				});

				// test if the custom migrations table was created
				const res = yield* db.execute<{ count: number }>(
					sql`select count(*) as ${sql.identifier('count')} from ${sql.identifier(customSchema)}.${
						sql.identifier(customTable)
					} limit 1;`,
				);
				expect((res.rows[0]?.count ?? 0) > 0).toBeTruthy();

				// test if the migrated table are working as expected
				yield* db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
				const result = yield* db.select().from(usersMigratorTable);
				expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

				yield* db.execute(sql`DROP SCHEMA ${sql.identifier(customSchema)} CASCADE;`);
			}));

		it.effect('migrator : --init', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const migrationsSchema = 'drzl_migrations_init';
				const migrationsTable = 'drzl_init';

				const migratorRes = yield* migrate(db, {
					migrationsFolder: './drizzle2/pg-init',
					migrationsTable,
					migrationsSchema,
					// @ts-ignore - internal param
					init: true,
				});

				const meta = yield* db.select({
					hash: sql<string>`${sql.identifier('hash')}`.as('hash'),
					createdAt: sql<number>`${sql.identifier('created_at')}`.mapWith(Number).as('created_at'),
				}).from(sql`${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`);

				const res = yield* db.execute<{ tableExists: boolean }>(sql`SELECT EXISTS (
						SELECT 1
						FROM pg_tables
						WHERE schemaname = ${getTableConfig(usersMigratorTable).schema ?? usedSchema} AND tablename = ${
					getTableConfig(usersMigratorTable).name
				}
					) as ${sql.identifier('tableExists')};`);

				expect(migratorRes).toStrictEqual(undefined);
				expect(meta.length).toStrictEqual(1);
				expect(res.rows[0]?.['tableExists']).toStrictEqual(false);
			}));

		it.effect('migrator : --init - local migrations error', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const migrationsSchema = 'drzl_migrations_init';
				const migrationsTable = 'drzl_init';

				const migratorRes = yield* migrate(db, {
					migrationsFolder: './drizzle2/pg',
					migrationsTable,
					migrationsSchema,
					// @ts-ignore - internal param
					init: true,
				}).pipe(Effect.result);

				const meta = yield* db.select({
					hash: sql<string>`${sql.identifier('hash')}`.as('hash'),
					createdAt: sql<number>`${sql.identifier('created_at')}`.mapWith(Number).as('created_at'),
				}).from(sql`${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`);

				const res = yield* db.execute<{ tableExists: boolean }>(sql`SELECT EXISTS (
						SELECT 1
						FROM pg_tables
						WHERE schemaname = ${getTableConfig(usersMigratorTable).schema ?? usedSchema} AND tablename = ${
					getTableConfig(usersMigratorTable).name
				}
					) as ${sql.identifier('tableExists')};`);

				assert(Result.isFailure(migratorRes));
				assert(Predicate.isTagged(migratorRes.failure, 'MigratorInitError'));
				expect(migratorRes.failure.exitCode).toBe('localMigrations');
				expect(meta.length).toStrictEqual(0);
				expect(res.rows[0]?.['tableExists']).toStrictEqual(false);
			}));

		it.effect('migrator : --init - db migrations error', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const migrationsSchema = 'drzl_migrations_init';
				const migrationsTable = 'drzl_init';

				yield* migrate(db, {
					migrationsFolder: './drizzle2/pg-init',
					migrationsSchema,
					migrationsTable,
				});

				const migratorRes = yield* migrate(db, {
					migrationsFolder: './drizzle2/pg',
					migrationsTable,
					migrationsSchema,
					// @ts-ignore - internal param
					init: true,
				}).pipe(Effect.result);

				const meta = yield* db.select({
					hash: sql<string>`${sql.identifier('hash')}`.as('hash'),
					createdAt: sql<number>`${sql.identifier('created_at')}`.mapWith(Number).as('created_at'),
				}).from(sql`${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`);

				const res = yield* db.execute<{ tableExists: boolean }>(sql`SELECT EXISTS (
						SELECT 1
						FROM pg_tables
						WHERE schemaname = ${getTableConfig(usersMigratorTable).schema ?? usedSchema} AND tablename = ${
					getTableConfig(usersMigratorTable).name
				}
					) as ${sql.identifier('tableExists')};`);

				assert(Result.isFailure(migratorRes));
				assert(Predicate.isTagged(migratorRes.failure, 'MigratorInitError'));
				expect(migratorRes.failure.exitCode).toBe('databaseMigrations');
				expect(meta.length).toStrictEqual(1);
				expect(res.rows[0]?.['tableExists']).toStrictEqual(true);
			}));

		it.effect('migrator : local migration is unapplied. Migrations timestamp is less than last db migration', () =>
			Effect.gen(function*() {
				const db = yield* DB;

				const users = pgTable('migration_users', {
					id: serial('id').primaryKey(),
					name: text().notNull(),
					email: text().notNull(),
					age: integer(),
				});

				const users2 = pgTable('migration_users2', {
					id: serial('id').primaryKey(),
					name: text().notNull(),
					email: text().notNull(),
					age: integer(),
				});

				yield* db.execute(sql`drop schema if exists "drizzle" cascade;`);
				yield* db.execute(sql`drop table if exists ${users}`);
				yield* db.execute(sql`drop table if exists ${users2}`);

				// create migration directory
				const migrationDir = './migrations/effect-sql';
				if (existsSync(migrationDir)) rmSync(migrationDir, { recursive: true });
				mkdirSync(migrationDir, { recursive: true });

				// first branch
				mkdirSync(`${migrationDir}/20240101010101_initial`, { recursive: true });
				writeFileSync(
					`${migrationDir}/20240101010101_initial/migration.sql`,
					`CREATE TABLE "migration_users" (\n"id" serial PRIMARY KEY NOT NULL,\n"name" text NOT NULL,\n"email" text NOT NULL\n);`,
				);
				mkdirSync(`${migrationDir}/20240303030303_third`, { recursive: true });
				writeFileSync(
					`${migrationDir}/20240303030303_third/migration.sql`,
					`ALTER TABLE "migration_users" ADD COLUMN "age" integer;`,
				);

				yield* migrate(db, { migrationsFolder: migrationDir });
				const res1 = yield* db.insert(users).values({ name: 'John', email: '', age: 30 }).returning();

				// second migration was not applied yet
				const insertResult = yield* db.insert(users2).values({ name: 'John', email: '', age: 30 }).pipe(Effect.result);
				assert(Result.isFailure(insertResult));
				assert(Predicate.isTagged(insertResult.failure, 'EffectDrizzleQueryError'));

				// insert migration with earlier timestamp
				mkdirSync(`${migrationDir}/20240202020202_second`, { recursive: true });
				writeFileSync(
					`${migrationDir}/20240202020202_second/migration.sql`,
					`CREATE TABLE "migration_users2" (\n"id" serial PRIMARY KEY NOT NULL,\n"name" text NOT NULL,\n"email" text NOT NULL\n,"age" integer\n);`,
				);
				yield* migrate(db, { migrationsFolder: migrationDir });

				const res2 = yield* db.insert(users2).values({ name: 'John', email: '', age: 30 }).returning();

				const expected = [{ id: 1, name: 'John', email: '', age: 30 }];
				expect(res1).toStrictEqual(expected);
				expect(res2).toStrictEqual(expected);

				rmSync(migrationDir, { recursive: true });
			}));

		it.effect('extension types ~codecs~', () =>
			Effect.gen(function*() {
				const allTypesTable = pgTable('extension_types', (t) => ({
					id: t.integer('id').primaryKey(),
					geo: t.geometry('geo'),
					arrgeo: t.geometry('arrgeo').array(),
					geoxy: t.geometry('geoxy', { mode: 'xy' }),
					arrgeoxy: t.geometry('arrgeoxy', { mode: 'xy' }).array(),
					bit: t.bit('bit', {
						dimensions: 3,
					}),
					arrbit: t.bit('arrbit', {
						dimensions: 3,
					}).array(),
					halfvec: t.halfvec('halfvec', {
						dimensions: 3,
					}),
					arrhalfvec: t.halfvec('arrhalfvec', {
						dimensions: 3,
					}).array(),
					vector: t.vector('vector', {
						dimensions: 3,
					}),
					arrvector: t.vector('arrvector', {
						dimensions: 3,
					}).array(),
					sparsevec: t.sparsevec('sparsevec', {
						dimensions: 5,
					}),
					arrsparsevec: t.sparsevec('arrsparsevec', {
						dimensions: 5,
					}).array(),
				}));

				const db = yield* createDB({ allTypesTable }, (r) => ({
					allTypesTable: {
						self: r.many.allTypesTable({
							from: r.allTypesTable.id,
							to: r.allTypesTable.id,
						}),
					},
				}));

				yield* db.execute(sql`CREATE EXTENSION IF NOT EXISTS postgis;`);
				yield* db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector;`);
				yield* db.execute(sql`DROP TABLE IF EXISTS ${allTypesTable} CASCADE;`);
				yield* push(db, { allTypesTable });

				yield* db.insert(allTypesTable).values({
					id: 1,
					geo: [15.23, 51.13],
					arrgeo: [[15.23, 51.13]],
					geoxy: { x: 15.23, y: 51.13 },
					arrgeoxy: [{ x: 15.23, y: 51.13 }],
					bit: '101',
					arrbit: ['101'],
					halfvec: [0.2, 3.5, 8.4],
					arrhalfvec: [[0.2, 3.5, 8.4]],
					vector: [1.9345, 2.8238, 12.3465],
					arrvector: [[1.9345, 2.8238, 12.3465]],
					sparsevec: '{1:1,3:2,5:3}/5',
					arrsparsevec: ['{1:1,3:2,5:3}/5'],
				});

				const queryRes = yield* db.execute<Record<string, any>>(db.select().from(allTypesTable)).pipe(Effect.map((e) =>
					normalizeDataWithDbCodecs({
						db,
						columns: getColumns(allTypesTable),
						data: (e as any).rows as Record<string, unknown>[],
						mode: 'query',
					})[0]
				));

				const { relationRes, rootRes } = yield* db.execute<Record<string, any>>(db.query.allTypesTable.findFirst({
					with: {
						self: true,
					},
				})).pipe(Effect.map((e) => {
					const [{ self: relationRaw, ...rootRaw }] = (e as any).rows;

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

				const expectedRes = {
					id: 1,
					geo: [15.23, 51.13],
					arrgeo: [[15.23, 51.13]],
					geoxy: { x: 15.23, y: 51.13 },
					arrgeoxy: [{ x: 15.23, y: 51.13 }],
					bit: '101',
					arrbit: ['101'],
					halfvec: [0.19995117, 3.5, 8.3984375],
					arrhalfvec: [[0.19995117, 3.5, 8.3984375]],
					vector: [1.9345, 2.8238, 12.3465],
					arrvector: [[1.9345, 2.8238, 12.3465]],
					sparsevec: '{1:1,3:2,5:3}/5',
					arrsparsevec: ['{1:1,3:2,5:3}/5'],
				};

				expect(queryRes).toStrictEqual(expectedRes);
				expect(relationRes).toStrictEqual(expectedRes);
				expect(rootRes).toStrictEqual(expectedRes);
			}));
	},
});
