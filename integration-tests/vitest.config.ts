import { viteCommonjs } from '@originjs/vite-plugin-commonjs';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['tests/relational/*.test.ts'],
		typecheck: {
			tsconfig: 'tsconfig.json',
		},
		// deps: {
		// 	inline: true,
		// },
	},
	plugins: [viteCommonjs(), tsconfigPaths()],
});
