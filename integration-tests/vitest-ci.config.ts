import 'dotenv/config.js';
import tsconfigPaths from 'vite-tsconfig-paths';
// oxlint-disable-next-line extensions
import { defineConfig } from 'vitest/config';

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
