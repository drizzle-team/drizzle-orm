import 'dotenv/config.js';
import tsconfigPaths from 'vite-tsconfig-paths';
// oxlint-disable-next-line extensions
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: [
			'tests/**/*.test.ts',
			'js-tests',
		],
		exclude: [
			'tests/singlestore/**/*.test.ts',
			...(process.env['SKIP_EXTERNAL_DB_TESTS']
				? [
					'tests/relational/mysql.planetscale.test.ts',
					'tests/relational/mysql.planetscale-v1.test.ts',
					'tests/pg/neon-serverless.test.ts',
					'tests/mysql/tidb-serverless.test.ts',
					'tests/mysql/mysql-planetscale.test.ts',
					'tests/sqlite/libsql.test.ts',
					'tests/sqlite/libsql-http.test.ts',
					'tests/sqlite/libsql-node.test.ts',
					'tests/sqlite/libsql-sqlite3.test.ts',
					'tests/sqlite/libsql-ws.test.ts',
					'tests/sqlite/libsql-batch.test.ts',
					'tests/pg/neon-http.test.ts',
					'tests/pg/neon-http-batch.test.ts',
					'tests/sqlite/sqlite-cloud.test.ts',
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
			'tests/awsdatapi.alltypes.test.ts',
			'tests/relational/vercel.test.ts',
			'tests/relational/vercel-v1.test.ts',
			// Have a strange "invalid SQL: ERROR: must be owner of schema public" error. Will need to check with xata team
			'tests/pg/xata-http.test.ts',
			// todo: remove
			'js-tests/driver-init/module/vercel.test.mjs',
			'js-tests/driver-init/commonjs/vercel.test.cjs',
			// move back after decide on speed
			'tests/sqlite/libsql-ws.test.ts',
			'tests/sqlite/libsql-http.test.ts',
			'js-tests/driver-init/module/planetscale.test.mjs',
			'js-tests/driver-init/module/planetscale.test.cjs',
			'js-tests/driver-init/commonjs/planetscale.test.cjs',
		],
		typecheck: {
			tsconfig: 'tsconfig.json',
		},
		testTimeout: 120000,
		hookTimeout: 60000,
		fileParallelism: false,
	},
	plugins: [tsconfigPaths()],
});
