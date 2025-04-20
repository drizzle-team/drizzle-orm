import * as tsup from 'tsup';
// import { readFileSync, writeFileSync } from 'node:fs';

const main = async () => {
	// await tsup.build({
	// 	entryPoints: ['./src/utils/studio.ts'],
	// 	outDir: './dist',
	// 	external: [],
	// 	splitting: false,
	// 	dts: true,
	// 	platform: 'browser',
	// 	format: ['esm'],
	// });

	await tsup.build({
		entryPoints: ['./src/utils/studio-sqlite.ts'],
		outDir: './dist',
		external: [],
		splitting: false,
		dts: true,
		platform: 'browser',
		format: ['esm'],
	});

	await tsup.build({
		entryPoints: ['./src/utils/studio-postgres.ts'],
		outDir: './dist',
		external: [],
		splitting: false,
		dts: true,
		platform: 'browser',
		format: ['esm'],
	});

	await tsup.build({
		entryPoints: ['./src/utils/mover.ts'],
		outDir: './dist',
		external: [],
		splitting: false,
		dts: true,
		platform: 'browser',
		format: ['esm'],
	});
};

main().then(() => {
	process.exit(0);
}).catch((e) => {
	console.error(e);
	process.exit(1);
});

// const apiCjs = readFileSync('./dist/api.js', 'utf8').replace(/await import\(/g, 'require(');
// writeFileSync('./dist/api.js', apiCjs);
