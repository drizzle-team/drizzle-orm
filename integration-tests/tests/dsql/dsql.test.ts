import retry from 'async-retry';
import { sql } from 'drizzle-orm';
import type { DSQLDatabase } from 'drizzle-orm/dsql';
import { drizzle } from 'drizzle-orm/dsql';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { tests, usersTable } from './common';

const ENABLE_LOGGING = false;

let db: DSQLDatabase;

beforeAll(async () => {
	const clusterId = process.env['DSQL_CLUSTER_ID'];
	if (!clusterId) {
		throw new Error('DSQL_CLUSTER_ID environment variable is required');
	}

	// The drizzle function will handle connection setup
	// using the cluster ID to derive endpoint and generate IAM auth token
	db = await retry(
		async () => {
			const database = drizzle({
				connection: {
					endpoint: `${clusterId}.dsql.us-west-2.on.aws`,
					region: 'us-west-2',
				},
				logger: ENABLE_LOGGING,
			});
			// Test connection
			await database.execute(sql`SELECT 1`);
			return database;
		},
		{
			retries: 20,
			factor: 1,
			minTimeout: 250,
			maxTimeout: 250,
			randomize: false,
		},
	);
});

afterAll(async () => {
	// Cleanup if needed
});

beforeEach((ctx) => {
	ctx.dsql = {
		db,
	};
});

// Run common tests
tests();

// DSQL-specific tests can be added here
test('insert via db.execute + select via db.execute', async () => {
	await db.execute(sql`drop table if exists users cascade`);
	await db.execute(
		sql`
			create table users (
				id uuid primary key default gen_random_uuid(),
				name text not null,
				verified boolean not null default false,
				created_at timestamptz not null default now()
			)
		`,
	);

	await db.execute(sql`insert into ${usersTable} (${sql.identifier(usersTable.name.name)}) values (${'John'})`);

	const result = await db.execute<{ id: string; name: string }>(sql`select id, name from "users"`);
	expect(result.rows[0]?.name).toBe('John');
});

test('insert via db.execute + returning', async () => {
	await db.execute(sql`drop table if exists users cascade`);
	await db.execute(
		sql`
			create table users (
				id uuid primary key default gen_random_uuid(),
				name text not null,
				verified boolean not null default false,
				created_at timestamptz not null default now()
			)
		`,
	);

	const inserted = await db.execute<{ id: string; name: string }>(
		sql`insert into ${usersTable} (${
			sql.identifier(usersTable.name.name)
		}) values (${'John'}) returning ${usersTable.id}, ${usersTable.name}`,
	);
	expect(inserted.rows[0]?.name).toBe('John');
});

test('insert via db.execute w/ query builder', async () => {
	await db.execute(sql`drop table if exists users cascade`);
	await db.execute(
		sql`
			create table users (
				id uuid primary key default gen_random_uuid(),
				name text not null,
				verified boolean not null default false,
				created_at timestamptz not null default now()
			)
		`,
	);

	const inserted = await db.execute<Pick<typeof usersTable.$inferSelect, 'id' | 'name'>>(
		db.insert(usersTable).values({ name: 'John' }).returning({ id: usersTable.id, name: usersTable.name }),
	);
	expect(inserted.rows[0]?.name).toBe('John');
});
