import 'dotenv/config';

import { RDSDataClient } from '@aws-sdk/client-rds-data';
import { fromIni } from '@aws-sdk/credential-providers';
import type { TestFn } from 'ava';
import anyTest from 'ava';
import * as dotenv from 'dotenv';
import { asc, eq, name, placeholder, sql, TransactionRollbackError } from 'drizzle-orm';
import type { AwsDataApiPgDatabase } from 'drizzle-orm/aws-data-api/pg';
import { drizzle } from 'drizzle-orm/aws-data-api/pg';
import { migrate } from 'drizzle-orm/aws-data-api/pg/migrator';
import {
	alias,
	boolean,
	date,
	integer,
	interval,
	jsonb,
	pgTable,
	pgTableCreator,
	serial,
	text,
	time,
	timestamp,
} from 'drizzle-orm/pg-core';
import type { Equal } from './utils';
import { Expect, randomString } from './utils';

dotenv.config();

const usersTable = pgTable('users', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	jsonb: jsonb('jsonb').$type<string[]>(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

const usersMigratorTable = pgTable('users12', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
});
interface Context {
	db: AwsDataApiPgDatabase;
}

const test = anyTest as TestFn<Context>;

test.before(async (t) => {
	const ctx = t.context;
	const database = process.env['AWS_DATA_API_DB']!;
	const secretArn = process.env['AWS_DATA_API_SECRET_ARN']!;
	const resourceArn = process.env['AWS_DATA_API_RESOURCE_ARN']!;

	const rdsClient = new RDSDataClient({
		credentials: fromIni({ profile: process.env['AWS_TEST_PROFILE'] }),
		region: 'us-east-1',
	});

	ctx.db = drizzle(rdsClient, {
		database,
		secretArn,
		resourceArn,
		// logger: new DefaultLogger(),
	});
});

test.beforeEach(async (t) => {
	const ctx = t.context;
	await ctx.db.execute(sql`drop schema public cascade`);
	await ctx.db.execute(sql`create schema public`);
	await ctx.db.execute(
		sql`
			create table users (
				id serial primary key,
				name text not null,
				verified boolean not null default false, 
				jsonb jsonb,
				created_at timestamptz not null default now()
			)
		`,
	);
});

test.serial('select all fields', async (t) => {
	const { db } = t.context;

	const insertResult = await db.insert(usersTable).values({ name: 'John' });

	t.is(insertResult.numberOfRecordsUpdated, 1);

	const result = await db.select().from(usersTable);

	t.assert(result[0]!.createdAt instanceof Date); // eslint-disable-line no-instanceof/no-instanceof
	// t.assert(Math.abs(result[0]!.createdAt.getTime() - now) < 100);
	t.deepEqual(result, [{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);
});

test.serial('select sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.select({
		name: sql`upper(${usersTable.name})`,
	}).from(usersTable);

	t.deepEqual(users, [{ name: 'JOHN' }]);
});

test.serial('select typed sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.select({
		name: sql<string>`upper(${usersTable.name})`,
	}).from(usersTable);

	t.deepEqual(users, [{ name: 'JOHN' }]);
});

test.serial('select distinct', async (t) => {
	const { db } = t.context;

	const usersDistinctTable = pgTable('users_distinct', {
		id: integer('id').notNull(),
		name: text('name').notNull(),
	});

	await db.execute(sql`drop table if exists ${usersDistinctTable}`);
	await db.execute(sql`create table ${usersDistinctTable} (id integer, name text)`);

	await db.insert(usersDistinctTable).values([
		{ id: 1, name: 'John' },
		{ id: 1, name: 'John' },
		{ id: 2, name: 'John' },
		{ id: 1, name: 'Jane' },
	]);
	const users1 = await db.selectDistinct().from(usersDistinctTable).orderBy(
		usersDistinctTable.id,
		usersDistinctTable.name,
	);
	const users2 = await db.selectDistinctOn([usersDistinctTable.id]).from(usersDistinctTable).orderBy(
		usersDistinctTable.id,
	);
	const users3 = await db.selectDistinctOn([usersDistinctTable.name], { name: usersDistinctTable.name }).from(
		usersDistinctTable,
	).orderBy(usersDistinctTable.name);

	await db.execute(sql`drop table ${usersDistinctTable}`);

	t.deepEqual(users1, [{ id: 1, name: 'Jane' }, { id: 1, name: 'John' }, { id: 2, name: 'John' }]);

	t.deepEqual(users2.length, 2);
	t.deepEqual(users2[0]?.id, 1);
	t.deepEqual(users2[1]?.id, 2);

	t.deepEqual(users3.length, 2);
	t.deepEqual(users3[0]?.name, 'Jane');
	t.deepEqual(users3[1]?.name, 'John');
});

