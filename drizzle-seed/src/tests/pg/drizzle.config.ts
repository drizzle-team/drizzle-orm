import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/tests/pg/pgSchema.ts',
	out: './src/tests/pg/pgMigrations',
	dialect: 'postgresql',
});
