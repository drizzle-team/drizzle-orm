#!/usr/bin/env -S pnpm tsx
import 'zx/globals';
import concurrently from 'concurrently';
import { entries } from '../rollup.common';

interface Export {
	types: string;
	default: string;
}

function updateAndCopyPackageJson() {
	const pkg = fs.readJSONSync('package.json');

	pkg.exports = entries.reduce<Record<string, { import: Export; require: Export; default: Export; }>>(
		(acc, entry) => {
			const exportsEntry = entry === 'index' ? '.' : './' + entry.replace(/\/index$/, '');
			const importEntry = `./${entry}.mjs`;
			const requireEntry = `./${entry}.cjs`;
			const importTypesEntry = `./${entry}.d.mts`;
			const requireTypesEntry = `./${entry}.d.cts`;
			acc[exportsEntry] = {
				import: {
					types: importTypesEntry,
					default: importEntry,
				},
				require: {
					types: requireTypesEntry,
					default: requireEntry,
				},
				default: {
					types: importTypesEntry,
					default: importEntry,
				},
			};
			return acc;
		},
		{},
	);

	fs.writeJSONSync('dist.new/package.json', pkg, { spaces: 2 });
}

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
updateAndCopyPackageJson();
fs.removeSync('dist');
fs.renameSync('dist.new', 'dist');