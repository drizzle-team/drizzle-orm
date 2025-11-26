import { sql } from 'drizzle-orm';
import { getTableConfig, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { TursoDatabaseDatabase } from 'drizzle-orm/tursodatabase';
import { migrate } from 'drizzle-orm/tursodatabase/migrator';
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

const skip = [
	// Subquery in WHERE clause is not supported
	'RQB v2 simple find many - with relation',
	'RQB v2 transaction find many - with relation',
	'RQB v2 simple find first - with relation',
	'RQB v2 transaction find first - with relation',
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
