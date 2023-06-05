#!/usr/bin/env -S pnpm tsx
import 'zx/globals';
import concurrently from 'concurrently';
import { entries } from '../rollup.common';

function updateAndCopyPackageJson() {
	const pkg = fs.readJSONSync('package.json');

	pkg.exports = entries.reduce<Record<string, { import: string; require: string; default: string; types: string }>>(
		(acc, entry) => {
			const exportsEntry = entry === 'index' ? '.' : './' + entry.replace(/\/index$/, '');
			const importEntry = `./${entry}.mjs`;
			const requireEntry = `./${entry}.cjs`;
			const typesEntry = `./${entry}.d.ts`;
			acc[exportsEntry] = {
				types: typesEntry,
				import: importEntry,
				require: requireEntry,
				default: importEntry,
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
		command: `tsc -p tsconfig.esm.json --declaration --outDir dist-dts --emitDeclarationOnly &&
resolve-tspaths --out dist-dts &&
rollup --config rollup.dts.config.ts --configPlugin typescript`,
		name: 'dts',
	},
]).result;
fs.copySync('../README.md', 'dist.new/README.md');
updateAndCopyPackageJson();
fs.removeSync('dist');
fs.renameSync('dist.new', 'dist');
