import { defineConfig } from '../../src';

export default defineConfig({
	schema: './schema.ts',
	dialect: 'postgresql',
	driver: 'pglite',
	dbCredentials: {
		url: 'memory://',
	},
});
