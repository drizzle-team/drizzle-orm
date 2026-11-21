/* eslint-disable @typescript-eslint/no-unused-vars */
import 'dotenv/config';
import { eq, sql } from 'drizzle-orm';
import { alias, getViewConfig, int, mysqlTable, serial, text } from 'drizzle-orm/mysql-core';
import { describe, expect } from 'vitest';
import type { Test } from './instrumentation';
import { citiesMySchemaTable, mySchema, users2MySchemaTable, usersMySchemaTable } from './schema2';

async function setupReturningFunctionsTest(batch: (s: string[]) => Promise<void>) {
	await batch([`drop table if exists \`users_default_fn\``]);
	await batch([`create table \`users_default_fn\` (
					\`id\` varchar(256) primary key,
					\`name\` text not null
				);`]);
}

export function tests(test: Test, exclude: Set<string> = new Set<string>([])) {
	describe('mySchema_tests', () => {
		test.beforeEach(async ({ task, skip, db }) => {
			if (exclude.has(task.name) || (task.suite?.name && exclude.has(task.suite.name))) skip();
			await db.execute(sql`drop schema if exists \`mySchema\``);
			await db.execute(sql`create schema if not exists \`mySchema\``);

			await db.execute(
				sql`
						create table \`mySchema\`.\`userstest\` (
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
						create table \`mySchema\`.\`cities\` (
							\`id\` serial primary key,
							\`name\` text not null
						)
					`,
			);

			await db.execute(
				sql`
						create table \`mySchema\`.\`users2\` (
							\`id\` serial primary key,
							\`name\` text not null,
							\`city_id\` int references \`mySchema\`.\`cities\`(\`id\`)
						)
					`,
			);
		});
		// mySchema tests
		test('mySchema :: select all fields', async ({ db, push }) => {
			await db.insert(usersMySchemaTable).values({ name: 'John' });
			const result = await db.select().from(usersMySchemaTable);

			expect(result[0]!.createdAt).toBeInstanceOf(Date);
			// not timezone based timestamp, thats why it should not work here
			// t.assert(Math.abs(result[0]!.createdAt.getTime() - now) < 2000);
			expect(result).toEqual([{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);
		});

		test('mySchema :: select sql', async ({ db }) => {
			await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

			await db.insert(usersMySchemaTable).values({ name: 'John' });
			const users = await db.select({
				name: sql`upper(${usersMySchemaTable.name})`,
			}).from(usersMySchemaTable);

			expect(users).toEqual([{ name: 'JOHN' }]);
		});

		test('mySchema :: select typed sql', async ({ db }) => {
			await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

			await db.insert(usersMySchemaTable).values({ name: 'John' });
			const users = await db.select({
				name: sql<string>`upper(${usersMySchemaTable.name})`,
			}).from(usersMySchemaTable);

			expect(users).toEqual([{ name: 'JOHN' }]);
		});

		test('mySchema :: select distinct', async ({ db }) => {
			const usersDistinctTable = mysqlTable('users_distinct', {
				id: int('id').notNull(),
				name: text('name').notNull(),
			});

			await db.execute(sql`drop table if exists ${usersDistinctTable}`);
			await db.execute(sql`create table ${usersDistinctTable} (id int, name text)`);

			await db.insert(usersDistinctTable).values([
				{ id: 1, name: 'John' },
				{ id: 1, name: 'John' },
				{ id: 2, name: 'John' },
				{ id: 1, name: 'Jane' },
			]);
			const users = await db.selectDistinct().from(usersDistinctTable).orderBy(
				usersDistinctTable.id,
				usersDistinctTable.name,
			);

			await db.execute(sql`drop table ${usersDistinctTable}`);

			expect(users).toEqual([{ id: 1, name: 'Jane' }, { id: 1, name: 'John' }, { id: 2, name: 'John' }]);
		});

		test('mySchema :: insert returning sql', async ({ db }) => {
			await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

			const [result, _] = await db.insert(usersMySchemaTable).values({ name: 'John' });

			expect(result.insertId).toBe(1);
		});

		test('mySchema :: delete returning sql', async ({ db }) => {
			await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

			await db.insert(usersMySchemaTable).values({ name: 'John' });
			const users = await db.delete(usersMySchemaTable).where(eq(usersMySchemaTable.name, 'John'));

			expect(users[0].affectedRows).toBe(1);
		});

		test('mySchema :: update with returning partial', async ({ db }) => {
			await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

			await db.insert(usersMySchemaTable).values({ name: 'John' });
			const updatedUsers = await db.update(usersMySchemaTable).set({ name: 'Jane' }).where(
				eq(usersMySchemaTable.name, 'John'),
			);

			const users = await db.select({ id: usersMySchemaTable.id, name: usersMySchemaTable.name }).from(
				usersMySchemaTable,
			)
				.where(
					eq(usersMySchemaTable.id, 1),
				);

			expect(updatedUsers[0].changedRows).toBe(1);

			expect(users).toEqual([{ id: 1, name: 'Jane' }]);
		});

		test('mySchema :: delete with returning all fields', async ({ db }) => {
			await db.insert(usersMySchemaTable).values({ name: 'John' });
			const deletedUser = await db.delete(usersMySchemaTable).where(eq(usersMySchemaTable.name, 'John'));

			expect(deletedUser[0].affectedRows).toBe(1);
		});

		test('mySchema :: insert + select', async ({ db }) => {
			await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

			await db.insert(usersMySchemaTable).values({ name: 'John' });
			const result = await db.select().from(usersMySchemaTable);
			expect(result).toEqual([{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);

			await db.insert(usersMySchemaTable).values({ name: 'Jane' });
			const result2 = await db.select().from(usersMySchemaTable);
			expect(result2).toEqual([
				{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result2[0]!.createdAt },
				{ id: 2, name: 'Jane', verified: false, jsonb: null, createdAt: result2[1]!.createdAt },
			]);
		});

		test('mySchema :: insert with overridden default values', async ({ db }) => {
			await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

			await db.insert(usersMySchemaTable).values({ name: 'John', verified: true });
			const result = await db.select().from(usersMySchemaTable);

			expect(result).toEqual([{ id: 1, name: 'John', verified: true, jsonb: null, createdAt: result[0]!.createdAt }]);
		});

		test('mySchema :: insert many', async ({ db }) => {
			await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

			await db.insert(usersMySchemaTable).values([
				{ name: 'John' },
				{ name: 'Bruce', jsonb: ['foo', 'bar'] },
				{ name: 'Jane' },
				{ name: 'Austin', verified: true },
			]);
			const result = await db.select({
				id: usersMySchemaTable.id,
				name: usersMySchemaTable.name,
				jsonb: usersMySchemaTable.jsonb,
				verified: usersMySchemaTable.verified,
			}).from(usersMySchemaTable);

			expect(result).toEqual([
				{ id: 1, name: 'John', jsonb: null, verified: false },
				{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
				{ id: 3, name: 'Jane', jsonb: null, verified: false },
				{ id: 4, name: 'Austin', jsonb: null, verified: true },
			]);
		});

		test('mySchema :: select with group by as field', async ({ db }) => {
			await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

			await db.insert(usersMySchemaTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

			const result = await db.select({ name: usersMySchemaTable.name }).from(usersMySchemaTable)
				.groupBy(usersMySchemaTable.name);

			expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }]);
		});

		test('mySchema :: select with group by as column + sql', async ({ db }) => {
			await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

			await db.insert(usersMySchemaTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

			const result = await db.select({ name: usersMySchemaTable.name }).from(usersMySchemaTable)
				.groupBy(usersMySchemaTable.id, sql`${usersMySchemaTable.name}`);

			expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
		});

		test('mySchema :: build query', async ({ db }) => {
			const query = db.select({ id: usersMySchemaTable.id, name: usersMySchemaTable.name }).from(usersMySchemaTable)
				.groupBy(usersMySchemaTable.id, usersMySchemaTable.name)
				.toSQL();

			expect(query).toEqual({
				sql:
					`select \`id\`, \`name\` from \`mySchema\`.\`userstest\` group by \`mySchema\`.\`userstest\`.\`id\`, \`mySchema\`.\`userstest\`.\`name\``,
				params: [],
			});
		});

		test('mySchema :: insert with spaces', async ({ db }) => {
			await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

			await db.insert(usersMySchemaTable).values({ name: sql`'Jo   h     n'` });
			const result = await db.select({ id: usersMySchemaTable.id, name: usersMySchemaTable.name }).from(
				usersMySchemaTable,
			);

			expect(result).toEqual([{ id: 1, name: 'Jo   h     n' }]);
		});

		test('mySchema :: prepared statement with placeholder in .where', async ({ db }) => {
			await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

			await db.insert(usersMySchemaTable).values({ name: 'John' });
			const stmt = db.select({
				id: usersMySchemaTable.id,
				name: usersMySchemaTable.name,
			}).from(usersMySchemaTable)
				.where(eq(usersMySchemaTable.id, sql.placeholder('id')))
				.prepare();
			const result = await stmt.execute({ id: 1 });

			expect(result).toEqual([{ id: 1, name: 'John' }]);
		});

		test('mySchema :: select from tables with same name from different schema using alias', async ({ db }) => {
			await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

			await db.execute(sql`drop table if exists \`userstest\``);
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

			await db.insert(usersMySchemaTable).values({ id: 10, name: 'Ivan' });
			await db.insert(usersMySchemaTable).values({ id: 11, name: 'Hans' });

			const customerAlias = alias(usersMySchemaTable, 'customer');

			const result = await db
				.select().from(usersMySchemaTable)
				.leftJoin(customerAlias, eq(customerAlias.id, 11))
				.where(eq(usersMySchemaTable.id, 10));

			expect(result).toEqual([{
				userstest: {
					id: 10,
					name: 'Ivan',
					verified: false,
					jsonb: null,
					createdAt: result[0]!.userstest.createdAt,
				},
				customer: {
					id: 11,
					name: 'Hans',
					verified: false,
					jsonb: null,
					createdAt: result[0]!.customer!.createdAt,
				},
			}]);
		});

		test('mySchema :: view', async ({ db }) => {
			const newYorkers1 = mySchema.view('new_yorkers')
				.as((qb) => qb.select().from(users2MySchemaTable).where(eq(users2MySchemaTable.cityId, 1)));

			const newYorkers2 = mySchema.view('new_yorkers', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				cityId: int('city_id').notNull(),
			}).as(sql`select * from ${users2MySchemaTable} where ${eq(users2MySchemaTable.cityId, 1)}`);

			const newYorkers3 = mySchema.view('new_yorkers', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				cityId: int('city_id').notNull(),
			}).existing();

			await db.execute(sql`create view ${newYorkers1} as ${getViewConfig(newYorkers1).query}`);

			await db.insert(citiesMySchemaTable).values([{ name: 'New York' }, { name: 'Paris' }]);

			await db.insert(users2MySchemaTable).values([
				{ name: 'John', cityId: 1 },
				{ name: 'Jane', cityId: 1 },
				{ name: 'Jack', cityId: 2 },
			]);

			{
				const result = await db.select().from(newYorkers1);
				expect(result).toEqual([
					{ id: 1, name: 'John', cityId: 1 },
					{ id: 2, name: 'Jane', cityId: 1 },
				]);
			}

			{
				const result = await db.select().from(newYorkers2);
				expect(result).toEqual([
					{ id: 1, name: 'John', cityId: 1 },
					{ id: 2, name: 'Jane', cityId: 1 },
				]);
			}

			{
				const result = await db.select().from(newYorkers3);
				expect(result).toEqual([
					{ id: 1, name: 'John', cityId: 1 },
					{ id: 2, name: 'Jane', cityId: 1 },
				]);
			}

			{
				const result = await db.select({ name: newYorkers1.name }).from(newYorkers1);
				expect(result).toEqual([
					{ name: 'John' },
					{ name: 'Jane' },
				]);
			}

			await db.execute(sql`drop view ${newYorkers1}`);
		});
	});
}
