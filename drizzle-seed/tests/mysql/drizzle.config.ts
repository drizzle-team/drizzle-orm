import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/tests/mysql/mysqlSchema.ts',
	out: './src/tests/mysql/mysqlMigrations',
	dialect: 'mysql',
});
