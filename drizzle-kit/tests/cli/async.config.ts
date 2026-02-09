import { defineConfig } from '../../src';

export default defineConfig(async () => ({
	schema: './schema.ts',
	dialect: 'postgresql',
	dbCredentials: {
		url: 'postgresql://postgres:postgres@127.0.0.1:5432/db',
	},
}));
