import 'dotenv/config';
import { viteCommonjs } from '@originjs/vite-plugin-commonjs';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

console.log('process.env.SKIP_PLANETSCALE_TESTS', process.env.SKIP_PLANETSCALE_TESTS);
export default defineConfig({
	test: {
		include: [
			'tests/relational/**/*.test.ts',
			'tests/libsql-batch.test.ts',
			'tests/d1-batch.test.ts',
			'tests/replicas/**/*',
			'tests/imports/**/*',
		],
		exclude: [
			...(process.env.SKIP_PLANETSCALE_TESTS ? ['tests/relational/mysql.planetscale.test.ts'] : []),
			'tests/relational/vercel.test.ts',
		],
		typecheck: {
			tsconfig: 'tsconfig.json',
		},
		testTimeout: 100000,
		hookTimeout: 100000,
		// deps: {
		// 	inline: true,
		// },
	},
	plugins: [viteCommonjs(), tsconfigPaths()],
});
