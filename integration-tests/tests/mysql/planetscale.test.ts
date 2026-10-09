import type { ExecutedQuery } from '@planetscale/database';
import { Client } from '@planetscale/database';
import { sql } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/mysql-core';
import { drizzle } from 'drizzle-orm/planetscale-serverless';
import type { PlanetScaleDatabase } from 'drizzle-orm/planetscale-serverless';
import { migrate } from 'drizzle-orm/planetscale-serverless/migrator';
import { describe, expect, expectTypeOf } from 'vitest';
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
	'transaction with options (isolationLevel read committed sees concurrent commits)',
	'transaction with options (isolationLevel repeatable read hides concurrent commits)',
	'transaction with options (accessMode read only)',
	'transaction with options (withConsistentSnapshot)',
	'transaction with options (withConsistentSnapshot combined with accessMode)',
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

test('raw db.execute type matches returned data', async ({ db: fixtureDb }) => {
	const db = fixtureDb as unknown as PlanetScaleDatabase;
	const table = sql.identifier('raw_execute_types');

	await db.execute<never>(sql`drop table if exists ${table}`);

	// DDL
	const created = await db.execute<never>(sql`create table ${table} (\`id\` int primary key, \`name\` text not null)`);
	expectTypeOf(created).toEqualTypeOf<ExecutedQuery<never>>();
	expect(created).toEqual(expect.objectContaining({ rows: [], rowsAffected: expect.any(Number) }));

	// `insert` without returning
	const inserted = await db.execute<never>(sql`insert into ${table} values (1, 'John')`);
	expectTypeOf(inserted).toEqualTypeOf<ExecutedQuery<never>>();
	expect(inserted).toEqual(expect.objectContaining({ rows: [], rowsAffected: 1, insertId: expect.any(String) }));

	// Simple select
	const selected = await db.execute<{ id: number; name: string }>(sql`select \`id\`, \`name\` from ${table}`);
	expectTypeOf(selected).toEqualTypeOf<ExecutedQuery<{ id: number; name: string }>>();
	expect(selected).toEqual(expect.objectContaining({ rows: [{ id: 1, name: 'John' }], headers: ['id', 'name'] }));

	// Any response
	const any = await db.execute(sql`select \`id\`, \`name\` from ${table}`);
	expectTypeOf(any).toEqualTypeOf<ExecutedQuery>();
	expect(any).toEqual(expect.objectContaining({ rows: [{ id: 1, name: 'John' }] }));

	await db.execute<never>(sql`drop table ${table}`);
});

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

	// databases should manually be created in PlanetScale dashboard
	test.skip('managing multiple databases #1', async ({ db }) => {
		await db.execute('drop database if exists drizzle1;');
		await db.execute('create database drizzle1;');
		await db.execute('drop database if exists drizzle2;');
		await db.execute('create database drizzle2;');

		await db.execute(`use drizzle1`);
		await migrate(db, { migrationsFolder: './drizzle2/mysql' });

		await db.execute(`use drizzle2`);
		await migrate(db, { migrationsFolder: './drizzle2/mysql' });

		// drizzle2
		await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
		const result2 = await db.select().from(usersMigratorTable);

		// drizzle1
		await db.execute(`use drizzle1`);
		await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
		const result1 = await db.select().from(usersMigratorTable);

		expect(result1).toEqual([{ id: 1, name: 'John', email: 'email' }]);
		expect(result2).toEqual([{ id: 1, name: 'John', email: 'email' }]);
	});
	test.skip('managing multiple databases #2', async () => {
		const client1 = new Client({ url: process.env['PLANETSCALE_CONNECTION_STRING'] });
		await client1.execute('drop database if exists drizzle1;');
		await client1.execute('create database drizzle1;');
		await client1.execute('use drizzle1;');

		const client2 = new Client({ url: process.env['PLANETSCALE_CONNECTION_STRING'] });
		await client2.execute('drop database if exists drizzle2;');
		await client2.execute('create database drizzle2;');
		await client2.execute('use drizzle2;');

		const db1 = drizzle({ client: client1 });
		const db2 = drizzle({ client: client2 });

		await migrate(db1, { migrationsFolder: './drizzle2/mysql' });
		await migrate(db2, { migrationsFolder: './drizzle2/mysql' });

		// drizzle1
		await db1.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
		const result1 = await db1.select().from(usersMigratorTable);

		// drizzle2
		await db2.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
		const result2 = await db2.select().from(usersMigratorTable);

		expect(result1).toEqual([{ id: 1, name: 'John', email: 'email' }]);
		expect(result2).toEqual([{ id: 1, name: 'John', email: 'email' }]);
	});
});
