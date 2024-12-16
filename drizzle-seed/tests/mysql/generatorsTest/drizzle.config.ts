import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/tests/mysql/generatorsTest/mysqlSchema.ts',
	out: './src/tests/mysql/generatorsTest/mysqlMigrations',
	dialect: 'mysql',
});
