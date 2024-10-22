import retry from 'async-retry';
import type Docker from 'dockerode';
import { asc, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { alias, customType, pgTable, pgTableCreator, serial, text } from 'drizzle-orm/pg-core';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { randomString } from '~/utils';
import { createDockerDB } from './pg-common';

const ENABLE_LOGGING = false;

let db: NodePgDatabase;
let client: Client;
let container: Docker.Container | undefined;

beforeAll(async () => {
	let connectionString;
	if (process.env['PG_CONNECTION_STRING']) {
		connectionString = process.env['PG_CONNECTION_STRING'];
	} else {
		const { connectionString: conStr, container: contrainerObj } = await createDockerDB();
		connectionString = conStr;
		container = contrainerObj;
	}
	client = await retry(async () => {
		client = new Client(connectionString);
		await client.connect();
		return client;
	}, {
		retries: 20,
		factor: 1,
		minTimeout: 250,
		maxTimeout: 250,
		randomize: false,
		onRetry() {
			client?.end();
		},
	});
	db = drizzle(client, { logger: ENABLE_LOGGING });
});

afterAll(async () => {
	await client?.end();
	await container?.stop().catch(console.error);
});

beforeEach((ctx) => {
	ctx.pg = {
		db,
	};
});

const customSerial = customType<{ data: number; notNull: true; default: true }>({
	dataType() {
		return 'serial';
	},
});

const customText = customType<{ data: string }>({
	dataType() {
		return 'text';
	},
});

const customBoolean = customType<{ data: boolean }>({
	dataType() {
		return 'boolean';
	},
});

const customJsonb = <TData>(name: string) =>
	customType<{ data: TData; driverData: string }>({
		dataType() {
			return 'jsonb';
		},
		toDriver(value: TData): string {
			return JSON.stringify(value);
		},
	})(name);

const customTimestamp = customType<
	{ data: Date; driverData: string; config: { withTimezone: boolean; precision?: number } }
>({
	dataType(config) {
		const precision = config?.precision === undefined ? '' : ` (${config.precision})`;
		return `timestamp${precision}${config?.withTimezone ? ' with time zone' : ''}`;
	},
	fromDriver(value: string): Date {
		return new Date(value);
	},
});

const usersTable = pgTable('users', {
	id: customSerial('id').primaryKey(),
	name: customText('name').notNull(),
	verified: customBoolean('verified').notNull().default(false),
	jsonb: customJsonb<string[]>('jsonb'),
	createdAt: customTimestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
});

const usersMigratorTable = pgTable('users12', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
});

