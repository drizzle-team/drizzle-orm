import { sql } from 'drizzle-orm';
import { boolean, json, mysqlTable, serial, text, timestamp, varchar } from 'drizzle-orm/mysql-core';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { describe, expect } from 'vitest';
import { mysqlTest as test } from '../instrumentation';

const usersTable = mysqlTable('userstest', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	jsonb: json('jsonb').$type<string[]>(),
	createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
});

test.beforeEach(async ({ db }) => {
	await db.execute(sql`drop table if exists \`userstest\``);
	await db.execute(sql`drop table if exists \`users2\``);
	await db.execute(sql`drop table if exists \`cities\``);

	await db.execute(
		sql`
			create table \`userstest\` (
				\`id\` serial primary key,
				\`name\` text not null,
				\`verified\` boolean not null default false,
				\`jsonb\` json,
				\`created_at\` timestamp not null default now()
			)
		`,
	);

	await db.execute(
		sql`
			create table \`users2\` (
				\`id\` serial primary key,
				\`name\` text not null,
				\`city_id\` int references \`cities\`(\`id\`)
			)
		`,
	);

	await db.execute(
		sql`
			create table \`cities\` (
				\`id\` serial primary key,
				\`name\` text not null
			)
		`,
	);
});

async function setupReturningFunctionsTest(db: MySql2Database<any>) {
	await db.execute(sql`drop table if exists \`users_default_fn\``);
	await db.execute(
		sql`
			create table \`users_default_fn\` (
				\`id\` varchar(256) primary key,
				\`name\` text not null
			);
		`,
	);
}

describe('$returningId', () => {
	test('insert $returningId: serail as id', async ({ db }) => {
		const result = await db.insert(usersTable).values({ name: 'John' }).$returningId();
		//    ^?
		expect(result).toStrictEqual([{ id: 1 }]);
	});

	test('insert $returningId: serail as id, batch insert', async ({ db }) => {
		const result = await db.insert(usersTable).values([{ name: 'John' }, { name: 'John1' }]).$returningId();
		//    ^?
		expect(result).toStrictEqual([{ id: 1 }, { id: 2 }]);
	});

	test('insert $returningId: $default as primary key', async ({ db }) => {
		const uniqueKeys = ['ao865jf3mcmkfkk8o5ri495z', 'dyqs529eom0iczo2efxzbcut'];
		let iterator = 0;

		const usersTableDefFn = mysqlTable('users_default_fn', {
			customId: varchar('id', { length: 256 }).primaryKey().$defaultFn(() => {
				const value = uniqueKeys[iterator]!;
				iterator++;
				return value;
			}),
			name: text('name').notNull(),
		});

		await setupReturningFunctionsTest(db);

		const result = await db.insert(usersTableDefFn).values([{ name: 'John' }, { name: 'John1' }])
			//    ^?
			.$returningId();
		expect(result).toStrictEqual([
			{ customId: 'ao865jf3mcmkfkk8o5ri495z' },
			{ customId: 'dyqs529eom0iczo2efxzbcut' },
		]);
	});

	test('insert $returningId: $default as primary key with value', async ({ db }) => {
		const uniqueKeys = ['ao865jf3mcmkfkk8o5ri495z', 'dyqs529eom0iczo2efxzbcut'];
		let iterator = 0;

		const usersTableDefFn = mysqlTable('users_default_fn', {
			customId: varchar('id', { length: 256 }).primaryKey().$defaultFn(() => {
				const value = uniqueKeys[iterator]!;
				iterator++;
				return value;
			}),
			name: text('name').notNull(),
		});

		await setupReturningFunctionsTest(db);

		const result = await db.insert(usersTableDefFn).values([{ name: 'John', customId: 'test' }, { name: 'John1' }])
			//    ^?
			.$returningId();
		expect(result).toStrictEqual([{ customId: 'test' }, { customId: 'ao865jf3mcmkfkk8o5ri495z' }]);
	});
});
