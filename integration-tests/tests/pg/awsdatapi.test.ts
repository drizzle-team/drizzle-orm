// import 'dotenv/config';

import { test } from 'vitest';

// import { RDSDataClient } from '@aws-sdk/client-rds-data';
// import * as dotenv from 'dotenv';
// import { asc, eq, inArray, notInArray, sql, TransactionRollbackError } from 'drizzle-orm';
// import { relations } from 'drizzle-orm/_relations';
// import type { AwsDataApiPgDatabase } from 'drizzle-orm/aws-data-api/pg';
// import { drizzle } from 'drizzle-orm/aws-data-api/pg';
// import { migrate } from 'drizzle-orm/aws-data-api/pg/migrator';
// import {
// 	alias,
// 	boolean,
// 	date,
// 	integer,
// 	jsonb,
// 	pgTable,
// 	pgTableCreator,
// 	serial,
// 	text,
// 	time,
// 	timestamp,
// 	uuid,
// } from 'drizzle-orm/pg-core';
// import { Resource } from 'sst';
// import { afterAll, beforeAll, beforeEach, expect, expectTypeOf, test } from 'vitest';

// import type { Equal } from '../utils';
// import { Expect, randomString } from '../utils';
// import { clear, init, rqbPost, rqbUser } from './schema';

// dotenv.config();

// const ENABLE_LOGGING = false;

test('mock', () => {});

// const usersTable = pgTable('users', {
// 	id: serial('id').primaryKey(),
// 	name: text('name').notNull(),
// 	verified: boolean('verified').notNull().default(false),
// 	jsonb: jsonb('jsonb').$type<string[]>(),
// 	bestTexts: text('best_texts')
// 		.array()
// 		.default(sql`'{}'`)
// 		.notNull(),
// 	createdAt: timestamp('created_at', { withTimezone: true })
// 		.notNull()
// 		.defaultNow(),
// });

// const usersMigratorTable = pgTable('users12', {
// 	id: serial('id').primaryKey(),
// 	name: text('name').notNull(),
// 	email: text('email').notNull(),
// });

// const todo = pgTable('todo', {
// 	id: uuid('id').primaryKey(),
// 	title: text('title').notNull(),
// 	description: text('description'),
// });

// const todoRelations = relations(todo, (ctx) => ({
// 	user: ctx.many(todoUser),
// }));

// const user = pgTable('user', {
// 	id: uuid('id').primaryKey(),
// 	email: text('email').notNull(),
// });

// const userRelations = relations(user, (ctx) => ({
// 	todos: ctx.many(todoUser),
// }));

// const todoUser = pgTable('todo_user', {
// 	todoId: uuid('todo_id').references(() => todo.id),
// 	userId: uuid('user_id').references(() => user.id),
// });

// const todoToGroupRelations = relations(todoUser, (ctx) => ({
// 	todo: ctx.one(todo, {
// 		fields: [todoUser.todoId],
// 		references: [todo.id],
// 	}),
// 	user: ctx.one(user, {
// 		fields: [todoUser.userId],
// 		references: [user.id],
// 	}),
// }));

// const schema = {
// 	todo,
// 	todoRelations,
// 	user,
// 	userRelations,
// 	todoUser,
// 	todoToGroupRelations,
// };

// let db: AwsDataApiPgDatabase<typeof schema, typeof relationsV2>;

// beforeAll(async () => {
// 	const rdsClient = new RDSDataClient();

// 	db = drizzle({
// 		client: rdsClient,
// 		// @ts-ignore
// 		database: Resource.Postgres.database,
// 		// @ts-ignore
// 		secretArn: Resource.Postgres.secretArn,
// 		// @ts-ignore
// 		resourceArn: Resource.Postgres.clusterArn,
// 		logger: ENABLE_LOGGING,
// 		schema,
// 		relations: relationsV2,
// 	});
// });

// beforeEach(async () => {
// 	await db.execute(sql`drop schema public cascade`);
// 	await db.execute(sql`create schema public`);
// 	await db.execute(
// 		sql`
// 			create table users (
// 				id serial primary key,
// 				name text not null,
// 				verified boolean not null default false,
// 				jsonb jsonb,
// 				best_texts text[] not null default '{}',
// 				created_at timestamptz not null default now()
// 			)
// 		`,
// 	);

// 	await db.execute(
// 		sql`
// 			create table todo (
// 				id uuid primary key,
// 				title text not null,
// 				description text
// 			)
// 		`,
// 	);

// 	await db.execute(
// 		sql`
// 			create table "user" (
// 				id uuid primary key,
// 				email text not null
// 			)

// 		`,
// 	);

// 	await db.execute(
// 		sql`
// 			create table todo_user (
// 				todo_id uuid references todo(id),
// 				user_id uuid references "user"(id)
// 			)
// 		`,
// 	);
// });

// test('select all fields', async () => {
// 	const insertResult = await db.insert(usersTable).values({ name: 'John' });

// 	expect(insertResult.numberOfRecordsUpdated).toBe(1);

// 	const result = await db.select().from(usersTable);

// 	expect(result[0]!.createdAt).toBeInstanceOf(Date);
// 	// t.assert(Math.abs(result[0]!.createdAt.getTime() - now) < 100);
// 	expect(result).toEqual([
// 		{
// 			bestTexts: [],
// 			id: 1,
// 			name: 'John',
// 			verified: false,
// 			jsonb: null,
// 			createdAt: result[0]!.createdAt,
// 		},
// 	]);
// });

// test('select sql', async () => {
// 	await db.insert(usersTable).values({ name: 'John' });
// 	const users = await db
// 		.select({
// 			name: sql`upper(${usersTable.name})`,
// 		})
// 		.from(usersTable);

// 	expect(users).toEqual([{ name: 'JOHN' }]);
// });

// test('select with empty array in inArray', async () => {
// 	await db
// 		.insert(usersTable)
// 		.values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
// 	const users = await db
// 		.select({
// 			name: sql`upper(${usersTable.name})`,
// 		})
// 		.from(usersTable)
// 		.where(inArray(usersTable.id, []));

// 	expect(users).toEqual([]);
// });

// test('select with empty array in notInArray', async () => {
// 	await db
// 		.insert(usersTable)
// 		.values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
// 	const result = await db
// 		.select({
// 			name: sql`upper(${usersTable.name})`,
// 		})
// 		.from(usersTable)
// 		.where(notInArray(usersTable.id, []));

// 	expect(result).toEqual([
// 		{ name: 'JOHN' },
// 		{ name: 'JANE' },
// 		{ name: 'JANE' },
// 	]);
// });

// test('select typed sql', async () => {
// 	await db.insert(usersTable).values({ name: 'John' });
// 	const users = await db
// 		.select({
// 			name: sql<string>`upper(${usersTable.name})`,
// 		})
// 		.from(usersTable);

// 	expect(users).toEqual([{ name: 'JOHN' }]);
// });

// test('select distinct', async () => {
// 	const usersDistinctTable = pgTable('users_distinct', {
// 		id: integer('id').notNull(),
// 		name: text('name').notNull(),
// 	});

// 	await db.execute(sql`drop table if exists ${usersDistinctTable}`);
// 	await db.execute(
// 		sql`create table ${usersDistinctTable} (id integer, name text)`,
// 	);

// 	await db.insert(usersDistinctTable).values([
// 		{ id: 1, name: 'John' },
// 		{ id: 1, name: 'John' },
// 		{ id: 2, name: 'John' },
// 		{ id: 1, name: 'Jane' },
// 	]);
// 	const users1 = await db
// 		.selectDistinct()
// 		.from(usersDistinctTable)
// 		.orderBy(usersDistinctTable.id, usersDistinctTable.name);
// 	const users2 = await db
// 		.selectDistinctOn([usersDistinctTable.id])
// 		.from(usersDistinctTable)
// 		.orderBy(usersDistinctTable.id);
// 	const users3 = await db
// 		.selectDistinctOn([usersDistinctTable.name], {
// 			name: usersDistinctTable.name,
// 		})
// 		.from(usersDistinctTable)
// 		.orderBy(usersDistinctTable.name);

// 	await db.execute(sql`drop table ${usersDistinctTable}`);