test.serial('insert returning sql', async (t) => {
	const { db } = t.context;

	const users = await db.insert(usersTable).values({ name: 'John' }).returning({
		name: sql`upper(${usersTable.name})`,
	});

	t.deepEqual(users, [{ name: 'JOHN' }]);
});

test.serial('delete returning sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning({
		name: sql`upper(${usersTable.name})`,
	});

	t.deepEqual(users, [{ name: 'JOHN' }]);
});

test.serial('update returning sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning({
		name: sql`upper(${usersTable.name})`,
	});

	t.deepEqual(users, [{ name: 'JANE' }]);
});

test.serial('update with returning all fields', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning();

	t.assert(users[0]!.createdAt instanceof Date); // eslint-disable-line no-instanceof/no-instanceof
	// t.assert(Math.abs(users[0]!.createdAt.getTime() - now) < 100);
	t.deepEqual(users, [{ id: 1, name: 'Jane', verified: false, jsonb: null, createdAt: users[0]!.createdAt }]);
});

test.serial('update with returning partial', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning({
		id: usersTable.id,
		name: usersTable.name,
	});

	t.deepEqual(users, [{ id: 1, name: 'Jane' }]);
});

test.serial('delete with returning all fields', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning();

	t.assert(users[0]!.createdAt instanceof Date); // eslint-disable-line no-instanceof/no-instanceof
	// t.assert(Math.abs(users[0]!.createdAt.getTime() - now) < 100);
	t.deepEqual(users, [{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: users[0]!.createdAt }]);
});

test.serial('delete with returning partial', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning({
		id: usersTable.id,
		name: usersTable.name,
	});

	t.deepEqual(users, [{ id: 1, name: 'John' }]);
});

test.serial('insert + select', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const result = await db.select().from(usersTable);
	t.deepEqual(result, [{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);

	await db.insert(usersTable).values({ name: 'Jane' });
	const result2 = await db.select().from(usersTable);
	t.deepEqual(result2, [
		{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result2[0]!.createdAt },
		{ id: 2, name: 'Jane', verified: false, jsonb: null, createdAt: result2[1]!.createdAt },
	]);
});

test.serial('json insert', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John', jsonb: ['foo', 'bar'] });
	const result = await db.select({
		id: usersTable.id,
		name: usersTable.name,
		jsonb: usersTable.jsonb,
	}).from(usersTable);

	t.deepEqual(result, [{ id: 1, name: 'John', jsonb: ['foo', 'bar'] }]);
});

test.serial('insert with overridden default values', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John', verified: true });
	const result = await db.select().from(usersTable);

	t.deepEqual(result, [{ id: 1, name: 'John', verified: true, jsonb: null, createdAt: result[0]!.createdAt }]);
});

test.serial('insert many', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([
		{ name: 'John' },
		{ name: 'Bruce', jsonb: ['foo', 'bar'] },
		{ name: 'Jane' },
		{ name: 'Austin', verified: true },
	]);
	const result = await db.select({
		id: usersTable.id,
		name: usersTable.name,
		jsonb: usersTable.jsonb,
		verified: usersTable.verified,
	}).from(usersTable);

	t.deepEqual(result, [
		{ id: 1, name: 'John', jsonb: null, verified: false },
		{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
		{ id: 3, name: 'Jane', jsonb: null, verified: false },
		{ id: 4, name: 'Austin', jsonb: null, verified: true },
	]);
});

test.serial('insert many with returning', async (t) => {
	const { db } = t.context;

	const result = await db.insert(usersTable).values([
		{ name: 'John' },
		{ name: 'Bruce', jsonb: ['foo', 'bar'] },
		{ name: 'Jane' },
		{ name: 'Austin', verified: true },
	])
		.returning({
			id: usersTable.id,
			name: usersTable.name,
			jsonb: usersTable.jsonb,
			verified: usersTable.verified,
		});

	t.deepEqual(result, [
		{ id: 1, name: 'John', jsonb: null, verified: false },
		{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
		{ id: 3, name: 'Jane', jsonb: null, verified: false },
		{ id: 4, name: 'Austin', jsonb: null, verified: true },
	]);
});

test.serial('select with group by as field', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.name);

	t.deepEqual(result, [{ name: 'Jane' }, { name: 'John' }]);
});

