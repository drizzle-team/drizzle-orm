import 'dotenv/config.js';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config.js';

export default defineConfig({
	test: {
		typecheck: {
			tsconfig: 'tsconfig.json',
		},
		testTimeout: 100000,
		hookTimeout: 200000,
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
