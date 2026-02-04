import { sql } from 'drizzle-orm';
import { SQLiteCloudDatabase } from 'drizzle-orm/sqlite-cloud';
import { getTableConfig, int, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { TursoDatabaseDatabase } from 'drizzle-orm/tursodatabase';
import { migrate } from 'drizzle-orm/tursodatabase/migrator';
import { existsSync, mkdirSync, rmdirSync, writeFileSync } from 'fs';
import { expect } from 'vitest';
import { tursoDatabaseTest as test } from './instrumentation';
import relations from './relations';
import { tests } from './sqlite-common';

export const usersMigratorTable = sqliteTable('users12', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
});

export const anotherUsersMigratorTable = sqliteTable('another_users', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
});

test('migrator', async ({ db }) => {
	await db.run(sql`drop table if exists another_users`);
	await db.run(sql`drop table if exists users12`);
	await db.run(sql`drop table if exists __drizzle_migrations`);

	await migrate(db as TursoDatabaseDatabase<never, typeof relations>, { migrationsFolder: './drizzle2/sqlite' });

	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' }).run();
	const result = await db.select().from(usersMigratorTable).all();
	await db.insert(anotherUsersMigratorTable).values({ name: 'John', email: 'email' }).run();
	const result2 = await db.select().from(anotherUsersMigratorTable).all();

	expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);
	expect(result2).toEqual([{ id: 1, name: 'John', email: 'email' }]);

	await db.run(sql`drop table another_users`);
	await db.run(sql`drop table users12`);
	await db.run(sql`drop table __drizzle_migrations`);
});

test('migrator : --init', async ({ db }) => {
	const migrationsTable = 'drzl_init';

	await db.run(sql`drop table if exists ${sql.identifier(migrationsTable)};`);
	await db.run(sql`drop table if exists ${usersMigratorTable}`);
	await db.run(sql`drop table if exists ${sql.identifier('another_users')}`);

	const migratorRes = await migrate(db as TursoDatabaseDatabase<never, typeof relations>, {
		migrationsFolder: './drizzle2/sqlite',

		migrationsTable,
		// @ts-ignore - internal param
		init: true,
	});

	const meta = await db.select({
		hash: sql<string>`${sql.identifier('hash')}`.as('hash'),
		createdAt: sql<number>`${sql.identifier('created_at')}`.mapWith(Number).as('created_at'),
	}).from(sql`${sql.identifier(migrationsTable)}`);

	const res = await db.get<{ name: string }>(
		sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${getTableConfig(usersMigratorTable).name};`,
	);

	expect(migratorRes).toStrictEqual(undefined);
	expect(meta.length).toStrictEqual(1);
	expect(!!res).toStrictEqual(false);
});

test('migrator : --init - local migrations error', async ({ db }) => {
	const migrationsTable = 'drzl_init';

	await db.run(sql`drop table if exists ${sql.identifier(migrationsTable)};`);
	await db.run(sql`drop table if exists ${usersMigratorTable}`);
	await db.run(sql`drop table if exists ${sql.identifier('another_users')}`);

	const migratorRes = await migrate(db as TursoDatabaseDatabase<never, typeof relations>, {
		migrationsFolder: './drizzle2/sqlite-init',

		migrationsTable,
		// @ts-ignore - internal param
		init: true,
	});

	const meta = await db.select({
		hash: sql<string>`${sql.identifier('hash')}`.as('hash'),
		createdAt: sql<number>`${sql.identifier('created_at')}`.mapWith(Number).as('created_at'),
	}).from(sql`${sql.identifier(migrationsTable)}`);

	const res = await db.get<{ name: string }>(
		sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${getTableConfig(usersMigratorTable).name};`,
	);

	expect(migratorRes).toStrictEqual({ exitCode: 'localMigrations' });
	expect(meta.length).toStrictEqual(0);
	expect(!!res).toStrictEqual(false);
});

