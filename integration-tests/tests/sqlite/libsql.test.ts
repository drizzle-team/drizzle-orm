import { type Client, createClient } from '@libsql/client';
import retry from 'async-retry';
import type { MutationOption } from 'drizzle-orm/cache/core';
import { Cache } from 'drizzle-orm/cache/core';
import { sql } from 'drizzle-orm';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { skipTests } from '~/common';
import { randomString } from '~/utils';
import { anotherUsersMigratorTable, tests, usersMigratorTable } from './sqlite-common';
import { TestCache, TestGlobalCache, tests as cacheTests } from './sqlite-common-cache';

const ENABLE_LOGGING = false;

let db: LibSQLDatabase;
let dbGlobalCached: LibSQLDatabase;
let cachedDb: LibSQLDatabase;
let roundTripCachedDb: LibSQLDatabase;
let client: Client;

// eslint-disable-next-line drizzle-internal/require-entity-kind
class JsonRoundTripCache extends Cache {
	private data = new Map<string, string>();

	override strategy(): 'explicit' | 'all' {
		return 'explicit';
	}

	override async get(key: string): Promise<any[] | undefined> {
		const stored = this.data.get(key);
		return stored === undefined ? undefined : JSON.parse(stored);
	}

	override async put(key: string, response: any): Promise<void> {
		this.data.set(key, JSON.stringify(response));
	}

	override async onMutate(_params: MutationOption): Promise<void> {}
}

const cacheRoundTripUsers = sqliteTable('cache_roundtrip_users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	payload: text('payload', { mode: 'json' }).$type<{ a: number }>().notNull(),
});

beforeAll(async () => {
	const url = process.env['LIBSQL_URL'];
	const authToken = process.env['LIBSQL_AUTH_TOKEN'];
	if (!url) {
		throw new Error('LIBSQL_URL is not set');
	}
	client = await retry(async () => {
		client = createClient({ url, authToken });
		return client;
	}, {
		retries: 20,
		factor: 1,
		minTimeout: 250,
		maxTimeout: 250,
		randomize: false,
		onRetry() {
			client?.close();
		},
	});
	db = drizzle(client, { logger: ENABLE_LOGGING });
	cachedDb = drizzle(client, { logger: ENABLE_LOGGING, cache: new TestCache() });
	dbGlobalCached = drizzle(client, { logger: ENABLE_LOGGING, cache: new TestGlobalCache() });
	roundTripCachedDb = drizzle(client, { logger: ENABLE_LOGGING, cache: new JsonRoundTripCache() });
});

afterAll(async () => {
	client?.close();
});

beforeEach((ctx) => {
	ctx.sqlite = {
		db,
	};
	ctx.cachedSqlite = {
		db: cachedDb,
		dbGlobalCached,
	};
});

test('migrator', async () => {
	await db.run(sql`drop table if exists another_users`);
	await db.run(sql`drop table if exists users12`);
	await db.run(sql`drop table if exists __drizzle_migrations`);

	await migrate(db, { migrationsFolder: './drizzle2/sqlite' });

	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' }).run();
	const result = await db.select().from(usersMigratorTable).all();

	await db.insert(anotherUsersMigratorTable).values({ name: 'John', email: 'email' }).run();
	const result2 = await db.select().from(anotherUsersMigratorTable).all();

	expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);
	expect(result2).toEqual([{ id: 1, name: 'John', email: 'email' }]);

	await db.run(sql`drop table another_users`);
	await db.run(sql`drop table users12`);
	await db.run(sql`drop table __drizzle_migrations`);
});

test('migrator : migrate with custom table', async () => {
	const customTable = randomString();
	await db.run(sql`drop table if exists another_users`);
	await db.run(sql`drop table if exists users12`);
	await db.run(sql`drop table if exists ${sql.identifier(customTable)}`);

	await migrate(db, { migrationsFolder: './drizzle2/sqlite', migrationsTable: customTable });

	// test if the custom migrations table was created
	const res = await db.all(sql`select * from ${sql.identifier(customTable)};`);
	expect(res.length > 0).toBeTruthy();

	// test if the migrated table are working as expected
	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
	const result = await db.select().from(usersMigratorTable);
	expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

	await db.run(sql`drop table another_users`);
	await db.run(sql`drop table users12`);
	await db.run(sql`drop table ${sql.identifier(customTable)}`);
});

test('libsql cache hit should keep row values after JSON roundtrip', async () => {
	await db.run(sql`drop table if exists cache_roundtrip_users`);
	await db.run(
		sql`
			create table cache_roundtrip_users (
				id integer primary key AUTOINCREMENT,
				payload text not null
			)
		`,
	);

	await db.insert(cacheRoundTripUsers).values({
		payload: { a: 1 },
	});

	const first = await roundTripCachedDb.select().from(cacheRoundTripUsers).$withCache();
	const second = await roundTripCachedDb.select().from(cacheRoundTripUsers).$withCache();

	expect(first).toEqual([{ id: 1, payload: { a: 1 } }]);
	expect(second).toEqual(first);

	await db.run(sql`drop table if exists cache_roundtrip_users`);
});

skipTests([
	'delete with limit and order by',
	'update with limit and order by',
]);

cacheTests();
tests();