test.serial('select with group by as sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(sql`${usersTable.name}`);

	t.deepEqual(result, [{ name: 'Jane' }, { name: 'John' }]);
});

test.serial('select with group by as sql + column', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(sql`${usersTable.name}`, usersTable.id);

	t.deepEqual(result, [{ name: 'Jane' }, { name: 'Jane' }, { name: 'John' }]);
});

test.serial('select with group by as column + sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.id, sql`${usersTable.name}`);

	t.deepEqual(result, [{ name: 'Jane' }, { name: 'Jane' }, { name: 'John' }]);
});

test.serial('select with group by complex query', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.id, sql`${usersTable.name}`)
		.orderBy(asc(usersTable.name))
		.limit(1);

	t.deepEqual(result, [{ name: 'Jane' }]);
});

test.serial('build query', async (t) => {
	const { db } = t.context;

	const query = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.id, usersTable.name)
		.toSQL();

	t.deepEqual(query, {
		sql: 'select "id", "name" from "users" group by "users"."id", "users"."name"',
		params: [],
		// typings: []
	});
});

test.serial('insert sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: sql`${'John'}` });
	const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
	t.deepEqual(result, [{ id: 1, name: 'John' }]);
});

test.serial('partial join with alias', async (t) => {
	const { db } = t.context;
	const customerAlias = alias(usersTable, 'customer');

	await db.insert(usersTable).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
	const result = await db
		.select({
			user: {
				id: usersTable.id,
				name: usersTable.name,
			},
			customer: {
				id: customerAlias.id,
				name: customerAlias.name,
			},
		}).from(usersTable)
		.leftJoin(customerAlias, eq(customerAlias.id, 11))
		.where(eq(usersTable.id, 10));

	t.deepEqual(result, [{
		user: { id: 10, name: 'Ivan' },
		customer: { id: 11, name: 'Hans' },
	}]);
});

test.serial('full join with alias', async (t) => {
	const { db } = t.context;
	const customerAlias = alias(usersTable, 'customer');

	await db.insert(usersTable).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);

	const result = await db
		.select().from(usersTable)
		.leftJoin(customerAlias, eq(customerAlias.id, 11))
		.where(eq(usersTable.id, 10));

	t.deepEqual(result, [{
		users: {
			id: 10,
			name: 'Ivan',
			verified: false,
			jsonb: null,
			createdAt: result[0]!.users.createdAt,
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

test.serial('select from alias', async (t) => {
	const { db } = t.context;

	const pgTable = pgTableCreator((name) => `prefixed_${name}`);

	const users = pgTable('users', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`create table ${users} (id serial primary key, name text not null)`);

	const user = alias(users, 'user');
	const customers = alias(users, 'customer');

	await db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
	const result = await db
		.select()
		.from(user)
		.leftJoin(customers, eq(customers.id, 11))
		.where(eq(user.id, 10));

	t.deepEqual(result, [{
		user: {
			id: 10,
			name: 'Ivan',
		},
		customer: {
			id: 11,
			name: 'Hans',
		},
	}]);

	await db.execute(sql`drop table ${users}`);
});

test.serial('insert with spaces', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: sql`'Jo   h     n'` });
	const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);

	t.deepEqual(result, [{ id: 1, name: 'Jo   h     n' }]);
});

test.serial('prepared statement', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const statement = db
		.select({
			id: usersTable.id,
			name: usersTable.name,
		})
		.from(usersTable)
		.prepare('statement1');
	const result = await statement.execute();

	t.deepEqual(result, [{ id: 1, name: 'John' }]);
});

test.serial('prepared statement reuse', async (t) => {
	const { db } = t.context;

	const stmt = db.insert(usersTable).values({
		verified: true,
		name: placeholder('name'),
	}).prepare('stmt2');

	for (let i = 0; i < 10; i++) {
		await stmt.execute({ name: `John ${i}` });
	}

	const result = await db.select({
		id: usersTable.id,
		name: usersTable.name,
		verified: usersTable.verified,
	}).from(usersTable);

	t.deepEqual(result, [
		{ id: 1, name: 'John 0', verified: true },
		{ id: 2, name: 'John 1', verified: true },
		{ id: 3, name: 'John 2', verified: true },
		{ id: 4, name: 'John 3', verified: true },
		{ id: 5, name: 'John 4', verified: true },
		{ id: 6, name: 'John 5', verified: true },
		{ id: 7, name: 'John 6', verified: true },
		{ id: 8, name: 'John 7', verified: true },
		{ id: 9, name: 'John 8', verified: true },
		{ id: 10, name: 'John 9', verified: true },
	]);
});

