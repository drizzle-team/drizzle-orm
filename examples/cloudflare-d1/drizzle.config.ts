import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dialect: 'sqlite',
	driver: 'd1-http',
	schema: 'src/schema.ts',
	out: 'drizzle',
	dbCredentials: {
		accountId: '',
		databaseId: '',
		token: '',
	},
});
