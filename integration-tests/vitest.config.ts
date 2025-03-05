import 'dotenv/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: [
			'tests/seeder/**/*.test.ts',
			'tests/extensions/postgis/**/*',
			'tests/relational/**/*.test.ts',
			'tests/pg/**/*.test.ts',
			'tests/mysql/**/*.test.ts',
			'tests/singlestore/**/*.test.ts',
			'tests/sqlite/**/*.test.ts',
			'tests/replicas/**/*',
			'tests/imports/**/*',
			'tests/extensions/vectors/**/*',
			'tests/version.test.ts',
			'tests/pg/node-postgres.test.ts',
			'tests/utils/is-config.test.ts',
			'js-tests/driver-init/commonjs/*.test.cjs',
			'js-tests/driver-init/module/*.test.mjs',
			'tests/gel/**/*.test.ts',
		],
		exclude: [
			...(process.env.SKIP_EXTERNAL_DB_TESTS
				? [
					'tests/relational/mysql.planetscale.test.ts',
					'tests/pg/neon-serverless.test.ts',
					'tests/mysql/tidb-serverless.test.ts',
					'tests/mysql/mysql-planetscale.test.ts',
					'tests/sqlite/libsql.test.ts',
					'tests/sqlite/libsql-batch.test.ts',
					'tests/pg/neon-http.test.ts',
					'tests/pg/neon-http-batch.test.ts',
					'tests/utils/is-config.test.ts', // Uses external DBs in some cases
					'js-tests/driver-init/commonjs/neon-http.test.cjs',
					'js-tests/driver-init/commonjs/neon-ws.test.cjs',
					'js-tests/driver-init/commonjs/planetscale.test.cjs',
					'js-tests/driver-init/commonjs/tidb.test.cjs',
					'js-tests/driver-init/commonjs/vercel.test.cjs',
					'js-tests/driver-init/module/neon-http.test.mjs',
					'js-tests/driver-init/module/neon-ws.test.mjs',
					'js-tests/driver-init/module/planetscale.test.mjs',
					'js-tests/driver-init/module/tidb.test.mjs',
					'js-tests/driver-init/module/vercel.test.mjs',
				]
				: []),
			'tests/pg/awsdatapi.test.ts',
			'tests/awsdatapi.alltypes.test.ts',
			'tests/pg/vercel-pg.test.ts',
			'tests/relational/vercel.test.ts',
			// Have a strange "invalid SQL: ERROR: must be owner of schema public" error. Will need to check with xata team
			'tests/pg/xata-http.test.ts',
			'tests/pg/neon-http-batch.ts',
			// todo: remove
			'js-tests/driver-init/module/vercel.test.mjs',
			'js-tests/driver-init/commonjs/vercel.test.cjs',
			// move back after decide on speed
			'tests/sqlite/libsql-ws.test.ts',
			'tests/sqlite/libsql-http.test.ts',
			'tests/mysql/tidb-serverless.test.ts',
			// waiting for json_array from singlestore team
			'tests/relational/singlestore.test.ts',
			'js-tests/driver-init/module/planetscale.test.mjs',
			'js-tests/driver-init/module/planetscale.test.cjs',
			'js-tests/driver-init/commonjs/planetscale.test.cjs',
		],
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
