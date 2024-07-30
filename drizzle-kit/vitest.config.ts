import { viteCommonjs } from "@originjs/vite-plugin-commonjs";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: [
			"tests/**/*.test.ts",
		],

		typecheck: {
			tsconfig: "tsconfig.json",
		},
		testTimeout: 100000,
		hookTimeout: 100000,
	},
	plugins: [viteCommonjs(), tsconfigPaths()],
});
