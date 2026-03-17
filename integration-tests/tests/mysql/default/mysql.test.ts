import { sql } from 'drizzle-orm';
import { getTableConfig, int, mysqlTable, text } from 'drizzle-orm/mysql-core';
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { createConnection } from 'mysql2/promise';
import { describe, expect } from 'vitest';
import { mysqlTest as test } from '../instrumentation';
import { tests } from '../mysql-common';
import { runTests } from '../mysql-common-cache';
import { usersMigratorTable } from '../schema2';

runTests('mysql', test);
tests(test);

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

		const res = await db.execute<{ tableExists: boolean | number }>(sql`SELECT EXISTS (
                SELECT 1
                FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_NAME = ${getTableConfig(usersMigratorTable).name}
				AND TABLE_SCHEMA = DATABASE()
            ) as ${sql.identifier('tableExists')};`);

		expect(migratorRes).toStrictEqual(undefined);
		expect(meta.length).toStrictEqual(1);
		expect(!!res[0]?.[0]?.tableExists).toStrictEqual(false);
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

		const res = await db.execute<{ tableExists: boolean | number }>(sql`SELECT EXISTS (
                SELECT 1
                FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_NAME = ${getTableConfig(usersMigratorTable).name}
				AND TABLE_SCHEMA = DATABASE()
            ) as ${sql.identifier('tableExists')};`);

		expect(migratorRes).toStrictEqual({ exitCode: 'localMigrations' });
		expect(meta.length).toStrictEqual(0);
		expect(!!res[0]?.[0]?.tableExists).toStrictEqual(false);
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

		const res = await db.execute<{ tableExists: boolean | number }>(sql`SELECT EXISTS (
                SELECT 1
                FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_NAME = ${getTableConfig(usersMigratorTable).name}
				AND TABLE_SCHEMA = DATABASE()
            ) as ${sql.identifier('tableExists')};`);

		expect(migratorRes).toStrictEqual({ exitCode: 'databaseMigrations' });
		expect(meta.length).toStrictEqual(1);
		expect(!!res[0]?.[0]?.tableExists).toStrictEqual(true);
	});

	test('migrator: local migration is unapplied. Migrations timestamp is less than last db migration', async ({ db }) => {
		const users = mysqlTable('migration_users', {
			id: int('id').primaryKey(),
			name: text().notNull(),
			email: text().notNull(),
			age: int(),
		});

		const users2 = mysqlTable('migration_users2', {
			id: int('id').primaryKey(),
			name: text().notNull(),
			email: text().notNull(),
			age: int(),
		});

		await db.execute(sql`drop table if exists ${users}`);
		await db.execute(sql`drop table if exists ${users2}`);

		// create migration directory
		const migrationDir = './migrations/mysql';
		if (existsSync(migrationDir)) rmSync(migrationDir, { recursive: true });
		mkdirSync(migrationDir, { recursive: true });

		// first branch
		mkdirSync(`${migrationDir}/20240101010101_initial`, { recursive: true });
		writeFileSync(
			`${migrationDir}/20240101010101_initial/migration.sql`,
			'CREATE TABLE `migration_users` (\n`id` INT PRIMARY KEY,\n`name` text NOT NULL,\n`email` text NOT NULL\n);',
		);
		mkdirSync(`${migrationDir}/20240303030303_third`, { recursive: true });
		writeFileSync(
			`${migrationDir}/20240303030303_third/migration.sql`,
			'ALTER TABLE `migration_users` ADD COLUMN `age` INT;',
		);

		await migrate(db, { migrationsFolder: migrationDir });
		await db.insert(users).values({ id: 1, name: 'John', email: '', age: 30 });
		const res1 = await db.select().from(users);

		// second migration was not applied yet
		await expect(db.insert(users2).values({ id: 1, name: 'John', email: '', age: 30 })).rejects.toThrowError();

		// insert migration with earlier timestamp
		mkdirSync(`${migrationDir}/20240202020202_second`, { recursive: true });
		writeFileSync(
			`${migrationDir}/20240202020202_second/migration.sql`,
			'CREATE TABLE `migration_users2` (\n`id` INT PRIMARY KEY,\n`name` text NOT NULL,\n`email` text NOT NULL\n,`age` INT\n);',
		);
		await migrate(db, { migrationsFolder: migrationDir });

		await db.insert(users2).values({ id: 1, name: 'John', email: '', age: 30 });
		const res2 = await db.select().from(users2);

		const expected = [{ id: 1, name: 'John', email: '', age: 30 }];
		expect(res1).toStrictEqual(expected);
		expect(res2).toStrictEqual(expected);

		rmSync(migrationDir, { recursive: true });
	});

	test('managing multiple databases #1', async ({ db }) => {
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

	test('managing multiple databases #2', async () => {
		const client1 = await createConnection({ uri: process.env['MYSQL_CONNECTION_STRING'] });
		await client1.query('drop database if exists drizzle1;');
		await client1.query('create database drizzle1;');
		await client1.query('use drizzle1;');

		const client2 = await createConnection({ uri: process.env['MYSQL_CONNECTION_STRING'] });
		await client2.query('drop database if exists drizzle2;');
		await client2.query('create database drizzle2;');
		await client2.query('use drizzle2;');

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