test.serial('prepared statement with placeholder in .where', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const stmt = db
		.select({
			id: usersTable.id,
			name: usersTable.name,
		})
		.from(usersTable)
		.where(eq(usersTable.id, placeholder('id')))
		.prepare('stmt3');
	const result = await stmt.execute({ id: 1 });

	t.deepEqual(result, [{ id: 1, name: 'John' }]);
});

test.serial('migrator : default migration strategy', async (t) => {
	const { db } = t.context;

	await db.execute(sql`drop table if exists all_columns`);
	await db.execute(sql`drop table if exists users12`);
	await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

	await migrate(db, { migrationsFolder: './drizzle/pg' });

	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });

	const result = await db.select().from(usersMigratorTable);

	t.deepEqual(result, [{ id: 1, name: 'John', email: 'email' }]);

	await db.execute(sql`drop table all_columns`);
	await db.execute(sql`drop table users12`);
	await db.execute(sql`drop table "drizzle"."__drizzle_migrations"`);
});

test.serial('migrator : migrate with custom schema', async (t) => {
	const { db } = t.context;
	const customSchema = randomString();
	await db.execute(sql`drop table if exists all_columns`);
	await db.execute(sql`drop table if exists users12`);
	await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

	await migrate(db, { migrationsFolder: './drizzle/pg', migrationsSchema: customSchema });

	// test if the custom migrations table was created
	const { records } = await db.execute(sql`select * from ${sql.identifier(customSchema)}."__drizzle_migrations";`);
	t.true(records && records?.length > 0);

	// test if the migrated table are working as expected
	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
	const result = await db.select().from(usersMigratorTable);
	t.deepEqual(result, [{ id: 1, name: 'John', email: 'email' }]);

	await db.execute(sql`drop table all_columns`);
	await db.execute(sql`drop table users12`);
	await db.execute(sql`drop table ${sql.identifier(customSchema)}."__drizzle_migrations"`);
});

test.serial('migrator : migrate with custom table', async (t) => {
	const { db } = t.context;
	const customTable = randomString();
	await db.execute(sql`drop table if exists all_columns`);
	await db.execute(sql`drop table if exists users12`);
	await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

	await migrate(db, { migrationsFolder: './drizzle/pg', migrationsTable: customTable });

	// test if the custom migrations table was created
	const { records } = await db.execute(sql`select * from "drizzle".${sql.identifier(customTable)};`);
	t.true(records && records?.length > 0);

	// test if the migrated table are working as expected
	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
	const result = await db.select().from(usersMigratorTable);
	t.deepEqual(result, [{ id: 1, name: 'John', email: 'email' }]);

	await db.execute(sql`drop table all_columns`);
	await db.execute(sql`drop table users12`);
	await db.execute(sql`drop table "drizzle".${sql.identifier(customTable)}`);
});

test.serial('migrator : migrate with custom table and custom schema', async (t) => {
	const { db } = t.context;
	const customTable = randomString();
	const customSchema = randomString();
	await db.execute(sql`drop table if exists all_columns`);
	await db.execute(sql`drop table if exists users12`);
	await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

	await migrate(db, { migrationsFolder: './drizzle/pg', migrationsTable: customTable, migrationsSchema: customSchema });

	// test if the custom migrations table was created
	const { records } = await db.execute(
		sql`select * from ${sql.identifier(customSchema)}.${sql.identifier(customTable)};`,
	);
	t.true(records && records?.length > 0);

	// test if the migrated table are working as expected
	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
	const result = await db.select().from(usersMigratorTable);
	t.deepEqual(result, [{ id: 1, name: 'John', email: 'email' }]);

	await db.execute(sql`drop table all_columns`);
	await db.execute(sql`drop table users12`);
	await db.execute(sql`drop table ${sql.identifier(customSchema)}.${sql.identifier(customTable)}`);
});

test.serial('insert via db.execute + select via db.execute', async (t) => {
	const { db } = t.context;

	await db.execute(sql`insert into ${usersTable} (${name(usersTable.name.name)}) values (${'John'})`);

	const result = await db.execute(sql`select id, name from "users"`);
	t.deepEqual(result.records![0], [{ longValue: 1 }, { stringValue: 'John' }]);
});

