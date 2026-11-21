import tsconfigPaths from 'vite-tsconfig-paths';
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
		// Files run side by side, each worker on a database of its own (tests/*/instrumentation.ts). Three: the tests
		// mostly wait on their databases, and on a CI machine that runs many jobs at once more workers only compete.
		maxWorkers: 3,
	},
	plugins: [tsconfigPaths()],
});
