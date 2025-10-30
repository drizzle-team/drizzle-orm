import { defineConfig } from '../../src';

export default defineConfig({
	schema: './schema.ts',
	dialect: 'turso',
	dbCredentials: {
		url: 'turso.dev',
		authToken: 'token',
	},
});
