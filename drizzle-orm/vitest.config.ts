import { viteCommonjs } from '@originjs/vite-plugin-commonjs';
import tsconfigPaths from 'vite-tsconfig-paths';
// oxlint-disable-next-line extensions
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// Not the 5 s default: some tests do a lot of CPU work (exports.test.ts reads every source file through the
		// TypeScript compiler, exports-resolution.test.ts resolves the packed package with attw), and on a CI machine
		// that runs many jobs at once they took longer than that.
		testTimeout: 15_000,
		hookTimeout: 15_000,
		typecheck: {
			tsconfig: 'tests/tsconfig.json',
		},
	},
	plugins: [viteCommonjs(), tsconfigPaths()],
});
