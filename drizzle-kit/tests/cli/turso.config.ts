import { defineConfig } from '../../src';

export default defineConfig({
	schema: './schema.ts',
	dialect: 'sqlite',
	driver: 'turso',
	dbCredentials: {
		url: 'turso.dev',
		authToken: 'token',
	},
});
