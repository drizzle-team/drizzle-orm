import semver from 'semver';
import { err, warning } from './views';

export const assertExists = (it?: any) => {
	if (!it) throw new Error();
};

export const ormVersionGt = async (version: string) => {
	const { npmVersion } = await import('drizzle-orm/version');
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
		await import(it);
		return true;
	} catch (e) {
		return false;
	}
};

export const assertPackages = async (...pkgs: string[]) => {
	try {
		for (let i = 0; i < pkgs.length; i++) {
			const it = pkgs[i];
			await import(it);
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
			await import(it);
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
		const { compatibilityVersion } = await import('drizzle-orm/version');

		await import('drizzle-orm/relations');

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
	} catch (e: any) {
		// The generic message below used to be shown for *any* failure here, including
		// cases where drizzle-orm is actually installed but can't be resolved from
		// drizzle-kit's location (e.g. npm/pnpm workspace hoisting puts drizzle-orm in a
		// different node_modules than drizzle-kit). That left users chasing a fix that
		// didn't apply to them. Surface the real error and give more targeted guidance
		// when it looks like a resolution failure rather than an actual version problem.
		const code = e?.code;
		const isResolutionFailure = code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND';
		const underlying = e?.message ?? String(e);

		if (isResolutionFailure) {
			console.log(
				`Could not resolve 'drizzle-orm' from drizzle-kit.\nIf 'drizzle-orm' is already installed, this is commonly caused by a monorepo/workspace `
					+ `setup (npm/pnpm/yarn workspaces) hoisting it to a location drizzle-kit can't resolve from. Try running `
					+ `drizzle-kit via a package.json script in the same workspace as 'drizzle-orm', or make sure both packages `
					+ `resolve to the same node_modules. Otherwise, please install the latest version of drizzle-orm.\n`
					+ `Underlying error: ${underlying}`,
			);
		} else {
			console.log(`Please install latest version of drizzle-orm\nUnderlying error: ${underlying}`);
		}
	}
	process.exit(1);
};

export const ormCoreVersions = async () => {
	try {
		const { compatibilityVersion, npmVersion } = await import(
			'drizzle-orm/version'
		);
		return { compatibilityVersion, npmVersion };
	} catch (e) {
		return {};
	}
};
