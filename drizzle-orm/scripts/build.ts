#!/usr/bin/env -S pnpm tsx
import 'zx/globals';
import { entries } from '../rollup.common';

function updateAndCopyPackageJson() {
	const pkg = fs.readJSONSync('package.json');

	pkg.exports = entries.reduce<Record<string, { import: string; require: string; default: string; types: string }>>(
		(acc, entry) => {
			const exportsEntry = entry === 'index' ? '.' : './' + entry.replace(/\/index$/, '');
			const importEntry = `./${entry}.mjs`;
			const requireEntry = `./${entry}.cjs`;
			const typesEntry = `./${entry}.d.ts`;
			acc[exportsEntry] = { import: importEntry, require: requireEntry, default: importEntry, types: typesEntry };
			return acc;
		},
		{},
	);

	fs.writeJSONSync('dist/package.json', pkg, { spaces: 2 });
}

fs.removeSync('dist');
await $`rollup --config rollup.config.ts --configPlugin typescript`;
fs.copySync('../README.md', 'dist/README.md');
updateAndCopyPackageJson();
await $`tsc -p tsconfig.build.json --declaration --outDir dist-dts --emitDeclarationOnly`;
await $`resolve-tspaths --out dist-dts`;
await $`rollup --config rollup.dts.config.ts --configPlugin typescript`;
