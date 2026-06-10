import semver from 'semver';
import {
	OrmVersionCliError,
	RequiredEitherPackagesCliError,
	RequiredPackagesCliError,
	StudioNodeVersionCliError,
} from './errors';

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
	throw new StudioNodeVersionCliError();
};

export const checkPackage = async (it: string) => {
	try {
		await import(it);
		return true;
	} catch {
		return false;
	}
};

export const assertPackages = async (...pkgs: string[]) => {
	try {
		for (let i = 0; i < pkgs.length; i++) {
			const it = pkgs[i];
			await import(it);
		}
	} catch {
		throw new RequiredPackagesCliError(pkgs);
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
		} catch {}
	}

	if (availables.length > 0) {
		return availables;
	}
	throw new RequiredEitherPackagesCliError(pkgs);
};

const requiredApiVersion = 14;
export const assertOrmCoreVersion = async () => {
	try {
		const { compatibilityVersion } = await import('drizzle-orm/version');

		await import('drizzle-orm/_relations');

		if (Number(compatibilityVersion) === requiredApiVersion) {
			return;
		}

		if (!compatibilityVersion || compatibilityVersion < requiredApiVersion) {
			throw new OrmVersionCliError(
				'This version of drizzle-kit requires newer version of drizzle-orm\nPlease update drizzle-orm package to the latest version 👍',
				'orm_too_old',
			);
		} else {
			throw new OrmVersionCliError(
				'This version of drizzle-kit is outdated\nPlease update drizzle-kit package to the latest version 👍',
				'kit_outdated',
			);
		}
	} catch {
		throw new OrmVersionCliError('Please install latest version of drizzle-orm', 'orm_missing');
	}
};

export const ormCoreVersions = async () => {
	try {
		const { compatibilityVersion, npmVersion } = await import(
			'drizzle-orm/version'
		);
		return { compatibilityVersion, npmVersion };
	} catch {
		return {};
	}
};

export class QueryError extends Error {
	constructor(wrapped: Error, public readonly sql: string, public readonly params: any[]) {
		super(wrapped.message, { cause: wrapped });
	}
}