// 	expect(users1).toEqual([
// 		{ id: 1, name: 'Jane' },
// 		{ id: 1, name: 'John' },
// 		{ id: 2, name: 'John' },
// 	]);

// 	expect(users2.length).toEqual(2);
// 	expect(users2[0]?.id).toEqual(1);
// 	expect(users2[1]?.id).toEqual(2);

// 	expect(users3.length).toEqual(2);
// 	expect(users3[0]?.name).toEqual('Jane');
// 	expect(users3[1]?.name).toEqual('John');
// });

// test('insert returning sql', async () => {
// 	const users = await db
// 		.insert(usersTable)
// 		.values({ name: 'John' })
// 		.returning({
// 			name: sql`upper(${usersTable.name})`,
// 		});

// 	expect(users).toEqual([{ name: 'JOHN' }]);
// });

// test('delete returning sql', async () => {
// 	await db.insert(usersTable).values({ name: 'John' });
// 	const users = await db
// 		.delete(usersTable)
// 		.where(eq(usersTable.name, 'John'))
// 		.returning({
// 			name: sql`upper(${usersTable.name})`,
// 		});

// 	expect(users).toEqual([{ name: 'JOHN' }]);
// });

// test('update returning sql', async () => {
// 	await db.insert(usersTable).values({ name: 'John' });
// 	const users = await db
// 		.update(usersTable)
// 		.set({ name: 'Jane' })
// 		.where(eq(usersTable.name, 'John'))
// 		.returning({
// 			name: sql`upper(${usersTable.name})`,
// 		});

// 	expect(users).toEqual([{ name: 'JANE' }]);
// });

// test('update with returning all fields', async () => {
// 	await db.insert(usersTable).values({ name: 'John' });
// 	const users = await db
// 		.update(usersTable)
// 		.set({ name: 'Jane' })
// 		.where(eq(usersTable.name, 'John'))
// 		.returning();

// 	expect(users[0]!.createdAt).toBeInstanceOf(Date);
// 	// t.assert(Math.abs(users[0]!.createdAt.getTime() - now) < 100);
// 	expect(users).toEqual([
// 		{
// 			id: 1,
// 			bestTexts: [],
// 			name: 'Jane',
// 			verified: false,
// 			jsonb: null,
// 			createdAt: users[0]!.createdAt,
// 		},
// 	]);
// });

// test('update with returning partial', async () => {
// 	await db.insert(usersTable).values({ name: 'John' });
// 	const users = await db
// 		.update(usersTable)
// 		.set({ name: 'Jane' })
// 		.where(eq(usersTable.name, 'John'))
// 		.returning({
// 			id: usersTable.id,
// 			name: usersTable.name,
// 		});

// 	expect(users).toEqual([{ id: 1, name: 'Jane' }]);
// });

// test('delete with returning all fields', async () => {
// 	await db.insert(usersTable).values({ name: 'John' });
// 	const users = await db
// 		.delete(usersTable)
// 		.where(eq(usersTable.name, 'John'))
// 		.returning();

// 	expect(users[0]!.createdAt).toBeInstanceOf(Date);
// 	// t.assert(Math.abs(users[0]!.createdAt.getTime() - now) < 100);
// 	expect(users).toEqual([
// 		{
// 			bestTexts: [],
// 			id: 1,
// 			name: 'John',
// 			verified: false,
// 			jsonb: null,
// 			createdAt: users[0]!.createdAt,
// 		},
// 	]);
// });

// test('delete with returning partial', async () => {
// 	await db.insert(usersTable).values({ name: 'John' });
// 	const users = await db
// 		.delete(usersTable)
// 		.where(eq(usersTable.name, 'John'))
// 		.returning({
// 			id: usersTable.id,
// 			name: usersTable.name,
// 		});

// 	expect(users).toEqual([{ id: 1, name: 'John' }]);
// });

// test('insert + select', async () => {
// 	await db.insert(usersTable).values({ name: 'John' });
// 	const result = await db.select().from(usersTable);
// 	expect(result).toEqual([
// 		{
// 			bestTexts: [],
// 			id: 1,
// 			name: 'John',
// 			verified: false,
// 			jsonb: null,
// 			createdAt: result[0]!.createdAt,
// 		},
// 	]);

// 	await db.insert(usersTable).values({ name: 'Jane' });
// 	const result2 = await db.select().from(usersTable);
// 	expect(result2).toEqual([
// 		{
// 			bestTexts: [],
// 			id: 1,
// 			name: 'John',
// 			verified: false,
// 			jsonb: null,
// 			createdAt: result2[0]!.createdAt,
// 		},
// 		{
// 			bestTexts: [],
// 			id: 2,
// 			name: 'Jane',
// 			verified: false,
// 			jsonb: null,
// 			createdAt: result2[1]!.createdAt,
// 		},
// 	]);
// });

// test('json insert', async () => {
// 	await db.insert(usersTable).values({ name: 'John', jsonb: ['foo', 'bar'] });
// 	const result = await db
// 		.select({
// 			id: usersTable.id,
// 			name: usersTable.name,
// 			jsonb: usersTable.jsonb,
// 		})
// 		.from(usersTable);

// 	expect(result).toEqual([{ id: 1, name: 'John', jsonb: ['foo', 'bar'] }]);
// });

// test('insert with overridden default values', async () => {
// 	await db.insert(usersTable).values({ name: 'John', verified: true });
// 	const result = await db.select().from(usersTable);

// 	expect(result).toEqual([
// 		{
// 			bestTexts: [],
// 			id: 1,
// 			name: 'John',
// 			verified: true,
// 			jsonb: null,
// 			createdAt: result[0]!.createdAt,
// 		},
// 	]);
// });

// test('insert many', async () => {
// 	await db
// 		.insert(usersTable)
// 		.values([
// 			{ name: 'John' },
// 			{ name: 'Bruce', jsonb: ['foo', 'bar'] },
// 			{ name: 'Jane' },
// 			{ name: 'Austin', verified: true },
// 		]);
// 	const result = await db
// 		.select({
// 			id: usersTable.id,
// 			name: usersTable.name,
// 			jsonb: usersTable.jsonb,
// 			verified: usersTable.verified,
// 		})
// 		.from(usersTable);

// 	expect(result).toEqual([
// 		{ id: 1, name: 'John', jsonb: null, verified: false },
// 		{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
// 		{ id: 3, name: 'Jane', jsonb: null, verified: false },
// 		{ id: 4, name: 'Austin', jsonb: null, verified: true },
// 	]);
// });

// test('insert many with returning', async () => {
// 	const result = await db
// 		.insert(usersTable)
// 		.values([
// 			{ name: 'John' },
// 			{ name: 'Bruce', jsonb: ['foo', 'bar'] },
// 			{ name: 'Jane' },
// 			{ name: 'Austin', verified: true },
// 		])
// 		.returning({
// 			id: usersTable.id,
// 			name: usersTable.name,
// 			jsonb: usersTable.jsonb,
// 			verified: usersTable.verified,
// 		});

// 	expect(result).toEqual([
// 		{ id: 1, name: 'John', jsonb: null, verified: false },
// 		{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
// 		{ id: 3, name: 'Jane', jsonb: null, verified: false },
// 		{ id: 4, name: 'Austin', jsonb: null, verified: true },
// 	]);
// });

// test('select with group by as field', async () => {
// 	await db
// 		.insert(usersTable)
// 		.values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

// 	const result = await db
// 		.select({ name: usersTable.name })
// 		.from(usersTable)
// 		.groupBy(usersTable.name);

// 	expect(result).toEqual([{ name: 'Jane' }, { name: 'John' }]);
// });

// test('select with group by as sql', async () => {
// 	await db
// 		.insert(usersTable)
// 		.values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

// 	const result = await db
// 		.select({ name: usersTable.name })
// 		.from(usersTable)
// 		.groupBy(sql`${usersTable.name}`);

// 	expect(result).toEqual([{ name: 'Jane' }, { name: 'John' }]);
// });

// test('select with group by as sql + column', async () => {
// 	await db
// 		.insert(usersTable)
// 		.values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

