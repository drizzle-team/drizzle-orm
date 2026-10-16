import { PGlite } from '@electric-sql/pglite';
import { eq, Name, sql } from 'drizzle-orm';
import { integer, pgTable, text } from 'drizzle-orm/pg-core';
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

// Repro for #1603: nested partial select on left join must not nullify when
// the first selected join column is null but a later one is not.
test('nested partial select left join keeps object when first join column is null (#1603)', async () => {
	const org = pgTable('org_1603', {
		id: integer('id').primaryKey(),
		name: text('name').notNull(),
	});
	const orgBranding = pgTable('org_branding_1603', {
		orgId: integer('org_id').primaryKey(),
		logo: text('logo'),
		panelBackground: text('panel_background'),
	});

	await db.execute(sql`drop table if exists org_branding_1603`);
	await db.execute(sql`drop table if exists org_1603`);
	await db.execute(sql`
		create table org_1603 (
			id integer primary key,
			name text not null
		)
	`);
	await db.execute(sql`
		create table org_branding_1603 (
			org_id integer primary key references org_1603(id),
			logo text,
			panel_background text
		)
	`);

	await db.insert(org).values({ id: 1, name: 'Test Org' });
	await db.insert(orgBranding).values({
		orgId: 1,
		logo: null,
		panelBackground: '#1a8cff',
	});

	const [result] = await db
		.select({
			name: org.name,
			branding: {
				logo: orgBranding.logo,
				panelBackground: orgBranding.panelBackground,
			},
		})
		.from(org)
		.leftJoin(orgBranding, eq(orgBranding.orgId, org.id));

	expect(result).toEqual({
		name: 'Test Org',
		branding: {
			logo: null,
			panelBackground: '#1a8cff',
		},
	});

	await db.execute(sql`drop table if exists org_branding_1603`);
	await db.execute(sql`drop table if exists org_1603`);
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
