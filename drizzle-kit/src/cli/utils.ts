import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import semver from 'semver';
import { err, warning } from './views';

/**
 * ESM `import()` resolves a bare specifier only through the standard
 * node_modules lookup relative to the importing module. Unlike CJS `require()`,
 * it ignores `NODE_PATH` (surfaced as `module.globalPaths`), so a package that
 * is installed but reachable only through a non-standard node_modules layout -
 * pnpm with `enableGlobalVirtualStore`, `nub`, or symlinks pointing outside the
 * project - looks missing to `import()` alone.
 *
 * Resolving through `createRequire` first honors those extra search paths, and
 * importing the resolved absolute path keeps ESM-only packages loadable (a
 * plain `require()` would throw `ERR_REQUIRE_ESM` on those).
 *
 * The require is based on `process.cwd()` rather than this module's own
 * location so we look for the user's installed packages from their project,
 * and so the same code works in both the CJS and ESM bundles drizzle-kit ships.
 *
 * @see https://github.com/drizzle-team/drizzle-orm/issues/6156
 */
const cwdRequire = createRequire(join(process.cwd(), 'index.js'));

/**
 * Imports `pkg`, falling back to `require`-based resolution when the plain
 * dynamic import cannot see it. Rejects with the original `import()` error if
 * neither strategy resolves the package.
 */
export const importPackage = async (pkg: string): Promise<any> => {
	try {
		return await import(pkg);
	} catch (importError) {
		let resolved: string;
		try {
			resolved = cwdRequire.resolve(pkg);
		} catch {
			// the require fallback can't see it either - report the original failure
			throw importError;
		}
		return await import(pathToFileURL(resolved).href);
	}
};

export const assertExists = (it?: any) => {
	if (!it) throw new Error();
};

export const ormVersionGt = async (version: string) => {
	const { npmVersion } = await importPackage('drizzle-orm/version');
	if (!semver.gte(npmVersion, version)) {
		return false;
	}
	return true;
};

export const assertStudioNodeVersion = () => {
	if (semver.gte(process.version, '18.0.0')) return;

	err('Drizzle Studio requires NodeJS v18 or above');
	process.exit(1);
};

export const checkPackage = async (it: string) => {
	try {
		await importPackage(it);
		return true;
	} catch (e) {
		return false;
	}
};

export const assertPackages = async (...pkgs: string[]) => {
	try {
		for (let i = 0; i < pkgs.length; i++) {
			const it = pkgs[i];
			await importPackage(it);
		}
	} catch (e) {
		err(
			`please install required packages: ${
				pkgs
					.map((it) => `'${it}'`)
					.join(' ')
			}`,
		);
		process.exit(1);
	}
};

// ex: either pg or postgres are needed
export const assertEitherPackage = async (
	...pkgs: string[]
): Promise<string[]> => {
	const availables = [] as string[];
	for (let i = 0; i < pkgs.length; i++) {
		try {
			const it = pkgs[i];
			await importPackage(it);
			availables.push(it);
		} catch (e) {}
	}

	if (availables.length > 0) {
		return availables;
	}

	err(
		`Please install one of those packages are needed: ${
			pkgs
				.map((it) => `'${it}'`)
				.join(' or ')
		}`,
	);
	process.exit(1);
};

const requiredApiVersion = 10;
export const assertOrmCoreVersion = async () => {
	try {
		const { compatibilityVersion } = await importPackage('drizzle-orm/version');

		await importPackage('drizzle-orm/relations');

		if (compatibilityVersion && compatibilityVersion === requiredApiVersion) {
			return;
		}

		if (!compatibilityVersion || compatibilityVersion < requiredApiVersion) {
			console.log(
				'This version of drizzle-kit requires newer version of drizzle-orm\nPlease update drizzle-orm package to the latest version 👍',
			);
		} else {
			console.log(
				'This version of drizzle-kit is outdated\nPlease update drizzle-kit package to the latest version 👍',
			);
		}
	} catch (e) {
		console.log('Please install latest version of drizzle-orm');
	}
	process.exit(1);
};

export const ormCoreVersions = async () => {
	try {
		const { compatibilityVersion, npmVersion } = await importPackage(
			'drizzle-orm/version',
		);
		return { compatibilityVersion, npmVersion };
	} catch (e) {
		return {};
	}
};
