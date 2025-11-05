import { Database } from '@tursodatabase/database';
import { sql } from 'drizzle-orm';
import { type BaseSQLiteDatabase, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { TursoDatabaseDatabase } from 'drizzle-orm/tursodatabase';
import { drizzle } from 'drizzle-orm/tursodatabase/database';
import { migrate } from 'drizzle-orm/tursodatabase/migrator';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { skipTests } from '~/common';
import relations from './relations';
import { tests } from './sqlite-common';

declare module 'vitest' {
	interface TestContext {
		sqlite: {
			db: BaseSQLiteDatabase<'async' | 'sync', any, Record<string, never>, typeof relations>;
		};
	}
}

const ENABLE_LOGGING = false;

let db: TursoDatabaseDatabase<never, typeof relations>;
let client: Database | undefined;

beforeAll(async () => {
	const dbPath = ':memory:';
	client = new Database(dbPath);
	db = drizzle({ client, logger: ENABLE_LOGGING, relations });
});

afterAll(async () => {
	client?.close();
});

beforeEach((ctx) => {
	ctx.sqlite = {
		db,
	};
});

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

test('migrator', async () => {
	await db.run(sql`drop table if exists another_users`);
	await db.run(sql`drop table if exists users12`);
	await db.run(sql`drop table if exists __drizzle_migrations`);

	await migrate(db, { migrationsFolder: './drizzle2/sqlite' });

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

beforeEach((ctx) => {
	// FROM clause is not supported in UPDATE
	const skip = [
		'update ... from',
		'update ... from with alias',
		'update ... from with join',
	];

	if (skip.includes(ctx.task.name)) {
		ctx.skip();
	}
});

skipTests([
	// Subquery in WHERE clause is not supported
	'RQB v2 simple find many - with relation',
	'RQB v2 transaction find many - with relation',
	'RQB v2 simple find first - with relation',
	'RQB v2 transaction find first - with relation',
	'$count',
	'$count embedded',
	'$count embedded reuse',
	'$count embedded with filters',
	// CROSS JOIN is not supported
	'cross join',
	// ORDER BY is not supported for compound SELECTs yet
	'set operations (union) from query builder with subquery',
	'set operations (union) as function',
	'set operations (union all) from query builder',
	'set operations (intersect) from query builder',
	'set operations (except) as function',
	'set operations (mixed all) as function with subquery',
	// ORDER BY clause is not supported in DELETE
	'delete with limit and order by',
	// SAVEPOINT not supported yet
	'nested transaction',
	'nested transaction rollback',
	// WITH clause is not supported in DELETE
	'with ... delete',
	// WITH clause is not supported
	'with ... insert',
	// WITH clause is not supported in UPDATE
	'with ... update',
	// IN (...subquery) in WHERE clause is not supported
	'with ... select',
	// EXISTS in WHERE clause is not supported
	'select with exists',
	// RETURNING currently not implemented for DELETE statements.
	'delete with returning partial',
	'delete with returning all fields',
	'delete returning sql',
	// FROM clause is not supported in UPDATE
	'update ... from',
	'update ... from with alias',
	'update ... from with join',
	// ORDER BY is not supported in UPDATE
	'update with limit and order by',
	// TBD
	'join on aliased sql from with clause',
	'join view as subquery',
]);
tests();
