import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config.js';

export default defineConfig({
	test: {
		include: [
			'tests/**/*.test.ts',
		],
		exclude: [
			'tests/bun/**/*',
		],
		typecheck: {
			tsconfig: 'tsconfig.json',
		},
		testTimeout: 100000,
		hookTimeout: 100000,
		isolate: false,
		poolOptions: {
			threads: {
				singleThread: true,
			},
		},
	},
	plugins: [tsconfigPaths()],
});
