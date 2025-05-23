import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { beforeAll, beforeEach, expect, test } from 'vitest';
import {
	commentLikesConfig,
	commentsConfig,
	commentsTable,
	groupsConfig,
	groupsTable,
	postsConfig,
	postsTable,
	usersConfig,
	usersTable,
	usersToGroupsConfig,
	usersToGroupsTable,
} from './neon-http-batch';
import { TestCache, TestGlobalCache } from './pg-common-cache';

const ENABLE_LOGGING = false;

export const schema = {
	usersTable,
	postsTable,
	commentsTable,
	usersToGroupsTable,
	groupsTable,
	commentLikesConfig,
	commentsConfig,
	postsConfig,
	usersToGroupsConfig,
	groupsConfig,
	usersConfig,
};

let db: NeonHttpDatabase<typeof schema>;
let client: NeonQueryFunction<false, true>;
let dbGlobalCached: NeonHttpDatabase;
let cachedDb: NeonHttpDatabase;

beforeAll(async () => {
	const connectionString = process.env['NEON_HTTP_CONNECTION_STRING'];
	if (!connectionString) {
		throw new Error('NEON_HTTP_CONNECTION_STRING is not defined');
	}
	client = neon(connectionString);
	db = drizzle(client, { schema, logger: ENABLE_LOGGING });
	cachedDb = drizzle(client, {
		logger: ENABLE_LOGGING,
		cache: new TestCache(),
	});
	dbGlobalCached = drizzle(client, {
		logger: ENABLE_LOGGING,
		cache: new TestGlobalCache(),
	});
});

beforeEach((ctx) => {
	ctx.neonPg = {
		db,
	};
	ctx.cachedPg = {
		db: cachedDb,
		dbGlobalCached,
	};
});

test('skip', async () => {
	expect(1).toBe(1);
});
