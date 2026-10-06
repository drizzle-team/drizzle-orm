import { SqliteClient } from '@effect/sql-sqlite-node';
import { assert, expect } from '@effect/vitest';
import {
	defineRelations,
	ExtractTablesFromSchema,
	RelationsBuilder,
	RelationsBuilderConfig,
	Schema,
	sql,
} from 'drizzle-orm';
import * as SQLiteDrizzle from 'drizzle-orm/effect-sqlite-node';
import { migrate, rollback } from 'drizzle-orm/effect-sqlite-node/migrator';
import { getTableConfig, int, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Predicate from 'effect/Predicate';
import * as Result from 'effect/Result';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { DB, runCommonEffectSQLiteTests } from './effect-common';
import relations from './relations';
import { anotherUsersMigratorTable, usersMigratorTable } from './sqlite-common';

const SQLiteClientLive = SqliteClient.layer({
	filename: ':memory:',
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
	useJitMappers?: boolean,
) =>
	SQLiteDrizzle.make({ relations: defineRelations(schema, relations), jit: useJitMappers }).pipe(
		Effect.provide(SQLiteDrizzle.DefaultServices),
	);

const TestLive = Layer.merge(SQLiteClientLive, DBLive.pipe(Layer.provide(SQLiteClientLive)));

runCommonEffectSQLiteTests({
	testLayer: TestLive,
	SQLiteDrizzle: SQLiteDrizzle,
	createDB,
	addTests: (it) => {
		it.effect('rollback: undoes migrations newest-first and returns the plan', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const dir = './migrations/effect-sqlite-node-rollback';
				const config = { migrationsFolder: dir, migrationsTable: '__effect_rollback' };
				if (existsSync(dir)) rmSync(dir, { recursive: true });
				for (const [name, table] of [['20240101000000_a', 'effect_rb_a'], ['20240102000000_b', 'effect_rb_b']]) {
					mkdirSync(`${dir}/${name}`, { recursive: true });
					writeFileSync(`${dir}/${name}/migration.sql`, `CREATE TABLE \`${table}\` (\`id\` integer);`);
					writeFileSync(`${dir}/${name}/down.sql`, `DROP TABLE \`${table}\`;`);
				}
				yield* migrate(db, config);

				const preview = yield* rollback(db, config, { dryRun: true });
				expect(preview.map((step) => step.name)).toStrictEqual(['20240102000000_b']);

				const plan = yield* rollback(db, config, { steps: 2 });
				expect(plan.map((step) => step.name)).toStrictEqual(['20240102000000_b', '20240101000000_a']);
				const left = yield* db.all<{ name: string }>(
					sql`select name from sqlite_master where name in ('effect_rb_a', 'effect_rb_b', '__effect_rollback') order by name`,
				);
				expect(left.map((row) => row.name)).toStrictEqual(['__effect_rollback']);

				rmSync(dir, { recursive: true });
			}));

		it.effect('rollback: a missing down.sql is a typed failure, not a defect', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const dir = './migrations/effect-sqlite-node-rollback-missing';
				const config = { migrationsFolder: dir, migrationsTable: '__effect_rollback_missing' };
				if (existsSync(dir)) rmSync(dir, { recursive: true });
				mkdirSync(`${dir}/20240101000000_a`, { recursive: true });
				writeFileSync(`${dir}/20240101000000_a/migration.sql`, 'CREATE TABLE `effect_rb_missing` (`id` integer);');
				yield* migrate(db, config);

				const error = yield* Effect.flip(rollback(db, config));
				expect(error.message).toMatch(/has no down SQL/);

				rmSync(dir, { recursive: true });
			}));

		it.effect('migrator', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* db.run(sql`drop table if exists another_users`);
				yield* db.run(sql`drop table if exists users12`);
				yield* db.run(sql`drop table if exists __drizzle_migrations`);

				yield* migrate(db, { migrationsFolder: './drizzle2/sqlite' });

				yield* db.insert(usersMigratorTable).values({ name: 'John', email: 'email' }).run();
				const result = yield* db.select().from(usersMigratorTable).all();

				yield* db.insert(anotherUsersMigratorTable).values({ name: 'John', email: 'email' }).run();
				const result2 = yield* db.select().from(anotherUsersMigratorTable).all();

				expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);
				expect(result2).toEqual([{ id: 1, name: 'John', email: 'email' }]);

				yield* db.run(sql`drop table another_users`);
				yield* db.run(sql`drop table users12`);
				yield* db.run(sql`drop table __drizzle_migrations`);
			}));

		it.effect('migrator : --init', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const migrationsTable = 'drzl_init';

				yield* db.run(sql`drop table if exists ${sql.identifier(migrationsTable)};`);
				yield* db.run(sql`drop table if exists ${usersMigratorTable}`);
				yield* db.run(sql`drop table if exists ${sql.identifier('another_users')}`);

				const migratorRes = yield* migrate(db, {
					migrationsFolder: './drizzle2/sqlite',

					migrationsTable,
					// @ts-ignore - internal param
					init: true,
				});

				const meta = yield* db.select({
					hash: sql<string>`${sql.identifier('hash')}`.as('hash'),
					createdAt: sql<number>`${sql.identifier('created_at')}`.mapWith(Number).as('created_at'),
				}).from(sql`${sql.identifier(migrationsTable)}`);

				const res = yield* db.get<{ tableExists: boolean | number }>(
					sql`SELECT EXISTS (SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${
						getTableConfig(usersMigratorTable).name
					}) AS ${sql.identifier('tableExists')};`,
				);

				expect(migratorRes).toStrictEqual(undefined);
				expect(meta.length).toStrictEqual(1);
				expect(!!res?.tableExists).toStrictEqual(false);
			}));

		it.effect('migrator : --init - local migrations error', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const migrationsTable = 'drzl_init';

				yield* db.run(sql`drop table if exists ${sql.identifier(migrationsTable)};`);
				yield* db.run(sql`drop table if exists ${usersMigratorTable}`);
				yield* db.run(sql`drop table if exists ${sql.identifier('another_users')}`);

				const migratorRes = yield* migrate(db, {
					migrationsFolder: './drizzle2/sqlite-init',

					migrationsTable,
					// @ts-ignore - internal param
					init: true,
				}).pipe(Effect.result);

				assert(Result.isFailure(migratorRes));
				assert(Predicate.isTagged(migratorRes.failure, 'MigratorInitError'));
				expect(migratorRes.failure.exitCode).toBe('localMigrations');

				const meta = yield* db.select({
					hash: sql<string>`${sql.identifier('hash')}`.as('hash'),
					createdAt: sql<number>`${sql.identifier('created_at')}`.mapWith(Number).as('created_at'),
				}).from(sql`${sql.identifier(migrationsTable)}`);

				const res = yield* db.get<{ tableExists: boolean | number }>(
					sql`SELECT EXISTS (SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${
						getTableConfig(usersMigratorTable).name
					}) AS ${sql.identifier('tableExists')};`,
				);

				expect(meta.length).toStrictEqual(0);
				expect(!!res?.tableExists).toStrictEqual(false);
			}));

		it.effect('migrator : --init - db migrations error', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const migrationsTable = 'drzl_init';

				yield* db.run(sql`drop table if exists ${sql.identifier(migrationsTable)};`);
				yield* db.run(sql`drop table if exists ${usersMigratorTable}`);
				yield* db.run(sql`drop table if exists ${sql.identifier('another_users')}`);

				yield* migrate(db, {
					migrationsFolder: './drizzle2/sqlite',
					migrationsTable,
				});

				const migratorRes = yield* migrate(db, {
					migrationsFolder: './drizzle2/sqlite-init',

					migrationsTable,
					// @ts-ignore - internal param
					init: true,
				}).pipe(Effect.result);

				assert(Result.isFailure(migratorRes));
				assert(Predicate.isTagged(migratorRes.failure, 'MigratorInitError'));
				expect(migratorRes.failure.exitCode).toBe('databaseMigrations');

				const meta = yield* db.select({
					hash: sql<string>`${sql.identifier('hash')}`.as('hash'),
					createdAt: sql<number>`${sql.identifier('created_at')}`.mapWith(Number).as('created_at'),
				}).from(sql`${sql.identifier(migrationsTable)}`);

				const res = yield* db.get<{ tableExists: boolean | number }>(
					sql`SELECT EXISTS (SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${
						getTableConfig(usersMigratorTable).name
					}) AS ${sql.identifier('tableExists')};`,
				);

				expect(meta.length).toStrictEqual(1);
				expect(!!res?.tableExists).toStrictEqual(true);
			}));

		it.effect('migrator : local migration is unapplied. Migrations timestamp is less than last db migration', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const users = sqliteTable('migration_users', {
					id: int('id').primaryKey(),
					name: text().notNull(),
					email: text().notNull(),
					age: int(),
				});

				const users2 = sqliteTable('migration_users2', {
					id: int('id').primaryKey(),
					name: text().notNull(),
					email: text().notNull(),
					age: int(),
				});

				yield* db.run(sql`drop table if exists \`__drizzle_migrations\`;`);
				yield* db.run(sql`drop table if exists ${users}`);
				yield* db.run(sql`drop table if exists ${users2}`);

				// create migration directory
				const migrationDir = './migrations/sql-js';
				if (existsSync(migrationDir)) rmSync(migrationDir, { recursive: true });
				mkdirSync(migrationDir, { recursive: true });

				// first branch
				mkdirSync(`${migrationDir}/20240101010101_initial`, { recursive: true });
				writeFileSync(
					`${migrationDir}/20240101010101_initial/migration.sql`,
					`CREATE TABLE "migration_users" (\n"id" integer PRIMARY KEY NOT NULL,\n"name" text NOT NULL,\n"email" text NOT NULL\n);`,
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
					`CREATE TABLE "migration_users2" (\n"id" integer PRIMARY KEY NOT NULL,\n"name" text NOT NULL,\n"email" text NOT NULL\n,"age" integer\n);`,
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
