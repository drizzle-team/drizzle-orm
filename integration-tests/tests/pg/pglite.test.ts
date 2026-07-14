import { PGlite, types } from '@electric-sql/pglite';
import { eq, Name, sql } from 'drizzle-orm';
import { json, jsonb, pgTable, serial } from 'drizzle-orm/pg-core';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { skipTests } from '~/common';
import { tests, usersMigratorTable, usersTable } from './pg-common';
import { TestCache, TestGlobalCache, tests as cacheTests } from './pg-common-cache';

const ENABLE_LOGGING = false;

let db: PgliteDatabase;
let dbGlobalCached: PgliteDatabase;
let cachedDb: PgliteDatabase;
let client: PGlite;

beforeAll(async () => {
	client = new PGlite();
	db = drizzle(client, { logger: ENABLE_LOGGING });
	cachedDb = drizzle(client, {
		logger: ENABLE_LOGGING,
		cache: new TestCache(),
	});
	dbGlobalCached = drizzle(client, {
		logger: ENABLE_LOGGING,
		cache: new TestGlobalCache(),
	});
});

afterAll(async () => {
	await client?.close();
});

beforeEach((ctx) => {
	ctx.pg = {
		db,
	};
	ctx.cachedPg = {
		db: cachedDb,
		dbGlobalCached,
	};
});

test('migrator : default migration strategy', async () => {
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

test('insert via db.execute + select via db.execute', async () => {
	await db.execute(sql`insert into ${usersTable} (${new Name(usersTable.name.name)}) values (${'John'})`);

	const result = await db.execute<{ id: number; name: string }>(sql`select id, name from "users"`);
	expect(Array.prototype.slice.call(result.rows)).toEqual([{ id: 1, name: 'John' }]);
});

test('insert via db.execute + returning', async () => {
	const result = await db.execute<{ id: number; name: string }>(
		sql`insert into ${usersTable} (${new Name(
			usersTable.name.name,
		)}) values (${'John'}) returning ${usersTable.id}, ${usersTable.name}`,
	);
	expect(Array.prototype.slice.call(result.rows)).toEqual([{ id: 1, name: 'John' }]);
});

test('insert via db.execute w/ query builder', async () => {
	const result = await db.execute<Pick<typeof usersTable.$inferSelect, 'id' | 'name'>>(
		db.insert(usersTable).values({ name: 'John' }).returning({ id: usersTable.id, name: usersTable.name }),
	);
	expect(Array.prototype.slice.call(result.rows)).toEqual([{ id: 1, name: 'John' }]);
});

test('supports custom json and jsonb serializers', async () => {
	const client = new PGlite();
	const stringifyBigInts = (value: unknown) =>
		JSON.stringify(
			value,
			(_key, nestedValue) => typeof nestedValue === 'bigint' ? nestedValue.toString() : nestedValue,
		);
	const db = drizzle({
		client,
		cache: new TestCache(),
		queryOptions: {
			serializers: {
				[types.JSON]: stringifyBigInts,
				[types.JSONB]: stringifyBigInts,
			},
		},
	});
	const jsonTable = pgTable('pglite_jsonb_bigint', {
		id: serial('id').primaryKey(),
		metadata: json('metadata').$type<{ xid: bigint }>(),
		extra: jsonb('extra').$type<{ xid: bigint }>(),
	});

	try {
		await db.execute(sql`create table ${jsonTable} (id serial primary key, metadata json, extra jsonb)`);

		await db.insert(jsonTable).values({ metadata: { xid: 0n }, extra: { xid: 0n } });

		const statement = db.insert(jsonTable).values({
			metadata: sql.placeholder('metadata'),
			extra: sql.placeholder('extra'),
		}).prepare('pglite_json_bigint_serializers');

		await statement.execute({ metadata: { xid: 1n }, extra: { xid: 1n } });

		const result = await db.select({
			metadataXid: sql<string>`${jsonTable.metadata}->>'xid'`,
			extraXid: sql<string>`${jsonTable.extra}->>'xid'`,
		}).from(jsonTable).orderBy(jsonTable.id);

		expect(result).toEqual([
			{ metadataXid: '0', extraXid: '0' },
			{ metadataXid: '1', extraXid: '1' },
		]);

		const cachedResult = await db.select({
			id: jsonTable.id,
		}).from(jsonTable).where(eq(jsonTable.extra, { xid: 1n })).$withCache();

		expect(cachedResult).toEqual([{ id: 2 }]);
	} finally {
		await client.close();
	}
});

test('uses default json and jsonb serialization without custom serializers', async () => {
	const client = new PGlite();
	const db = drizzle(client);
	const jsonTable = pgTable('pglite_json_defaults', {
		id: serial('id').primaryKey(),
		metadata: json('metadata').$type<{ xid: number }>(),
		extra: jsonb('extra').$type<{ xid: number }>(),
	});

	try {
		await db.execute(sql`create table ${jsonTable} (id serial primary key, metadata json, extra jsonb)`);

		await db.insert(jsonTable).values({ metadata: { xid: 1 }, extra: { xid: 1 } });

		const result = await db.select({
			metadata: jsonTable.metadata,
			extra: jsonTable.extra,
		}).from(jsonTable);

		expect(result).toEqual([{ metadata: { xid: 1 }, extra: { xid: 1 } }]);
	} finally {
		await client.close();
	}
});

test('supports custom parser overrides', async () => {
	const db = drizzle({
		queryOptions: {
			parsers: {
				[types.DATE]: (value) => `parsed:${value}`,
			},
		},
	});

	try {
		const result = await db.execute<{ value: string }>(sql`select date '2024-01-02' as value`);

		expect(Array.prototype.slice.call(result.rows)).toEqual([{ value: 'parsed:2024-01-02' }]);
	} finally {
		await db.$client.close();
	}
});

skipTests([
	'migrator : default migration strategy',
	'migrator : migrate with custom schema',
	'migrator : migrate with custom table',
	'migrator : migrate with custom table and custom schema',
	'insert via db.execute + select via db.execute',
	'insert via db.execute + returning',
	'insert via db.execute w/ query builder',
	'all date and time columns without timezone first case mode string',
	'all date and time columns without timezone third case mode date',
	'test mode string for timestamp with timezone',
	'test mode date for timestamp with timezone',
	'test mode string for timestamp with timezone in UTC timezone',
	'test mode string for timestamp with timezone in different timezone',
	'view',
	'materialized view',
	'subquery with view',
	'mySchema :: materialized view',
	'select count()',
	// not working in 0.2.12
	'select with group by as sql + column',
	'select with group by as column + sql',
	'mySchema :: select with group by as column + sql',
]);

tests();
cacheTests();

beforeEach(async () => {
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
