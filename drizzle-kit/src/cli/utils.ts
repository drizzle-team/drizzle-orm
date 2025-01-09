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
	} catch (e) {
		console.log('Please install latest version of drizzle-orm');
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
