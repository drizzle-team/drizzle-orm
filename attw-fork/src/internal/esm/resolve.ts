import * as cjs from '@loaderkit/resolve/cjs';
import * as esm from '@loaderkit/resolve/esm';
import type { FileSystemSync } from '@loaderkit/resolve/fs';
import type { Package } from '../../createPackage.ts';

function makeFileSystemAdapter(fs: Package): FileSystemSync {
	return {
		directoryExists: (url) => fs.directoryExists(url.pathname),
		fileExists: (url) => fs.fileExists(url.pathname),
		readFileJSON: (url) => JSON.parse(fs.readFile(url.pathname)),
		readLink: (): undefined => {},
	};
}

export function cjsResolve(fs: Package, specifier: string, parentURL: URL) {
	return cjs.resolveSync(makeFileSystemAdapter(fs), specifier, parentURL);
}

export function esmResolve(fs: Package, specifier: string, parentURL: URL) {
	return esm.resolveSync(makeFileSystemAdapter(fs), specifier, parentURL);
}
