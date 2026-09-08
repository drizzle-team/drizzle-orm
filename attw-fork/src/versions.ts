import ts from 'typescript';

// @ts-ignore
// This file is only accessible from Node, but the rest of the package
// needs to run in the browser, so we don't have @types/node installed.
import { createRequire } from 'module';

const packageJson = createRequire(import.meta.url)('../package.json');

export const versions = {
	core: packageJson.version,
	typescript: ts.version,
};