test.serial('insert via db.execute + returning', async (t) => {
	const { db } = t.context;

	const inserted = await db.execute(
		sql`insert into ${usersTable} (${
			name(usersTable.name.name)
		}) values (${'John'}) returning ${usersTable.id}, ${usersTable.name}`,
	);
	t.deepEqual(inserted.records![0], [{ longValue: 1 }, { stringValue: 'John' }]);
});

test.serial('insert via db.execute w/ query builder', async (t) => {
	const { db } = t.context;

	const inserted = await db.execute(
		db.insert(usersTable).values({ name: 'John' }).returning({ id: usersTable.id, name: usersTable.name }),
	);
	t.deepEqual(inserted.records![0], [{ longValue: 1 }, { stringValue: 'John' }]);
});

test.serial('build query insert with onConflict do update', async (t) => {
	const { db } = t.context;

	const query = db.insert(usersTable)
		.values({ name: 'John', jsonb: ['foo', 'bar'] })
		.onConflictDoUpdate({ target: usersTable.id, set: { name: 'John1' } })
		.toSQL();

	t.deepEqual(query, {
		sql: 'insert into "users" ("name", "jsonb") values (:1, :2) on conflict ("id") do update set "name" = :3',
		params: ['John', '["foo","bar"]', 'John1'],
		// typings: ['none', 'json', 'none']
	});
});

test.serial('build query insert with onConflict do update / multiple columns', async (t) => {
	const { db } = t.context;

	const query = db.insert(usersTable)
		.values({ name: 'John', jsonb: ['foo', 'bar'] })
		.onConflictDoUpdate({ target: [usersTable.id, usersTable.name], set: { name: 'John1' } })
		.toSQL();

	t.deepEqual(query, {
		sql: 'insert into "users" ("name", "jsonb") values (:1, :2) on conflict ("id","name") do update set "name" = :3',
		params: ['John', '["foo","bar"]', 'John1'],
		// typings: ['none', 'json', 'none']
	});
});

test.serial('build query insert with onConflict do nothing', async (t) => {
	const { db } = t.context;

	const query = db.insert(usersTable)
		.values({ name: 'John', jsonb: ['foo', 'bar'] })
		.onConflictDoNothing()
		.toSQL();

	t.deepEqual(query, {
		sql: 'insert into "users" ("name", "jsonb") values (:1, :2) on conflict do nothing',
		params: ['John', '["foo","bar"]'],
		// typings: ['none', 'json']
	});
});

test.serial('build query insert with onConflict do nothing + target', async (t) => {
	const { db } = t.context;

	const query = db.insert(usersTable)
		.values({ name: 'John', jsonb: ['foo', 'bar'] })
		.onConflictDoNothing({ target: usersTable.id })
		.toSQL();

	t.deepEqual(query, {
		sql: 'insert into "users" ("name", "jsonb") values (:1, :2) on conflict ("id") do nothing',
		params: ['John', '["foo","bar"]'],
		// typings: ['none', 'json']
	});
});

test.serial('insert with onConflict do update', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable)
		.values({ name: 'John' });

	await db.insert(usersTable)
		.values({ id: 1, name: 'John' })
		.onConflictDoUpdate({ target: usersTable.id, set: { name: 'John1' } });

	const res = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(
		eq(usersTable.id, 1),
	);

	t.deepEqual(res, [{ id: 1, name: 'John1' }]);
});

test.serial('insert with onConflict do nothing', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable)
		.values({ name: 'John' });

	await db.insert(usersTable)
		.values({ id: 1, name: 'John' })
		.onConflictDoNothing();

	const res = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(
		eq(usersTable.id, 1),
	);

	t.deepEqual(res, [{ id: 1, name: 'John' }]);
});

test.serial('insert with onConflict do nothing + target', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable)
		.values({ name: 'John' });

	await db.insert(usersTable)
		.values({ id: 1, name: 'John' })
		.onConflictDoNothing({ target: usersTable.id });

	const res = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(
		eq(usersTable.id, 1),
	);

	t.deepEqual(res, [{ id: 1, name: 'John' }]);
});

