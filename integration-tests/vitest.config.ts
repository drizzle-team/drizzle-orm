import 'dotenv/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: [
			'tests/**/*.test.ts',
		],
		exclude: [
			...(process.env.SKIP_EXTERNAL_DB_TESTS
				? [
					'tests/relational/mysql.planetscale.test.ts',
					'tests/neon-http-batch.test.ts',
					'tests/xata-http.test.ts',
				]
				: []),
			'tests/awsdatapi.test.ts',
			'tests/relational/vercel.test.ts',
			'tests/__old/*',
		],
		testTimeout: 100000,
		hookTimeout: 100000,
		poolOptions: {
			threads: {
				singleThread: true,
			},
		},
	},
	plugins: [tsconfigPaths()],
});
