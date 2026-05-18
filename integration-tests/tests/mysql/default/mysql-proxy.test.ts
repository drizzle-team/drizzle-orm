import { sql } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/mysql-core';
import { migrate } from 'drizzle-orm/mysql-proxy/migrator';
import { createConnection } from 'mysql2/promise';
import { describe, expect } from 'vitest';
import { proxyTest } from '../instrumentation';
import { proxyTest as test } from '../instrumentation';
import { tests } from '../mysql-common';
import { usersMigratorTable } from '../schema2';

const omit = new Set([
	'nested transaction rollback',
	'nested transaction',
	'transaction rollback',
	'transaction',
	'transaction with options (set isolationLevel)',
	'RQB v2 transaction find first - no rows',
	'RQB v2 transaction find first - multiple rows',
	'RQB v2 transaction find first - with relation',
	'RQB v2 transaction find first - placeholders',
	'RQB v2 transaction find many - no rows',
	'RQB v2 transaction find many - multiple rows',
	'RQB v2 transaction find many - with relation',
	'RQB v2 transaction find many - placeholders',
]);

tests(proxyTest, omit);

describe('migrator', () => {
	test('migrator', async ({ db, simulator }) => {
		await db.execute(sql`drop table if exists ${sql.identifier('__drizzle_migrations')}`);
		await db.execute(sql`drop table if exists ${usersMigratorTable}`);
		await db.execute(sql`drop table if exists ${sql.identifier('cities_migration')}`);
		await db.execute(sql`drop table if exists ${sql.identifier('users_migration')}`);

		await migrate(db, async (queries) => {
			try {
				await simulator.migrations(queries);
			} catch (e) {
				console.error(e);
				throw new Error('Proxy server cannot run migrations');
			}
		}, { migrationsFolder: './drizzle2/mysql' });

		await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });

		const result = await db.select().from(usersMigratorTable);

		expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);
	});

	test('migrator : --init', async ({ db, simulator }) => {
		const migrationsTable = 'drzl_init';

		await db.execute(sql`drop table if exists ${sql.identifier(migrationsTable)} cascade;`);
		await db.execute(sql`drop table if exists ${usersMigratorTable}`);
		await db.execute(sql`drop table if exists ${sql.identifier('cities_migration')}`);
		await db.execute(sql`drop table if exists ${sql.identifier('users_migration')}`);

		const migratorRes = await migrate(db, async (queries) => {
			try {
				await simulator.migrations(queries);
			} catch (e) {
				console.error(e);
				throw new Error('Proxy server cannot run migrations');
			}
		}, {
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

	test('migrator : --init - local migrations error', async ({ db, simulator }) => {
		const migrationsTable = 'drzl_init';

		await db.execute(sql`drop table if exists ${sql.identifier(migrationsTable)} cascade;`);
		await db.execute(sql`drop table if exists ${usersMigratorTable}`);
		await db.execute(sql`drop table if exists ${sql.identifier('cities_migration')}`);
		await db.execute(sql`drop table if exists ${sql.identifier('users_migration')}`);

		const migratorRes = await migrate(db, async (queries) => {
			try {
				await simulator.migrations(queries);
			} catch (e) {
				console.error(e);
				throw new Error('Proxy server cannot run migrations');
			}
		}, {
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

	test('migrator : --init - db migrations error', async ({ db, simulator }) => {
		const migrationsTable = 'drzl_init';

		await db.execute(sql`drop table if exists ${sql.identifier(migrationsTable)} cascade;`);
		await db.execute(sql`drop table if exists ${usersMigratorTable}`);
		await db.execute(sql`drop table if exists ${sql.identifier('cities_migration')}`);
		await db.execute(sql`drop table if exists ${sql.identifier('users_migration')}`);

		await migrate(db, async (queries) => {
			try {
				await simulator.migrations(queries);
			} catch (e) {
				console.error(e);
				throw new Error('Proxy server cannot run migrations');
			}
		}, {
			migrationsFolder: './drizzle2/mysql',
			migrationsTable,
		});

		const migratorRes = await migrate(db, async (queries) => {
			try {
				await simulator.migrations(queries);
			} catch (e) {
				console.error(e);
				throw new Error('Proxy server cannot run migrations');
			}
		}, {
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

	test('managing multiple databases #1', async ({ db, simulator }) => {
		const migrationsTable = 'drzl_init';

		await db.execute('drop database if exists drizzle1;');
		await db.execute('create database drizzle1;');
		await db.execute('drop database if exists drizzle2;');
		await db.execute('create database drizzle2;');

		await db.execute(`use drizzle1`);
		await migrate(db, async (queries) => {
			try {
				await simulator.migrations(queries);
			} catch (e) {
				console.error(e);
				throw new Error('Proxy server cannot run migrations');
			}
		}, {
			migrationsFolder: './drizzle2/mysql',
			migrationsTable,
		});

		await db.execute(`use drizzle2`);
		await migrate(db, async (queries) => {
			try {
				await simulator.migrations(queries);
			} catch (e) {
				console.error(e);
				throw new Error('Proxy server cannot run migrations');
			}
		}, {
			migrationsFolder: './drizzle2/mysql',
			migrationsTable,
		});

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

	test('managing multiple databases #2', async ({ db, createDB, createSimulator }) => {
		await db.execute('drop database if exists drizzle1;');
		await db.execute('create database drizzle1;');
		await db.execute('drop database if exists drizzle2;');
		await db.execute('create database drizzle2;');

		const migrationsTable = 'drzl_init';

		const client1 = await createConnection({ uri: process.env['MYSQL_CONNECTION_STRING'], database: 'drizzle1' });
		const client2 = await createConnection({ uri: process.env['MYSQL_CONNECTION_STRING'], database: 'drizzle2' });

		const db1 = createDB({ proxyClient: client1 });
		const db2 = createDB({ proxyClient: client2 });

		await migrate(db1, async (queries) => {
			try {
				await createSimulator(client1).migrations(queries);
			} catch (e) {
				console.error(e);
				throw new Error('Proxy server cannot run migrations');
			}
		}, {
			migrationsFolder: './drizzle2/mysql',
			migrationsTable,
		});

		await migrate(db2, async (queries) => {
			try {
				await createSimulator(client2).migrations(queries);
			} catch (e) {
				console.error(e);
				throw new Error('Proxy server cannot run migrations');
			}
		}, {
			migrationsFolder: './drizzle2/mysql',
			migrationsTable,
		});

		// drizzle1
		await db1.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
		const result1 = await db1.select().from(usersMigratorTable);

		// drizzle2
		await db2.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
		const result2 = await db2.select().from(usersMigratorTable);

		await db.execute('drop database drizzle1;');
		await db.execute('drop database drizzle2;');

		expect(result1).toEqual([{ id: 1, name: 'John', email: 'email' }]);
		expect(result2).toEqual([{ id: 1, name: 'John', email: 'email' }]);
	});
});
