#!/usr/bin/env bun
import { build as tsdown } from 'tsdown';

const entries = {
	'studio-sqlite': './src/ext/studio-sqlite.ts',
	'studio-postgres': './src/ext/studio-postgres.ts',
	'studio-mysql': './src/ext/studio-mysql.ts',
};

const commonOptions = {
	outDir: 'dist',
	format: 'esm',
	platform: 'browser',
	fixedExtension: false,
	clean: false,
	dts: true,
	deps: { neverBundle: [/^drizzle-orm\/?/] },
} satisfies Parameters<typeof tsdown>[0];

async function main() {
	const startTime = Date.now();

	// Each entry is built on its own, so every studio file is self-contained and shares no chunks with the others
	await Promise.all(
		Object.entries(entries).map(([name, path]) =>
			tsdown({
				...commonOptions,
				entry: { [name]: path },
			})
		),
	);

	const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
	console.log(`Studio build completed successfully in ${elapsed}s`);
}

await main().catch((e) => {
	console.error(e);
	process.exit(1);
}).then(() => process.exit(0));
