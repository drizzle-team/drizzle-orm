import { defineConfig } from 'rolldown';
import pkg from './package.json';

export default defineConfig([
	{
		input: './src/cli/index.ts',
		platform: 'node',
		external: [
			...Object.keys(pkg.devDependencies),
			/^drizzle-orm\/?/,
			'bun:sqlite',
			'bun',
		],
		output: [
			{
				format: 'cjs',
				file: 'dist/bin.cjs',
				banner: '#!/usr/bin/env node',
				inlineDynamicImports: true,
			},
		],
		transform: {
			define: {
				'process.env.DRIZZLE_KIT_VERSION': `"${pkg.version}"`,
			},
			target: 'node16',
		},
		tsconfig: 'tsconfig.build.json',
	},
]);