// 	const result = await db
// 		.select({ name: usersTable.name })
// 		.from(usersTable)
// 		.groupBy(sql`${usersTable.name}`, usersTable.id);

// 	expect(result).toEqual([
// 		{ name: 'Jane' },
// 		{ name: 'Jane' },
// 		{ name: 'John' },
// 	]);
// });

// test('select with group by as column + sql', async () => {
// 	await db
// 		.insert(usersTable)
// 		.values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

// 	const result = await db
// 		.select({ name: usersTable.name })
// 		.from(usersTable)
// 		.groupBy(usersTable.id, sql`${usersTable.name}`);

// 	expect(result).toEqual([
// 		{ name: 'Jane' },
// 		{ name: 'Jane' },
// 		{ name: 'John' },
// 	]);
// });

// test('select with group by complex query', async () => {
// 	await db
// 		.insert(usersTable)
// 		.values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

// 	const result = await db
// 		.select({ name: usersTable.name })
// 		.from(usersTable)
// 		.groupBy(usersTable.id, sql`${usersTable.name}`)
// 		.orderBy(asc(usersTable.name))
// 		.limit(1);

// 	expect(result).toEqual([{ name: 'Jane' }]);
// });

// test('build query', async () => {
// 	const query = db
// 		.select({ id: usersTable.id, name: usersTable.name })
// 		.from(usersTable)
// 		.groupBy(usersTable.id, usersTable.name)
// 		.toSQL();

// 	expect(query).toEqual({
// 		sql: 'select "id", "name" from "users" group by "users"."id", "users"."name"',
// 		params: [],
// 		// typings: []
// 	});
// });

// test('insert sql', async () => {
// 	await db.insert(usersTable).values({ name: sql`${'John'}` });
// 	const result = await db
// 		.select({ id: usersTable.id, name: usersTable.name })
// 		.from(usersTable);
// 	expect(result).toEqual([{ id: 1, name: 'John' }]);
// });

// test('partial join with alias', async () => {
// 	const customerAlias = alias(usersTable, 'customer');

// 	await db.insert(usersTable).values([
// 		{ id: 10, name: 'Ivan' },
// 		{ id: 11, name: 'Hans' },
// 	]);
// 	const result = await db
// 		.select({
// 			user: {
// 				id: usersTable.id,
// 				name: usersTable.name,
// 			},
// 			customer: {
// 				id: customerAlias.id,
// 				name: customerAlias.name,
// 			},
// 		})
// 		.from(usersTable)
// 		.leftJoin(customerAlias, eq(customerAlias.id, 11))
// 		.where(eq(usersTable.id, 10));

// 	expect(result).toEqual([
// 		{
// 			user: { id: 10, name: 'Ivan' },
// 			customer: { id: 11, name: 'Hans' },
// 		},
// 	]);
// });

// test('full join with alias', async () => {
// 	const customerAlias = alias(usersTable, 'customer');

// 	await db.insert(usersTable).values([
// 		{ id: 10, name: 'Ivan' },
// 		{ id: 11, name: 'Hans' },
// 	]);

// 	const result = await db
// 		.select()
// 		.from(usersTable)
// 		.leftJoin(customerAlias, eq(customerAlias.id, 11))
// 		.where(eq(usersTable.id, 10));

// 	expect(result).toEqual([
// 		{
// 			users: {
// 				id: 10,
// 				bestTexts: [],
// 				name: 'Ivan',
// 				verified: false,
// 				jsonb: null,
// 				createdAt: result[0]!.users.createdAt,
// 			},
// 			customer: {
// 				bestTexts: [],
// 				id: 11,
// 				name: 'Hans',
// 				verified: false,
// 				jsonb: null,
// 				createdAt: result[0]!.customer!.createdAt,
// 			},
// 		},
// 	]);
// });

// test('select from alias', async () => {
// 	const pgTable = pgTableCreator((name) => `prefixed_${name}`);

// 	const users = pgTable('users', {
// 		id: serial('id').primaryKey(),
// 		name: text('name').notNull(),
// 	});

// 	await db.execute(sql`drop table if exists ${users}`);
// 	await db.execute(
// 		sql`create table ${users} (id serial primary key, name text not null)`,
// 	);

// 	const user = alias(users, 'user');
// 	const customers = alias(users, 'customer');

// 	await db.insert(users).values([
// 		{ id: 10, name: 'Ivan' },
// 		{ id: 11, name: 'Hans' },
// 	]);
// 	const result = await db
// 		.select()
// 		.from(user)
// 		.leftJoin(customers, eq(customers.id, 11))
// 		.where(eq(user.id, 10));

// 	expect(result).toEqual([
// 		{
// 			user: {
// 				id: 10,
// 				name: 'Ivan',
// 			},
// 			customer: {
// 				id: 11,
// 				name: 'Hans',
// 			},
// 		},
// 	]);

// 	await db.execute(sql`drop table ${users}`);
// });

// test('insert with spaces', async () => {
// 	await db.insert(usersTable).values({ name: sql`'Jo   h     n'` });
// 	const result = await db
// 		.select({ id: usersTable.id, name: usersTable.name })
// 		.from(usersTable);

// 	expect(result).toEqual([{ id: 1, name: 'Jo   h     n' }]);
// });

// test('prepared statement', async () => {
// 	await db.insert(usersTable).values({ name: 'John' });
// 	const statement = db
// 		.select({
// 			id: usersTable.id,
// 			name: usersTable.name,
// 		})
// 		.from(usersTable)
// 		.prepare('statement1');
// 	const result = await statement.execute();

// 	expect(result).toEqual([{ id: 1, name: 'John' }]);
// });

// test('prepared statement reuse', async () => {
// 	const stmt = db
// 		.insert(usersTable)
// 		.values({
// 			verified: true,
// 			name: sql.placeholder('name'),
// 		})
// 		.prepare('stmt2');

// 	for (let i = 0; i < 10; i++) {
// 		await stmt.execute({ name: `John ${i}` });
// 	}

// 	const result = await db
// 		.select({
// 			id: usersTable.id,
// 			name: usersTable.name,
// 			verified: usersTable.verified,
// 		})
// 		.from(usersTable);

// 	expect(result).toEqual([
// 		{ id: 1, name: 'John 0', verified: true },
// 		{ id: 2, name: 'John 1', verified: true },
// 		{ id: 3, name: 'John 2', verified: true },
// 		{ id: 4, name: 'John 3', verified: true },
// 		{ id: 5, name: 'John 4', verified: true },
// 		{ id: 6, name: 'John 5', verified: true },
// 		{ id: 7, name: 'John 6', verified: true },
// 		{ id: 8, name: 'John 7', verified: true },
// 		{ id: 9, name: 'John 8', verified: true },
// 		{ id: 10, name: 'John 9', verified: true },
// 	]);
// });

// test('prepared statement with placeholder in .where', async () => {
// 	await db.insert(usersTable).values({ name: 'John' });
// 	const stmt = db
// 		.select({
// 			id: usersTable.id,
// 			name: usersTable.name,
// 		})
// 		.from(usersTable)
// 		.where(eq(usersTable.id, sql.placeholder('id')))
// 		.prepare('stmt3');
// 	const result = await stmt.execute({ id: 1 });

// 	expect(result).toEqual([{ id: 1, name: 'John' }]);
// });

// test('migrator : default migration strategy', async () => {
// 	await db.execute(sql`drop table if exists all_columns`);
// 	await db.execute(sql`drop table if exists users12`);
// 	await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

// 	await migrate(db, { migrationsFolder: './drizzle2/pg' });

// 	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });

// 	const result = await db.select().from(usersMigratorTable);

// 	expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

// 	await db.execute(sql`drop table all_columns`);
// 	await db.execute(sql`drop table users12`);
// 	await db.execute(sql`drop table "drizzle"."__drizzle_migrations"`);
// });

// test('migrator : migrate with custom schema', async () => {
// 	await db.execute(sql`drop table if exists all_columns`);
// 	await db.execute(sql`drop table if exists users12`);
// 	await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

// 	await migrate(db, {
// 		migrationsFolder: './drizzle2/pg',
// 		migrationsSchema: 'custom_migrations',
// 	});

