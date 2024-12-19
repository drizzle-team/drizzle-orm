import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/tests/pg/generatorsTest/pgSchema.ts',
	out: './src/tests/pg/generatorsTest/pgMigrations',
	dialect: 'postgresql',
});
