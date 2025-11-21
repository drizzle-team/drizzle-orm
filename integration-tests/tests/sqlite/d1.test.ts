import { sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { migrate } from 'drizzle-orm/d1/migrator';
import { expect } from 'vitest';
import { randomString } from '~/utils';
import { d1Test as test } from './instrumentation';
import relations from './relations';
import { anotherUsersMigratorTable, tests, usersMigratorTable } from './sqlite-common';
import { tests as cacheTests } from './sqlite-common-cache';

test('migrator', async ({ db }) => {
	await db.run(sql`drop table if exists another_users`);
	await db.run(sql`drop table if exists users12`);
	await db.run(sql`drop table if exists __drizzle_migrations`);

	await migrate(db as DrizzleD1Database<never, typeof relations>, { migrationsFolder: './drizzle2/sqlite' });

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

test('migrator : migrate with custom table', async ({ db }) => {
	const customTable = randomString();
	await db.run(sql`drop table if exists another_users`);
	await db.run(sql`drop table if exists users12`);
	await db.run(sql`drop table if exists ${sql.identifier(customTable)}`);

	await migrate(db as DrizzleD1Database<never, typeof relations>, {
		migrationsFolder: './drizzle2/sqlite',
		migrationsTable: customTable,
	});

	// test if the custom migrations table was created
	const res = await db.all(sql`select * from ${sql.identifier(customTable)};`);
	expect(res.length > 0).toBeTruthy();

	// test if the migrated table are working as expected
	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
	const result = await db.select().from(usersMigratorTable);
	expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

	await db.run(sql`drop table another_users`);
	await db.run(sql`drop table users12`);
	await db.run(sql`drop table ${sql.identifier(customTable)}`);
});

const skip = [
	// Cannot convert 49,50,55 to a BigInt
	'insert bigint values',
	// SyntaxError: Unexpected token , in JSON at position 2
	'json insert',
	'insert many',
	'insert many with returning',
	/**
	 * TODO: Fix Bug! The objects should be equal
	 *
	 * See #528 for more details.
	 * Tldr the D1 driver does not execute joins successfully
	 */
	'partial join with alias',
	'full join with alias',
	'select from alias',
	'join view as subquery',
	'cross join',
];
cacheTests(test, skip);
tests(test, skip);
