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

export const neonRelations = defineRelations(schema, () => ({}));

let db: NeonHttpDatabase<typeof schema, typeof neonRelations>;
let client: NeonQueryFunction<false, true>;

beforeAll(async () => {
	const connectionString = process.env['NEON_CONNECTION_STRING'];
	if (!connectionString) {
		throw new Error('NEON_CONNECTION_STRING is not defined');
	}
	client = neon(connectionString);
	db = drizzle(client, { schema, logger: ENABLE_LOGGING, relations: neonRelations });
});

beforeEach((ctx) => {
	ctx.neonPg = {
		db,
	};
});

tests();
