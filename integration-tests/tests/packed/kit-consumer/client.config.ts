import { Pool } from '@drizzle-team/postgres';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dialect: 'postgresql',
	schema: './schema.ts',
	out: './drizzle',
	schemaFilter: ['packed_kit'],
	dbCredentials: { client: new Pool({ url: process.env.PG_CONNECTION_STRING!, max: 1 }) },
});
