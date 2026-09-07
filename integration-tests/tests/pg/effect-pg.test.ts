import { PgClient } from '@effect/sql-pg';
import { assert, expect, expectTypeOf, it } from '@effect/vitest';
import {
	defineRelations,
	ExtractTablesFromSchema,
	getColumns,
	inArray,
	RelationsBuilder,
	RelationsBuilderConfig,
	Schema,
	sql,
} from 'drizzle-orm';
import * as PgDrizzle from 'drizzle-orm/effect-postgres';
import { migrate } from 'drizzle-orm/effect-postgres/migrator';
import { getTableConfig, integer, pgEnum, pgTable, serial, text } from 'drizzle-orm/pg-core';
import { PgEffectSession } from 'drizzle-orm/pg-core/effect/session';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Predicate from 'effect/Predicate';
import * as Redacted from 'effect/Redacted';
import * as Result from 'effect/Result';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { Client as PgPeerClient } from 'pg';
import { randomString } from '~/utils';
import { AllTypes, allTypesData, assertAllTypesBounds, assertAllTypesUnions, makeAllTypesColumns } from './all-types';
import { DB, push, runCommonEffectPgTests } from './effect-common';
import { relations } from './relations';
import { usersMigratorTable } from './schema';
import { normalizeDataWithDbCodecs } from './utils';

const makeAllTypesNoMtx = <TTable extends string, TEnum extends string>(tableName: TTable, enumName: TEnum) => {
	const en = pgEnum(enumName, ['enVal1', 'enVal2']);
	const { mtxbytea: _, ...columns } = makeAllTypesColumns(en);
	const allTypesTable = pgTable(tableName, columns);
	return { en, allTypesTable };
};
type AllTypesNoMtx = Omit<AllTypes, 'mtxbytea'>;
const { mtxbytea: _, ...allTypesDataNoMtx } = allTypesData;

const connectionStr = Redacted.make(
	process.env['PG_CONNECTION_STRING'] ?? 'postgres://postgres:postgres@localhost:55433/drizzle',
);
const PgClientLive = PgClient.layer({
	url: connectionStr,
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
	createDB: createDB as any,
	usedSchema,
	// @effect/sql-pg can't decode multidimensional arrays
	skipTests: ['all types', 'all types ~codecs~'],
	addTests: (it) => {
		it.effect('all types - no multidimensional arrays', () =>
			Effect.gen(function*() {
				const { en, allTypesTable } = makeAllTypesNoMtx('all_types_48_ef', 'en_48_ef');

				const db = yield* DB;
				yield* push(db, { en, allTypesTable });

				yield* db.insert(allTypesTable).values(allTypesDataNoMtx);

				const rawRes = yield* db.select().from(allTypesTable);

				expectTypeOf(rawRes).toEqualTypeOf<AllTypesNoMtx[]>();
				expect(rawRes).toStrictEqual([allTypesDataNoMtx]);
			}));

		it.effect('all types ~codecs~ - no multidimensional arrays', () =>
			Effect.gen(function*() {
				const { en, allTypesTable } = makeAllTypesNoMtx('all_types_cdc_ef', 'en_48');

				const db = yield* DB;
				yield* push(db, { en, allTypesTable });

				yield* db.insert(allTypesTable).values(allTypesDataNoMtx);
				const session = (<any> db).session as PgEffectSession;

				const queryRes = yield* session.objects<AllTypesNoMtx>(
					db.select().from(allTypesTable).getSQL(true),
				).pipe(
					Effect.map((e) =>
						normalizeDataWithDbCodecs({
							db,
							columns: getColumns(allTypesTable),
							data: e,
							mode: 'query',
						})[0]
					),
				);

				const relDb = yield* createDB({ allTypesTable }, (r) => ({
					allTypesTable: {
						self: r.many.allTypesTable({
							from: r.allTypesTable.serial,
							to: r.allTypesTable.serial,
						}),
					},
				}));

				const { relationRes, rootRes } = yield* session.objects<AllTypesNoMtx & { self: AllTypesNoMtx[] }>(
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

				expect(queryRes).toStrictEqual(allTypesDataNoMtx);
				expect(relationRes).toStrictEqual(allTypesDataNoMtx);
				expect(rootRes).toStrictEqual(allTypesDataNoMtx);

				const context = yield* Effect.context<never>();
				yield* Effect.promise(() =>
					assertAllTypesUnions(relDb as any, allTypesTable as any, (query) => Effect.runPromiseWith(context)(query))
				);
				yield* Effect.promise(() =>
					assertAllTypesBounds(relDb as any, (query) => Effect.runPromiseWith(context)(query))
				);
			}));

		it.effect('scalar enums preserve enum SQL semantics', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const state = pgEnum('enum_state', ['pending', 'done']);
				const items = pgTable('enum_items', { state: state() });

				yield* db.execute(sql`create type enum_state as enum ('pending', 'done')`);
				yield* db.execute(sql`create table enum_items (state enum_state)`);

				expect(yield* db.insert(items).values([{ state: 'pending' }, { state: null }]).returning())
					.toEqual([{ state: 'pending' }, { state: null }]);

				const selection = db.select().from(items);
				expect(yield* selection).toEqual([{ state: 'pending' }, { state: null }]);
				expect(yield* db.select().from(items).where(inArray(items.state, db.select().from(items))))
					.toEqual([{ state: 'pending' }]);
				expect(yield* db.selectDistinct().from(items).orderBy(items.state))
					.toEqual([{ state: 'pending' }, { state: null }]);
				expect(yield* db.update(items).set({ state: 'done' }).returning())
					.toEqual([{ state: 'done' }, { state: 'done' }]);
				expect(yield* db.delete(items).returning()).toEqual([{ state: 'done' }, { state: 'done' }]);
			}));

		it.effect('transaction snapshot: isolates the transaction', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const table = sql.identifier('ef_snapshot');

				const peerClient = new PgPeerClient(Redacted.value(connectionStr));
				yield* Effect.promise(() => peerClient.connect());
				const peerQuery = (query: string) => Effect.promise(() => peerClient.query(query).then((r) => r.rows));

				const body = Effect.gen(function*() {
					yield* db.execute(sql`drop table if exists ${table}`);
					yield* db.execute(sql`create table ${table} (id integer)`);
					yield* db.execute(sql`insert into ${table} values (1)`);

					yield* peerQuery('begin isolation level repeatable read');
					const [{ snapshot }] = yield* peerQuery('select pg_export_snapshot() as snapshot');

					yield* db.execute(sql`insert into ${table} values (2)`);

					yield* db.transaction((tx) =>
						Effect.gen(function*() {
							const res = yield* tx.execute<{ id: number }>(sql`select id from ${table} order by id`, 'objects');
							expect(res).toEqual([{ id: 1 }]);
						}), { isolationLevel: 'repeatable read', snapshot });

					yield* db.transaction((tx) =>
						Effect.gen(function*() {
							const res = yield* tx.execute<{ id: number }>(sql`select id from ${table} order by id`, 'objects');
							expect(res).toEqual([{ id: 1 }, { id: 2 }]);
						}), { isolationLevel: 'repeatable read' });
				});

				const cleanup = Effect.gen(function*() {
					yield* Effect.promise(() => peerClient.query('commit').catch(() => null));
					yield* db.execute(sql`drop table ${table}`).pipe(Effect.ignore);
				});

				yield* body.pipe(
					Effect.ensuring(cleanup),
					Effect.ensuring(Effect.promise(() => peerClient.end())),
				);
			}));

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
	},
});
