import 'dotenv/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: [
			'tests/extensions/postgis/**/*',
			'tests/relational/**/*.test.ts',
			'tests/pg/**/*.test.ts',
			'tests/mysql/**/*.test.ts',
			'tests/sqlite/**/*.test.ts',
			'tests/replicas/**/*',
			'tests/imports/**/*',
			'tests/extensions/vectors/**/*',
			'tests/version.test.ts',
		],
		exclude: [
			...(process.env.SKIP_EXTERNAL_DB_TESTS
				? [
					'tests/relational/mysql.planetscale.test.ts',
					'tests/neon-http-batch.test.ts',
					// 'tests/pg/xata-http.test.ts',
					'tests/mysql/tidb-serverless.test.ts',
				]
				: []),
			'tests/pg/awsdatapi.test.ts',
			'tests/awsdatapi.alltypes.test.ts',
			'tests/pg/vercel-pg.test.ts',
			'tests/relational/vercel.test.ts',
			// Have a strange "invalid SQL: ERROR: must be owner of schema public" error. Will need to check with xata team
			'tests/pg/xata-http.test.ts',
			'tests/pg/neon-http-batch.ts',
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
