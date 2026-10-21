import { sql } from 'drizzle-orm';
import { getTableConfig, int, mysqlTable, text } from 'drizzle-orm/mysql-core';
import { drizzle } from 'drizzle-orm/mysql2';
import type { MySql2Database, MySql2RawExecuteResult } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { createPool as createCallbackPool } from 'mysql2';
import type { FieldPacket, ResultSetHeader } from 'mysql2/promise';
import { createConnection, createPool } from 'mysql2/promise';
import { describe, expect, expectTypeOf } from 'vitest';
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
		expect(!!Number(res[0]?.[0]?.tableExists)).toStrictEqual(false);
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
		expect(!!Number(res[0]?.[0]?.tableExists)).toStrictEqual(false);
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
		expect(!!Number(res[0]?.[0]?.tableExists)).toStrictEqual(true);
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

		// Connection is shared with other tests - switch back to the fixture's database afterwards
		try {
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
		} finally {
			await db.execute(`use drizzle`);
		}
	});

	test('managing multiple databases #2', async ({ db }) => {
		await db.execute('drop database if exists drizzle1;');
		await db.execute('drop database if exists drizzle2;');
		await db.execute('create database drizzle1;');
		await db.execute('create database drizzle2;');

		const client1 = await createConnection({ uri: process.env['MYSQL_CONNECTION_STRING'], database: 'drizzle1' });
		const client2 = await createConnection({ uri: process.env['MYSQL_CONNECTION_STRING'], database: 'drizzle2' });

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

		await db.execute('drop database drizzle1;');
		await db.execute('drop database drizzle2;');

		expect(result1).toEqual([{ id: 1, name: 'John', email: 'email' }]);
		expect(result2).toEqual([{ id: 1, name: 'John', email: 'email' }]);
	});
});

// https://github.com/drizzle-team/drizzle-orm/issues/5972
test('raw db.execute type matches returned data', async ({ db: fixtureDb }) => {
	const db = fixtureDb as unknown as MySql2Database;
	const table = sql.identifier('raw_execute_types');

	await db.execute<never>(sql`drop table if exists ${table}`);

	// DDL
	const created = await db.execute<never>(sql`create table ${table} (\`id\` int primary key, \`name\` text not null)`);
	expectTypeOf(created).toEqualTypeOf<[ResultSetHeader, undefined]>();
	expect(created).toEqual([expect.objectContaining({ affectedRows: 0 }), undefined]);

	// `insert` without returning
	const inserted = await db.execute<never>(sql`insert into ${table} values (1, 'John')`);
	expectTypeOf(inserted).toEqualTypeOf<[ResultSetHeader, undefined]>();
	expect(inserted).toEqual([expect.objectContaining({ affectedRows: 1 }), undefined]);

	// Simple select
	const selected = await db.execute<{ id: number; name: string }>(sql`select \`id\`, \`name\` from ${table}`);
	expectTypeOf(selected).toEqualTypeOf<[{ id: number; name: string }[], FieldPacket[]]>();
	expect(selected).toEqual([
		[{ id: 1, name: 'John' }],
		[expect.objectContaining({ name: 'id' }), expect.objectContaining({ name: 'name' })],
	]);

	// Multi-statement
	const multi = await db.execute(sql`insert into ${table} values (2, 'Jane'); select \`id\`, \`name\` from ${table}`);
	expectTypeOf(multi).toEqualTypeOf<MySql2RawExecuteResult>();
	expect(multi).toEqual([
		[expect.objectContaining({ affectedRows: 1 }), [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]],
		[undefined, [expect.objectContaining({ name: 'id' }), expect.objectContaining({ name: 'name' })]],
	]);

	await db.execute<never>(sql`drop table ${table}`);
});

