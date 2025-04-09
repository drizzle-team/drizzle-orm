import { defineConfig } from '../../src';

export default defineConfig({
	schema: './schema.ts',
	dialect: 'postgresql',
	dbCredentials: {
		host: '127.0.0.1',
		port: 5432,
		user: 'postgresql',
		password: 'postgres',
		database: 'db',
	},
});