// 	// test if the custom migrations table was created
// 	const { rows } = await db.execute(
// 		sql`select * from custom_migrations."__drizzle_migrations";`,
// 	);
// 	expect(rows).toBeTruthy();
// 	expect(rows!.length).toBeGreaterThan(0);

// 	// test if the migrated table are working as expected
// 	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
// 	const result = await db.select().from(usersMigratorTable);
// 	expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

// 	await db.execute(sql`drop table all_columns`);
// 	await db.execute(sql`drop table users12`);
// 	await db.execute(
// 		sql`drop table custom_migrations."__drizzle_migrations"`,
// 	);
// });

// test('migrator : migrate with custom table', async () => {
// 	const customTable = randomString();
// 	await db.execute(sql`drop table if exists all_columns`);
// 	await db.execute(sql`drop table if exists users12`);
// 	await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

// 	await migrate(db, {
// 		migrationsFolder: './drizzle2/pg',
// 		migrationsTable: customTable,
// 	});

// 	// test if the custom migrations table was created
// 	const { rows } = await db.execute(
// 		sql`select * from "drizzle".${sql.identifier(customTable)};`,
// 	);
// 	expect(rows).toBeTruthy();
// 	expect(rows!.length).toBeGreaterThan(0);

// 	// test if the migrated table are working as expected
// 	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
// 	const result = await db.select().from(usersMigratorTable);
// 	expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

// 	await db.execute(sql`drop table all_columns`);
// 	await db.execute(sql`drop table users12`);
// 	await db.execute(sql`drop table "drizzle".${sql.identifier(customTable)}`);
// });

// test('migrator : migrate with custom table and custom schema', async () => {
// 	const customTable = randomString();
// 	await db.execute(sql`drop table if exists all_columns`);
// 	await db.execute(sql`drop table if exists users12`);
// 	await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

// 	await migrate(db, {
// 		migrationsFolder: './drizzle2/pg',
// 		migrationsTable: customTable,
// 		migrationsSchema: 'custom_migrations',
// 	});

// 	// test if the custom migrations table was created
// 	const { rows } = await db.execute(
// 		sql`select * from custom_migrations.${
// 			sql.identifier(
// 				customTable,
// 			)
// 		};`,
// 	);
// 	expect(rows).toBeTruthy();
// 	expect(rows!.length).toBeGreaterThan(0);

// 	// test if the migrated table are working as expected
// 	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
// 	const result = await db.select().from(usersMigratorTable);
// 	expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

// 	await db.execute(sql`drop table all_columns`);
// 	await db.execute(sql`drop table users12`);
// 	await db.execute(
// 		sql`drop table custom_migrations.${
// 			sql.identifier(
// 				customTable,
// 			)
// 		}`,
// 	);
// });

// test('insert via db.execute + select via db.execute', async () => {
// 	await db.execute(
// 		sql`insert into ${usersTable} (${
// 			sql.identifier(
// 				usersTable.name.name,
// 			)
// 		}) values (${'John'})`,
// 	);

// 	const result = await db.execute<{ id: number; name: string }>(
// 		sql`select id, name from "users"`,
// 	);
// 	expectTypeOf(result.rows).toEqualTypeOf<{ id: number; name: string }[]>();
// 	expect(result.rows).toEqual([{ id: 1, name: 'John' }]);
// });

// test('insert via db.execute + returning', async () => {
// 	const inserted = await db.execute(
// 		sql`insert into ${usersTable} (${
// 			sql.identifier(
// 				usersTable.name.name,
// 			)
// 		}) values (${'John'}) returning ${usersTable.id}, ${usersTable.name}`,
// 	);
// 	expect(inserted.rows).toEqual([{ id: 1, name: 'John' }]);
// });

// test('insert via db.execute w/ query builder', async () => {
// 	const inserted = await db.execute(
// 		db
// 			.insert(usersTable)
// 			.values({ name: 'John' })
// 			.returning({ id: usersTable.id, name: usersTable.name }),
// 	);
// 	expect(inserted.rows).toEqual([{ id: 1, name: 'John' }]);
// });

// test('build query insert with onConflict do update', async () => {
// 	const query = db
// 		.insert(usersTable)
// 		.values({ name: 'John', jsonb: ['foo', 'bar'] })
// 		.onConflictDoUpdate({ target: usersTable.id, set: { name: 'John1' } })
// 		.toSQL();

// 	expect(query).toEqual({
// 		sql:
// 			'insert into "users" ("id", "name", "verified", "jsonb", "best_texts", "created_at") values (default, :1, default, :2, default, default) on conflict ("id") do update set "name" = :3',
// 		params: ['John', '["foo","bar"]', 'John1'],
// 		// typings: ['none', 'json', 'none']
// 	});
// });

// test('build query insert with onConflict do update / multiple columns', async () => {
// 	const query = db
// 		.insert(usersTable)
// 		.values({ name: 'John', jsonb: ['foo', 'bar'] })
// 		.onConflictDoUpdate({
// 			target: [usersTable.id, usersTable.name],
// 			set: { name: 'John1' },
// 		})
// 		.toSQL();

// 	expect(query).toEqual({
// 		sql:
// 			'insert into "users" ("id", "name", "verified", "jsonb", "best_texts", "created_at") values (default, :1, default, :2, default, default) on conflict ("id","name") do update set "name" = :3',
// 		params: ['John', '["foo","bar"]', 'John1'],
// 		// typings: ['none', 'json', 'none']
// 	});
// });

// test('build query insert with onConflict do nothing', async () => {
// 	const query = db
// 		.insert(usersTable)
// 		.values({ name: 'John', jsonb: ['foo', 'bar'] })
// 		.onConflictDoNothing()
// 		.toSQL();

// 	expect(query).toEqual({
// 		sql:
// 			'insert into "users" ("id", "name", "verified", "jsonb", "best_texts", "created_at") values (default, :1, default, :2, default, default) on conflict do nothing',
// 		params: ['John', '["foo","bar"]'],
// 		// typings: ['none', 'json']
// 	});
// });

// test('build query insert with onConflict do nothing + target', async () => {
// 	const query = db
// 		.insert(usersTable)
// 		.values({ name: 'John', jsonb: ['foo', 'bar'] })
// 		.onConflictDoNothing({ target: usersTable.id })
// 		.toSQL();

// 	expect(query).toEqual({
// 		sql:
// 			'insert into "users" ("id", "name", "verified", "jsonb", "best_texts", "created_at") values (default, :1, default, :2, default, default) on conflict ("id") do nothing',
// 		params: ['John', '["foo","bar"]'],
// 		// typings: ['none', 'json']
// 	});
// });

// test('insert with onConflict do update', async () => {
// 	await db.insert(usersTable).values({ name: 'John' });

// 	await db
// 		.insert(usersTable)
// 		.values({ id: 1, name: 'John' })
// 		.onConflictDoUpdate({ target: usersTable.id, set: { name: 'John1' } });

// 	const res = await db
// 		.select({ id: usersTable.id, name: usersTable.name })
// 		.from(usersTable)
// 		.where(eq(usersTable.id, 1));

// 	expect(res).toEqual([{ id: 1, name: 'John1' }]);
// });

// test('insert with onConflict do nothing', async () => {
// 	await db.insert(usersTable).values({ name: 'John' });

// 	await db
// 		.insert(usersTable)
// 		.values({ id: 1, name: 'John' })
// 		.onConflictDoNothing();

// 	const res = await db
// 		.select({ id: usersTable.id, name: usersTable.name })
// 		.from(usersTable)
// 		.where(eq(usersTable.id, 1));

// 	expect(res).toEqual([{ id: 1, name: 'John' }]);
// });

// test('insert with onConflict do nothing + target', async () => {
// 	await db.insert(usersTable).values({ name: 'John' });

// 	await db
// 		.insert(usersTable)
// 		.values({ id: 1, name: 'John' })
// 		.onConflictDoNothing({ target: usersTable.id });

// 	const res = await db
// 		.select({ id: usersTable.id, name: usersTable.name })
// 		.from(usersTable)
// 		.where(eq(usersTable.id, 1));

// 	expect(res).toEqual([{ id: 1, name: 'John' }]);
// });

