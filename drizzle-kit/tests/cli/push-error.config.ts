import { defineConfig } from '../../src';

export default defineConfig({
	schema: './push-error.schema.ts',
	dialect: 'postgresql',
	driver: 'pglite',
	dbCredentials: {
		url: process.env.PGLITE_DATABASE_PATH!,
	},
});
