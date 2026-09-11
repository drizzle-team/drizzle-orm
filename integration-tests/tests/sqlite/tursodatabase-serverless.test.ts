import { Database } from '@tursodatabase/database';
import { sql } from 'drizzle-orm';
import { getTableConfig, int, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { TursoDatabaseDatabase } from 'drizzle-orm/tursodatabase';
import { drizzle } from 'drizzle-orm/tursodatabase-serverless';
import { migrate } from 'drizzle-orm/tursodatabase-serverless/migrator';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { expect } from 'vitest';
import { tursoDatabaseServerlessTest as test } from './instrumentation';
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

	await migrate(db as TursoDatabaseDatabase<typeof relations>, { migrationsFolder: './drizzle2/sqlite' });

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

	const migratorRes = await migrate(db as TursoDatabaseDatabase<typeof relations>, {
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

	const migratorRes = await migrate(db as TursoDatabaseDatabase<typeof relations>, {
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

	await migrate(db as TursoDatabaseDatabase<typeof relations>, {
		migrationsFolder: './drizzle2/sqlite',
		migrationsTable,
	});

	const migratorRes = await migrate(db as TursoDatabaseDatabase<typeof relations>, {
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

	await migrate(db as TursoDatabaseDatabase<typeof relations>, { migrationsFolder: migrationDir });
	const res1 = await db.insert(users).values({ name: 'John', email: '', age: 30 }).returning();

	// second migration was not applied yet
	await expect(db.insert(users2).values({ name: 'John', email: '', age: 30 })).rejects.toThrowError();

	// insert migration with earlier timestamp
	mkdirSync(`${migrationDir}/20240202020202_second`, { recursive: true });
	writeFileSync(
		`${migrationDir}/20240202020202_second/migration.sql`,
		`CREATE TABLE "migration_users2" (\n"id" integer PRIMARY KEY NOT NULL,\n"name" text NOT NULL,\n"email" text NOT NULL\n,"age" integer\n);`,
	);
	await migrate(db as TursoDatabaseDatabase<typeof relations>, { migrationsFolder: migrationDir });

	const res2 = await db.insert(users2).values({ name: 'John', email: '', age: 30 }).returning();

	const expected = [{ id: 1, name: 'John', email: '', age: 30 }];
	expect(res1).toStrictEqual(expected);
	expect(res2).toStrictEqual(expected);

	rmSync(migrationDir, { recursive: true });
});

const TX_MODES = ['deferred', 'immediate', 'exclusive', 'concurrent'];

const passthrough = (target: any, prop: string | symbol) => {
	const desc = Object.getOwnPropertyDescriptor(target, prop);
	const value = Reflect.get(target, prop, target);
	if (desc && !desc.configurable && !desc.writable && 'value' in desc) return value;
	return typeof value === 'function' ? value.bind(target) : value;
};

const spyOnTransactionModes = (client: any) => {
	const accessed: string[] = [];
	const spied = new Proxy(client, {
		get(target, prop) {
			if (prop !== 'transactionAsync') return passthrough(target, prop);

			return (...args: any[]) => {
				const txn = target.transactionAsync(...args);

				return new Proxy(txn, {
					get(t, p) {
						if (typeof p === 'string' && TX_MODES.includes(p)) accessed.push(p);
						return passthrough(t, p);
					},
				});
			};
		},
	});

	return { spied, accessed };
};

const assertModeForwarded = async (client: Database, behavior: 'deferred' | 'immediate' | 'exclusive') => {
	const { spied, accessed } = spyOnTransactionModes(client);
	const db = drizzle({ client: spied, relations });
	const table = sql.identifier(`sls_tx_${behavior}`);

	await db.run(sql`drop table if exists ${table}`);
	await db.run(sql`create table ${table} (id integer primary key, v integer not null)`);

	try {
		await db.run(sql`insert into ${table} (id, v) values (1, 0)`);

		await db.transaction(async (tx) => {
			await tx.run(sql`update ${table} set v = v + 1 where id = 1`);
		}, { behavior });

		expect(accessed).toEqual([behavior]);
		expect(await db.all(sql`select v from ${table} where id = 1`)).toEqual([{ v: 1 }]);
	} finally {
		await db.run(sql`drop table if exists ${table}`);
	}
};

test('transaction mode: deferred', async ({ client }) => {
	await assertModeForwarded(client as Database, 'deferred');
});

test('transaction mode: immediate', async ({ client }) => {
	await assertModeForwarded(client as Database, 'immediate');
});

test('transaction mode: exclusive', async ({ client }) => {
	await assertModeForwarded(client as Database, 'exclusive');
});

test('transaction mode: default', async ({ client }) => {
	const { spied, accessed } = spyOnTransactionModes(client);
	const db = drizzle({ client: spied, relations });
	const table = sql.identifier('sls_tx_default');

	await db.run(sql`drop table if exists ${table}`);
	await db.run(sql`create table ${table} (id integer primary key, v integer not null)`);

	try {
		await db.run(sql`insert into ${table} (id, v) values (1, 0)`);

		await db.transaction(async (tx) => {
			await tx.run(sql`update ${table} set v = v + 1 where id = 1`);
		}, undefined);

		expect(accessed).toEqual([]);
		expect(await db.all(sql`select v from ${table} where id = 1`)).toEqual([{ v: 1 }]);
	} finally {
		await db.run(sql`drop table if exists ${table}`);
	}
});

test('transaction modes - concurrent', async ({ client }) => {
	const { spied, accessed } = spyOnTransactionModes(client);
	const db = drizzle({ client: spied, relations });
	const table = sql.identifier('sls_tx_concurrent');

	await db.run(sql`drop table if exists ${table}`);
	await db.run(sql`create table ${table} (id integer primary key, v integer not null)`);

	try {
		// No MVCC on db used in tests, will throw
		await db.transaction(async (tx) => {
			await tx.run(sql`insert into ${table} (id, v) values (1, 1)`);
		}, { behavior: 'concurrent' }).catch(() => null);

		expect(accessed).toEqual(['concurrent']);
		expect(await db.all(sql`select v from ${table}`)).toEqual([]);
	} finally {
		await db.run(sql`drop table if exists ${table}`);
	}
});

const skip: string[] = [
	'transaction mode: concurrent is rejected',
	// Uses async versions
	'sync transaction rollback',
	'sync nested transaction rollback',

	// ORDER BY clause is not supported in DELETE
	'delete with limit and order by',
	// ORDER BY is not supported in UPDATE
	'update with limit and order by',

	// Time-based test, unstable
	'$onUpdateFn and $onUpdate works updating',
];
tests(test, skip);