describe('driver init', () => {
	const resolveConfig = (client: any) => {
		const cfg = client.config ?? client.pool?.config ?? client.connection?.config;
		return cfg?.connectionConfig ?? cfg;
	};

	test('client: promise pool', async () => {
		const client = createPool({ uri: process.env['MYSQL_CONNECTION_STRING'] });
		try {
			const db = drizzle({ client });
			// Don't force in constructor
			expect(resolveConfig(db.$client)?.supportBigNumbers).toBeFalsy();
			expect(resolveConfig(db.$client)?.bigNumberStrings).toBeFalsy();
			expect((await db.execute(sql`select 1 as ${sql.identifier('v')}`))[0]).toEqual([{ v: 1 }]);
		} finally {
			await client.end();
		}
	});

	test('client: promise pool `.pool` (issue workaround)', async () => {
		const pool = createPool({ uri: process.env['MYSQL_CONNECTION_STRING'] });
		try {
			const db = drizzle({ client: pool.pool as any });
			// Don't force in constructor
			expect(resolveConfig(db.$client)?.supportBigNumbers).toBeFalsy();
			expect(resolveConfig(db.$client)?.bigNumberStrings).toBeFalsy();
			expect((await db.execute(sql`select 1 as ${sql.identifier('v')}`))[0]).toEqual([{ v: 1 }]);
		} finally {
			await pool.end();
		}
	});

	test('client: callback pool', async () => {
		const client = createCallbackPool({ uri: process.env['MYSQL_CONNECTION_STRING'] });
		try {
			const db = drizzle({ client: client as any });
			// Don't force in constructor
			expect(resolveConfig(db.$client)?.supportBigNumbers).toBeFalsy();
			expect(resolveConfig(db.$client)?.bigNumberStrings).toBeFalsy();
			expect((await db.execute(sql`select 1 as ${sql.identifier('v')}`))[0]).toEqual([{ v: 1 }]);
		} finally {
			await new Promise<void>((resolve) => client.end(() => resolve()));
		}
	});

	test('client: promise connection', async () => {
		const client = await createConnection({ uri: process.env['MYSQL_CONNECTION_STRING'] });
		try {
			const db = drizzle({ client });
			// Don't force in constructor
			expect(resolveConfig(db.$client)?.supportBigNumbers).toBeFalsy();
			expect(resolveConfig(db.$client)?.bigNumberStrings).toBeFalsy();
			expect((await db.execute(sql`select 1 as ${sql.identifier('v')}`))[0]).toEqual([{ v: 1 }]);
		} finally {
			await client.end();
		}
	});

	test('connection string', async () => {
		const db = drizzle(process.env['MYSQL_CONNECTION_STRING']!);
		try {
			// Don't force in constructor
			expect(resolveConfig(db.$client)?.supportBigNumbers).toBeFalsy();
			expect(resolveConfig(db.$client)?.bigNumberStrings).toBeFalsy();
			expect((await db.execute(sql`select 1 as ${sql.identifier('v')}`))[0]).toEqual([{ v: 1 }]);
		} finally {
			await db.$client.end();
		}
	});
});

test('iterator rejects when connection is dropped mid-stream', async () => {
	const admin = await createConnection({ uri: process.env['MYSQL_CONNECTION_STRING'] });
	const pool = createPool({ uri: process.env['MYSQL_CONNECTION_STRING'], connectionLimit: 1 });
	const db = drizzle({ client: pool });

	try {
		const iter = db
			.select({ id: sql<number>`connection_id()`.as('id') })
			.from(sql`(select 1 from information_schema.columns a, information_schema.columns b limit 300000) t`)
			.iterator();

		let rows = 0;
		let error: any;
		try {
			for await (const row of iter) {
				if (rows++ > 0) continue;

				await admin.query(`kill ${Number(row.id)}`);
				await new Promise((resolve) => setTimeout(resolve, 200));
			}
		} catch (e) {
			error = e;
		}

		expect(error?.cause?.code).toBe('PROTOCOL_CONNECTION_LOST');
		expect(rows).toBeLessThan(300000);

		// Broken connection was discarded, pool hands out a working one
		expect((await db.execute(sql`select 1 as ${sql.identifier('v')}`))[0]).toEqual([{ v: 1 }]);
	} finally {
		await pool.end();
		await admin.end();
	}
});

test('transaction rejects with original error when connection is dropped', async () => {
	const admin = await createConnection({ uri: process.env['MYSQL_CONNECTION_STRING'] });
	const pool = createPool({ uri: process.env['MYSQL_CONNECTION_STRING'], connectionLimit: 1 });
	const db = drizzle({ client: pool });

	try {
		let error: any;
		try {
			await db.transaction(async (tx) => {
				const [rows] = await tx.execute(sql`select connection_id() as ${sql.identifier('id')}`);
				await admin.query(`kill ${Number((rows as any)[0].id)}`);
				await new Promise((resolve) => setTimeout(resolve, 200));
				await tx.execute(sql`select 1`);
			});
		} catch (e) {
			error = e;
		}

		// Original failure, not the rollback attempted on a dead connection
		expect(error?.query).toBe('select 1');

		// Broken connection was discarded, pool hands out a working one
		expect((await db.execute(sql`select 1 as ${sql.identifier('v')}`))[0]).toEqual([{ v: 1 }]);
	} finally {
		await pool.end();
		await admin.end();
	}
});
