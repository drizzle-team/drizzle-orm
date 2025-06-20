import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: [
			'./tests/mssql/softRelationsTest/*.test.ts',
			// './tests/mysql/allDataTypesTest/*.test.ts',
			// './tests/sqlite/allDataTypesTest/*.test.ts',
			// './tests/mssql/**/*.test.ts',
			// './tests/pg/**/*.test.ts',
			// './tests/mysql/**/*.test.ts',
			// './tests/sqlite/**/*.test.ts',
		],
		exclude: [],
		typecheck: {
			tsconfig: 'tsconfig.json',
		},
		testTimeout: 1000000,
		hookTimeout: 1000000,
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