// test('transaction', async () => {
// 	const users = pgTable('users_transactions', {
// 		id: serial('id').primaryKey(),
// 		balance: integer('balance').notNull(),
// 	});
// 	const products = pgTable('products_transactions', {
// 		id: serial('id').primaryKey(),
// 		price: integer('price').notNull(),
// 		stock: integer('stock').notNull(),
// 	});

// 	await db.execute(sql`drop table if exists ${users}`);
// 	await db.execute(sql`drop table if exists ${products}`);

// 	await db.execute(
// 		sql`create table users_transactions (id serial not null primary key, balance integer not null)`,
// 	);
// 	await db.execute(
// 		sql`create table products_transactions (id serial not null primary key, price integer not null, stock integer not null)`,
// 	);

// 	const user = await db
// 		.insert(users)
// 		.values({ balance: 100 })
// 		.returning()
// 		.then((rows) => rows[0]!);
// 	const product = await db
// 		.insert(products)
// 		.values({ price: 10, stock: 10 })
// 		.returning()
// 		.then((rows) => rows[0]!);

// 	await db.transaction(async (tx) => {
// 		await tx
// 			.update(users)
// 			.set({ balance: user.balance - product.price })
// 			.where(eq(users.id, user.id));
// 		await tx
// 			.update(products)
// 			.set({ stock: product.stock - 1 })
// 			.where(eq(products.id, product.id));
// 	});

// 	const result = await db.select().from(users);

// 	expect(result).toEqual([{ id: 1, balance: 90 }]);

// 	await db.execute(sql`drop table ${users}`);
// 	await db.execute(sql`drop table ${products}`);
// });

// test('transaction rollback', async () => {
// 	const users = pgTable('users_transactions_rollback', {
// 		id: serial('id').primaryKey(),
// 		balance: integer('balance').notNull(),
// 	});

// 	await db.execute(sql`drop table if exists ${users}`);

// 	await db.execute(
// 		sql`create table users_transactions_rollback (id serial not null primary key, balance integer not null)`,
// 	);

// 	await expect(
// 		db.transaction(async (tx) => {
// 			await tx.insert(users).values({ balance: 100 });
// 			tx.rollback();
// 		}),
// 	).rejects.toThrowError(TransactionRollbackError);

// 	const result = await db.select().from(users);

// 	expect(result).toEqual([]);

// 	await db.execute(sql`drop table ${users}`);
// });

// test('nested transaction', async () => {
// 	const users = pgTable('users_nested_transactions', {
// 		id: serial('id').primaryKey(),
// 		balance: integer('balance').notNull(),
// 	});

// 	await db.execute(sql`drop table if exists ${users}`);

// 	await db.execute(
// 		sql`create table users_nested_transactions (id serial not null primary key, balance integer not null)`,
// 	);

// 	await db.transaction(async (tx) => {
// 		await tx.insert(users).values({ balance: 100 });

// 		await tx.transaction(async (tx) => {
// 			await tx.update(users).set({ balance: 200 });
// 		});
// 	});

// 	const result = await db.select().from(users);

// 	expect(result).toEqual([{ id: 1, balance: 200 }]);

// 	await db.execute(sql`drop table ${users}`);
// });

// test('nested transaction rollback', async () => {
// 	const users = pgTable('users_nested_transactions_rollback', {
// 		id: serial('id').primaryKey(),
// 		balance: integer('balance').notNull(),
// 	});

// 	await db.execute(sql`drop table if exists ${users}`);

// 	await db.execute(
// 		sql`create table users_nested_transactions_rollback (id serial not null primary key, balance integer not null)`,
// 	);

// 	await db.transaction(async (tx) => {
// 		await tx.insert(users).values({ balance: 100 });

// 		await expect(
// 			tx.transaction(async (tx2) => {
// 				await tx2.update(users).set({ balance: 200 });
// 				tx2.rollback();
// 			}),
// 		).rejects.toThrowError(TransactionRollbackError);
// 	});

// 	const result = await db.select().from(users);

// 	expect(result).toEqual([{ id: 1, balance: 100 }]);

// 	await db.execute(sql`drop table ${users}`);
// });

// test('select from raw sql', async () => {
// 	const result = await db.execute(sql`select 1 as id, 'John' as name`);

// 	expect(result.rows).toEqual([{ id: 1, name: 'John' }]);
// });

// test('select from raw sql with mapped values', async () => {
// 	const result = await db
// 		.select({
// 			id: sql<number>`id`,
// 			name: sql<string>`name`,
// 		})
// 		.from(sql`(select 1 as id, 'John' as name) as users`);

// 	expect(result).toEqual([{ id: 1, name: 'John' }]);
// });

// test('insert with array values works', async () => {
// 	const bestTexts = ['text1', 'text2', 'text3'];
// 	const [insertResult] = await db
// 		.insert(usersTable)
// 		.values({
// 			name: 'John',
// 			bestTexts,
// 		})
// 		.returning();

// 	expect(insertResult?.bestTexts).toEqual(bestTexts);
// });

// test('update with array values works', async () => {
// 	const [newUser] = await db
// 		.insert(usersTable)
// 		.values({ name: 'John' })
// 		.returning();

// 	const bestTexts = ['text4', 'text5', 'text6'];
// 	const [insertResult] = await db
// 		.update(usersTable)
// 		.set({
// 			bestTexts,
// 		})
// 		.where(eq(usersTable.id, newUser!.id))
// 		.returning();

// 	expect(insertResult?.bestTexts).toEqual(bestTexts);
// });

// test('insert with array values works', async () => {
// 	const bestTexts = ['text1', 'text2', 'text3'];
// 	const [insertResult] = await db
// 		.insert(usersTable)
// 		.values({
// 			name: 'John',
// 			bestTexts,
// 		})
// 		.returning();

// 	expect(insertResult?.bestTexts).toEqual(bestTexts);
// });

// test('update with array values works', async () => {
// 	const [newUser] = await db
// 		.insert(usersTable)
// 		.values({ name: 'John' })
// 		.returning();

// 	const bestTexts = ['text4', 'text5', 'text6'];
// 	const [insertResult] = await db
// 		.update(usersTable)
// 		.set({
// 			bestTexts,
// 		})
// 		.where(eq(usersTable.id, newUser!.id))
// 		.returning();

// 	expect(insertResult?.bestTexts).toEqual(bestTexts);
// });

// test('insert with array values works', async () => {
// 	const bestTexts = ['text1', 'text2', 'text3'];
// 	const [insertResult] = await db
// 		.insert(usersTable)
// 		.values({
// 			name: 'John',
// 			bestTexts,
// 		})
// 		.returning();

// 	expect(insertResult?.bestTexts).toEqual(bestTexts);
// });

// test('update with array values works', async () => {
// 	const [newUser] = await db
// 		.insert(usersTable)
// 		.values({ name: 'John' })
// 		.returning();

// 	const bestTexts = ['text4', 'text5', 'text6'];
// 	const [insertResult] = await db
// 		.update(usersTable)
// 		.set({
// 			bestTexts,
// 		})
// 		.where(eq(usersTable.id, newUser!.id))
// 		.returning();

// 	expect(insertResult?.bestTexts).toEqual(bestTexts);
// });

// test('all date and time columns', async () => {
// 	const table = pgTable('all_columns', {
// 		id: serial('id').primaryKey(),
// 		dateString: date('date_string', { mode: 'string' }).notNull(),
// 		time: time('time', { precision: 3 }).notNull(),
// 		datetime: timestamp('datetime').notNull(),
// 		// datetimeWTZ: timestamp('datetime_wtz', { withTimezone: true }).notNull(),
// 		datetimeString: timestamp('datetime_string', { mode: 'string' }).notNull(),
// 		datetimeFullPrecision: timestamp('datetime_full_precision', {
// 			precision: 6,
// 			mode: 'string',
// 		}).notNull(),
// 		// datetimeWTZString: timestamp('datetime_wtz_string', { withTimezone: true, mode: 'string' }).notNull(),
// 	});

// 	await db.execute(sql`drop table if exists ${table}`);

