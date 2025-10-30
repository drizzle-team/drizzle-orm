import { rm } from 'node:fs/promises';
import { build } from '~build';
import { version } from '../package.json';
import { entrypoints } from './build.common';

const versionFileName = `${process.cwd()}/src/version.ts`;
const versionTempFileName = `${process.cwd()}/src/version.temp.ts`;
const versionFile = await Bun.file(versionFileName).text();
const replaced = versionFile.replace(
	"export { version as npmVersion } from '../package.json';",
	`export const npmVersion = '${version}';`,
);
await Bun.write(versionTempFileName, replaced);

const exports = Object.fromEntries(
	Object
		.values(entrypoints)
		.map((v) => v.replace('src/', './'))
		.sort((a, b) => a.localeCompare(b))
		.map((v) => [v.replace('/index.ts', '').replace('.ts', ''), {
			import: {
				types: v.replace('.ts', '.d.ts'),
				default: v.replace('.ts', '.js'),
			},
			require: {
				types: v.replace('.ts', '.d.cts'),
				default: v.replace('.ts', '.cjs'),
			},
		}]),
);

await build({
	readme: '../README.md',
	customPackageJsonExports: exports,
});

await rm(versionTempFileName, { force: true });
