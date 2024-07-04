import 'dotenv/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: [
			// 'tests/pg/node-postgres.test.ts',
			// 'tests/pg/postgres-js.test.ts',
			// 'tests/pg/pglite.test.ts',
			// 'tests/pg/pg-custom.test.ts',
			// 'tests/pg/pg-proxy.test.ts',
			'tests/pg/neon-http.test.ts',
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
			'tests/pg/vercel-pg.test.ts',
			'tests/relational/vercel.test.ts',
			'tests/__old/*',
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