// 	await db.execute(sql`
// 		create table ${table} (
// 					id serial primary key,
// 					date_string date not null,
// 					time time(3) not null,
// 					datetime timestamp not null,
// 					-- datetime_wtz timestamp with time zone not null,
// 					datetime_string timestamp not null,
// 					datetime_full_precision timestamp(6) not null
// 					-- datetime_wtz_string timestamp with time zone not null
// 			)
// 	`);

// 	const someDatetime = new Date('2022-01-01T00:00:00.123Z');
// 	const fullPrecision = '2022-01-01T00:00:00.123456';
// 	const someTime = '23:23:12.432';

// 	await db.insert(table).values({
// 		dateString: '2022-01-01',
// 		time: someTime,
// 		datetime: someDatetime,
// 		// datetimeWTZ: someDatetime,
// 		datetimeString: '2022-01-01T00:00:00.123Z',
// 		datetimeFullPrecision: fullPrecision,
// 		// datetimeWTZString: '2022-01-01T00:00:00.123Z',
// 	});

// 	const result = await db.select().from(table);

// 	Expect<
// 		Equal<
// 			{
// 				id: number;
// 				dateString: string;
// 				time: string;
// 				datetime: Date;
// 				// datetimeWTZ: Date;
// 				datetimeString: string;
// 				datetimeFullPrecision: string;
// 				// datetimeWTZString: string;
// 			}[],
// 			typeof result
// 		>
// 	>;

// 	Expect<
// 		Equal<
// 			{
// 				dateString: string;
// 				time: string;
// 				datetime: Date;
// 				// datetimeWTZ: Date;
// 				datetimeString: string;
// 				datetimeFullPrecision: string;
// 				// datetimeWTZString: string;
// 				id?: number | undefined;
// 			},
// 			typeof table.$inferInsert
// 		>
// 	>;

// 	expect(result).toEqual([
// 		{
// 			id: 1,
// 			dateString: '2022-01-01',
// 			time: someTime,
// 			datetime: someDatetime,
// 			// datetimeWTZ: someDatetime,
// 			datetimeString: '2022-01-01 00:00:00.123',
// 			datetimeFullPrecision: fullPrecision.replace('T', ' ').replace('Z', ''),
// 			// datetimeWTZString: '2022-01-01 00:00:00.123+00',
// 		},
// 	]);

// 	await db.execute(sql`drop table if exists ${table}`);
// });

// test.skip('all date and time columns with timezone', async () => {
// 	const table = pgTable('all_columns', {
// 		id: serial('id').primaryKey(),
// 		timestamp: timestamp('timestamp_string', {
// 			mode: 'string',
// 			withTimezone: true,
// 			precision: 6,
// 		}).notNull(),
// 		timestampAsDate: timestamp('timestamp_date', {
// 			withTimezone: true,
// 			precision: 3,
// 		}).notNull(),
// 		timestampTimeZones: timestamp('timestamp_date_2', {
// 			withTimezone: true,
// 			precision: 3,
// 		}).notNull(),
// 	});

// 	await db.execute(sql`drop table if exists ${table}`);

// 	await db.execute(sql`
// 		create table ${table} (
// 					id serial primary key,
// 					timestamp_string timestamp(6) with time zone not null,
// 					timestamp_date timestamp(3) with time zone not null,
// 					timestamp_date_2 timestamp(3) with time zone not null
// 			)
// 	`);

// 	const timestampString = '2022-01-01 00:00:00.123456-0200';
// 	const timestampDate = new Date();
// 	const timestampDateWTZ = new Date('2022-01-01 00:00:00.123 +0500');

// 	const timestampString2 = '2022-01-01 00:00:00.123456-0400';
// 	const timestampDate2 = new Date();
// 	const timestampDateWTZ2 = new Date('2022-01-01 00:00:00.123 +0200');

// 	await db.insert(table).values([
// 		{
// 			timestamp: timestampString,
// 			timestampAsDate: timestampDate,
// 			timestampTimeZones: timestampDateWTZ,
// 		},
// 		{
// 			timestamp: timestampString2,
// 			timestampAsDate: timestampDate2,
// 			timestampTimeZones: timestampDateWTZ2,
// 		},
// 	]);

// 	const result = await db.select().from(table);
// 	const result2 = await db.execute<{
// 		id: number;
// 		timestamp_string: string;
// 		timestamp_date: string;
// 		timestamp_date_2: string;
// 	}>(sql`select * from ${table}`);

// 	// Whatever you put in, you get back when you're using the date mode
// 	// But when using the string mode, postgres returns a string transformed into UTC
// 	expect(result).toEqual([
// 		{
// 			id: 1,
// 			timestamp: '2022-01-01 02:00:00.123456+00',
// 			timestampAsDate: timestampDate,
// 			timestampTimeZones: timestampDateWTZ,
// 		},
// 		{
// 			id: 2,
// 			timestamp: '2022-01-01 04:00:00.123456+00',
// 			timestampAsDate: timestampDate2,
// 			timestampTimeZones: timestampDateWTZ2,
// 		},
// 	]);

// 	expect(result2.rows).toEqual([
// 		{
// 			id: 1,
// 			timestamp_string: '2022-01-01 02:00:00.123456+00',
// 			timestamp_date: timestampDate.toISOString().replace('T', ' ').replace('Z', '') + '+00',
// 			timestamp_date_2: timestampDateWTZ.toISOString().replace('T', ' ').replace('Z', '')
// 				+ '+00',
// 		},
// 		{
// 			id: 2,
// 			timestamp_string: '2022-01-01 04:00:00.123456+00',
// 			timestamp_date: timestampDate2.toISOString().replace('T', ' ').replace('Z', '') + '+00',
// 			timestamp_date_2: timestampDateWTZ2.toISOString().replace('T', ' ').replace('Z', '')
// 				+ '+00',
// 		},
// 	]);

// 	expect(result[0]?.timestampTimeZones.getTime()).toEqual(
// 		new Date((result2.rows?.[0]?.timestamp_date_2) as any).getTime(),
// 	);

// 	await db.execute(sql`drop table if exists ${table}`);
// });

// test('all date and time columns without timezone', async () => {
// 	const table = pgTable('all_columns', {
// 		id: serial('id').primaryKey(),
// 		timestampString: timestamp('timestamp_string', {
// 			mode: 'string',
// 			precision: 6,
// 		}).notNull(),
// 		timestampString2: timestamp('timestamp_string2', {
// 			precision: 3,
// 			mode: 'string',
// 		}).notNull(),
// 		timestampDate: timestamp('timestamp_date', { precision: 3 }).notNull(),
// 	});

// 	await db.execute(sql`drop table if exists ${table}`);

// 	await db.execute(sql`
// 		create table ${table} (
// 					id serial primary key,
// 					timestamp_string timestamp(6) not null,
// 					timestamp_string2 timestamp(3) not null,
// 					timestamp_date timestamp(3) not null
// 			)
// 	`);

// 	const timestampString = '2022-01-01 00:00:00.123456';
// 	// const timestampString2 = '2022-01-02 00:00:00.123 -0300';
// 	const timestampString2 = '2022-01-02 00:00:00.123';
// 	const timestampDate = new Date('2022-01-01 00:00:00.123Z');

// 	const timestampString_2 = '2022-01-01 00:00:00.123456';
// 	// const timestampString2_2 = '2022-01-01 00:00:00.123 -0300';
// 	const timestampString2_2 = '2022-01-01 00:00:00.123';
// 	// const timestampDate2 = new Date('2022-01-01 00:00:00.123 +0200');
// 	const timestampDate2 = new Date('2022-01-01 00:00:00.123');

// 	await db.insert(table).values([
// 		{ timestampString, timestampString2, timestampDate },
// 		{
// 			timestampString: timestampString_2,
// 			timestampString2: timestampString2_2,
// 			timestampDate: timestampDate2,
// 		},
// 	]);

// 	const result = await db.select().from(table);
// 	const result2 = await db.execute<{
// 		id: number;
// 		timestamp_string: string;
// 		timestamp_string2: string;
// 		timestamp_date: string;
// 	}>(sql`select * from ${table}`);

