/// <reference types="bun-types" />

import { SqliteClient } from '@effect/sql-sqlite-bun';
import { expect } from 'bun:test';
import {
	defineRelations,
	ExtractTablesFromSchema,
	RelationsBuilder,
	RelationsBuilderConfig,
	Schema,
	sql,
} from 'drizzle-orm';
import * as SQLiteDrizzle from 'drizzle-orm/effect-sqlite-bun';
import { migrate } from 'drizzle-orm/effect-sqlite-bun/migrator';
import { getTableConfig, int, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Predicate from 'effect/Predicate';
import * as Result from 'effect/Result';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { strict as assert } from 'node:assert';
import relations from '../sqlite/relations';
import { anotherUsersMigratorTable, usersMigratorTable } from '../sqlite/sqlite-common';
import { DB, runCommonEffectSQLiteTests } from './effect-sqlite-common';

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
	skipTests: Date.now() < +new Date('2026-07-01')
		? ['migrator : local migration is unapplied. Migrations timestamp is less than last db migration']
		: [],
	addTests: (it) => {
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

		// Driver bug - misplaced trycatch throws an error past the effect
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
