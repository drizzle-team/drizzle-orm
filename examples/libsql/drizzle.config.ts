import { type Config } from 'drizzle-kit';

export default {
	out: './migrations',
	schema: './src/schema.ts',
	breakpoints: true,
} satisfies Config;
