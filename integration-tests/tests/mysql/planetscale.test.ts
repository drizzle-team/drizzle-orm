import { sql } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/mysql-core';
import { migrate } from 'drizzle-orm/planetscale-serverless/migrator';
import { describe, expect } from 'vitest';
import { planetscaleTest as test } from './instrumentation';
import { tests } from './mysql-common';
import { runTests as cacheTests } from './mysql-common-cache';
import { usersMigratorTable } from './schema2';

const omit = new Set([
	'mySchema :: view',
	'mySchema :: select from tables with same name from different schema using alias',
	'mySchema :: prepared statement with placeholder in .where',
	'mySchema :: insert with spaces',
	'mySchema :: select with group by as column + sql',
	'mySchema :: select with group by as field',
	'mySchema :: insert many',
	'mySchema :: insert with overridden default values',
	'mySchema :: insert + select',
	'mySchema :: delete with returning all fields',
	'mySchema :: update with returning partial',
	'mySchema :: delete returning sql',
	'mySchema :: insert returning sql',
	'mySchema :: select typed sql',
	'mySchema :: select sql',
	'mySchema :: select all fields',
	'mySchema :: select distinct',
	'mySchema :: build query',
	'test $onUpdateFn and $onUpdate works updating',
	'test $onUpdateFn and $onUpdate works as $default',
	'set operations (mixed all) as function with subquery',
	'set operations (mixed) from query builder',
	'set operations (except all) as function',
	'set operations (except all) from query builder',
	'set operations (except) as function',
	'set operations (except) from query builder',
	'set operations (intersect all) as function',
	'set operations (intersect all) from query builder',
	'set operations (intersect) as function',
	'set operations (intersect) from query builder',
	'select iterator w/ prepared statement',
	'select iterator',
	'subquery with view',
	'join on aliased sql from with clause',
	'with ... delete',
	'with ... update',
	'with ... select',

	// to redefine in this file
	'utc config for datetime',
	'transaction',
	'transaction with options (set isolationLevel)',
	'having',
	'select count()',
	'insert via db.execute w/ query builder',
	'insert via db.execute + select via db.execute',
	'insert many with returning',
	'delete with returning partial',
	'delete with returning all fields',
	'update with returning partial',
	'update with returning all fields',
	'update returning sql',
	'delete returning sql',
	'insert returning sql',
]);

tests(test, omit);
cacheTests('planetscale', test);

describe('migrator', () => {
	test('migrator', async ({ db }) => {
		await db.execute(sql`drop table if exists ${sql.identifier('__drizzle_migrations')}`);
		await db.execute(sql`drop table if exists ${usersMigratorTable}`);
		await db.execute(sql`drop table if exists ${sql.identifier('cities_migration')}`);
		await db.execute(sql`drop table if exists ${sql.identifier('users_migration')}`);

		await migrate(db, { migrationsFolder: './drizzle2/mysql' });

		await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });

		const result = await db.select().from(usersMigratorTable);

		expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);
	});

	test('migrator : --init', async ({ db }) => {
		const migrationsTable = 'drzl_init';

		await db.execute(sql`drop table if exists ${sql.identifier(migrationsTable)} cascade;`);
		await db.execute(sql`drop table if exists ${usersMigratorTable}`);
		await db.execute(sql`drop table if exists ${sql.identifier('cities_migration')}`);
		await db.execute(sql`drop table if exists ${sql.identifier('users_migration')}`);

		const migratorRes = await migrate(db, {
			migrationsFolder: './drizzle2/mysql',
			migrationsTable,
			// @ts-ignore - internal param
			init: true,
		});

		const meta = await db.select({
			hash: sql<string>`${sql.identifier('hash')}`.as('hash'),
			createdAt: sql<number>`${sql.identifier('created_at')}`.mapWith(Number).as('created_at'),
		}).from(sql`${sql.identifier(migrationsTable)}`);

		const res = await db.execute<{ tableExists: 'string' }>(sql`SELECT EXISTS (
				SELECT 1
				FROM INFORMATION_SCHEMA.TABLES
				WHERE TABLE_NAME = ${getTableConfig(usersMigratorTable).name}
			) as ${sql.identifier('tableExists')};`);

		expect(migratorRes).toStrictEqual(undefined);
		expect(meta.length).toStrictEqual(1);
		expect(!!(Number(res.rows[0]?.tableExists ?? 0))).toStrictEqual(false);
	});

	test('migrator : --init - local migrations error', async ({ db }) => {
		const migrationsTable = 'drzl_init';

		await db.execute(sql`drop table if exists ${sql.identifier(migrationsTable)} cascade;`);
		await db.execute(sql`drop table if exists ${usersMigratorTable}`);
		await db.execute(sql`drop table if exists ${sql.identifier('cities_migration')}`);
		await db.execute(sql`drop table if exists ${sql.identifier('users_migration')}`);

		const migratorRes = await migrate(db, {
			migrationsFolder: './drizzle2/mysql-init',
			migrationsTable,
			// @ts-ignore - internal param
			init: true,
		});

		const meta = await db.select({
			hash: sql<string>`${sql.identifier('hash')}`.as('hash'),
			createdAt: sql<number>`${sql.identifier('created_at')}`.mapWith(Number).as('created_at'),
		}).from(sql`${sql.identifier(migrationsTable)}`);

		const res = await db.execute<{ tableExists: 'string' }>(sql`SELECT EXISTS (
				SELECT 1
				FROM INFORMATION_SCHEMA.TABLES
				WHERE TABLE_NAME = ${getTableConfig(usersMigratorTable).name}
			) as ${sql.identifier('tableExists')};`);

		expect(migratorRes).toStrictEqual({ exitCode: 'localMigrations' });
		expect(meta.length).toStrictEqual(0);
		expect(!!(Number(res.rows[0]?.tableExists ?? 0))).toStrictEqual(false);
	});

	test('migrator : --init - db migrations error', async ({ db }) => {
		const migrationsTable = 'drzl_init';

		await db.execute(sql`drop table if exists ${sql.identifier(migrationsTable)} cascade;`);
		await db.execute(sql`drop table if exists ${usersMigratorTable}`);
		await db.execute(sql`drop table if exists ${sql.identifier('cities_migration')}`);
		await db.execute(sql`drop table if exists ${sql.identifier('users_migration')}`);

		await migrate(db, {
			migrationsFolder: './drizzle2/mysql',
			migrationsTable,
		});

		const migratorRes = await migrate(db, {
			migrationsFolder: './drizzle2/mysql-init',
			migrationsTable,
			// @ts-ignore - internal param
			init: true,
		});

		const meta = await db.select({
			hash: sql<string>`${sql.identifier('hash')}`.as('hash'),
			createdAt: sql<number>`${sql.identifier('created_at')}`.mapWith(Number).as('created_at'),
		}).from(sql`${sql.identifier(migrationsTable)}`);

		const res = await db.execute<{ tableExists: 'string' }>(sql`SELECT EXISTS (
				SELECT 1
				FROM INFORMATION_SCHEMA.TABLES
				WHERE TABLE_NAME = ${getTableConfig(usersMigratorTable).name}
			) as ${sql.identifier('tableExists')};`);

		expect(migratorRes).toStrictEqual({ exitCode: 'databaseMigrations' });
		expect(meta.length).toStrictEqual(1);
		expect(!!(Number(res.rows[0]?.tableExists ?? 0))).toStrictEqual(true);
	});
});
