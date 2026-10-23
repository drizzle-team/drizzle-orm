import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dialect: 'postgresql',
	schema: './schema.ts',
	out: './drizzle',
	schemaFilter: ['packed_kit'],
	dbCredentials: { url: process.env.PG_CONNECTION_STRING! },
});
