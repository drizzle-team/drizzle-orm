import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: 'src/schema.ts',
	out: 'drizzle',
});
