import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { defineRelations } from 'drizzle-orm';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { beforeAll, beforeEach } from 'vitest';
import {
	commentLikesConfig,
	commentsConfig,
	commentsTable,
	groupsConfig,
	groupsTable,
	postsConfig,
	postsTable,
	tests,
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

export const neonRelations = defineRelations(schema);

let db: NeonHttpDatabase<typeof schema, typeof neonRelations>;
let client: NeonQueryFunction<false, true>;
let dbGlobalCached: NeonHttpDatabase;
let cachedDb: NeonHttpDatabase;

beforeAll(async () => {
	const connectionString = process.env['NEON_HTTP_CONNECTION_STRING'];
	if (!connectionString) {
		throw new Error('NEON_HTTP_CONNECTION_STRING is not defined');
	}
	client = neon(connectionString);
	db = drizzle({ client, schema, logger: ENABLE_LOGGING, relations: neonRelations });
	cachedDb = drizzle({ client, logger: ENABLE_LOGGING, cache: new TestCache() });
	dbGlobalCached = drizzle({ client, logger: ENABLE_LOGGING, cache: new TestGlobalCache() });
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

tests();