test('migrator : --init - db migrations error', async ({ db }) => {
	const migrationsTable = 'drzl_init';

	await db.run(sql`drop table if exists ${sql.identifier(migrationsTable)};`);
	await db.run(sql`drop table if exists ${usersMigratorTable}`);
	await db.run(sql`drop table if exists ${sql.identifier('another_users')}`);

	await migrate(db as TursoDatabaseDatabase<never, typeof relations>, {
		migrationsFolder: './drizzle2/sqlite',
		migrationsTable,
	});

	const migratorRes = await migrate(db as TursoDatabaseDatabase<never, typeof relations>, {
		migrationsFolder: './drizzle2/sqlite-init',

		migrationsTable,
		// @ts-ignore - internal param
		init: true,
	});

	const meta = await db.select({
		hash: sql<string>`${sql.identifier('hash')}`.as('hash'),
		createdAt: sql<number>`${sql.identifier('created_at')}`.mapWith(Number).as('created_at'),
	}).from(sql`${sql.identifier(migrationsTable)}`);

	const res = await db.get<{ name: string }>(
		sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${getTableConfig(usersMigratorTable).name};`,
	);

	expect(migratorRes).toStrictEqual({ exitCode: 'databaseMigrations' });
	expect(meta.length).toStrictEqual(1);
	expect(!!res).toStrictEqual(true);
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
	const migrationDir = './migrations/sqlite-cloud';
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

	await migrate(db as TursoDatabaseDatabase<never, typeof relations>, { migrationsFolder: migrationDir });
	const res1 = await db.insert(users).values({ name: 'John', email: '', age: 30 }).returning();

	// second migration was not applied yet
	await expect(db.insert(users2).values({ name: 'John', email: '', age: 30 })).rejects.toThrowError();

	// insert migration with earlier timestamp
	mkdirSync(`${migrationDir}/20240202020202_second`, { recursive: true });
	writeFileSync(
		`${migrationDir}/20240202020202_second/migration.sql`,
		`CREATE TABLE "migration_users2" (\n"id" integer PRIMARY KEY NOT NULL,\n"name" text NOT NULL,\n"email" text NOT NULL\n,"age" integer\n);`,
	);
	await migrate(db as TursoDatabaseDatabase<never, typeof relations>, { migrationsFolder: migrationDir });

	const res2 = await db.insert(users2).values({ name: 'John', email: '', age: 30 }).returning();

	const expected = [{ id: 1, name: 'John', email: '', age: 30 }];
	expect(res1).toStrictEqual(expected);
	expect(res2).toStrictEqual(expected);

	rmdirSync(migrationDir, { recursive: true });
});

const skip = [
	// Subquery in WHERE clause is not supported
	'RQB v2 simple find many - with relation',
	'RQB v2 transaction find many - with relation',
	'RQB v2 simple find first - with relation',
	'RQB v2 transaction find first - with relation',
	'RQB v2 simple find many - with text pks',

	'$count',
	'$count embedded',
	'$count embedded reuse',
	'$count embedded with filters',
	'select from a many subquery',
	'select from a one subquery',
	// CROSS JOIN is not supported
	'cross join',
	// ORDER BY is not supported for compound SELECTs yet
	'set operations (union) from query builder with subquery',
	'set operations (union) as function',
	'set operations (union all) from query builder',
	'set operations (intersect) from query builder',
	'set operations (except) as function',
	'set operations (mixed all) as function with subquery',
	// ORDER BY clause is not supported in DELETE
	'delete with limit and order by',
	// SAVEPOINT not supported yet
	'nested transaction',
	'nested transaction rollback',
	// WITH clause is not supported in DELETE
	'with ... delete',
	// WITH clause is not supported
	'with ... insert',
	// WITH clause is not supported in UPDATE
	'with ... update',
	// IN (...subquery) in WHERE clause is not supported
	'with ... select',
	// EXISTS in WHERE clause is not supported
	'select with exists',
	// RETURNING currently not implemented for DELETE statements.
	'delete with returning partial',
	'delete with returning all fields',
	'delete returning sql',
	// FROM clause is not supported in UPDATE
	'update ... from',
	'update ... from with alias',
	'update ... from with join',
	// ORDER BY is not supported in UPDATE
	'update with limit and order by',
	// TBD
	'join on aliased sql from with clause',
	'join view as subquery',
];
tests(test, skip);
