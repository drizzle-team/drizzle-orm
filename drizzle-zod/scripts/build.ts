#!/usr/bin/env -S pnpm tsx
import 'zx/globals';
import concurrently from 'concurrently';

await concurrently([
	{
		command: 'rollup --config rollup.cjs.config.ts --configPlugin typescript',
		name: 'cjs',
	},
	{
		command: 'rollup --config rollup.esm.config.ts --configPlugin typescript',
		name: 'esm',
	},
	{
		command: `tsc -p tsconfig.cjs.json --declaration --outDir dist-dcts --emitDeclarationOnly && resolve-tspaths --out dist-dcts && rollup --config rollup.dcts.config.ts --configPlugin typescript`,
		name: 'dcts',
	},
	{
		command: `tsc -p tsconfig.esm.json --declaration --outDir dist-dmts --emitDeclarationOnly && resolve-tspaths --out dist-dmts && rollup --config rollup.dmts.config.ts --configPlugin typescript`,
		name: 'dmts',
	},
], {
	killOthers: 'failure',
}).result.catch(() => process.exit(1));
fs.copySync('../README.md', 'dist.new/README.md');
fs.removeSync('dist');
fs.renameSync('dist.new', 'dist');