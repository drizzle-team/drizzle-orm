import { createPool, type Pool } from '@drizzle-team/postgres';
import { sql } from 'drizzle-orm';
import { integer, pgTable, varchar } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres';
import { DrizzlePostgresClient } from 'drizzle-orm/postgres/client/effect';
import * as PostgresDrizzle from 'drizzle-orm/postgres/effect';
import * as ManagedRuntime from 'effect/ManagedRuntime';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

const connectionString = process.env['PG_CONNECTION_STRING'];
const suffix = Math.random().toString(36).slice(2, 8);

// The code says integer; the database column is bigint
const drifted = pgTable(`shape_drift_${suffix}`, { id: integer().primaryKey(), v: integer() });
// varchar(20) in code; the database starts at varchar(10), and a migration widens it
const migrated = pgTable(`shape_migrated_${suffix}`, { id: integer().primaryKey(), v: varchar({ length: 20 }) });

describe.skipIf(!connectionString)('schema in code vs the database', () => {
	let pool: Pool;
	let adb: ReturnType<typeof drizzle>;
	let runtime: ManagedRuntime.ManagedRuntime<any, any>;
	let edb: PostgresDrizzle.EffectPostgresDatabase;

	beforeAll(async () => {
		// one connection: a prepared statement is cached per connection, so the second run reuses the first's
		pool = createPool({ url: connectionString!, max: 1 });
		adb = drizzle({ client: pool });
		runtime = ManagedRuntime.make(DrizzlePostgresClient.layerFromPool(pool));
		edb = await runtime.runPromise(PostgresDrizzle.makeWithDefaults());
	});

	afterAll(async () => {
		await adb?.execute(sql`drop table if exists ${drifted}, ${migrated}`);
		await runtime?.dispose();
		await pool?.end();
	});

	beforeEach(async () => {
		await adb.execute(sql`drop table if exists ${drifted}, ${migrated}`);
		await adb.execute(sql`create table ${drifted} (id integer primary key, v bigint)`);
		await adb.execute(sql`insert into ${drifted} values (1, 5000000000)`);
		await adb.execute(sql`create table ${migrated} (id integer primary key, v varchar(10))`);
		await adb.execute(sql`insert into ${migrated} values (1, 'a')`);
	});

	describe('async', () => {
		// used to give 1
		test('a bigint column declared as integer gives the database number', async () => {
			const res1 = await adb.select({ v: drifted.v }).from(drifted);

			expect(res1).toStrictEqual([{ v: 5000000000 }]);
		});

		test('a prepared query still works after a migration changes its result type', async () => {
			const byId = adb.select({ v: migrated.v }).from(migrated).where(sql`${migrated.id} = ${sql.placeholder('id')}`)
				.prepare(`shape_migrated_async_${suffix}`);

			const res1 = await byId.execute({ id: 1 });
			await adb.execute(sql`alter table ${migrated} alter column v type varchar(20)`);
			const res2 = await byId.execute({ id: 1 });

			expect(res1).toStrictEqual([{ v: 'a' }]);
			expect(res2).toStrictEqual([{ v: 'a' }]);
		});
	});

	describe('Effect', () => {
		test('a bigint column declared as integer gives the database number', async () => {
			const res1 = await runtime.runPromise(edb.select({ v: drifted.v }).from(drifted));

			expect(res1).toStrictEqual([{ v: 5000000000 }]);
		});

		test('a prepared query still works after a migration changes its result type', async () => {
			const byId = edb.select({ v: migrated.v }).from(migrated).where(sql`${migrated.id} = ${sql.placeholder('id')}`)
				.prepare(`shape_migrated_effect_${suffix}`);

			const res1 = await runtime.runPromise(byId.execute({ id: 1 }));
			await adb.execute(sql`alter table ${migrated} alter column v type varchar(20)`);
			const res2 = await runtime.runPromise(byId.execute({ id: 1 }));

			expect(res1).toStrictEqual([{ v: 'a' }]);
			expect(res2).toStrictEqual([{ v: 'a' }]);
		});
	});
});
