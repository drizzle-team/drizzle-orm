import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { getTableConfig, int, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
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

	rmSync(migrationDir, { recursive: true });
});

// https://github.com/drizzle-team/drizzle-orm/issues/5782
test('migrator: fk with onDelete: cascade', async ({ db }) => {
	const parent1 = sqliteTable('parent', {
		id: text('id').primaryKey(),
		// Some attribute we'll change later to force a rebuild
		mode: text('mode').notNull().default('a'),
	});

	const child = sqliteTable('child', {
		id: text('id').primaryKey(),
		parentId: text('parent_id')
			.notNull()
			.references(() => parent1.id, { onDelete: 'cascade' }),
		payload: text('payload').notNull(),
	});

	await db.run(sql`drop table if exists \`__drizzle_migrations\`;`);
	await db.run(sql`drop table if exists ${parent1}`);
	await db.run(sql`drop table if exists ${child}`);

	// create migration directory
	const migrationDir = './migrations/bettersqlite3';
	if (existsSync(migrationDir)) rmSync(migrationDir, { recursive: true });
	mkdirSync(migrationDir, { recursive: true });

	// first migration
	mkdirSync(`${migrationDir}/20240101010101_initial`, { recursive: true });
	writeFileSync(
		`${migrationDir}/20240101010101_initial/migration.sql`,
		[
			'CREATE TABLE `parent` (\n'
			+ '\t`id` text PRIMARY KEY,\n'
			+ "\t`mode` text DEFAULT 'a' NOT NULL\n"
			+ ');\n',
			'CREATE TABLE `child` (\n'
			+ '\t`id` text PRIMARY KEY,\n'
			+ '\t`parent_id` text NOT NULL,\n'
			+ '\t`payload` text NOT NULL,\n'
			+ '\tCONSTRAINT `fk_child_parent_id_parent_id_fk` FOREIGN KEY (`parent_id`) REFERENCES `parent`(`id`) ON DELETE CASCADE\n'
			+ ');\n',
		].join('--> statement-breakpoint\n'),
	);

	migrate(db as BetterSQLite3Database, { migrationsFolder: migrationDir });
	const res11 = await db.insert(parent1).values({ id: 'a' }).returning();
	const res12 = await db.insert(child).values({ id: 'a', parentId: 'a', payload: 'b' }).returning();

	mkdirSync(`${migrationDir}/20240202020202_second`, { recursive: true });
	writeFileSync(
		`${migrationDir}/20240202020202_second/migration.sql`,
		[
			'PRAGMA foreign_keys=OFF;',
			'CREATE TABLE `__new_parent` (\n'
			+ '\t`id` text PRIMARY KEY,\n'
			+ "\t`mode` text DEFAULT 'b' NOT NULL\n"
			+ ');\n',
			'INSERT INTO `__new_parent`(`id`, `mode`) SELECT `id`, `mode` FROM `parent`;',
			'DROP TABLE `parent`;',
			'ALTER TABLE `__new_parent` RENAME TO `parent`;',
			'PRAGMA foreign_keys=ON;',
		].join('--> statement-breakpoint\n'),
	);
	migrate(db as BetterSQLite3Database, { migrationsFolder: migrationDir });

	const res21 = await db.select().from(parent1);
	const res22 = await db.select().from(child);

	expect(res21).toStrictEqual(res11);
	expect(res22).toStrictEqual(res12);

	rmSync(migrationDir, { recursive: true });
});

const skip = [
	// Uses sync versions
	'transaction rollback',
	'nested transaction rollback',
];
tests(test, skip);
