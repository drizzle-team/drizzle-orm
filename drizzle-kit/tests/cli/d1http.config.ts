import { defineConfig } from '../../src';

export default defineConfig({
	schema: './schema.ts',
	dialect: 'sqlite',
	driver: 'd1-http',
	dbCredentials: {
		accountId: 'accid',
		databaseId: 'dbid',
		token: 'token',
	},
});
