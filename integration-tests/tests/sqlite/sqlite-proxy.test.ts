import { Name, sql } from 'drizzle-orm';
import { expect } from 'vitest';
import { proxyTest as test } from './instrumentation';
import { tests, usersTable } from './sqlite-common';
import { tests as cacheTests } from './sqlite-common-cache';

const skip = [
	// Different driver respond
	'insert via db.get w/ query builder',
	'insert via db.run + select via db.get',
	'insert via db.get',
	'insert via db.run + select via db.all',
];
cacheTests(test, skip);
tests(test, skip);

test.beforeEach(async ({ db }) => {
	await db.run(sql`drop table if exists ${usersTable}`);

	await db.run(sql`
		create table ${usersTable} (
		 id integer primary key,
		 name text not null,
		 verified integer not null default 0,
		 json blob,
		 created_at integer not null default (strftime('%s', 'now'))
		)
	`);
});

test('insert via db.get w/ query builder', async ({ db }) => {
	const inserted = await db.get<Pick<typeof usersTable.$inferSelect, 'id' | 'name'>>(
		db.insert(usersTable).values({ name: 'John' }).returning({ id: usersTable.id, name: usersTable.name }),
	);
	expect(inserted).toEqual([1, 'John']);
});

test('insert via db.run + select via db.get', async ({ db }) => {
	await db.run(sql`insert into ${usersTable} (${new Name(usersTable.name.name)}) values (${'John'})`);

	const result = await db.get<{ id: number; name: string }>(
		sql`select ${usersTable.id}, ${usersTable.name} from ${usersTable}`,
	);
	expect(result).toEqual([1, 'John']);
});

test('insert via db.get', async ({ db }) => {
	const inserted = await db.get<{ id: number; name: string }>(
		sql`insert into ${usersTable} (${new Name(
			usersTable.name.name,
		)}) values (${'John'}) returning ${usersTable.id}, ${usersTable.name}`,
	);
	expect(inserted).toEqual([1, 'John']);
});

test('insert via db.run + select via db.all', async ({ db }) => {
	await db.run(sql`insert into ${usersTable} (${new Name(usersTable.name.name)}) values (${'John'})`);

	const result = await db.all<{ id: number; name: string }>(sql`select id, name from "users"`);
	expect(result).toEqual([[1, 'John']]);
});