// 	// Whatever you put in, you get back when you're using the date mode
// 	// But when using the string mode, postgres returns a string transformed into UTC
// 	expect(result).toEqual([
// 		{
// 			id: 1,
// 			timestampString: timestampString,
// 			timestampString2: '2022-01-02 00:00:00.123',
// 			timestampDate: timestampDate,
// 		},
// 		{
// 			id: 2,
// 			timestampString: timestampString_2,
// 			timestampString2: '2022-01-01 00:00:00.123',
// 			timestampDate: timestampDate2,
// 		},
// 	]);

// 	expect(result2.rows).toEqual([
// 		{
// 			id: 1,
// 			timestamp_string: timestampString,
// 			timestamp_string2: '2022-01-02 00:00:00.123',
// 			timestamp_date: timestampDate
// 				.toISOString()
// 				.replace('T', ' ')
// 				.replace('Z', ''),
// 		},
// 		{
// 			id: 2,
// 			timestamp_string: timestampString_2,
// 			timestamp_string2: '2022-01-01 00:00:00.123',
// 			timestamp_date: timestampDate2
// 				.toISOString()
// 				.replace('T', ' ')
// 				.replace('Z', ''),
// 		},
// 	]);

// 	expect(result2.rows?.[0]?.timestamp_string).toEqual(
// 		'2022-01-01 00:00:00.123456',
// 	);
// 	// need to add the 'Z', otherwise javascript assumes it's in local time
// 	expect(
// 		new Date((result2.rows?.[0]?.timestamp_date + 'Z') as any).getTime(),
// 	).toEqual(timestampDate.getTime());

// 	await db.execute(sql`drop table if exists ${table}`);
// });

// test('Typehints mix for RQB', async () => {
// 	const uuid = 'd997d46d-5769-4c78-9a35-93acadbe6076';

// 	const res = await db._query.user.findMany({
// 		where: eq(user.id, uuid),
// 		with: {
// 			todos: {
// 				with: {
// 					todo: true,
// 				},
// 			},
// 		},
// 	});

// 	expect(res).toStrictEqual([]);
// });

// test('Typehints mix for findFirst', async () => {
// 	const uuid = 'd997d46d-5769-4c78-9a35-93acadbe6076';

// 	await db.insert(user).values({ id: uuid, email: 'd' });

// 	const res = await db._query.user.findFirst({
// 		where: eq(user.id, uuid),
// 	});

// 	expect(res).toStrictEqual({ id: 'd997d46d-5769-4c78-9a35-93acadbe6076', email: 'd' });
// });

// test('RQB v2 simple find first - no rows', async () => {
// 	try {
// 		await init(db);

// 		const result = await db.query.rqbUser.findFirst();

// 		expect(result).toStrictEqual(undefined);
// 	} finally {
// 		await clear(db);
// 	}
// });

// test('RQB v2 simple find first - multiple rows', async () => {
// 	try {
// 		await init(db);

// 		const date = new Date(120000);

// 		await db.insert(rqbUser).values([{
// 			id: 1,
// 			createdAt: date,
// 			name: 'First',
// 		}, {
// 			id: 2,
// 			createdAt: date,
// 			name: 'Second',
// 		}]);

// 		const result = await db.query.rqbUser.findFirst({
// 			orderBy: {
// 				id: 'desc',
// 			},
// 		});

// 		expect(result).toStrictEqual({
// 			id: 2,
// 			createdAt: date,
// 			name: 'Second',
// 		});
// 	} finally {
// 		await clear(db);
// 	}
// });

// test('RQB v2 simple find first - with relation', async () => {
// 	try {
// 		await init(db);

// 		const date = new Date(120000);

// 		await db.insert(rqbUser).values([{
// 			id: 1,
// 			createdAt: date,
// 			name: 'First',
// 		}, {
// 			id: 2,
// 			createdAt: date,
// 			name: 'Second',
// 		}]);

// 		await db.insert(rqbPost).values([{
// 			id: 1,
// 			userId: 1,
// 			createdAt: date,
// 			content: null,
// 		}, {
// 			id: 2,
// 			userId: 1,
// 			createdAt: date,
// 			content: 'Has message this time',
// 		}]);

// 		const result = await db.query.rqbUser.findFirst({
// 			with: {
// 				posts: {
// 					orderBy: {
// 						id: 'asc',
// 					},
// 				},
// 			},
// 			orderBy: {
// 				id: 'asc',
// 			},
// 		});

// 		expect(result).toStrictEqual({
// 			id: 1,
// 			createdAt: date,
// 			name: 'First',
// 			posts: [{
// 				id: 1,
// 				userId: 1,
// 				createdAt: date,
// 				content: null,
// 			}, {
// 				id: 2,
// 				userId: 1,
// 				createdAt: date,
// 				content: 'Has message this time',
// 			}],
// 		});
// 	} finally {
// 		await clear(db);
// 	}
// });

// test('RQB v2 simple find first - placeholders', async () => {
// 	try {
// 		await init(db);

// 		const date = new Date(120000);

// 		await db.insert(rqbUser).values([{
// 			id: 1,
// 			createdAt: date,
// 			name: 'First',
// 		}, {
// 			id: 2,
// 			createdAt: date,
// 			name: 'Second',
// 		}]);

// 		const query = db.query.rqbUser.findFirst({
// 			where: {
// 				id: {
// 					eq: sql.placeholder('filter'),
// 				},
// 			},
// 			orderBy: {
// 				id: 'asc',
// 			},
// 		}).prepare('rqb_v2_find_first_placeholders');

// 		const result = await query.execute({
// 			filter: 2,
// 		});

// 		expect(result).toStrictEqual({
// 			id: 2,
// 			createdAt: date,
// 			name: 'Second',
// 		});
// 	} finally {
// 		await clear(db);
// 	}
// });

// test('RQB v2 simple find many - no rows', async () => {
// 	try {
// 		await init(db);

// 		const result = await db.query.rqbUser.findMany();

// 		expect(result).toStrictEqual([]);
// 	} finally {
// 		await clear(db);
// 	}
// });

// test('RQB v2 simple find many - multiple rows', async () => {
// 	try {
// 		await init(db);

// 		const date = new Date(120000);

// 		await db.insert(rqbUser).values([{
// 			id: 1,
// 			createdAt: date,
// 			name: 'First',
// 		}, {
// 			id: 2,
// 			createdAt: date,
// 			name: 'Second',
// 		}]);

// 		const result = await db.query.rqbUser.findMany({
// 			orderBy: {
// 				id: 'desc',
// 			},
// 		});

// 		expect(result).toStrictEqual([{
// 			id: 2,
// 			createdAt: date,
// 			name: 'Second',
// 		}, {
// 			id: 1,
// 			createdAt: date,
// 			name: 'First',
// 		}]);
// 	} finally {
// 		await clear(db);
// 	}
// });

// test('RQB v2 simple find many - with relation', async () => {
// 	try {
// 		await init(db);

// 		const date = new Date(120000);

// 		await db.insert(rqbUser).values([{
// 			id: 1,
// 			createdAt: date,
// 			name: 'First',
// 		}, {
// 			id: 2,
// 			createdAt: date,
// 			name: 'Second',
// 		}]);

// 		await db.insert(rqbPost).values([{
// 			id: 1,
// 			userId: 1,
// 			createdAt: date,
// 			content: null,
// 		}, {
// 			id: 2,
// 			userId: 1,
// 			createdAt: date,
// 			content: 'Has message this time',
// 		}]);

// 		const result = await db.query.rqbPost.findMany({
// 			with: {
// 				author: true,
// 			},
// 			orderBy: {
// 				id: 'asc',
// 			},
// 		});

// 		expect(result).toStrictEqual([{
// 			id: 1,
// 			userId: 1,
// 			createdAt: date,
// 			content: null,
// 			author: {
// 				id: 1,
// 				createdAt: date,
// 				name: 'First',
// 			},
// 		}, {
// 			id: 2,
// 			userId: 1,
// 			createdAt: date,
// 			content: 'Has message this time',
// 			author: {
// 				id: 1,
// 				createdAt: date,
// 				name: 'First',
// 			},
// 		}]);
// 	} finally {
// 		await clear(db);
// 	}
// });

// test('RQB v2 simple find many - placeholders', async () => {
// 	try {
// 		await init(db);

// 		const date = new Date(120000);

