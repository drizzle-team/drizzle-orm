#!/usr/bin/env -S pnpm tsx
import 'zx/globals';
import cpy from 'cpy';

async function updateAndCopyPackageJson() {
	const pkg = await fs.readJSON('package.json');

	const entries = await glob('src/**/*.ts');

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
		(acc, rawEntry) => {
			const entry = rawEntry.match(/src\/(.*)\.ts/)![1]!;
			const exportsEntry = entry === 'index' ? '.' : './' + entry.replace(/\/index$/, '');
			const importEntry = `./${entry}.js`;
			const requireEntry = `./${entry}.cjs`;
			acc[exportsEntry] = {
				import: {
					types: `./${entry}.d.ts`,
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

	await fs.writeJSON('dist.new/package.json', pkg, { spaces: 2 });
}

await fs.remove('dist.new');

await Promise.all([
	(async () => {
		await $`tsup`.stdio('pipe', 'pipe', 'pipe');
	})(),
	(async () => {
		await $`tsc -p tsconfig.dts.json`.stdio('pipe', 'pipe', 'pipe');
		await cpy('dist-dts/**/*.d.ts', 'dist.new', {
			rename: (basename) => basename.replace(/\.d\.ts$/, '.d.cts'),
		});
		await cpy('dist-dts/**/*.d.ts', 'dist.new', {
			rename: (basename) => basename.replace(/\.d\.ts$/, '.d.ts'),
		});
	})(),
]);

await Promise.all([
	$`tsup src/version.ts --no-config --dts --format esm --outDir dist.new`.stdio('pipe', 'pipe', 'pipe'),
	$`tsup src/version.ts --no-config --dts --format cjs --outDir dist.new`.stdio('pipe', 'pipe', 'pipe'),
]);

await $`scripts/fix-imports.ts`;

await fs.copy('../README.md', 'dist.new/README.md');
await updateAndCopyPackageJson();
await fs.remove('dist');
await fs.rename('dist.new', 'dist');