beforeEach(async (ctx) => {
	const { db } = ctx.pg;
	await db.execute(sql`drop schema if exists public cascade`);
	await db.execute(sql`create schema public`);
	await db.execute(
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

test('select all fields', async (ctx) => {
	const { db } = ctx.pg;

	const now = Date.now();

	await db.insert(usersTable).values({ name: 'John' });
	const result = await db.select().from(usersTable);

	expect(result[0]!.createdAt).toBeInstanceOf(Date);
	expect(Math.abs(result[0]!.createdAt.getTime() - now)).toBeLessThan(100);
	expect(result).toEqual([{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);
});

test('select sql', async (ctx) => {
	const { db } = ctx.pg;

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.select({
		name: sql`upper(${usersTable.name})`,
	}).from(usersTable);

	expect(users).toEqual([{ name: 'JOHN' }]);
});

test('select typed sql', async (ctx) => {
	const { db } = ctx.pg;

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.select({
		name: sql<string>`upper(${usersTable.name})`,
	}).from(usersTable);

	expect(users).toEqual([{ name: 'JOHN' }]);
});

test('insert returning sql', async (ctx) => {
	const { db } = ctx.pg;

	const users = await db.insert(usersTable).values({ name: 'John' }).returning({
		name: sql`upper(${usersTable.name})`,
	});

	expect(users).toEqual([{ name: 'JOHN' }]);
});

test('delete returning sql', async (ctx) => {
	const { db } = ctx.pg;

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning({
		name: sql`upper(${usersTable.name})`,
	});

	expect(users).toEqual([{ name: 'JOHN' }]);
});

test('update returning sql', async (ctx) => {
	const { db } = ctx.pg;

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning({
		name: sql`upper(${usersTable.name})`,
	});

	expect(users).toEqual([{ name: 'JANE' }]);
});

test('update with returning all fields', async (ctx) => {
	const { db } = ctx.pg;

	const now = Date.now();

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning();

	expect(users[0]!.createdAt).toBeInstanceOf(Date);
	expect(Math.abs(users[0]!.createdAt.getTime() - now)).toBeLessThan(100);
	expect(users).toEqual([{ id: 1, name: 'Jane', verified: false, jsonb: null, createdAt: users[0]!.createdAt }]);
});

test('update with returning partial', async (ctx) => {
	const { db } = ctx.pg;

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning({
		id: usersTable.id,
		name: usersTable.name,
	});

	expect(users).toEqual([{ id: 1, name: 'Jane' }]);
});

test('delete with returning all fields', async (ctx) => {
	const { db } = ctx.pg;

	const now = Date.now();

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning();

	expect(users[0]!.createdAt).toBeInstanceOf(Date);
	expect(Math.abs(users[0]!.createdAt.getTime() - now)).toBeLessThan(100);
	expect(users).toEqual([{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: users[0]!.createdAt }]);
});

test('delete with returning partial', async (ctx) => {
	const { db } = ctx.pg;

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning({
		id: usersTable.id,
		name: usersTable.name,
	});

	expect(users).toEqual([{ id: 1, name: 'John' }]);
});

test('insert + select', async (ctx) => {
	const { db } = ctx.pg;

	await db.insert(usersTable).values({ name: 'John' });
	const result = await db.select().from(usersTable);
	expect(result).toEqual([{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);

	await db.insert(usersTable).values({ name: 'Jane' });
	const result2 = await db.select().from(usersTable);
	expect(result2).toEqual([
		{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result2[0]!.createdAt },
		{ id: 2, name: 'Jane', verified: false, jsonb: null, createdAt: result2[1]!.createdAt },
	]);
});

test('json insert', async (ctx) => {
	const { db } = ctx.pg;

	await db.insert(usersTable).values({ name: 'John', jsonb: ['foo', 'bar'] });
	const result = await db.select({
		id: usersTable.id,
		name: usersTable.name,
		jsonb: usersTable.jsonb,
	}).from(usersTable);

	expect(result).toEqual([{ id: 1, name: 'John', jsonb: ['foo', 'bar'] }]);
});

test('insert with overridden default values', async (ctx) => {
	const { db } = ctx.pg;

	await db.insert(usersTable).values({ name: 'John', verified: true });
	const result = await db.select().from(usersTable);

	expect(result).toEqual([{ id: 1, name: 'John', verified: true, jsonb: null, createdAt: result[0]!.createdAt }]);
});

test('insert many', async (ctx) => {
	const { db } = ctx.pg;

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

	expect(result).toEqual([
		{ id: 1, name: 'John', jsonb: null, verified: false },
		{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
		{ id: 3, name: 'Jane', jsonb: null, verified: false },
		{ id: 4, name: 'Austin', jsonb: null, verified: true },
	]);
});

test('insert many with returning', async (ctx) => {
	const { db } = ctx.pg;

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

	expect(result).toEqual([
		{ id: 1, name: 'John', jsonb: null, verified: false },
		{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
		{ id: 3, name: 'Jane', jsonb: null, verified: false },
		{ id: 4, name: 'Austin', jsonb: null, verified: true },
	]);
});

test('select with group by as field', async (ctx) => {
	const { db } = ctx.pg;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.name);

	expect(result).toEqual([{ name: 'Jane' }, { name: 'John' }]);
});

test('select with group by as sql', async (ctx) => {
	const { db } = ctx.pg;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(sql`${usersTable.name}`);

	expect(result).toEqual([{ name: 'Jane' }, { name: 'John' }]);
});

test('select with group by as sql + column', async (ctx) => {
	const { db } = ctx.pg;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(sql`${usersTable.name}`, usersTable.id);

	expect(result).toEqual([{ name: 'Jane' }, { name: 'Jane' }, { name: 'John' }]);
});

test('select with group by as column + sql', async (ctx) => {
	const { db } = ctx.pg;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.id, sql`${usersTable.name}`);

	expect(result).toEqual([{ name: 'Jane' }, { name: 'Jane' }, { name: 'John' }]);
});

test('select with group by complex query', async (ctx) => {
	const { db } = ctx.pg;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.id, sql`${usersTable.name}`)
		.orderBy(asc(usersTable.name))
		.limit(1);

	expect(result).toEqual([{ name: 'Jane' }]);
});

test('build query', async (ctx) => {
	const { db } = ctx.pg;

	const query = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.id, usersTable.name)
		.toSQL();

	expect(query).toEqual({
		sql: 'select "id", "name" from "users" group by "users"."id", "users"."name"',
		params: [],
	});
});

test('insert sql', async (ctx) => {
	const { db } = ctx.pg;

	await db.insert(usersTable).values({ name: sql`${'John'}` });
	const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
	expect(result).toEqual([{ id: 1, name: 'John' }]);
});

test('partial join with alias', async (ctx) => {
	const { db } = ctx.pg;
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

	expect(result).toEqual([{
		user: { id: 10, name: 'Ivan' },
		customer: { id: 11, name: 'Hans' },
	}]);
});

test('full join with alias', async (ctx) => {
	const { db } = ctx.pg;

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
		.select().from(users)
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

test('insert with spaces', async (ctx) => {
	const { db } = ctx.pg;

	await db.insert(usersTable).values({ name: sql`'Jo   h     n'` });
	const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);

	expect(result).toEqual([{ id: 1, name: 'Jo   h     n' }]);
});

test('prepared statement', async (ctx) => {
	const { db } = ctx.pg;

	await db.insert(usersTable).values({ name: 'John' });
	const statement = db.select({
		id: usersTable.id,
		name: usersTable.name,
	}).from(usersTable)
		.prepare('statement1');
	const result = await statement.execute();

	expect(result).toEqual([{ id: 1, name: 'John' }]);
});

test('prepared statement reuse', async (ctx) => {
	const { db } = ctx.pg;

	const stmt = db.insert(usersTable).values({
		verified: true,
		name: sql.placeholder('name'),
	}).prepare('stmt2');

	for (let i = 0; i < 10; i++) {
		await stmt.execute({ name: `John ${i}` });
	}

	const result = await db.select({
		id: usersTable.id,
		name: usersTable.name,
		verified: usersTable.verified,
	}).from(usersTable);

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

test('prepared statement with placeholder in .where', async (ctx) => {
	const { db } = ctx.pg;

	await db.insert(usersTable).values({ name: 'John' });
	const stmt = db.select({
		id: usersTable.id,
		name: usersTable.name,
	}).from(usersTable)
		.where(eq(usersTable.id, sql.placeholder('id')))
		.prepare('stmt3');
	const result = await stmt.execute({ id: 1 });

	expect(result).toEqual([{ id: 1, name: 'John' }]);
});

test('prepared statement with placeholder in .limit', async (ctx) => {
	const { db } = ctx.pg;

	await db.insert(usersTable).values({ name: 'John' });
	const stmt = db
		.select({
			id: usersTable.id,
			name: usersTable.name,
		})
		.from(usersTable)
		.where(eq(usersTable.id, sql.placeholder('id')))
		.limit(sql.placeholder('limit'))
		.prepare('stmt_limit');

	const result = await stmt.execute({ id: 1, limit: 1 });

	expect(result).toEqual([{ id: 1, name: 'John' }]);
	expect(result).toHaveLength(1);
});

test('prepared statement with placeholder in .offset', async (ctx) => {
	const { db } = ctx.pg;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'John1' }]);
	const stmt = db
		.select({
			id: usersTable.id,
			name: usersTable.name,
		})
		.from(usersTable)
		.offset(sql.placeholder('offset'))
		.prepare('stmt_offset');

	const result = await stmt.execute({ offset: 1 });

	expect(result).toEqual([{ id: 2, name: 'John1' }]);
});

test('migrator : default migration strategy', async () => {
	await db.execute(sql`drop table if exists all_columns`);
	await db.execute(sql`drop table if exists users12`);
	await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

	await migrate(db, { migrationsFolder: './drizzle2/pg' });

	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });

	const result = await db.select().from(usersMigratorTable);

	expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

	await db.execute(sql`drop table all_columns`);
	await db.execute(sql`drop table users12`);
	await db.execute(sql`drop table "drizzle"."__drizzle_migrations"`);
});

test('migrator : migrate with custom schema', async () => {
	const customSchema = randomString();
	await db.execute(sql`drop table if exists all_columns`);
	await db.execute(sql`drop table if exists users12`);
	await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

	await migrate(db, { migrationsFolder: './drizzle2/pg', migrationsSchema: customSchema });

	// test if the custom migrations table was created
	const { rowCount } = await db.execute(sql`select * from ${sql.identifier(customSchema)}."__drizzle_migrations";`);
	expect(rowCount! > 0).toBeTruthy();

	// test if the migrated table are working as expected
	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
	const result = await db.select().from(usersMigratorTable);
	expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

	await db.execute(sql`drop table all_columns`);
	await db.execute(sql`drop table users12`);
	await db.execute(sql`drop table ${sql.identifier(customSchema)}."__drizzle_migrations"`);
});

test('migrator : migrate with custom table', async () => {
	const customTable = randomString();
	await db.execute(sql`drop table if exists all_columns`);
	await db.execute(sql`drop table if exists users12`);
	await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

	await migrate(db, { migrationsFolder: './drizzle2/pg', migrationsTable: customTable });

	// test if the custom migrations table was created
	const { rowCount } = await db.execute(sql`select * from "drizzle".${sql.identifier(customTable)};`);
	expect(rowCount! > 0).toBeTruthy();

	// test if the migrated table are working as expected
	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
	const result = await db.select().from(usersMigratorTable);
	expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

	await db.execute(sql`drop table all_columns`);
	await db.execute(sql`drop table users12`);
	await db.execute(sql`drop table "drizzle".${sql.identifier(customTable)}`);
});

test('migrator : migrate with custom table and custom schema', async () => {
	const customTable = randomString();
	const customSchema = randomString();
	await db.execute(sql`drop table if exists all_columns`);
	await db.execute(sql`drop table if exists users12`);
	await db.execute(sql`drop table if exists "drizzle"."__drizzle_migrations"`);

	await migrate(db, {
		migrationsFolder: './drizzle2/pg',
		migrationsTable: customTable,
		migrationsSchema: customSchema,
	});

	// test if the custom migrations table was created
	const { rowCount } = await db.execute(
		sql`select * from ${sql.identifier(customSchema)}.${sql.identifier(customTable)};`,
	);
	expect(rowCount! > 0).toBeTruthy();

	// test if the migrated table are working as expected
	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
	const result = await db.select().from(usersMigratorTable);
	expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

	await db.execute(sql`drop table all_columns`);
	await db.execute(sql`drop table users12`);
	await db.execute(sql`drop table ${sql.identifier(customSchema)}.${sql.identifier(customTable)}`);
});

test('insert via db.execute + select via db.execute', async () => {
	await db.execute(sql`insert into ${usersTable} (${sql.identifier(usersTable.name.name)}) values (${'John'})`);

	const result = await db.execute<{ id: number; name: string }>(sql`select id, name from "users"`);
	expect(result.rows).toEqual([{ id: 1, name: 'John' }]);
});

test('insert via db.execute + returning', async () => {
	const inserted = await db.execute<{ id: number; name: string }>(
		sql`insert into ${usersTable} (${
			sql.identifier(usersTable.name.name)
		}) values (${'John'}) returning ${usersTable.id}, ${usersTable.name}`,
	);
	expect(inserted.rows).toEqual([{ id: 1, name: 'John' }]);
});

test('insert via db.execute w/ query builder', async () => {
	const inserted = await db.execute<Pick<typeof usersTable.$inferSelect, 'id' | 'name'>>(
		db.insert(usersTable).values({ name: 'John' }).returning({ id: usersTable.id, name: usersTable.name }),
	);
	expect(inserted.rows).toEqual([{ id: 1, name: 'John' }]);
});

test('build query insert with onConflict do update', async (ctx) => {
	const { db } = ctx.pg;

	const query = db.insert(usersTable)
		.values({ name: 'John', jsonb: ['foo', 'bar'] })
		.onConflictDoUpdate({ target: usersTable.id, set: { name: 'John1' } })
		.toSQL();

	expect(query).toEqual({
		sql:
			'insert into "users" ("id", "name", "verified", "jsonb", "created_at") values (default, $1, default, $2, default) on conflict ("id") do update set "name" = $3',
		params: ['John', '["foo","bar"]', 'John1'],
	});
});

test('build query insert with onConflict do update / multiple columns', async (ctx) => {
	const { db } = ctx.pg;

	const query = db.insert(usersTable)
		.values({ name: 'John', jsonb: ['foo', 'bar'] })
		.onConflictDoUpdate({ target: [usersTable.id, usersTable.name], set: { name: 'John1' } })
		.toSQL();

	expect(query).toEqual({
		sql:
			'insert into "users" ("id", "name", "verified", "jsonb", "created_at") values (default, $1, default, $2, default) on conflict ("id","name") do update set "name" = $3',
		params: ['John', '["foo","bar"]', 'John1'],
	});
});

test('build query insert with onConflict do nothing', async (ctx) => {
	const { db } = ctx.pg;

	const query = db.insert(usersTable)
		.values({ name: 'John', jsonb: ['foo', 'bar'] })
		.onConflictDoNothing()
		.toSQL();

	expect(query).toEqual({
		sql:
			'insert into "users" ("id", "name", "verified", "jsonb", "created_at") values (default, $1, default, $2, default) on conflict do nothing',
		params: ['John', '["foo","bar"]'],
	});
});

test('build query insert with onConflict do nothing + target', async (ctx) => {
	const { db } = ctx.pg;

	const query = db.insert(usersTable)
		.values({ name: 'John', jsonb: ['foo', 'bar'] })
		.onConflictDoNothing({ target: usersTable.id })
		.toSQL();

	expect(query).toEqual({
		sql:
			'insert into "users" ("id", "name", "verified", "jsonb", "created_at") values (default, $1, default, $2, default) on conflict ("id") do nothing',
		params: ['John', '["foo","bar"]'],
	});
});

test('insert with onConflict do update', async (ctx) => {
	const { db } = ctx.pg;

	await db.insert(usersTable)
		.values({ name: 'John' });

	await db.insert(usersTable)
		.values({ id: 1, name: 'John' })
		.onConflictDoUpdate({ target: usersTable.id, set: { name: 'John1' } });

	const res = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(
		eq(usersTable.id, 1),
	);

	expect(res).toEqual([{ id: 1, name: 'John1' }]);
});

test('insert with onConflict do nothing', async (ctx) => {
	const { db } = ctx.pg;

	await db.insert(usersTable)
		.values({ name: 'John' });

	await db.insert(usersTable)
		.values({ id: 1, name: 'John' })
		.onConflictDoNothing();

	const res = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(
		eq(usersTable.id, 1),
	);

	expect(res).toEqual([{ id: 1, name: 'John' }]);
});

test('insert with onConflict do nothing + target', async (ctx) => {
	const { db } = ctx.pg;

	await db.insert(usersTable)
		.values({ name: 'John' });

	await db.insert(usersTable)
		.values({ id: 1, name: 'John' })
		.onConflictDoNothing({ target: usersTable.id });

	const res = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(
		eq(usersTable.id, 1),
	);

	expect(res).toEqual([{ id: 1, name: 'John' }]);
});
