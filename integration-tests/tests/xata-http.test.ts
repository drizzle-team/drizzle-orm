import 'dotenv/config';

import {
	and,
	arrayContained,
	arrayContains,
	arrayOverlaps,
	asc,
	eq,
	gt,
	gte,
	inArray,
	lt,
	name,
	placeholder,
	type SQL,
	sql,
	type SQLWrapper,
} from 'drizzle-orm';
import {
	alias,
	boolean,
	char,
	cidr,
	date,
	inet,
	integer,
	interval,
	jsonb,
	macaddr,
	macaddr8,
	type PgColumn,
	pgTable,
	pgTableCreator,
	serial,
	text,
	time,
	timestamp,
	uuid as pgUuid,
} from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/xata-http';
import type { XataHttpClient, XataHttpDatabase } from 'drizzle-orm/xata-http';
import { migrate } from 'drizzle-orm/xata-http/migrator';
import { v4 as uuid } from 'uuid';
import { beforeAll, beforeEach, expect, test } from 'vitest';
import { type Equal, Expect, randomString } from './utils.ts';
import { getXataClient } from './xata/xata.ts';

const ENABLE_LOGGING = false;

const usersTable = pgTable('users', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	jsonb: jsonb('jsonb').$type<string[]>(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

const citiesTable = pgTable('cities', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	state: char('state', { length: 2 }),
});

const users2Table = pgTable('users2', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	cityId: integer('city_id').references(() => citiesTable.id),
});

const coursesTable = pgTable('courses', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	categoryId: integer('category_id').references(() => courseCategoriesTable.id),
});

const courseCategoriesTable = pgTable('course_categories', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
});

const orders = pgTable('orders', {
	id: serial('id').primaryKey(),
	region: text('region').notNull(),
	product: text('product').notNull(),
	amount: integer('amount').notNull(),
	quantity: integer('quantity').notNull(),
});

const network = pgTable('network_table', {
	inet: inet('inet').notNull(),
	cidr: cidr('cidr').notNull(),
	macaddr: macaddr('macaddr').notNull(),
	macaddr8: macaddr8('macaddr8').notNull(),
});

const salEmp = pgTable('sal_emp', {
	name: text('name'),
	payByQuarter: integer('pay_by_quarter').array(),
	schedule: text('schedule').array().array(),
});

const _tictactoe = pgTable('tictactoe', {
	squares: integer('squares').array(3).array(3),
});

const usersMigratorTable = pgTable('users12', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
});

let db: XataHttpDatabase;
let client: XataHttpClient;

beforeAll(async () => {
	const apiKey = process.env['XATA_API_KEY'];
	if (!apiKey) {
		throw new Error('XATA_API_KEY is not defined');
	}

	client = getXataClient();
	db = drizzle(client, { logger: ENABLE_LOGGING });
});

beforeEach(async () => {
	await db.execute(sql`drop table if exists users cascade`);
	await db.execute(sql`drop table if exists cities cascade`);
	await db.execute(sql`drop table if exists users2 cascade`);
	await db.execute(sql`drop table if exists course_categories cascade`);
	await db.execute(sql`drop table if exists courses cascade`);
	await db.execute(sql`drop table if exists orders cascade`);
	await db.execute(sql`drop table if exists network_table cascade`);
	await db.execute(sql`drop table if exists sal_emp cascade`);
	await db.execute(sql`drop table if exists tictactoe cascade`);

	await client.sql({
		statement: `
			create table users (
				id serial primary key,
				name text not null,
				verified boolean not null default false,
				jsonb jsonb,
				created_at timestamptz not null default now()
			)
		`,
	});
	await client.sql({
		statement: `
			create table cities (
				id serial primary key,
				name text not null,
				state char(2)
			)
		`,
	});
	await client.sql({
		statement: `
			create table users2 (
				id serial primary key,
				name text not null,
				city_id integer references cities(id)
			)
		`,
	});
	await client.sql({
		statement: `
			create table course_categories (
				id serial primary key,
				name text not null
			)
		`,
	});
	await client.sql({
		statement: `
			create table courses (
				id serial primary key,
				name text not null,
				category_id integer references course_categories(id)
			)
		`,
	});
	await client.sql({
		statement: `
			create table orders (
				id serial primary key,
				region text not null,
				product text not null,
				amount integer not null,
				quantity integer not null
			)
		`,
	});
	await client.sql({
		statement: `
			create table network_table (
				inet inet not null,
				cidr cidr not null,
				macaddr macaddr not null,
				macaddr8 macaddr8 not null
			)
		`,
	});
	await client.sql({
		statement: `
			create table sal_emp (
				name text not null,
				pay_by_quarter integer[] not null,
				schedule text[][] not null
			)
		`,
	});
	await client.sql({
		statement: `
			create table tictactoe (
				squares integer[3][3] not null
			)
		`,
	});
});

test('select all fields', async () => {
	const now = Date.now();

	await db.insert(usersTable).values({ name: 'John' });
	const result = await db.select().from(usersTable);

	expect(result[0]!.createdAt instanceof Date).toBeTruthy(); // eslint-disable-line no-instanceof/no-instanceof
	expect(Math.abs(result[0]!.createdAt.getTime() - now) < 1000).toBeTruthy();
	expect(result).toEqual([
		{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt },
	]);
});

test('select sql', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const users = await db
		.select({
			name: sql`upper(${usersTable.name})`,
		})
		.from(usersTable);

	expect(users).toEqual([{ name: 'JOHN' }]);
});

test('select typed sql', async () => {
	await db.insert(usersTable).values({ name: 'John' });

	const users = await db.select({
		name: sql<string>`upper(${usersTable.name})`,
	}).from(usersTable);

	expect(users).toEqual([{ name: 'JOHN' }]);
});

test('select distinct', async () => {
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

	expect(users1).toEqual([{ id: 1, name: 'Jane' }, { id: 1, name: 'John' }, { id: 2, name: 'John' }]);

	expect(users2.length).toEqual(2);
	expect(users2[0]?.id).toEqual(1);
	expect(users2[1]?.id).toEqual(2);

	expect(users3.length).toEqual(2);
	expect(users3[0]?.name, 'Jane');
	expect(users3[1]?.name, 'John');
});

test('insert returning sql', async () => {
	const users = await db
		.insert(usersTable)
		.values({ name: 'John' })
		.returning({
			name: sql`upper(${usersTable.name})`,
		});

	expect(users).toEqual([{ name: 'JOHN' }]);
});

test('delete returning sql', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const users = await db
		.delete(usersTable)
		.where(eq(usersTable.name, 'John'))
		.returning({
			name: sql`upper(${usersTable.name})`,
		});

	expect(users).toEqual([{ name: 'JOHN' }]);
});

test('update returning sql', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const users = await db
		.update(usersTable)
		.set({ name: 'Jane' })
		.where(eq(usersTable.name, 'John'))
		.returning({
			name: sql`upper(${usersTable.name})`,
		});

	expect(users).toEqual([{ name: 'JANE' }]);
});

test('update with returning all fields', async () => {
	const now = Date.now();

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db
		.update(usersTable)
		.set({ name: 'Jane' })
		.where(eq(usersTable.name, 'John'))
		.returning();

	expect(users[0]!.createdAt instanceof Date).toBeTruthy(); // eslint-disable-line no-instanceof/no-instanceof
	expect(Math.abs(users[0]!.createdAt.getTime() - now) < 1000).toBeTruthy();
	expect(users).toEqual([
		{ id: 1, name: 'Jane', verified: false, jsonb: null, createdAt: users[0]!.createdAt },
	]);
});

