#!/usr/bin/env -S pnpm tsx
import 'zx/globals';
import concurrently from 'concurrently';
import cpy from 'cpy';

import { entries } from '../rollup.common';

function updateAndCopyPackageJson() {
	const pkg = fs.readJSONSync('package.json');

	pkg.exports = entries.reduce<
		Record<string, {
			import: {
				types?: string;
				default: string;
			};
			require: {
				types: string;
				default: string;
			};
			default: string;
			types: string;
		}>
	>(
		(acc, entry) => {
			const exportsEntry = entry === 'index' ? '.' : './' + entry.replace(/\/index$/, '');
			const importEntry = `./${entry}.mjs`;
			const requireEntry = `./${entry}.cjs`;
			acc[exportsEntry] = {
				import: {
					types: `./${entry}.d.mts`,
					default: importEntry,
				},
				require: {
					types: `./${entry}.d.cts`,
					default: requireEntry,
				},
				types: `./${entry}.d.ts`,
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
		command: `rimraf dist-dts && tsc -p tsconfig.dts.json && resolve-tspaths -p tsconfig.dts.json --out dist-dts`,
		name: 'dts',
	},
], {
	killOthers: 'failure',
}).result.catch(() => process.exit(1));
await cpy('dist-dts/**/*.d.ts', 'dist.new', {
	rename: (basename) => basename.replace(/\.d\.ts$/, '.d.mts'),
});
await cpy('dist-dts/**/*.d.ts', 'dist.new', {
	rename: (basename) => basename.replace(/\.d\.ts$/, '.d.cts'),
});
await cpy('dist-dts/**/*.d.ts', 'dist.new');
fs.removeSync('dist-dts');
fs.copySync('../README.md', 'dist.new/README.md');
updateAndCopyPackageJson();
fs.removeSync('dist');
fs.renameSync('dist.new', 'dist');
