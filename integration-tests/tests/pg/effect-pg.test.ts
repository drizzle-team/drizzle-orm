import { PgClient } from '@effect/sql-pg';
import { assert, expect, it } from '@effect/vitest';
import {
	defineRelations,
	ExtractTablesFromSchema,
	RelationsBuilder,
	RelationsBuilderConfig,
	Schema,
	sql,
} from 'drizzle-orm';
import * as PgDrizzle from 'drizzle-orm/effect-postgres';
import { migrate } from 'drizzle-orm/effect-postgres/migrator';
import { getTableConfig, integer, pgTable, serial, text } from 'drizzle-orm/pg-core';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Predicate from 'effect/Predicate';
import * as Redacted from 'effect/Redacted';
import * as Result from 'effect/Result';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { randomString } from '~/utils';
import { DB, runCommonEffectPgTests } from './effect-common.test';
import { relations } from './relations';
import { usersMigratorTable } from './schema';

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

let _diff!: (_: {}, schema: Record<string, unknown>, renames: []) => Promise<{ sqlStatements: string[] }>;
const getDiff = async () => {
	return _diff ??= (await import('../../../drizzle-kit/tests/postgres/mocks' as string)).diff;
};

const push = (schema: Record<string, any>) =>
	Effect.gen(function*() {
		const db = yield* DB;
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

const usedSchema = 'effect_pg_test';

runCommonEffectPgTests({
	testLayer: TestLive,
	push: push as (schema: Record<string, any>) => Effect.Effect<void, any, any>,
	PgDrizzle: PgDrizzle,
	createDB: createDB as any,
	usedSchema,
}, it);

it.layer(TestLive)((it) => {
	// Run setup before each test
	const _effect = it.effect;
	const effect: typeof it.effect = Object.assign(
		(name: string, fn: () => Effect.Effect<any, any, any>, timeout?: number) =>
			_effect(name, () =>
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
			expect((res[0]?.count ?? 0) > 0).toBeTruthy();

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

			const r1 = yield* migrate(db, { migrationsFolder: './drizzle2/pg', migrationsTable: customTable });

			// test if the custom migrations table was created
			const res = yield* db.execute<{ count: number }>(
				sql`select count(*) as ${sql.identifier('count')} from ${sql.identifier('drizzle')}.${
					sql.identifier(customTable)
				} limit 1;`,
			);
			expect((res[0]?.count ?? 0) > 0).toBeTruthy();

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
			expect((res[0]?.count ?? 0) > 0).toBeTruthy();

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
			expect(res[0]?.['tableExists']).toStrictEqual(false);
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
			expect(res[0]?.['tableExists']).toStrictEqual(false);
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
			expect(res[0]?.['tableExists']).toStrictEqual(true);
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
});
