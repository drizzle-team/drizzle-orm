import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/tests/pg/allDataTypesTest/pgSchema.ts',
	out: './src/tests/pg/allDataTypesTest/pgMigrations',
	dialect: 'postgresql',
});
