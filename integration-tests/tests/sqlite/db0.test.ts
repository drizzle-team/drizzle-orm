import { createDatabase } from 'db0';
import sqlite from 'db0/connectors/better-sqlite3';
import { sql } from 'drizzle-orm';
import type { Db0SQLiteDatabase } from 'drizzle-orm/db0';
import { drizzle } from 'drizzle-orm/db0';
import { beforeAll, beforeEach, expect, test } from 'vitest';
import { skipTests } from '~/common';
import { anotherUsersMigratorTable, tests, usersMigratorTable } from './sqlite-common';

const ENABLE_LOGGING = false;

let db: Db0SQLiteDatabase;

beforeAll(async () => {
	const dbPath = process.env['SQLITE_DB_PATH'] ?? ':memory:';
	const db0 = createDatabase(sqlite({ name: dbPath }));
	db = drizzle(db0, { logger: ENABLE_LOGGING });
});

beforeEach((ctx) => {
	ctx.sqlite = {
		db,
	};
});

test('db0 dialect detection', async () => {
	const dbPath = process.env['SQLITE_DB_PATH'] ?? ':memory:';
	const db0 = createDatabase(sqlite({ name: dbPath }));
	expect(db0.dialect).toBe('sqlite');

	const drizzleDb = drizzle(db0);
	expect(drizzleDb).toBeDefined();
});

test('drizzle.mock() returns SQLite instance', () => {
	const mockDb = drizzle.mock();
	expect(mockDb).toBeDefined();
});

test('config object syntax', async () => {
	const dbPath = process.env['SQLITE_DB_PATH'] ?? ':memory:';
	const db0 = createDatabase(sqlite({ name: dbPath }));
	const configDb = drizzle({ client: db0 });
	expect(configDb).toBeDefined();
});

test('throws on MySQL dialect', () => {
	const mockClient = { dialect: 'mysql' } as any;
	expect(() => drizzle(mockClient)).toThrow('MySQL support is not yet implemented');
});

test('throws on unknown dialect', () => {
	const mockClient = { dialect: 'unknown' } as any;
	expect(() => drizzle(mockClient)).toThrow('Unsupported db0 dialect');
});

test('basic CRUD operations', async () => {
	await db.run(sql`drop table if exists db0_test`);
	await db.run(sql`create table db0_test (id integer primary key, name text)`);

	await db.run(sql`insert into db0_test (name) values ('Alice')`);
	const result = await db.all(sql`select * from db0_test`);
	expect(result).toEqual([{ id: 1, name: 'Alice' }]);

	await db.run(sql`update db0_test set name = 'Bob' where id = 1`);
	const updated = await db.get(sql`select * from db0_test where id = 1`);
	expect(updated).toEqual({ id: 1, name: 'Bob' });

	await db.run(sql`delete from db0_test where id = 1`);
	const deleted = await db.all(sql`select * from db0_test`);
	expect(deleted).toEqual([]);

	await db.run(sql`drop table db0_test`);
});

test('transaction commit', async () => {
	await db.run(sql`drop table if exists db0_tx_test`);
	await db.run(sql`create table db0_tx_test (id integer primary key, name text)`);

	await db.transaction(async (tx) => {
		await tx.run(sql`insert into db0_tx_test (name) values ('Alice')`);
		await tx.run(sql`insert into db0_tx_test (name) values ('Bob')`);
	});

	const result = await db.all(sql`select * from db0_tx_test order by id`);
	expect(result).toEqual([
		{ id: 1, name: 'Alice' },
		{ id: 2, name: 'Bob' },
	]);

	await db.run(sql`drop table db0_tx_test`);
});

test('transaction rollback', async () => {
	await db.run(sql`drop table if exists db0_rollback_test`);
	await db.run(sql`create table db0_rollback_test (id integer primary key, name text)`);

	await db.run(sql`insert into db0_rollback_test (name) values ('Existing')`);

	try {
		await db.transaction(async (tx) => {
			await tx.run(sql`insert into db0_rollback_test (name) values ('ShouldRollback')`);
			throw new Error('Rollback test');
		});
	} catch {
		// Expected
	}

	const result = await db.all(sql`select * from db0_rollback_test`);
	expect(result).toEqual([{ id: 1, name: 'Existing' }]);

	await db.run(sql`drop table db0_rollback_test`);
});

test('nested transaction with savepoint', async () => {
	await db.run(sql`drop table if exists db0_nested_test`);
	await db.run(sql`create table db0_nested_test (id integer primary key, name text)`);

	await db.transaction(async (tx) => {
		await tx.run(sql`insert into db0_nested_test (name) values ('Outer')`);

		await tx.transaction(async (nestedTx) => {
			await nestedTx.run(sql`insert into db0_nested_test (name) values ('Inner')`);
		});
	});

	const result = await db.all(sql`select * from db0_nested_test order by id`);
	expect(result).toEqual([
		{ id: 1, name: 'Outer' },
		{ id: 2, name: 'Inner' },
	]);

	await db.run(sql`drop table db0_nested_test`);
});

test('nested transaction rollback', async () => {
	await db.run(sql`drop table if exists db0_nested_rollback_test`);
	await db.run(sql`create table db0_nested_rollback_test (id integer primary key, name text)`);

	await db.transaction(async (tx) => {
		await tx.run(sql`insert into db0_nested_rollback_test (name) values ('OuterOK')`);

		try {
			await tx.transaction(async (nestedTx) => {
				await nestedTx.run(sql`insert into db0_nested_rollback_test (name) values ('InnerFail')`);
				throw new Error('Inner rollback test');
			});
		} catch {
			// Expected - inner transaction rolled back
		}
	});

	const result = await db.all(sql`select * from db0_nested_rollback_test order by id`);
	expect(result).toEqual([{ id: 1, name: 'OuterOK' }]);

	await db.run(sql`drop table db0_nested_rollback_test`);
});

skipTests([
	// db0 doesn't support bigint blobs in the same way
	'insert bigint values',
]);
tests();
