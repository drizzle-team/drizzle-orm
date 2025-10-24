import { rm } from 'node:fs/promises';
import { build } from '~build';
import { version } from '../package.json';

const versionFileName = `${process.cwd()}/src/version.ts`;
const versionTempFileName = `${process.cwd()}/src/version.temp.ts`;
const versionFile = await Bun.file(versionFileName).text();
const replaced = versionFile.replace(
	"export { version as npmVersion } from '../package.json';",
	`export const npmVersion = '${version}';`,
);
await Bun.write(versionTempFileName, replaced);

await build({
	readme: '../README.md',
});

await rm(versionTempFileName, { force: true });
