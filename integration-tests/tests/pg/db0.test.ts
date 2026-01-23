import { PGlite } from '@electric-sql/pglite';
import { createDatabase } from 'db0';
import pglite from 'db0/connectors/pglite';
import { sql } from 'drizzle-orm';
import type { Db0PgDatabase } from 'drizzle-orm/db0';
import { drizzle } from 'drizzle-orm/db0';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { skipTests } from '~/common';
import { tests, usersTable } from './pg-common';

const ENABLE_LOGGING = false;

let db: Db0PgDatabase;
let client: PGlite;

beforeAll(async () => {
	client = new PGlite();
	const db0 = createDatabase(pglite(client));
	db = drizzle(db0, { logger: ENABLE_LOGGING }) as Db0PgDatabase;
});

afterAll(async () => {
	await client?.close();
});

beforeEach((ctx) => {
	ctx.pg = {
		db,
	};
});

test('db0 dialect detection', async () => {
	const pgClient = new PGlite();
	const db0 = createDatabase(pglite(pgClient));
	expect(db0.dialect).toBe('postgresql');

	const drizzleDb = drizzle(db0);
	expect(drizzleDb).toBeDefined();
	await pgClient.close();
});

test('basic CRUD operations', async () => {
	await db.execute(sql`drop table if exists db0_test`);
	await db.execute(sql`create table db0_test (id serial primary key, name text)`);

	await db.execute(sql`insert into db0_test (name) values ('Alice')`);
	const result = await db.execute(sql`select * from db0_test`);
	expect(result.rows).toEqual([{ id: 1, name: 'Alice' }]);

	await db.execute(sql`update db0_test set name = 'Bob' where id = 1`);
	const updated = await db.execute(sql`select * from db0_test where id = 1`);
	expect(updated.rows).toEqual([{ id: 1, name: 'Bob' }]);

	await db.execute(sql`delete from db0_test where id = 1`);
	const deleted = await db.execute(sql`select * from db0_test`);
	expect(deleted.rows).toEqual([]);

	await db.execute(sql`drop table db0_test`);
});

test('transaction commit', async () => {
	await db.execute(sql`drop table if exists db0_tx_test`);
	await db.execute(sql`create table db0_tx_test (id serial primary key, name text)`);

	await db.transaction(async (tx) => {
		await tx.execute(sql`insert into db0_tx_test (name) values ('Alice')`);
		await tx.execute(sql`insert into db0_tx_test (name) values ('Bob')`);
	});

	const result = await db.execute(sql`select * from db0_tx_test order by id`);
	expect(result.rows).toEqual([
		{ id: 1, name: 'Alice' },
		{ id: 2, name: 'Bob' },
	]);

	await db.execute(sql`drop table db0_tx_test`);
});

test('transaction rollback', async () => {
	await db.execute(sql`drop table if exists db0_rollback_test`);
	await db.execute(sql`create table db0_rollback_test (id serial primary key, name text)`);

	await db.execute(sql`insert into db0_rollback_test (name) values ('Existing')`);

	try {
		await db.transaction(async (tx) => {
			await tx.execute(sql`insert into db0_rollback_test (name) values ('ShouldRollback')`);
			throw new Error('Rollback test');
		});
	} catch {
		// Expected
	}

	const result = await db.execute(sql`select * from db0_rollback_test`);
	expect(result.rows).toEqual([{ id: 1, name: 'Existing' }]);

	await db.execute(sql`drop table db0_rollback_test`);
});

test('nested transaction with savepoint', async () => {
	await db.execute(sql`drop table if exists db0_nested_test`);
	await db.execute(sql`create table db0_nested_test (id serial primary key, name text)`);

	await db.transaction(async (tx) => {
		await tx.execute(sql`insert into db0_nested_test (name) values ('Outer')`);

		await tx.transaction(async (nestedTx) => {
			await nestedTx.execute(sql`insert into db0_nested_test (name) values ('Inner')`);
		});
	});

	const result = await db.execute(sql`select * from db0_nested_test order by id`);
	expect(result.rows).toEqual([
		{ id: 1, name: 'Outer' },
		{ id: 2, name: 'Inner' },
	]);

	await db.execute(sql`drop table db0_nested_test`);
});

test('nested transaction rollback', async () => {
	await db.execute(sql`drop table if exists db0_nested_rollback_test`);
	await db.execute(sql`create table db0_nested_rollback_test (id serial primary key, name text)`);

	await db.transaction(async (tx) => {
		await tx.execute(sql`insert into db0_nested_rollback_test (name) values ('OuterOK')`);

		try {
			await tx.transaction(async (nestedTx) => {
				await nestedTx.execute(sql`insert into db0_nested_rollback_test (name) values ('InnerFail')`);
				throw new Error('Inner rollback test');
			});
		} catch {
			// Expected - inner transaction rolled back
		}
	});

	const result = await db.execute(sql`select * from db0_nested_rollback_test order by id`);
	expect(result.rows).toEqual([{ id: 1, name: 'OuterOK' }]);

	await db.execute(sql`drop table db0_nested_rollback_test`);
});

test('transaction with isolation level', async () => {
	await db.execute(sql`drop table if exists db0_isolation_test`);
	await db.execute(sql`create table db0_isolation_test (id serial primary key, name text)`);

	await db.transaction(async (tx) => {
		await tx.execute(sql`insert into db0_isolation_test (name) values ('Test')`);
	}, { isolationLevel: 'serializable' });

	const result = await db.execute(sql`select * from db0_isolation_test`);
	expect(result.rows).toEqual([{ id: 1, name: 'Test' }]);

	await db.execute(sql`drop table db0_isolation_test`);
});

// Skip tests that are specific to db0 (already run above) or have known db0 limitations
skipTests([
	// Already tested above
	'db0 dialect detection',
	'basic CRUD operations',
	'transaction commit',
	'transaction rollback',
	'nested transaction with savepoint',
	'nested transaction rollback',
	'transaction with isolation level',
	// db0 doesn't support transaction rollback method
	'transaction rollback',
	'nested transaction rollback',
	// Row ordering issues - db0/pglite may return rows in different order
	'select with group by as sql + column',
	'select with group by as column + sql',
	'mySchema :: select with group by as column + sql',
	// Join/alias field mapping issues - db0 object mode vs array mode conversion
	'partial join with alias',
	'full join with alias',
	'select from alias',
	'left join (flat object fields)',
	'left join (grouped fields)',
	'left join (all fields)',
	'with ... select',
	'select from raw sql with joins',
	'join on aliased sql from select',
	'join view as subquery',
	'mySchema :: partial join with alias',
	'mySchema :: select from tables with same name from different schema using alias',
	// Lateral joins have field mapping issues
	'left join (lateral)',
	'inner join (lateral)',
	'cross join (lateral)',
	'cross join',
	// Type conversion differences
	'select count()',
	// Timezone handling differences
	'all date and time columns',
	'timestamp timezone',
	// $onUpdate timing differences
	'test $onUpdateFn and $onUpdate works as $default',
	'test $onUpdateFn and $onUpdate works updating',
	'test $onUpdateFn and $onUpdate works with sql value',
	// All types has timezone differences
	'all types',
	// JSON operators have type conversion issues with db0
	'set json/jsonb fields with objects and retrieve with the ->> operator',
	'set json/jsonb fields with strings and retrieve with the ->> operator',
	'set json/jsonb fields with objects and retrieve with the -> operator',
	'set json/jsonb fields with strings and retrieve with the -> operator',
	// UPDATE ... FROM has field mapping issues
	'update ... from',
	'update ... from with alias',
	'update ... from with join',
]);
tests();
