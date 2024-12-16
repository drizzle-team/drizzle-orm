import { defineConfig } from '../../src';

export default defineConfig({
	schema: './schema.ts',
	dialect: 'sqlite',
	driver: 'durable-sqlite',
});
