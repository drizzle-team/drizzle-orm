import retry from 'async-retry';
import { sql } from 'drizzle-orm';
import type { DSQLDatabase } from 'drizzle-orm/dsql';
import { drizzle } from 'drizzle-orm/dsql';
import { boolean, dsqlTable, text, timestamp, uuid } from 'drizzle-orm/dsql-core';
import { afterAll, beforeAll, describe, expect } from 'vitest';
import { tests, usersTable } from './common';
import { tests as cacheTests } from './common-cache';
import { dsqlTest } from './instrumentation';

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

// Run common tests with the dsqlTest fixture
tests(dsqlTest);

// Run cache tests
cacheTests(dsqlTest);

// DSQL-specific tests
describe('dsql-specific', () => {
	let tableCounter = 0;
	const uniqueName = (base: string) => `${base}_dsql_${++tableCounter}_${Date.now()}`;

	dsqlTest.concurrent('insert via db.execute + select via db.execute', async ({ db }) => {
		const tableName = uniqueName('users');
		const users = dsqlTable(tableName, {
			id: uuid('id').primaryKey().defaultRandom(),
			name: text('name').notNull(),
			verified: boolean('verified').notNull().default(false),
			createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		});

		await db.execute(sql`
			create table ${sql.identifier(tableName)} (
				id uuid primary key default gen_random_uuid(),
				name text not null,
				verified boolean not null default false,
				created_at timestamptz not null default now()
			)
		`);

		try {
			await db.execute(sql`insert into ${sql.identifier(tableName)} (${sql.identifier('name')}) values (${'John'})`);

			const result = await db.execute<{ id: string; name: string }>(
				sql`select id, name from ${sql.identifier(tableName)}`,
			);
			expect(result.rows[0]?.name).toBe('John');
		} finally {
			await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
		}
	});

	dsqlTest.concurrent('insert via db.execute + returning', async ({ db }) => {
		const tableName = uniqueName('users');

		await db.execute(sql`
			create table ${sql.identifier(tableName)} (
				id uuid primary key default gen_random_uuid(),
				name text not null,
				verified boolean not null default false,
				created_at timestamptz not null default now()
			)
		`);

		try {
			const inserted = await db.execute<{ id: string; name: string }>(
				sql`insert into ${sql.identifier(tableName)} (name) values (${'John'}) returning id, name`,
			);
			expect(inserted.rows[0]?.name).toBe('John');
		} finally {
			await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
		}
	});

	dsqlTest.concurrent('insert via db.execute w/ query builder', async ({ db }) => {
		const tableName = uniqueName('users');
		const users = dsqlTable(tableName, {
			id: uuid('id').primaryKey().defaultRandom(),
			name: text('name').notNull(),
			verified: boolean('verified').notNull().default(false),
			createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		});

		await db.execute(sql`
			create table ${sql.identifier(tableName)} (
				id uuid primary key default gen_random_uuid(),
				name text not null,
				verified boolean not null default false,
				created_at timestamptz not null default now()
			)
		`);

		try {
			const inserted = await db.execute<Pick<typeof users.$inferSelect, 'id' | 'name'>>(
				db.insert(users).values({ name: 'John' }).returning({ id: users.id, name: users.name }),
			);
			expect(inserted.rows[0]?.name).toBe('John');
		} finally {
			await db.execute(sql`drop table if exists ${sql.identifier(tableName)} cascade`);
		}
	});
});
