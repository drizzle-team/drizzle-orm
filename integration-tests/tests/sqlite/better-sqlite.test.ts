import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { getTableConfig, int, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { existsSync, mkdirSync, rmdirSync, writeFileSync } from 'fs';
import { expect } from 'vitest';
import { betterSqlite3Test as test } from './instrumentation';
import relations from './relations';
import { anotherUsersMigratorTable, tests, usersMigratorTable } from './sqlite-common';

test('migrator', async ({ db }) => {
	db.run(sql`drop table if exists another_users`);
	db.run(sql`drop table if exists users12`);
	db.run(sql`drop table if exists __drizzle_migrations`);

	migrate(db as BetterSQLite3Database<never, typeof relations>, { migrationsFolder: './drizzle2/sqlite' });

	db.insert(usersMigratorTable).values({ name: 'John', email: 'email' }).run();
	const result = db.select().from(usersMigratorTable).all();

	db.insert(anotherUsersMigratorTable).values({ name: 'John', email: 'email' }).run();
	const result2 = db.select().from(anotherUsersMigratorTable).all();

	expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);
	expect(result2).toEqual([{ id: 1, name: 'John', email: 'email' }]);

	db.run(sql`drop table another_users`);
	db.run(sql`drop table users12`);
	db.run(sql`drop table __drizzle_migrations`);
});

test('migrator : --init', async ({ db }) => {
	const migrationsTable = 'drzl_init';

	await db.run(sql`drop table if exists ${sql.identifier(migrationsTable)};`);
	await db.run(sql`drop table if exists ${usersMigratorTable}`);
	await db.run(sql`drop table if exists ${sql.identifier('another_users')}`);

	const migratorRes = migrate(db as BetterSQLite3Database<never, typeof relations>, {
		migrationsFolder: './drizzle2/sqlite',

		migrationsTable,
		// @ts-ignore - internal param
		init: true,
	});

	const meta = await db.select({
		hash: sql<string>`${sql.identifier('hash')}`.as('hash'),
		createdAt: sql<number>`${sql.identifier('created_at')}`.mapWith(Number).as('created_at'),
	}).from(sql`${sql.identifier(migrationsTable)}`);

	const res = await db.get<{ tableExists: boolean | number }>(
		sql`SELECT EXISTS (SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${
			getTableConfig(usersMigratorTable).name
		}) AS ${sql.identifier('tableExists')};`,
	);

	expect(migratorRes).toStrictEqual(undefined);
	expect(meta.length).toStrictEqual(1);
	expect(!!res?.tableExists).toStrictEqual(false);
});

test('migrator : --init - local migrations error', async ({ db }) => {
	const migrationsTable = 'drzl_init';

	await db.run(sql`drop table if exists ${sql.identifier(migrationsTable)};`);
	await db.run(sql`drop table if exists ${usersMigratorTable}`);
	await db.run(sql`drop table if exists ${sql.identifier('another_users')}`);

	const migratorRes = migrate(db as BetterSQLite3Database<never, typeof relations>, {
		migrationsFolder: './drizzle2/sqlite-init',

		migrationsTable,
		// @ts-ignore - internal param
		init: true,
	});

	const meta = await db.select({
		hash: sql<string>`${sql.identifier('hash')}`.as('hash'),
		createdAt: sql<number>`${sql.identifier('created_at')}`.mapWith(Number).as('created_at'),
	}).from(sql`${sql.identifier(migrationsTable)}`);

	const res = await db.get<{ tableExists: boolean | number }>(
		sql`SELECT EXISTS (SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${
			getTableConfig(usersMigratorTable).name
		}) AS ${sql.identifier('tableExists')};`,
	);

	expect(migratorRes).toStrictEqual({ exitCode: 'localMigrations' });
	expect(meta.length).toStrictEqual(0);
	expect(!!res?.tableExists).toStrictEqual(false);
});

test('migrator : --init - db migrations error', async ({ db }) => {
	const migrationsTable = 'drzl_init';

	await db.run(sql`drop table if exists ${sql.identifier(migrationsTable)};`);
	await db.run(sql`drop table if exists ${usersMigratorTable}`);
	await db.run(sql`drop table if exists ${sql.identifier('another_users')}`);

	migrate(db as BetterSQLite3Database<never, typeof relations>, {
		migrationsFolder: './drizzle2/sqlite',
		migrationsTable,
	});

	const migratorRes = migrate(db as BetterSQLite3Database<never, typeof relations>, {
		migrationsFolder: './drizzle2/sqlite-init',

		migrationsTable,
		// @ts-ignore - internal param
		init: true,
	});

	const meta = await db.select({
		hash: sql<string>`${sql.identifier('hash')}`.as('hash'),
		createdAt: sql<number>`${sql.identifier('created_at')}`.mapWith(Number).as('created_at'),
	}).from(sql`${sql.identifier(migrationsTable)}`);

	const res = await db.get<{ tableExists: boolean | number }>(
		sql`SELECT EXISTS (SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${
			getTableConfig(usersMigratorTable).name
		}) AS ${sql.identifier('tableExists')};`,
	);

	expect(migratorRes).toStrictEqual({ exitCode: 'databaseMigrations' });
	expect(meta.length).toStrictEqual(1);
	expect(!!res?.tableExists).toStrictEqual(true);
});

test('migrator: local migration is unapplied. Migrations timestamp is less than last db migration', async ({ db }) => {
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

	await db.run(sql`drop table if exists \`__drizzle_migrations\`;`);
	await db.run(sql`drop table if exists ${users}`);
	await db.run(sql`drop table if exists ${users2}`);

	// create migration directory
	const migrationDir = './migrations/bettersqlite3';
	if (existsSync(migrationDir)) rmdirSync(migrationDir, { recursive: true });
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

	migrate(db as BetterSQLite3Database, { migrationsFolder: migrationDir });
	const res1 = await db.insert(users).values({ name: 'John', email: '', age: 30 }).returning();

	// second migration was not applied yet
	await expect(db.insert(users2).values({ name: 'John', email: '', age: 30 })).rejects.toThrowError();

	// insert migration with earlier timestamp
	mkdirSync(`${migrationDir}/20240202020202_second`, { recursive: true });
	writeFileSync(
		`${migrationDir}/20240202020202_second/migration.sql`,
		`CREATE TABLE "migration_users2" (\n"id" integer PRIMARY KEY NOT NULL,\n"name" text NOT NULL,\n"email" text NOT NULL\n,"age" integer\n);`,
	);
	migrate(db as BetterSQLite3Database, { migrationsFolder: migrationDir });

	const res2 = await db.insert(users2).values({ name: 'John', email: '', age: 30 }).returning();

	const expected = [{ id: 1, name: 'John', email: '', age: 30 }];
	expect(res1).toStrictEqual(expected);
	expect(res2).toStrictEqual(expected);

	rmdirSync(migrationDir, { recursive: true });
});

const skip = [
	/**
	 * doesn't work properly:
	 * 	Expect: should rollback transaction and don't insert/ update data
	 * 	Received: data inserted/ updated
	 */
	'transaction rollback',
	'nested transaction rollback',
];
tests(test, skip);