test.serial('transaction', async (t) => {
	const { db } = t.context;

	const users = pgTable('users_transactions', {
		id: serial('id').primaryKey(),
		balance: integer('balance').notNull(),
	});
	const products = pgTable('products_transactions', {
		id: serial('id').primaryKey(),
		price: integer('price').notNull(),
		stock: integer('stock').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`drop table if exists ${products}`);

	await db.execute(sql`create table users_transactions (id serial not null primary key, balance integer not null)`);
	await db.execute(
		sql`create table products_transactions (id serial not null primary key, price integer not null, stock integer not null)`,
	);

	const user = await db.insert(users).values({ balance: 100 }).returning().then((rows) => rows[0]!);
	const product = await db.insert(products).values({ price: 10, stock: 10 }).returning().then((rows) => rows[0]!);

	await db.transaction(async (tx) => {
		await tx.update(users).set({ balance: user.balance - product.price }).where(eq(users.id, user.id));
		await tx.update(products).set({ stock: product.stock - 1 }).where(eq(products.id, product.id));
	});

	const result = await db.select().from(users);

	t.deepEqual(result, [{ id: 1, balance: 90 }]);

	await db.execute(sql`drop table ${users}`);
	await db.execute(sql`drop table ${products}`);
});

test.serial('transaction rollback', async (t) => {
	const { db } = t.context;

	const users = pgTable('users_transactions_rollback', {
		id: serial('id').primaryKey(),
		balance: integer('balance').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table users_transactions_rollback (id serial not null primary key, balance integer not null)`,
	);

	await t.throwsAsync(async () =>
		await db.transaction(async (tx) => {
			await tx.insert(users).values({ balance: 100 });
			tx.rollback();
		}), { instanceOf: TransactionRollbackError });

	const result = await db.select().from(users);

	t.deepEqual(result, []);

	await db.execute(sql`drop table ${users}`);
});

test.serial('nested transaction', async (t) => {
	const { db } = t.context;

	const users = pgTable('users_nested_transactions', {
		id: serial('id').primaryKey(),
		balance: integer('balance').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table users_nested_transactions (id serial not null primary key, balance integer not null)`,
	);

	await db.transaction(async (tx) => {
		await tx.insert(users).values({ balance: 100 });

		await tx.transaction(async (tx) => {
			await tx.update(users).set({ balance: 200 });
		});
	});

	const result = await db.select().from(users);

	t.deepEqual(result, [{ id: 1, balance: 200 }]);

	await db.execute(sql`drop table ${users}`);
});

test.serial('nested transaction rollback', async (t) => {
	const { db } = t.context;

	const users = pgTable('users_nested_transactions_rollback', {
		id: serial('id').primaryKey(),
		balance: integer('balance').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table users_nested_transactions_rollback (id serial not null primary key, balance integer not null)`,
	);

	await db.transaction(async (tx) => {
		await tx.insert(users).values({ balance: 100 });

		await t.throwsAsync(async () =>
			await tx.transaction(async (tx) => {
				await tx.update(users).set({ balance: 200 });
				tx.rollback();
			}), { instanceOf: TransactionRollbackError });
	});

	const result = await db.select().from(users);

	t.deepEqual(result, [{ id: 1, balance: 100 }]);

	await db.execute(sql`drop table ${users}`);
});

test.serial('select from raw sql', async (t) => {
	const { db } = t.context;

	const result = await db.execute(sql`select 1 as id, 'John' as name`);

	t.deepEqual(result, [
		{ id: 1, name: 'John' },
	]);
});

test.serial('select from raw sql with mapped values', async (t) => {
	const { db } = t.context;

	const result = await db.select({
		id: sql<number>`id`,
		name: sql<string>`name`,
	}).from(sql`(select 1 as id, 'John' as name) as users`);

	t.deepEqual(result, [
		{ id: 1, name: 'John' },
	]);
});

test.serial('all date and time columns', async (t) => {
	const { db } = t.context;

	const table = pgTable('all_columns', {
		id: serial('id').primaryKey(),
		dateString: date('date_string', { mode: 'string' }).notNull(),
		time: time('time', { precision: 3 }).notNull(),
		datetime: timestamp('datetime').notNull(),
		datetimeWTZ: timestamp('datetime_wtz', { withTimezone: true }).notNull(),
		datetimeString: timestamp('datetime_string', { mode: 'string' }).notNull(),
		datetimeFullPrecision: timestamp('datetime_full_precision', { precision: 6, mode: 'string' }).notNull(),
		datetimeWTZString: timestamp('datetime_wtz_string', { withTimezone: true, mode: 'string' }).notNull(),
		interval: interval('interval').notNull(),
	});

	await db.execute(sql`drop table if exists ${table}`);

	await db.execute(sql`
		create table ${table} (
					id serial primary key,
					date_string date not null,
					time time(3) not null,
					datetime timestamp not null,
					datetime_wtz timestamp with time zone not null,
					datetime_string timestamp not null,
					datetime_full_precision timestamp(6) not null,
					datetime_wtz_string timestamp with time zone not null,
					interval interval not null
			)
	`);

	const someDatetime = new Date('2022-01-01T00:00:00.123Z');
	const fullPrecision = '2022-01-01T00:00:00.123456';
	const someTime = '23:23:12.432';

	await db.insert(table).values({
		dateString: '2022-01-01',
		time: someTime,
		datetime: someDatetime,
		datetimeWTZ: someDatetime,
		datetimeString: '2022-01-01T00:00:00.123Z',
		datetimeFullPrecision: fullPrecision,
		datetimeWTZString: '2022-01-01T00:00:00.123Z',
		interval: '1 day',
	});

	const result = await db.select().from(table);

	Expect<
		Equal<{
			id: number;
			dateString: string;
			time: string;
			datetime: Date;
			datetimeWTZ: Date;
			datetimeString: string;
			datetimeFullPrecision: string;
			datetimeWTZString: string;
			interval: string;
		}[], typeof result>
	>;

	Expect<
		Equal<{
			dateString: string;
			time: string;
			datetime: Date;
			datetimeWTZ: Date;
			datetimeString: string;
			datetimeFullPrecision: string;
			datetimeWTZString: string;
			interval: string;
			id?: number | undefined;
		}, typeof table.$inferInsert>
	>;

	t.deepEqual(result, [
		{
			id: 1,
			dateString: '2022-01-01',
			time: someTime,
			datetime: someDatetime,
			datetimeWTZ: someDatetime,
			datetimeString: '2022-01-01 00:00:00.123',
			datetimeFullPrecision: fullPrecision.replace('T', ' ').replace('Z', ''),
			datetimeWTZString: '2022-01-01 00:00:00.123+00',
			interval: '1 day',
		},
	]);

	await db.execute(sql`drop table if exists ${table}`);
});

test.serial('all date and time columns with timezone', async (t) => {
	const { db } = t.context;

	const table = pgTable('all_columns', {
		id: serial('id').primaryKey(),
		timestamp: timestamp('timestamp_string', { mode: 'string', withTimezone: true, precision: 6 }).notNull(),
		timestampAsDate: timestamp('timestamp_date', { withTimezone: true, precision: 3 }).notNull(),
		timestampTimeZones: timestamp('timestamp_date_2', { withTimezone: true, precision: 3 }).notNull(),
	});

	await db.execute(sql`drop table if exists ${table}`);

	await db.execute(sql`
		create table ${table} (
					id serial primary key,
					timestamp_string timestamp(6) with time zone not null,
					timestamp_date timestamp(3) with time zone not null,
					timestamp_date_2 timestamp(3) with time zone not null
			)
	`);

	const timestampString = '2022-01-01 00:00:00.123456-0200';
	const timestampDate = new Date();
	const timestampDateWTZ = new Date('2022-01-01 00:00:00.123 +0500');

	const timestampString2 = '2022-01-01 00:00:00.123456-0400';
	const timestampDate2 = new Date();
	const timestampDateWTZ2 = new Date('2022-01-01 00:00:00.123 +0200');

	await db.insert(table).values([
		{ timestamp: timestampString, timestampAsDate: timestampDate, timestampTimeZones: timestampDateWTZ },
		{ timestamp: timestampString2, timestampAsDate: timestampDate2, timestampTimeZones: timestampDateWTZ2 },
	]);

	const result = await db.select().from(table);
	const result2 = await db.execute<{
		id: number;
		timestamp_string: string;
		timestamp_date: string;
		timestamp_date_2: string;
	}>(sql`select * from ${table}`);

	// Whatever you put in, you get back when you're using the date mode
	// But when using the string mode, postgres returns a string transformed into UTC
	t.deepEqual(result, [
		{
			id: 1,
			timestamp: '2022-01-01 02:00:00.123456+00',
			timestampAsDate: timestampDate,
			timestampTimeZones: timestampDateWTZ,
		},
		{
			id: 2,
			timestamp: '2022-01-01 04:00:00.123456+00',
			timestampAsDate: timestampDate2,
			timestampTimeZones: timestampDateWTZ2,
		},
	]);

	t.deepEqual(result2.records, [
		{
			id: 1,
			timestamp_string: '2022-01-01 02:00:00.123456+00',
			timestamp_date: timestampDate.toISOString().replace('T', ' ').replace('Z', '') + '+00',
			timestamp_date_2: timestampDateWTZ.toISOString().replace('T', ' ').replace('Z', '') + '+00',
		},
		{
			id: 2,
			timestamp_string: '2022-01-01 04:00:00.123456+00',
			timestamp_date: timestampDate2.toISOString().replace('T', ' ').replace('Z', '') + '+00',
			timestamp_date_2: timestampDateWTZ2.toISOString().replace('T', ' ').replace('Z', '') + '+00',
		},
	]);

	t.deepEqual(
		result[0]?.timestampTimeZones.getTime(),
		new Date((result2.records?.[0] as any).timestamp_date_2 as any).getTime(),
	);

	await db.execute(sql`drop table if exists ${table}`);
});

test.serial('all date and time columns without timezone', async (t) => {
	const { db } = t.context;

	const table = pgTable('all_columns', {
		id: serial('id').primaryKey(),
		timestampString: timestamp('timestamp_string', { mode: 'string', precision: 6 }).notNull(),
		timestampString2: timestamp('timestamp_string2', { precision: 3, mode: 'string' }).notNull(),
		timestampDate: timestamp('timestamp_date', { precision: 3 }).notNull(),
	});

	await db.execute(sql`drop table if exists ${table}`);

	await db.execute(sql`
		create table ${table} (
					id serial primary key,
					timestamp_string timestamp(6) not null,
					timestamp_string2 timestamp(3) not null,
					timestamp_date timestamp(3) not null
			)
	`);

	const timestampString = '2022-01-01 00:00:00.123456';
	const timestampString2 = '2022-01-02 00:00:00.123 -0300';
	const timestampDate = new Date('2022-01-01 00:00:00.123Z');

	const timestampString_2 = '2022-01-01 00:00:00.123456';
	const timestampString2_2 = '2022-01-01 00:00:00.123 -0300';
	const timestampDate2 = new Date('2022-01-01 00:00:00.123 +0200');

	await db.insert(table).values([
		{ timestampString, timestampString2, timestampDate },
		{ timestampString: timestampString_2, timestampString2: timestampString2_2, timestampDate: timestampDate2 },
	]);

	const result = await db.select().from(table);
	const result2 = await db.execute<{
		id: number;
		timestamp_string: string;
		timestamp_string2: string;
		timestamp_date: string;
	}>(sql`select * from ${table}`);

	// Whatever you put in, you get back when you're using the date mode
	// But when using the string mode, postgres returns a string transformed into UTC
	t.deepEqual(result, [
		{
			id: 1,
			timestampString: timestampString,
			timestampString2: '2022-01-02 00:00:00.123',
			timestampDate: timestampDate,
		},
		{
			id: 2,
			timestampString: timestampString_2,
			timestampString2: '2022-01-01 00:00:00.123',
			timestampDate: timestampDate2,
		},
	]);

	t.deepEqual(result2.records, [
		{
			id: 1,
			timestamp_string: timestampString,
			timestamp_string2: '2022-01-02 00:00:00.123',
			timestamp_date: timestampDate.toISOString().replace('T', ' ').replace('Z', ''),
		},
		{
			id: 2,
			timestamp_string: timestampString_2,
			timestamp_string2: '2022-01-01 00:00:00.123',
			timestamp_date: timestampDate2.toISOString().replace('T', ' ').replace('Z', ''),
		},
	]);

	t.deepEqual((result2.records?.[0] as any).timestamp_string, '2022-01-01 00:00:00.123456');
	// need to add the 'Z', otherwise javascript assumes it's in local time
	t.deepEqual(new Date((result2.records?.[0] as any).timestamp_date + 'Z' as any).getTime(), timestampDate.getTime());

	await db.execute(sql`drop table if exists ${table}`);
});

test.after.always(async (t) => {
	const ctx = t.context;
	await ctx.db.execute(sql`drop table "users"`);
	await ctx.db.execute(sql`drop table "drizzle"."__drizzle_migrations"`);
	// await ctx.client?.end().catch(console.error);
	// await ctx.pgContainer?.stop().catch(console.error);
});
