import tsconfigPaths from 'vite-tsconfig-paths';
// oxlint-disable-next-line extensions
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: [
			'tests/**/*.test.ts',
		],
		exclude: [
			'tests/bun/**/*',
			'tests/singlestore.test.ts',
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
