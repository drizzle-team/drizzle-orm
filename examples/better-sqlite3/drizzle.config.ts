import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/schema.ts',
	out: './drizzle',
	driver: 'better-sqlite',
	dbCredentials: {
		url: './sqlite.db',
	},
});
