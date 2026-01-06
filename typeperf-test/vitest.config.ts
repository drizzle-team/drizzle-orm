import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globalSetup: ['./vitest.setup.ts'],
		include: ['./benches/**/*.bench.ts'],
		testTimeout: 60000,
	},
});
