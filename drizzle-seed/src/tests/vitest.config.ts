import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: [
			'./src/tests/pg/**/*.test.ts',
			'./src/tests/mysql/**/*.test.ts',
			'./src/tests/sqlite/**/*.test.ts',
		],
		exclude: [],
		typecheck: {
			tsconfig: 'tsconfig.json',
		},
		testTimeout: 100000,
		hookTimeout: 100000,
		isolate: true,
		poolOptions: {
			threads: {
				singleThread: true,
			},
		},
		maxWorkers: 1,
		fileParallelism: false,
	},
});
