import { viteCommonjs } from '@originjs/vite-plugin-commonjs';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		typecheck: {
			tsconfig: 'tests/tsconfig.json',
		},
	},
	plugins: [viteCommonjs(), tsconfigPaths()],
});
