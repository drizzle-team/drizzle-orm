import { Database } from '@tursodatabase/sync';
import { sql, TransactionRollbackError } from 'drizzle-orm';
import { getTableConfig, int, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { drizzle, type TursoDatabaseSyncDatabase } from 'drizzle-orm/tursodatabase-sync';
import { migrate } from 'drizzle-orm/tursodatabase-sync/migrator';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { expect } from 'vitest';
import { tursoDatabaseSyncTest as test } from './instrumentation';
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

	await migrate(db as TursoDatabaseSyncDatabase<typeof relations>, { migrationsFolder: './drizzle2/sqlite' });

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

	const migratorRes = await migrate(db as TursoDatabaseSyncDatabase<typeof relations>, {
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

	const migratorRes = await migrate(db as TursoDatabaseSyncDatabase<typeof relations>, {
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

	await migrate(db as TursoDatabaseSyncDatabase<typeof relations>, {
		migrationsFolder: './drizzle2/sqlite',
		migrationsTable,
	});

	const migratorRes = await migrate(db as TursoDatabaseSyncDatabase<typeof relations>, {
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

	await migrate(db as TursoDatabaseSyncDatabase<typeof relations>, { migrationsFolder: migrationDir });
	const res1 = await db.insert(users).values({ name: 'John', email: '', age: 30 }).returning();

	// second migration was not applied yet
	await expect(db.insert(users2).values({ name: 'John', email: '', age: 30 })).rejects.toThrowError();

	// insert migration with earlier timestamp
	mkdirSync(`${migrationDir}/20240202020202_second`, { recursive: true });
	writeFileSync(
		`${migrationDir}/20240202020202_second/migration.sql`,
		`CREATE TABLE "migration_users2" (\n"id" integer PRIMARY KEY NOT NULL,\n"name" text NOT NULL,\n"email" text NOT NULL\n,"age" integer\n);`,
	);
	await migrate(db as TursoDatabaseSyncDatabase<typeof relations>, { migrationsFolder: migrationDir });

	const res2 = await db.insert(users2).values({ name: 'John', email: '', age: 30 }).returning();

	const expected = [{ id: 1, name: 'John', email: '', age: 30 }];
	expect(res1).toStrictEqual(expected);
	expect(res2).toStrictEqual(expected);

	rmSync(migrationDir, { recursive: true });
});

const assertLockBehavior = async (behavior: 'deferred' | 'immediate' | 'exclusive' | undefined) => {
	const dir = mkdtempSync(join(tmpdir(), `drzl-turso-sync-${behavior ?? 'default'}-`));
	const clientA = new Database({ path: join(dir, 'db.sqlite') });
	const clientB = new Database({ path: join(dir, 'db.sqlite') });
	const expectBlocked = behavior !== undefined && behavior !== 'deferred';

	try {
		const db = drizzle({ client: clientA });

		await db.run(sql`create table behavior_lock (id integer primary key, v integer not null)`);
		await db.run(sql`insert into behavior_lock (id, v) values (1, 0)`);

		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});

		const txn = db.transaction(async (tx) => {
			await gate;
			await tx.run(sql`update behavior_lock set v = v + 1 where id = 1`);
		}, behavior ? { behavior } : undefined);

		await new Promise((resolve) => setTimeout(resolve, 50));

		let blocked = false;
		try {
			await (await clientB.prepare('update behavior_lock set v = v + 100 where id = 1')).run();
		} catch (e) {
			blocked = /locked/i.test((e as Error).message);
		}

		release();
		await txn;

		expect(blocked).toBe(expectBlocked);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
};

test('transaction mode: deferred', async () => {
	await assertLockBehavior('deferred');
});

test('transaction mode: immediate', async () => {
	await assertLockBehavior('immediate');
});

test('transaction mode: exclusive', async () => {
	await assertLockBehavior('exclusive');
});

test('transaction mode: default', async () => {
	await assertLockBehavior(undefined);
});

test('transaction modes - concurrent', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'drzl-turso-sync-concurrent-'));
	const clientA = new Database({ path: join(dir, 'db.sqlite') });
	const clientB = new Database({ path: join(dir, 'db.sqlite') });

	try {
		const dbA = drizzle({ client: clientA });
		const dbB = drizzle({ client: clientB });

		await dbA.run(sql`PRAGMA journal_mode = 'mvcc'`);
		await dbA.run(sql`create table concurrent_rows (id integer primary key, v integer not null)`);
		await dbA.run(sql`insert into concurrent_rows (id, v) values (1, 0), (2, 0)`);
		await dbB.run(sql`PRAGMA journal_mode = 'mvcc'`);

		let releaseA!: () => void;
		let releaseB!: () => void;
		const aWrote = new Promise<void>((resolve) => {
			releaseA = resolve;
		});
		const bWrote = new Promise<void>((resolve) => {
			releaseB = resolve;
		});

		const txnA = dbA.transaction(async (tx) => {
			await tx.run(sql`update concurrent_rows set v = v + 1 where id = 1`);
			releaseA();
			await bWrote;
		}, { behavior: 'concurrent' });

		const txnB = dbB.transaction(async (tx) => {
			await tx.run(sql`update concurrent_rows set v = v + 1 where id = 2`);
			releaseB();
			await aWrote;
		}, { behavior: 'concurrent' });

		await Promise.all([txnA, txnB]);

		const rows = await dbA.all(sql`select id, v from concurrent_rows order by id`);
		expect(rows).toEqual([{ id: 1, v: 1 }, { id: 2, v: 1 }]);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

const skip = [
	'transaction mode: concurrent is rejected',
	// Uses async versions
	'sync transaction rollback',
	'sync nested transaction rollback',

	// ORDER BY clause is not supported in DELETE
	'delete with limit and order by',
	// ORDER BY is not supported in UPDATE
	'update with limit and order by',

	// Raw query field names differ
	'insert via db.get',
	'insert via db.get w/ query builder',
];
tests(test, skip);
