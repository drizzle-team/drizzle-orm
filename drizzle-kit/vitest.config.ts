import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: [
			'tests/**/*.test.ts',
			// Need to test it first before pushing changes
			// 'tests/singlestore-schemas.test.ts',
			// 'tests/singlestore-views.test.ts',
			// 'tests/push/singlestore-push.test.ts',
			// 'tests/push/singlestore.test.ts',
		],

		// This one was excluded because we need to modify an API for SingleStore-generated columns.
		// It’s in the backlog.
		exclude: ['tests/**/singlestore-generated.test.ts'],

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
	plugins: [tsconfigPaths()],
});
