import 'dotenv/config';
import { viteCommonjs } from '@originjs/vite-plugin-commonjs';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: [
			'tests/extensions/postgis/**/*',
			'tests/relational/**/*.test.ts',
			'tests/libsql-batch.test.ts',
			'tests/d1-batch.test.ts',
			'tests/sqlite-proxy-batch.test.ts',
			'tests/neon-http-batch.test.ts',
			'tests/replicas/**/*',
			'tests/imports/**/*',
			'tests/xata-http.test.ts',
			'tests/extensions/vectors/**/*',
			'tests/tidb-serverless.test.ts',
			// 'tests/awsdatapi.test.ts',
		],
		exclude: [
			...(process.env.SKIP_EXTERNAL_DB_TESTS
				? [
					'tests/relational/mysql.planetscale.test.ts',
					'tests/neon-http-batch.test.ts',
					'tests/xata-http.test.ts',
					'tests/tidb-serverless.test.ts',
				]
				: []),
			'tests/relational/vercel.test.ts',
		],
		typecheck: {
			tsconfig: 'tsconfig.json',
		},
		testTimeout: 100000,
		hookTimeout: 100000,
		isolate: false,
	},
	plugins: [viteCommonjs(), tsconfigPaths()],
});
