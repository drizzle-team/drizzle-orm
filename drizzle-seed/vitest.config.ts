// oxlint-disable-next-line extensions
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: [
			'./tests/singlestore/**/*.test.ts',
			'./tests/cockroach/**/*.test.ts',
			'./tests/mssql/**/*.test.ts',
			'./tests/pg/**/*.test.ts',
			'./tests/mysql/**/*.test.ts',
			'./tests/sqlite/**/*.test.ts',
		],
		exclude: [
			'./tests/singlestore/**/*.test.ts',
		],
		typecheck: {
			tsconfig: 'tsconfig.json',
		},
		testTimeout: 100000,
		hookTimeout: 100000,
		isolate: true,
		maxWorkers: 1,
		fileParallelism: false,
	},
});
