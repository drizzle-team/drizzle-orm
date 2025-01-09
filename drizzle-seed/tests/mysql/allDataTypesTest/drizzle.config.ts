import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/tests/mysql/allDataTypesTest/mysqlSchema.ts',
	out: './src/tests/mysql/allDataTypesTest/mysqlMigrations',
	dialect: 'mysql',
});
