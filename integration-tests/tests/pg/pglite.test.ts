import { Name, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { describe, expect } from 'vitest';
import { tests } from './common';
import { pgliteTest as test } from './instrumentation';
import { usersMigratorTable, usersTable } from './schema';

tests(test, []);

describe('pglite', () => {
	test('migrator : default migration strategy', async ({ db }) => {
		await db.execute(sql`drop table if exists all_columns`);
		await db.execute(
			sql`drop table if exists users12`,
		);
		await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

		await migrate(db, { migrationsFolder: './drizzle2/pg' });

		await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });

		const result = await db.select().from(usersMigratorTable);

		expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

		await db.execute(sql`drop table all_columns`);
		await db.execute(sql`drop table users12`);
		await db.execute(sql`drop table "drizzle"."__drizzle_migrations"`);
	});

	test('insert via db.execute + select via db.execute', async ({ db }) => {
		await db.execute(sql`insert into ${usersTable} (${new Name(usersTable.name.name)}) values (${'John'})`);

		const result = await db.execute<{ id: number; name: string }>(sql`select id, name from "users"`);
		expect(Array.prototype.slice.call(result.rows)).toEqual([{ id: 1, name: 'John' }]);
	});

	test('insert via db.execute + returning', async ({ db }) => {
		const result = await db.execute<{ id: number; name: string }>(
			sql`insert into ${usersTable} (${new Name(
				usersTable.name.name,
			)}) values (${'John'}) returning ${usersTable.id}, ${usersTable.name}`,
		);
		expect(Array.prototype.slice.call(result.rows)).toEqual([{ id: 1, name: 'John' }]);
	});

	test('insert via db.execute w/ query builder', async ({ db }) => {
		const result = await db.execute<Pick<typeof usersTable.$inferSelect, 'id' | 'name'>>(
			db.insert(usersTable).values({ name: 'John' }).returning({ id: usersTable.id, name: usersTable.name }),
		);
		expect(Array.prototype.slice.call(result.rows)).toEqual([{ id: 1, name: 'John' }]);
	});
});