test('update with returning partial', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const users = await db
		.update(usersTable)
		.set({ name: 'Jane' })
		.where(eq(usersTable.name, 'John'))
		.returning({
			id: usersTable.id,
			name: usersTable.name,
		});

	expect(users).toEqual([{ id: 1, name: 'Jane' }]);
});

test('delete with returning all fields', async () => {
	const now = Date.now();

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning();

	expect(users[0]!.createdAt instanceof Date).toBeTruthy(); // eslint-disable-line no-instanceof/no-instanceof
	expect(Math.abs(users[0]!.createdAt.getTime() - now) < 1000).toBeTruthy();
	expect(users).toEqual([
		{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: users[0]!.createdAt },
	]);
});

test('delete with returning partial', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning({
		id: usersTable.id,
		name: usersTable.name,
	});

	expect(users).toEqual([{ id: 1, name: 'John' }]);
});

test('insert + select', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const result = await db.select().from(usersTable);
	expect(result).toEqual([
		{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt },
	]);

	await db.insert(usersTable).values({ name: 'Jane' });
	const result2 = await db.select().from(usersTable);
	expect(result2).toEqual([
		{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result2[0]!.createdAt },
		{ id: 2, name: 'Jane', verified: false, jsonb: null, createdAt: result2[1]!.createdAt },
	]);
});

test('json insert', async () => {
	await db.insert(usersTable).values({ name: 'John', jsonb: ['foo', 'bar'] });
	const result = await db
		.select({
			id: usersTable.id,
			name: usersTable.name,
			jsonb: usersTable.jsonb,
		})
		.from(usersTable);

	expect(result).toEqual([{ id: 1, name: 'John', jsonb: ['foo', 'bar'] }]);
});

test('char insert', async () => {
	await db.insert(citiesTable).values({ name: 'Austin', state: 'TX' });
	const result = await db
		.select({ id: citiesTable.id, name: citiesTable.name, state: citiesTable.state })
		.from(citiesTable);

	expect(result).toEqual([{ id: 1, name: 'Austin', state: 'TX' }]);
});

test('char update', async () => {
	await db.insert(citiesTable).values({ name: 'Austin', state: 'TX' });
	await db.update(citiesTable).set({ name: 'Atlanta', state: 'GA' }).where(eq(citiesTable.id, 1));
	const result = await db
		.select({ id: citiesTable.id, name: citiesTable.name, state: citiesTable.state })
		.from(citiesTable);

	expect(result).toEqual([{ id: 1, name: 'Atlanta', state: 'GA' }]);
});

test('char delete', async () => {
	await db.insert(citiesTable).values({ name: 'Austin', state: 'TX' });
	await db.delete(citiesTable).where(eq(citiesTable.state, 'TX'));
	const result = await db
		.select({ id: citiesTable.id, name: citiesTable.name, state: citiesTable.state })
		.from(citiesTable);

	expect(result).toEqual([]);
});

test('insert with overridden default values', async () => {
	await db.insert(usersTable).values({ name: 'John', verified: true });
	const result = await db.select().from(usersTable);

	expect(result).toEqual([
		{ id: 1, name: 'John', verified: true, jsonb: null, createdAt: result[0]!.createdAt },
	]);
});

