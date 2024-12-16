import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: [
			'./tests/pg/**/*.test.ts',
			'./tests/mysql/**/*.test.ts',
			'./tests/sqlite/**/*.test.ts',
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