// 		await db.insert(rqbUser).values([{
// 			id: 1,
// 			createdAt: date,
// 			name: 'First',
// 		}, {
// 			id: 2,
// 			createdAt: date,
// 			name: 'Second',
// 		}]);

// 		const query = db.query.rqbUser.findMany({
// 			where: {
// 				id: {
// 					eq: sql.placeholder('filter'),
// 				},
// 			},
// 			orderBy: {
// 				id: 'asc',
// 			},
// 		}).prepare('rqb_v2_find_many_placeholders');

// 		const result = await query.execute({
// 			filter: 2,
// 		});

// 		expect(result).toStrictEqual([{
// 			id: 2,
// 			createdAt: date,
// 			name: 'Second',
// 		}]);
// 	} finally {
// 		await clear(db);
// 	}
// });

// test('RQB v2 transaction find first - no rows', async () => {
// 	try {
// 		await init(db);

// 		await db.transaction(async (db) => {
// 			const result = await db.query.rqbUser.findFirst();

// 			expect(result).toStrictEqual(undefined);
// 		});
// 	} finally {
// 		await clear(db);
// 	}
// });

// test('RQB v2 transaction find first - multiple rows', async () => {
// 	try {
// 		await init(db);

// 		const date = new Date(120000);

// 		await db.insert(rqbUser).values([{
// 			id: 1,
// 			createdAt: date,
// 			name: 'First',
// 		}, {
// 			id: 2,
// 			createdAt: date,
// 			name: 'Second',
// 		}]);

// 		await db.transaction(async (db) => {
// 			const result = await db.query.rqbUser.findFirst({
// 				orderBy: {
// 					id: 'desc',
// 				},
// 			});

// 			expect(result).toStrictEqual({
// 				id: 2,
// 				createdAt: date,
// 				name: 'Second',
// 			});
// 		});
// 	} finally {
// 		await clear(db);
// 	}
// });

// test('RQB v2 transaction find first - with relation', async () => {
// 	try {
// 		await init(db);

// 		const date = new Date(120000);

// 		await db.insert(rqbUser).values([{
// 			id: 1,
// 			createdAt: date,
// 			name: 'First',
// 		}, {
// 			id: 2,
// 			createdAt: date,
// 			name: 'Second',
// 		}]);

// 		await db.insert(rqbPost).values([{
// 			id: 1,
// 			userId: 1,
// 			createdAt: date,
// 			content: null,
// 		}, {
// 			id: 2,
// 			userId: 1,
// 			createdAt: date,
// 			content: 'Has message this time',
// 		}]);

// 		await db.transaction(async (db) => {
// 			const result = await db.query.rqbUser.findFirst({
// 				with: {
// 					posts: {
// 						orderBy: {
// 							id: 'asc',
// 						},
// 					},
// 				},
// 				orderBy: {
// 					id: 'asc',
// 				},
// 			});

// 			expect(result).toStrictEqual({
// 				id: 1,
// 				createdAt: date,
// 				name: 'First',
// 				posts: [{
// 					id: 1,
// 					userId: 1,
// 					createdAt: date,
// 					content: null,
// 				}, {
// 					id: 2,
// 					userId: 1,
// 					createdAt: date,
// 					content: 'Has message this time',
// 				}],
// 			});
// 		});
// 	} finally {
// 		await clear(db);
// 	}
// });

// test('RQB v2 transaction find first - placeholders', async () => {
// 	try {
// 		await init(db);

// 		const date = new Date(120000);

// 		await db.insert(rqbUser).values([{
// 			id: 1,
// 			createdAt: date,
// 			name: 'First',
// 		}, {
// 			id: 2,
// 			createdAt: date,
// 			name: 'Second',
// 		}]);

// 		await db.transaction(async (db) => {
// 			const query = db.query.rqbUser.findFirst({
// 				where: {
// 					id: {
// 						eq: sql.placeholder('filter'),
// 					},
// 				},
// 				orderBy: {
// 					id: 'asc',
// 				},
// 			}).prepare('rqb_v2_find_first_tx_placeholders');

// 			const result = await query.execute({
// 				filter: 2,
// 			});

// 			expect(result).toStrictEqual({
// 				id: 2,
// 				createdAt: date,
// 				name: 'Second',
// 			});
// 		});
// 	} finally {
// 		await clear(db);
// 	}
// });

// test('RQB v2 transaction find many - no rows', async () => {
// 	try {
// 		await init(db);

// 		await db.transaction(async (db) => {
// 			const result = await db.query.rqbUser.findMany();

// 			expect(result).toStrictEqual([]);
// 		});
// 	} finally {
// 		await clear(db);
// 	}
// });

// test('RQB v2 transaction find many - multiple rows', async () => {
// 	try {
// 		await init(db);

// 		const date = new Date(120000);

// 		await db.insert(rqbUser).values([{
// 			id: 1,
// 			createdAt: date,
// 			name: 'First',
// 		}, {
// 			id: 2,
// 			createdAt: date,
// 			name: 'Second',
// 		}]);

// 		await db.transaction(async (db) => {
// 			const result = await db.query.rqbUser.findMany({
// 				orderBy: {
// 					id: 'desc',
// 				},
// 			});

// 			expect(result).toStrictEqual([{
// 				id: 2,
// 				createdAt: date,
// 				name: 'Second',
// 			}, {
// 				id: 1,
// 				createdAt: date,
// 				name: 'First',
// 			}]);
// 		});
// 	} finally {
// 		await clear(db);
// 	}
// });

// test('RQB v2 transaction find many - with relation', async () => {
// 	try {
// 		await init(db);

// 		const date = new Date(120000);

// 		await db.insert(rqbUser).values([{
// 			id: 1,
// 			createdAt: date,
// 			name: 'First',
// 		}, {
// 			id: 2,
// 			createdAt: date,
// 			name: 'Second',
// 		}]);

// 		await db.insert(rqbPost).values([{
// 			id: 1,
// 			userId: 1,
// 			createdAt: date,
// 			content: null,
// 		}, {
// 			id: 2,
// 			userId: 1,
// 			createdAt: date,
// 			content: 'Has message this time',
// 		}]);

// 		await db.transaction(async (db) => {
// 			const result = await db.query.rqbPost.findMany({
// 				with: {
// 					author: true,
// 				},
// 				orderBy: {
// 					id: 'asc',
// 				},
// 			});

// 			expect(result).toStrictEqual([{
// 				id: 1,
// 				userId: 1,
// 				createdAt: date,
// 				content: null,
// 				author: {
// 					id: 1,
// 					createdAt: date,
// 					name: 'First',
// 				},
// 			}, {
// 				id: 2,
// 				userId: 1,
// 				createdAt: date,
// 				content: 'Has message this time',
// 				author: {
// 					id: 1,
// 					createdAt: date,
// 					name: 'First',
// 				},
// 			}]);
// 		});
// 	} finally {
// 		await clear(db);
// 	}
// });

// test('RQB v2 transaction find many - placeholders', async () => {
// 	try {
// 		await init(db);

// 		const date = new Date(120000);

// 		await db.insert(rqbUser).values([{
// 			id: 1,
// 			createdAt: date,
// 			name: 'First',
// 		}, {
// 			id: 2,
// 			createdAt: date,
// 			name: 'Second',
// 		}]);

// 		await db.transaction(async (db) => {
// 			const query = db.query.rqbUser.findMany({
// 				where: {
// 					id: {
// 						eq: sql.placeholder('filter'),
// 					},
// 				},
// 				orderBy: {
// 					id: 'asc',
// 				},
// 			}).prepare('rqb_v2_find_many_placeholders');

// 			const result = await query.execute({
// 				filter: 2,
// 			});

// 			expect(result).toStrictEqual([{
// 				id: 2,
// 				createdAt: date,
// 				name: 'Second',
// 			}]);
// 		});
// 	} finally {
// 		await clear(db);
// 	}
// });

// afterAll(async () => {
// 	await db.execute(sql`drop table if exists "users"`);
// 	await db.execute(sql`drop table if exists "todo_user"`);
// 	await db.execute(sql`drop table if exists "user"`);
// 	await db.execute(sql`drop table if exists "todo"`);
// 	await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);
// });