test('insert many', async () => {
	await db
		.insert(usersTable)
		.values([
			{ name: 'John' },
			{ name: 'Bruce', jsonb: ['foo', 'bar'] },
			{ name: 'Jane' },
			{ name: 'Austin', verified: true },
		]);
	const result = await db
		.select({
			id: usersTable.id,
			name: usersTable.name,
			jsonb: usersTable.jsonb,
			verified: usersTable.verified,
		})
		.from(usersTable);

	expect(result).toEqual([
		{ id: 1, name: 'John', jsonb: null, verified: false },
		{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
		{ id: 3, name: 'Jane', jsonb: null, verified: false },
		{ id: 4, name: 'Austin', jsonb: null, verified: true },
	]);
});

test('insert many with returning', async () => {
	const result = await db
		.insert(usersTable)
		.values([
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

	expect(result).toEqual([
		{ id: 1, name: 'John', jsonb: null, verified: false },
		{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
		{ id: 3, name: 'Jane', jsonb: null, verified: false },
		{ id: 4, name: 'Austin', jsonb: null, verified: true },
	]);
});

test('select with group by as field', async () => {
	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db
		.select({ name: usersTable.name })
		.from(usersTable)
		.groupBy(usersTable.name);

	expect(result).toEqual([{ name: 'Jane' }, { name: 'John' }]);
});

test('select with group by as sql', async () => {
	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db
		.select({ name: usersTable.name })
		.from(usersTable)
		.groupBy(sql`${usersTable.name}`);

	expect(result).toEqual([{ name: 'Jane' }, { name: 'John' }]);
});

test('select with group by as sql + column', async () => {
	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db
		.select({ name: usersTable.name })
		.from(usersTable)
		.groupBy(sql`${usersTable.name}`, usersTable.id);

	expect(result).toEqual([{ name: 'Jane' }, { name: 'Jane' }, { name: 'John' }]);
});

test('select with group by as column + sql', async () => {
	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db
		.select({ name: usersTable.name })
		.from(usersTable)
		.groupBy(usersTable.id, sql`${usersTable.name}`);

	expect(result).toEqual([{ name: 'Jane' }, { name: 'Jane' }, { name: 'John' }]);
});

test('select with group by complex query', async () => {
	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db
		.select({ name: usersTable.name })
		.from(usersTable)
		.groupBy(usersTable.id, sql`${usersTable.name}`)
		.orderBy(asc(usersTable.name))
		.limit(1);

	expect(result).toEqual([{ name: 'Jane' }]);
});

test('build query', async () => {
	const query = db
		.select({ id: usersTable.id, name: usersTable.name })
		.from(usersTable)
		.groupBy(usersTable.id, usersTable.name)
		.toSQL();

	expect(query).toEqual({
		sql: 'select "id", "name" from "users" group by "users"."id", "users"."name"',
		params: [],
	});
});

test('insert sql', async () => {
	await db.insert(usersTable).values({ name: sql`${'John'}` });
	const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
	expect(result).toEqual([{ id: 1, name: 'John' }]);
});

test('partial join with alias', async () => {
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
		})
		.from(usersTable)
		.leftJoin(customerAlias, eq(customerAlias.id, 11))
		.where(eq(usersTable.id, 10));

	expect(result).toEqual([
		{
			user: { id: 10, name: 'Ivan' },
			customer: { id: 11, name: 'Hans' },
		},
	]);
});

test('full join with alias', async () => {
	const pgTable = pgTableCreator((name) => `prefixed_${name}`);

	const users = pgTable('users', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`create table ${users} (id serial primary key, name text not null)`);

	const customers = alias(users, 'customer');

	await db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
	const result = await db
		.select()
		.from(users)
		.leftJoin(customers, eq(customers.id, 11))
		.where(eq(users.id, 10));

	expect(result).toEqual([{
		users: {
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

test('select from alias', async () => {
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

	expect(result).toEqual([{
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

test('insert with spaces', async () => {
	await db.insert(usersTable).values({ name: sql`'Jo   h     n'` });
	const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);

	expect(result).toEqual([{ id: 1, name: 'Jo   h     n' }]);
});

test('prepared statement', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const statement = db
		.select({
			id: usersTable.id,
			name: usersTable.name,
		})
		.from(usersTable)
		.prepare('statement1');
	const result = await statement.execute();

	expect(result).toEqual([{ id: 1, name: 'John' }]);
});

test('prepared statement reuse', async () => {
	const stmt = db
		.insert(usersTable)
		.values({
			verified: true,
			name: placeholder('name'),
		})
		.prepare('stmt2');

	for (let i = 0; i < 10; i++) {
		await stmt.execute({ name: `John ${i}` });
	}

	const result = await db
		.select({
			id: usersTable.id,
			name: usersTable.name,
			verified: usersTable.verified,
		})
		.from(usersTable);

	expect(result).toEqual([
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

test('prepared statement with placeholder in .where', async () => {
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

	expect(result).toEqual([{ id: 1, name: 'John' }]);
});

test('prepared statement with placeholder in .limit', async () => {
	await db.insert(usersTable).values({ name: 'John' });
	const stmt = db
		.select({
			id: usersTable.id,
			name: usersTable.name,
		})
		.from(usersTable)
		.where(eq(usersTable.id, placeholder('id')))
		.limit(placeholder('limit'))
		.prepare('stmt_limit');

	const result = await stmt.execute({ id: 1, limit: 1 });

	expect(result).toEqual([{ id: 1, name: 'John' }]);
	expect(result.length).toEqual(1);
});

test('prepared statement with placeholder in .offset', async () => {
	await db.insert(usersTable).values([{ name: 'John' }, { name: 'John1' }]);
	const stmt = db
		.select({
			id: usersTable.id,
			name: usersTable.name,
		})
		.from(usersTable)
		.offset(placeholder('offset'))
		.prepare('stmt_offset');

	const result = await stmt.execute({ offset: 1 });

	expect(result).toEqual([{ id: 2, name: 'John1' }]);
});

test('migrator : default migration strategy', async () => {
	await db.execute(sql`drop table if exists all_columns`);
	await db.execute(sql`drop table if exists users12`);
	await db.execute(sql`drop table if exists __drizzle_migrations`);

	await migrate(db, { migrationsFolder: './drizzle2/pg' });

	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });

	const result = await db.select().from(usersMigratorTable);

	expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

	await db.execute(sql`drop table all_columns`);
	await db.execute(sql`drop table users12`);
	await db.execute(sql`drop table __drizzle_migrations`);
});

test('migrator : migrate with custom table', async () => {
	const customTable = randomString();
	await db.execute(sql`drop table if exists all_columns`);
	await db.execute(sql`drop table if exists users12`);
	await db.execute(sql`drop table if exists __drizzle_migrations`);

	await migrate(db, { migrationsFolder: './drizzle2/pg', migrationsTable: customTable });

	// test if the custom migrations table was created
	const { records } = await db.execute(sql`select * from ${sql.identifier(customTable)};`);
	expect(records.length > 0).toBeTruthy();

	// test if the migrated table are working as expected
	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
	const result = await db.select().from(usersMigratorTable);
	expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

	await db.execute(sql`drop table all_columns`);
	await db.execute(sql`drop table users12`);
	await db.execute(sql`drop table ${sql.identifier(customTable)}`);
});

test('insert via db.execute + select via db.execute', async () => {
	await db.execute(
		sql`insert into ${usersTable} (${name(usersTable.name.name)}) values (${'John'})`,
	);

	const result = await db.execute<{ id: number; name: string }>(
		sql`select id, name from "users"`,
	);

	expect(result.records).toEqual([{ id: 1, name: 'John' }]);
});

test('insert via db.execute + returning', async () => {
	const inserted = await db.execute<{ id: number; name: string }>(
		sql`insert into ${usersTable} (${
			name(
				usersTable.name.name,
			)
		}) values (${'John'}) returning ${usersTable.id}, ${usersTable.name}`,
	);
	expect(inserted.records).toEqual([{ id: 1, name: 'John' }]);
});

test('insert via db.execute w/ query builder', async () => {
	const inserted = await db.execute<Pick<typeof usersTable.$inferSelect, 'id' | 'name'>>(
		db
			.insert(usersTable)
			.values({ name: 'John' })
			.returning({ id: usersTable.id, name: usersTable.name }),
	);
	expect(inserted.records).toEqual([{ id: 1, name: 'John' }]);
});

test('build query insert with onConflict do update', async () => {
	const query = db
		.insert(usersTable)
		.values({ name: 'John', jsonb: ['foo', 'bar'] })
		.onConflictDoUpdate({ target: usersTable.id, set: { name: 'John1' } })
		.toSQL();

	expect(query).toEqual({
		sql:
			'insert into "users" ("id", "name", "verified", "jsonb", "created_at") values (default, $1, default, $2, default) on conflict ("id") do update set "name" = $3',
		params: ['John', '["foo","bar"]', 'John1'],
	});
});

test('build query insert with onConflict do update / multiple columns', async () => {
	const query = db
		.insert(usersTable)
		.values({ name: 'John', jsonb: ['foo', 'bar'] })
		.onConflictDoUpdate({ target: [usersTable.id, usersTable.name], set: { name: 'John1' } })
		.toSQL();

	expect(query).toEqual({
		sql:
			'insert into "users" ("id", "name", "verified", "jsonb", "created_at") values (default, $1, default, $2, default) on conflict ("id","name") do update set "name" = $3',
		params: ['John', '["foo","bar"]', 'John1'],
	});
});

test('build query insert with onConflict do nothing', async () => {
	const query = db
		.insert(usersTable)
		.values({ name: 'John', jsonb: ['foo', 'bar'] })
		.onConflictDoNothing()
		.toSQL();

	expect(query).toEqual({
		sql:
			'insert into "users" ("id", "name", "verified", "jsonb", "created_at") values (default, $1, default, $2, default) on conflict do nothing',
		params: ['John', '["foo","bar"]'],
	});
});

test('build query insert with onConflict do nothing + target', async () => {
	const query = db
		.insert(usersTable)
		.values({ name: 'John', jsonb: ['foo', 'bar'] })
		.onConflictDoNothing({ target: usersTable.id })
		.toSQL();

	expect(query).toEqual({
		sql:
			'insert into "users" ("id", "name", "verified", "jsonb", "created_at") values (default, $1, default, $2, default) on conflict ("id") do nothing',
		params: ['John', '["foo","bar"]'],
	});
});

test('insert with onConflict do update', async () => {
	await db.insert(usersTable).values({ name: 'John' });

	await db
		.insert(usersTable)
		.values({ id: 1, name: 'John' })
		.onConflictDoUpdate({ target: usersTable.id, set: { name: 'John1' } });

	const res = await db
		.select({ id: usersTable.id, name: usersTable.name })
		.from(usersTable)
		.where(eq(usersTable.id, 1));

	expect(res).toEqual([{ id: 1, name: 'John1' }]);
});

test('insert with onConflict do nothing', async () => {
	await db.insert(usersTable).values({ name: 'John' });

	await db.insert(usersTable).values({ id: 1, name: 'John' }).onConflictDoNothing();

	const res = await db
		.select({ id: usersTable.id, name: usersTable.name })
		.from(usersTable)
		.where(eq(usersTable.id, 1));

	expect(res).toEqual([{ id: 1, name: 'John' }]);
});

test('insert with onConflict do nothing + target', async () => {
	await db.insert(usersTable).values({ name: 'John' });

	await db
		.insert(usersTable)
		.values({ id: 1, name: 'John' })
		.onConflictDoNothing({ target: usersTable.id });

	const res = await db
		.select({ id: usersTable.id, name: usersTable.name })
		.from(usersTable)
		.where(eq(usersTable.id, 1));

	expect(res).toEqual([{ id: 1, name: 'John' }]);
});

test('left join (flat object fields)', async () => {
	const { id: cityId } = await db
		.insert(citiesTable)
		.values([{ name: 'Paris' }, { name: 'London' }])
		.returning({ id: citiesTable.id })
		.then((rows) => rows[0]!);

	await db.insert(users2Table).values([{ name: 'John', cityId }, { name: 'Jane' }]);

	const res = await db
		.select({
			userId: users2Table.id,
			userName: users2Table.name,
			cityId: citiesTable.id,
			cityName: citiesTable.name,
		})
		.from(users2Table)
		.leftJoin(citiesTable, eq(users2Table.cityId, citiesTable.id));

	expect(res).toEqual([
		{ userId: 1, userName: 'John', cityId, cityName: 'Paris' },
		{ userId: 2, userName: 'Jane', cityId: null, cityName: null },
	]);
});

test('left join (grouped fields)', async () => {
	const { id: cityId } = await db
		.insert(citiesTable)
		.values([{ name: 'Paris' }, { name: 'London' }])
		.returning({ id: citiesTable.id })
		.then((rows) => rows[0]!);

	await db.insert(users2Table).values([{ name: 'John', cityId }, { name: 'Jane' }]);

	const res = await db
		.select({
			id: users2Table.id,
			user: {
				name: users2Table.name,
				nameUpper: sql<string>`upper(${users2Table.name})`,
			},
			city: {
				id: citiesTable.id,
				name: citiesTable.name,
				nameUpper: sql<string>`upper(${citiesTable.name})`,
			},
		})
		.from(users2Table)
		.leftJoin(citiesTable, eq(users2Table.cityId, citiesTable.id));

	expect(res).toEqual([
		{
			id: 1,
			user: { name: 'John', nameUpper: 'JOHN' },
			city: { id: cityId, name: 'Paris', nameUpper: 'PARIS' },
		},
		{
			id: 2,
			user: { name: 'Jane', nameUpper: 'JANE' },
			city: null,
		},
	]);
});

test('left join (all fields)', async () => {
	const { id: cityId } = await db
		.insert(citiesTable)
		.values([{ name: 'Paris' }, { name: 'London' }])
		.returning({ id: citiesTable.id })
		.then((rows) => rows[0]!);

	await db.insert(users2Table).values([{ name: 'John', cityId }, { name: 'Jane' }]);

	const res = await db
		.select()
		.from(users2Table)
		.leftJoin(citiesTable, eq(users2Table.cityId, citiesTable.id));

	expect(res).toEqual([
		{
			users2: {
				id: 1,
				name: 'John',
				cityId,
			},
			cities: {
				id: cityId,
				name: 'Paris',
				state: null,
			},
		},
		{
			users2: {
				id: 2,
				name: 'Jane',
				cityId: null,
			},
			cities: null,
		},
	]);
});

test('join subquery', async () => {
	await db
		.insert(courseCategoriesTable)
		.values([
			{ name: 'Category 1' },
			{ name: 'Category 2' },
			{ name: 'Category 3' },
			{ name: 'Category 4' },
		]);

	await db
		.insert(coursesTable)
		.values([
			{ name: 'Development', categoryId: 2 },
			{ name: 'IT & Software', categoryId: 3 },
			{ name: 'Marketing', categoryId: 4 },
			{ name: 'Design', categoryId: 1 },
		]);

	const sq2 = db
		.select({
			categoryId: courseCategoriesTable.id,
			category: courseCategoriesTable.name,
			total: sql<number>`count(${courseCategoriesTable.id})`,
		})
		.from(courseCategoriesTable)
		.groupBy(courseCategoriesTable.id, courseCategoriesTable.name)
		.as('sq2');

	const res = await db
		.select({
			courseName: coursesTable.name,
			categoryId: sq2.categoryId,
		})
		.from(coursesTable)
		.leftJoin(sq2, eq(coursesTable.categoryId, sq2.categoryId))
		.orderBy(coursesTable.name);

	expect(res).toEqual([
		{ courseName: 'Design', categoryId: 1 },
		{ courseName: 'Development', categoryId: 2 },
		{ courseName: 'IT & Software', categoryId: 3 },
		{ courseName: 'Marketing', categoryId: 4 },
	]);
});

test('with ... select', async () => {
	await db.insert(orders).values([
		{ region: 'Europe', product: 'A', amount: 10, quantity: 1 },
		{ region: 'Europe', product: 'A', amount: 20, quantity: 2 },
		{ region: 'Europe', product: 'B', amount: 20, quantity: 2 },
		{ region: 'Europe', product: 'B', amount: 30, quantity: 3 },
		{ region: 'US', product: 'A', amount: 30, quantity: 3 },
		{ region: 'US', product: 'A', amount: 40, quantity: 4 },
		{ region: 'US', product: 'B', amount: 40, quantity: 4 },
		{ region: 'US', product: 'B', amount: 50, quantity: 5 },
	]);

	const regionalSales = db
		.$with('regional_sales')
		.as(
			db
				.select({
					region: orders.region,
					totalSales: sql<number>`sum(${orders.amount})`.as('total_sales'),
				})
				.from(orders)
				.groupBy(orders.region),
		);

	const topRegions = db
		.$with('top_regions')
		.as(
			db
				.select({
					region: regionalSales.region,
				})
				.from(regionalSales)
				.where(
					gt(
						regionalSales.totalSales,
						db.select({ sales: sql`sum(${regionalSales.totalSales})/10` }).from(regionalSales),
					),
				),
		);

	const result = await db
		.with(regionalSales, topRegions)
		.select({
			region: orders.region,
			product: orders.product,
			productUnits: sql<number>`sum(${orders.quantity})::int`,
			productSales: sql<number>`sum(${orders.amount})::int`,
		})
		.from(orders)
		.where(inArray(orders.region, db.select({ region: topRegions.region }).from(topRegions)))
		.groupBy(orders.region, orders.product)
		.orderBy(orders.region, orders.product);

	expect(result).toEqual([
		{
			region: 'Europe',
			product: 'A',
			productUnits: 3,
			productSales: 30,
		},
		{
			region: 'Europe',
			product: 'B',
			productUnits: 5,
			productSales: 50,
		},
		{
			region: 'US',
			product: 'A',
			productUnits: 7,
			productSales: 70,
		},
		{
			region: 'US',
			product: 'B',
			productUnits: 9,
			productSales: 90,
		},
	]);
});

test('select from subquery sql', async () => {
	await db.insert(users2Table).values([{ name: 'John' }, { name: 'Jane' }]);

	const sq = db
		.select({ name: sql<string>`${users2Table.name} || ' modified'`.as('name') })
		.from(users2Table)
		.as('sq');

	const res = await db.select({ name: sq.name }).from(sq);

	expect(res).toEqual([{ name: 'John modified' }, { name: 'Jane modified' }]);
});

test('select a field without joining its table', () => {
	expect(() => db.select({ name: users2Table.name }).from(usersTable).prepare('query')).toThrowError();
});

test('select all fields from subquery without alias', () => {
	const sq = db.$with('sq').as(db.select({ name: sql<string>`upper(${users2Table.name})` }).from(users2Table));

	expect(() => db.select().from(sq).prepare('query')).toThrowError;
});

test('select count()', async () => {
	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }]);

	const res = await db.select({ count: sql`count(*)` }).from(usersTable);

	expect(res).toEqual([{ count: 2 }]);
});

test('select count w/ custom mapper', async () => {
	function count(value: PgColumn | SQLWrapper): SQL<number>;
	function count(value: PgColumn | SQLWrapper, alias: string): SQL.Aliased<number>;
	function count(value: PgColumn | SQLWrapper, alias?: string): SQL<number> | SQL.Aliased<number> {
		const result = sql`count(${value})`.mapWith(Number);
		if (!alias) {
			return result;
		}
		return result.as(alias);
	}

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }]);

	const res = await db.select({ count: count(sql`*`) }).from(usersTable);

	expect(res).toEqual([{ count: 2 }]);
});

test('network types', async () => {
	const value: typeof network.$inferSelect = {
		inet: '127.0.0.1',
		cidr: '192.168.100.128/25',
		macaddr: '08:00:2b:01:02:03',
		macaddr8: '08:00:2b:01:02:03:04:05',
	};

	await db.insert(network).values(value);

	const res = await db.select().from(network);

	expect(res).toEqual([value]);
});

test('array types', async () => {
	const values: typeof salEmp.$inferSelect[] = [
		{
			name: 'John',
			payByQuarter: [10000, 10000, 10000, 10000],
			schedule: [['meeting', 'lunch'], ['training', 'presentation']],
		},
		{
			name: 'Carol',
			payByQuarter: [20000, 25000, 25000, 25000],
			schedule: [['breakfast', 'consulting'], ['meeting', 'lunch']],
		},
	];

	await db.insert(salEmp).values(values);

	const res = await db.select().from(salEmp);

	expect(res).toEqual(values);
});

// test('select for ...', (t) => {
// 	{
// 		const query = db
// 			.select()
// 			.from(users2Table)
// 			.for('update')
// 			.toSQL();

// 		t.regex(
// 			query.sql,
// 			/ for update$/,
// 		);
// 	}

// 	{
// 		const query = db
// 			.select()
// 			.from(users2Table)
// 			.for('update', { of: [users2Table, coursesTable] })
// 			.toSQL();

// 		t.regex(
// 			query.sql,
// 			/ for update of "users2", "courses"$/,
// 		);
// 	}

// 	{
// 		const query = db
// 			.select()
// 			.from(users2Table)
// 			.for('no key update', { of: users2Table })
// 			.toSQL();

// 		t.regex(
// 			query.sql,
// 			/for no key update of "users2"$/,
// 		);
// 	}

// 	{
// 		const query = db
// 			.select()
// 			.from(users2Table)
// 			.for('no key update', { of: users2Table, skipLocked: true })
// 			.toSQL();

// 		t.regex(
// 			query.sql,
// 			/ for no key update of "users2" skip locked$/,
// 		);
// 	}

// 	{
// 		const query = db
// 			.select()
// 			.from(users2Table)
// 			.for('share', { of: users2Table, noWait: true })
// 			.toSQL();

// 		t.regex(
// 			query.sql,
// 			// eslint-disable-next-line unicorn/better-regex
// 			/for share of "users2" no wait$/,
// 		);
// 	}
// });

test('having', async () => {
	await db.insert(citiesTable).values([{ name: 'London' }, { name: 'Paris' }, { name: 'New York' }]);

	await db.insert(users2Table).values([{ name: 'John', cityId: 1 }, { name: 'Jane', cityId: 1 }, {
		name: 'Jack',
		cityId: 2,
	}]);

	const result = await db
		.select({
			id: citiesTable.id,
			name: sql<string>`upper(${citiesTable.name})`.as('upper_name'),
			usersCount: sql<number>`count(${users2Table.id})::int`.as('users_count'),
		})
		.from(citiesTable)
		.leftJoin(users2Table, eq(users2Table.cityId, citiesTable.id))
		.where(({ name }) => sql`length(${name}) >= 3`)
		.groupBy(citiesTable.id)
		.having(({ usersCount }) => sql`${usersCount} > 0`)
		.orderBy(({ name }) => name);

	expect(result).toEqual([
		{
			id: 1,
			name: 'LONDON',
			usersCount: 2,
		},
		{
			id: 2,
			name: 'PARIS',
			usersCount: 1,
		},
	]);
});

// Not supported in Xata HTTP
// test('view', async () => {
//

// 	const newYorkers1 = pgView('new_yorkers')
// 		.as((qb) => qb.select().from(users2Table).where(eq(users2Table.cityId, 1)));

// 	const newYorkers2 = pgView('new_yorkers', {
// 		id: serial('id').primaryKey(),
// 		name: text('name').notNull(),
// 		cityId: integer('city_id').notNull(),
// 	}).as(sql`select * from ${users2Table} where ${eq(users2Table.cityId, 1)}`);

// 	const newYorkers3 = pgView('new_yorkers', {
// 		id: serial('id').primaryKey(),
// 		name: text('name').notNull(),
// 		cityId: integer('city_id').notNull(),
// 	}).existing();

// 	await db.execute(sql`create view ${newYorkers1} as ${getViewConfig(newYorkers1).query}`);

// 	await db.insert(citiesTable).values([{ name: 'New York' }, { name: 'Paris' }]);

// 	await db.insert(users2Table).values([
// 		{ name: 'John', cityId: 1 },
// 		{ name: 'Jane', cityId: 1 },
// 		{ name: 'Jack', cityId: 2 },
// 	]);

// 	{
// 		const result = await db.select().from(newYorkers1);
// 		expect(result, [
// 			{ id: 1, name: 'John', cityId: 1 },
// 			{ id: 2, name: 'Jane', cityId: 1 },
// 		]);
// 	}

// 	{
// 		const result = await db.select().from(newYorkers2);
// 		expect(result, [
// 			{ id: 1, name: 'John', cityId: 1 },
// 			{ id: 2, name: 'Jane', cityId: 1 },
// 		]);
// 	}

// 	{
// 		const result = await db.select().from(newYorkers3);
// 		expect(result, [
// 			{ id: 1, name: 'John', cityId: 1 },
// 			{ id: 2, name: 'Jane', cityId: 1 },
// 		]);
// 	}

// 	{
// 		const result = await db.select({ name: newYorkers1.name }).from(newYorkers1);
// 		expect(result, [
// 			{ name: 'John' },
// 			{ name: 'Jane' },
// 		]);
// 	}

// 	await db.execute(sql`drop view ${newYorkers1}`);
// });

// test('materialized view', async () => {
//

// 	const newYorkers1 = pgMaterializedView('new_yorkers')
// 		.as((qb) => qb.select().from(users2Table).where(eq(users2Table.cityId, 1)));

// 	const newYorkers2 = pgMaterializedView('new_yorkers', {
// 		id: serial('id').primaryKey(),
// 		name: text('name').notNull(),
// 		cityId: integer('city_id').notNull(),
// 	}).as(sql`select * from ${users2Table} where ${eq(users2Table.cityId, 1)}`);

// 	const newYorkers3 = pgMaterializedView('new_yorkers', {
// 		id: serial('id').primaryKey(),
// 		name: text('name').notNull(),
// 		cityId: integer('city_id').notNull(),
// 	}).existing();

// 	await db.execute(sql`create materialized view ${newYorkers1} as ${getMaterializedViewConfig(newYorkers1).query}`);

// 	await db.insert(citiesTable).values([{ name: 'New York' }, { name: 'Paris' }]);

// 	await db.insert(users2Table).values([
// 		{ name: 'John', cityId: 1 },
// 		{ name: 'Jane', cityId: 1 },
// 		{ name: 'Jack', cityId: 2 },
// 	]);

// 	{
// 		const result = await db.select().from(newYorkers1);
// 		expect(result, []);
// 	}

// 	await db.refreshMaterializedView(newYorkers1);

// 	{
// 		const result = await db.select().from(newYorkers1);
// 		expect(result, [
// 			{ id: 1, name: 'John', cityId: 1 },
// 			{ id: 2, name: 'Jane', cityId: 1 },
// 		]);
// 	}

// 	{
// 		const result = await db.select().from(newYorkers2);
// 		expect(result, [
// 			{ id: 1, name: 'John', cityId: 1 },
// 			{ id: 2, name: 'Jane', cityId: 1 },
// 		]);
// 	}

// 	{
// 		const result = await db.select().from(newYorkers3);
// 		expect(result, [
// 			{ id: 1, name: 'John', cityId: 1 },
// 			{ id: 2, name: 'Jane', cityId: 1 },
// 		]);
// 	}

// 	{
// 		const result = await db.select({ name: newYorkers1.name }).from(newYorkers1);
// 		expect(result, [
// 			{ name: 'John' },
// 			{ name: 'Jane' },
// 		]);
// 	}

// 	await db.execute(sql`drop materialized view ${newYorkers1}`);
// });

// TODO: copy to SQLite and MySQL, add to docs
test('select from raw sql', async () => {
	const result = await db.select({
		id: sql<number>`id`,
		name: sql<string>`name`,
	}).from(sql`(select 1 as id, 'John' as name) as users`);

	Expect<Equal<{ id: number; name: string }[], typeof result>>;

	expect(result).toEqual([
		{ id: 1, name: 'John' },
	]);
});

test('select from raw sql with joins', async () => {
	const result = await db
		.select({
			id: sql<number>`users.id`,
			name: sql<string>`users.name`,
			userCity: sql<string>`users.city`,
			cityName: sql<string>`cities.name`,
		})
		.from(sql`(select 1 as id, 'John' as name, 'New York' as city) as users`)
		.leftJoin(sql`(select 1 as id, 'Paris' as name) as cities`, sql`cities.id = users.id`);

	Expect<Equal<{ id: number; name: string; userCity: string; cityName: string }[], typeof result>>;

	expect(result).toEqual([
		{ id: 1, name: 'John', userCity: 'New York', cityName: 'Paris' },
	]);
});

test('join on aliased sql from select', async () => {
	const result = await db
		.select({
			userId: sql<number>`users.id`.as('userId'),
			name: sql<string>`users.name`,
			userCity: sql<string>`users.city`,
			cityId: sql<number>`cities.id`.as('cityId'),
			cityName: sql<string>`cities.name`,
		})
		.from(sql`(select 1 as id, 'John' as name, 'New York' as city) as users`)
		.leftJoin(sql`(select 1 as id, 'Paris' as name) as cities`, (cols) => eq(cols.cityId, cols.userId));

	Expect<Equal<{ userId: number; name: string; userCity: string; cityId: number; cityName: string }[], typeof result>>;

	expect(result).toEqual([
		{ userId: 1, name: 'John', userCity: 'New York', cityId: 1, cityName: 'Paris' },
	]);
});

test('join on aliased sql from with clause', async () => {
	const users = db.$with('users').as(
		db.select({
			id: sql<number>`id`.as('userId'),
			name: sql<string>`name`.as('userName'),
			city: sql<string>`city`.as('city'),
		}).from(
			sql`(select 1 as id, 'John' as name, 'New York' as city) as users`,
		),
	);

	const cities = db.$with('cities').as(
		db.select({
			id: sql<number>`id`.as('cityId'),
			name: sql<string>`name`.as('cityName'),
		}).from(
			sql`(select 1 as id, 'Paris' as name) as cities`,
		),
	);

	const result = await db
		.with(users, cities)
		.select({
			userId: users.id,
			name: users.name,
			userCity: users.city,
			cityId: cities.id,
			cityName: cities.name,
		})
		.from(users)
		.leftJoin(cities, (cols) => eq(cols.cityId, cols.userId));

	Expect<Equal<{ userId: number; name: string; userCity: string; cityId: number; cityName: string }[], typeof result>>;

	expect(result).toEqual([
		{ userId: 1, name: 'John', userCity: 'New York', cityId: 1, cityName: 'Paris' },
	]);
});

test('prefixed table', async () => {
	const pgTable = pgTableCreator((name) => `myprefix_${name}`);

	const users = pgTable('test_prefixed_table_with_unique_name', {
		id: integer('id').primaryKey(),
		name: text('name').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table myprefix_test_prefixed_table_with_unique_name (id integer not null primary key, name text not null)`,
	);

	await db.insert(users).values({ id: 1, name: 'John' });

	const result = await db.select().from(users);

	expect(result).toEqual([{ id: 1, name: 'John' }]);

	await db.execute(sql`drop table ${users}`);
});

// Not supported in Xata
// test('select from enum', async () => {
//

// 	const muscleEnum = pgEnum('muscle', [
// 		'abdominals',
// 		'hamstrings',
// 		'adductors',
// 		'quadriceps',
// 		'biceps',
// 		'shoulders',
// 		'chest',
// 		'middle_back',
// 		'calves',
// 		'glutes',
// 		'lower_back',
// 		'lats',
// 		'triceps',
// 		'traps',
// 		'forearms',
// 		'neck',
// 		'abductors',
// 	]);

// 	const forceEnum = pgEnum('force', ['isometric', 'isotonic', 'isokinetic']);

// 	const levelEnum = pgEnum('level', ['beginner', 'intermediate', 'advanced']);

// 	const mechanicEnum = pgEnum('mechanic', ['compound', 'isolation']);

// 	const equipmentEnum = pgEnum('equipment', ['barbell', 'dumbbell', 'bodyweight', 'machine', 'cable', 'kettlebell']);

// 	const categoryEnum = pgEnum('category', ['upper_body', 'lower_body', 'full_body']);

// 	const exercises = pgTable('exercises', {
// 		id: serial('id').primaryKey(),
// 		name: varchar('name').notNull(),
// 		force: forceEnum('force'),
// 		level: levelEnum('level'),
// 		mechanic: mechanicEnum('mechanic'),
// 		equipment: equipmentEnum('equipment'),
// 		instructions: text('instructions'),
// 		category: categoryEnum('category'),
// 		primaryMuscles: muscleEnum('primary_muscles').array(),
// 		secondaryMuscles: muscleEnum('secondary_muscles').array(),
// 		createdAt: timestamp('created_at').notNull().default(sql`now()`),
// 		updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
// 	});

// 	await db.execute(sql`drop table if exists ${exercises}`);
// 	await db.execute(sql`drop type if exists ${name(muscleEnum.enumName)}`);
// 	await db.execute(sql`drop type if exists ${name(forceEnum.enumName)}`);
// 	await db.execute(sql`drop type if exists ${name(levelEnum.enumName)}`);
// 	await db.execute(sql`drop type if exists ${name(mechanicEnum.enumName)}`);
// 	await db.execute(sql`drop type if exists ${name(equipmentEnum.enumName)}`);
// 	await db.execute(sql`drop type if exists ${name(categoryEnum.enumName)}`);

// 	await db.execute(
// 		sql`create type ${
// 			name(muscleEnum.enumName)
// 		} as enum ('abdominals', 'hamstrings', 'adductors', 'quadriceps', 'biceps', 'shoulders', 'chest', 'middle_back', 'calves', 'glutes', 'lower_back', 'lats', 'triceps', 'traps', 'forearms', 'neck', 'abductors')`,
// 	);
// 	await db.execute(sql`create type ${name(forceEnum.enumName)} as enum ('isometric', 'isotonic', 'isokinetic')`);
// 	await db.execute(sql`create type ${name(levelEnum.enumName)} as enum ('beginner', 'intermediate', 'advanced')`);
// 	await db.execute(sql`create type ${name(mechanicEnum.enumName)} as enum ('compound', 'isolation')`);
// 	await db.execute(
// 		sql`create type ${
// 			name(equipmentEnum.enumName)
// 		} as enum ('barbell', 'dumbbell', 'bodyweight', 'machine', 'cable', 'kettlebell')`,
// 	);
// 	await db.execute(sql`create type ${name(categoryEnum.enumName)} as enum ('upper_body', 'lower_body', 'full_body')`);
// 	await db.execute(sql`
// 		create table ${exercises} (
// 			id serial primary key,
// 			name varchar not null,
// 			force force,
// 			level level,
// 			mechanic mechanic,
// 			equipment equipment,
// 			instructions text,
// 			category category,
// 			primary_muscles muscle[],
// 			secondary_muscles muscle[],
// 			created_at timestamp not null default now(),
// 			updated_at timestamp not null default now()
// 		)
// 	`);

// 	await db.insert(exercises).values({
// 		name: 'Bench Press',
// 		force: 'isotonic',
// 		level: 'beginner',
// 		mechanic: 'compound',
// 		equipment: 'barbell',
// 		instructions:
// 			'Lie on your back on a flat bench. Grasp the barbell with an overhand grip, slightly wider than shoulder width. Unrack the barbell and hold it over you with your arms locked. Lower the barbell to your chest. Press the barbell back to the starting position.',
// 		category: 'upper_body',
// 		primaryMuscles: ['chest', 'triceps'],
// 		secondaryMuscles: ['shoulders', 'traps'],
// 	});

// 	const result = await db.select().from(exercises);

// 	expect(result, [
// 		{
// 			id: 1,
// 			name: 'Bench Press',
// 			force: 'isotonic',
// 			level: 'beginner',
// 			mechanic: 'compound',
// 			equipment: 'barbell',
// 			instructions:
// 				'Lie on your back on a flat bench. Grasp the barbell with an overhand grip, slightly wider than shoulder width. Unrack the barbell and hold it over you with your arms locked. Lower the barbell to your chest. Press the barbell back to the starting position.',
// 			category: 'upper_body',
// 			primaryMuscles: ['chest', 'triceps'],
// 			secondaryMuscles: ['shoulders', 'traps'],
// 			createdAt: result[0]!.createdAt,
// 			updatedAt: result[0]!.updatedAt,
// 		},
// 	]);

// 	await db.execute(sql`drop table ${exercises}`);
// 	await db.execute(sql`drop type ${name(muscleEnum.enumName)}`);
// 	await db.execute(sql`drop type ${name(forceEnum.enumName)}`);
// 	await db.execute(sql`drop type ${name(levelEnum.enumName)}`);
// 	await db.execute(sql`drop type ${name(mechanicEnum.enumName)}`);
// 	await db.execute(sql`drop type ${name(equipmentEnum.enumName)}`);
// 	await db.execute(sql`drop type ${name(categoryEnum.enumName)}`);
// });

test('orderBy with aliased column', () => {
	const query = db.select({
		test: sql`something`.as('test'),
	}).from(users2Table).orderBy((fields) => fields.test).toSQL();

	expect(query.sql, 'select something as "test" from "users2" order by "test"');
});

test('select from sql', async () => {
	const metricEntry = pgTable('metric_entry', {
		id: pgUuid('id').notNull(),
		createdAt: timestamp('created_at').notNull(),
	});

	await db.execute(sql`drop table if exists ${metricEntry}`);
	await db.execute(sql`create table ${metricEntry} (id uuid not null, created_at timestamp not null)`);

	const metricId = uuid();

	const intervals = db.$with('intervals').as(
		db
			.select({
				startTime: sql<string>`(date'2023-03-01'+ x * '1 day'::interval)`.as('start_time'),
				endTime: sql<string>`(date'2023-03-01'+ (x+1) *'1 day'::interval)`.as('end_time'),
			})
			.from(sql`generate_series(0, 29, 1) as t(x)`),
	);

	expect(() =>
		db
			.with(intervals)
			.select({
				startTime: intervals.startTime,
				endTime: intervals.endTime,
				count: sql<number>`count(${metricEntry})`,
			})
			.from(metricEntry)
			.rightJoin(
				intervals,
				and(
					eq(metricEntry.id, metricId),
					gte(metricEntry.createdAt, intervals.startTime),
					lt(metricEntry.createdAt, intervals.endTime),
				),
			)
			.groupBy(intervals.startTime, intervals.endTime)
			.orderBy(asc(intervals.startTime))
	).not.toThrowError();
});

test('timestamp timezone', async () => {
	const usersTableWithAndWithoutTimezone = pgTable('users_test_with_and_without_timezone', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
	});

	await db.execute(sql`drop table if exists ${usersTableWithAndWithoutTimezone}`);

	await db.execute(
		sql`
			create table users_test_with_and_without_timezone (
				id serial not null primary key,
				name text not null,
				created_at timestamptz not null default now(),
				updated_at timestamp not null default now()
			)
		`,
	);

	const date = new Date(Date.parse('2020-01-01T00:00:00+04:00'));

	await db.insert(usersTableWithAndWithoutTimezone).values({ name: 'With default times' });
	await db.insert(usersTableWithAndWithoutTimezone).values({
		name: 'Without default times',
		createdAt: date,
		updatedAt: date,
	});
	const users = await db.select().from(usersTableWithAndWithoutTimezone);

	// check that the timestamps are set correctly for default times
	expect(Math.abs(users[0]!.updatedAt.getTime() - Date.now()) < 3000).toBeTruthy();
	expect(Math.abs(users[0]!.createdAt.getTime() - Date.now()) < 3000).toBeTruthy();

	// check that the timestamps are set correctly for non default times
	expect(Math.abs(users[1]!.updatedAt.getTime() - date.getTime()) < 3000).toBeTruthy();
	expect(Math.abs(users[1]!.createdAt.getTime() - date.getTime()) < 3000).toBeTruthy();
});

test('all date and time columns', async () => {
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
		datetimeFullPrecision: fullPrecision.replace('T', ' ').replace('Z', ''),
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

	expect(result).toEqual([
		{
			id: 1,
			dateString: '2022-01-01',
			time: someTime,
			datetime: someDatetime,
			datetimeWTZ: someDatetime,
			datetimeString: '2022-01-01 00:00:00.123',
			datetimeFullPrecision: fullPrecision.replace('T', ' '),
			datetimeWTZString: '2022-01-01 00:00:00.123+00',
			interval: '1 day',
		},
	]);

	await db.execute(sql`drop table if exists ${table}`);
});

test('all date and time columns with timezone', async () => {
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
	expect(result).toEqual([
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

	expect(result2.records).toEqual([
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

	expect(
		result[0]?.timestampTimeZones.getTime(),
	).toEqual(
		new Date((result2.records[0] as any).timestamp_date_2 as any).getTime(),
	);

	await db.execute(sql`drop table if exists ${table}`);
});

test('all date and time columns without timezone', async () => {
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
	expect(result).toEqual([
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

	expect(result2.records).toEqual([
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

	expect((result2.records[0] as any).timestamp_string).toEqual('2022-01-01 00:00:00.123456');
	// need to add the 'Z', otherwise javascript assumes it's in local time
	expect(new Date((result2.records[0] as any).timestamp_date + 'Z' as any).getTime()).toEqual(timestampDate.getTime());

	await db.execute(sql`drop table if exists ${table}`);
});

test('transaction', async () => {
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

	await expect(async () =>
		db.transaction(async (tx) => {
			await tx.update(users).set({ balance: user.balance - product.price }).where(eq(users.id, user.id));
			await tx.update(products).set({ stock: product.stock - 1 }).where(eq(products.id, product.id));
		})
	).rejects.toThrowError('No transactions support in Xata Http driver');

	// t.is(error!.message, 'No transactions support in Xata Http driver');

	const result = await db.select().from(users);

	expect(result).toEqual([{ id: 1, balance: 100 }]);

	await db.execute(sql`drop table ${users}`);
	await db.execute(sql`drop table ${products}`);
});

test('join subquery with join', async () => {
	const internalStaff = pgTable('internal_staff', {
		userId: integer('user_id').notNull(),
	});

	const customUser = pgTable('custom_user', {
		id: integer('id').notNull(),
	});

	const ticket = pgTable('ticket', {
		staffId: integer('staff_id').notNull(),
	});

	await db.execute(sql`drop table if exists ${internalStaff}`);
	await db.execute(sql`drop table if exists ${customUser}`);
	await db.execute(sql`drop table if exists ${ticket}`);

	await db.execute(sql`create table internal_staff (user_id integer not null)`);
	await db.execute(sql`create table custom_user (id integer not null)`);
	await db.execute(sql`create table ticket (staff_id integer not null)`);

	await db.insert(internalStaff).values({ userId: 1 });
	await db.insert(customUser).values({ id: 1 });
	await db.insert(ticket).values({ staffId: 1 });

	const subq = db
		.select()
		.from(internalStaff)
		.leftJoin(customUser, eq(internalStaff.userId, customUser.id))
		.as('internal_staff');

	const mainQuery = await db
		.select()
		.from(ticket)
		.leftJoin(subq, eq(subq.internal_staff.userId, ticket.staffId));

	expect(mainQuery).toEqual([{
		ticket: { staffId: 1 },
		internal_staff: {
			internal_staff: { userId: 1 },
			custom_user: { id: 1 },
		},
	}]);

	await db.execute(sql`drop table ${internalStaff}`);
	await db.execute(sql`drop table ${customUser}`);
	await db.execute(sql`drop table ${ticket}`);
});

// Not supported in Xata
// test('subquery with view', async () => {
//

// 	const users = pgTable('users_subquery_view', {
// 		id: serial('id').primaryKey(),
// 		name: text('name').notNull(),
// 		cityId: integer('city_id').notNull(),
// 	});

// 	const newYorkers = pgView('new_yorkers').as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));

// 	await db.execute(sql`drop table if exists ${users}`);
// 	await db.execute(sql`drop view if exists ${newYorkers}`);

// 	await db.execute(
// 		sql`create table ${users} (id serial not null primary key, name text not null, city_id integer not null)`,
// 	);
// 	await db.execute(sql`create view ${newYorkers} as select * from ${users} where city_id = 1`);

// 	await db.insert(users).values([
// 		{ name: 'John', cityId: 1 },
// 		{ name: 'Jane', cityId: 2 },
// 		{ name: 'Jack', cityId: 1 },
// 		{ name: 'Jill', cityId: 2 },
// 	]);

// 	const sq = db.$with('sq').as(db.select().from(newYorkers));
// 	const result = await db.with(sq).select().from(sq);

// 	expect(result, [
// 		{ id: 1, name: 'John', cityId: 1 },
// 		{ id: 3, name: 'Jack', cityId: 1 },
// 	]);

// 	await db.execute(sql`drop view ${newYorkers}`);
// 	await db.execute(sql`drop table ${users}`);
// });

// test('join view as subquery', async () => {
//

// 	const users = pgTable('users_join_view', {
// 		id: serial('id').primaryKey(),
// 		name: text('name').notNull(),
// 		cityId: integer('city_id').notNull(),
// 	});

// 	const newYorkers = pgView('new_yorkers').as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));

// 	await db.execute(sql`drop table if exists ${users}`);
// 	await db.execute(sql`drop view if exists ${newYorkers}`);

// 	await db.execute(
// 		sql`create table ${users} (id serial not null primary key, name text not null, city_id integer not null)`,
// 	);
// 	await db.execute(sql`create view ${newYorkers} as select * from ${users} where city_id = 1`);

// 	await db.insert(users).values([
// 		{ name: 'John', cityId: 1 },
// 		{ name: 'Jane', cityId: 2 },
// 		{ name: 'Jack', cityId: 1 },
// 		{ name: 'Jill', cityId: 2 },
// 	]);

// 	const sq = db.select().from(newYorkers).as('new_yorkers_sq');

// 	const result = await db.select().from(users).leftJoin(sq, eq(users.id, sq.id));

// 	expect(result, [
// 		{
// 			users_join_view: { id: 1, name: 'John', cityId: 1 },
// 			new_yorkers_sq: { id: 1, name: 'John', cityId: 1 },
// 		},
// 		{
// 			users_join_view: { id: 2, name: 'Jane', cityId: 2 },
// 			new_yorkers_sq: null,
// 		},
// 		{
// 			users_join_view: { id: 3, name: 'Jack', cityId: 1 },
// 			new_yorkers_sq: { id: 3, name: 'Jack', cityId: 1 },
// 		},
// 		{
// 			users_join_view: { id: 4, name: 'Jill', cityId: 2 },
// 			new_yorkers_sq: null,
// 		},
// 	]);

// 	await db.execute(sql`drop view ${newYorkers}`);
// 	await db.execute(sql`drop table ${users}`);
// });

test('table selection with single table', async () => {
	const users = pgTable('users', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		cityId: integer('city_id').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table ${users} (id serial not null primary key, name text not null, city_id integer not null)`,
	);

	await db.insert(users).values({ name: 'John', cityId: 1 });

	const result = await db.select({ users }).from(users);

	expect(result).toEqual([{ users: { id: 1, name: 'John', cityId: 1 } }]);

	await db.execute(sql`drop table ${users}`);
});

test('set null to jsonb field', async () => {
	const users = pgTable('users', {
		id: serial('id').primaryKey(),
		jsonb: jsonb('jsonb'),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table ${users} (id serial not null primary key, jsonb jsonb)`,
	);

	const result = await db.insert(users).values({ jsonb: null }).returning();

	expect(result).toEqual([{ id: 1, jsonb: null }]);

	await db.execute(sql`drop table ${users}`);
});

test('insert undefined', async () => {
	const users = pgTable('users', {
		id: serial('id').primaryKey(),
		name: text('name'),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table ${users} (id serial not null primary key, name text)`,
	);

	expect(async () => await db.insert(users).values({ name: undefined })).not.toThrowError();

	await db.execute(sql`drop table ${users}`);
});

test('update undefined', async () => {
	const users = pgTable('users', {
		id: serial('id').primaryKey(),
		name: text('name'),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table ${users} (id serial not null primary key, name text)`,
	);

	expect(() => db.update(users).set({ name: undefined })).toThrowError();
	await expect(db.update(users).set({ id: 1, name: undefined })).resolves.not.toThrowError();

	await db.execute(sql`drop table ${users}`);
});

test('array operators', async () => {
	const posts = pgTable('posts', {
		id: serial('id').primaryKey(),
		tags: text('tags').array(),
	});

	await db.execute(sql`drop table if exists ${posts}`);

	await db.execute(
		sql`create table ${posts} (id serial primary key, tags text[])`,
	);

	await db.insert(posts).values([{
		tags: ['ORM'],
	}, {
		tags: ['Typescript'],
	}, {
		tags: ['Typescript', 'ORM'],
	}, {
		tags: ['Typescript', 'Frontend', 'React'],
	}, {
		tags: ['Typescript', 'ORM', 'Database', 'Postgres'],
	}, {
		tags: ['Java', 'Spring', 'OOP'],
	}]);

	const contains = await db.select({ id: posts.id }).from(posts)
		.where(arrayContains(posts.tags, ['Typescript', 'ORM']));
	const contained = await db.select({ id: posts.id }).from(posts)
		.where(arrayContained(posts.tags, ['Typescript', 'ORM']));
	const overlaps = await db.select({ id: posts.id }).from(posts)
		.where(arrayOverlaps(posts.tags, ['Typescript', 'ORM']));
	const withSubQuery = await db.select({ id: posts.id }).from(posts)
		.where(arrayContains(
			posts.tags,
			db.select({ tags: posts.tags }).from(posts).where(eq(posts.id, 1)),
		));

	expect(contains).toEqual([{ id: 3 }, { id: 5 }]);
	expect(contained).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
	expect(overlaps).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]);
	expect(withSubQuery).toEqual([{ id: 1 }, { id: 3 }, { id: 5 }]);
});
